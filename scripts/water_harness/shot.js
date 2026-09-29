const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = require('path').resolve(__dirname, '../../site'); require('fs').mkdirSync(require('path').join(__dirname, 'out'), { recursive: true }); process.chdir(__dirname);
const srv = http.createServer((req, res) => { let p = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'application/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); }).listen(8123);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await pg.goto('http://localhost:8123/waterwip.html', { waitUntil: 'load', timeout: 60000 });
  await pg.waitForTimeout(4000);
  const st = await pg.evaluate(() => ({ status: document.getElementById('wq-status').textContent, cards: document.querySelectorAll('.nc').length, bugs: document.querySelectorAll('.bug').length, lakes: document.querySelectorAll('#lakes .sg-chart').length, of: document.querySelectorAll('.of').length, h: document.body.scrollHeight }));
  console.log(JSON.stringify(st)); console.log(errs.slice(0, 15).join('\n'));
  await pg.screenshot({ path: 'out/full.png', fullPage: true });
  const ids = ['cp', 'bloom', 'tri-trend', 'tri-hg', 'tri-near', 'tx', 'ncards', 'bugs', 'lakes', 'prof', 'tmdl', 'bloom', 'toxin', 'gw1', 'gw2', 'outfalls', 'wq-map'];
  for (const id of ids) { const el = await pg.$('#' + id); if (el) { await el.scrollIntoViewIfNeeded(); await pg.waitForTimeout(300); await el.screenshot({ path: 'out/' + id + '.png' }).catch(e => console.log(id, e.message)); } }
  await b.close(); srv.close();
})();
