# Fuel & comfort calculator — portable bundle

A self-contained "which heat source is cheapest **here**" widget. It ranks heat pump, gas, propane,
fuel oil and electric resistance by the cost of **one MMBtu of delivered heat**, using the location's
own temperature record for the heat pump's seasonal efficiency. Drop it onto any page — it fetches its
own climatology and needs nothing else on the page.

This is the same module running on the Prophetstown "Ye Olde Navigators Guide" Signs & Signals page,
repackaged so it can be added to the Hilltowns atlas (or anywhere) with a small config block instead of
the atlas's `window.PLACE` object.

---

## Files

| File | What it is |
|---|---|
| `fuel-comfort-calculator.js` | The widget. One IIFE, no dependencies, no build step. |
| `fuel-comfort-calculator.css` | Styles, all scoped under `#fuel-ui`. |
| `fuel-comfort-section.html` | The three elements to paste where the widget should appear. |
| `fuel-config.example.js` | The config object (`window.FUEL_CONFIG`), filled in for the Hilltowns. Edit and include this. |
| `fuel_calc_math_test.js` | Node unit test of the physics/cost math (`node fuel_calc_math_test.js`). |
| `README.md` | This file. |

---

## Install (any page) — 4 steps

1. **Markup.** Paste the contents of `fuel-comfort-section.html` where you want the calculator. It needs
   exactly three elements: `#fuel-ui` (with the `#fuel-loading` placeholder inside), and empty `#fuel-note`.
   Replace `PLACE NAME` in the intro paragraph. The `sg-sec / sg-det / sg-note / sg-h3` classes are the
   host page's own type classes — rename or drop them to match your stylesheet.

2. **Styles.** Add `fuel-comfort-calculator.css` to the page — either `<link rel="stylesheet" ...>` or
   paste it into an existing `<style>` block. If your dark mode isn't `html[data-theme="night"]`, change
   that selector in the three night-mode rules at the bottom.

3. **Config.** Edit `fuel-config.example.js` (coordinates, timezone, EIA state, your price/equipment/
   install defaults) and include it **before** the widget:
   ```html
   <script src="fuel-config.example.js"></script>
   <script src="fuel-comfort-calculator.js"></script>
   ```
   On a page that already exposes `window.PLACE` with a `heating{}` block (the Prophetstown atlas), you
   can skip this file entirely — the widget falls back to `window.PLACE`.

4. **Script.** Add `fuel-comfort-calculator.js` after the config. Done — it loads its own climate data and
   renders.

That's it. No bundler, no framework, no npm. Order only matters in that config must come before the widget.

---

## How the config maps

The widget reads **one object**: `window.FUEL_CONFIG` first, then `window.PLACE`. It only ever touches
these keys (everything else in the object is ignored):

```
center.lat, center.lng   → the point whose 20-year ERA5 temperature record drives the seasonal COP
center.short             → the place name shown in the method note and cooling line
timezone                 → IANA tz for the Open-Meteo archive query
keys.eia                 → EIA API key; blank disables live prices
heating.eia_state        → 2-letter state for the EIA prefill
heating.prices           → elec_kwh, gas_therm, propane_gal, oil_gal, as_of  (fallback/starting prices)
heating.equipment        → gas_afue, propane_afue, oil_afue, hp_type, hp_switchover_f, seer
heating.base_f           → degree-day base (65 = US convention)
heating.install          → per-system installed-cost ballparks + incentive_hp + as_of
```

`fuel-config.example.js` is this exact shape, filled in for Berne / the Helderberg Hilltowns. On the
Prophetstown atlas this same block lives inside `config/place.json` under `heating`, which `build.py`
emits to `window.PLACE`.

---

## What's exact vs. what's a model (read this before trusting a number)

Keeping the honest/estimate line visible is the whole point of the widget, so it says so on screen too.

- **Exact:** the energy conversions (1 kWh = 3,412 BTU, 1 therm = 100,000 BTU, propane 91,452 BTU/gal,
  #2 oil 138,500 BTU/gal) and the **running-cost ranking** for the prices and efficiencies shown. If the
  reader enters their real prices, the "$X/MMBtu delivered" bars and the cheapest-to-run verdict are solid.
- **A stated model:** the heat-pump **COP curve** (COP vs outdoor temperature). Real units vary; the curve
  is a reasonable mid-market cold-climate/standard shape, adjustable by the reader via type + switchover.
- **Estimates, flagged as such:** the **installed costs** (no live source exists — US ballparks, get local
  quotes), the optional **seasonal-dollar** figures (ride on the reader's heating-load guess), and the
  **payback** table (simple payback, no discounting, no fuel-price drift, no maintenance).
- **Expired:** the federal **25C** heat-pump tax credit ended after 2025, so the rebate field defaults to
  **$0**. Set `install.incentive_hp` (or the in-page field) to any current state/utility rebate.

Live prices: with `keys.eia` + `eia_state` set, electricity and natural gas prefill from EIA for that
state on load (best-effort — falls back to your defaults if the call fails or is rate-limited). Propane
and fuel oil have no free state feed, so they always start from your defaults and are edited in the page.

---

## SEER, COP, AFUE, HDD/CDD — the terms on the widget

- **COP (Coefficient of Performance)** — a heat pump's *heating* efficiency: units of heat moved per unit
  of electricity in. COP 3 means 3 kWh of heat delivered per 1 kWh drawn (300%). It **falls as it gets
  colder** — moving heat from 5°F air is harder than from 45°F air — which is exactly why the widget
  computes a *seasonal* COP weighted over the location's real temperature distribution, instead of quoting
  one headline number.
- **SEER (Seasonal Energy Efficiency Ratio)** — the *cooling* counterpart: BTU of heat removed per
  watt-hour of electricity, averaged over a cooling season. Higher is more efficient; modern central units
  run ~14–22. (SEER2, since 2023, is the same idea measured on a slightly tougher test — a SEER2 number is
  a few percent lower than the old SEER for the same unit.) Because a heat pump and an AC cool by the same
  process, **switching to a heat pump changes your heating bill, not your cooling bill** — the widget says
  this explicitly.
- **AFUE (Annual Fuel Utilization Efficiency)** — a combustion furnace's efficiency: fraction of the fuel's
  energy that becomes delivered heat. 95% AFUE gas = 95 of every 100 BTU of gas reach the rooms; the rest
  goes up the flue.
- **HDD / CDD (heating / cooling degree-days)** — how much, and for how long, the outdoor temperature sits
  below (HDD) or above (CDD) a base temperature (65°F here). They're the standard proxy for how much
  heating or cooling a season demands; the widget derives them from the 20-year ERA5 record for your point.
- **MMBtu** — one million BTU, the common unit for comparing heating fuels. The bars are dollars per MMBtu
  of heat *actually delivered to the house*, which is the only apples-to-apples way to line up electricity,
  gas, propane and oil.

---

## Verifying

- `node fuel_calc_math_test.js` checks the conversions, per-fuel cost, COP interpolation/clamping, seasonal
  COP monotonicity (milder climate → higher SCOP), the break-even identity and the cooling cost. All should
  print `ok` and exit 0.
- On the live page, confirm the bars render (needs the Open-Meteo archive fetch to succeed — it's blocked in
  some sandboxes but works in a real browser), and, if you set an EIA key, that the method note reads
  "electricity and natural gas from EIA (…)" rather than "editable defaults".

---

*Packaged 2026-10-06 from the Prophetstown Signs & Signals build (v8). The module body is byte-identical to
the atlas version except for one line — `window.FUEL_CONFIG||window.PLACE` in place of `window.PLACE` — so
fixes port cleanly in either direction.*
