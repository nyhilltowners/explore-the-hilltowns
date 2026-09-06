/**
 * Hilltowns Bulletin Board — Google Apps Script backend
 * ------------------------------------------------------
 * One Google Sheet holds everything. The Atlas's bulletin.html talks to this
 * script as a web app: GET ?action=list returns the live cards, POST bodies
 * (JSON, sent as text/plain so browsers skip the CORS preflight) submit a card
 * or record a vote.
 *
 * SETUP (once):
 *   1. Make a new Google Sheet (any name). Extensions → Apps Script. Paste this
 *      file over Code.gs and save.
 *   2. Run the function `setup` once from the editor (authorize when asked).
 *      It creates three tabs: Posts, Votes, Config.
 *   3. Deploy → New deployment → type "Web app" → Execute as: Me →
 *      Who has access: Anyone. Copy the URL ending in /exec.
 *   4. Paste that URL into bulletin.html: var BULLETIN_API = "https://script.google.com/macros/s/…/exec";
 *      Rebuild, push. Done.
 *
 * MODERATING (any time, no redeploy):
 *   • Take a card down: on the Posts tab set its Status to "hidden" (or "removed").
 *     It disappears on the next page load. Set it back to "live" to restore.
 *   • Switch the whole board to pre-approval: on the Config tab set
 *     moderation = preapprove. New cards then arrive as Status "pending" and the
 *     submitter sees "waiting for the board keeper"; flip each to "live" to post it.
 *     Set moderation = live to go back to instant posting.
 *   • Cards with a Date auto-hide the day after that date (kept in the sheet).
 *   • Votes: one per device token per card; changing a vote replaces it.
 *
 * Nothing is ever deleted by this script — same house rule as the atlas workbooks.
 */

var SHEET_POSTS = 'Posts', SHEET_VOTES = 'Votes', SHEET_CONFIG = 'Config';
var POST_COLS = ['ID','Posted','Status','Title','When','Date','Where','Details','Link','Name','Contact','Up','Down','Score','Token','Notes'];
var VOTE_COLS = ['Token','PostID','Dir','Updated'];
var LIMITS = { title:90, when:60, where:90, details:600, link:200, name:50, contact:120 };
var RATE_SECONDS = 120;               // one card per device per 2 minutes
var MAX_CARDS_RETURNED = 300;

function setup(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_POSTS, POST_COLS);
  ensureSheet_(ss, SHEET_VOTES, VOTE_COLS);
  var c = ensureSheet_(ss, SHEET_CONFIG, ['Key','Value','What it does']);
  if(c.getLastRow() < 2){
    c.getRange(2,1,3,3).setValues([
      ['moderation','live','"live" = cards post instantly; "preapprove" = new cards wait as pending until you set Status to live'],
      ['closed','no','"yes" closes the board to new cards (existing cards still show)'],
      ['banned_words','','comma-separated; a card containing any of these arrives as pending regardless of moderation']
    ]);
  }
}
function ensureSheet_(ss, name, cols){
  var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); }
  if(sh.getLastRow() === 0){ sh.appendRow(cols); sh.setFrozenRows(1); sh.getRange(1,1,1,cols.length).setFontWeight('bold'); }
  return sh;
}
function config_(){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG); var out = {};
  if(!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach(function(r){ if(r[0]) out[String(r[0]).trim()] = String(r[1] == null ? '' : r[1]).trim(); });
  return out;
}

/* ---------- HTTP ---------- */
function doGet(e){
  var action = (e && e.parameter && e.parameter.action) || 'list';
  if(action === 'list') return json_({ ok:true, posts: listPosts_() });
  return json_({ ok:false, error:'unknown action' });
}
function doPost(e){
  var body = {};
  try{ body = JSON.parse(e.postData.contents || '{}'); }catch(err){ return json_({ ok:false, error:'bad json' }); }
  var lock = LockService.getScriptLock(); lock.tryLock(8000);
  try{
    if(body.action === 'submit') return json_(submit_(body));
    if(body.action === 'vote') return json_(vote_(body));
    return json_({ ok:false, error:'unknown action' });
  }catch(err){
    return json_({ ok:false, error: String(err && err.message || err) });
  }finally{ lock.releaseLock(); }
}
function json_(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- read ---------- */
function listPosts_(){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_POSTS); if(!sh) return [];
  var rows = sh.getDataRange().getValues(); if(rows.length < 2) return [];
  var idx = index_(rows[0]); var today = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  var out = [];
  for(var i = 1; i < rows.length; i++){
    var r = rows[i]; if(!r[idx.ID]) continue;
    var status = String(r[idx.Status] || '').toLowerCase();
    if(status !== 'live') continue;
    var d = dateStr_(r[idx.Date]); if(d && d < today) continue;          // auto-expire the day after
    out.push(publicPost_(r, idx));
  }
  out.sort(function(a,b){ var s = (b.up - b.down) - (a.up - a.down); return s || (a.posted < b.posted ? 1 : -1); });
  return out.slice(0, MAX_CARDS_RETURNED);
}
function publicPost_(r, idx){
  return { id:String(r[idx.ID]), posted:isoStr_(r[idx.Posted]), status:String(r[idx.Status]||'').toLowerCase(),
    title:String(r[idx.Title]||''), when:String(r[idx.When]||''), date:dateStr_(r[idx.Date]), where:String(r[idx.Where]||''),
    details:String(r[idx.Details]||''), link:String(r[idx.Link]||''), name:String(r[idx.Name]||''),
    up:Number(r[idx.Up]||0), down:Number(r[idx.Down]||0) };
}

/* ---------- write ---------- */
function submit_(b){
  var cfg = config_();
  if(cfg.closed === 'yes') return { ok:false, error:'closed' };
  if(String(b.website || '').trim()) return { ok:false, error:'spam' };            // honeypot
  var token = clean_(b.token, 64); if(!token) return { ok:false, error:'no token' };
  var cache = CacheService.getScriptCache();
  if(cache.get('rate:' + token)) return { ok:false, error:'rate' };
  var p = {};
  for(var k in LIMITS){ p[k] = clean_(b[k], LIMITS[k]); }
  p.date = dateStr_(b.date);
  if(!p.title) return { ok:false, error:'title required' };
  if(p.link && !/^https?:\/\/\S+$/i.test(p.link)) p.link = '';
  var status = (cfg.moderation === 'preapprove') ? 'pending' : 'live';
  var banned = (cfg.banned_words || '').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(String);
  var hay = (p.title + ' ' + p.details + ' ' + p.where + ' ' + p.name).toLowerCase();
  if(banned.some(function(w){ return hay.indexOf(w) >= 0; })) status = 'pending';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_POSTS);
  var id = 'b' + Utilities.formatDate(new Date(), 'America/New_York', 'yyMMddHHmmss') + Math.random().toString(36).slice(2,5);
  var now = new Date();
  sh.appendRow([id, now, status, p.title, p.when, p.date, p.where, p.details, p.link, p.name, p.contact, 0, 0, 0, token, '']);
  cache.put('rate:' + token, '1', RATE_SECONDS);
  return { ok:true, post:{ id:id, posted:now.toISOString(), status:status, title:p.title, when:p.when, date:p.date, where:p.where, details:p.details, link:p.link, name:p.name, up:0, down:0 } };
}
function vote_(b){
  var token = clean_(b.token, 64), id = clean_(b.id, 40), dir = Number(b.dir);
  if(!token || !id || [ -1, 0, 1 ].indexOf(dir) < 0) return { ok:false, error:'bad vote' };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), vs = ss.getSheetByName(SHEET_VOTES), ps = ss.getSheetByName(SHEET_POSTS);
  var vrows = vs.getDataRange().getValues(), prev = 0, vrow = -1;
  for(var i = 1; i < vrows.length; i++){ if(vrows[i][0] === token && vrows[i][1] === id){ prev = Number(vrows[i][2]) || 0; vrow = i + 1; break; } }
  if(vrow > 0) vs.getRange(vrow, 3, 1, 2).setValues([[dir, new Date()]]); else vs.appendRow([token, id, dir, new Date()]);
  var prows = ps.getDataRange().getValues(), idx = index_(prows[0]);
  for(var j = 1; j < prows.length; j++){
    if(String(prows[j][idx.ID]) !== id) continue;
    var up = Number(prows[j][idx.Up]||0), down = Number(prows[j][idx.Down]||0);
    if(prev === 1) up--; if(prev === -1) down--;
    if(dir === 1) up++; if(dir === -1) down++;
    up = Math.max(0, up); down = Math.max(0, down);
    ps.getRange(j + 1, idx.Up + 1, 1, 3).setValues([[up, down, up - down]]);
    return { ok:true, post:{ id:id, up:up, down:down } };
  }
  return { ok:false, error:'no such card' };
}

/* ---------- helpers ---------- */
function index_(hdr){ var o = {}; hdr.forEach(function(h, i){ o[String(h).trim()] = i; }); return o; }
function clean_(v, max){ return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max); }
function dateStr_(v){
  if(!v) return '';
  if(v instanceof Date) return Utilities.formatDate(v, 'America/New_York', 'yyyy-MM-dd');
  var s = String(v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function isoStr_(v){ if(v instanceof Date) return v.toISOString(); return String(v || ''); }
