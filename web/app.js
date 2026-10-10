// skyline-index - Global Aviation Intelligence Map

let map;
let airportsData = [];
let opportunitiesData = null;
let airportMarkers = [];
let airportLookup = {};
let selectedAirport = null;
let currentHorizon = "present"; // 'present', 'h5', 'h10'
let currentTab = "map"; // 'map', 'radar'
let currentRadarView = "airline"; // 'airline', 'investor', 'tourism'
let routeLayerGroup;
let candidateRouteLayerGroup;
let compareAirportA = "SIN";
let compareAirportB = "DXB";

const COLOR_MAP = {
  established_hub: "#3dd9c5",
  emerging: "#65cf98",
  stable: "#a3b2c5",
  declining: "#f58f8c",
};

async function fetchJsonWithFallback(paths) {
  for (const path of paths) {
    try {
      const resp = await fetch(path);
      if (resp.ok) return await resp.json();
    } catch (e) {
      // Try next candidate path
    }
  }
  throw new Error("Unable to load data from paths: " + paths.join(", "));
}

function initMap() {
  map = L.map("map", {
    center: [22.0, 15.0],
    zoom: 3,
    minZoom: 2,
    maxZoom: 12,
    worldCopyJump: true,
    preferCanvas: true,
    zoomControl: false,
  });

  // Dark gray base tiles
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri - Esri, DeLorme, NAVTEQ",
    maxZoom: 16,
  }).addTo(map);

  // Custom zoom control
  L.control.zoom({ position: "bottomright" }).addTo(map);

  routeLayerGroup = L.layerGroup().addTo(map);
  candidateRouteLayerGroup = L.layerGroup().addTo(map);

  map.on("zoomend", updateMarkerStyles);
  window.map = map;
}

let selectedHaloMarker = null;

function getAirportScore(airport, horizon) {
  if (horizon === "present") return airport.importance_present;
  if (horizon === "h5" && airport.forecast_h5) return airport.forecast_h5.level;
  if (horizon === "h10" && airport.forecast_h10) return airport.forecast_h10.level;
  return airport.importance_present;
}

function getAirportClass(airport, horizon) {
  if (horizon === "present") {
    return airport.forecast_h5 && airport.forecast_h5.class ? airport.forecast_h5.class : "stable";
  }
  const hData = horizon === "h5" ? airport.forecast_h5 : airport.forecast_h10;
  return hData && hData.class ? hData.class : "stable";
}

function getAirportColor(airport, horizon) {
  const cls = getAirportClass(airport, horizon);
  return COLOR_MAP[cls] || COLOR_MAP.stable;
}

function getAirportRadius(airport, horizon) {
  const score = getAirportScore(airport, horizon);
  const currentZoom = map ? map.getZoom() : 3;
  const zoomBonus = Math.max(0, currentZoom - 3) * 1.0;
  // Radius about 2 to 3 px for low importance (score 0-20), up to about 7 px for top hubs at default zoom (zoom 3)
  const baseRadius = 2.0 + (score / 100.0) * 5.0;
  return Math.min(14.0, baseRadius + zoomBonus);
}

function getMarkerStyle(airport, color, useQualityStyling) {
  const dq = airport.data_quality || (airport.importance_confidence === "high" ? "observed" : "static_only");

  if (!useQualityStyling) {
    return {
      fillColor: color,
      color: "#ffffff",
      weight: 1.0,
      opacity: 0.85,
      fillOpacity: 0.65,
    };
  }

  if (dq === "observed") {
    return {
      fillColor: color,
      color: "#ffffff",
      weight: 1.0,
      opacity: 0.9,
      fillOpacity: 0.65,
    };
  } else if (dq === "reconstructed") {
    return {
      fillColor: color,
      color: "#e8edf4",
      weight: 1.0,
      opacity: 0.8,
      fillOpacity: 0.45,
    };
  } else {
    // static_only: hollow / minimal fill
    return {
      fillColor: color,
      color: color,
      weight: 1.0,
      opacity: 0.85,
      fillOpacity: 0.1,
    };
  }
}

function updateSelectedHalo(ap) {
  if (selectedHaloMarker) {
    map.removeLayer(selectedHaloMarker);
    selectedHaloMarker = null;
  }
  if (!ap || ap.latitude == null || ap.longitude == null) return;

  const radius = getAirportRadius(ap, currentHorizon);
  const color = getAirportColor(ap, currentHorizon);

  selectedHaloMarker = L.circleMarker([ap.latitude, ap.longitude], {
    radius: radius + 4,
    fillColor: color,
    fillOpacity: 0.15,
    color: color,
    weight: 1.5,
    opacity: 0.9,
    interactive: false,
  }).addTo(map);
}

function getVisibleAirports() {
  const enabledClasses = Array.from(document.querySelectorAll("#class-filters-list input:checked")).map((el) => el.value);
  const qualFilter = document.getElementById("filter-quality") ? document.getElementById("filter-quality").value : "all";
  const confFilter = document.getElementById("filter-confidence") ? document.getElementById("filter-confidence").value : "all";
  const searchInput = document.getElementById("search-input");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  return airportsData.filter((ap) => {
    if (ap.latitude == null || ap.longitude == null) return false;

    const activeClass = getAirportClass(ap, currentHorizon);
    if (!enabledClasses.includes(activeClass)) return false;

    const dq = ap.data_quality || (ap.importance_confidence === "high" ? "observed" : "static_only");
    if (qualFilter !== "all" && dq !== qualFilter) return false;

    if (confFilter === "high" && ap.importance_confidence !== "high") return false;
    if (confFilter === "medium" && ap.importance_confidence !== "medium") return false;
    if (confFilter === "low" && ap.importance_confidence !== "low") return false;

    if (query) {
      const matchIata = ap.iata.toLowerCase().includes(query);
      const matchName = ap.name.toLowerCase().includes(query);
      const matchCity = ap.city ? ap.city.toLowerCase().includes(query) : false;
      const matchCountry = ap.country ? ap.country.toLowerCase().includes(query) : false;
      if (!matchIata && !matchName && !matchCity && !matchCountry) return false;
    }

    return true;
  });
}

function updateStatistics() {
  const visible = getVisibleAirports();
  const emergingCount = visible.filter((a) => getAirportClass(a, currentHorizon) === "emerging").length;
  const hubCount = visible.filter((a) => getAirportClass(a, currentHorizon) === "established_hub").length;

  const statAirports = document.getElementById("stat-airports-count");
  if (statAirports) statAirports.textContent = visible.length;

  const statEmerging = document.getElementById("stat-emerging-count");
  if (statEmerging) statEmerging.textContent = emergingCount;

  const statHubs = document.getElementById("stat-hubs-count");
  if (statHubs) statHubs.textContent = hubCount;

  const legendViewCount = document.getElementById("legend-view-count");
  if (legendViewCount) legendViewCount.textContent = `${visible.length} airports in view`;

  const mobileCount = document.getElementById("mobile-filter-count");
  if (mobileCount) mobileCount.textContent = `(${visible.length})`;

  // Update counts per class in filter checkboxes
  const hubTotal = airportsData.filter((a) => getAirportClass(a, currentHorizon) === "established_hub").length;
  const emergingTotal = airportsData.filter((a) => getAirportClass(a, currentHorizon) === "emerging").length;
  const stableTotal = airportsData.filter((a) => getAirportClass(a, currentHorizon) === "stable").length;
  const decliningTotal = airportsData.filter((a) => getAirportClass(a, currentHorizon) === "declining").length;

  const elHub = document.getElementById("count-hub");
  if (elHub) elHub.textContent = hubTotal;
  const elEmerging = document.getElementById("count-emerging");
  if (elEmerging) elEmerging.textContent = emergingTotal;
  const elStable = document.getElementById("count-stable");
  if (elStable) elStable.textContent = stableTotal;
  const elDeclining = document.getElementById("count-declining");
  if (elDeclining) elDeclining.textContent = decliningTotal;
}

function renderMarkers() {
  airportMarkers.forEach((m) => map.removeLayer(m));
  airportMarkers = [];

  const useQualityStyling = document.getElementById("toggle-quality-styling")
    ? document.getElementById("toggle-quality-styling").checked
    : true;

  const visible = getVisibleAirports();
  // Draw small markers on top of large ones (sort by radius descending before adding)
  visible.sort((a, b) => getAirportRadius(b, currentHorizon) - getAirportRadius(a, currentHorizon));

  visible.forEach((ap) => {
    const radius = getAirportRadius(ap, currentHorizon);
    const color = getAirportColor(ap, currentHorizon);
    const styleOpts = getMarkerStyle(ap, color, useQualityStyling);

    const marker = L.circleMarker([ap.latitude, ap.longitude], {
      radius: radius,
      ...styleOpts,
    });

    marker.airportData = ap;
    marker.on("click", () => selectAirport(ap));

    const dq = ap.data_quality || (ap.importance_confidence === "high" ? "observed" : "static_only");
    const scoreVal = getAirportScore(ap, currentHorizon).toFixed(1);
    marker.bindTooltip(`<b>${ap.iata}</b> : ${ap.city || ap.name} (${scoreVal}) [${dq}]`, {
      direction: "top",
      offset: [0, -radius],
    });

    marker.addTo(map);
    airportMarkers.push(marker);
  });

  if (selectedAirport) {
    updateSelectedHalo(selectedAirport);
  }

  updateStatistics();
}

function updateMarkerStyles() {
  const useQualityStyling = document.getElementById("toggle-quality-styling")
    ? document.getElementById("toggle-quality-styling").checked
    : true;

  airportMarkers.forEach((m) => {
    const ap = m.airportData;
    const radius = getAirportRadius(ap, currentHorizon);
    const color = getAirportColor(ap, currentHorizon);
    const styleOpts = getMarkerStyle(ap, color, useQualityStyling);

    m.setRadius(radius);
    m.setStyle(styleOpts);

    const dq = ap.data_quality || (ap.importance_confidence === "high" ? "observed" : "static_only");
    const scoreVal = getAirportScore(ap, currentHorizon).toFixed(1);
    m.setTooltipContent(`<b>${ap.iata}</b> : ${ap.city || ap.name} (${scoreVal}) [${dq}]`);
  });

  if (selectedAirport) {
    updateSelectedHalo(selectedAirport);
  }

  updateStatistics();
}

function selectAirport(ap) {
  selectedAirport = ap;
  renderAirportCard(ap);
  drawAirportRoutes(ap);
  updateSelectedHalo(ap);

  const summary = document.getElementById("selected-summary");
  if (summary) summary.style.display = "none";

  if (ap.latitude != null && ap.longitude != null) {
    map.panTo([ap.latitude, ap.longitude], { animate: true, duration: 0.5 });
  }
}

function drawAirportRoutes(ap) {
  routeLayerGroup.clearLayers();
  candidateRouteLayerGroup.clearLayers();

  if (!ap.routes || ap.routes.length === 0) return;

  const originLat = ap.latitude;
  const originLon = ap.longitude;

  ap.routes.forEach((destIata) => {
    const dest = airportLookup[destIata];
    if (dest && dest.latitude != null && dest.longitude != null) {
      L.polyline(
        [
          [originLat, originLon],
          [dest.latitude, dest.longitude],
        ],
        {
          color: "#3dd9c5",
          weight: 1.5,
          opacity: 0.45,
        }
      ).addTo(routeLayerGroup);
    }
  });
}

function renderTrendSvg(ap) {
  const cur = ap.importance_present;
  const h5Level = ap.forecast_h5 ? ap.forecast_h5.level : cur;
  const h10Level = ap.forecast_h10 ? ap.forecast_h10.level : cur;

  // Band calculations
  let band0Lo = cur - 1.5;
  let band0Hi = cur + 1.5;
  if (ap.reconstruction_interval) {
    band0Lo = ap.reconstruction_interval[0];
    band0Hi = ap.reconstruction_interval[1];
  }

  const band1Lo = ap.forecast_h5 && ap.forecast_h5.band_low != null ? ap.forecast_h5.band_low : h5Level - 3.0;
  const band1Hi = ap.forecast_h5 && ap.forecast_h5.band_high != null ? ap.forecast_h5.band_high : h5Level + 3.0;

  const band2Lo = ap.forecast_h10 && ap.forecast_h10.band_low != null ? ap.forecast_h10.band_low : h10Level - 5.0;
  const band2Hi = ap.forecast_h10 && ap.forecast_h10.band_high != null ? ap.forecast_h10.band_high : h10Level + 5.0;

  // SVG coordinate mapper: 0-100 -> height 120
  function getY(score) {
    const clamped = Math.max(0, Math.min(100, score));
    return 102 - (clamped / 100.0) * 82;
  }

  const x0 = 24, x1 = 140, x2 = 256;
  const y0 = getY(cur);
  const y1 = getY(h5Level);
  const y2 = getY(h10Level);

  const y0Hi = getY(band0Hi), y0Lo = getY(band0Lo);
  const y1Hi = getY(band1Hi), y1Lo = getY(band1Lo);
  const y2Hi = getY(band2Hi), y2Lo = getY(band2Lo);

  const bandPath = `M ${x0} ${y0Hi.toFixed(1)} L ${x1} ${y1Hi.toFixed(1)} L ${x2} ${y2Hi.toFixed(1)} L ${x2} ${y2Lo.toFixed(1)} L ${x1} ${y1Lo.toFixed(1)} L ${x0} ${y0Lo.toFixed(1)} Z`;
  const linePath = `M ${x0} ${y0.toFixed(1)} L ${x1} ${y1.toFixed(1)} L ${x2} ${y2.toFixed(1)}`;

  const h5Coverage = ap.forecast_h5 && ap.forecast_h5.coverage_pct != null ? ap.forecast_h5.coverage_pct : 80;
  const h10Coverage = ap.forecast_h10 && ap.forecast_h10.coverage_pct != null ? ap.forecast_h10.coverage_pct : 32.3;

  const h5Label = h5Coverage < 70 ? "rough range" : (ap.forecast_h5 && ap.forecast_h5.band_label ? ap.forecast_h5.band_label.toLowerCase() : "calibrated interval");
  const h10Label = h10Coverage < 70 ? "indicative only" : (ap.forecast_h10 && ap.forecast_h10.band_label ? ap.forecast_h10.band_label.toLowerCase() : "calibrated interval");

  return `
    <div class="trend">
      <svg viewBox="0 0 280 120" role="img" aria-label="Scores: Current ${cur.toFixed(1)}, +5 years ${h5Level.toFixed(1)}, +10 years ${h10Level.toFixed(1)}">
        <line class="chart-grid" x1="20" y1="36" x2="260" y2="36" />
        <line class="chart-grid" x1="20" y1="72" x2="260" y2="72" />
        <path class="chart-band" d="${bandPath}" />
        <path class="chart-line" d="${linePath}" />
        <circle class="chart-point" cx="${x0}" cy="${y0.toFixed(1)}" r="4.5" />
        <circle class="chart-point" cx="${x1}" cy="${y1.toFixed(1)}" r="4.5" />
        <circle class="chart-point" cx="${x2}" cy="${y2.toFixed(1)}" r="4.5" />
      </svg>
      <div class="forecast-ticks">
        <span><strong>${cur.toFixed(1)}</strong>Current</span>
        <span><strong>${h5Level.toFixed(1)}</strong>+5 years</span>
        <span><strong>${h10Level.toFixed(1)}</strong>+10 years</span>
      </div>
      <div class="forecast-ranges">
        <span></span>
        <span>${h5Label}</span>
        <span>${h10Label}</span>
      </div>
    </div>
  `;
}

function renderAirportCard(ap) {
  const card = document.getElementById("airport-card");
  if (!card) return;

  card.style.display = "block";
  card.scrollTop = 0;

  const cur = ap.importance_present;
  const h5 = ap.forecast_h5 || { level: cur, change: 0.0, class: "stable", band_low: cur, band_high: cur, positive_drivers: [], negative_drivers: [] };
  const h10 = ap.forecast_h10 || { level: cur, change: 0.0, class: "stable", band_low: cur, band_high: cur, positive_drivers: [], negative_drivers: [] };

  const activeForecast = currentHorizon === "h10" ? h10 : (currentHorizon === "h5" ? h5 : h5);
  const activeScore = getAirportScore(ap, currentHorizon);
  const activeClass = getAirportClass(ap, currentHorizon);

  // Score ring circumference
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76
  const strokeDash = `${((activeScore / 100.0) * circumference).toFixed(1)} ${circumference.toFixed(1)}`;

  // 10-year score delta
  const delta10 = h10.level - cur;
  const delta10Sign = delta10 >= 0 ? "+" : "";
  const delta10Text = `${delta10Sign}${delta10.toFixed(1)} pts`;

  const dq = ap.data_quality || (ap.importance_confidence === "high" ? "observed" : "static_only");
  let qualityExplanation = "";
  if (dq === "observed") {
    qualityExplanation = "Observed official passenger statistics from civil aviation authorities.";
  } else if (dq === "reconstructed") {
    const rLo = ap.reconstruction_interval ? ap.reconstruction_interval[0] : (cur - 2.0).toFixed(1);
    const rHi = ap.reconstruction_interval ? ap.reconstruction_interval[1] : (cur + 2.0).toFixed(1);
    qualityExplanation = `Reconstructed probabilistically from national totals with interval [${rLo}, ${rHi}].`;
  } else {
    qualityExplanation = "Static physical capacity and network topology only (no historical traffic observations).";
  }

  const confLabel = (ap.importance_confidence || "medium").toUpperCase();
  const routeCount = ap.routes ? ap.routes.length : 0;

  // Drivers list
  const driversSource = currentHorizon === "h10" ? h10 : h5;
  const posDrivers = (driversSource.positive_drivers || []).map((d) => `<span class="driver positive">↗ ${d}</span>`).join("");
  const negDrivers = (driversSource.negative_drivers || []).map((d) => `<span class="driver negative">↘ ${d}</span>`).join("");
  const allDriversHtml = posDrivers + negDrivers || '<span class="driver">No major drivers recorded</span>';

  // Direct routes list summary
  const directRoutesText = routeCount > 0 ? ap.routes.slice(0, 15).join(", ") + (routeCount > 15 ? ` +${routeCount - 15} more` : "") : "None recorded in topology snapshot";

  const classDisplay = activeClass.replace("_", " ");

  card.innerHTML = `
    <div class="detail-top">
      <span class="eyebrow">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>
        AIRPORT INTELLIGENCE
      </span>
      <button type="button" class="close-btn" id="btn-close-card" aria-label="Close airport card">&times;</button>
    </div>

    <div class="airport-heading">
      <span class="iata" id="selected-iata">${ap.iata}</span>
      <span class="airport-type">INTERNATIONAL AIRPORT</span>
    </div>
    <h2 id="selected-name">${ap.name}</h2>
    <p class="location">${ap.city ? ap.city + ", " : ""}${ap.country}</p>

    <div class="airport-metadata">
      <span class="metadata-badge">
        Data quality: <strong>${dq}</strong>
        <span class="info-tip">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>${qualityExplanation}</span>
        </span>
      </span>
      <span class="metadata-badge">
        Confidence: <strong>${confLabel}</strong>
        <span class="info-tip">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>Confidence indicates source signal completeness and calibration stability.</span>
        </span>
      </span>
      <span class="airport-routes">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>
        <strong>${routeCount}</strong> direct routes
      </span>
    </div>

    <div class="score-section">
      <div class="score-ring">
        <svg viewBox="0 0 90 90">
          <circle class="score-track" cx="45" cy="45" r="${radius}" />
          <circle class="score-fill" cx="45" cy="45" r="${radius}" stroke-dasharray="${strokeDash}" />
        </svg>
        <div>
          <strong>${activeScore.toFixed(1)}</strong>
          <span>/ 100</span>
        </div>
      </div>
      <div>
        <span class="subheading">
          Importance score
          <span class="info-tip">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Network centrality, connectivity, and volume percentile score from 0 to 100.</span>
          </span>
        </span>
        <p class="score-delta">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
          ${delta10Text} <span>over 10 years</span>
        </p>
        <span class="class-badge ${activeClass}">
          <i></i>${classDisplay}
        </span>
      </div>
    </div>

    <section class="detail-section">
      <div class="section-title">
        <h3>Growth outlook</h3>
        <span class="info-tip">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>Five and ten year projections trained on historical panel shifts and macroeconomic indicators. Shaded band represents forecast uncertainty.</span>
        </span>
      </div>
      ${renderTrendSvg(ap)}
      <div class="chart-note">
        <i></i>Projected uncertainty range
      </div>
      <div class="confidence-row">
        <span>Forecast confidence</span>
        <span class="${ap.importance_confidence === "high" ? "positive-text" : "warning-text"}">
          &bull; ${confLabel}
        </span>
      </div>
    </section>

    <section class="detail-section">
      <div class="section-title">
        <h3>Top drivers</h3>
        <span>Horizon model</span>
      </div>
      <div class="driver-list">
        ${allDriversHtml}
      </div>
    </section>

    <section class="detail-section">
      <div class="section-title">
        <h3>Network routes</h3>
        <span>${routeCount} destinations</span>
      </div>
      <p style="font-size: 12px; color: var(--muted-foreground); line-height: 1.45; margin-top: 4px;">
        ${directRoutesText}
      </p>
    </section>

    <div class="detail-footer">
      <button type="button" class="compare-button" id="btn-card-compare">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="6" r="3"/><path d="M5 9v12"/><circle cx="19" cy="18" r="3"/><path d="M19 15V3"/></svg>
        Add to comparison
      </button>
      <div class="detail-footer-note">
        ${qualityExplanation}
      </div>
    </div>
  `;

  // Attach card event handlers
  const closeBtn = document.getElementById("btn-close-card");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      card.style.display = "none";
      routeLayerGroup.clearLayers();
      if (selectedHaloMarker) {
        map.removeLayer(selectedHaloMarker);
        selectedHaloMarker = null;
      }
      const summary = document.getElementById("selected-summary");
      if (summary) {
        summary.style.display = "block";
        const summaryIata = document.getElementById("summary-iata");
        if (summaryIata) summaryIata.textContent = ap.iata;
      }
    });
  }

  const compareBtn = document.getElementById("btn-card-compare");
  if (compareBtn) {
    compareBtn.addEventListener("click", () => {
      compareAirportA = ap.iata;
      compareAirportB = ap.iata === "SIN" ? "DXB" : "SIN";
      openCompareDrawer();
    });
  }
}

function openCompareDrawer() {
  const overlay = document.getElementById("compare-overlay");
  if (!overlay) return;
  overlay.style.display = "block";
  renderCompareDrawer();
}

function closeCompareDrawer() {
  const overlay = document.getElementById("compare-overlay");
  if (overlay) overlay.style.display = "none";
}

window.openCompareDrawer = openCompareDrawer;
window.setCompareAirports = function(a, b) {
  compareAirportA = a;
  compareAirportB = b;
};

function renderCompareDrawer() {
  const container = document.getElementById("compare-columns");
  if (!container) return;

  const apA = airportLookup[compareAirportA] || airportsData[0];
  const apB = airportLookup[compareAirportB] || airportsData[1];

  const renderCol = (ap, isA) => {
    if (!ap) return "<div>No airport data</div>";
    const cur = ap.importance_present;
    const h5 = ap.forecast_h5 || { level: cur, class: "stable", band_low: cur, band_high: cur, positive_drivers: [], negative_drivers: [] };
    const h10 = ap.forecast_h10 || { level: cur, class: "stable", band_low: cur, band_high: cur, positive_drivers: [], negative_drivers: [] };

    const activeScore = getAirportScore(ap, currentHorizon);
    const activeClass = getAirportClass(ap, currentHorizon);
    const clsDisplay = activeClass.replace("_", " ");

    const optionsHtml = airportsData
      .map((item) => `<option value="${item.iata}" ${item.iata === ap.iata ? "selected" : ""}>${item.iata} : ${item.city || item.name}</option>`)
      .join("");

    const driversSource = currentHorizon === "h10" ? h10 : h5;
    const posDrivers = (driversSource.positive_drivers || []).slice(0, 2).map((d) => `<span class="driver positive">↗ ${d}</span>`).join("");
    const negDrivers = (driversSource.negative_drivers || []).slice(0, 1).map((d) => `<span class="driver negative">↘ ${d}</span>`).join("");

    const selectId = isA ? "compare-select-a" : "compare-select-b";

    return `
      <div class="compare-column">
        <select class="compare-select" id="${selectId}" aria-label="Select comparison airport">
          ${optionsHtml}
        </select>
        <h3>${ap.name}</h3>
        <p>${ap.city ? ap.city + ", " : ""}${ap.country}</p>
        <div>
          <span class="class-badge ${activeClass}"><i></i>${clsDisplay}</span>
        </div>

        <div class="compare-metrics">
          <div>
            <strong>${cur.toFixed(1)}</strong>
            <span>Present</span>
          </div>
          <div>
            <strong>${h5.level.toFixed(1)}</strong>
            <span>+5 Years</span>
          </div>
          <div>
            <strong>${h10.level.toFixed(1)}</strong>
            <span>+10 Years</span>
          </div>
        </div>

        ${renderTrendSvg(ap)}

        <div class="driver-list">
          ${posDrivers}${negDrivers}
        </div>

        <div class="confidence-row" style="margin-top: 6px;">
          <span>Data quality: <strong>${ap.data_quality || "observed"}</strong></span>
          <span>Confidence: <strong>${ap.importance_confidence || "medium"}</strong></span>
        </div>
      </div>
    `;
  };

  container.innerHTML = renderCol(apA, true) + renderCol(apB, false);

  const selA = document.getElementById("compare-select-a");
  if (selA) {
    selA.addEventListener("change", (e) => {
      compareAirportA = e.target.value;
      renderCompareDrawer();
    });
  }

  const selB = document.getElementById("compare-select-b");
  if (selB) {
    selB.addEventListener("change", (e) => {
      compareAirportB = e.target.value;
      renderCompareDrawer();
    });
  }
}

function renderRadar() {
  const container = document.getElementById("radar-results-list");
  if (!container) return;
  container.innerHTML = "";

  if (!opportunitiesData) {
    container.innerHTML = "<p style='font-size: 12px; color: var(--muted-foreground);'>Opportunity data unavailable.</p>";
    return;
  }

  if (currentRadarView === "airline") {
    const list = opportunitiesData.airline_opportunities || [];
    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "radar-card";
      card.innerHTML = `
        <div class="radar-card-header">
          <span class="radar-card-rank">#${item.rank} Candidate Route</span>
          <span class="radar-card-score">Score ${item.score}</span>
        </div>
        <div class="radar-card-pair">${item.origin_iata} &harr; ${item.dest_iata}</div>
        <div class="radar-card-desc"><b>${item.origin_city}</b> to <b>${item.dest_city}</b> (${item.distance_km} km)</div>
        <div class="radar-card-desc">${item.reason}</div>
      `;
      card.addEventListener("click", () => showCandidateOnMap(item));
      container.appendChild(card);
    });
  } else if (currentRadarView === "investor") {
    const list = opportunitiesData.investor_opportunities || [];
    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "radar-card";
      card.innerHTML = `
        <div class="radar-card-header">
          <span class="radar-card-rank">#${item.rank} High Confidence Riser</span>
          <span class="radar-card-score">+${item.forecast_change_h5.toFixed(2)} pts</span>
        </div>
        <div class="radar-card-pair">${item.iata} : ${item.city || item.name}</div>
        <div class="radar-card-desc">${item.country} &bull; Current: ${item.importance_present.toFixed(1)} &bull; 2030: ${item.forecast_level_h5.toFixed(1)}</div>
        <div class="radar-card-desc">Driver: ${item.top_driver}</div>
      `;
      card.addEventListener("click", () => {
        const ap = airportLookup[item.iata];
        if (ap) {
          switchTab("map");
          selectAirport(ap);
        }
      });
      container.appendChild(card);
    });
  } else if (currentRadarView === "tourism") {
    const list = opportunitiesData.tourism_opportunities || [];
    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "radar-card";
      card.innerHTML = `
        <div class="radar-card-header">
          <span class="radar-card-rank">#${item.rank} Expanding Destination</span>
          <span class="radar-card-score">+${item.forecast_change_h5.toFixed(2)} pts</span>
        </div>
        <div class="radar-card-pair">${item.iata} : ${item.city || item.name}</div>
        <div class="radar-card-desc">${item.country} &bull; Intl Share: ${(item.international_share * 100).toFixed(0)}%</div>
        <div class="radar-card-desc">Driver: ${item.top_driver}</div>
      `;
      card.addEventListener("click", () => {
        const ap = airportLookup[item.iata];
        if (ap) {
          switchTab("map");
          selectAirport(ap);
        }
      });
      container.appendChild(card);
    });
  }
}

function showCandidateOnMap(item) {
  switchTab("map");
  candidateRouteLayerGroup.clearLayers();
  routeLayerGroup.clearLayers();

  const lat1 = item.origin_lat, lon1 = item.origin_lon;
  const lat2 = item.dest_lat, lon2 = item.dest_lon;

  const poly = L.polyline(
    [
      [lat1, lon1],
      [lat2, lon2],
    ],
    {
      color: "#65cf98",
      dashArray: "6, 8",
      weight: 2.5,
      opacity: 0.9,
    }
  ).addTo(candidateRouteLayerGroup);

  poly.bindPopup(`<b>Candidate Route: ${item.origin_iata} &harr; ${item.dest_iata}</b><br>${item.reason}<br>Distance: ${item.distance_km} km`);
  poly.openPopup();

  map.fitBounds(poly.getBounds(), { padding: [50, 50], maxZoom: 6 });
}

function switchTab(tab) {
  currentTab = tab;
  const mapNav = document.getElementById("tab-nav-map");
  const radarNav = document.getElementById("tab-nav-radar");
  const radarPanel = document.getElementById("radar-panel");
  const leftPanel = document.getElementById("left-panel");
  const airportCard = document.getElementById("airport-card");

  if (tab === "map") {
    mapNav.classList.add("active");
    mapNav.setAttribute("aria-pressed", "true");
    radarNav.classList.remove("active");
    radarNav.setAttribute("aria-pressed", "false");
    radarPanel.style.display = "none";
    if (leftPanel) leftPanel.style.display = "";
    map.invalidateSize();
  } else {
    mapNav.classList.remove("active");
    mapNav.setAttribute("aria-pressed", "false");
    radarNav.classList.add("active");
    radarNav.setAttribute("aria-pressed", "true");
    radarPanel.style.display = "flex";
    if (airportCard) airportCard.style.display = "none";
    renderRadar();
  }
}
window.switchTab = switchTab;

function renderAboutCard(data) {
  const aboutText = document.getElementById("about-text");
  if (!aboutText) return;

  const method = data.methodology || "Ensemble of LightGBM and Ridge with IMF and UN forward projections";
  const h10 = data.horizon10_evaluation || {
    persistence_mae: 5.282,
    damped_mae: 10.768,
    damping_factor: 0.7,
    coverage_pct: 32.3,
  };
  const h10Label = h10.band_label || (h10.coverage_pct < 70 ? "indicative only" : "calibrated intervals");

  aboutText.innerHTML = `
    The Skyline Index evaluates global airport importance across route network centrality, annual traffic throughput, and regional market catchment.
    Forecast methodology: ${method}.
    At horizon 10, persistence (predicting zero change) wins on test MAE (${h10.persistence_mae} versus ${h10.damped_mae} for the damped model) due to decadal mean reversion; we ship the damped model (damping factor ${h10.damping_factor}) to supply directional signals alongside baseline persistence benchmarks. Horizon 10 uncertainty bands achieve ${h10.coverage_pct} percent coverage and are labelled as ${h10Label}.
    The Opportunity Radar predicts promising unserved city pairs by combining network topology with forecast airport momentum.
  `;
}

function setupEventListeners() {
  // Horizon buttons
  const horizonOptions = document.querySelectorAll(".horizon-option");
  horizonOptions.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      horizonOptions.forEach((b) => b.classList.remove("selected", "active"));
      e.target.classList.add("selected", "active");
      currentHorizon = e.target.getAttribute("data-horizon");

      const horizonNote = document.getElementById("horizon-heading-note");
      const bottomHorizon = document.getElementById("map-bottom-horizon-label");
      if (currentHorizon === "present") {
        if (horizonNote) horizonNote.textContent = "Present score and 5-year trend";
        if (bottomHorizon) bottomHorizon.textContent = "Current baseline";
      } else if (currentHorizon === "h5") {
        if (horizonNote) horizonNote.textContent = "+5 Years view: 2030 score";
        if (bottomHorizon) bottomHorizon.textContent = "5-year scenario";
      } else if (currentHorizon === "h10") {
        if (horizonNote) horizonNote.textContent = "+10 Years view: 2035 score";
        if (bottomHorizon) bottomHorizon.textContent = "10-year scenario";
      }

      updateMarkerStyles();
      if (selectedAirport) renderAirportCard(selectedAirport);
    });
  });

  // Navigation tabs
  document.getElementById("tab-nav-map").addEventListener("click", () => switchTab("map"));
  document.getElementById("tab-nav-radar").addEventListener("click", () => switchTab("radar"));

  // Radar subtabs
  document.querySelectorAll(".radar-tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".radar-tab-btn").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      currentRadarView = e.target.getAttribute("data-view");
      renderRadar();
    });
  });

  // Filters & search
  document.querySelectorAll("#class-filters-list input").forEach((input) => {
    input.addEventListener("change", renderMarkers);
  });

  const qualSelect = document.getElementById("filter-quality");
  if (qualSelect) qualSelect.addEventListener("change", renderMarkers);

  const confSelect = document.getElementById("filter-confidence");
  if (confSelect) confSelect.addEventListener("change", renderMarkers);

  const stylingToggle = document.getElementById("toggle-quality-styling");
  if (stylingToggle) stylingToggle.addEventListener("change", updateMarkerStyles);

  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("btn-clear-search");
  const searchResults = document.getElementById("search-results");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim().toLowerCase();
      if (clearSearchBtn) clearSearchBtn.style.display = q ? "inline-block" : "none";

      if (q.length >= 2 && searchResults) {
        const matches = airportsData.filter(
          (a) => a.iata.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.city && a.city.toLowerCase().includes(q))
        ).slice(0, 5);

        if (matches.length > 0) {
          searchResults.style.display = "flex";
          searchResults.innerHTML = matches
            .map((a) => `<button type="button" data-iata="${a.iata}"><strong>${a.iata}</strong> ${a.name} (${a.city || a.country})</button>`)
            .join("");
          searchResults.querySelectorAll("button").forEach((btn) => {
            btn.addEventListener("click", () => {
              const ap = airportLookup[btn.getAttribute("data-iata")];
              if (ap) selectAirport(ap);
              searchResults.style.display = "none";
            });
          });
        } else {
          searchResults.style.display = "none";
        }
      } else if (searchResults) {
        searchResults.style.display = "none";
      }

      renderMarkers();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      clearSearchBtn.style.display = "none";
      if (searchResults) searchResults.style.display = "none";
      renderMarkers();
    });
  }

  // Reset all filters button
  const resetBtn = document.getElementById("btn-reset-filters");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      document.querySelectorAll("#class-filters-list input").forEach((input) => (input.checked = true));
      if (qualSelect) qualSelect.value = "all";
      if (confSelect) confSelect.value = "all";
      if (searchInput) searchInput.value = "";
      if (clearSearchBtn) clearSearchBtn.style.display = "none";
      if (searchResults) searchResults.style.display = "none";
      renderMarkers();
    });
  }

  // Summary button to reopen card
  const btnOpenCard = document.getElementById("btn-open-card");
  if (btnOpenCard) {
    btnOpenCard.addEventListener("click", () => {
      if (selectedAirport) selectAirport(selectedAirport);
    });
  }

  // Compare buttons
  const btnOpenCompare = document.getElementById("btn-open-compare");
  if (btnOpenCompare) {
    btnOpenCompare.addEventListener("click", () => {
      if (selectedAirport) {
        compareAirportA = selectedAirport.iata;
        compareAirportB = selectedAirport.iata === "SIN" ? "DXB" : "SIN";
      }
      openCompareDrawer();
    });
  }

  const btnCloseCompare = document.getElementById("btn-close-compare");
  if (btnCloseCompare) {
    btnCloseCompare.addEventListener("click", closeCompareDrawer);
  }

  const compareOverlay = document.getElementById("compare-overlay");
  if (compareOverlay) {
    compareOverlay.addEventListener("click", (e) => {
      if (e.target === compareOverlay) closeCompareDrawer();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCompareDrawer();
  });

  // Mobile filters toggle
  const mobileFiltersBtn = document.getElementById("btn-mobile-filters");
  const leftPanel = document.getElementById("left-panel");
  const closeFiltersBtn = document.getElementById("btn-close-filters");

  if (mobileFiltersBtn && leftPanel) {
    mobileFiltersBtn.addEventListener("click", () => {
      leftPanel.classList.toggle("filters-open");
    });
  }

  if (closeFiltersBtn && leftPanel) {
    closeFiltersBtn.addEventListener("click", () => {
      leftPanel.classList.remove("filters-open");
    });
  }
}

async function startApp() {
  initMap();
  setupEventListeners();

  try {
    const [forecasts, opportunities] = await Promise.all([
      fetchJsonWithFallback(["./forecasts.json", "forecasts.json", "../data/outputs/forecasts.json", "/data/outputs/forecasts.json", "data/outputs/forecasts.json"]),
      fetchJsonWithFallback(["./opportunities.json", "opportunities.json", "../data/outputs/opportunities.json", "/data/outputs/opportunities.json", "data/outputs/opportunities.json"]),
    ]);

    airportsData = forecasts.airports || [];
    window.airportsData = airportsData;
    window.airportLookup = airportLookup;
    window.selectAirport = selectAirport;
    opportunitiesData = opportunities;
    window.opportunitiesData = opportunities;

    renderAboutCard(forecasts);

    airportsData.forEach((a) => {
      airportLookup[a.iata] = a;
    });

    renderMarkers();

    // Default select Singapore (SIN)
    if (airportLookup["SIN"]) {
      selectAirport(airportLookup["SIN"]);
    } else if (airportsData.length > 0) {
      selectAirport(airportsData[0]);
    }
  } catch (err) {
    console.error("Error loading skyline-index data:", err);
  }
}

document.addEventListener("DOMContentLoaded", startApp);
