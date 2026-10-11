// skyline-index - Intelligence & Methodology views (workstream C2)
// Contract: window.SkylineIntel = { onDataReady, renderIntelView, renderScenarioView, renderMethodView }
// renderScenarioView lives in scenario.js and registers itself onto the same object.
// Everything degrades gracefully when intelligence.json is absent: country aggregates,
// rankings, network statistics and hub-removal reach loss are then estimated client-side.

(function () {
  "use strict";

  const SI = (window.SkylineIntel = window.SkylineIntel || {});
  const S = (SI._state = SI._state || {
    forecasts: null,
    opportunities: null,
    intel: null,
    airports: [],
    lookup: {},
    adj: {}, // iata -> Set(iata) undirected
    derived: null,
    intelSubTab: "leaderboard",
    horizon: "h5", // leaderboard / movers horizon toggle: 'h5' (2030, calibrated) or 'h10' (2035)
    leaderSort: { key: "momentum_rank_h10", dir: 1 },
    pendingScenario: null,
  });

  // ---------------------------------------------------------------------------
  // Utilities (shared with scenario.js through SI._util)
  // ---------------------------------------------------------------------------
  const CLASS_COLOR = { established_hub: "#FFB020", emerging: "#3D9BFF", stable: "#3CCB7F", declining: "#FF4D6D" };
  const CLASS_LABEL = { established_hub: "Hub", emerging: "Emerging", stable: "Stable", declining: "Declining" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmt(v, d = 1) {
    if (v == null || Number.isNaN(Number(v))) return "-";
    return Number(v).toFixed(d);
  }
  function fmtSigned(v, d = 1) {
    if (v == null || Number.isNaN(Number(v))) return "-";
    const n = Number(v);
    return (n > 0 ? "+" : "") + n.toFixed(d);
  }
  function fmtInt(v) {
    if (v == null || Number.isNaN(Number(v))) return "-";
    return Math.round(Number(v)).toLocaleString("en-US");
  }
  function fmtBig(v) {
    if (v == null || Number.isNaN(Number(v))) return "-";
    const n = Number(v);
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + " bn";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + " M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + " k";
    return n.toFixed(0);
  }
  function mean(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  function h(tag, attrs, html) {
    const el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      if (k === "class") el.className = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    if (html != null) el.innerHTML = html;
    return el;
  }
  function classBadge(cls) {
    const c = cls || "stable";
    return `<span class="si-badge si-badge-${c}"><i></i>${esc(CLASS_LABEL[c] || c.replace("_", " "))}</span>`;
  }
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371.0088;
    const toR = (x) => (x * Math.PI) / 180;
    const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  // All +10 reads go through C1's window.getH10 when present (damped / raw mode toggle)
  function h10(ap) {
    if (typeof window.getH10 === "function") { try { const r = window.getH10(ap); if (r && r.level != null) return r; } catch (e) {} }
    const f = ap.forecast_h10;
    if (!f) return { level: ap.importance_present, change: 0, class: "stable", mode: "damped" };
    const level = f.level_damped != null ? f.level_damped : f.level;
    return { level, change: f.change_damped != null ? f.change_damped : f.change, class: f.class || "stable", mode: "damped" };
  }
  function levelH10(ap) { return h10(ap).level; }
  function changeH10(ap) { return h10(ap).change; }
  function h10ModeLabel() {
    const m = typeof window.getH10Mode === "function" ? window.getH10Mode() : "damped";
    const a = S.intel && S.intel.horizon10_shrinkage && S.intel.horizon10_shrinkage.best_alpha;
    return m === "raw" ? "raw ensemble" : `damped${a != null ? " (α=" + a + ")" : ""}`;
  }
  function levelH5(ap) { return ap.forecast_h5 ? ap.forecast_h5.level : ap.importance_present; }
  function changeH5(ap) { return ap.forecast_h5 ? ap.forecast_h5.change : 0; }
  function deg(iata) { const n = S.adj[iata]; return n ? n.size : 0; }
  function presentClass(ap) { return ap.forecast_h5 && ap.forecast_h5.class ? ap.forecast_h5.class : "stable"; }
  function classAt(ap, hz) {
    if (hz === "h10") return h10(ap).class || "stable";
    return presentClass(ap);
  }

  // Sparkline: 3 points (present, h5, h10), 0-100 scale compressed to local range.
  function sparkline(vals, w = 72, hgt = 20, color = "#FFB020") {
    const v = vals.map((x) => (x == null ? 0 : Number(x)));
    const lo = Math.min(...v), hi = Math.max(...v);
    const span = Math.max(hi - lo, 1.0);
    const pts = v.map((x, i) => {
      const px = 3 + (i * (w - 6)) / (v.length - 1);
      const py = hgt - 3 - ((x - lo) / span) * (hgt - 6);
      return [px.toFixed(1), py.toFixed(1)];
    });
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
    const last = pts[pts.length - 1];
    return `<svg class="si-spark" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" role="img" aria-label="${v.map((x) => x.toFixed(1)).join(" → ")}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.2" fill="${color}"/></svg>`;
  }

  // Horizontal bar list (single measure, signed). items: [{label, value, sub, onclick-key}]
  function barList(items, opts = {}) {
    const maxAbs = Math.max(1e-9, ...items.map((it) => Math.abs(it.value || 0)));
    const unit = opts.unit || "";
    const d = opts.decimals == null ? 1 : opts.decimals;
    return `<div class="si-barlist" role="list">${items
      .map((it) => {
        const v = it.value || 0;
        const pct = Math.min(100, (Math.abs(v) / maxAbs) * 100);
        const neg = v < 0;
        const color = it.color || (neg ? CLASS_COLOR.declining : opts.color || CLASS_COLOR.established_hub);
        const dataAttr = it.key ? ` data-key="${esc(it.key)}"` : "";
        const tag = it.key ? "button" : "div";
        return `<${tag} type="button" class="si-bar-row${it.key ? " si-clickable" : ""}" role="listitem"${dataAttr} title="${esc(it.title || it.label)}">
          <span class="si-bar-label">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</span>
          <span class="si-bar-track"><span class="si-bar-fill${neg ? " neg" : ""}" style="width:${pct.toFixed(1)}%;background:${color}"></span></span>
          <span class="si-bar-val">${opts.signed === false ? fmt(v, d) : fmtSigned(v, d)}${unit}</span>
        </${tag}>`;
      })
      .join("")}</div>`;
  }

  function note(text, kind = "info") {
    return `<div class="si-note si-note-${kind}">${text}</div>`;
  }

  function copyText(text, btn) {
    const done = () => {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = old), 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  function goToAirport(iata) {
    const ap = S.lookup[iata];
    if (!ap) return;
    if (typeof window.switchTab === "function") { try { window.switchTab("map"); } catch (e) {} }
    if (typeof window.selectAirport === "function") { try { window.selectAirport(ap); } catch (e) {} }
  }

  // ---------------------------------------------------------------------------
  // Minimal ISO2 -> continent table (fallback when intelligence.json is absent)
  // ---------------------------------------------------------------------------
  const CONTINENT_NAMES = { AS: "Asia", EU: "Europe", NA: "North America", SA: "South America", AF: "Africa", OC: "Oceania", AN: "Antarctica" };
  const CONT_TABLE = {
    AF: "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW",
    AS: "AE AF AM AZ BD BH BN BT CC CN CX CY GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE",
    EU: "AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK",
    NA: "AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI",
    SA: "AR BO BR CL CO EC FK GF GY PE PY SR UY VE",
    OC: "AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS",
    AN: "AQ BV GS HM TF",
  };
  const ISO_TO_CONT = {};
  Object.keys(CONT_TABLE).forEach((c) => CONT_TABLE[c].split(" ").forEach((iso) => (ISO_TO_CONT[iso] = c)));

  let displayNames = null;
  try { displayNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { displayNames = null; }
  function countryName(iso2) {
    if (S.intel && S.intel.country_names && S.intel.country_names[iso2]) return S.intel.country_names[iso2];
    if (displayNames) { try { const n = displayNames.of(iso2); if (n && n !== iso2) return n; } catch (e) {} }
    return iso2;
  }
  function continentOf(iata, iso2) {
    if (S.intel && S.intel.airport_continent && S.intel.airport_continent[iata]) return S.intel.airport_continent[iata];
    const ap = S.lookup[iata];
    if (ap && ap.continent) return ap.continent;
    return ISO_TO_CONT[iso2] || "??";
  }

  // ---------------------------------------------------------------------------
  // Graph helpers (BFS over undirected routes graph)
  // ---------------------------------------------------------------------------
  function buildGraph(airports) {
    const adj = {};
    airports.forEach((a) => { adj[a.iata] = adj[a.iata] || new Set(); });
    airports.forEach((a) => {
      (a.routes || []).forEach((d) => {
        if (!adj[d]) return; // partner not in the active airport set
        if (d === a.iata) return;
        adj[a.iata].add(d);
        adj[d].add(a.iata);
      });
    });
    return adj;
  }

  // Connected components, optionally with a removed node. Returns {comp: Map iata->id, sizes: [], giant: id}
  function components(adj, removed) {
    const comp = new Map();
    const sizes = [];
    let id = 0;
    for (const n of Object.keys(adj)) {
      if (n === removed || comp.has(n)) continue;
      let size = 0;
      const stack = [n];
      comp.set(n, id);
      while (stack.length) {
        const cur = stack.pop();
        size++;
        for (const nb of adj[cur]) {
          if (nb === removed || comp.has(nb)) continue;
          comp.set(nb, id);
          stack.push(nb);
        }
      }
      sizes.push(size);
      id++;
    }
    let giant = 0;
    sizes.forEach((s, i) => { if (s > sizes[giant]) giant = i; });
    return { comp, sizes, giant };
  }
  function connectedPairs(sizes) { return sizes.reduce((acc, s) => acc + (s * (s - 1)) / 2, 0); }

  // BFS distances from a source, skipping a removed node. Returns Map iata->hops.
  function bfs(adj, src, removed) {
    const dist = new Map();
    if (!adj[src] || src === removed) return dist;
    dist.set(src, 0);
    const q = [src];
    let qi = 0;
    while (qi < q.length) {
      const cur = q[qi++];
      const d = dist.get(cur) + 1;
      for (const nb of adj[cur]) {
        if (nb === removed || dist.has(nb)) continue;
        dist.set(nb, d);
        q.push(nb);
      }
    }
    return dist;
  }

  // Full removal analysis for one airport (used by Scenario Lab and the resilience fallback)
  function removalAnalysis(iata) {
    const adj = S.adj;
    if (!adj[iata]) return null;
    const base = S.derived.baseComponents;
    const basePairs = base.pairs;
    const after = components(adj, iata);
    const nRemaining = Object.keys(adj).length - 1;
    // pairs among remaining nodes before removal
    const baseComp = base.comp.get(iata);
    const baseSizesAdj = base.sizes.slice();
    baseSizesAdj[baseComp] -= 1;
    const pairsBefore = connectedPairs(baseSizesAdj);
    const pairsAfter = connectedPairs(after.sizes);
    const reachLossPct = pairsBefore > 0 ? ((pairsBefore - pairsAfter) / pairsBefore) * 100 : 0;
    // airports that were in the giant component and are no longer in the largest one
    const disconnected = [];
    for (const [n, cid] of after.comp) {
      if (base.comp.get(n) === base.giant && cid !== after.giant) disconnected.push(n);
    }
    const isArticulation = after.sizes.length > base.sizes.length; // component count increased
    // shortest-path growth from each neighbour (sample of up to 80 neighbours for speed)
    const neighbours = Array.from(adj[iata]);
    const sample = neighbours.slice().sort((a, b) => (S.lookup[b].importance_present || 0) - (S.lookup[a].importance_present || 0)).slice(0, 80);
    const grew = new Set();
    const affected = [];
    sample.forEach((nb) => {
      const d0 = bfs(adj, nb, null);
      const d1 = bfs(adj, nb, iata);
      let sum0 = 0, sum1 = 0, n0 = 0, lost = 0, grewHere = 0;
      for (const [t, dd] of d0) {
        if (t === iata) continue;
        n0++;
        sum0 += dd;
        if (!d1.has(t)) { lost++; continue; }
        sum1 += d1.get(t);
        if (d1.get(t) > dd) grewHere++;
      }
      const reachable1 = n0 - lost;
      const avg0 = n0 ? sum0 / n0 : 0;
      const avg1 = reachable1 ? sum1 / reachable1 : 0;
      if (grewHere > 0) grew.add(nb);
      affected.push({ iata: nb, avg_before: avg0, avg_after: avg1, delta: avg1 - avg0, lost, grew: grewHere, share_grew: n0 ? grewHere / n0 : 0 });
    });
    affected.sort((a, b) => (b.lost * 1000 + b.share_grew) - (a.lost * 1000 + a.share_grew));
    return {
      iata,
      degree: neighbours.length,
      disconnected,
      reach_loss_pct: reachLossPct,
      pairs_before: pairsBefore,
      pairs_after: pairsAfter,
      is_articulation_point: isArticulation,
      n_components_after: after.sizes.length,
      neighbours_sampled: sample.length,
      neighbours_path_grew: grew.size,
      most_affected: affected.slice(0, 10),
      affected_all: affected,
    };
  }

  // ---------------------------------------------------------------------------
  // Derived data (country aggregates, rankings, network stats, resilience fallback)
  // ---------------------------------------------------------------------------
  function computeDerived() {
    const aps = S.airports;
    const I = S.intel;
    const d = { fallback: !I };

    // --- ranks
    const byPresent = aps.slice().sort((a, b) => b.importance_present - a.importance_present);
    const byH5 = aps.slice().sort((a, b) => levelH5(b) - levelH5(a));
    const byH10 = aps.slice().sort((a, b) => levelH10(b) - levelH10(a));
    d.ranks = {};
    aps.forEach((a) => (d.ranks[a.iata] = { present: a.rank_present, h5: a.rank_h5, h10: a.rank_h10 }));
    byPresent.forEach((a, i) => { if (d.ranks[a.iata].present == null) d.ranks[a.iata].present = i + 1; });
    byH5.forEach((a, i) => { if (d.ranks[a.iata].h5 == null) d.ranks[a.iata].h5 = i + 1; });
    byH10.forEach((a, i) => { if (d.ranks[a.iata].h10 == null) d.ranks[a.iata].h10 = i + 1; });
    if (I && I.ranks) Object.keys(I.ranks).forEach((k) => { if (d.ranks[k]) d.ranks[k] = Object.assign({}, d.ranks[k], I.ranks[k]); });
    d.top50 = new Set(byPresent.slice(0, 50).map((a) => a.iata));

    // --- country aggregates
    const groups = {};
    aps.forEach((a) => { (groups[a.country] = groups[a.country] || []).push(a); });
    const mkAgg = (list) => {
      const w = list.map((a) => Math.max(0.01, a.importance_present || 0));
      const wsum = w.reduce((x, y) => x + y, 0);
      const twc = (fn) => list.reduce((acc, a, i) => acc + fn(a) * w[i], 0) / wsum;
      const sortedP = list.slice().sort((a, b) => b.importance_present - a.importance_present);
      const riser = list.slice().sort((a, b) => changeH10(b) - changeH10(a))[0];
      const faller = list.slice().sort((a, b) => changeH10(a) - changeH10(b))[0];
      return {
        n_airports: list.length,
        mean_importance_present: mean(list.map((a) => a.importance_present)),
        mean_level_h5: mean(list.map(levelH5)),
        mean_level_h10: mean(list.map(levelH10)),
        traffic_weighted_change_h5: twc(changeH5),
        traffic_weighted_change_h10: twc(changeH10),
        n_emerging_h5: list.filter((a) => classAt(a, "h5") === "emerging").length,
        n_declining_h5: list.filter((a) => classAt(a, "h5") === "declining").length,
        n_stable_h5: list.filter((a) => classAt(a, "h5") === "stable").length,
        n_hub: list.filter((a) => presentClass(a) === "established_hub").length,
        n_emerging_h10: list.filter((a) => classAt(a, "h10") === "emerging").length,
        n_declining_h10: list.filter((a) => classAt(a, "h10") === "declining").length,
        top_airports: sortedP.slice(0, 5).map((a) => a.iata),
        top_riser: riser ? { iata: riser.iata, change_h10: changeH10(riser) } : null,
        top_faller: faller ? { iata: faller.iata, change_h10: changeH10(faller) } : null,
        macro: { gdp_growth_pct: null, gdp_per_capita_usd: null, population: null, tourism_arrivals: null, median_age: null },
      };
    };
    let countries = Object.keys(groups).map((iso) => Object.assign({ iso2: iso, name: countryName(iso), continent: continentOf(groups[iso][0].iata, iso) }, mkAgg(groups[iso])));
    // momentum rank among countries with >=3 airports
    const eligible = countries.filter((c) => c.n_airports >= 3).sort((a, b) => b.traffic_weighted_change_h10 - a.traffic_weighted_change_h10);
    eligible.forEach((c, i) => (c.momentum_rank_h10 = i + 1));
    countries.forEach((c) => { if (c.momentum_rank_h10 == null) c.momentum_rank_h10 = null; });
    const eligible5 = countries.filter((c) => c.n_airports >= 3).sort((a, b) => b.traffic_weighted_change_h5 - a.traffic_weighted_change_h5);
    eligible5.forEach((c, i) => (c.momentum_rank_h5 = i + 1));
    if (I && Array.isArray(I.countries)) {
      // Prefer the pre-computed file; keep client fields as fill-ins
      const byIso = {};
      countries.forEach((c) => (byIso[c.iso2] = c));
      countries = I.countries.map((c) => Object.assign({}, byIso[c.iso2] || {}, c, { name: c.name || countryName(c.iso2) }));
    }
    d.countries = countries;
    d.countryByIso = {};
    countries.forEach((c) => (d.countryByIso[c.iso2] = c));
    d.countryAirports = groups;

    // --- regions
    const rgroups = {};
    aps.forEach((a) => { const c = continentOf(a.iata, a.country); (rgroups[c] = rgroups[c] || []).push(a); });
    let regions = Object.keys(rgroups).map((code) => Object.assign({ code, name: (I && I.continent_names && I.continent_names[code]) || CONTINENT_NAMES[code] || code }, mkAgg(rgroups[code])));
    regions.forEach((r) => { r.n_countries = new Set(rgroups[r.code].map((a) => a.country)).size; });
    if (I && Array.isArray(I.regions)) {
      const byCode = {};
      regions.forEach((r) => (byCode[r.code] = r));
      regions = I.regions.map((r) => Object.assign({}, byCode[r.code] || {}, r));
    }
    regions.sort((a, b) => b.traffic_weighted_change_h10 - a.traffic_weighted_change_h10);
    d.regions = regions;

    // --- rankings
    const rowOf = (a, chg, lvl) => ({ iata: a.iata, name: a.name, country: a.country, change: chg, level: lvl, class: null });
    const risers = (chgFn, lvlFn, hz) => aps.slice().sort((a, b) => chgFn(b) - chgFn(a)).slice(0, 50).map((a) => Object.assign(rowOf(a, chgFn(a), lvlFn(a)), { class: classAt(a, hz) }));
    const fallers = (chgFn, lvlFn, hz) => aps.slice().sort((a, b) => chgFn(a) - chgFn(b)).slice(0, 50).map((a) => Object.assign(rowOf(a, chgFn(a), lvlFn(a)), { class: classAt(a, hz) }));
    const rk = {
      top_risers_h5: risers(changeH5, levelH5, "h5"),
      top_risers_h10: risers(changeH10, levelH10, "h10"),
      top_fallers_h5: fallers(changeH5, levelH5, "h5"),
      top_fallers_h10: fallers(changeH10, levelH10, "h10"),
      top_hubs_present: byPresent.slice(0, 50).map((a) => ({ iata: a.iata, name: a.name, country: a.country, score: a.importance_present })),
      top_hubs_h10: byH10.slice(0, 50).map((a) => ({ iata: a.iata, name: a.name, country: a.country, score: levelH10(a) })),
    };
    const climb = aps.map((a) => ({ iata: a.iata, name: a.name, country: a.country, rank_present: d.ranks[a.iata].present, rank_h10: d.ranks[a.iata].h10, rank_delta: d.ranks[a.iata].present - d.ranks[a.iata].h10 }));
    rk.biggest_rank_climbers_h10 = climb.slice().sort((a, b) => b.rank_delta - a.rank_delta).slice(0, 50);
    rk.biggest_rank_drops_h10 = climb.slice().sort((a, b) => a.rank_delta - b.rank_delta).slice(0, 50);
    const climb5 = aps.map((a) => ({ iata: a.iata, name: a.name, country: a.country, rank_present: d.ranks[a.iata].present, rank_h10: d.ranks[a.iata].h5, rank_delta: d.ranks[a.iata].present - d.ranks[a.iata].h5 }));
    rk.biggest_rank_climbers_h5 = climb5.slice().sort((a, b) => b.rank_delta - a.rank_delta).slice(0, 50);
    rk.biggest_rank_drops_h5 = climb5.slice().sort((a, b) => a.rank_delta - b.rank_delta).slice(0, 50);
    if (I && I.rankings) Object.keys(I.rankings).forEach((k) => { if (Array.isArray(I.rankings[k]) && I.rankings[k].length) rk[k] = I.rankings[k]; });
    d.rankings = rk;

    // --- network stats (present) computed client-side; h5/h10 only from the file
    const adj = S.adj;
    const nodes = Object.keys(adj);
    const edges = nodes.reduce((acc, n) => acc + adj[n].size, 0) / 2;
    const base = components(adj, null);
    base.pairs = connectedPairs(base.sizes);
    d.baseComponents = base;
    let clusterSum = 0, clusterN = 0;
    nodes.forEach((n) => {
      const nbs = Array.from(adj[n]);
      if (nbs.length < 2) return;
      let tri = 0;
      for (let i = 0; i < nbs.length; i++) for (let j = i + 1; j < nbs.length; j++) if (adj[nbs[i]].has(nbs[j])) tri++;
      clusterSum += (2 * tri) / (nbs.length * (nbs.length - 1));
      clusterN++;
    });
    const degSorted = nodes.slice().sort((a, b) => adj[b].size - adj[a].size);
    const presentStats = {
      n_nodes: nodes.length,
      n_edges: edges,
      avg_degree: nodes.length ? (2 * edges) / nodes.length : 0,
      density: nodes.length > 1 ? (2 * edges) / (nodes.length * (nodes.length - 1)) : 0,
      n_components: base.sizes.length,
      giant_component_share: nodes.length ? base.sizes[base.giant] / nodes.length : 0,
      avg_clustering: clusterN ? clusterSum / clusterN : 0,
      top_betweenness: null,
      top_degree: degSorted.slice(0, 15).map((n) => ({ iata: n, value: adj[n].size })),
    };
    d.network = { present: presentStats, h5: null, h10: null, fromFile: false };
    if (I && I.network_stats) {
      d.network.fromFile = true;
      ["present", "h5", "h10"].forEach((k) => { if (I.network_stats[k]) d.network[k] = Object.assign({}, d.network[k] || {}, I.network_stats[k]); });
    }

    // --- resilience: file if present; otherwise BFS fallback on top hubs by degree/importance
    if (I && I.resilience && Array.isArray(I.resilience.airports)) {
      const byIata = {};
      I.resilience.airports.forEach((r) => (byIata[r.iata] = r));
      d.resilience = {
        fromFile: true,
        method: I.resilience.method || "",
        byIata,
        critical_hubs: (I.resilience.critical_hubs || []).map((x) => byIata[x]).filter(Boolean),
        fragile_spokes: (I.resilience.fragile_spokes || []).map((x) => byIata[x]).filter(Boolean),
      };
    } else {
      const candidates = nodes.slice().sort((a, b) => (adj[b].size + (S.lookup[b].importance_present || 0) / 10) - (adj[a].size + (S.lookup[a].importance_present || 0) / 10)).slice(0, 40);
      const rows = candidates.map((iata) => {
        const after = components(adj, iata);
        const baseSizesAdj = base.sizes.slice();
        baseSizesAdj[base.comp.get(iata)] -= 1;
        const pb = connectedPairs(baseSizesAdj), pa = connectedPairs(after.sizes);
        let disc = 0;
        for (const [n, cid] of after.comp) if (base.comp.get(n) === base.giant && cid !== after.giant) disc++;
        return { iata, removal_reach_loss_pct: pb ? ((pb - pa) / pb) * 100 : 0, removal_disconnected_airports: disc, is_articulation_point: after.sizes.length > base.sizes.length, redundancy_score: null, dependency_hhi: null, vulnerability_class: null };
      });
      rows.sort((a, b) => b.removal_reach_loss_pct - a.removal_reach_loss_pct || b.removal_disconnected_airports - a.removal_disconnected_airports);
      // fragile spokes fallback: few routes, all partners concentrated. HHI = 1/deg for unweighted edges.
      const spokes = nodes.filter((n) => adj[n].size >= 1 && adj[n].size <= 2).map((n) => {
        const partners = Array.from(adj[n]);
        const top = partners.slice().sort((a, b) => adj[b].size - adj[a].size)[0];
        // redundancy: share of partners' neighbourhoods reachable without the top partner
        const alt = partners.filter((p) => p !== top).length;
        return { iata: n, dependency_hhi: 1 / partners.length, top_dependencies: partners.map((p) => ({ iata: p, share: 1 / partners.length })), redundancy_score: Math.min(100, alt * 50), vulnerability_class: partners.length === 1 ? "fragile" : "watch", removal_reach_loss_pct: null, n_routes: partners.length };
      });
      spokes.sort((a, b) => b.dependency_hhi - a.dependency_hhi || (S.lookup[b.iata].importance_present || 0) - (S.lookup[a.iata].importance_present || 0));
      const byIata = {};
      rows.forEach((r) => (byIata[r.iata] = r));
      d.resilience = {
        fromFile: false,
        method: "Client-side estimate: each of the 40 best-connected airports is removed from the undirected routes graph (the union of all route lists in forecasts.json, which stores at most 15 outbound routes per airport) and connected components are recomputed. Reach loss is the share of previously connected airport pairs that lose any path; disconnected airports are those cut off from the giant component. Articulation point means removal splits a component. Fragile spokes are airports with one or two recorded routes (dependency HHI = 1/degree).",
        byIata,
        critical_hubs: rows.slice(0, 25),
        fragile_spokes: spokes.slice(0, 50),
      };
    }
    return d;
  }

  // ---------------------------------------------------------------------------
  // onDataReady
  // ---------------------------------------------------------------------------
  SI.onDataReady = function (forecasts, opportunities, intelligence) {
    S.forecasts = forecasts || S.forecasts || { airports: [] };
    S.opportunities = opportunities || S.opportunities || null;
    S.intel = intelligence || null;
    S.airports = (S.forecasts.airports || []).filter((a) => a && a.iata);
    S.lookup = {};
    S.airports.forEach((a) => (S.lookup[a.iata] = a));
    S.adj = buildGraph(S.airports);
    S.derived = computeDerived();
    S.ready = true;
    // Re-render any live views
    ["intel", "scenario", "method"].forEach((k) => {
      const el = S["el_" + k];
      if (el && document.body.contains(el)) {
        if (k === "intel") SI.renderIntelView(el);
        else if (k === "method") SI.renderMethodView(el);
        else if (k === "scenario" && SI.renderScenarioView) SI.renderScenarioView(el);
      }
    });
  };

  function rerenderLive() {
    ["intel", "scenario", "method"].forEach((k) => {
      const el = S["el_" + k];
      if (el && document.body.contains(el) && el.style.display !== "none") {
        if (k === "intel") SI.renderIntelView(el);
        else if (k === "method") SI.renderMethodView(el);
        else if (k === "scenario" && SI.renderScenarioView) SI.renderScenarioView(el);
      }
    });
  }
  document.addEventListener("skyline:h10mode", () => {
    if (!S.ready) return;
    S.derived = computeDerived();
    rerenderLive();
  });

  function ensureReady(container) {
    if (S.ready) return true;
    container.innerHTML = `<div class="si-root"><div class="si-empty">Loading forecast data…</div></div>`;
    return false;
  }
  function fallbackNote() {
    if (!S.derived.fallback) return "";
    return note(`<strong>intelligence.json not found</strong> - showing client-side estimates computed in the browser from forecasts.json (country aggregates, rankings and BFS-based hub-removal reach loss). Macro indicators, projected network statistics and scenario sensitivities require the file built by <code>scripts/04_build_intelligence.py</code>.`, "warn");
  }

  // ---------------------------------------------------------------------------
  // INTELLIGENCE VIEW
  // ---------------------------------------------------------------------------
  const INTEL_TABS = [
    { id: "leaderboard", label: "Country & Region Leaderboards" },
    { id: "movers", label: "Movers" },
    { id: "resilience", label: "Hub Resilience" },
    { id: "network", label: "Network Structure" },
    { id: "briefs", label: "Stakeholder briefs" },
  ];

  SI.renderIntelView = function (container) {
    if (!container) return;
    S.el_intel = container;
    if (!ensureReady(container)) return;
    container.innerHTML = "";
    const root = h("div", { class: "si-root" });
    root.innerHTML = `
      <header class="si-header">
        <div>
          <h2>Intelligence</h2>
          <p class="si-sub">Decision dashboard built from the 2025 importance index and the +5 / +10 year forecasts${S.intel && S.intel.generated_at ? ` · intelligence.json generated ${esc(String(S.intel.generated_at).slice(0, 10))}` : ""}. Values are model outputs, not confirmed demand.</p>
        </div>
      </header>
      ${fallbackNote()}
      <div class="si-tabs" role="tablist" aria-label="Intelligence sections">
        ${INTEL_TABS.map((t) => `<button type="button" role="tab" class="si-tab${S.intelSubTab === t.id ? " active" : ""}" data-tab="${t.id}" aria-selected="${S.intelSubTab === t.id}">${t.label}</button>`).join("")}
      </div>
      <div class="si-body" id="si-intel-body" role="tabpanel"></div>`;
    container.appendChild(root);
    root.querySelectorAll(".si-tab").forEach((b) => b.addEventListener("click", () => {
      S.intelSubTab = b.getAttribute("data-tab");
      root.querySelectorAll(".si-tab").forEach((x) => { const on = x === b; x.classList.toggle("active", on); x.setAttribute("aria-selected", on); });
      renderIntelBody(root.querySelector("#si-intel-body"));
    }));
    renderIntelBody(root.querySelector("#si-intel-body"));
  };

  function renderIntelBody(body) {
    body.innerHTML = "";
    const fn = { leaderboard: renderLeaderboard, movers: renderMovers, resilience: renderResilience, network: renderNetwork, briefs: renderBriefs }[S.intelSubTab] || renderLeaderboard;
    fn(body);
  }

  // ---- Leaderboards
  function leaderCols(hz) {
    const yr = hz === "h10" ? "2035" : "2030", hzl = hz === "h10" ? "+10" : "+5";
    return [
      { key: "momentum_rank_" + hz, label: "#", title: `Momentum rank (${hzl}, traffic-weighted change, countries with ≥3 airports)`, num: true, rank: true },
      { key: "name", label: "Country", num: false },
      { key: "n_airports", label: "Airports", num: true },
      { key: "n_hub", label: "Hubs", num: true },
      { key: "n_emerging_" + hz, label: "Emerging", num: true, title: `Emerging class at ${hzl}` },
      { key: "n_declining_" + hz, label: "Declining", num: true, title: `Declining class at ${hzl}` },
      { key: "mean_importance_present", label: "Mean score 2025 → 2030 → 2035", num: true },
      { key: "traffic_weighted_change_" + hz, label: `Δ ${hzl} (wtd)`, num: true, title: `Traffic-weighted change in importance by ${yr}` },
      { key: "gdp_growth_pct", label: "GDP growth", num: true, macro: true },
      { key: "tourism_arrivals", label: "Tourism", num: true, macro: true },
    ];
  }

  function horizonToggle() {
    const hz = S.horizon;
    return `<div class="si-hz" role="group" aria-label="Forecast horizon">
      <button type="button" class="si-hz-btn${hz === "h5" ? " active" : ""}" data-hz="h5" title="Calibrated interval (folds 2-3 coverage 89.5% / 85.3%)">2030 (+5)</button>
      <button type="button" class="si-hz-btn${hz === "h10" ? " active" : ""}" data-hz="h10" title="Indicative only (32.3% coverage) · ${esc(h10ModeLabel())}">2035 (+10)</button>
      <span class="si-hz-note">${hz === "h10" ? `indicative only · ${esc(h10ModeLabel())}` : "calibrated interval"}</span></div>`;
  }
  function wireHorizonToggle(section, rerender) {
    section.querySelectorAll(".si-hz-btn").forEach((b) => b.addEventListener("click", () => {
      const hz = b.getAttribute("data-hz");
      if (hz === S.horizon) return;
      S.horizon = hz;
      if (/_(h5|h10)$/.test(S.leaderSort.key)) S.leaderSort.key = S.leaderSort.key.replace(/_(h5|h10)$/, "_" + hz);
      rerender();
    }));
  }

  function renderLeaderboard(body) {
    const d = S.derived;
    const hz = S.horizon, yr = hz === "h10" ? "2035" : "2030";
    const COLS = leaderCols(hz);
    const twc = "traffic_weighted_change_" + hz, mrank = "momentum_rank_" + hz;
    if (!COLS.find((c) => c.key === S.leaderSort.key)) S.leaderSort = { key: mrank, dir: 1 };
    const sort = S.leaderSort;
    const rows = d.countries.slice().sort((a, b) => {
      const col = COLS.find((c) => c.key === sort.key) || COLS[0];
      let va = col.macro ? (a.macro || {})[col.key] : a[col.key];
      let vb = col.macro ? (b.macro || {})[col.key] : b[col.key];
      if (col.rank) { va = va == null ? 1e9 : va; vb = vb == null ? 1e9 : vb; }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (!col.num) return String(va).localeCompare(String(vb)) * sort.dir;
      return (va - vb) * sort.dir;
    });
    const eligible = d.countries.filter((c) => c.n_airports >= 3);
    const top15 = eligible.slice().sort((a, b) => b[twc] - a[twc]).slice(0, 15);
    const bottom10 = eligible.slice().sort((a, b) => a[twc] - b[twc]).slice(0, 10).reverse();

    const section = h("div", { class: "si-grid-2" });
    section.innerHTML = `
      <div class="si-span-2">${horizonToggle()}</div>
      <div class="si-card si-span-2">
        <div class="si-card-head"><h3>Regions</h3><span>Traffic-weighted change by ${yr}, counts by class</span></div>
        <div class="si-region-cards">${d.regions.filter((r) => r.n_airports > 0).sort((a, b) => b[twc] - a[twc]).map((r) => `
          <button type="button" class="si-region-card si-clickable" data-region="${esc(r.code)}">
            <div class="si-region-name">${esc(r.name)}</div>
            <div class="si-region-delta ${r[twc] >= 0 ? "pos" : "neg"}">${fmtSigned(r[twc], 2)} <small>pts by ${yr}</small></div>
            <div class="si-region-meta">${fmtInt(r.n_airports)} airports${r.n_countries ? ` · ${fmtInt(r.n_countries)} countries` : ""}</div>
            <div class="si-region-classes">
              <span style="color:${CLASS_COLOR.established_hub}">${fmtInt(r.n_hub)} hubs</span>
              <span style="color:${CLASS_COLOR.emerging}">${fmtInt(r["n_emerging_" + hz])} emerging</span>
              <span style="color:${CLASS_COLOR.declining}">${fmtInt(r["n_declining_" + hz])} declining</span>
            </div>
            ${sparkline([r.mean_importance_present, r.mean_level_h5, r.mean_level_h10], 120, 22)}
          </button>`).join("")}</div>
      </div>
      <div class="si-card">
        <div class="si-card-head"><h3>Top 15 countries by momentum</h3><span>Traffic-weighted Δ importance, 2025→${yr}, ≥3 airports</span></div>
        ${barList(top15.map((c) => ({ label: c.name, sub: `${c.n_airports} apts`, value: c[twc], key: c.iso2, color: CLASS_COLOR.emerging })), { decimals: 2 })}
      </div>
      <div class="si-card">
        <div class="si-card-head"><h3>Bottom 10 countries</h3><span>Weakest traffic-weighted Δ, 2025→${yr}</span></div>
        ${barList(bottom10.map((c) => ({ label: c.name, sub: `${c.n_airports} apts`, value: c[twc], key: c.iso2 })), { decimals: 2 })}
      </div>
      <div class="si-card si-span-2">
        <div class="si-card-head"><h3>Country leaderboard</h3><span>${d.countries.length} countries · click a header to sort · click a row for its airports</span></div>
        <div class="si-table-wrap si-scroll">
          <table class="si-table" id="si-leader-table">
            <thead><tr>${COLS.map((c) => `<th scope="col" data-key="${c.key}" class="${c.num ? "num" : ""}${sort.key === c.key ? " sorted" : ""}" title="${esc(c.title || c.label)}" aria-sort="${sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}"><button type="button">${c.label}${sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button></th>`).join("")}</tr></thead>
            <tbody>${rows.map((c) => {
              const m = c.macro || {};
              return `<tr class="si-clickable" data-iso="${esc(c.iso2)}" tabindex="0">
                <td class="num">${c[mrank] == null ? "<span class='si-dim'>-</span>" : c[mrank]}</td>
                <td><strong>${esc(c.name)}</strong> <span class="si-dim">${esc(c.iso2)}</span></td>
                <td class="num">${fmtInt(c.n_airports)}</td>
                <td class="num" style="color:${CLASS_COLOR.established_hub}">${fmtInt(c.n_hub)}</td>
                <td class="num" style="color:${CLASS_COLOR.emerging}">${fmtInt(c["n_emerging_" + hz])}</td>
                <td class="num" style="color:${CLASS_COLOR.declining}">${fmtInt(c["n_declining_" + hz])}</td>
                <td class="num si-nowrap">${fmt(c.mean_importance_present)} → ${fmt(c.mean_level_h5)} → ${fmt(c.mean_level_h10)} ${sparkline([c.mean_importance_present, c.mean_level_h5, c.mean_level_h10])}</td>
                <td class="num ${c[twc] >= 0 ? "si-pos" : "si-neg"}">${fmtSigned(c[twc], 2)}</td>
                <td class="num">${m.gdp_growth_pct == null ? "<span class='si-dim'>n/a</span>" : fmt(m.gdp_growth_pct, 1) + "%"}</td>
                <td class="num">${m.tourism_arrivals == null ? "<span class='si-dim'>n/a</span>" : fmtBig(m.tourism_arrivals)}</td>
              </tr>`;
            }).join("")}</tbody>
          </table>
        </div>
        ${d.fallback ? `<p class="si-foot">GDP growth and tourism arrivals come from intelligence.json (World Bank / IMF macro panel) and are unavailable in client-side mode.</p>` : `<p class="si-foot">Macro columns: latest national GDP growth (%, IMF/World Bank) and international tourism arrivals (World Bank).</p>`}
      </div>
      <div class="si-card si-span-2" id="si-country-detail" style="display:none"></div>`;
    body.appendChild(section);
    const rerender = () => { body.innerHTML = ""; renderLeaderboard(body); };
    wireHorizonToggle(section, rerender);

    section.querySelectorAll("th button").forEach((btn) => btn.addEventListener("click", () => {
      const key = btn.parentElement.getAttribute("data-key");
      if (S.leaderSort.key === key) S.leaderSort.dir *= -1;
      else S.leaderSort = { key, dir: key === "name" || key === mrank ? 1 : -1 };
      rerender();
    }));
    const openCountry = (iso) => {
      if (typeof window.selectCountry === "function") { try { window.selectCountry(iso); return; } catch (e) {} }
      showCountryDetail(section.querySelector("#si-country-detail"), iso);
    };
    section.querySelectorAll("tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => openCountry(tr.getAttribute("data-iso")));
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCountry(tr.getAttribute("data-iso")); } });
    });
    section.querySelectorAll(".si-bar-row[data-key]").forEach((b) => b.addEventListener("click", () => openCountry(b.getAttribute("data-key"))));
    section.querySelectorAll(".si-region-card").forEach((b) => b.addEventListener("click", () => {
      const code = b.getAttribute("data-region");
      const det = section.querySelector("#si-country-detail");
      const list = S.derived.countries.filter((c) => c.continent === code).sort((a, b2) => b2[twc] - a[twc]);
      const r = S.derived.regions.find((x) => x.code === code);
      det.style.display = "";
      det.innerHTML = `<div class="si-card-head"><h3>${esc(r ? r.name : code)} - countries by momentum to ${yr}</h3><button type="button" class="si-btn si-btn-ghost" id="si-close-detail">Close</button></div>
        ${barList(list.slice(0, 25).map((c) => ({ label: c.name, sub: `${c.n_airports} apts`, value: c[twc], key: c.iso2, color: c[twc] >= 0 ? CLASS_COLOR.emerging : CLASS_COLOR.declining })), { decimals: 2 })}`;
      det.querySelector("#si-close-detail").addEventListener("click", () => (det.style.display = "none"));
      det.querySelectorAll(".si-bar-row[data-key]").forEach((x) => x.addEventListener("click", () => openCountry(x.getAttribute("data-key"))));
      det.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
  }

  function showCountryDetail(det, iso) {
    const c = S.derived.countryByIso[iso];
    const list = (S.derived.countryAirports[iso] || []).slice().sort((a, b) => b.importance_present - a.importance_present);
    if (!det || !c) return;
    det.style.display = "";
    const m = c.macro || {};
    det.innerHTML = `
      <div class="si-card-head"><h3>${esc(c.name)} <span class="si-dim">${esc(iso)} · ${esc((S.intel && S.intel.continent_names && S.intel.continent_names[c.continent]) || CONTINENT_NAMES[c.continent] || c.continent)}</span></h3><button type="button" class="si-btn si-btn-ghost" id="si-close-detail">Close</button></div>
      <div class="si-kpis">
        <div class="si-kpi"><strong>${fmtInt(c.n_airports)}</strong><span>airports</span></div>
        <div class="si-kpi"><strong>${c.momentum_rank_h10 == null ? "-" : "#" + c.momentum_rank_h10}</strong><span>momentum rank</span></div>
        <div class="si-kpi"><strong class="${c.traffic_weighted_change_h10 >= 0 ? "si-pos" : "si-neg"}">${fmtSigned(c.traffic_weighted_change_h10, 2)}</strong><span>wtd Δ by 2035</span></div>
        <div class="si-kpi"><strong>${fmt(c.mean_importance_present)} → ${fmt(c.mean_level_h10)}</strong><span>mean score 2025 → 2035</span></div>
        <div class="si-kpi"><strong>${m.gdp_growth_pct == null ? "n/a" : fmt(m.gdp_growth_pct) + "%"}</strong><span>GDP growth</span></div>
        <div class="si-kpi"><strong>${m.population == null ? "n/a" : fmtBig(m.population)}</strong><span>population</span></div>
      </div>
      <div class="si-table-wrap si-scroll"><table class="si-table">
        <thead><tr><th>IATA</th><th>Airport</th><th class="num">2025</th><th class="num">2030</th><th class="num">2035</th><th class="num">Δ +10</th><th>Class +5</th><th class="num">Routes</th></tr></thead>
        <tbody>${list.map((a) => `<tr class="si-clickable" data-iata="${esc(a.iata)}" tabindex="0">
          <td><strong class="si-iata">${esc(a.iata)}</strong></td><td>${esc(a.name)}<small class="si-dim"> ${esc(a.city || "")}</small></td>
          <td class="num">${fmt(a.importance_present)}</td><td class="num">${fmt(levelH5(a))}</td><td class="num">${fmt(levelH10(a))}</td>
          <td class="num ${changeH10(a) >= 0 ? "si-pos" : "si-neg"}">${fmtSigned(changeH10(a), 2)}</td><td>${classBadge(classAt(a, "h5"))}</td><td class="num">${deg(a.iata)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="si-foot">Click an airport to open it on the map.</p>`;
    det.querySelector("#si-close-detail").addEventListener("click", () => (det.style.display = "none"));
    det.querySelectorAll("tr[data-iata]").forEach((tr) => {
      tr.addEventListener("click", () => goToAirport(tr.getAttribute("data-iata")));
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") goToAirport(tr.getAttribute("data-iata")); });
    });
    det.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---- Movers
  function moverTable(rows, kind, hz) {
    hz = hz || "h10";
    const yr = hz === "h10" ? "2035" : "2030";
    // kind: 'change' (change, level) or 'rank' (rank_present, rank_h10, rank_delta)
    const maxAbs = Math.max(1e-9, ...rows.map((r) => Math.abs(kind === "change" ? r.change : r.rank_delta)));
    return `<div class="si-table-wrap si-scroll"><table class="si-table si-table-tight">
      <thead><tr><th>#</th><th>Airport</th>${kind === "change" ? `<th class="num">Δ pts</th><th></th><th class="num">Level</th><th>Class</th>` : `<th class="num">Rank now</th><th class="num">Rank ${yr}</th><th class="num">Δ rank</th><th></th><th>Class</th>`}</tr></thead>
      <tbody>${rows.map((r, i) => {
        const ap = S.lookup[r.iata] || {};
        const v = kind === "change" ? r.change : r.rank_delta;
        const pct = (Math.abs(v) / maxAbs) * 100;
        const cls = r.class || classAt(ap, hz);
        const color = v >= 0 ? CLASS_COLOR.emerging : CLASS_COLOR.declining;
        const bar = `<span class="si-inline-bar"><span style="width:${pct.toFixed(0)}%;background:${color}"></span></span>`;
        return `<tr class="si-clickable" data-iata="${esc(r.iata)}" tabindex="0"><td class="num si-dim">${i + 1}</td>
          <td><strong class="si-iata">${esc(r.iata)}</strong> ${esc(ap.city || r.name || "")} <span class="si-dim">${esc(r.country || ap.country || "")}</span></td>
          ${kind === "change" ? `<td class="num ${v >= 0 ? "si-pos" : "si-neg"}">${fmtSigned(v, 2)}</td><td class="si-barcell">${bar}</td><td class="num">${fmt(r.level)}</td>`
            : `<td class="num">${fmtInt(r.rank_present)}</td><td class="num">${fmtInt(r.rank_h10)}</td><td class="num ${v >= 0 ? "si-pos" : "si-neg"}">${fmtSigned(v, 0)}</td><td class="si-barcell">${bar}</td>`}
          <td>${classBadge(cls)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }

  function renderMovers(body) {
    const rk = S.derived.rankings;
    const hz = S.horizon, yr = hz === "h10" ? "2035" : "2030", hzl = hz === "h10" ? "+10" : "+5";
    const sub = hz === "h10" ? `Indicative only · ${esc(h10ModeLabel())}` : "Calibrated interval";
    const wrap = h("div", { class: "si-grid-2" });
    const card = (title, subtitle, rows, kind) => `<div class="si-card"><div class="si-card-head"><h3>${title}</h3><span>${subtitle}</span></div>${moverTable(rows.slice(0, 25), kind, hz)}</div>`;
    wrap.innerHTML =
      `<div class="si-span-2">${horizonToggle()}</div>` +
      card(`Top 25 risers, ${hzl} (${yr})`, `Largest forecast gain in importance · ${sub}`, rk["top_risers_" + hz], "change") +
      card(`Top 25 fallers, ${hzl} (${yr})`, `Largest forecast loss · ${sub}`, rk["top_fallers_" + hz], "change") +
      card(`Biggest rank climbers by ${yr}`, "Global rank by importance level, 1 = best", rk["biggest_rank_climbers_" + hz], "rank") +
      card(`Biggest rank drops by ${yr}`, "Global rank by importance level, 1 = best", rk["biggest_rank_drops_" + hz], "rank") +
      `<p class="si-foot si-span-2">Click any row to open the airport on the map. ${hz === "h10" ? "+10 forecasts lose to persistence on test MAE (5.282 vs 10.768) and their bands are labelled indicative only; values shown are " + esc(h10ModeLabel()) + "." : "+5 forecasts: LightGBM beats persistence on change MAE (2.824 vs 3.481 on fold 2)."}</p>`;
    body.appendChild(wrap);
    wireHorizonToggle(wrap, () => { body.innerHTML = ""; renderMovers(body); });
    wrap.querySelectorAll("tr[data-iata]").forEach((tr) => {
      tr.addEventListener("click", () => goToAirport(tr.getAttribute("data-iata")));
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") goToAirport(tr.getAttribute("data-iata")); });
    });
  }

  // ---- Resilience
  function renderResilience(body) {
    const R = S.derived.resilience;
    const wrap = h("div", { class: "si-grid-2" });
    const hubRows = R.critical_hubs.map((r, i) => {
      const ap = S.lookup[r.iata] || {};
      return `<tr class="si-clickable" data-iata="${esc(r.iata)}" tabindex="0"><td class="num si-dim">${i + 1}</td>
        <td><strong class="si-iata">${esc(r.iata)}</strong> ${esc(ap.city || ap.name || "")} <span class="si-dim">${esc(ap.country || "")}</span></td>
        <td class="num">${r.removal_reach_loss_pct == null ? "-" : fmt(r.removal_reach_loss_pct, 3) + "%"}</td>
        <td class="num">${fmtInt(r.removal_disconnected_airports)}</td>
        <td>${r.is_articulation_point ? '<span class="si-flag">articulation</span>' : '<span class="si-dim">-</span>'}</td>
        <td class="num">${deg(ap.iata)}</td>
        <td><button type="button" class="si-btn si-btn-mini si-simulate" data-iata="${esc(r.iata)}">Simulate closure</button></td></tr>`;
    }).join("");
    const spokeRows = R.fragile_spokes.slice(0, 50).map((r, i) => {
      const ap = S.lookup[r.iata] || {};
      const dep = (r.top_dependencies || [])[0];
      return `<tr class="si-clickable" data-iata="${esc(r.iata)}" tabindex="0"><td class="num si-dim">${i + 1}</td>
        <td><strong class="si-iata">${esc(r.iata)}</strong> ${esc(ap.city || ap.name || "")} <span class="si-dim">${esc(ap.country || "")}</span></td>
        <td>${dep ? `<strong>${esc(dep.iata)}</strong> <span class="si-dim">${fmt(dep.share * 100, 0)}%</span>` : "-"}</td>
        <td class="num">${r.dependency_hhi == null ? "-" : fmt(r.dependency_hhi, 2)}</td>
        <td class="num">${r.redundancy_score == null ? "-" : fmt(r.redundancy_score, 0)}</td>
        <td>${r.vulnerability_class ? `<span class="si-vuln si-vuln-${esc(r.vulnerability_class)}">${esc(r.vulnerability_class)}</span>` : "-"}</td>
        <td class="num">${deg(ap.iata)}</td></tr>`;
    }).join("");
    wrap.innerHTML = `
      <div class="si-card si-span-2">
        <div class="si-card-head"><h3>Method</h3><span>${R.fromFile ? "from intelligence.json" : "client-side estimate"}</span></div>
        <p class="si-prose">${esc(R.method)}</p>
      </div>
      <div class="si-card si-span-2">
        <div class="si-card-head"><h3>Critical hubs</h3><span>Ranked by reach loss when removed</span></div>
        <div class="si-table-wrap si-scroll"><table class="si-table si-table-tight">
          <thead><tr><th>#</th><th>Airport</th><th class="num" title="Share of airport pairs losing connectivity when this airport is removed">Reach loss</th><th class="num">Disconnected</th><th>Cut vertex</th><th class="num">Routes</th><th></th></tr></thead>
          <tbody>${hubRows}</tbody></table></div>
      </div>
      <div class="si-card si-span-2">
        <div class="si-card-head"><h3>Fragile spokes</h3><span>High dependency on a single partner, little redundancy</span></div>
        <div class="si-table-wrap si-scroll"><table class="si-table si-table-tight">
          <thead><tr><th>#</th><th>Airport</th><th>Top partner</th><th class="num" title="Herfindahl concentration of connectivity on partners">HHI</th><th class="num" title="0-100, higher = more alternative paths">Redundancy</th><th>Class</th><th class="num">Routes</th></tr></thead>
          <tbody>${spokeRows}</tbody></table></div>
      </div>`;
    body.appendChild(wrap);
    wrap.querySelectorAll("tr[data-iata]").forEach((tr) => {
      tr.addEventListener("click", (e) => { if (e.target.closest("button")) return; goToAirport(tr.getAttribute("data-iata")); });
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") goToAirport(tr.getAttribute("data-iata")); });
    });
    wrap.querySelectorAll(".si-simulate").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      SI.openScenario("closure", { iata: b.getAttribute("data-iata") });
    }));
  }

  // Jump to the Scenario Lab with a preselection. C1 may expose switchTab('scenario').
  SI.openScenario = function (kind, params) {
    S.pendingScenario = { kind, params: params || {} };
    let switched = false;
    if (typeof window.switchTab === "function") {
      try { window.switchTab("scenario"); switched = true; } catch (e) { switched = false; }
    }
    const panel = document.getElementById("scenario-panel");
    if (panel && SI.renderScenarioView) {
      if (!switched) {
        // C1 has not wired the tab: show the panel ourselves
        panel.style.display = "";
        const intel = document.getElementById("intel-panel");
        if (intel) intel.style.display = "none";
      }
      SI.renderScenarioView(panel);
    } else if (S.el_scenario && SI.renderScenarioView) {
      SI.renderScenarioView(S.el_scenario);
    }
  };

  // ---- Network structure
  function renderNetwork(body) {
    const N = S.derived.network;
    const wrap = h("div", { class: "si-stack" });
    const statTiles = (st, label) => {
      if (!st) return `<div class="si-card si-card-muted"><div class="si-card-head"><h3>${label}</h3></div><p class="si-prose si-dim">Projected network statistics for this horizon require intelligence.json.</p></div>`;
      const t = (v, l, d = 0) => `<div class="si-kpi"><strong>${typeof v === "number" ? (d ? fmt(v, d) : fmtInt(v)) : esc(v)}</strong><span>${l}</span></div>`;
      return `<div class="si-card"><div class="si-card-head"><h3>${label}</h3><span>${st.n_nodes ? "" : ""}</span></div><div class="si-kpis si-kpis-6">
        ${t(st.n_nodes, "nodes")}${t(st.n_edges, "edges")}${t(st.avg_degree, "avg degree", 2)}${t(st.density == null ? "-" : (st.density * 1000).toFixed(2) + "‰", "density")}${t(st.giant_component_share == null ? "-" : (st.giant_component_share * 100).toFixed(1) + "%", "giant component")}${t(st.avg_clustering, "avg clustering", 3)}
      </div></div>`;
    };
    const brokers = (st, label) => {
      if (!st) return `<div class="si-card si-card-muted"><div class="si-card-head"><h3>${label}</h3></div><p class="si-dim si-prose">n/a without intelligence.json</p></div>`;
      let items, sub;
      if (st.top_betweenness && st.top_betweenness.length) {
        items = st.top_betweenness.slice(0, 15).map((b) => ({ label: b.iata, sub: (S.lookup[b.iata] || {}).city || "", value: b.value, key: b.iata }));
        sub = "betweenness centrality";
      } else {
        items = (st.top_degree || []).map((b) => ({ label: b.iata, sub: (S.lookup[b.iata] || {}).city || "", value: b.value, key: b.iata }));
        sub = "degree (betweenness needs intelligence.json)";
      }
      const dec = items.length && Math.max(...items.map((i) => i.value)) < 1 ? 4 : 0;
      return `<div class="si-card"><div class="si-card-head"><h3>${label}</h3><span>${sub}</span></div>${barList(items, { signed: false, decimals: dec, color: CLASS_COLOR.established_hub })}</div>`;
    };
    wrap.innerHTML = `
      ${N.fromFile ? "" : note("Present-day statistics are computed in the browser from the routes graph. Projected +5/+10 network statistics and betweenness brokers need intelligence.json.", "warn")}
      <div class="si-grid-3">${statTiles(N.present, "Network today (2025)")}${statTiles(N.h5, "Projected +5 (2030)")}${statTiles(N.h10, "Projected +10 (2035)")}</div>
      <div class="si-card-head si-mt"><h3>Brokers - who sits between the rest of the network</h3><span>Top 15 at each horizon; shifts show where brokerage migrates</span></div>
      <div class="si-grid-3">${brokers(N.present, "2025")}${brokers(N.h5, "2030")}${brokers(N.h10, "2035")}</div>`;
    body.appendChild(wrap);
    wrap.querySelectorAll(".si-bar-row[data-key]").forEach((b) => b.addEventListener("click", () => goToAirport(b.getAttribute("data-key"))));
  }

  // ---- Stakeholder briefs
  function computeBriefInsights() {
    const d = S.derived, rk = d.rankings, O = S.opportunities || {};
    const aps = S.airports;
    const contName = (c) => (S.intel && S.intel.continent_names && S.intel.continent_names[c]) || CONTINENT_NAMES[c] || c;
    const risers25 = rk.top_risers_h10.slice(0, 25);
    const contCount = {};
    risers25.forEach((r) => { const c = continentOf(r.iata, r.country); contCount[c] = (contCount[c] || 0) + 1; });
    const topCont = Object.entries(contCount).sort((a, b) => b[1] - a[1])[0];
    const airline = O.airline_opportunities || [];
    const emergingSet = new Set(aps.filter((a) => classAt(a, "h5") === "emerging").map((a) => a.iata));
    const bothEmerging = airline.filter((o) => emergingSet.has(o.origin_iata) && emergingSet.has(o.dest_iata));
    const anyEmerging = airline.filter((o) => emergingSet.has(o.origin_iata) || emergingSet.has(o.dest_iata));
    const highScore = airline.filter((o) => o.score >= 10);
    const intl = airline.filter((o) => o.origin_country !== o.dest_country);
    const medDist = airline.length ? airline.map((o) => o.distance_km).sort((a, b) => a - b)[Math.floor(airline.length / 2)] : null;
    const hubsNow = aps.filter((a) => presentClass(a) === "established_hub").length;
    const hubs10 = aps.filter((a) => classAt(a, "h10") === "established_hub").length;
    const newHubs = aps.filter((a) => presentClass(a) !== "established_hub" && classAt(a, "h10") === "established_hub");
    const declining10 = aps.filter((a) => classAt(a, "h10") === "declining");
    const decByCountry = {};
    declining10.forEach((a) => (decByCountry[a.country] = (decByCountry[a.country] || 0) + 1));
    const topDec = Object.entries(decByCountry).sort((a, b) => b[1] - a[1])[0];
    const investor = O.investor_opportunities || [];
    const invRecon = investor.filter((i) => (S.lookup[i.iata] || {}).data_quality === "reconstructed").length;
    const tourism = O.tourism_opportunities || [];
    const tourHighIntl = tourism.filter((t) => t.international_share >= 0.5).length;
    const tourCont = {};
    tourism.forEach((t) => { const c = continentOf(t.iata, t.country); tourCont[c] = (tourCont[c] || 0) + 1; });
    const topTourCont = Object.entries(tourCont).sort((a, b) => b[1] - a[1])[0];
    const topCountries = d.countries.filter((c) => c.momentum_rank_h10 != null).sort((a, b) => a.momentum_rank_h10 - b.momentum_rank_h10).slice(0, 3);
    const crit = d.resilience.critical_hubs.slice(0, 3);
    return {
      airlines: [
        topCont ? `${topCont[1]} of the top-25 risers by 2035 are in ${contName(topCont[0])}; the strongest-momentum countries are ${topCountries.map((c) => c.name).join(", ")}.` : "Riser list unavailable.",
        airline.length ? `${anyEmerging.length} of the ${airline.length} Opportunity Radar candidate routes touch an emerging airport (${bothEmerging.length} connect two); ${highScore.length} score ≥ 10 and ${intl.length} are international (median stage length ${fmtInt(medDist)} km).` : "Opportunity Radar unavailable.",
        crit.length ? `Closure of ${crit[0].iata} alone would cut ${fmt(crit[0].removal_reach_loss_pct, 3)}% of connected airport pairs (${fmtInt(crit[0].removal_disconnected_airports)} airports isolated); ${crit.map((c) => c.iata).join(", ")} are the most critical hubs for schedule resilience.` : "Resilience metrics unavailable.",
      ],
      airports: [
        `${hubsNow} airports are established hubs today (score ≥ 90); the forecast has ${hubs10} by 2035, with ${newHubs.length} newcomer${newHubs.length === 1 ? "" : "s"}${newHubs.length ? ` (${newHubs.slice(0, 6).map((a) => a.iata).join(", ")}${newHubs.length > 6 ? "…" : ""})` : ""}.`,
        investor.length ? `${investor.length} investor risers are listed; ${invRecon} rely on probabilistically reconstructed traffic, so their intervals are wider - check data quality before acting. Top three: ${investor.slice(0, 3).map((i) => `${i.iata} (${fmtSigned(i.forecast_change_h5, 1)})`).join(", ")}.` : "Investor list unavailable.",
        topDec ? `${declining10.length} airports are classed declining by 2035; ${countryName(topDec[0])} has the most (${topDec[1]}). Declining calls are rare (+5 share 1.3%) and thresholded on both change ≥ 2 pts and band half-width.` : "No declining airports in the forecast.",
      ],
      tourism: [
        tourism.length ? `${tourism.length} expanding destinations flagged; ${tourHighIntl} have an international share ≥ 50%${topTourCont ? `, and ${topTourCont[1]} are in ${contName(topTourCont[0])}` : ""}.` : "Tourism list unavailable.",
        topCountries.length ? `Countries with the strongest traffic-weighted momentum to 2035: ${topCountries.map((c) => `${c.name} (${fmtSigned(c.traffic_weighted_change_h10, 2)} pts, ${c.n_emerging_h5} emerging)`).join("; ")}.` : "",
        airline.length ? `${intl.length} candidate international city pairs are unserved today; the top-scoring is ${airline[0].origin_city} ↔ ${airline[0].dest_city} (score ${airline[0].score}) - ${esc(airline[0].candidate_label)}.` : "",
      ].filter(Boolean),
      meta: { risers25, bothEmerging, newHubs, declining10, topCountries, crit, investor, tourism, airline },
    };
  }

  function renderBriefs(body) {
    const ins = computeBriefInsights();
    const wrap = h("div", { class: "si-grid-3" });
    const card = (id, title, who, items) => `<div class="si-card si-brief">
      <div class="si-card-head"><h3>${title}</h3><span>${who}</span></div>
      <ul class="si-insights">${items.map((t) => `<li>${t}</li>`).join("")}</ul>
      <button type="button" class="si-btn si-gen-brief" data-brief="${id}">Generate brief</button></div>`;
    wrap.innerHTML =
      card("airlines", "Airlines", "Network planning · so-what", ins.airlines) +
      card("airports", "Airports & Investors", "Capacity & capital allocation", ins.airports) +
      card("tourism", "Tourism boards & travel companies", "Destination development", ins.tourism) +
      `<p class="si-foot si-span-3">Briefs open as a printable page (new tab). Every list item carries the Opportunity Radar wording: <em>model candidate, not confirmed demand</em>.</p>`;
    body.appendChild(wrap);
    wrap.querySelectorAll(".si-gen-brief").forEach((b) => b.addEventListener("click", () => openBrief(b.getAttribute("data-brief"), ins)));
  }

  function briefTable(headers, rows) {
    return `<table><thead><tr>${headers.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  SI.buildBriefHtml = function (kind, ins) {
    ins = ins || computeBriefInsights();
    const m = ins.meta;
    const label = (S.opportunities && S.opportunities.airline_opportunities && S.opportunities.airline_opportunities[0] && S.opportunities.airline_opportunities[0].candidate_label) || "model candidate, not confirmed demand";
    const today = new Date().toISOString().slice(0, 10);
    const titles = { airlines: "Airline network brief", airports: "Airports & investors brief", tourism: "Tourism & travel brief" };
    const insights = ins[kind] || [];
    let sections = "";
    if (kind === "airlines") {
      sections += `<h2>Top 25 risers by 2035</h2>` + briefTable(["IATA", "Airport", "Country", "Δ pts", "Level 2035", "Class"], m.risers25.map((r) => [esc(r.iata), esc(r.name), esc(countryName(r.country)), fmtSigned(r.change, 2), fmt(r.level), esc(CLASS_LABEL[r.class] || r.class || "")]));
      sections += `<h2>Top 25 unserved candidate routes</h2>` + briefTable(["#", "Pair", "Cities", "km", "Score", "Common connections", "Label"], m.airline.slice(0, 25).map((o) => [o.rank, `${esc(o.origin_iata)} ↔ ${esc(o.dest_iata)}`, `${esc(o.origin_city)} - ${esc(o.dest_city)}`, fmtInt(o.distance_km), o.score, o.common_connections, esc(o.candidate_label)]));
      sections += `<h2>Critical hubs (resilience)</h2>` + briefTable(["IATA", "City", "Reach loss %", "Disconnected", "Articulation"], S.derived.resilience.critical_hubs.slice(0, 10).map((r) => [esc(r.iata), esc((S.lookup[r.iata] || {}).city || ""), fmt(r.removal_reach_loss_pct, 3), fmtInt(r.removal_disconnected_airports), r.is_articulation_point ? "yes" : "no"]));
    } else if (kind === "airports") {
      sections += `<h2>Investor risers (top 30)</h2>` + briefTable(["#", "IATA", "Airport", "Country", "2025", "Δ +5", "2030", "2035", "Class", "Data quality", "Label"], m.investor.slice(0, 30).map((i) => [i.rank, esc(i.iata), esc(i.name), esc(countryName(i.country)), fmt(i.importance_present), fmtSigned(i.forecast_change_h5, 2), fmt(i.forecast_level_h5), fmt(i.forecast_level_h10), esc(i.class), esc((S.lookup[i.iata] || {}).data_quality || ""), esc(i.candidate_label)]));
      sections += `<h2>Hub newcomers by 2035</h2>` + briefTable(["IATA", "Airport", "Country", "2025", "2035"], m.newHubs.slice(0, 30).map((a) => [esc(a.iata), esc(a.name), esc(countryName(a.country)), fmt(a.importance_present), fmt(levelH10(a))]));
      sections += `<h2>Declining by 2035</h2>` + briefTable(["IATA", "Airport", "Country", "2025", "2035", "Δ"], m.declining10.slice().sort((a, b) => changeH10(a) - changeH10(b)).slice(0, 30).map((a) => [esc(a.iata), esc(a.name), esc(countryName(a.country)), fmt(a.importance_present), fmt(levelH10(a)), fmtSigned(changeH10(a), 2)]));
    } else {
      sections += `<h2>Expanding destinations (top 30)</h2>` + briefTable(["#", "IATA", "Airport", "Country", "2025", "Δ +5", "Intl share", "Top driver", "Label"], m.tourism.slice(0, 30).map((t) => [t.rank, esc(t.iata), esc(t.name), esc(countryName(t.country)), fmt(t.importance_present), fmtSigned(t.forecast_change_h5, 2), fmt(t.international_share * 100, 0) + "%", esc(t.top_driver), esc(t.candidate_label)]));
      sections += `<h2>Countries by momentum (top 15)</h2>` + briefTable(["Rank", "Country", "Airports", "Emerging", "Mean 2025", "Mean 2035", "Wtd Δ"], S.derived.countries.filter((c) => c.momentum_rank_h10 != null).sort((a, b) => a.momentum_rank_h10 - b.momentum_rank_h10).slice(0, 15).map((c) => [c.momentum_rank_h10, esc(c.name), c.n_airports, c.n_emerging_h5, fmt(c.mean_importance_present), fmt(c.mean_level_h10), fmtSigned(c.traffic_weighted_change_h10, 2)]));
      sections += `<h2>Unserved international city pairs (top 20)</h2>` + briefTable(["#", "Pair", "Cities", "km", "Score", "Label"], m.airline.filter((o) => o.origin_country !== o.dest_country).slice(0, 20).map((o) => [o.rank, `${esc(o.origin_iata)} ↔ ${esc(o.dest_iata)}`, `${esc(o.origin_city)} - ${esc(o.dest_city)}`, fmtInt(o.distance_km), o.score, esc(o.candidate_label)]));
    }
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Skyline Index - ${esc(titles[kind] || "Brief")}</title>
<style>body{font-family:'Instrument Sans',-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1f28;margin:40px auto;max-width:980px;padding:0 24px;line-height:1.45}h1{font-size:26px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}.meta{color:#667;font-size:12px}table{border-collapse:collapse;width:100%;font-size:12px;margin:8px 0}th,td{border-bottom:1px solid #e4e6ea;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f4f5f7;font-weight:600}.disc{background:#fff6e0;border:1px solid #f2c266;padding:10px 14px;border-radius:6px;font-size:12px;margin:16px 0}ul.ins li{margin:6px 0}@media print{body{margin:0}.noprint{display:none}}</style></head><body>
<p class="meta">Skyline Index · Global Aviation Intelligence Map · generated ${today} · as of ${esc(S.forecasts.generated_as_of_year || 2025)}</p>
<h1>${esc(titles[kind] || "Brief")}</h1>
<div class="disc"><strong>Disclaimer.</strong> All entries are <strong>${esc(label)}</strong>. Forecasts are model outputs (ensemble of LightGBM and Ridge with IMF and UN projections). +10 year values are indicative only (32.3% interval coverage; persistence beats the model on test MAE). ${esc((S.opportunities || {}).disclaimer || "")}</div>
<h2>Key insights</h2><ul class="ins">${insights.map((t) => `<li>${t}</li>`).join("")}</ul>
${sections}
<p class="meta noprint"><button onclick="window.print()">Print / save as PDF</button></p>
</body></html>`;
  };

  function openBrief(kind, ins) {
    const html = SI.buildBriefHtml(kind, ins);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener");
    if (!w) {
      // popup blocked: offer a download link
      const a = document.createElement("a");
      a.href = url;
      a.download = `skyline-brief-${kind}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    S.lastBriefHtml = html;
  }

  // ---------------------------------------------------------------------------
  // METHODOLOGY VIEW (model card)
  // ---------------------------------------------------------------------------
  const HEADLINE_ROWS = [
    // Horizon, Fold, Test Year, Model, Test N, Risers P, Risers R, Fallers P, Fallers R, MAE Change, Spearman Level, Calibrated Coverage  (README.md)
    [5, "1", "2018", "persistence", "1,479", "0.088", "0.088", "0.054", "0.054", "4.538", "0.9721", "-"],
    [5, "1", "2018", "linear_trend", "1,479", "0.155", "0.155", "0.088", "0.088", "4.948", "0.9643", "-"],
    [5, "1", "2018", "ridge", "1,479", "0.061", "0.061", "0.169", "0.169", "4.940", "0.9699", "-"],
    [5, "1", "2018", "lightgbm", "1,479", "0.108", "0.108", "0.155", "0.155", "4.319", "0.9727", "-"],
    [5, "1", "2018", "ensemble", "1,479", "0.074", "0.074", "0.176", "0.176", "4.542", "0.9719", "0.622"],
    [5, "2", "2019", "persistence", "1,416", "0.106", "0.106", "0.077", "0.077", "3.481", "0.9851", "-"],
    [5, "2", "2019", "linear_trend", "1,416", "0.155", "0.155", "0.077", "0.077", "7.033", "0.9732", "-"],
    [5, "2", "2019", "ridge", "1,416", "0.261", "0.261", "0.218", "0.218", "3.326", "0.9848", "-"],
    [5, "2", "2019", "lightgbm", "1,416", "0.394", "0.394", "0.261", "0.261", "2.824", "0.9839", "-"],
    [5, "2", "2019", "ensemble", "1,416", "0.401", "0.401", "0.239", "0.239", "2.952", "0.9850", "0.895"],
    [5, "3 (COVID)", "2020", "persistence", "1,322", "0.098", "0.098", "0.060", "0.060", "3.871", "0.9810", "-"],
    [5, "3 (COVID)", "2020", "lightgbm", "1,322", "0.195", "0.195", "0.406", "0.406", "3.899", "0.9809", "-"],
    [5, "3 (COVID)", "2020", "ensemble", "1,322", "0.218", "0.218", "0.391", "0.391", "3.867", "0.9829", "0.853"],
    [10, "1", "2013-2015", "persistence", "4,123", "0.097", "0.097", "0.075", "0.075", "5.282", "0.9576", "-"],
    [10, "1", "2013-2015", "lightgbm", "4,123", "0.063", "0.063", "0.090", "0.090", "11.044", "0.9357", "-"],
    [10, "1", "2013-2015", "ensemble", "4,123", "0.065", "0.065", "0.099", "0.099", "13.904", "0.8858", "0.323"],
    [10, "1", "2013-2015", "damped (gamma 0.7)", "4,123", "0.065", "0.065", "0.099", "0.099", "10.768", "0.9202", "-"],
  ];
  const DATA_SOURCES = [
    ["OpenFlights", "2014 snapshot", "Route and airport", "ODbL / DbCL"],
    ["OurAirports", "Continuous (2026)", "Airport and runway", "CC0 (Public domain)"],
    ["OpenSky Network", "2019 to 2022", "Flight and airport pair", "CC BY-NC 4.0"],
    ["Eurostat (avia_paoa)", "1993 to 2025", "Airport year and route", "Eurostat open reuse"],
    ["FAA Enplanements", "2004 to 2025", "Airport year", "US Public domain"],
    ["World Bank WDI", "1990 to 2024", "Country year", "CC BY 4.0"],
    ["UN WPP", "1950 to 2100", "Country year", "UN Open access"],
    ["IMF WEO", "1980 to 2031", "Country year", "IMF Open access"],
    ["GeoNames", "Continuous (2026)", "City", "CC BY 4.0"],
  ];

  function pipelineSvg() {
    const steps = ["Sources", "Panel 2000-2025", "Reconstruction", "Importance index", "Features & targets", "Temporal folds", "LightGBM + Ridge", "Conformal bands", "Forecasts", "Map & Radar"];
    const subs = ["FAA · Eurostat · OpenFlights · OpenSky · macro", "9,051 airports × 26 years", "traffic share + gravity links", "0.47 network · 0.48 traffic · 0.05 market", "46 features · Δ +5 / +10", "rolling h5 · blocked h10", "ensemble (equal weight)", "split conformal", "4,079 active airports", "forecasts.json · opportunities.json"];
    const W = 1120, bw = 100, bh = 54, gap = 12, perRow = 5;
    const rows = Math.ceil(steps.length / perRow);
    const H = rows * (bh + 46) - 36;
    let out = "";
    steps.forEach((s, i) => {
      const r = Math.floor(i / perRow), c = i % perRow;
      const colW = (W - 20) / perRow;
      const x = 10 + c * colW + (colW - bw * 2) / 2, y = 8 + r * (bh + 46);
      out += `<g><rect x="${x}" y="${y}" width="${bw * 2}" height="${bh}" rx="8" class="si-pipe-box"/><text x="${x + bw}" y="${y + 22}" text-anchor="middle" class="si-pipe-title">${esc(s)}</text><text x="${x + bw}" y="${y + 40}" text-anchor="middle" class="si-pipe-sub">${esc(subs[i])}</text></g>`;
      if (i < steps.length - 1) {
        if (c < perRow - 1) out += `<path d="M${x + bw * 2 + 2} ${y + bh / 2} h${colW - bw * 2 - 6}" class="si-pipe-arrow" marker-end="url(#si-arr)"/>`;
        else out += `<path d="M${x + bw} ${y + bh + 2} v18 H${10 + (colW - bw * 2) / 2 + bw} v18" class="si-pipe-arrow" marker-end="url(#si-arr)"/>`;
      }
    });
    return `<svg class="si-pipeline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pipeline: ${steps.join(" → ")}"><defs><marker id="si-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>${out}</svg>`;
  }

  SI.renderMethodView = function (container) {
    if (!container) return;
    S.el_method = container;
    const F = S.forecasts || {};
    const h10e = F.horizon10_evaluation || {};
    const shrink = S.intel && S.intel.horizon10_shrinkage;
    const root = h("div", { class: "si-root si-method" });
    const folds5 = [
      ["1", "2000 to 2013", "2005 to 2018", "2014 to 2017", "2018", "2023"],
      ["2", "2000 to 2014", "2005 to 2019", "2015 to 2018", "2019", "2024"],
      ["3", "2000 to 2014", "2005 to 2019", "2015 to 2019", "2020", "2025"],
    ];
    let shrinkHtml = "";
    if (shrink && shrink.alpha_grid && shrink.mae_by_alpha) {
      const grid = shrink.alpha_grid;
      const lookupMae = (a) => { const M = shrink.mae_by_alpha; for (const k of [String(a), Number(a).toFixed(1), Number(a).toFixed(2), Number(a).toFixed(3)]) if (M[k] != null) return M[k]; return null; };
      const vals = grid.map(lookupMae);
      const maxV = Math.max(...vals.filter((v) => v != null), shrink.persistence_mae || 0);
      shrinkHtml = `<div class="si-card"><div class="si-card-head"><h3>Horizon-10 shrinkage (alpha damping)</h3><span>best α = ${fmt(shrink.best_alpha, 2)} · MAE ${fmt(shrink.best_mae, 3)} vs persistence ${fmt(shrink.persistence_mae, 3)}</span></div>
        <div class="si-barlist">${grid.map((a, i) => { const v = vals[i]; const best = Number(a) === Number(shrink.best_alpha); return `<div class="si-bar-row"><span class="si-bar-label">α = ${fmt(a, 2)}${best ? " <small>best</small>" : ""}</span><span class="si-bar-track"><span class="si-bar-fill" style="width:${v == null ? 0 : ((v / maxV) * 100).toFixed(1)}%;background:${best ? CLASS_COLOR.established_hub : "rgba(236,230,217,0.35)"}"></span></span><span class="si-bar-val">${fmt(v, 3)}</span></div>`; }).join("")}
        <div class="si-bar-row"><span class="si-bar-label">persistence</span><span class="si-bar-track"><span class="si-bar-fill" style="width:${(((shrink.persistence_mae || 0) / maxV) * 100).toFixed(1)}%;background:${CLASS_COLOR.stable}"></span></span><span class="si-bar-val">${fmt(shrink.persistence_mae, 3)}</span></div></div>
        <p class="si-prose">${esc(shrink.note || "")}</p></div>`;
    } else {
      shrinkHtml = `<div class="si-card si-card-muted"><div class="si-card-head"><h3>Horizon-10 shrinkage</h3><span>not available</span></div><p class="si-prose si-dim">The α-grid shrinkage experiment (scripts/05_horizon10_shrinkage.py) writes its result into intelligence.json. The shipped forecasts use damping factor ${esc(h10e.damping_factor != null ? h10e.damping_factor : "0.7")} (README: gamma 0.7 chosen on the calibration slice).</p></div>`;
    }
    root.innerHTML = `
      <header class="si-header"><div><h2>Methodology - model card</h2><p class="si-sub">How the Skyline Index is built, validated and where it fails. Numbers reproduce README.md and reports/*.md.</p></div></header>
      <div class="si-card"><div class="si-card-head"><h3>Pipeline</h3><span>sources → panel → reconstruction → index → features → folds → models → conformal → forecasts → map</span></div>${pipelineSvg()}</div>
      <div class="si-grid-2">
        <div class="si-card"><div class="si-card-head"><h3>Importance index</h3><span>annual percentile rank 0-100, fixed reference population</span></div>
          <div class="si-formula">importance = 0.47 · <b>Network</b> + 0.48 · <b>Traffic</b> + 0.05 · <b>Market</b></div>
          <table class="si-table si-table-tight si-table-wrapcells"><thead><tr><th>Component</th><th>Weight</th><th>Sub-components (weights within group)</th></tr></thead><tbody>
            <tr><td>Network topology</td><td class="num">0.47</td><td>PageRank 0.25 · betweenness 0.20 · route degree 0.20 · flight-frequency degree 0.15 · direct country reach 0.10 · links to top-50 hubs 0.10</td></tr>
            <tr><td>Passenger traffic</td><td class="num">0.48</td><td>Observed passengers where available; probabilistically reconstructed elsewhere</td></tr>
            <tr><td>Catchment & market</td><td class="num">0.05</td><td>Metro anchor population 0.40 · national GDP per capita 0.25 · tourism arrivals 0.20 · national GDP 0.15</td></tr></tbody></table>
          <p class="si-prose">Scores are percentiles capped at 100 so top hubs saturate. Missing values are carried forward up to 3 years; never backward. Weight perturbation (25 trials, ±15 pp) keeps median Spearman at 0.9973 (min 0.9467).</p>
          <div class="si-kpis si-kpis-3"><div class="si-kpi"><strong>1,640</strong><span>observed</span></div><div class="si-kpi"><strong>2,214</strong><span>reconstructed</span></div><div class="si-kpi"><strong>225</strong><span>static only</span></div></div>
        </div>
        <div class="si-card"><div class="si-card-head"><h3>Data sources</h3><span>data/README.md</span></div>
          <div class="si-table-wrap"><table class="si-table si-table-tight"><thead><tr><th>Source</th><th>Years</th><th>Level</th><th>Licence</th></tr></thead><tbody>${DATA_SOURCES.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
          <p class="si-prose">Reconstruction: traffic-share model (LightGBM + Ridge, normalised to World Bank national totals; leave-one-country-out log MAE 0.59-1.21) and gravity link prediction (held-out ROC AUC 0.983, Brier 0.0508; out-of-time OpenSky AUC 0.960).</p>
        </div>
      </div>
      <div class="si-card"><div class="si-card-head"><h3>Headline results</h3><span>rolling temporal folds · README.md</span></div>
        <div class="si-table-wrap"><table class="si-table si-table-tight si-results"><thead><tr><th>Horizon</th><th>Fold</th><th>Test year</th><th>Model</th><th class="num">Test N</th><th class="num">Risers P</th><th class="num">Risers R</th><th class="num">Fallers P</th><th class="num">Fallers R</th><th class="num">MAE change</th><th class="num">Spearman level</th><th class="num">Calibrated coverage</th></tr></thead>
        <tbody>${HEADLINE_ROWS.map((r) => `<tr class="${r[3] === "lightgbm" || r[3] === "ensemble" ? "si-row-hl" : ""}">${r.map((c, i) => `<td class="${i >= 4 ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <ul class="si-bullets">
          <li>At horizon 5, LightGBM beats persistence on change MAE (4.319 vs 4.538 on Fold 1; 2.824 vs 3.481 on Fold 2). Riser precision is unstable across folds (0.074-0.108 on Fold 1, 0.394-0.401 on Fold 2).</li>
          <li>At horizon 10, supervised models lose to persistence (5.282 vs 11.044 LightGBM, 10.768 damped ensemble): decadal fluctuations mean-revert. The damped model is shipped for directional signal; both numbers are documented.</li>
          <li>Coverage: Fold 1 h5 = 62.2% (below the 70% target → "rough range"); Folds 2-3 = 89.5% / 85.3% ("calibrated interval"). Horizon 10 = 32.3% → "indicative only".</li>
          <li>Ablation (h5 change MAE): 3.891 all 46 features · 3.907 without network · 3.608 without macro · 3.630 traffic only.</li>
        </ul>
      </div>
      <div class="si-grid-2">
        <div class="si-card"><div class="si-card-head"><h3>Fold design</h3><span>origin-year splits, no lookahead</span></div>
          <div class="si-table-wrap"><table class="si-table si-table-tight"><thead><tr><th>Fold</th><th>Train origin</th><th>Train target</th><th>Gap</th><th>Test origin</th><th>Test target</th></tr></thead><tbody>${folds5.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
          <p class="si-prose">Horizon 5: rolling folds; COVID target years 2020-2022 excluded from training and evaluation; max training target year never exceeds the test origin year. Horizon 10: one blocked split - train origins 2000-2004 (targets 2010-2014), gap 2005-2012, test origins 2013-2015 (targets 2023-2025). Calendar overlap in 2013-2014 is a documented structural limitation of a 26-year panel.</p>
        </div>
        <div class="si-card"><div class="si-card-head"><h3>Class assignment</h3><span>forward forecasts</span></div>
          <ul class="si-bullets">
            <li><span class="si-badge si-badge-established_hub"><i></i>Hub</span> forecast score ≥ 90.</li>
            <li><span class="si-badge si-badge-emerging"><i></i>Emerging</span> / <span class="si-badge si-badge-declining"><i></i>Declining</span> top / bottom 20% of predicted change within each data-quality group, provided |change| ≥ 2.0 pts and ≥ 0.5 × band half-width.</li>
            <li><span class="si-badge si-badge-stable"><i></i>Stable</span> otherwise.</li>
            <li>Present score ≥ 95: +5 / +10 levels = present + Δ+5, clipped to 100; +10 inherits +5 unless the +10 model indicates a larger move beyond its band.</li>
          </ul>
          <p class="si-prose">Predicted shares - +5: stable 0.755, hub 0.118, emerging 0.113, declining 0.013. +10: stable 0.737, hub 0.115, emerging 0.110, declining 0.039. Shipped horizon-10 evaluation: persistence MAE ${esc(h10e.persistence_mae != null ? h10e.persistence_mae : "5.282")}, damped MAE ${esc(h10e.damped_mae != null ? h10e.damped_mae : "10.768")}, coverage ${esc(h10e.coverage_pct != null ? h10e.coverage_pct : "32.3")}% (${esc(h10e.band_label || "indicative only")}).</p>
        </div>
      </div>
      <div class="si-grid-2">
        ${shrinkHtml}
        <div class="si-card"><div class="si-card-head"><h3>Opportunity Radar</h3><span>unserved pairs</span></div>
          <p class="si-prose">Gravity model + Adamic-Adar common neighbours + endpoint momentum multipliers. Validation on 2014 route splits (distance and size matched negatives): combined ROC AUC 0.983, precision@100 1.000, precision@500 0.994. Out-of-time vs OpenSky 2019-2022 appearances: AUC 0.960; 13.8% of the top-500 candidates appeared (1.7% for random unserved pairs). Exports 250 airline candidates, 60 investor risers, 60 tourism destinations - all <em>model candidates, not confirmed demand</em>.</p>
          ${S.opportunities && S.opportunities.validation_auc ? `<div class="si-kpis si-kpis-4">${Object.entries(S.opportunities.validation_auc).map(([k, v]) => `<div class="si-kpi"><strong>${fmt(v, 3)}</strong><span>AUC · ${esc(k.replace("_", " "))}</span></div>`).join("")}</div><p class="si-foot">Component AUCs as exported in opportunities.json (current build).</p>` : ""}
        </div>
      </div>
      <div class="si-grid-2">
        <div class="si-card"><div class="si-card-head"><h3>Limitations</h3><span>README.md</span></div>
          <ol class="si-bullets si-ol">
            <li><strong>Network topology snapshot:</strong> route edges rely on OpenFlights 2014 plus OpenSky 2019-2022; routes opened after 2022 are not captured.</li>
            <li><strong>Reconstructed traffic stability:</strong> within-country distributions are anchored to national totals and physical infrastructure.</li>
            <li><strong>Long-horizon mean reversion:</strong> supervised models fail to beat persistence over 10 years.</li>
            <li><strong>Exogenous events:</strong> airspace closures, airline restructurings and geopolitical disruptions are not anticipated.</li>
            <li><strong>Score saturation:</strong> percentile ranks capped at 100 compress differences between the largest megahubs.</li>
            <li><strong>Not shipped:</strong> Capacity Watch (runway-based expansion flag) achieved 0.74× lift vs random in backtests and was dropped.</li>
          </ol>
        </div>
        <div class="si-card"><div class="si-card-head"><h3>Reproducibility</h3><span>seed 42 · &lt; 15 min</span></div>
<pre class="si-code"># full pipeline from raw public data
python scripts/01_download.py
python scripts/02_build_panel.py
python scripts/03_build_model_table.py
jupyter nbconvert --to notebook --execute --inplace training_notebook.ipynb

# or
python run_all.py

# serve the web app
python -m http.server 8000   # open http://localhost:8000/web/index.html

# tests
pytest</pre>
          <p class="si-prose">Parquet inputs are tracked in <code>data/processed/</code>, so the notebook runs from a fresh clone. Models: LightGBM regressor (max depth 5, 31 leaves), Ridge with log-volume transforms, equal-weight ensemble; split conformal intervals centred on the ensemble.</p>
        </div>
      </div>`;
    container.innerHTML = "";
    container.appendChild(root);
  };

  // Expose shared utilities for scenario.js
  SI._util = { deg, esc, fmt, fmtSigned, fmtInt, fmtBig, h, classBadge, haversine, barList, note, copyText, goToAirport, levelH5, levelH10, changeH5, changeH10, classAt, presentClass, countryName, continentOf, bfs, components, removalAnalysis, sparkline, CLASS_COLOR, CLASS_LABEL, fallbackNote };
})();
