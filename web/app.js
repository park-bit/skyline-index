// skyline-index - Global Aviation Intelligence Map
// Core map / product module. Exposes a small global API used by assistant.js,
// intel.js and scenario.js (see window.* assignments near the bottom).

let map;
let airportsData = [];
let opportunitiesData = null;
let intelligenceData = null;
let airportMarkers = [];
let airportLookup = {};
let selectedAirport = null;
let selectedCountry = null; // ISO2 when the country panel is open
let currentHorizon = "present"; // 'present', 'h5', 'h10'
let currentTab = "map"; // registry key, see TAB_REGISTRY
let currentRadarView = "airline"; // 'airline', 'investor', 'tourism'
let routeLayerGroup;
let candidateRouteLayerGroup;
let networkShiftLayerGroup;
let markerRenderer;
let networkShiftRenderer;
let vectorBasemapLayer = null;
let tileLayer = null;
let basemapMode = "dark"; // 'dark' | 'light' | 'none'
let showNetworkShifts = false;
let compareAirportA = "SIN";
let compareAirportB = "DXB";
let rankCache = null; // { iata: {present, h5, h10} } computed client-side when data lacks ranks
let resilienceLookup = {};
let continentFilterAvailable = false;
let dataReady = false;

const COLOR_MAP = {
  established_hub: "#FFB020",
  emerging: "#3D9BFF",
  stable: "#3CCB7F",
  declining: "#FF4D6D",
};

const HORIZON_META = {
  present: { year: 2025, short: "Current", chip: "Baseline \u00b7 2025", order: 0 },
  h5: { year: 2030, short: "+5 years", chip: "+5 years \u00b7 2030", order: 1 },
  h10: { year: 2035, short: "+10 years", chip: "+10 years \u00b7 2035", order: 2 },
};
const HORIZON_SEQUENCE = ["present", "h5", "h10"];

const CONTINENT_NAMES = {
  AF: "Africa",
  AN: "Antarctica",
  AS: "Asia",
  EU: "Europe",
  NA: "North America",
  OC: "Oceania",
  SA: "South America",
};

// Compact ISO2 -> "Name|Continent" table. intelligence.json (country_names /
// airport_continent) takes precedence when loaded; this is the offline alias map.
const COUNTRY_TABLE =
  "AD:Andorra:EU,AE:United Arab Emirates:AS,AF:Afghanistan:AS,AG:Antigua and Barbuda:NA,AI:Anguilla:NA,AL:Albania:EU,AM:Armenia:AS,AO:Angola:AF,AQ:Antarctica:AN,AR:Argentina:SA,AS:American Samoa:OC,AT:Austria:EU,AU:Australia:OC,AW:Aruba:NA,AX:Aland Islands:EU,AZ:Azerbaijan:AS," +
  "BA:Bosnia and Herzegovina:EU,BB:Barbados:NA,BD:Bangladesh:AS,BE:Belgium:EU,BF:Burkina Faso:AF,BG:Bulgaria:EU,BH:Bahrain:AS,BI:Burundi:AF,BJ:Benin:AF,BL:Saint Barthelemy:NA,BM:Bermuda:NA,BN:Brunei:AS,BO:Bolivia:SA,BQ:Caribbean Netherlands:NA,BR:Brazil:SA,BS:Bahamas:NA,BT:Bhutan:AS,BW:Botswana:AF,BY:Belarus:EU,BZ:Belize:NA," +
  "CA:Canada:NA,CC:Cocos Islands:AS,CD:DR Congo:AF,CF:Central African Republic:AF,CG:Republic of the Congo:AF,CH:Switzerland:EU,CI:Ivory Coast:AF,CK:Cook Islands:OC,CL:Chile:SA,CM:Cameroon:AF,CN:China:AS,CO:Colombia:SA,CR:Costa Rica:NA,CU:Cuba:NA,CV:Cape Verde:AF,CW:Curacao:NA,CX:Christmas Island:AS,CY:Cyprus:EU,CZ:Czechia:EU," +
  "DE:Germany:EU,DJ:Djibouti:AF,DK:Denmark:EU,DM:Dominica:NA,DO:Dominican Republic:NA,DZ:Algeria:AF,EC:Ecuador:SA,EE:Estonia:EU,EG:Egypt:AF,EH:Western Sahara:AF,ER:Eritrea:AF,ES:Spain:EU,ET:Ethiopia:AF," +
  "FI:Finland:EU,FJ:Fiji:OC,FK:Falkland Islands:SA,FM:Micronesia:OC,FO:Faroe Islands:EU,FR:France:EU,GA:Gabon:AF,GB:United Kingdom:EU,GD:Grenada:NA,GE:Georgia:AS,GF:French Guiana:SA,GG:Guernsey:EU,GH:Ghana:AF,GI:Gibraltar:EU,GL:Greenland:NA,GM:Gambia:AF,GN:Guinea:AF,GP:Guadeloupe:NA,GQ:Equatorial Guinea:AF,GR:Greece:EU,GS:South Georgia:AN,GT:Guatemala:NA,GU:Guam:OC,GW:Guinea-Bissau:AF,GY:Guyana:SA," +
  "HK:Hong Kong:AS,HN:Honduras:NA,HR:Croatia:EU,HT:Haiti:NA,HU:Hungary:EU,ID:Indonesia:AS,IE:Ireland:EU,IL:Israel:AS,IM:Isle of Man:EU,IN:India:AS,IO:British Indian Ocean Territory:AS,IQ:Iraq:AS,IR:Iran:AS,IS:Iceland:EU,IT:Italy:EU,JE:Jersey:EU,JM:Jamaica:NA,JO:Jordan:AS,JP:Japan:AS," +
  "KE:Kenya:AF,KG:Kyrgyzstan:AS,KH:Cambodia:AS,KI:Kiribati:OC,KM:Comoros:AF,KN:Saint Kitts and Nevis:NA,KP:North Korea:AS,KR:South Korea:AS,KW:Kuwait:AS,KY:Cayman Islands:NA,KZ:Kazakhstan:AS,LA:Laos:AS,LB:Lebanon:AS,LC:Saint Lucia:NA,LI:Liechtenstein:EU,LK:Sri Lanka:AS,LR:Liberia:AF,LS:Lesotho:AF,LT:Lithuania:EU,LU:Luxembourg:EU,LV:Latvia:EU,LY:Libya:AF," +
  "MA:Morocco:AF,MC:Monaco:EU,MD:Moldova:EU,ME:Montenegro:EU,MF:Saint Martin:NA,MG:Madagascar:AF,MH:Marshall Islands:OC,MK:North Macedonia:EU,ML:Mali:AF,MM:Myanmar:AS,MN:Mongolia:AS,MO:Macau:AS,MP:Northern Mariana Islands:OC,MQ:Martinique:NA,MR:Mauritania:AF,MS:Montserrat:NA,MT:Malta:EU,MU:Mauritius:AF,MV:Maldives:AS,MW:Malawi:AF,MX:Mexico:NA,MY:Malaysia:AS,MZ:Mozambique:AF," +
  "NA:Namibia:AF,NC:New Caledonia:OC,NE:Niger:AF,NF:Norfolk Island:OC,NG:Nigeria:AF,NI:Nicaragua:NA,NL:Netherlands:EU,NO:Norway:EU,NP:Nepal:AS,NR:Nauru:OC,NU:Niue:OC,NZ:New Zealand:OC,OM:Oman:AS," +
  "PA:Panama:NA,PE:Peru:SA,PF:French Polynesia:OC,PG:Papua New Guinea:OC,PH:Philippines:AS,PK:Pakistan:AS,PL:Poland:EU,PM:Saint Pierre and Miquelon:NA,PN:Pitcairn:OC,PR:Puerto Rico:NA,PS:Palestine:AS,PT:Portugal:EU,PW:Palau:OC,PY:Paraguay:SA,QA:Qatar:AS,RE:Reunion:AF,RO:Romania:EU,RS:Serbia:EU,RU:Russia:EU,RW:Rwanda:AF," +
  "SA:Saudi Arabia:AS,SB:Solomon Islands:OC,SC:Seychelles:AF,SD:Sudan:AF,SE:Sweden:EU,SG:Singapore:AS,SH:Saint Helena:AF,SI:Slovenia:EU,SJ:Svalbard:EU,SK:Slovakia:EU,SL:Sierra Leone:AF,SM:San Marino:EU,SN:Senegal:AF,SO:Somalia:AF,SR:Suriname:SA,SS:South Sudan:AF,ST:Sao Tome and Principe:AF,SV:El Salvador:NA,SX:Sint Maarten:NA,SY:Syria:AS,SZ:Eswatini:AF," +
  "TC:Turks and Caicos Islands:NA,TD:Chad:AF,TF:French Southern Territories:AN,TG:Togo:AF,TH:Thailand:AS,TJ:Tajikistan:AS,TK:Tokelau:OC,TL:Timor-Leste:AS,TM:Turkmenistan:AS,TN:Tunisia:AF,TO:Tonga:OC,TR:Turkey:AS,TT:Trinidad and Tobago:NA,TV:Tuvalu:OC,TW:Taiwan:AS,TZ:Tanzania:AF," +
  "UA:Ukraine:EU,UG:Uganda:AF,UM:US Minor Outlying Islands:OC,US:United States:NA,UY:Uruguay:SA,UZ:Uzbekistan:AS,VA:Vatican City:EU,VC:Saint Vincent and the Grenadines:NA,VE:Venezuela:SA,VG:British Virgin Islands:NA,VI:US Virgin Islands:NA,VN:Vietnam:AS,VU:Vanuatu:OC,WF:Wallis and Futuna:OC,WS:Samoa:OC,XK:Kosovo:EU,YE:Yemen:AS,YT:Mayotte:AF,ZA:South Africa:AF,ZM:Zambia:AF,ZW:Zimbabwe:AF";

const COUNTRY_DB = {};
COUNTRY_TABLE.split(",").forEach((row) => {
  const [iso, name, cont] = row.split(":");
  COUNTRY_DB[iso] = { name, continent: cont };
});
const COUNTRY_ALIASES = {
  "usa": "US", "united states of america": "US", "america": "US", "uk": "GB", "britain": "GB", "great britain": "GB", "england": "GB",
  "uae": "AE", "emirates": "AE", "south korea": "KR", "korea": "KR", "russian federation": "RU", "viet nam": "VN", "czech republic": "CZ",
  "holland": "NL", "burma": "MM", "ivory coast": "CI", "cote d'ivoire": "CI", "swaziland": "SZ", "macedonia": "MK", "congo": "CD", "turkiye": "TR",
};

function countryName(iso) {
  if (!iso) return "";
  if (intelligenceData && intelligenceData.country_names && intelligenceData.country_names[iso]) {
    return intelligenceData.country_names[iso];
  }
  return COUNTRY_DB[iso] ? COUNTRY_DB[iso].name : iso;
}

function continentName(code) {
  if (!code) return "";
  if (intelligenceData && intelligenceData.continent_names && intelligenceData.continent_names[code]) {
    return intelligenceData.continent_names[code];
  }
  return CONTINENT_NAMES[code] || code;
}

function getContinent(ap) {
  if (!ap) return null;
  if (ap.continent) return ap.continent;
  if (intelligenceData && intelligenceData.airport_continent && intelligenceData.airport_continent[ap.iata]) {
    return intelligenceData.airport_continent[ap.iata];
  }
  const row = COUNTRY_DB[ap.country];
  return row ? row.continent : null;
}

function resolveCountryQuery(q) {
  // Returns ISO2 when q is an exact country name / alias / ISO2 (case-insensitive) else null.
  const s = (q || "").trim().toLowerCase();
  if (!s) return null;
  if (COUNTRY_ALIASES[s]) return COUNTRY_ALIASES[s];
  if (s.length === 2) {
    const iso = s.toUpperCase();
    if (COUNTRY_DB[iso] || airportsData.some((a) => a.country === iso)) return iso;
  }
  const names = intelligenceData && intelligenceData.country_names ? intelligenceData.country_names : {};
  for (const iso of Object.keys(names)) {
    if (String(names[iso]).toLowerCase() === s) return iso;
  }
  for (const iso of Object.keys(COUNTRY_DB)) {
    if (COUNTRY_DB[iso].name.toLowerCase() === s) return iso;
  }
  return null;
}

function searchCountries(q, limit) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return [];
  const present = new Set(airportsData.map((a) => a.country).filter(Boolean));
  const out = [];
  const seen = new Set();
  const push = (iso) => {
    if (!iso || seen.has(iso) || !present.has(iso)) return;
    seen.add(iso);
    out.push({ iso, name: countryName(iso) });
  };
  push(COUNTRY_ALIASES[s]);
  if (s.length === 2) push(s.toUpperCase());
  present.forEach((iso) => {
    if (countryName(iso).toLowerCase().startsWith(s)) push(iso);
  });
  present.forEach((iso) => {
    if (countryName(iso).toLowerCase().includes(s)) push(iso);
  });
  return out.slice(0, limit || 2);
}

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

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function prefersReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Map + basemap
// ---------------------------------------------------------------------------

const TILE_URLS = {
  dark: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  light: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
};

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

  // Vector basemap pane sits UNDER the tile pane (tilePane z-index is 200).
  map.createPane("vectorBasemap");
  map.getPane("vectorBasemap").style.zIndex = 150;
  map.getPane("vectorBasemap").style.pointerEvents = "none";

  // Network-shift arcs live in an SVG pane just BELOW the marker canvas (overlayPane = 400)
  // so airports always win hover/click. Arc hover in the gaps between markers is forwarded
  // from the marker canvas (see initArcHoverForwarding).
  map.createPane("networkShifts");
  map.getPane("networkShifts").style.zIndex = 395;

  markerRenderer = L.canvas({ padding: 0.5, tolerance: 3 });
  // SVG renderer for the (at most 150) shift arcs: DOM-inspectable, CSS-stylable hover.
  networkShiftRenderer = L.svg({ pane: "networkShifts", padding: 0.5 });

  let savedBasemap = "dark";
  try {
    savedBasemap = localStorage.getItem("skyline_basemap") || "dark";
  } catch (e) {}
  setBasemap(savedBasemap, { silent: true });

  L.control.zoom({ position: "bottomleft" }).addTo(map);

  routeLayerGroup = L.layerGroup().addTo(map);
  candidateRouteLayerGroup = L.layerGroup().addTo(map);
  networkShiftLayerGroup = L.layerGroup().addTo(map);

  map.on("zoomend", () => {
    if (!horizonAnimation.running) updateMarkerStyles();
  });
  window.map = map;
  markerRenderer.addTo(map); // create the canvas now so hover forwarding can bind to it
  initArcHoverForwarding();
}

// The marker canvas sits on top of the SVG arc pane and swallows pointer events.
// When no marker is under the cursor, hit-test the arcs with elementsFromPoint and
// relay mouseover/mouseout to the Leaflet layer so its tooltip opens.
let hoveredArcLayer = null;
function initArcHoverForwarding() {
  const container = markerRenderer && markerRenderer._container;
  if (!container || !document.elementsFromPoint) return;
  const leaveArc = () => {
    if (hoveredArcLayer) {
      hoveredArcLayer.fire("mouseout", {}, true);
      hoveredArcLayer = null;
    }
  };
  container.addEventListener("mousemove", (e) => {
    if (markerRenderer._hoveredLayer || !showNetworkShifts) {
      leaveArc();
      return;
    }
    const pathEl = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.classList && el.classList.contains("network-shift-arc"));
    const layer = pathEl ? pathEl.__skylineLayer : null;
    if (layer !== hoveredArcLayer) {
      leaveArc();
      if (layer) {
        hoveredArcLayer = layer;
        const containerPoint = map.mouseEventToContainerPoint(e);
        const latlng = map.containerPointToLatLng(containerPoint);
        layer.fire("mouseover", { latlng, containerPoint, layerPoint: map.containerPointToLayerPoint(containerPoint), originalEvent: e }, true);
      }
    } else if (layer && layer.getTooltip && layer.getTooltip()) {
      const containerPoint = map.mouseEventToContainerPoint(e);
      layer.fire("mousemove", { latlng: map.containerPointToLatLng(containerPoint), containerPoint, originalEvent: e }, true);
    }
  });
  container.addEventListener("mouseleave", leaveArc);
}

function vectorBasemapStyle() {
  if (basemapMode === "light") {
    return { fillColor: "#e6e9ee", fillOpacity: 1, color: "#c9ced6", weight: 0.6, opacity: 1 };
  }
  return { fillColor: "#151b24", fillOpacity: 1, color: "rgba(236, 230, 217, 0.14)", weight: 0.6, opacity: 1 };
}

async function loadVectorBasemap() {
  try {
    const geo = await fetchJsonWithFallback(["./vendor/world-110m.geojson", "vendor/world-110m.geojson"]);
    if (!geo || !geo.type) return;
    vectorBasemapLayer = L.geoJSON(geo, {
      pane: "vectorBasemap",
      interactive: false,
      style: vectorBasemapStyle,
      renderer: L.canvas({ pane: "vectorBasemap", padding: 0.5 }),
    }).addTo(map);
    document.body.classList.add("has-vector-basemap");
  } catch (e) {
    // Offline fallback unavailable; tiles (if reachable) still render.
  }
}

function setBasemap(mode, opts) {
  const options = opts || {};
  if (!["dark", "light", "none"].includes(mode)) mode = "dark";
  basemapMode = mode;
  if (tileLayer) {
    map.removeLayer(tileLayer);
    tileLayer = null;
  }
  if (mode !== "none") {
    tileLayer = L.tileLayer(TILE_URLS[mode], {
      attribution: "Tiles &copy; Esri - Esri, DeLorme, NAVTEQ",
      maxZoom: 16,
    }).addTo(map);
  }
  document.body.classList.toggle("basemap-light", mode === "light");
  document.body.classList.toggle("basemap-none", mode === "none");
  if (vectorBasemapLayer) vectorBasemapLayer.setStyle(vectorBasemapStyle());
  const sel = document.getElementById("basemap-select");
  if (sel && sel.value !== mode) sel.value = mode;
  if (!options.silent) {
    try {
      localStorage.setItem("skyline_basemap", mode);
    } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// Score / class helpers
// ---------------------------------------------------------------------------

let selectedHaloMarker = null;

function getDampingAlpha() {
  if (intelligenceData && intelligenceData.horizon10_shrinkage && intelligenceData.horizon10_shrinkage.best_alpha != null) {
    return intelligenceData.horizon10_shrinkage.best_alpha;
  }
  if (window.forecastsMeta && window.forecastsMeta.horizon10_evaluation && window.forecastsMeta.horizon10_evaluation.damping_factor != null) {
    return window.forecastsMeta.horizon10_evaluation.damping_factor;
  }
  return null;
}

// --- 2035 estimate mode -----------------------------------------------------
// 'damped' (default): validated shrinkage toward persistence (level_damped/change_damped,
// α from intelligence.horizon10_shrinkage). 'raw': the undamped ensemble output.
// EVERY read of a horizon-10 value goes through getH10().
let h10Mode = "damped";
try {
  const savedMode = localStorage.getItem("skyline_h10_mode");
  if (savedMode === "raw" || savedMode === "damped") h10Mode = savedMode;
} catch (e) {}
window.SKYLINE_H10_MODE = h10Mode;

function getH10(ap) {
  const cur = ap ? ap.importance_present || 0 : 0;
  const f = ap && ap.forecast_h10 ? ap.forecast_h10 : null;
  if (!f) return { level: cur, change: 0, class: "stable", mode: h10Mode, damped: false };
  const canDamp = f.level_damped != null;
  const useDamped = h10Mode === "damped" && canDamp;
  const level = useDamped ? f.level_damped : f.level != null ? f.level : cur;
  let change;
  if (useDamped) change = f.change_damped != null ? f.change_damped : level - cur;
  else change = f.change != null ? f.change : level - cur;
  return { level, change, class: f.class || "stable", mode: h10Mode, damped: useDamped };
}

function hasDampedH10(ap) {
  // true when the value shown for 2035 is the damped one (so UI shows the α note)
  return getH10(ap).damped;
}

function getH10Level(ap) {
  return getH10(ap).level;
}

function getH10Change(ap) {
  return getH10(ap).change;
}

function setH10Mode(mode, opts) {
  const options = opts || {};
  if (mode !== "raw" && mode !== "damped") mode = "damped";
  const changed = mode !== h10Mode;
  h10Mode = mode;
  window.SKYLINE_H10_MODE = mode;
  try {
    localStorage.setItem("skyline_h10_mode", mode);
  } catch (e) {}
  const sel = document.getElementById("h10-mode-select");
  if (sel && sel.value !== mode) sel.value = mode;
  if (!dataReady) return;
  rankCache = null; // client-side ranks depend on the h10 level
  updateMarkerStyles(); // markers + stats
  if (selectedCountry) renderCountryCard(selectedCountry);
  else if (selectedAirport && document.getElementById("airport-card") && document.getElementById("airport-card").style.display !== "none") renderAirportCard(selectedAirport);
  if (selectedAirport && routeLayerGroup && routeLayerGroup.getLayers().length > 0) drawAirportRoutes(selectedAirport);
  if (showNetworkShifts) drawNetworkShifts();
  if (document.getElementById("compare-overlay") && document.getElementById("compare-overlay").style.display !== "none") renderCompareDrawer();
  if (!options.silent) {
    try {
      document.dispatchEvent(new CustomEvent("skyline:h10mode", { detail: { mode, changed, alpha: getDampingAlpha() } }));
    } catch (e) {}
  }
}

function updateH10ModeSelect() {
  const sel = document.getElementById("h10-mode-select");
  if (!sel) return;
  const alpha = getDampingAlpha();
  const opt = sel.querySelector('option[value="damped"]');
  if (opt) opt.textContent = `Validated (damped${alpha != null ? ", α=" + alpha : ""})`;
  sel.value = h10Mode;
}

function getAirportScore(airport, horizon) {
  if (horizon === "present") return airport.importance_present;
  if (horizon === "h5" && airport.forecast_h5) return airport.forecast_h5.level;
  if (horizon === "h10" && airport.forecast_h10) return getH10Level(airport);
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

function radiusForScore(score, cls, zoom) {
  const currentZoom = zoom != null ? zoom : (map ? map.getZoom() : 3);
  const zoomBonus = Math.max(0, currentZoom - 3) * 1.0;
  const hubBonus = cls === "established_hub" ? 2.5 : 0.0;
  const baseRadius = 2.0 + (score / 100.0) * 5.0 + hubBonus;
  return Math.min(15.0, baseRadius + zoomBonus);
}

function getAirportRadius(airport, horizon) {
  return radiusForScore(getAirportScore(airport, horizon), getAirportClass(airport, horizon));
}

function getDataQuality(ap) {
  return ap.data_quality || (ap.importance_confidence === "high" ? "observed" : "static_only");
}

function getMarkerStyle(airport, color, useQualityStyling, clsOverride) {
  const cls = clsOverride || getAirportClass(airport, currentHorizon);
  const dim = selectedCountry && airport.country !== selectedCountry ? 0.35 : 1.0;
  if (cls === "declining") {
    return {
      fillColor: "transparent",
      color: color,
      weight: 2.0,
      opacity: 0.95 * dim,
      fillOpacity: 0.0,
    };
  }

  const dq = getDataQuality(airport);

  if (!useQualityStyling) {
    return { fillColor: color, color: "#ffffff", weight: 1.0, opacity: 0.85 * dim, fillOpacity: 0.65 * dim };
  }
  if (dq === "observed") {
    return { fillColor: color, color: "#ffffff", weight: 1.0, opacity: 0.75 * dim, fillOpacity: 0.65 * dim };
  } else if (dq === "reconstructed") {
    return { fillColor: color, color: "#e8edf4", weight: 1.0, opacity: 0.6 * dim, fillOpacity: 0.45 * dim };
  }
  // static_only: minimal fill
  return { fillColor: color, color: color, weight: 1.0, opacity: 0.85 * dim, fillOpacity: 0.15 * dim };
}

function getRank(ap, horizon) {
  if (!ap) return null;
  const key = horizon === "present" ? "rank_present" : horizon === "h5" ? "rank_h5" : "rank_h10";
  if (ap[key] != null) return ap[key];
  if (intelligenceData && intelligenceData.ranks && intelligenceData.ranks[ap.iata]) {
    const r = intelligenceData.ranks[ap.iata][horizon];
    if (r != null) return r;
  }
  if (!rankCache) computeRanks();
  const row = rankCache[ap.iata];
  return row ? row[horizon] : null;
}

function computeRanks() {
  rankCache = {};
  HORIZON_SEQUENCE.forEach((h) => {
    const sorted = airportsData.slice().sort((a, b) => getAirportScore(b, h) - getAirportScore(a, h));
    sorted.forEach((ap, i) => {
      if (!rankCache[ap.iata]) rankCache[ap.iata] = {};
      rankCache[ap.iata][h] = i + 1;
    });
  });
}

function getResilience(ap) {
  return ap ? resilienceLookup[ap.iata] || null : null;
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
    renderer: markerRenderer,
  }).addTo(map);
  selectedHaloMarker.bringToBack();
}

// ---------------------------------------------------------------------------
// Filters, statistics, markers
// ---------------------------------------------------------------------------

let queryCountryCache = { q: null, iso: null };
function airportMatchesQuery(ap, query) {
  if (!query) return true;
  if (queryCountryCache.q !== query) queryCountryCache = { q: query, iso: resolveCountryQuery(query) };
  if (queryCountryCache.iso) {
    // Exact country name / ISO2 query: match that country only (plus an exact IATA hit)
    return ap.country === queryCountryCache.iso || ap.iata.toLowerCase() === query;
  }
  if (ap.iata.toLowerCase().includes(query)) return true;
  if (ap.name.toLowerCase().includes(query)) return true;
  if (ap.city && ap.city.toLowerCase().includes(query)) return true;
  if (ap.country) {
    if (ap.country.toLowerCase() === query) return true;
    if (countryName(ap.country).toLowerCase().includes(query)) return true;
  }
  return false;
}

function getVisibleAirports() {
  const enabledClasses = Array.from(document.querySelectorAll("#class-filters-list input:checked")).map((el) => el.value);
  const qualFilter = document.getElementById("filter-quality") ? document.getElementById("filter-quality").value : "all";
  const confFilter = document.getElementById("filter-confidence") ? document.getElementById("filter-confidence").value : "all";
  const regionEl = document.getElementById("filter-region");
  const regionFilter = regionEl && continentFilterAvailable ? regionEl.value : "all";
  const searchInput = document.getElementById("search-input");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  return airportsData.filter((ap) => {
    if (ap.latitude == null || ap.longitude == null) return false;

    const activeClass = getAirportClass(ap, currentHorizon);
    if (!enabledClasses.includes(activeClass)) return false;

    const dq = getDataQuality(ap);
    if (qualFilter !== "all" && dq !== qualFilter) return false;

    if (confFilter !== "all" && ap.importance_confidence !== confFilter) return false;

    if (regionFilter !== "all" && getContinent(ap) !== regionFilter) return false;

    if (query && !airportMatchesQuery(ap, query)) return false;

    return true;
  });
}

const countUpState = {};
function animateCount(el, target) {
  if (!el) return;
  const id = el.id || Math.random().toString(36);
  const from = countUpState[id] != null ? countUpState[id] : 0;
  countUpState[id] = target;
  if (from === target) {
    el.textContent = target;
    return;
  }
  if (prefersReducedMotion()) {
    el.textContent = target;
    return;
  }
  const start = performance.now();
  const duration = 650;
  const token = (el._countToken = (el._countToken || 0) + 1);
  const step = (now) => {
    if (el._countToken !== token) return;
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (target - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateStatistics() {
  const visible = getVisibleAirports();
  let emergingCount = 0, hubCount = 0, decliningCount = 0;
  visible.forEach((a) => {
    const c = getAirportClass(a, currentHorizon);
    if (c === "emerging") emergingCount++;
    else if (c === "established_hub") hubCount++;
    else if (c === "declining") decliningCount++;
  });

  animateCount(document.getElementById("stat-airports-count"), visible.length);
  animateCount(document.getElementById("stat-emerging-count"), emergingCount);
  animateCount(document.getElementById("stat-hubs-count"), hubCount);
  animateCount(document.getElementById("stat-declining-count"), decliningCount);

  const statYear = document.getElementById("stat-horizon-year");
  if (statYear) statYear.textContent = String(HORIZON_META[currentHorizon].year);
  const statLabel = document.getElementById("stat-horizon-label");
  if (statLabel) statLabel.textContent = currentHorizon === "present" ? "Current baseline" : `Forecast ${HORIZON_META[currentHorizon].short}`;

  const legendViewCount = document.getElementById("legend-view-count");
  if (legendViewCount) legendViewCount.textContent = `${visible.length} airports in view`;

  const mobileCount = document.getElementById("mobile-filter-count");
  if (mobileCount) mobileCount.textContent = `(${visible.length})`;

  // Update counts per class in filter checkboxes
  const totals = { established_hub: 0, emerging: 0, stable: 0, declining: 0 };
  airportsData.forEach((a) => {
    const c = getAirportClass(a, currentHorizon);
    if (totals[c] != null) totals[c]++;
  });
  const setText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  setText("count-hub", totals.established_hub);
  setText("count-emerging", totals.emerging);
  setText("count-stable", totals.stable);
  setText("count-declining", totals.declining);
}

function markerTooltipHtml(ap, horizon) {
  const dq = getDataQuality(ap);
  const scoreVal = getAirportScore(ap, horizon).toFixed(1);
  const rank = getRank(ap, horizon);
  return `<b>${escapeHtml(ap.iata)}</b> : ${escapeHtml(ap.city || ap.name)} (${scoreVal})${rank ? ` #${rank}` : ""} [${dq}]`;
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
      renderer: markerRenderer,
      ...styleOpts,
    });

    marker.airportData = ap;
    marker.on("click", () => selectAirport(ap));
    // Content is a function: evaluated lazily on hover for the active horizon.
    marker.bindTooltip(() => markerTooltipHtml(ap, currentHorizon), { direction: "top", offset: [0, -radius] });

    marker.addTo(map);
    airportMarkers.push(marker);
  });

  if (selectedAirport) updateSelectedHalo(selectedAirport);

  updateStatistics();
  if (showNetworkShifts) drawNetworkShifts();
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
  });

  if (selectedAirport) updateSelectedHalo(selectedAirport);

  updateStatistics();
}

// ---------------------------------------------------------------------------
// Horizon control + time-lapse animation
// ---------------------------------------------------------------------------

const horizonAnimation = { running: false, raf: null, loop: false, timer: null };

function setHorizonButtonsState(h) {
  document.querySelectorAll(".horizon-option").forEach((b) => {
    const isActive = b.getAttribute("data-horizon") === h;
    b.classList.toggle("selected", isActive);
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  const statusChip = document.getElementById("horizon-status-chip");
  if (statusChip) statusChip.textContent = HORIZON_META[h].chip;
  const yearLabel = document.getElementById("horizon-year-label");
  if (yearLabel) yearLabel.textContent = String(HORIZON_META[h].year);
}

function setHorizon(h, opts) {
  const options = opts || {};
  if (!HORIZON_META[h]) return;
  currentHorizon = h;
  setHorizonButtonsState(h);
  if (!options.skipMarkers) updateMarkerStyles();
  if (selectedAirport && !selectedCountry) renderAirportCard(selectedAirport);
  if (selectedCountry) renderCountryCard(selectedCountry);
  if (selectedAirport && routeLayerGroup && routeLayerGroup.getLayers().length > 0) drawAirportRoutes(selectedAirport);
  if (showNetworkShifts) drawNetworkShifts();
  updateNetworkShiftHint();
  updateUrlState();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function animateHorizonTransition(from, to, duration, onDone) {
  const useQualityStyling = document.getElementById("toggle-quality-styling")
    ? document.getElementById("toggle-quality-styling").checked
    : true;
  const zoom = map.getZoom();
  const frames = airportMarkers.map((m) => {
    const ap = m.airportData;
    const s0 = getAirportScore(ap, from), s1 = getAirportScore(ap, to);
    const c0 = getAirportClass(ap, from), c1 = getAirportClass(ap, to);
    return {
      m,
      ap,
      r0: radiusForScore(s0, c0, zoom),
      r1: radiusForScore(s1, c1, zoom),
      c0,
      c1,
      style0: getMarkerStyle(ap, COLOR_MAP[c0] || COLOR_MAP.stable, useQualityStyling, c0),
      style1: getMarkerStyle(ap, COLOR_MAP[c1] || COLOR_MAP.stable, useQualityStyling, c1),
      switched: false,
    };
  });
  const y0 = HORIZON_META[from].year, y1 = HORIZON_META[to].year;
  const yearLabel = document.getElementById("horizon-year-label");
  const statYear = document.getElementById("stat-horizon-year");
  const start = performance.now();
  let lastFrame = 0;

  const step = (now) => {
    if (!horizonAnimation.running) return;
    const t = Math.min(1, (now - start) / duration);
    if (now - lastFrame >= 28 || t >= 1) {
      lastFrame = now;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const year = Math.round(lerp(y0, y1, eased));
      if (yearLabel) yearLabel.textContent = String(year);
      if (statYear) statYear.textContent = String(year);
      // Fast path: write radii directly and redraw the canvas renderer once per
      // frame (setRadius() would request a redraw + bounds update per marker).
      // The exact styles/bounds are restored by updateMarkerStyles() on completion.
      let styleSwitched = false;
      frames.forEach((f) => {
        f.m._radius = lerp(f.r0, f.r1, eased);
        if (!f.switched && eased >= 0.5 && f.c0 !== f.c1) {
          f.switched = true;
          styleSwitched = true;
          L.Util.setOptions(f.m, f.style1);
        }
      });
      if (markerRenderer && typeof markerRenderer._redraw === "function") {
        markerRenderer._redrawBounds = null;
        markerRenderer._redraw();
      } else {
        frames.forEach((f) => f.m.setRadius(f.m._radius));
      }
      if (styleSwitched && selectedHaloMarker) updateSelectedHalo(selectedAirport);
    }
    if (t < 1) {
      horizonAnimation.raf = requestAnimationFrame(step);
    } else {
      onDone();
    }
  };
  horizonAnimation.raf = requestAnimationFrame(step);
}

function playHorizonTimelapse() {
  if (horizonAnimation.running) {
    stopHorizonTimelapse();
    return;
  }
  horizonAnimation.running = true;
  horizonAnimation.loop = !!(document.getElementById("toggle-loop-timelapse") && document.getElementById("toggle-loop-timelapse").checked);
  const playBtn = document.getElementById("btn-horizon-play");
  if (playBtn) {
    playBtn.classList.add("playing");
    playBtn.setAttribute("aria-pressed", "true");
    playBtn.setAttribute("aria-label", "Pause time-lapse");
    playBtn.innerHTML = PAUSE_ICON + "<span>Pause</span>";
  }
  document.body.classList.add("timelapse-playing");

  const stepDuration = prefersReducedMotion() ? 50 : 2500;
  const holdMs = prefersReducedMotion() ? 1200 : 500;

  const runStep = () => {
    if (!horizonAnimation.running) return;
    const idx = HORIZON_SEQUENCE.indexOf(currentHorizon);
    let nextIdx = idx + 1;
    if (nextIdx >= HORIZON_SEQUENCE.length) {
      if (!horizonAnimation.loop) {
        stopHorizonTimelapse();
        return;
      }
      // Loop: jump back to present quickly, then continue.
      setHorizon("present");
      nextIdx = 1;
      horizonAnimation.timer = setTimeout(runStep, holdMs);
      return;
    }
    const from = HORIZON_SEQUENCE[idx];
    const to = HORIZON_SEQUENCE[nextIdx];
    animateHorizonTransition(from, to, stepDuration, () => {
      if (!horizonAnimation.running) return;
      setHorizon(to);
      horizonAnimation.timer = setTimeout(runStep, holdMs);
    });
  };
  // If already at the end, restart from present.
  if (currentHorizon === "h10") setHorizon("present");
  horizonAnimation.timer = setTimeout(runStep, 50);
}

function stopHorizonTimelapse() {
  horizonAnimation.running = false;
  if (horizonAnimation.raf) cancelAnimationFrame(horizonAnimation.raf);
  if (horizonAnimation.timer) clearTimeout(horizonAnimation.timer);
  horizonAnimation.raf = null;
  horizonAnimation.timer = null;
  const playBtn = document.getElementById("btn-horizon-play");
  if (playBtn) {
    playBtn.classList.remove("playing");
    playBtn.setAttribute("aria-pressed", "false");
    playBtn.setAttribute("aria-label", "Play time-lapse 2025 to 2035");
    playBtn.innerHTML = PLAY_ICON + "<span>Play</span>";
  }
  document.body.classList.remove("timelapse-playing");
  // Snap markers back to the exact horizon state
  setHorizonButtonsState(currentHorizon);
  updateMarkerStyles();
}

const PLAY_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><rect x="5" y="3" width="5" height="18"/><rect x="14" y="3" width="5" height="18"/></svg>';

// ---------------------------------------------------------------------------
// Geodesic helpers
// ---------------------------------------------------------------------------

// Returns an array of segments (each an array of [lat, lon]) along the great
// circle between two points, split at the antimeridian.
function geodesicSegments(lat1, lon1, lat2, lon2, n) {
  const steps = n || 32;
  const toR = Math.PI / 180, toD = 180 / Math.PI;
  const p1 = lat1 * toR, l1 = lon1 * toR, p2 = lat2 * toR, l2 = lon2 * toR;
  const sinHalf = Math.sqrt(
    Math.pow(Math.sin((p1 - p2) / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin((l1 - l2) / 2), 2)
  );
  const d = 2 * Math.asin(Math.min(1, sinHalf));
  const pts = [];
  if (d < 1e-7) {
    pts.push([lat1, lon1], [lat2, lon2]);
  } else {
    const sinD = Math.sin(d);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const A = Math.sin((1 - f) * d) / sinD;
      const B = Math.sin(f * d) / sinD;
      const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
      const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
      const z = A * Math.sin(p1) + B * Math.sin(p2);
      pts.push([Math.atan2(z, Math.sqrt(x * x + y * y)) * toD, Math.atan2(y, x) * toD]);
    }
  }
  // Split at antimeridian
  const segments = [];
  let current = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    if (Math.abs(cur[1] - prev[1]) > 180) {
      const sign = prev[1] > 0 ? 1 : -1;
      const unwrappedCur = cur[1] + sign * 360;
      const f = (sign * 180 - prev[1]) / (unwrappedCur - prev[1]);
      const latX = prev[0] + (cur[0] - prev[0]) * f;
      current.push([latX, sign * 180]);
      segments.push(current);
      current = [[latX, -sign * 180], cur];
    } else {
      current.push(cur);
    }
  }
  segments.push(current);
  return segments;
}

function geodesicPolyline(a, b, style, n) {
  const segs = geodesicSegments(a.latitude, a.longitude, b.latitude, b.longitude, n);
  return L.polyline(segs.length === 1 ? segs[0] : segs, style);
}

// ---------------------------------------------------------------------------
// Routes and network shifts
// ---------------------------------------------------------------------------

function selectAirport(ap, opts) {
  if (!ap) return;
  if (typeof ap === "string") ap = airportLookup[ap.toUpperCase()];
  if (!ap) return;
  const options = opts || {};
  closeCountryCard({ keepSelection: true });
  selectedAirport = ap;
  renderAirportCard(ap);
  drawAirportRoutes(ap);
  updateSelectedHalo(ap);

  const summary = document.getElementById("selected-summary");
  if (summary) summary.style.display = "none";

  if (!options.noPan && ap.latitude != null && ap.longitude != null) {
    map.panTo([ap.latitude, ap.longitude], { animate: true, duration: 0.5 });
  }
  updateUrlState();
}

function drawAirportRoutes(ap) {
  routeLayerGroup.clearLayers();
  candidateRouteLayerGroup.clearLayers();

  if (!ap || !ap.routes || ap.routes.length === 0) return;

  ap.routes.forEach((destIata) => {
    const dest = airportLookup[destIata];
    if (dest && dest.latitude != null && dest.longitude != null) {
      // Same canvas renderer as the markers, sent to the back: drawn under markers and
      // hit-tested after them, so airports remain clickable where arcs cross.
      const line = geodesicPolyline(ap, dest, { renderer: markerRenderer, color: "#F2A93B", weight: 1.4, opacity: 0.5, interactive: true, bubblingMouseEvents: false }, 32);
      const partnerScore = getAirportScore(dest, currentHorizon).toFixed(1);
      const partnerClass = getAirportClass(dest, currentHorizon).replace("_", " ");
      line.bindTooltip(
        `<b>${escapeHtml(ap.iata)} &rarr; ${escapeHtml(dest.iata)}</b> ${escapeHtml(dest.name)}<br>` +
          `${escapeHtml(dest.city || "")}${dest.city ? ", " : ""}${escapeHtml(countryName(dest.country))} &middot; ` +
          `score ${partnerScore} (${HORIZON_META[currentHorizon].year}) &middot; ${partnerClass}`,
        { sticky: true, direction: "top", className: "route-tooltip" }
      );
      line.on("mouseover", () => line.setStyle({ weight: 2.6, opacity: 0.95 }));
      line.on("mouseout", () => line.setStyle({ weight: 1.4, opacity: 0.5 }));
      line.on("click", () => selectAirport(dest));
      line.addTo(routeLayerGroup);
      line.bringToBack();
    }
  });
}

let networkShiftCache = null;
function computeTopRoutes() {
  if (networkShiftCache) return networkShiftCache;
  const seen = new Set();
  const pairs = [];
  airportsData.forEach((a) => {
    if (!a.routes || a.latitude == null) return;
    a.routes.forEach((iata) => {
      const b = airportLookup[iata];
      if (!b || b.latitude == null) return;
      const key = a.iata < b.iata ? a.iata + "-" + b.iata : b.iata + "-" + a.iata;
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push({ a, b, weight: a.importance_present + b.importance_present });
    });
  });
  pairs.sort((x, y) => y.weight - x.weight);
  networkShiftCache = pairs.slice(0, NETWORK_SHIFT_POOL);
  return networkShiftCache;
}

const NETWORK_SHIFT_POOL = 600; // candidate routes by combined endpoint importance
const NETWORK_SHIFT_SHOWN = 150; // of which the largest projected shifts are drawn

function selectShiftRoutes(horizon) {
  const pool = computeTopRoutes().map((r) => {
    const present = r.a.importance_present + r.b.importance_present;
    const future = getAirportScore(r.a, horizon) + getAirportScore(r.b, horizon);
    return { a: r.a, b: r.b, weight: r.weight, present, future, delta: future - present };
  });
  pool.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || y.weight - x.weight);
  return pool.slice(0, NETWORK_SHIFT_SHOWN);
}

function drawNetworkShifts() {
  hoveredArcLayer = null;
  networkShiftLayerGroup.clearLayers();
  if (!showNetworkShifts || currentHorizon === "present" || !dataReady) {
    updateNetworkShiftLegend(null);
    return;
  }
  const routes = selectShiftRoutes(currentHorizon);
  let rising = 0, falling = 0, flat = 0;
  routes.forEach(({ a, b, present, future, delta }) => {
    // Below 0.1 pts the model is effectively flat: show neutral rather than a misleading sign.
    const state = Math.abs(delta) < 0.1 ? "flat" : delta > 0 ? "rising" : "falling";
    if (state === "rising") rising++;
    else if (state === "falling") falling++;
    else flat++;
    const magnitude = Math.min(1, Math.abs(delta) / 6);
    const line = geodesicPolyline(
      a,
      b,
      {
        pane: "networkShifts",
        renderer: networkShiftRenderer,
        color: NETWORK_SHIFT_COLORS[state],
        weight: state === "flat" ? 1 : 1.2 + magnitude * 1.8,
        opacity: state === "flat" ? 0.35 : 0.5 + magnitude * 0.45,
        interactive: true,
        bubblingMouseEvents: false,
        className: "network-shift-arc",
      },
      32
    );
    line.bindTooltip(
      `<b>${escapeHtml(a.iata)} &harr; ${escapeHtml(b.iata)}</b> ${escapeHtml(a.city || a.name)} &ndash; ${escapeHtml(b.city || b.name)}<br>` +
        `combined importance ${present.toFixed(1)} &rarr; ${future.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}) by ${HORIZON_META[currentHorizon].year}`,
      { sticky: true, direction: "top", className: "route-tooltip" }
    );
    line.addTo(networkShiftLayerGroup);
    if (line._path) line._path.__skylineLayer = line;
  });
  updateNetworkShiftLegend({ rising, falling, flat, total: routes.length });
}

const NETWORK_SHIFT_COLORS = { rising: "#3CCB7F", falling: "#FF4D6D", flat: "#8E96A3" };

function updateNetworkShiftLegend(stats) {
  const block = document.getElementById("legend-network-block");
  if (!block) return;
  if (!stats) {
    block.style.display = "none";
    requestAnimationFrame(layoutLeftPanel);
    return;
  }
  block.style.display = "block";
  requestAnimationFrame(layoutLeftPanel);
  const el = document.getElementById("legend-network-stats");
  if (el) el.textContent = `${stats.total} largest shifts of top ${NETWORK_SHIFT_POOL} routes, ${HORIZON_META[currentHorizon].year}: ${stats.rising} up, ${stats.falling} down, ${stats.flat} flat`;
}

function updateNetworkShiftHint() {
  const hint = document.getElementById("network-shift-hint");
  if (!hint) return;
  if (!showNetworkShifts) {
    hint.textContent = "Great-circle arcs for the 150 routes whose combined endpoint importance shifts most (of the 600 most important), coloured by direction.";
  } else if (currentHorizon === "present") {
    hint.textContent = "Switch to +5 or +10 years to see projected route shifts.";
  } else {
    hint.textContent = `Green arcs rise, red arcs fall, grey stay within 0.1 pts in combined endpoint importance by ${HORIZON_META[currentHorizon].year}.`;
  }
}

function setNetworkShifts(on) {
  showNetworkShifts = !!on;
  const toggle = document.getElementById("toggle-network-shifts");
  if (toggle && toggle.checked !== showNetworkShifts) toggle.checked = showNetworkShifts;
  drawNetworkShifts();
  updateNetworkShiftHint();
  updateUrlState();
}

// ---------------------------------------------------------------------------
// Trend sparkline
// ---------------------------------------------------------------------------

function renderTrendSvg(ap, opts) {
  const options = opts || {};
  const cur = ap.importance_present;
  const h5Level = ap.forecast_h5 ? ap.forecast_h5.level : cur;
  const h10Level = getH10Level(ap);

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

  // Auto-scale the y axis around the data so flat trajectories remain readable
  const allVals = [cur, h5Level, h10Level, band0Lo, band0Hi, band1Lo, band1Hi, band2Lo, band2Hi];
  let yMin = Math.min.apply(null, allVals), yMax = Math.max.apply(null, allVals);
  const pad = Math.max(2.0, (yMax - yMin) * 0.25);
  yMin = Math.max(0, yMin - pad);
  yMax = Math.min(100, yMax + pad);
  if (yMax - yMin < 6) {
    const mid = (yMax + yMin) / 2;
    yMin = Math.max(0, mid - 3);
    yMax = Math.min(100, mid + 3);
  }
  function getY(score) {
    const clamped = Math.max(yMin, Math.min(yMax, score));
    return 102 - ((clamped - yMin) / (yMax - yMin)) * 82;
  }

  const x0 = 24, x1 = 140, x2 = 256;
  const y0 = getY(cur), y1 = getY(h5Level), y2 = getY(h10Level);
  const y0Hi = getY(band0Hi), y0Lo = getY(band0Lo);
  const y1Hi = getY(band1Hi), y1Lo = getY(band1Lo);
  const y2Hi = getY(band2Hi), y2Lo = getY(band2Lo);

  const bandPath = `M ${x0} ${y0Hi.toFixed(1)} L ${x1} ${y1Hi.toFixed(1)} L ${x2} ${y2Hi.toFixed(1)} L ${x2} ${y2Lo.toFixed(1)} L ${x1} ${y1Lo.toFixed(1)} L ${x0} ${y0Lo.toFixed(1)} Z`;
  const linePath = `M ${x0} ${y0.toFixed(1)} L ${x1} ${y1.toFixed(1)} L ${x2} ${y2.toFixed(1)}`;

  const h5Coverage = ap.forecast_h5 && ap.forecast_h5.coverage_pct != null ? ap.forecast_h5.coverage_pct : 80;
  const h10Coverage = ap.forecast_h10 && ap.forecast_h10.coverage_pct != null ? ap.forecast_h10.coverage_pct : 32.3;

  const h5Label = h5Coverage < 70 ? "rough range" : (ap.forecast_h5 && ap.forecast_h5.band_label ? ap.forecast_h5.band_label.toLowerCase() : "calibrated interval");
  const h10Label = h10Coverage < 70 ? "indicative only" : (ap.forecast_h10 && ap.forecast_h10.band_label ? ap.forecast_h10.band_label.toLowerCase() : "calibrated interval");
  const alpha = getDampingAlpha();
  const dampedNote = hasDampedH10(ap) ? `<span class="damped-note" title="Horizon-10 level shrunk toward persistence with damping factor ${alpha != null ? "α=" + alpha : "α"}">damped${alpha != null ? ` (α=${alpha})` : ""}</span>` : "";
  const activeIdx = HORIZON_META[currentHorizon].order;

  return `
    <div class="trend">
      <svg viewBox="0 0 280 120" role="img" aria-label="Scores: 2025 ${cur.toFixed(1)}, 2030 ${h5Level.toFixed(1)}, 2035 ${h10Level.toFixed(1)}">
        <line class="chart-grid" x1="20" y1="36" x2="260" y2="36" />
        <line class="chart-grid" x1="20" y1="72" x2="260" y2="72" />
        <text class="chart-axis" x="262" y="24">${yMax.toFixed(0)}</text>
        <text class="chart-axis" x="262" y="105">${yMin.toFixed(0)}</text>
        <path class="chart-band" d="${bandPath}" />
        <path class="chart-line" d="${linePath}" />
        <circle class="chart-point ${activeIdx === 0 ? "is-active" : ""}" cx="${x0}" cy="${y0.toFixed(1)}" r="4.5" />
        <circle class="chart-point ${activeIdx === 1 ? "is-active" : ""}" cx="${x1}" cy="${y1.toFixed(1)}" r="4.5" />
        <circle class="chart-point ${activeIdx === 2 ? "is-active" : ""}" cx="${x2}" cy="${y2.toFixed(1)}" r="4.5" />
      </svg>
      <div class="forecast-ticks">
        <span><strong>${cur.toFixed(1)}</strong>2025 &middot; now</span>
        <span><strong>${h5Level.toFixed(1)}</strong>2030 &middot; +5y</span>
        <span><strong>${h10Level.toFixed(1)}</strong>2035 &middot; +10y</span>
      </div>
      <div class="forecast-ranges">
        <span>${options.compact ? "" : "baseline"}</span>
        <span>${h5Label}</span>
        <span>${h10Label}${dampedNote ? " &middot; " + dampedNote : ""}</span>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Airport dossier
// ---------------------------------------------------------------------------

function formatDriver(d) {
  const s = String(d || "").replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rankBadgeHtml(ap) {
  const rPresent = getRank(ap, "present");
  const rActive = getRank(ap, currentHorizon);
  const rH10 = getRank(ap, "h10");
  if (rPresent == null) return "";
  const total = airportsData.length;
  let arrow = "";
  const ref = currentHorizon === "present" ? rH10 : rActive;
  const refYear = currentHorizon === "present" ? 2035 : HORIZON_META[currentHorizon].year;
  if (ref != null && ref !== rPresent) {
    const up = ref < rPresent;
    arrow = `<span class="rank-delta ${up ? "up" : "down"}" title="Rank ${rPresent} today to ${ref} by ${refYear}">${up ? "&#9650;" : "&#9660;"} ${Math.abs(rPresent - ref)}</span>`;
  } else if (ref != null) {
    arrow = `<span class="rank-delta flat" title="Rank unchanged by ${refYear}">&#9644; 0</span>`;
  }
  return `
    <span class="rank-badge" title="Global rank by importance (1 = most important of ${total})">
      <span class="rank-hash">#</span><strong>${currentHorizon === "present" ? rPresent : rActive}</strong>
      <span class="rank-of">/ ${total} &middot; ${HORIZON_META[currentHorizon].year}</span>
      ${arrow}
    </span>`;
}

function resilienceLineHtml(ap) {
  const r = getResilience(ap);
  if (!r) return "";
  const cls = r.vulnerability_class || "watch";
  const hhi = r.dependency_hhi != null ? r.dependency_hhi.toFixed(2) : "n/a";
  const reach = r.removal_reach_loss_pct != null ? r.removal_reach_loss_pct.toFixed(2) + "%" : "n/a";
  const red = r.redundancy_score != null ? Math.round(r.redundancy_score) : "n/a";
  const deps = (r.top_dependencies || []).slice(0, 3).map((d) => `${escapeHtml(d.iata)} ${(d.share * 100).toFixed(0)}%`).join(", ");
  return `
    <section class="detail-section">
      <div class="section-title">
        <h3>Resilience</h3>
        <span class="resilience-chip ${cls}">${escapeHtml(cls)}</span>
      </div>
      <div class="resilience-grid">
        <div><strong>${red}</strong><span>redundancy / 100</span></div>
        <div><strong>${reach}</strong><span>reach lost if removed</span></div>
        <div><strong>${hhi}</strong><span>dependency HHI</span></div>
      </div>
      ${deps ? `<p class="muted-line">Top dependencies: ${deps}${r.is_articulation_point ? " &middot; articulation point" : ""}</p>` : ""}
    </section>`;
}

function renderAirportCard(ap) {
  const card = document.getElementById("airport-card");
  if (!card || !ap) return;

  card.style.display = "block";
  card.dataset.userClosed = "false";
  card.scrollTop = 0;

  try {
    const saved = localStorage.getItem("skyline_pos_airport_card");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.left === "number" && typeof parsed.top === "number") {
        applyClampedPosition(card, parsed);
      }
    }
  } catch (e) {}

  const cur = ap.importance_present;
  const h5 = ap.forecast_h5 || { level: cur, change: 0.0, class: "stable", band_low: cur, band_high: cur, positive_drivers: [], negative_drivers: [] };
  const h10 = ap.forecast_h10 || { level: cur, change: 0.0, class: "stable", band_low: cur, band_high: cur, positive_drivers: [], negative_drivers: [] };

  const activeScore = getAirportScore(ap, currentHorizon);
  const activeClass = getAirportClass(ap, currentHorizon);
  const classDisplay = activeClass.replace("_", " ");

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = `${((activeScore / 100.0) * circumference).toFixed(1)} ${circumference.toFixed(1)}`;

  const delta10 = getH10Level(ap) - cur;
  const delta10Text = `${delta10 >= 0 ? "+" : ""}${delta10.toFixed(1)} pts`;
  const alpha = getDampingAlpha();
  const dampedTitle = hasDampedH10(ap) ? ` title="Horizon-10 value damped toward persistence (α=${alpha != null ? alpha : "n/a"})"` : "";

  const dq = getDataQuality(ap);
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

  const driversSource = currentHorizon === "h10" ? h10 : h5;
  const posDrivers = (driversSource.positive_drivers || []).map((d) => `<span class="driver positive">&#8599; ${escapeHtml(formatDriver(d))}</span>`).join("");
  const negDrivers = (driversSource.negative_drivers || []).map((d) => `<span class="driver negative">&#8600; ${escapeHtml(formatDriver(d))}</span>`).join("");
  const whyHtml =
    (posDrivers ? `<div class="driver-group"><span class="driver-group-label">Tailwinds</span><div class="driver-list">${posDrivers}</div></div>` : "") +
    (negDrivers ? `<div class="driver-group"><span class="driver-group-label">Headwinds</span><div class="driver-list">${negDrivers}</div></div>` : "") ||
    '<span class="driver">No major drivers recorded</span>';

  const routeChips = routeCount > 0
    ? ap.routes.slice(0, 18).map((r) => `<button type="button" class="route-chip" data-iata="${escapeHtml(r)}" title="Open ${escapeHtml(r)}">${escapeHtml(r)}</button>`).join("") +
      (routeCount > 18 ? `<span class="route-chip more">+${routeCount - 18} more</span>` : "")
    : '<span class="muted-line">None recorded in topology snapshot</span>';

  const continent = getContinent(ap);
  const cardBody = document.getElementById("airport-card-body");
  const target = cardBody || card;

  const cardHtml = `
    <div class="detail-top">
      <span class="eyebrow">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>
        AIRPORT DOSSIER
      </span>
      <button type="button" class="close-btn" id="btn-close-card" aria-label="Close airport card">&times;</button>
    </div>

    <div class="airport-heading">
      <span class="iata" id="selected-iata">${escapeHtml(ap.iata)}</span>
      ${rankBadgeHtml(ap)}
    </div>
    <h2 id="selected-name">${escapeHtml(ap.name)}</h2>
    <p class="location">
      ${ap.city ? escapeHtml(ap.city) + ", " : ""}
      <button type="button" class="link-btn country-link" data-country="${escapeHtml(ap.country)}" title="Open ${escapeHtml(countryName(ap.country))} summary">${escapeHtml(countryName(ap.country))}</button>
      ${continent ? `<span class="muted-inline">&middot; ${escapeHtml(continentName(continent))}</span>` : ""}
    </p>

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
          Importance score &middot; ${HORIZON_META[currentHorizon].year}
          <span class="info-tip">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Network centrality, connectivity, and volume percentile score from 0 to 100.</span>
          </span>
        </span>
        <p class="score-delta"${dampedTitle}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
          ${delta10Text} <span>over 10 years${hasDampedH10(ap) ? ` <em class="damped-note">damped${alpha != null ? ` (α=${alpha})` : ""}</em>` : ""}</span>
        </p>
        <span class="class-badge ${activeClass}">
          <i></i>${classDisplay}
        </span>
      </div>
    </div>

    <div class="dossier-actions" role="group" aria-label="Airport actions">
      <button type="button" class="dossier-btn" id="btn-card-compare">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="6" r="3"/><path d="M5 9v12"/><circle cx="19" cy="18" r="3"/><path d="M19 15V3"/></svg>
        Compare
      </button>
      <button type="button" class="dossier-btn" id="btn-card-routes" aria-pressed="true">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17c4-8 14-8 18 0"/><circle cx="3" cy="17" r="1.5"/><circle cx="21" cy="17" r="1.5"/></svg>
        Show routes
      </button>
      <button type="button" class="dossier-btn" id="btn-card-copilot">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        Ask Copilot
      </button>
      <button type="button" class="dossier-btn" id="btn-card-export">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Export dossier
      </button>
      <button type="button" class="dossier-btn subtle" id="btn-card-export-json" title="Download this airport's record as JSON">JSON</button>
      <button type="button" class="dossier-btn subtle" id="btn-card-copy-link" title="Copy a shareable link to this airport">Copy link</button>
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
        <h3>Why this outlook</h3>
        <span>${HORIZON_META[currentHorizon === "present" ? "h5" : currentHorizon].year} model</span>
      </div>
      ${whyHtml}
    </section>

    ${resilienceLineHtml(ap)}

    <section class="detail-section">
      <div class="section-title">
        <h3>Network routes</h3>
        <span>${routeCount} destinations</span>
      </div>
      <div class="route-chips">${routeChips}</div>
    </section>

    <div class="detail-footer">
      <div class="detail-footer-note">
        ${qualityExplanation}
      </div>
    </div>
  `;
  target.innerHTML = cardHtml;

  // Attach card event handlers
  const closeBtn = document.getElementById("btn-close-card");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      card.style.display = "none";
      card.dataset.userClosed = "true";
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

  const routesBtn = document.getElementById("btn-card-routes");
  if (routesBtn) {
    const syncRoutesBtn = () => {
      const on = routeLayerGroup.getLayers().length > 0;
      routesBtn.setAttribute("aria-pressed", on ? "true" : "false");
      routesBtn.classList.toggle("is-on", on);
    };
    syncRoutesBtn();
    routesBtn.addEventListener("click", () => {
      if (routeLayerGroup.getLayers().length > 0) {
        routeLayerGroup.clearLayers();
      } else {
        drawAirportRoutes(ap);
        const pts = (ap.routes || []).map((r) => airportLookup[r]).filter((d) => d && d.latitude != null).map((d) => [d.latitude, d.longitude]);
        if (pts.length > 0) {
          pts.push([ap.latitude, ap.longitude]);
          map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 6 });
        }
      }
      syncRoutesBtn();
    });
  }

  const copilotBtn = document.getElementById("btn-card-copilot");
  if (copilotBtn) {
    copilotBtn.addEventListener("click", () => {
      if (typeof window.executeAssistantCommand === "function") {
        window.executeAssistantCommand("tell me about " + ap.iata);
      } else {
        const input = document.getElementById("assistant-input");
        if (input) {
          input.value = "tell me about " + ap.iata;
          input.focus();
        }
      }
    });
  }

  const exportBtn = document.getElementById("btn-card-export");
  if (exportBtn) exportBtn.addEventListener("click", () => exportDossier(ap));
  const exportJsonBtn = document.getElementById("btn-card-export-json");
  if (exportJsonBtn) exportJsonBtn.addEventListener("click", () => exportDossierJson(ap));
  const copyLinkBtn = document.getElementById("btn-card-copy-link");
  if (copyLinkBtn) copyLinkBtn.addEventListener("click", copyShareLink);

  target.querySelectorAll(".country-link").forEach((btn) => {
    btn.addEventListener("click", () => openCountry(btn.getAttribute("data-country")));
  });
  target.querySelectorAll(".route-chip[data-iata]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dest = airportLookup[btn.getAttribute("data-iata")];
      if (dest) selectAirport(dest);
    });
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

function dossierRecord(ap) {
  return {
    exported_at: new Date().toISOString(),
    horizon_selected: currentHorizon,
    airport: ap,
    rank: { present: getRank(ap, "present"), h5: getRank(ap, "h5"), h10: getRank(ap, "h10") },
    continent: getContinent(ap),
    country_name: countryName(ap.country),
    resilience: getResilience(ap),
    damping_alpha: getDampingAlpha(),
    methodology: window.forecastsMeta ? window.forecastsMeta.methodology : null,
  };
}

function exportDossierJson(ap) {
  downloadBlob(`skyline-${ap.iata}.json`, JSON.stringify(dossierRecord(ap), null, 2), "application/json");
  showToast(`Exported ${ap.iata}.json`);
}

function exportDossier(ap) {
  const rec = dossierRecord(ap);
  const h5 = ap.forecast_h5 || {};
  const h10 = ap.forecast_h10 || {};
  const r = rec.resilience;
  const drivers = (src) =>
    `<ul>${(src.positive_drivers || []).map((d) => `<li class="pos">&#8599; ${escapeHtml(formatDriver(d))}</li>`).join("")}${(src.negative_drivers || []).map((d) => `<li class="neg">&#8600; ${escapeHtml(formatDriver(d))}</li>`).join("")}</ul>`;
  const routes = (ap.routes || []).map((x) => {
    const d = airportLookup[x];
    return d ? `${escapeHtml(x)} (${escapeHtml(d.city || d.name)})` : escapeHtml(x);
  }).join(", ");
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Skyline Index dossier - ${escapeHtml(ap.iata)}</title>
<style>
  body{font-family:'Instrument Sans',-apple-system,Segoe UI,Roboto,sans-serif;color:#141922;margin:0;padding:40px;max-width:860px;line-height:1.45}
  h1{font-size:28px;margin:0 0 4px}h2{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin:28px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b45309;font-weight:700}
  .meta{color:#6b7280;font-size:13px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px}
  .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px}.kpi strong{display:block;font-size:22px}.kpi span{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}
  table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #eee}th{color:#6b7280;font-weight:600;font-size:11px;text-transform:uppercase}
  ul{padding-left:18px;margin:6px 0}li.pos{color:#1d4ed8}li.neg{color:#be123c}
  .trend svg{width:100%;max-width:420px;height:auto}.chart-grid{stroke:#e5e7eb;stroke-width:1}.chart-band{fill:rgba(180,83,9,.15)}.chart-line{fill:none;stroke:#b45309;stroke-width:2}.chart-point{fill:#fff;stroke:#b45309;stroke-width:2}.chart-axis{font-size:8px;fill:#9ca3af}
  .forecast-ticks,.forecast-ranges{display:flex;justify-content:space-between;max-width:420px;font-size:12px;color:#6b7280}.forecast-ticks strong{display:block;color:#141922;font-size:14px}
  .damped-note{color:#6b7280;font-style:italic}.foot{margin-top:36px;font-size:11px;color:#9ca3af}
  @media print{body{padding:16px}}
</style></head><body>
<div class="eyebrow">Skyline Index &middot; Airport dossier</div>
<h1>${escapeHtml(ap.iata)} &middot; ${escapeHtml(ap.name)}</h1>
<div class="meta">${escapeHtml(ap.city || "")}${ap.city ? ", " : ""}${escapeHtml(rec.country_name)}${rec.continent ? " &middot; " + escapeHtml(continentName(rec.continent)) : ""} &middot; ${(ap.latitude || 0).toFixed(3)}, ${(ap.longitude || 0).toFixed(3)}</div>
<div class="kpis">
  <div class="kpi"><strong>${ap.importance_present.toFixed(1)}</strong><span>Importance 2025</span></div>
  <div class="kpi"><strong>${(h5.level != null ? h5.level : ap.importance_present).toFixed(1)}</strong><span>Forecast 2030</span></div>
  <div class="kpi"><strong>${getH10Level(ap).toFixed(1)}</strong><span>Forecast 2035${hasDampedH10(ap) ? " (damped)" : ""}</span></div>
  <div class="kpi"><strong>${rec.rank.present != null ? "#" + rec.rank.present : "n/a"}</strong><span>Global rank</span></div>
</div>
<h2>Growth outlook</h2>
${renderTrendSvg(ap)}
<table><tr><th>Horizon</th><th>Level</th><th>Change</th><th>Band</th><th>Class</th><th>Rank</th></tr>
<tr><td>2025 (now)</td><td>${ap.importance_present.toFixed(1)}</td><td>&ndash;</td><td>${ap.reconstruction_interval ? ap.reconstruction_interval.map((v) => Number(v).toFixed(1)).join(" to ") : "&ndash;"}</td><td>${escapeHtml(getAirportClass(ap, "present").replace("_", " "))}</td><td>${rec.rank.present != null ? "#" + rec.rank.present : "&ndash;"}</td></tr>
<tr><td>2030 (+5y)</td><td>${(h5.level != null ? h5.level : ap.importance_present).toFixed(1)}</td><td>${h5.change != null ? (h5.change >= 0 ? "+" : "") + h5.change.toFixed(2) : "&ndash;"}</td><td>${h5.band_low != null ? h5.band_low.toFixed(1) + " to " + h5.band_high.toFixed(1) + " (" + escapeHtml(h5.band_label || "") + ")" : "&ndash;"}</td><td>${escapeHtml((h5.class || "stable").replace("_", " "))}</td><td>${rec.rank.h5 != null ? "#" + rec.rank.h5 : "&ndash;"}</td></tr>
<tr><td>2035 (+10y)</td><td>${getH10Level(ap).toFixed(1)}${hasDampedH10(ap) ? ` <span class="damped-note">damped${rec.damping_alpha != null ? " α=" + rec.damping_alpha : ""}</span>` : ""}</td><td>${(getH10Change(ap) >= 0 ? "+" : "") + getH10Change(ap).toFixed(2)}</td><td>${h10.band_low != null ? h10.band_low.toFixed(1) + " to " + h10.band_high.toFixed(1) + " (" + escapeHtml(h10.band_label || "") + ")" : "&ndash;"}</td><td>${escapeHtml((h10.class || "stable").replace("_", " "))}</td><td>${rec.rank.h10 != null ? "#" + rec.rank.h10 : "&ndash;"}</td></tr>
</table>
<h2>Why: 2030 drivers</h2>${drivers(h5)}
<h2>Why: 2035 drivers</h2>${drivers(h10)}
${r ? `<h2>Resilience</h2><table><tr><th>Class</th><th>Redundancy</th><th>Reach lost if removed</th><th>Dependency HHI</th><th>Articulation point</th></tr><tr><td>${escapeHtml(r.vulnerability_class || "")}</td><td>${r.redundancy_score != null ? Math.round(r.redundancy_score) : "&ndash;"}</td><td>${r.removal_reach_loss_pct != null ? r.removal_reach_loss_pct.toFixed(2) + "%" : "&ndash;"}</td><td>${r.dependency_hhi != null ? r.dependency_hhi.toFixed(3) : "&ndash;"}</td><td>${r.is_articulation_point ? "yes" : "no"}</td></tr></table>` : ""}
<h2>Data provenance</h2>
<p>Data quality: <strong>${escapeHtml(getDataQuality(ap))}</strong> &middot; Confidence: <strong>${escapeHtml(ap.importance_confidence || "medium")}</strong>${ap.scored_outside_training_region ? " &middot; scored outside training region" : ""}${ap.reliability ? " &middot; " + escapeHtml(ap.reliability) : ""}</p>
<h2>Direct routes (${(ap.routes || []).length})</h2>
<p style="font-size:12px">${routes || "None recorded in topology snapshot"}</p>
<p class="foot">Generated ${escapeHtml(rec.exported_at)} by Skyline Index &middot; ${escapeHtml(rec.methodology || "Ensemble forecast")} &middot; Horizon-10 bands are indicative only.</p>
</body></html>`;
  downloadBlob(`skyline-dossier-${ap.iata}.html`, html, "text/html");
  showToast(`Dossier exported for ${ap.iata}`);
}

// ---------------------------------------------------------------------------
// Country panel
// ---------------------------------------------------------------------------

function countryAggregates(iso) {
  const list = airportsData.filter((a) => a.country === iso);
  const n = list.length;
  const mean = (fn) => (n ? list.reduce((s, a) => s + fn(a), 0) / n : 0);
  const count = (h, cls) => list.filter((a) => getAirportClass(a, h) === cls).length;
  return {
    iso,
    name: countryName(iso),
    airports: list,
    n,
    hubs: count("h5", "established_hub"),
    emerging_h5: count("h5", "emerging"),
    declining_h5: count("h5", "declining"),
    emerging_h10: count("h10", "emerging"),
    declining_h10: count("h10", "declining"),
    mean_present: mean((a) => a.importance_present),
    mean_h5: mean((a) => getAirportScore(a, "h5")),
    mean_h10: mean((a) => getAirportScore(a, "h10")),
    intel: intelligenceData && Array.isArray(intelligenceData.countries) ? intelligenceData.countries.find((c) => c.iso2 === iso) : null,
  };
}

function openCountry(iso) {
  if (!iso) return;
  iso = iso.toUpperCase();
  if (!airportsData.some((a) => a.country === iso)) {
    showToast(`No airports recorded for ${countryName(iso)}`);
    return;
  }
  selectedCountry = iso;
  const card = document.getElementById("airport-card");
  if (card) card.style.display = "none";
  const summary = document.getElementById("selected-summary");
  if (summary) summary.style.display = "none";
  routeLayerGroup.clearLayers();
  if (selectedHaloMarker) {
    map.removeLayer(selectedHaloMarker);
    selectedHaloMarker = null;
  }
  renderCountryCard(iso);
  updateMarkerStyles();
  fitMapToCountry(iso);
  updateUrlState();
}

function fitMapToCountry(iso) {
  const pts = airportsData.filter((a) => a.country === iso && a.latitude != null).map((a) => [a.latitude, a.longitude]);
  if (pts.length === 0) return;
  if (pts.length === 1) {
    map.flyTo(pts[0], 6, { duration: 0.8 });
    return;
  }
  map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 7 });
}

function closeCountryCard(opts) {
  const options = opts || {};
  if (!selectedCountry) return;
  selectedCountry = null;
  const card = document.getElementById("country-card");
  if (card) card.style.display = "none";
  if (!options.keepSelection) updateMarkerStyles();
  else {
    // marker dimming removed on next style pass
    updateMarkerStyles();
  }
  updateUrlState();
}

function renderCountryCard(iso) {
  const card = document.getElementById("country-card");
  if (!card) return;
  const agg = countryAggregates(iso);
  const ranked = agg.airports.slice().sort((a, b) => getAirportScore(b, currentHorizon) - getAirportScore(a, currentHorizon));
  const year = HORIZON_META[currentHorizon].year;
  const intel = agg.intel;
  const cont = ranked.length ? getContinent(ranked[0]) : null;

  const rows = ranked.slice(0, 60).map((a, i) => {
    const score = getAirportScore(a, currentHorizon);
    const change = score - a.importance_present;
    const cls = getAirportClass(a, currentHorizon);
    const rank = getRank(a, currentHorizon);
    return `<tr data-iata="${escapeHtml(a.iata)}" tabindex="0" role="button" aria-label="Select ${escapeHtml(a.iata)}">
      <td class="num">${i + 1}</td>
      <td><strong>${escapeHtml(a.iata)}</strong><span class="table-sub">${escapeHtml(a.city || a.name)}</span></td>
      <td class="num">${score.toFixed(1)}</td>
      <td class="num ${change > 0.05 ? "pos" : change < -0.05 ? "neg" : ""}">${currentHorizon === "present" ? (rank != null ? "#" + rank : "") : (change >= 0 ? "+" : "") + change.toFixed(1)}</td>
      <td><i class="class-dot ${cls === "established_hub" ? "hub" : cls}" title="${escapeHtml(cls.replace("_", " "))}"></i></td>
    </tr>`;
  }).join("");

  const intelHtml = intel
    ? `<div class="country-intel">
        ${intel.momentum_rank_h10 != null ? `<span class="metadata-badge">Momentum rank <strong>#${intel.momentum_rank_h10}</strong></span>` : ""}
        ${intel.traffic_weighted_change_h10 != null ? `<span class="metadata-badge">Traffic-weighted 2035 <strong>${intel.traffic_weighted_change_h10 >= 0 ? "+" : ""}${Number(intel.traffic_weighted_change_h10).toFixed(2)}</strong></span>` : ""}
        ${intel.top_riser && intel.top_riser.iata ? `<span class="metadata-badge">Top riser <strong>${escapeHtml(intel.top_riser.iata)}</strong> ${intel.top_riser.change_h10 >= 0 ? "+" : ""}${Number(intel.top_riser.change_h10).toFixed(1)}</span>` : ""}
        ${intel.top_faller && intel.top_faller.iata ? `<span class="metadata-badge">Top faller <strong>${escapeHtml(intel.top_faller.iata)}</strong> ${Number(intel.top_faller.change_h10).toFixed(1)}</span>` : ""}
        ${intel.macro && intel.macro.gdp_growth_pct != null ? `<span class="metadata-badge">GDP growth <strong>${Number(intel.macro.gdp_growth_pct).toFixed(1)}%</strong></span>` : ""}
      </div>`
    : "";

  card.style.display = "block";
  card.scrollTop = 0;
  card.innerHTML = `
    <div class="detail-top">
      <span class="eyebrow">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        COUNTRY SUMMARY
      </span>
      <button type="button" class="close-btn" id="btn-close-country" aria-label="Close country summary">&times;</button>
    </div>
    <div class="airport-heading">
      <span class="iata">${escapeHtml(iso)}</span>
      ${cont ? `<span class="airport-type">${escapeHtml(continentName(cont))}</span>` : ""}
    </div>
    <h2 id="country-name">${escapeHtml(agg.name)}</h2>
    <p class="location">${agg.n} airports tracked &middot; showing ${year}</p>

    <div class="kpi-grid">
      <div class="kpi-tile"><strong>${agg.n}</strong><span>Airports</span></div>
      <div class="kpi-tile"><strong class="class-hub-text">${agg.hubs}</strong><span>Hubs</span></div>
      <div class="kpi-tile"><strong class="class-emerging-text">${currentHorizon === "h10" ? agg.emerging_h10 : agg.emerging_h5}</strong><span>Emerging</span></div>
      <div class="kpi-tile"><strong class="class-declining-text">${currentHorizon === "h10" ? agg.declining_h10 : agg.declining_h5}</strong><span>Declining</span></div>
      <div class="kpi-tile"><strong>${agg.mean_present.toFixed(1)}</strong><span>Mean 2025</span></div>
      <div class="kpi-tile"><strong>${agg.mean_h5.toFixed(1)}</strong><span>Mean 2030</span></div>
      <div class="kpi-tile"><strong>${agg.mean_h10.toFixed(1)}</strong><span>Mean 2035</span></div>
      <div class="kpi-tile"><strong class="${agg.mean_h10 - agg.mean_present >= 0 ? "positive-text" : "class-declining-text"}">${agg.mean_h10 - agg.mean_present >= 0 ? "+" : ""}${(agg.mean_h10 - agg.mean_present).toFixed(1)}</strong><span>10y shift</span></div>
    </div>
    ${intelHtml}

    <div class="dossier-actions">
      <button type="button" class="dossier-btn" id="btn-country-fit">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        Fit map to country
      </button>
      <button type="button" class="dossier-btn subtle" id="btn-country-copy-link">Copy link</button>
    </div>

    <section class="detail-section">
      <div class="section-title">
        <h3>Ranked airports</h3>
        <span>${currentHorizon === "present" ? "score &middot; global rank" : "score &middot; change vs 2025"}</span>
      </div>
      <div class="country-table-wrap">
        <table class="country-table" id="country-table">
          <thead><tr><th>#</th><th>Airport</th><th class="num">${year}</th><th class="num">${currentHorizon === "present" ? "Rank" : "&Delta;"}</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${ranked.length > 60 ? `<p class="muted-line">Showing top 60 of ${ranked.length}.</p>` : ""}
      </div>
    </section>
  `;

  const closeBtn = document.getElementById("btn-close-country");
  if (closeBtn) closeBtn.addEventListener("click", () => closeCountryCard());
  const fitBtn = document.getElementById("btn-country-fit");
  if (fitBtn) fitBtn.addEventListener("click", () => fitMapToCountry(iso));
  const copyBtn = document.getElementById("btn-country-copy-link");
  if (copyBtn) copyBtn.addEventListener("click", copyShareLink);
  card.querySelectorAll("tr[data-iata]").forEach((tr) => {
    const go = () => {
      const ap = airportLookup[tr.getAttribute("data-iata")];
      if (ap) selectAirport(ap);
    };
    tr.addEventListener("click", go);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Compare drawer
// ---------------------------------------------------------------------------

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

function renderCompareDrawer() {
  const container = document.getElementById("compare-columns");
  if (!container) return;

  const apA = airportLookup[compareAirportA] || airportsData[0];
  const apB = airportLookup[compareAirportB] || airportsData[1];
  const alpha = getDampingAlpha();

  const renderCol = (ap, isA) => {
    if (!ap) return "<div>No airport data</div>";
    const cur = ap.importance_present;
    const h5 = ap.forecast_h5 || { level: cur, class: "stable", band_low: cur, band_high: cur, positive_drivers: [], negative_drivers: [] };
    const h10 = ap.forecast_h10 || { level: cur, class: "stable", band_low: cur, band_high: cur, positive_drivers: [], negative_drivers: [] };

    const activeClass = getAirportClass(ap, currentHorizon);
    const clsDisplay = activeClass.replace("_", " ");

    const optionsHtml = airportsData
      .map((item) => `<option value="${item.iata}" ${item.iata === ap.iata ? "selected" : ""}>${escapeHtml(item.iata)} : ${escapeHtml(item.city || item.name)}</option>`)
      .join("");

    const driversSource = currentHorizon === "h10" ? h10 : h5;
    const posDrivers = (driversSource.positive_drivers || []).slice(0, 2).map((d) => `<span class="driver positive">&#8599; ${escapeHtml(formatDriver(d))}</span>`).join("");
    const negDrivers = (driversSource.negative_drivers || []).slice(0, 1).map((d) => `<span class="driver negative">&#8600; ${escapeHtml(formatDriver(d))}</span>`).join("");

    const selectId = isA ? "compare-select-a" : "compare-select-b";
    const rank = getRank(ap, "present");

    return `
      <div class="compare-column">
        <select class="compare-select" id="${selectId}" aria-label="Select comparison airport">
          ${optionsHtml}
        </select>
        <h3>${escapeHtml(ap.name)}</h3>
        <p>${ap.city ? escapeHtml(ap.city) + ", " : ""}${escapeHtml(countryName(ap.country))}${rank != null ? ` &middot; rank #${rank}` : ""}</p>
        <div>
          <span class="class-badge ${activeClass}"><i></i>${clsDisplay}</span>
        </div>

        <div class="compare-metrics">
          <div>
            <strong>${cur.toFixed(1)}</strong>
            <span>2025</span>
          </div>
          <div>
            <strong>${h5.level.toFixed(1)}</strong>
            <span>2030</span>
          </div>
          <div${hasDampedH10(ap) ? ` title="damped (α=${alpha != null ? alpha : "n/a"})"` : ""}>
            <strong>${getH10Level(ap).toFixed(1)}</strong>
            <span>2035${hasDampedH10(ap) ? " damped" : ""}</span>
          </div>
        </div>

        ${renderTrendSvg(ap, { compact: true })}

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

// ---------------------------------------------------------------------------
// Opportunity radar
// ---------------------------------------------------------------------------

function renderRadar() {
  const container = document.getElementById("radar-results-list");
  if (!container) return;
  container.innerHTML = "";

  if (!opportunitiesData) {
    container.innerHTML = "<p style='font-size: 12px; color: var(--muted-foreground);'>Opportunity data unavailable.</p>";
    return;
  }

  const selectFromRadar = (iata) => {
    const ap = airportLookup[iata];
    if (ap) {
      switchTab("map");
      selectAirport(ap);
    }
  };

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
        <div class="radar-card-pair">${escapeHtml(item.origin_iata)} &harr; ${escapeHtml(item.dest_iata)}</div>
        <div class="radar-card-desc"><b>${escapeHtml(item.origin_city)}</b> to <b>${escapeHtml(item.dest_city)}</b> (${item.distance_km} km)</div>
        <div class="radar-card-desc">${escapeHtml(item.reason)}</div>
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
        <div class="radar-card-pair">${escapeHtml(item.iata)} : ${escapeHtml(item.city || item.name)}</div>
        <div class="radar-card-desc">${escapeHtml(countryName(item.country))} &bull; Current: ${item.importance_present.toFixed(1)} &bull; 2030: ${item.forecast_level_h5.toFixed(1)}</div>
        <div class="radar-card-desc">Driver: ${escapeHtml(item.top_driver)}</div>
      `;
      card.addEventListener("click", () => selectFromRadar(item.iata));
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
        <div class="radar-card-pair">${escapeHtml(item.iata)} : ${escapeHtml(item.city || item.name)}</div>
        <div class="radar-card-desc">${escapeHtml(countryName(item.country))} &bull; Intl Share: ${(item.international_share * 100).toFixed(0)}%</div>
        <div class="radar-card-desc">Driver: ${escapeHtml(item.top_driver)}</div>
      `;
      card.addEventListener("click", () => selectFromRadar(item.iata));
      container.appendChild(card);
    });
  }
}

function showCandidateOnMap(item) {
  switchTab("map");
  candidateRouteLayerGroup.clearLayers();
  routeLayerGroup.clearLayers();

  const a = { latitude: item.origin_lat, longitude: item.origin_lon };
  const b = { latitude: item.dest_lat, longitude: item.dest_lon };
  const poly = geodesicPolyline(a, b, { renderer: markerRenderer, color: "#5AA9FF", dashArray: "6, 8", weight: 2.5, opacity: 0.9 }, 32).addTo(candidateRouteLayerGroup);

  poly.bindPopup(`<b>Candidate Route: ${escapeHtml(item.origin_iata)} &harr; ${escapeHtml(item.dest_iata)}</b><br>${escapeHtml(item.reason)}<br>Distance: ${item.distance_km} km`);
  poly.openPopup();

  map.fitBounds(poly.getBounds(), { padding: [50, 50], maxZoom: 6 });
}

// ---------------------------------------------------------------------------
// Tabs (data-driven registry)
// ---------------------------------------------------------------------------

function intelCall(fnName, el) {
  const api = window.SkylineIntel;
  if (api && typeof api[fnName] === "function") {
    try {
      api[fnName](el);
      return true;
    } catch (e) {
      console.error("SkylineIntel." + fnName + " failed:", e);
    }
  }
  return false;
}

function placeholderHtml(title, blurb) {
  return `
    <div class="view-placeholder">
      <span class="eyebrow">${escapeHtml(title)}</span>
      <h2>${escapeHtml(title)} is loading</h2>
      <p>${escapeHtml(blurb)}</p>
    </div>`;
}

const TAB_REGISTRY = {
  map: { nav: "tab-nav-map", panel: null, onShow: () => map.invalidateSize() },
  radar: { nav: "tab-nav-radar", panel: "radar-panel", onShow: () => renderRadar() },
  intel: {
    nav: "tab-nav-intel",
    panel: "intel-panel",
    onShow: (el) => {
      if (!intelCall("renderIntelView", el) && !el.dataset.rendered) {
        el.innerHTML = placeholderHtml("Intelligence", "Country momentum, global rankings, network statistics and resilience analytics render here once the intelligence module and intelligence.json are available.");
      }
    },
  },
  scenario: {
    nav: "tab-nav-scenario",
    panel: "scenario-panel",
    onShow: (el) => {
      if (!intelCall("renderScenarioView", el) && !el.dataset.rendered) {
        el.innerHTML = placeholderHtml("Scenario Lab", "Shock GDP growth, tourism or population and watch forecast importance respond through the linear surrogate model. Available once the scenario module loads.");
      }
    },
  },
  method: {
    nav: "tab-nav-method",
    panel: "method-panel",
    onShow: (el) => {
      if (!intelCall("renderMethodView", el) && !el.dataset.rendered) {
        const meta = window.forecastsMeta || {};
        const h10 = meta.horizon10_evaluation || {};
        el.innerHTML = `
          <div class="view-placeholder">
            <span class="eyebrow">Methodology</span>
            <h2>How the Skyline Index is built</h2>
            <p>${escapeHtml(meta.methodology || "Ensemble of LightGBM and Ridge with IMF and UN forward projections")}.</p>
            <p>Held constant: ${escapeHtml((meta.macro_held_constant || []).join(", ") || "n/a")}. Projected: ${escapeHtml((meta.macro_projected || []).join(", ") || "n/a")}.</p>
            <p>Horizon-10 evaluation: persistence MAE ${h10.persistence_mae != null ? h10.persistence_mae : "n/a"} vs damped model MAE ${h10.damped_mae != null ? h10.damped_mae : "n/a"}; coverage ${h10.coverage_pct != null ? h10.coverage_pct + "%" : "n/a"} (${escapeHtml(h10.band_label || "indicative only")}).</p>
          </div>`;
      }
    },
  },
};

function switchTab(tab) {
  if (!TAB_REGISTRY[tab]) tab = "map";
  closeCompareDrawer();
  currentTab = tab;
  const leftPanel = document.getElementById("left-panel");
  const airportCard = document.getElementById("airport-card");
  const countryCard = document.getElementById("country-card");
  const legendPill = document.getElementById("legend-pill");
  const mobileFilters = document.getElementById("btn-mobile-filters");
  const pillsRightGroup = document.getElementById("pills-right-group");
  const mobileMenuBtn = document.getElementById("btn-mobile-menu");

  Object.keys(TAB_REGISTRY).forEach((key) => {
    const cfg = TAB_REGISTRY[key];
    const nav = document.getElementById(cfg.nav);
    const isActive = key === tab;
    if (nav) {
      nav.classList.toggle("active", isActive);
      nav.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
    if (cfg.panel) {
      const panel = document.getElementById(cfg.panel);
      if (panel) panel.style.display = isActive ? "flex" : "none";
    }
  });

  const isMap = tab === "map";
  document.body.classList.toggle("radar-tab-active", !isMap);
  document.body.classList.toggle("view-tab-active", !isMap);
  document.body.setAttribute("data-tab", tab);
  if (leftPanel) leftPanel.style.display = isMap ? "" : "none";
  if (mobileFilters) mobileFilters.style.display = isMap ? "" : "none";
  if (legendPill) legendPill.style.display = isMap ? "" : "none";
  if (!isMap) {
    if (airportCard) airportCard.style.display = "none";
    if (countryCard) countryCard.style.display = "none";
  } else {
    if (selectedCountry && countryCard) countryCard.style.display = "block";
    else if (selectedAirport && airportCard && window.innerWidth >= 700 && airportCard.dataset.userClosed !== "true") airportCard.style.display = "block";
  }
  // Collapse the mobile menu after choosing a tab
  if (pillsRightGroup && pillsRightGroup.classList.contains("mobile-open")) {
    pillsRightGroup.classList.remove("mobile-open");
    if (mobileMenuBtn) mobileMenuBtn.setAttribute("aria-expanded", "false");
  }

  const cfg = TAB_REGISTRY[tab];
  const panelEl = cfg.panel ? document.getElementById(cfg.panel) : null;
  if (cfg.onShow) cfg.onShow(panelEl);
  updateUrlState();
}

// ---------------------------------------------------------------------------
// About card
// ---------------------------------------------------------------------------

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
    The skyline index evaluates global airport importance across route network centrality, annual traffic throughput, and regional market catchment.
    Forecast methodology: ${escapeHtml(method)}.
    At horizon 10, persistence (predicting zero change) wins on test MAE (${h10.persistence_mae} versus ${h10.damped_mae} for the damped model) due to decadal mean reversion; we ship the damped model (damping factor ${h10.damping_factor}) to supply directional signals alongside baseline persistence benchmarks. Horizon 10 uncertainty bands achieve ${h10.coverage_pct} percent coverage and are labelled as ${escapeHtml(h10Label)}.
    The Opportunity Radar predicts promising unserved city pairs by combining network topology with forecast airport momentum.
  `;
}

// ---------------------------------------------------------------------------
// URL state + share
// ---------------------------------------------------------------------------

let suppressUrlUpdates = true;
function updateUrlState() {
  if (suppressUrlUpdates) return;
  const parts = [];
  if (selectedCountry) parts.push("c=" + encodeURIComponent(selectedCountry));
  else if (selectedAirport) parts.push("ap=" + encodeURIComponent(selectedAirport.iata));
  parts.push("h=" + currentHorizon);
  parts.push("tab=" + currentTab);
  if (showNetworkShifts) parts.push("net=1");
  const hash = "#" + parts.join("&");
  if (window.location.hash !== hash) {
    try {
      history.replaceState(null, "", hash);
    } catch (e) {
      window.location.hash = hash;
    }
  }
}

function parseUrlState() {
  const raw = (window.location.hash || "").replace(/^#/, "");
  const out = {};
  raw.split("&").forEach((kv) => {
    const [k, v] = kv.split("=");
    if (k) out[decodeURIComponent(k)] = v != null ? decodeURIComponent(v) : "";
  });
  return out;
}

function restoreUrlState() {
  const st = parseUrlState();
  if (st.h && HORIZON_META[st.h] && st.h !== currentHorizon) setHorizon(st.h);
  if (st.net === "1") {
    showNetworkShifts = true;
    const toggle = document.getElementById("toggle-network-shifts");
    if (toggle) toggle.checked = true;
  }
  let handled = false;
  if (st.c) {
    openCountry(st.c);
    handled = !!selectedCountry;
  } else if (st.ap && airportLookup[st.ap.toUpperCase()]) {
    selectAirport(airportLookup[st.ap.toUpperCase()]);
    handled = true;
  }
  return handled;
}

// Applied last (after any default selection) so non-map tabs hide the dossier,
// country card, left panel, legend and stats through the normal switchTab path.
function restoreUrlTab() {
  const st = parseUrlState();
  const tab = st.tab && TAB_REGISTRY[st.tab] ? st.tab : "map";
  if (tab !== currentTab) switchTab(tab);
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function copyShareLink() {
  updateUrlState();
  const url = window.location.href;
  const done = () => showToast("Link copied to clipboard");
  const fail = () => {
    try {
      window.prompt("Copy this link", url);
    } catch (e) {}
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, fail);
  } else {
    fail();
  }
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function renderSearchResults(q) {
  const searchResults = document.getElementById("search-results");
  if (!searchResults) return;
  if (q.length < 2) {
    searchResults.style.display = "none";
    return;
  }
  const countries = searchCountries(q, 2);
  const exactIata = airportsData.filter((a) => a.iata.toLowerCase() === q);
  const matches = exactIata.concat(
    airportsData.filter((a) => !exactIata.includes(a) && airportMatchesQuery(a, q)).sort((a, b) => b.importance_present - a.importance_present)
  ).slice(0, 5);

  if (countries.length === 0 && matches.length === 0) {
    searchResults.style.display = "none";
    return;
  }
  searchResults.style.display = "flex";
  searchResults.innerHTML =
    countries.map((c) => `<button type="button" class="result-country" data-country="${escapeHtml(c.iso)}"><strong>${escapeHtml(c.iso)}</strong> ${escapeHtml(c.name)} <em>country</em></button>`).join("") +
    matches.map((a) => `<button type="button" data-iata="${escapeHtml(a.iata)}"><strong>${escapeHtml(a.iata)}</strong> ${escapeHtml(a.name)} (${escapeHtml(a.city || countryName(a.country))})</button>`).join("");
  searchResults.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.country) openCountry(btn.dataset.country);
      else {
        const ap = airportLookup[btn.getAttribute("data-iata")];
        if (ap) selectAirport(ap);
      }
      searchResults.style.display = "none";
    });
  });
}

function submitSearch() {
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  if (!searchInput) return;
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return;
  const exact = airportLookup[q.toUpperCase()];
  if (exact && q.length === 3) {
    selectAirport(exact);
  } else {
    const iso = resolveCountryQuery(q);
    if (iso && airportsData.some((a) => a.country === iso)) {
      openCountry(iso);
    } else {
      const first = airportsData.filter((a) => airportMatchesQuery(a, q)).sort((a, b) => b.importance_present - a.importance_present)[0];
      if (first) selectAirport(first);
    }
  }
  if (searchResults) searchResults.style.display = "none";
}

function setupEventListeners() {
  // Horizon buttons
  document.querySelectorAll(".horizon-option").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (horizonAnimation.running) stopHorizonTimelapse();
      const h = e.currentTarget.getAttribute("data-horizon");
      setHorizon(h);
    });
  });
  const playBtn = document.getElementById("btn-horizon-play");
  if (playBtn) playBtn.addEventListener("click", playHorizonTimelapse);

  const netToggle = document.getElementById("toggle-network-shifts");
  if (netToggle) netToggle.addEventListener("change", (e) => setNetworkShifts(e.target.checked));

  // Navigation tabs (registry-driven)
  Object.keys(TAB_REGISTRY).forEach((key) => {
    const nav = document.getElementById(TAB_REGISTRY[key].nav);
    if (nav) nav.addEventListener("click", () => switchTab(key));
  });

  // Mobile navigation menu toggle
  const mobileMenuBtn = document.getElementById("btn-mobile-menu");
  const pillsRightGroup = document.getElementById("pills-right-group");
  if (mobileMenuBtn && pillsRightGroup) {
    mobileMenuBtn.addEventListener("click", () => {
      const isOpen = pillsRightGroup.classList.toggle("mobile-open");
      mobileMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  // Radar subtabs
  document.querySelectorAll(".radar-tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".radar-tab-btn").forEach((b) => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      currentRadarView = e.currentTarget.getAttribute("data-view");
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
  const regionSelect = document.getElementById("filter-region");
  if (regionSelect) regionSelect.addEventListener("change", renderMarkers);

  const stylingToggle = document.getElementById("toggle-quality-styling");
  if (stylingToggle) stylingToggle.addEventListener("change", updateMarkerStyles);

  const basemapSelect = document.getElementById("basemap-select");
  if (basemapSelect) basemapSelect.addEventListener("change", (e) => setBasemap(e.target.value));
  const h10Select = document.getElementById("h10-mode-select");
  if (h10Select) {
    h10Select.value = h10Mode;
    h10Select.addEventListener("change", (e) => setH10Mode(e.target.value));
  }

  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("btn-clear-search");
  const searchResults = document.getElementById("search-results");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim().toLowerCase();
      if (clearSearchBtn) clearSearchBtn.style.display = q ? "inline-block" : "none";
      renderSearchResults(q);
      renderMarkers();
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitSearch();
      } else if (e.key === "Escape" && searchResults) {
        searchResults.style.display = "none";
      }
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
      if (regionSelect) regionSelect.value = "all";
      if (searchInput) searchInput.value = "";
      if (clearSearchBtn) clearSearchBtn.style.display = "none";
      if (searchResults) searchResults.style.display = "none";
      closeCountryCard();
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

  const btnCopyLink = document.getElementById("btn-copy-link");
  if (btnCopyLink) btnCopyLink.addEventListener("click", copyShareLink);

  const btnCloseCompare = document.getElementById("btn-close-compare");
  if (btnCloseCompare) btnCloseCompare.addEventListener("click", closeCompareDrawer);

  const compareOverlay = document.getElementById("compare-overlay");
  if (compareOverlay) {
    compareOverlay.addEventListener("click", (e) => {
      if (e.target === compareOverlay) closeCompareDrawer();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCompareDrawer();
  });

  window.addEventListener("resize", layoutLeftPanel);

  // Legend pill collapse
  const legendToggle = document.getElementById("btn-legend-toggle");
  const legendPill = document.getElementById("legend-pill");
  if (legendToggle && legendPill) {
    let collapsed = false;
    try {
      collapsed = localStorage.getItem("skyline_legend_collapsed") === "1";
    } catch (e) {}
    const apply = () => {
      legendPill.classList.toggle("collapsed", collapsed);
      legendToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    };
    apply();
    legendToggle.addEventListener("click", () => {
      collapsed = !collapsed;
      apply();
      layoutLeftPanel();
      try {
        localStorage.setItem("skyline_legend_collapsed", collapsed ? "1" : "0");
      } catch (e) {}
    });
  }

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

  window.addEventListener("hashchange", () => {
    if (!dataReady) return;
    suppressUrlUpdates = true;
    restoreUrlState();
    restoreUrlTab();
    suppressUrlUpdates = false;
  });

  initReplyPanelWatcher();
  initTransparencySettings();
  initDraggablePanels();
}

// On phones the assistant reply panel and the dossier share the same screen real
// estate: mirror the reply panel's visibility onto <body> so CSS can yield the card.
// Keep the left filter panel's bottom edge clear of the legend pill (whose height
// varies with the network-shift legend and collapse state).
function layoutLeftPanel() {
  const leftPanel = document.getElementById("left-panel");
  const legend = document.getElementById("legend-pill");
  if (!leftPanel || !legend) return;
  if (window.innerWidth < 800 || window.getComputedStyle(legend).display === "none") {
    leftPanel.style.maxHeight = "";
    return;
  }
  const legendTop = legend.getBoundingClientRect().top;
  const panelTop = leftPanel.getBoundingClientRect().top;
  const available = Math.floor(legendTop - panelTop - 12);
  leftPanel.style.maxHeight = available > 120 ? `${available}px` : "";
}

function initReplyPanelWatcher() {
  const reply = document.getElementById("assistant-reply-panel");
  if (!reply || typeof MutationObserver === "undefined") return;
  const sync = () => {
    const open = window.getComputedStyle(reply).display !== "none";
    document.body.classList.toggle("reply-panel-open", open);
  };
  sync();
  new MutationObserver(sync).observe(reply, { attributes: true, attributeFilter: ["style", "class"] });
}

function initTransparencySettings() {
  const slider = document.getElementById("slider-transparency");
  const label = document.getElementById("transparency-val");
  const toggleBtn = document.getElementById("btn-settings-toggle");
  const popover = document.getElementById("settings-popover");
  const closeBtn = document.getElementById("btn-close-settings");

  let saved = "45";
  try {
    saved = localStorage.getItem("skyline_panel_opacity") || "45";
  } catch (e) {}

  const applyOpacity = (valStr) => {
    const num = Math.min(90, Math.max(30, parseInt(valStr, 10) || 45));
    const opacity = (num / 100).toFixed(2);
    document.documentElement.style.setProperty("--panel-opacity", opacity);
    document.documentElement.style.setProperty("--panel-fill", `rgba(18, 23, 30, ${opacity})`);
    if (slider) slider.value = num;
    if (label) label.textContent = `${num}%`;
    try {
      localStorage.setItem("skyline_panel_opacity", num.toString());
    } catch (e) {}
  };

  applyOpacity(saved);

  if (slider) slider.addEventListener("input", (e) => applyOpacity(e.target.value));

  if (toggleBtn && popover) {
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = popover.style.display === "none";
      popover.style.display = isHidden ? "flex" : "none";
    });
  }
  if (closeBtn && popover) {
    closeBtn.addEventListener("click", () => {
      popover.style.display = "none";
    });
  }
  document.addEventListener("click", (e) => {
    if (popover && popover.style.display !== "none") {
      if (!popover.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
        popover.style.display = "none";
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Draggable panels
// ---------------------------------------------------------------------------

const DRAGGABLE_CONFIGS = [
  { panelId: "left-panel", gripId: "grip-left-panel", key: "skyline_pos_left_panel" },
  { panelId: "airport-card", gripId: "grip-airport-card", key: "skyline_pos_airport_card" },
  { panelId: "map-statistics", gripId: "grip-map-statistics", key: "skyline_pos_map_statistics" },
  { panelId: "assistant-bar", gripId: "grip-assistant-bar", key: "skyline_pos_assistant_bar" },
  { panelId: "assistant-reply-panel", gripId: "grip-reply-panel", key: "skyline_pos_reply_panel" },
];

function getParentOffset(panel) {
  if (!panel.offsetParent) return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const r = panel.offsetParent.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function applyClampedPosition(panel, pos) {
  if (!pos || window.innerWidth < 700) return;
  const parent = getParentOffset(panel);
  const width = panel.offsetWidth || 350;
  const height = panel.offsetHeight || 300;

  const minX = 8;
  const maxX = Math.max(minX, parent.width - width - 8);
  const minY = 68;
  const maxY = Math.max(minY, parent.height - height - 8);

  const clampX = Math.max(minX, Math.min(maxX, pos.left));
  const clampY = Math.max(minY, Math.min(maxY, pos.top));

  panel.style.left = `${clampX}px`;
  panel.style.top = `${clampY}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  panel.style.transform = "none";
  panel.classList.add("is-dragged");
}

function getVisibleFloatingElements(excludeEl) {
  const selectors = [
    "#pill-brand",
    "#pill-tabs",
    "#pill-actions",
    "#left-panel",
    "#airport-card",
    "#country-card",
    "#legend-pill",
    "#assistant-bar",
    "#assistant-reply-panel",
    "#map-statistics",
    ".leaflet-control-zoom",
  ];
  const list = [];
  selectors.forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el || el === excludeEl) return;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) list.push({ el, rect });
  });
  return list;
}

function checkPanelCollision(panel) {
  if (!panel) return false;
  const style = window.getComputedStyle(panel);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rA = panel.getBoundingClientRect();
  if (rA.width === 0 || rA.height === 0) return false;

  const others = getVisibleFloatingElements(panel);
  for (const { rect: rB } of others) {
    const overlapX = Math.min(rA.right, rB.right) - Math.max(rA.left, rB.left);
    const overlapY = Math.min(rA.bottom, rB.bottom) - Math.max(rA.top, rB.top);
    if (overlapX > 4 && overlapY > 4) return true;
  }
  return false;
}

function animatePanelToDefault(panel, key) {
  if (!panel) return;
  panel.style.transition = "all 200ms cubic-bezier(0.16, 1, 0.3, 1)";
  resetPanelPos(panel, key);
  setTimeout(() => {
    panel.style.transition = "";
  }, 220);
}

function resetPanelPos(panel, key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
  panel.style.left = "";
  panel.style.top = "";
  panel.style.right = "";
  panel.style.bottom = "";
  panel.style.transform = "";
  panel.classList.remove("is-dragged");
}

function resetAllLayoutPositions() {
  DRAGGABLE_CONFIGS.forEach(({ panelId, key }) => {
    const panel = document.getElementById(panelId);
    if (panel) resetPanelPos(panel, key);
  });
}

function initDraggablePanels() {
  DRAGGABLE_CONFIGS.forEach(({ panelId, gripId, key }) => {
    const panel = document.getElementById(panelId);
    const grip = document.getElementById(gripId);
    if (!panel || !grip) return;

    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.left === "number" && typeof parsed.top === "number") {
          applyClampedPosition(panel, parsed);
          if (checkPanelCollision(panel)) resetPanelPos(panel, key);
        }
      }
    } catch (e) {}

    const startDrag = (e) => {
      if (window.innerWidth < 700) return;
      if (e.button !== 0) return;
      if (e.target.closest("button") || e.target.closest("input") || e.target.closest("select") || e.target.closest("a")) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = panel.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      let moved = false;

      const mapInst = window.map;
      if (mapInst && mapInst.dragging && mapInst.dragging.enabled()) mapInst.dragging.disable();

      const onPointerMove = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        moved = true;

        const parent = getParentOffset(panel);
        const pWidth = panel.offsetWidth || rect.width;
        const pHeight = panel.offsetHeight || rect.height;

        const minX = 8;
        const maxX = Math.max(minX, parent.width - pWidth - 8);
        const minY = 68;
        const maxY = Math.max(minY, parent.height - pHeight - 8);

        const newLeft = ev.clientX - parent.left - offsetX;
        const newTop = ev.clientY - parent.top - offsetY;

        panel.style.left = `${Math.max(minX, Math.min(maxX, newLeft))}px`;
        panel.style.top = `${Math.max(minY, Math.min(maxY, newTop))}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        panel.style.transform = "none";
        panel.classList.add("is-dragged");
      };

      const onPointerUp = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);

        if (mapInst && mapInst.dragging) mapInst.dragging.enable();

        if (moved) {
          if (checkPanelCollision(panel)) {
            animatePanelToDefault(panel, key);
          } else {
            const leftVal = parseFloat(panel.style.left) || 0;
            const topVal = parseFloat(panel.style.top) || 0;
            try {
              localStorage.setItem(key, JSON.stringify({ left: leftVal, top: topVal }));
            } catch (err) {}
          }
        }
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    };

    grip.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      resetPanelPos(panel, key);
    });
    grip.addEventListener("pointerdown", startDrag);

    if (panelId === "airport-card") {
      panel.addEventListener("pointerdown", (e) => {
        const topBar = e.target.closest(".detail-top");
        if (topBar && !e.target.closest("button")) startDrag(e);
      });
      panel.addEventListener("dblclick", (e) => {
        const topBar = e.target.closest(".detail-top");
        if (topBar && !e.target.closest("button")) {
          e.stopPropagation();
          resetPanelPos(panel, key);
        }
      });
    }
  });

  window.addEventListener("resize", () => {
    DRAGGABLE_CONFIGS.forEach(({ panelId, key }) => {
      const panel = document.getElementById(panelId);
      if (panel && panel.classList.contains("is-dragged")) {
        if (checkPanelCollision(panel)) animatePanelToDefault(panel, key);
      }
    });
  });

  const btnResetLayout = document.getElementById("btn-reset-layout");
  if (btnResetLayout) btnResetLayout.addEventListener("click", resetAllLayoutPositions);
}

// ---------------------------------------------------------------------------
// Region filter population
// ---------------------------------------------------------------------------

function populateRegionFilter() {
  const select = document.getElementById("filter-region");
  const wrap = document.getElementById("filter-region-wrap");
  if (!select || !wrap) return;
  const counts = {};
  let known = 0;
  airportsData.forEach((a) => {
    const c = getContinent(a);
    if (c) {
      known++;
      counts[c] = (counts[c] || 0) + 1;
    }
  });
  // Only expose the filter when we can label (almost) every airport accurately.
  continentFilterAvailable = airportsData.length > 0 && known / airportsData.length >= 0.98;
  if (!continentFilterAvailable) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";
  const codes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  select.innerHTML =
    '<option value="all">All regions</option>' +
    codes.map((c) => `<option value="${c}">${escapeHtml(continentName(c))} (${counts[c]})</option>`).join("");
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function startApp() {
  initMap();
  setupEventListeners();
  loadVectorBasemap();

  try {
    const [forecasts, opportunities, intelligence] = await Promise.all([
      fetchJsonWithFallback(["./forecasts.json", "forecasts.json", "../data/outputs/forecasts.json", "/data/outputs/forecasts.json", "data/outputs/forecasts.json"]),
      fetchJsonWithFallback(["./opportunities.json", "opportunities.json", "../data/outputs/opportunities.json", "/data/outputs/opportunities.json", "data/outputs/opportunities.json"]),
      fetchJsonWithFallback(["./intelligence.json", "intelligence.json", "../data/outputs/intelligence.json"]).catch(() => null),
    ]);

    airportsData = (forecasts.airports || []).filter((a) => a && a.iata);
    window.airportsData = airportsData;
    window.airportLookup = airportLookup;
    window.forecastsMeta = forecasts;
    opportunitiesData = opportunities;
    window.opportunitiesData = opportunities;
    intelligenceData = intelligence && typeof intelligence === "object" ? intelligence : null;
    window.intelligenceData = intelligenceData;
    window.SkylineIntelligence = intelligenceData;

    airportsData.forEach((a) => {
      airportLookup[a.iata] = a;
    });
    resilienceLookup = {};
    if (intelligenceData && intelligenceData.resilience && Array.isArray(intelligenceData.resilience.airports)) {
      intelligenceData.resilience.airports.forEach((r) => {
        if (r && r.iata) resilienceLookup[r.iata] = r;
      });
    }
    rankCache = null;
    networkShiftCache = null;
    dataReady = true;

    renderAboutCard(forecasts);
    updateH10ModeSelect();
    populateRegionFilter();
    renderMarkers();
    updateNetworkShiftHint();

    // Hand data to the intelligence / scenario modules (C2) if they are loaded.
    window.skylineData = { forecasts, opportunities, intelligence: intelligenceData };
    if (window.SkylineIntel && typeof window.SkylineIntel.onDataReady === "function") {
      try {
        window.SkylineIntel.onDataReady(forecasts, opportunities, intelligenceData);
      } catch (e) {
        console.error("SkylineIntel.onDataReady failed:", e);
      }
    }
    try {
      document.dispatchEvent(new CustomEvent("skyline:dataready", { detail: window.skylineData }));
    } catch (e) {}

    // Restore URL state, else default-select Singapore (SIN) on desktop.
    const restored = restoreUrlState();
    if (!restored) {
      if (window.innerWidth >= 700) {
        if (airportLookup["SIN"]) selectAirport(airportLookup["SIN"], { noPan: true });
        else if (airportsData.length > 0) selectAirport(airportsData[0], { noPan: true });
      } else {
        selectedAirport = airportLookup["SIN"] || airportsData[0];
      }
    }
    restoreUrlTab();
    suppressUrlUpdates = false;
    if (showNetworkShifts) drawNetworkShifts();
    updateUrlState();
    layoutLeftPanel();
    document.body.classList.add("data-ready");
  } catch (err) {
    console.error("Error loading skyline-index data:", err);
  }
}

// Highlight a set of airports (used by the Scenario Lab, e.g. hub-closure impact).
let highlightLayerGroup = null;
function highlightAirports(iatas, opts) {
  const options = opts || {};
  if (!map) return;
  if (!highlightLayerGroup) highlightLayerGroup = L.layerGroup().addTo(map);
  highlightLayerGroup.clearLayers();
  const list = (iatas || []).map((x) => (typeof x === "string" ? airportLookup[x.toUpperCase()] : x)).filter((a) => a && a.latitude != null);
  if (list.length === 0) return;
  // Never switches tabs unless explicitly asked ({switchToMap: true}).
  if (options.switchToMap === true && currentTab !== "map") switchTab("map");
  list.forEach((ap, i) => {
    const primary = i === 0;
    L.circleMarker([ap.latitude, ap.longitude], {
      renderer: markerRenderer,
      radius: getAirportRadius(ap, currentHorizon) + (primary ? 7 : 4),
      color: primary ? "#FFB020" : "#FF4D6D",
      weight: primary ? 2.5 : 1.5,
      opacity: 0.95,
      fillColor: primary ? "#FFB020" : "#FF4D6D",
      fillOpacity: primary ? 0.18 : 0.1,
      interactive: false,
    }).addTo(highlightLayerGroup);
  });
  if (options.fit !== false && currentTab === "map") {
    const pts = list.map((a) => [a.latitude, a.longitude]);
    if (pts.length === 1) map.flyTo(pts[0], Math.max(map.getZoom(), 5), { duration: 0.8 });
    else map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 6 });
  }
}

// Public API (used by assistant.js, intel.js, scenario.js and tests)
window.selectAirport = selectAirport;
window.openCountry = openCountry;
window.selectCountry = function (iso) {
  if (currentTab !== "map") switchTab("map");
  openCountry(iso);
};
window.highlightAirports = highlightAirports;
Object.defineProperty(window, "currentHorizon", { get: () => currentHorizon, configurable: true });
window.switchTab = switchTab;
window.setHorizon = setHorizon;
window.playHorizonTimelapse = playHorizonTimelapse;
window.stopHorizonTimelapse = stopHorizonTimelapse;
window.setNetworkShifts = setNetworkShifts;
window.setBasemap = setBasemap;
window.getH10 = getH10;
window.setH10Mode = setH10Mode;
window.getH10Mode = () => h10Mode;
window.openCompareDrawer = openCompareDrawer;
window.setCompareAirports = function (a, b) {
  compareAirportA = a;
  compareAirportB = b;
};
window.getAirportScore = getAirportScore;
window.getAirportClass = getAirportClass;
window.getAirportRank = getRank;
window.getCurrentHorizon = () => currentHorizon;
window.countryName = countryName;
window.geodesicSegments = geodesicSegments;
window.exportDossier = exportDossier;
window.copyShareLink = copyShareLink;
window.showToast = showToast;
window.checkPanelCollision = checkPanelCollision;
window.animatePanelToDefault = animatePanelToDefault;
window.resetAllLayoutPositions = resetAllLayoutPositions;

document.addEventListener("DOMContentLoaded", startApp);
