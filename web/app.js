// Skyline Index - Global Aviation Intelligence Map

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

const COLOR_MAP = {
  established_hub: "#388bfd",
  emerging: "#2ea043",
  stable: "#d29922",
  declining: "#f85149",
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
    center: [25.0, 10.0],
    zoom: 3,
    minZoom: 2,
    maxZoom: 12,
    worldCopyJump: true,
    preferCanvas: true,
  });

  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri - Esri, DeLorme, NAVTEQ",
    maxZoom: 16,
  }).addTo(map);

  routeLayerGroup = L.layerGroup().addTo(map);
  candidateRouteLayerGroup = L.layerGroup().addTo(map);
}

function getAirportColor(airport, horizon) {
  if (horizon === "present") {
    const score = airport.importance_present;
    if (score >= 90.0) return COLOR_MAP.established_hub;
    return COLOR_MAP.stable;
  }
  const hData = horizon === "h5" ? airport.forecast_h5 : airport.forecast_h10;
  const cls = hData && hData.class ? hData.class : "stable";
  return COLOR_MAP[cls] || COLOR_MAP.stable;
}

function getAirportRadius(airport, horizon) {
  let score = airport.importance_present;
  if (horizon === "h5" && airport.forecast_h5) score = airport.forecast_h5.level;
  if (horizon === "h10" && airport.forecast_h10) score = airport.forecast_h10.level;
  return Math.max(3.5, Math.min(18.0, (score / 100.0) * 14.0 + 3.5));
}

function getMarkerStyle(ap, color, useQualityStyling) {
  const dq = ap.data_quality || (ap.importance_confidence === "high" ? "observed" : "static_only");

  if (!useQualityStyling) {
    return {
      fillColor: color,
      color: "#ffffff",
      weight: 1.0,
      opacity: 0.9,
      fillOpacity: 0.8,
    };
  }

  if (dq === "observed") {
    return {
      fillColor: color,
      color: "#ffffff",
      weight: 1.0,
      opacity: 0.95,
      fillOpacity: 0.85,
    };
  } else if (dq === "reconstructed") {
    return {
      fillColor: color,
      color: "#f0f6fc",
      weight: 1.2,
      opacity: 0.85,
      fillOpacity: 0.40,
    };
  } else {
    // static_only: hollow
    return {
      fillColor: color,
      color: color,
      weight: 2.0,
      opacity: 0.9,
      fillOpacity: 0.05,
    };
  }
}

function renderMarkers() {
  airportMarkers.forEach((m) => map.removeLayer(m));
  airportMarkers = [];

  const filterConf = document.getElementById("filter-confidence") ? document.getElementById("filter-confidence").value : "all";
  const filterCls = document.getElementById("filter-class") ? document.getElementById("filter-class").value : "all";
  const filterQual = document.getElementById("filter-quality") ? document.getElementById("filter-quality").value : "all";
  const useQualityStyling = document.getElementById("toggle-quality-styling") ? document.getElementById("toggle-quality-styling").checked : true;
  const searchQ = document.getElementById("search-input").value.trim().toLowerCase();

  airportsData.forEach((ap) => {
    if (ap.latitude == null || ap.longitude == null) return;

    // Quality filter
    const dq = ap.data_quality || (ap.importance_confidence === "high" ? "observed" : "static_only");
    if (filterQual !== "all" && dq !== filterQual) return;

    // Confidence filter
    if (filterConf === "high" && ap.importance_confidence !== "high") return;
    if (filterConf === "medium" && ap.importance_confidence !== "medium") return;
    if (filterConf === "low" && ap.importance_confidence !== "low") return;

    // Class filter
    const activeClass =
      currentHorizon === "present"
        ? ap.importance_present >= 90
          ? "established_hub"
          : "stable"
        : (currentHorizon === "h5" ? ap.forecast_h5 : ap.forecast_h10)?.class;

    if (filterCls !== "all" && activeClass !== filterCls) return;

    // Search filter
    if (searchQ) {
      const matchIata = ap.iata.toLowerCase().includes(searchQ);
      const matchName = ap.name.toLowerCase().includes(searchQ);
      const matchCity = ap.city.toLowerCase().includes(searchQ);
      if (!matchIata && !matchName && !matchCity) return;
    }

    const radius = getAirportRadius(ap, currentHorizon);
    const color = getAirportColor(ap, currentHorizon);
    const styleOpts = getMarkerStyle(ap, color, useQualityStyling);

    const marker = L.circleMarker([ap.latitude, ap.longitude], {
      radius: radius,
      ...styleOpts,
    });

    marker.airportData = ap;
    marker.on("click", () => selectAirport(ap));
    marker.bindTooltip(`<b>${ap.iata}</b> - ${ap.city || ap.name} (${ap.importance_present.toFixed(1)}) [${dq}]`, {
      direction: "top",
      offset: [0, -radius],
    });

    marker.addTo(map);
    airportMarkers.push(marker);
  });
}

function updateMarkerStyles() {
  const useQualityStyling = document.getElementById("toggle-quality-styling") ? document.getElementById("toggle-quality-styling").checked : true;

  airportMarkers.forEach((m) => {
    const ap = m.airportData;
    const radius = getAirportRadius(ap, currentHorizon);
    const color = getAirportColor(ap, currentHorizon);
    const styleOpts = getMarkerStyle(ap, color, useQualityStyling);

    m.setRadius(radius);
    m.setStyle(styleOpts);
  });
}

function selectAirport(ap) {
  selectedAirport = ap;
  renderDrawer(ap);
  drawAirportRoutes(ap);

  // Pan smoothly
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
      L.polyline([[originLat, originLon], [dest.latitude, dest.longitude]], {
        color: "#58a6ff",
        weight: 1.5,
        opacity: 0.45,
      }).addTo(routeLayerGroup);
    }
  });
}

function renderSparkline(present, h5, h10) {
  // 3-point progression SVG
  const points = [
    { x: 10, y: 40 - (present / 100.0) * 35 },
    { x: 100, y: 40 - (h5 / 100.0) * 35 },
    { x: 190, y: 40 - (h10 / 100.0) * 35 },
  ];
  const pathD = `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} L ${points[2].x} ${points[2].y}`;

  return `
    <svg class="sparkline-svg" viewBox="0 0 200 45">
      <line x1="10" y1="40" x2="190" y2="40" stroke="#30363d" stroke-dasharray="2,2" />
      <path d="${pathD}" fill="none" stroke="#58a6ff" stroke-width="2" />
      <circle cx="${points[0].x}" cy="${points[0].y}" r="3" fill="#ffffff" />
      <circle cx="${points[1].x}" cy="${points[1].y}" r="3.5" fill="#2ea043" />
      <circle cx="${points[2].x}" cy="${points[2].y}" r="4" fill="#388bfd" />
      <text x="10" y="44" fill="#8b949e" font-size="8">2025</text>
      <text x="95" y="44" fill="#8b949e" font-size="8">2030</text>
      <text x="175" y="44" fill="#8b949e" font-size="8">2035</text>
    </svg>
  `;
}

function renderDrawer(ap) {
  const drawer = document.getElementById("airport-drawer");
  const content = document.getElementById("drawer-content");

  drawer.setAttribute("aria-hidden", "false");
  drawer.classList.remove("hidden");

  const cur = ap.importance_present;
  const h5 = ap.forecast_h5 || { level: cur, change: 0.0, class: "stable", band_low: cur, band_high: cur, positive_drivers: [], negative_drivers: [] };
  const h10 = ap.forecast_h10 || { level: cur, change: 0.0, class: "stable", band_low: cur, band_high: cur, positive_drivers: [], negative_drivers: [] };

  const delta5 = h5.change >= 0 ? `+${h5.change.toFixed(2)}` : h5.change.toFixed(2);
  const delta10 = h10.change >= 0 ? `+${h10.change.toFixed(2)}` : h10.change.toFixed(2);

  const delta5Class = h5.change > 0 ? "delta-pos" : (h5.change < 0 ? "delta-neg" : "delta-zero");
  const delta10Class = h10.change > 0 ? "delta-pos" : (h10.change < 0 ? "delta-neg" : "delta-zero");

  const activeForecast = currentHorizon === "h10" ? h10 : h5;
  const bandText = `${activeForecast.band_low.toFixed(1)} to ${activeForecast.band_high.toFixed(1)}`;

  const dq = ap.data_quality || (ap.importance_confidence === "high" ? "observed" : "static_only");
  let howEstimated = "";
  let badgeQualityCls = "badge-quality-static";
  let badgeQualityText = "Static Only";

  if (dq === "observed") {
    howEstimated = "Observed official passenger statistics from civil aviation authorities.";
    badgeQualityCls = "badge-quality-observed";
    badgeQualityText = "Observed";
  } else if (dq === "reconstructed") {
    const rLo = ap.reconstruction_interval ? ap.reconstruction_interval[0] : (cur - 2.0).toFixed(1);
    const rHi = ap.reconstruction_interval ? ap.reconstruction_interval[1] : (cur + 2.0).toFixed(1);
    howEstimated = `Reconstructed probabilistically from national totals with interval [${rLo}, ${rHi}].`;
    badgeQualityCls = "badge-quality-reconstructed";
    badgeQualityText = "Reconstructed";
  } else {
    howEstimated = "Static physical capacity and network topology only (no historical traffic observations).";
    badgeQualityCls = "badge-quality-static";
    badgeQualityText = "Static Only";
  }

  let confBadge = '<span class="badge badge-confidence-low">Low Confidence</span>';
  if (ap.importance_confidence === "high") {
    confBadge = '<span class="badge badge-confidence-high">High Confidence</span>';
  } else if (ap.importance_confidence === "medium") {
    confBadge = '<span class="badge badge-confidence-medium">Medium Confidence</span>';
  }

  const posDrivers = (activeForecast.positive_drivers || [])
    .map((d) => `<li class="driver-item positive">${d}</li>`)
    .join("");
  const negDrivers = (activeForecast.negative_drivers || [])
    .map((d) => `<li class="driver-item negative">${d}</li>`)
    .join("");

  const routeCount = ap.routes ? ap.routes.length : 0;

  content.innerHTML = `
    <div class="card-header">
      <div class="badge-row">
        <span class="card-iata" id="selected-iata">${ap.iata}</span>
        <span class="badge ${badgeQualityCls}">${badgeQualityText}</span>
        ${confBadge}
        <span class="badge badge-class">${activeForecast.class.replace("_", " ")}</span>
      </div>
      <div class="card-name" id="selected-name">${ap.name}</div>
      <div class="card-location">${ap.city ? ap.city + ", " : ""}${ap.country}</div>
    </div>

    <div class="estimation-box">
      <div class="estimation-label">How This Was Estimated</div>
      <div class="estimation-text">${howEstimated}</div>
    </div>

    <div class="metric-grid">
      <div class="metric-box">
        <span class="metric-label">2025 Present</span>
        <span class="metric-value">${cur.toFixed(1)}</span>
        <span class="metric-delta delta-zero">Baseline</span>
      </div>
      <div class="metric-box">
        <span class="metric-label">+5Y (2030)</span>
        <span class="metric-value">${h5.level.toFixed(1)}</span>
        <span class="metric-delta ${delta5Class}">${delta5}</span>
      </div>
      <div class="metric-box">
        <span class="metric-label">+10Y (2035)</span>
        <span class="metric-value">${h10.level.toFixed(1)}</span>
        <span class="metric-delta ${delta10Class}">${delta10}</span>
      </div>
    </div>

    <div class="band-info">
      <div class="band-title">Uncertainty Intervals (${currentHorizon === "h10" ? "+10Y" : "+5Y"})</div>
      ${ap.reconstruction_interval ? `<div>Reconstruction Interval: <b>[${ap.reconstruction_interval[0]}, ${ap.reconstruction_interval[1]}]</b></div>` : ""}
      <div>${currentHorizon === "h10" ? "Rough Range (46% empirical coverage)" : "Calibrated Predictive Band"}: <b>${bandText}</b></div>
    </div>

    <div class="sparkline-box">
      <div class="sparkline-title">Trajectory Horizon</div>
      ${renderSparkline(cur, h5.level, h10.level)}
    </div>

    <div class="drivers-section">
      <div class="drivers-title">Key Model Drivers (${currentHorizon === "h10" ? "+10Y" : "+5Y"})</div>
      <ul class="drivers-list">
        ${posDrivers}
        ${negDrivers}
      </ul>
    </div>

    <div class="reliability-note">
      Reliability: ${ap.reliability || howEstimated}
    </div>

    <div class="routes-list">
      <b>Direct Network Routes:</b> ${routeCount > 0 ? ap.routes.join(", ") : "None recorded in topology snapshot"}
    </div>
  `;
}

function renderRadar() {
  const container = document.getElementById("radar-results-list");
  container.innerHTML = "";

  if (!opportunitiesData) {
    container.innerHTML = "<p>Opportunity data unavailable.</p>";
    return;
  }

  if (currentRadarView === "airline") {
    const list = opportunitiesData.airline_opportunities || [];
    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "radar-card";
      card.innerHTML = `
        <div class="radar-card-header">
          <span class="radar-card-rank">#${item.rank} Route Candidate</span>
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
        <div class="radar-card-pair">${item.iata} - ${item.city || item.name}</div>
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
        <div class="radar-card-pair">${item.iata} - ${item.city || item.name}</div>
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

  const poly = L.polyline([[lat1, lon1], [lat2, lon2]], {
    color: "#2ea043",
    dashArray: "6, 8",
    weight: 2.5,
    opacity: 0.85,
  }).addTo(candidateRouteLayerGroup);

  poly.bindPopup(`<b>Candidate Route: ${item.origin_iata} &harr; ${item.dest_iata}</b><br>${item.reason}<br>Distance: ${item.distance_km} km`);
  poly.openPopup();

  map.fitBounds(poly.getBounds(), { padding: [50, 50], maxZoom: 6 });
}

function switchTab(tab) {
  currentTab = tab;
  const mapNav = document.getElementById("tab-nav-map");
  const radarNav = document.getElementById("tab-nav-radar");
  const mapView = document.getElementById("map-view");
  const sidebar = document.getElementById("control-sidebar");
  const radarPanel = document.getElementById("radar-panel");
  const drawer = document.getElementById("airport-drawer");

  if (tab === "map") {
    mapNav.classList.add("active");
    radarNav.classList.remove("active");
    mapView.classList.remove("hidden");
    sidebar.classList.remove("hidden");
    radarPanel.classList.add("hidden");
    map.invalidateSize();
  } else {
    mapNav.classList.remove("active");
    radarNav.classList.add("active");
    mapView.classList.add("hidden");
    sidebar.classList.add("hidden");
    radarPanel.classList.remove("hidden");
    drawer.classList.add("hidden");
    renderRadar();
  }
}

function setupEventListeners() {
  // Horizon buttons
  document.querySelectorAll(".horizon-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".horizon-btn").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      currentHorizon = e.target.getAttribute("data-horizon");
      updateMarkerStyles();
      if (selectedAirport) renderDrawer(selectedAirport);
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

  // Filters and search
  document.getElementById("filter-confidence").addEventListener("change", renderMarkers);
  document.getElementById("filter-class").addEventListener("change", renderMarkers);
  const qualFilter = document.getElementById("filter-quality");
  if (qualFilter) qualFilter.addEventListener("change", renderMarkers);
  const qualToggle = document.getElementById("toggle-quality-styling");
  if (qualToggle) qualToggle.addEventListener("change", renderMarkers);
  document.getElementById("search-input").addEventListener("input", renderMarkers);
  document.getElementById("btn-clear-search").addEventListener("click", () => {
    document.getElementById("search-input").value = "";
    renderMarkers();
  });

  // Drawer close
  document.getElementById("drawer-close-btn").addEventListener("click", () => {
    document.getElementById("airport-drawer").classList.add("hidden");
    routeLayerGroup.clearLayers();
    candidateRouteLayerGroup.clearLayers();
  });
}

async function startApp() {
  initMap();
  setupEventListeners();

  const statusEl = document.getElementById("map-status");

  try {
    statusEl.textContent = "Loading forecasts and network data...";
    const [forecasts, opportunities] = await Promise.all([
      fetchJsonWithFallback(["./forecasts.json", "forecasts.json", "../data/outputs/forecasts.json", "/data/outputs/forecasts.json", "data/outputs/forecasts.json"]),
      fetchJsonWithFallback(["./opportunities.json", "opportunities.json", "../data/outputs/opportunities.json", "/data/outputs/opportunities.json", "data/outputs/opportunities.json"]),
    ]);

    airportsData = forecasts.airports || [];
    opportunitiesData = opportunities;

    airportsData.forEach((a) => {
      airportLookup[a.iata] = a;
    });

    renderMarkers();
    statusEl.textContent = `Loaded ${airportsData.length} airports`;
    setTimeout(() => {
      statusEl.style.opacity = "0";
    }, 2000);
  } catch (err) {
    statusEl.textContent = "Error loading data. Verify local server.";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", startApp);
