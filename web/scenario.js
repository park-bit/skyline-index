// skyline-index - Scenario Lab (workstream C2)
// Registers window.SkylineIntel.renderScenarioView(containerEl).
// Every scenario is a linear surrogate / network heuristic, NOT a re-run of the model.

(function () {
  "use strict";
  const SI = (window.SkylineIntel = window.SkylineIntel || {});

  function U() { return SI._util; }
  function S() { return SI._state; }

  const SCEN_TABS = [
    { id: "closure", label: "Hub closure" },
    { id: "macro", label: "Macro shock" },
    { id: "route", label: "New route" },
  ];
  const state = { tab: "closure", closure: { iata: "" }, macro: { iso2: "", gdp: 0, tourism: 0, pop: 0 }, route: { a: "", b: "" } };

  // ---------------------------------------------------------------------------
  // Searchable airport picker (vanilla, with suggestion list)
  // ---------------------------------------------------------------------------
  function airportPicker(id, label, value, placeholder) {
    const { esc } = U();
    const ap = value ? S().lookup[value] : null;
    return `<div class="si-field si-picker" data-picker="${id}">
      <label for="${id}">${esc(label)}</label>
      <input type="text" id="${id}" class="si-input" autocomplete="off" placeholder="${esc(placeholder || "Type IATA, city or airport name")}" value="${ap ? esc(ap.iata + " - " + (ap.city || ap.name)) : ""}" aria-autocomplete="list" aria-expanded="false" role="combobox">
      <div class="si-suggest" role="listbox" style="display:none"></div>
    </div>`;
  }
  function wirePicker(root, id, onPick) {
    const { esc, deg } = U();
    const wrap = root.querySelector(`[data-picker="${id}"]`);
    if (!wrap) return;
    const input = wrap.querySelector("input");
    const list = wrap.querySelector(".si-suggest");
    let active = -1, matches = [];
    const close = () => { list.style.display = "none"; input.setAttribute("aria-expanded", "false"); active = -1; };
    const render = () => {
      if (!matches.length) return close();
      list.innerHTML = matches.map((a, i) => `<button type="button" role="option" class="${i === active ? "active" : ""}" data-iata="${esc(a.iata)}"><strong>${esc(a.iata)}</strong> ${esc(a.name)} <span>${esc(a.city || "")} ${esc(a.country || "")} · ${deg(a.iata)} routes</span></button>`).join("");
      list.style.display = "";
      input.setAttribute("aria-expanded", "true");
      list.querySelectorAll("button").forEach((b) => b.addEventListener("mousedown", (e) => { e.preventDefault(); pick(b.getAttribute("data-iata")); }));
    };
    const pick = (iata) => {
      const a = S().lookup[iata];
      if (!a) return;
      input.value = `${a.iata} - ${a.city || a.name}`;
      close();
      onPick(iata);
    };
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { matches = []; return close(); }
      const aps = S().airports;
      const exact = aps.filter((a) => a.iata.toLowerCase() === q);
      const rest = aps.filter((a) => a.iata.toLowerCase() !== q && (a.iata.toLowerCase().startsWith(q) || a.name.toLowerCase().includes(q) || (a.city && a.city.toLowerCase().includes(q))));
      rest.sort((a, b) => (b.importance_present || 0) - (a.importance_present || 0));
      matches = exact.concat(rest).slice(0, 8);
      active = -1;
      render();
    });
    input.addEventListener("keydown", (e) => {
      if (list.style.display === "none") { if (e.key === "Enter" && input.value.trim().length >= 3) { const q = input.value.trim().slice(0, 3).toUpperCase(); if (S().lookup[q]) pick(q); } return; }
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(matches.length - 1, active + 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); render(); }
      else if (e.key === "Enter") { e.preventDefault(); pick((matches[active] || matches[0]).iata); }
      else if (e.key === "Escape") close();
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
    input.addEventListener("focus", () => { if (matches.length) render(); });
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  SI.renderScenarioView = function (container) {
    if (!container) return;
    const st = S();
    st.el_scenario = container;
    if (!st.ready) { container.innerHTML = `<div class="si-root"><div class="si-empty">Loading forecast data…</div></div>`; return; }
    const { esc, h, note } = U();
    // Consume a pending preselection (from Hub Resilience "Simulate closure")
    if (st.pendingScenario) {
      const p = st.pendingScenario;
      st.pendingScenario = null;
      if (p.kind === "closure" && p.params.iata) { state.tab = "closure"; state.closure.iata = p.params.iata; }
      else if (p.kind === "macro" && p.params.iso2) { state.tab = "macro"; state.macro.iso2 = p.params.iso2; }
      else if (p.kind === "route") { state.tab = "route"; Object.assign(state.route, p.params); }
    }
    container.innerHTML = "";
    const root = h("div", { class: "si-root si-scenario" });
    const sensOk = !!(st.intel && st.intel.scenario && st.intel.scenario.sensitivities_h5);
    root.innerHTML = `
      <header class="si-header"><div><h2>Scenario Lab</h2>
        <p class="si-sub">Interactive what-if analysis. <strong>Linear surrogate / network heuristic - not a re-run of the model.</strong> Results are approximations layered on the shipped forecasts.</p></div></header>
      ${sensOk ? "" : note("intelligence.json (scenario sensitivities) not found - hub closure and new-route topology work client-side; macro shock and sensitivity-based uplift are disabled.", "warn")}
      <div class="si-tabs" role="tablist" aria-label="Scenarios">${SCEN_TABS.map((t) => `<button type="button" role="tab" class="si-tab${state.tab === t.id ? " active" : ""}" data-tab="${t.id}" aria-selected="${state.tab === t.id}">${t.label}</button>`).join("")}</div>
      <div class="si-body" id="si-scen-body" role="tabpanel"></div>`;
    container.appendChild(root);
    root.querySelectorAll(".si-tab").forEach((b) => b.addEventListener("click", () => {
      state.tab = b.getAttribute("data-tab");
      root.querySelectorAll(".si-tab").forEach((x) => { const on = x === b; x.classList.toggle("active", on); x.setAttribute("aria-selected", on); });
      renderBody(root.querySelector("#si-scen-body"));
    }));
    renderBody(root.querySelector("#si-scen-body"));
  };

  function renderBody(body) {
    body.innerHTML = "";
    ({ closure: renderClosure, macro: renderMacro, route: renderRoute }[state.tab] || renderClosure)(body);
  }

  function actions(resetId, copyId) {
    return `<div class="si-actions"><button type="button" class="si-btn si-btn-ghost" id="${resetId}">Reset</button><button type="button" class="si-btn" id="${copyId}">Copy summary</button></div>`;
  }

  // ---------------------------------------------------------------------------
  // 1. Hub closure
  // ---------------------------------------------------------------------------
  function renderClosure(body) {
    const { esc, h, fmt, fmtInt, fmtSigned, removalAnalysis, copyText, goToAirport, classBadge, classAt } = U();
    const st = S();
    const card = h("div", { class: "si-card" });
    card.innerHTML = `
      <div class="si-card-head"><h3>Hub closure</h3><span>BFS on the undirected routes graph (${fmtInt(Object.keys(st.adj).length)} airports)</span></div>
      <div class="si-form-row">${airportPicker("si-closure-pick", "Airport to remove", state.closure.iata, "e.g. DXB, Dubai")}
        <div class="si-chips">${["DXB", "IST", "ATL", "LHR", "SIN", "ANC"].filter((x) => st.lookup[x]).map((x) => `<button type="button" class="si-chip" data-iata="${x}">${x}</button>`).join("")}</div></div>
      <div id="si-closure-result"></div>
      ${actions("si-closure-reset", "si-closure-copy")}`;
    body.appendChild(card);
    const res = card.querySelector("#si-closure-result");
    let summary = "";
    const run = () => {
      const iata = state.closure.iata;
      if (!iata || !st.lookup[iata]) { res.innerHTML = `<p class="si-prose si-dim">Pick an airport to simulate its removal from the network.</p>`; summary = ""; return; }
      res.innerHTML = `<p class="si-prose si-dim">Computing…</p>`;
      setTimeout(() => {
        const r = removalAnalysis(iata);
        const ap = st.lookup[iata];
        if (!r) { res.innerHTML = `<p class="si-prose si-dim">${esc(iata)} has no recorded routes in the topology snapshot.</p>`; return; }
        const fileRow = st.derived.resilience.fromFile ? st.derived.resilience.byIata[iata] : null;
        const disc = r.disconnected.map((x) => st.lookup[x]).filter(Boolean).sort((a, b) => b.importance_present - a.importance_present);
        const pairLossPct = r.reach_loss_pct;
        res.innerHTML = `
          <div class="si-kpis si-kpis-5">
            <div class="si-kpi"><strong>${fmtInt(r.degree)}</strong><span>direct routes removed</span></div>
            <div class="si-kpi"><strong class="${disc.length ? "si-neg" : ""}">${fmtInt(disc.length)}</strong><span>airports disconnected</span></div>
            <div class="si-kpi"><strong class="${pairLossPct > 0 ? "si-neg" : ""}">${fmt(pairLossPct, 3)}%</strong><span>of connected pairs lose connectivity</span></div>
            <div class="si-kpi"><strong>${fmtInt(r.neighbours_path_grew)}<small>/${r.neighbours_sampled}</small></strong><span>neighbours whose shortest paths lengthen</span></div>
            <div class="si-kpi"><strong>${r.is_articulation_point ? "yes" : "no"}</strong><span>articulation point</span></div>
          </div>
          ${fileRow ? `<p class="si-foot">Cross-check with intelligence.json: reach loss ${fmt(fileRow.removal_reach_loss_pct, 3)}% · ${fmtInt(fileRow.removal_disconnected_airports)} disconnected · ${fileRow.is_articulation_point ? "articulation point" : "not an articulation point"}${fileRow.vulnerability_class ? ` · class ${esc(fileRow.vulnerability_class)}` : ""}.</p>` : `<p class="si-foot">No intelligence.json cross-check available; values above are the client-side BFS result.</p>`}
          <div class="si-grid-2">
            <div>
              <div class="si-card-head"><h4>Top 10 most-affected airports</h4><span>neighbours of ${esc(iata)}, by isolation then path growth</span></div>
              <div class="si-table-wrap"><table class="si-table si-table-tight"><thead><tr><th>Airport</th><th class="num" title="mean hops to all reachable airports, before → after">Avg hops</th><th class="num">Paths longer</th><th class="num">Lost</th><th>Class</th></tr></thead>
              <tbody>${r.most_affected.map((m) => { const a = st.lookup[m.iata] || {}; return `<tr class="si-clickable" data-iata="${esc(m.iata)}" tabindex="0"><td><strong class="si-iata">${esc(m.iata)}</strong> ${esc(a.city || a.name || "")} <span class="si-dim">${esc(a.country || "")}</span></td><td class="num">${fmt(m.avg_before, 2)} → ${fmt(m.avg_after, 2)}</td><td class="num">${fmt(m.share_grew * 100, 1)}%</td><td class="num ${m.lost ? "si-neg" : ""}">${fmtInt(m.lost)}</td><td>${classBadge(classAt(a, "h5"))}</td></tr>`; }).join("")}</tbody></table></div>
            </div>
            <div>
              <div class="si-card-head"><h4>Airports cut off from the giant component</h4><span>${disc.length ? `${disc.length} airports` : "none"}</span></div>
              ${disc.length ? `<div class="si-chipset">${disc.slice(0, 60).map((a) => `<button type="button" class="si-chip si-chip-neg" data-iata="${esc(a.iata)}" title="${esc(a.name)}">${esc(a.iata)}</button>`).join("")}${disc.length > 60 ? `<span class="si-dim">+${disc.length - 60} more</span>` : ""}</div>` : `<p class="si-prose si-dim">Every other airport keeps at least one path; ${esc(iata)}'s partners are reachable through alternative hubs.</p>`}
            </div>
          </div>
          ${typeof window.highlightAirports === "function" ? `<div class="si-actions si-actions-left"><button type="button" class="si-btn si-btn-ghost" id="si-closure-show-map">Show affected on map</button></div>` : ""}
          <p class="si-foot">Heuristic: edges are unweighted and undirected; schedules, capacity and frequencies are ignored. The browser graph is the union of the route lists in forecasts.json (at most 15 per airport), so it is sparser than the OpenFlights-based graph behind intelligence.json and cross-check values differ. "Avg hops" is measured from each of the top-${r.neighbours_sampled} partners (by importance) to every airport they can reach.</p>`;
        res.querySelectorAll("[data-iata]").forEach((el) => el.addEventListener("click", () => goToAirport(el.getAttribute("data-iata"))));
        res.querySelectorAll("tr[data-iata]").forEach((tr) => tr.addEventListener("keydown", (e) => { if (e.key === "Enter") goToAirport(tr.getAttribute("data-iata")); }));
        const showBtn = res.querySelector("#si-closure-show-map");
        if (showBtn) showBtn.addEventListener("click", () => {
          if (typeof window.highlightAirports !== "function") return;
          try { window.highlightAirports([iata].concat(r.disconnected, r.most_affected.map((m) => m.iata))); } catch (e) {}
        });
        summary = `Skyline Index - Scenario Lab: closure of ${iata} (${ap.name})\n` +
          `Network heuristic (BFS on routes graph), not a model re-run.\n` +
          `Direct routes removed: ${r.degree}\nAirports disconnected from giant component: ${disc.length}${disc.length ? " (" + disc.slice(0, 20).map((a) => a.iata).join(", ") + (disc.length > 20 ? ", …" : "") + ")" : ""}\n` +
          `Connected pairs losing connectivity: ${pairLossPct.toFixed(3)}%\nNeighbours with longer shortest paths: ${r.neighbours_path_grew}/${r.neighbours_sampled}\nArticulation point: ${r.is_articulation_point ? "yes" : "no"}\n` +
          `Most affected: ${r.most_affected.map((m) => `${m.iata} (${m.avg_before.toFixed(2)}→${m.avg_after.toFixed(2)} hops${m.lost ? ", " + m.lost + " lost" : ""})`).join("; ")}` +
          (fileRow ? `\nintelligence.json cross-check: reach loss ${fileRow.removal_reach_loss_pct}% / ${fileRow.removal_disconnected_airports} disconnected` : "");
      }, 10);
    };
    wirePicker(card, "si-closure-pick", (iata) => { state.closure.iata = iata; run(); });
    card.querySelectorAll(".si-chip[data-iata]").forEach((b) => b.addEventListener("click", () => { state.closure.iata = b.getAttribute("data-iata"); const a = st.lookup[state.closure.iata]; card.querySelector("#si-closure-pick").value = `${a.iata} - ${a.city || a.name}`; run(); }));
    card.querySelector("#si-closure-reset").addEventListener("click", () => { state.closure.iata = ""; card.querySelector("#si-closure-pick").value = ""; run(); if (typeof window.highlightAirports === "function") { try { window.highlightAirports([], { switchTab: false, fit: false }); } catch (e) {} } });
    card.querySelector("#si-closure-copy").addEventListener("click", (e) => copyText(summary || "No scenario selected.", e.currentTarget));
    run();
  }

  // ---------------------------------------------------------------------------
  // 2. Macro shock
  // ---------------------------------------------------------------------------
  function approxClass(level, change, bandHalf) {
    if (level >= 90) return "established_hub";
    if (change >= 2.0 && change >= 0.5 * bandHalf) return "emerging";
    if (change <= -2.0 && -change >= 0.5 * bandHalf) return "declining";
    return "stable";
  }

  function renderMacro(body) {
    const { esc, h, fmt, fmtInt, fmtSigned, copyText, goToAirport, classBadge, classAt, levelH5, levelH10, countryName, note, sparkline, CLASS_COLOR } = U();
    const st = S();
    const sc = st.intel && st.intel.scenario;
    const s5 = sc && sc.sensitivities_h5, s10 = sc && sc.sensitivities_h10;
    const units = (sc && sc.units) || {};
    const card = h("div", { class: "si-card" });
    const countries = st.derived.countries.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!state.macro.iso2) state.macro.iso2 = st.derived.countryByIso["IN"] ? "IN" : countries[0].iso2;
    const m = state.macro;
    const slider = (id, label, min, max, step, val, unit) => `<div class="si-field"><label for="${id}">${label} <output for="${id}" id="${id}-out">${fmtSigned(val, step < 1 ? 1 : 0)}${unit}</output></label><input type="range" class="si-range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" ${s5 ? "" : "disabled"}></div>`;
    card.innerHTML = `
      <div class="si-card-head"><h3>Macro shock</h3><span>linear surrogate: Δ importance = Σ sensitivity × shock</span></div>
      ${s5 ? "" : note("Sensitivities (<code>intelligence.scenario.sensitivities_h5/h10</code>) are not available, so this scenario is disabled. Build intelligence.json with <code>scripts/04_build_intelligence.py</code> to enable it.", "warn")}
      <div class="si-form-grid">
        <div class="si-field"><label for="si-macro-country">Country</label><select id="si-macro-country" class="si-input" ${s5 ? "" : "disabled"}>${countries.map((c) => `<option value="${esc(c.iso2)}" ${c.iso2 === m.iso2 ? "selected" : ""}>${esc(c.name)} (${c.n_airports})</option>`).join("")}</select></div>
        ${slider("si-macro-gdp", "GDP growth shock", -3, 3, 0.25, m.gdp, " pp")}
        ${slider("si-macro-tour", "Tourism arrivals growth", -20, 20, 1, m.tourism, " %")}
        ${slider("si-macro-pop", "Population growth", -2, 2, 0.1, m.pop, " pp")}
      </div>
      <div id="si-macro-result"></div>
      ${actions("si-macro-reset", "si-macro-copy")}`;
    body.appendChild(card);
    const res = card.querySelector("#si-macro-result");
    let summary = "";
    const compute = () => {
      if (!s5) { res.innerHTML = `<p class="si-prose si-dim">Disabled - no sensitivities available.${sc && sc.method ? " " + esc(sc.method) : ""}</p>`; return; }
      const c = st.derived.countryByIso[m.iso2];
      const list = (st.derived.countryAirports[m.iso2] || []).slice().sort((a, b) => b.importance_present - a.importance_present);
      const g = (s, k) => (s && typeof s[k] === "number" ? s[k] : 0);
      const d5 = g(s5, "gdp_growth_1y") * m.gdp + g(s5, "tourism_growth_1y") * m.tourism + g(s5, "pop_growth_1y") * m.pop;
      const d10 = g(s10, "gdp_growth_1y") * m.gdp + g(s10, "tourism_growth_1y") * m.tourism + g(s10, "pop_growth_1y") * m.pop;
      const rows = list.map((a) => {
        const l5 = Math.max(0, Math.min(100, levelH5(a) + d5));
        const l10 = Math.max(0, Math.min(100, levelH10(a) + d10));
        const band5 = a.forecast_h5 && a.forecast_h5.band_high != null ? (a.forecast_h5.band_high - a.forecast_h5.band_low) / 2 : 3;
        const band10 = a.forecast_h10 && a.forecast_h10.band_high != null ? (a.forecast_h10.band_high - a.forecast_h10.band_low) / 2 : 5;
        const c5 = approxClass(l5, (a.forecast_h5 ? a.forecast_h5.change : 0) + d5, band5);
        const c10 = approxClass(l10, (a.forecast_h10 ? (a.forecast_h10.change_damped != null ? a.forecast_h10.change_damped : a.forecast_h10.change) : 0) + d10, band10);
        return { a, l5, l10, c5, c10, changed5: c5 !== classAt(a, "h5"), changed10: c10 !== classAt(a, "h10") };
      });
      const nUp5 = rows.filter((r) => r.changed5 && (r.c5 === "emerging" || r.c5 === "established_hub")).length;
      const nDown5 = rows.filter((r) => r.changed5 && r.c5 === "declining").length;
      const meanL5 = rows.length ? rows.reduce((x, r) => x + r.l5, 0) / rows.length : 0;
      const meanL10 = rows.length ? rows.reduce((x, r) => x + r.l10, 0) / rows.length : 0;
      res.innerHTML = `
        <div class="si-kpis si-kpis-5">
          <div class="si-kpi"><strong class="${d5 >= 0 ? "si-pos" : "si-neg"}">${fmtSigned(d5, 2)}</strong><span>Δ pts per airport, +5</span></div>
          <div class="si-kpi"><strong class="${d10 >= 0 ? "si-pos" : "si-neg"}">${fmtSigned(d10, 2)}</strong><span>Δ pts per airport, +10</span></div>
          <div class="si-kpi"><strong>${fmt(c.mean_level_h5)} → ${fmt(meanL5)}</strong><span>mean 2030 level</span></div>
          <div class="si-kpi"><strong>${fmt(c.mean_level_h10)} → ${fmt(meanL10)}</strong><span>mean 2035 level</span></div>
          <div class="si-kpi"><strong>${nUp5 + nDown5}</strong><span>class changes at +5 (${nUp5} up, ${nDown5} down)</span></div>
        </div>
        <div class="si-table-wrap si-scroll"><table class="si-table si-table-tight"><thead><tr><th>Airport</th><th class="num">2030 base</th><th class="num">2030 shocked</th><th>Class +5 (approx.)</th><th class="num">2035 base</th><th class="num">2035 shocked</th><th>Class +10 (approx.)</th></tr></thead>
        <tbody>${rows.slice(0, 80).map((r) => `<tr class="si-clickable" data-iata="${esc(r.a.iata)}" tabindex="0"><td><strong class="si-iata">${esc(r.a.iata)}</strong> ${esc(r.a.city || r.a.name)}</td><td class="num">${fmt(levelH5(r.a))}</td><td class="num ${d5 >= 0 ? "si-pos" : "si-neg"}">${fmt(r.l5)}</td><td>${classBadge(r.c5)}${r.changed5 ? ' <span class="si-flag">changed</span>' : ""}</td><td class="num">${fmt(levelH10(r.a))}</td><td class="num ${d10 >= 0 ? "si-pos" : "si-neg"}">${fmt(r.l10)}</td><td>${classBadge(r.c10)}${r.changed10 ? ' <span class="si-flag">changed</span>' : ""}</td></tr>`).join("")}</tbody></table></div>
        ${rows.length > 80 ? `<p class="si-foot">Showing the 80 largest of ${rows.length} airports.</p>` : ""}
        <p class="si-foot">Sensitivities (per unit, from the standardised Ridge surrogate): +5 - GDP ${fmt(g(s5, "gdp_growth_1y"), 3)}/${esc(units.gdp_growth_1y || "pp")}, tourism ${fmt(g(s5, "tourism_growth_1y"), 4)}/${esc(units.tourism_growth_1y || "%")}, population ${fmt(g(s5, "pop_growth_1y"), 3)}/${esc(units.pop_growth_1y || "pp")}. Classes are re-assigned by the simple thresholds (≥90 hub; |Δ| ≥ 2 and ≥ 0.5 × band half-width) and are approximate. ${esc((sc && sc.method) || "")}</p>`;
      res.querySelectorAll("tr[data-iata]").forEach((tr) => { tr.addEventListener("click", () => goToAirport(tr.getAttribute("data-iata"))); tr.addEventListener("keydown", (e) => { if (e.key === "Enter") goToAirport(tr.getAttribute("data-iata")); }); });
      summary = `Skyline Index - Scenario Lab: macro shock for ${c.name} (${m.iso2})\nLinear surrogate, not a model re-run.\nShock: GDP growth ${fmtSigned(m.gdp, 2)} pp, tourism ${fmtSigned(m.tourism, 0)} %, population ${fmtSigned(m.pop, 1)} pp\nΔ importance per airport: ${fmtSigned(d5, 2)} pts (+5), ${fmtSigned(d10, 2)} pts (+10)\nMean level 2030: ${fmt(c.mean_level_h5)} → ${fmt(meanL5)}; 2035: ${fmt(c.mean_level_h10)} → ${fmt(meanL10)}\nClass changes at +5: ${nUp5} up, ${nDown5} down (approximate thresholds)\n` + rows.slice(0, 15).map((r) => `${r.a.iata}: 2030 ${fmt(levelH5(r.a))}→${fmt(r.l5)} [${r.c5}], 2035 ${fmt(levelH10(r.a))}→${fmt(r.l10)} [${r.c10}]`).join("\n");
    };
    card.querySelector("#si-macro-country").addEventListener("change", (e) => { m.iso2 = e.target.value; compute(); });
    [["si-macro-gdp", "gdp", 2], ["si-macro-tour", "tourism", 0], ["si-macro-pop", "pop", 1]].forEach(([id, key, d]) => {
      const el = card.querySelector("#" + id);
      el.addEventListener("input", () => { m[key] = parseFloat(el.value); card.querySelector("#" + id + "-out").textContent = fmtSigned(m[key], d) + (key === "tourism" ? " %" : " pp"); compute(); });
    });
    card.querySelector("#si-macro-reset").addEventListener("click", () => { m.gdp = 0; m.tourism = 0; m.pop = 0; body.innerHTML = ""; renderMacro(body); });
    card.querySelector("#si-macro-copy").addEventListener("click", (e) => copyText(summary || "Scenario disabled.", e.currentTarget));
    compute();
  }

  // ---------------------------------------------------------------------------
  // 3. New route
  // ---------------------------------------------------------------------------
  function renderRoute(body) {
    const { esc, h, fmt, fmtInt, fmtSigned, haversine, copyText, goToAirport, classBadge, classAt, levelH5, note, deg } = U();
    const st = S();
    const sc = st.intel && st.intel.scenario;
    const s5 = sc && sc.sensitivities_h5, s10 = sc && sc.sensitivities_h10;
    const card = h("div", { class: "si-card" });
    card.innerHTML = `
      <div class="si-card-head"><h3>New route</h3><span>topology heuristic + Opportunity Radar lookup</span></div>
      <div class="si-form-grid si-form-grid-2">${airportPicker("si-route-a", "Airport A", state.route.a, "e.g. BLR")}${airportPicker("si-route-b", "Airport B", state.route.b, "e.g. SFO")}</div>
      <div class="si-chips">${[["LGW", "MAN"], ["BLR", "SFO"], ["DEL", "MEX"]].filter((p) => st.lookup[p[0]] && st.lookup[p[1]]).map((p) => `<button type="button" class="si-chip" data-a="${p[0]}" data-b="${p[1]}">${p[0]} ↔ ${p[1]}</button>`).join("")}</div>
      <div id="si-route-result"></div>
      ${actions("si-route-reset", "si-route-copy")}`;
    body.appendChild(card);
    const res = card.querySelector("#si-route-result");
    let summary = "";
    const compute = () => {
      const A = st.lookup[state.route.a], B = st.lookup[state.route.b];
      if (!A || !B) { res.innerHTML = `<p class="si-prose si-dim">Pick two airports to evaluate an unserved pair.</p>`; summary = ""; return; }
      if (A.iata === B.iata) { res.innerHTML = `<p class="si-prose si-dim">Pick two different airports.</p>`; return; }
      const dist = haversine(A.latitude, A.longitude, B.latitude, B.longitude);
      const exists = st.adj[A.iata] && st.adj[A.iata].has(B.iata);
      const nA = st.adj[A.iata] || new Set(), nB = st.adj[B.iata] || new Set();
      const common = Array.from(nA).filter((x) => nB.has(x));
      const aa = common.reduce((acc, x) => acc + 1 / Math.log(Math.max(2, st.adj[x].size)), 0);
      const opp = (st.opportunities && st.opportunities.airline_opportunities || []).find((o) => (o.origin_iata === A.iata && o.dest_iata === B.iata) || (o.origin_iata === B.iata && o.dest_iata === A.iata));
      const top50 = st.derived.top50;
      const uplift = (s, self, partner) => {
        if (!s) return null;
        const r = typeof s.of_routes_total === "number" ? s.of_routes_total : 0;
        const hl = typeof s.of_top50_hub_links === "number" && top50.has(partner.iata) ? s.of_top50_hub_links : 0;
        return { routes: r, hub: hl, total: r + hl };
      };
      const uA5 = uplift(s5, A, B), uB5 = uplift(s5, B, A), uA10 = uplift(s10, A, B), uB10 = uplift(s10, B, A);
      const endpoint = (X, u5, u10, partner) => `<div class="si-endpoint">
        <div class="si-endpoint-head"><strong class="si-iata">${esc(X.iata)}</strong> ${esc(X.name)}<br><span class="si-dim">${esc(X.city || "")} ${esc(X.country)} · ${deg(X.iata)} routes · score ${fmt(X.importance_present)} · ${classBadge(classAt(X, "h5"))}</span></div>
        ${u5 ? `<div class="si-kpis si-kpis-2"><div class="si-kpi"><strong class="${u5.total >= 0 ? "si-pos" : "si-neg"}">${fmtSigned(u5.total, 3)}</strong><span>Δ pts +5 (routes ${fmtSigned(u5.routes, 3)}${u5.hub ? `, hub link ${fmtSigned(u5.hub, 3)}` : ""})</span></div><div class="si-kpi"><strong class="${u10 && u10.total >= 0 ? "si-pos" : "si-neg"}">${u10 ? fmtSigned(u10.total, 3) : "-"}</strong><span>Δ pts +10</span></div></div>
          <p class="si-foot">2030 level ${fmt(levelH5(X))} → ${fmt(Math.max(0, Math.min(100, levelH5(X) + u5.total)))}${top50.has(partner.iata) ? ` · ${esc(partner.iata)} is a top-50 hub (+1 hub link)` : ""}</p>`
          : `<p class="si-foot si-dim">Uplift needs sensitivities for <code>of_routes_total</code> / <code>of_top50_hub_links</code> from intelligence.json.</p>`}
      </div>`;
      res.innerHTML = `
        <div class="si-kpis si-kpis-4">
          <div class="si-kpi"><strong>${fmtInt(dist)} km</strong><span>great-circle distance</span></div>
          <div class="si-kpi"><strong class="${exists ? "si-pos" : ""}">${exists ? "yes" : "no"}</strong><span>already in the route snapshot</span></div>
          <div class="si-kpi"><strong>${common.length}</strong><span>common neighbours (Adamic-Adar ${fmt(aa, 2)})</span></div>
          <div class="si-kpi"><strong>${opp ? opp.score : "-"}</strong><span>${opp ? `Opportunity Radar score · rank #${opp.rank}` : "not in top-250 Radar candidates"}</span></div>
        </div>
        ${opp ? `<p class="si-prose">${esc(opp.reason)} <em>(${esc(opp.candidate_label)})</em></p>` : ""}
        <div class="si-grid-2">${endpoint(A, uA5, uA10, B)}${endpoint(B, uB5, uB10, A)}</div>
        ${common.length ? `<div class="si-card-head"><h4>Common neighbours</h4><span>${common.length}</span></div><div class="si-chipset">${common.sort((x, y) => st.adj[y].size - st.adj[x].size).slice(0, 40).map((x) => `<button type="button" class="si-chip" data-iata="${esc(x)}">${esc(x)}</button>`).join("")}${common.length > 40 ? `<span class="si-dim">+${common.length - 40} more</span>` : ""}</div>` : ""}
        <p class="si-foot">Heuristic uplift: routes_total +1 for each endpoint and top50_hub_links +1 when the partner is a top-50 hub by present importance, multiplied by the per-unit sensitivities. Ignores demand, aircraft range and slots.</p>`;
      res.querySelectorAll(".si-chip[data-iata]").forEach((b) => b.addEventListener("click", () => goToAirport(b.getAttribute("data-iata"))));
      summary = `Skyline Index - Scenario Lab: new route ${A.iata} ↔ ${B.iata}\nNetwork heuristic, not a model re-run.\nDistance ${fmtInt(dist)} km · exists in snapshot: ${exists ? "yes" : "no"} · common neighbours ${common.length} (Adamic-Adar ${fmt(aa, 2)})\nOpportunity Radar: ${opp ? `score ${opp.score}, rank #${opp.rank} (${opp.candidate_label})` : "not among top-250 candidates"}\n` + (uA5 ? `Uplift +5: ${A.iata} ${fmtSigned(uA5.total, 3)} pts, ${B.iata} ${fmtSigned(uB5.total, 3)} pts; +10: ${A.iata} ${fmtSigned(uA10 ? uA10.total : 0, 3)}, ${B.iata} ${fmtSigned(uB10 ? uB10.total : 0, 3)}` : "Uplift unavailable (no sensitivities)");
    };
    wirePicker(card, "si-route-a", (iata) => { state.route.a = iata; compute(); });
    wirePicker(card, "si-route-b", (iata) => { state.route.b = iata; compute(); });
    card.querySelectorAll(".si-chip[data-a]").forEach((b) => b.addEventListener("click", () => {
      state.route.a = b.getAttribute("data-a"); state.route.b = b.getAttribute("data-b");
      const a = st.lookup[state.route.a], bb = st.lookup[state.route.b];
      card.querySelector("#si-route-a").value = `${a.iata} - ${a.city || a.name}`;
      card.querySelector("#si-route-b").value = `${bb.iata} - ${bb.city || bb.name}`;
      compute();
    }));
    card.querySelector("#si-route-reset").addEventListener("click", () => { state.route.a = ""; state.route.b = ""; card.querySelector("#si-route-a").value = ""; card.querySelector("#si-route-b").value = ""; compute(); });
    card.querySelector("#si-route-copy").addEventListener("click", (e) => copyText(summary || "No pair selected.", e.currentTarget));
    compute();
  }

  // Programmatic API used by tests and other modules
  SI.scenarioState = state;
  SI.runClosure = function (iata) { return U().removalAnalysis(iata); };
})();
