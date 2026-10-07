/* ===== Fuel & comfort calculator — configuration =================================================
   Define window.FUEL_CONFIG BEFORE the calculator script loads. The calculator reads this first and
   falls back to window.PLACE if it's absent — so on the Prophetstown atlas you can skip this file
   entirely (window.PLACE already carries a heating{} block). On the Hilltowns atlas, or any page that
   does NOT expose window.PLACE, include this file (edited) ahead of fuel-comfort-calculator.js.

   The shape below is exactly the slice of place.json the calculator uses — nothing else. Values here
   are filled in for Berne / the Helderberg Hilltowns, NY; change center, timezone, eia_state and the
   price/equipment/install defaults to suit. If you later wire this into a place.json-style system, you
   can delete this file and let it read window.PLACE instead.

   NOTE ON PRICES: with keys.eia set and eia_state a valid 2-letter state, electricity and natural gas
   PREFILL live from EIA for that state on load (best-effort — if the call fails the defaults below are
   used). Propane and fuel oil have no free state feed, so those two always start from the defaults here
   and are edited in the page. Every field is editable live by the reader regardless. =============== */
window.FUEL_CONFIG = {
  center: { lat: 42.619, lng: -74.137, short: "Berne" },   // ~Berne, NY (the widget writes "<short>’s temperatures") — drives the ERA5 climatology + labels
  timezone: "America/New_York",

  keys: { eia: "" },        // your EIA API key (free: https://www.eia.gov/opendata/register.php). Leave "" to skip live prices.

  heating: {
    eia_state: "NY",        // 2-letter state for the EIA prefill; "" disables it

    // Fallback prices (used until/unless EIA prefills elec + gas). Reader can edit all four live.
    prices: {
      elec_kwh:   0.22,     // $/kWh  (NY residential runs high — EIA will overwrite if keyed)
      gas_therm:  1.25,     // $/therm
      propane_gal:3.60,     // $/gal  (no live feed — edit to your local price)
      oil_gal:    4.10,     // $/gal #2 fuel oil (no live feed)
      as_of: "2026 placeholder defaults — set an EIA key or enter your own"
    },

    // Equipment efficiencies (reader-editable).
    equipment: {
      gas_afue:   0.95,     // furnace AFUE as a fraction (0.95 = 95%)
      propane_afue:0.92,
      oil_afue:   0.85,
      hp_type:    "cold",   // "cold" = cold-climate heat pump curve, "standard" = standard ASHP curve
      hp_switchover_f: -5,  // below this outdoor °F the HP is assumed to hand off to resistance backup (COP 1)
      seer:       15.0      // cooling SEER of the central AC / heat pump
    },

    base_f: 65,             // degree-day base temperature (°F). 65 is the US convention; don't change without reason.

    // Rough INSTALLED cost per system ($). Reader-editable. There is no live source — these are US
    // ballparks; real installs vary enormously by home, ducting, region and contractor. Get local quotes.
    install: {
      hp_standard: 12000,   // standard air-source heat pump, installed
      hp_cold:     16000,   // cold-climate heat pump, installed
      gas:         4800,
      propane:     4800,
      oil:         6500,
      resistance:  2500,
      incentive_hp: 0,      // subtracted from the heat-pump install. Federal 25C credit expired after 2025;
                            // set this to any current NY State / NYSERDA / utility rebate you want to assume.
      as_of: "2025 US ballpark — replace with local quotes"
    }
  }
};
