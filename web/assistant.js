// skyline-index - Voice and Text Assistant (Skyline)
// Legacy Needle smart mode is OFF by default (no remote health ping). Tests inject a URL via setNeedleUrlForTesting.
let NEEDLE_URL = "";

function levenshteinDistance(s1, s2) {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[m][n];
}

function fuzzyMatchAirport(query, airports) {
  if (!query || !airports || airports.length === 0) return [];
  const q = query.trim().toLowerCase().replace(/^[,\s.]+|[,\s.]+$/g, "");
  if (!q) return [];

  // Step 1: Exact matches
  const exactIata = airports.find((a) => a.iata && a.iata.toLowerCase() === q);
  if (exactIata) return [exactIata];

  const exactCity = airports.filter((a) => a.city && a.city.toLowerCase() === q);
  if (exactCity.length > 0) {
    return exactCity.sort((a, b) => (b.importance_present || 0) - (a.importance_present || 0));
  }

  const exactName = airports.filter((a) => a.name && a.name.toLowerCase() === q);
  if (exactName.length > 0) {
    return exactName.sort((a, b) => (b.importance_present || 0) - (a.importance_present || 0));
  }

  // Step 2: Substring matches
  const substringMatches = airports.filter((a) => {
    if (q.length >= 2 && a.iata && a.iata.toLowerCase().includes(q)) return true;
    if (a.city && a.city.toLowerCase().includes(q)) return true;
    if (a.name && a.name.toLowerCase().includes(q)) return true;
    return false;
  });

  if (substringMatches.length > 0) {
    return substringMatches.sort((a, b) => (b.importance_present || 0) - (a.importance_present || 0));
  }

  // Step 3: Edit distance <= 2 on single words
  const qWords = q.split(/\s+/).filter(Boolean);
  if (qWords.length === 1) {
    const qWord = qWords[0];
    const editMatches = airports.filter((a) => {
      if (qWord.length === 3 && a.iata && levenshteinDistance(qWord, a.iata.toLowerCase()) <= 1) {
        return true;
      }
      if (qWord.length < 4) return false;

      const cityTokens = (a.city || "").toLowerCase().split(/[\s,/-]+/).filter((w) => w.length >= 3);
      for (const token of cityTokens) {
        if (Math.abs(token.length - qWord.length) <= 2 && levenshteinDistance(qWord, token) <= 2) {
          return true;
        }
      }

      const nameTokens = (a.name || "").toLowerCase().split(/[\s,/-]+/).filter((w) => w.length >= 4);
      for (const token of nameTokens) {
        if (Math.abs(token.length - qWord.length) <= 2 && levenshteinDistance(qWord, token) <= 2) {
          return true;
        }
      }

      return false;
    });

    if (editMatches.length > 0) {
      return editMatches.sort((a, b) => (b.importance_present || 0) - (a.importance_present || 0));
    }
  } else {
    // Multi-word phrase: check whole string edit distance <= 2
    const editMatches = airports.filter((a) => {
      const city = (a.city || "").toLowerCase();
      if (city && Math.abs(city.length - q.length) <= 2 && levenshteinDistance(q, city) <= 2) {
        return true;
      }
      const name = (a.name || "").toLowerCase();
      if (name && Math.abs(name.length - q.length) <= 2 && levenshteinDistance(q, name) <= 2) {
        return true;
      }
      return false;
    });

    if (editMatches.length > 0) {
      return editMatches.sort((a, b) => (b.importance_present || 0) - (a.importance_present || 0));
    }
  }

  return [];
}

function formatAirportSummary(ap) {
  const cityOrName = ap.city || ap.name;
  const curScore = Number(ap.importance_present.toFixed(1));
  const h5Level = ap.forecast_h5 ? Number(ap.forecast_h5.level.toFixed(1)) : curScore;
  const h10Level = ap.forecast_h10 ? Number(ap.forecast_h10.level.toFixed(1)) : curScore;

  const rawClass = ap.forecast_h5 && ap.forecast_h5.class ? ap.forecast_h5.class : "stable";
  const classNames = {
    established_hub: "Established hub",
    emerging: "Emerging",
    stable: "Stable",
    declining: "Declining",
  };
  const classLabel = classNames[rawClass] || rawClass;

  const dq = ap.data_quality || (ap.importance_confidence === "high" ? "observed" : "static_only");
  const conf = ap.importance_confidence || "medium";

  const parts = [
    `${cityOrName}, ${ap.iata}. Importance ${curScore} now, ${h5Level} at plus five, ${h10Level} at plus ten. ${classLabel}. Data is ${dq} with ${conf} confidence.`,
  ];

  const h5Coverage = ap.forecast_h5 && ap.forecast_h5.coverage_pct != null ? ap.forecast_h5.coverage_pct : 80;
  const h10Coverage = ap.forecast_h10 && ap.forecast_h10.coverage_pct != null ? ap.forecast_h10.coverage_pct : 32.3;

  const h5Caveat = h5Coverage < 70 ? "rough range" : (ap.forecast_h5 && ap.forecast_h5.band_label === "rough range" ? "rough range" : null);
  const h10Caveat = h10Coverage < 70 ? "indicative only" : (ap.forecast_h10 && ap.forecast_h10.band_label === "indicative only" ? "indicative only" : null);

  if (h5Caveat) {
    parts.push(`The plus five range is ${h5Caveat}.`);
  }
  if (h10Caveat) {
    parts.push(`The plus ten range is ${h10Caveat}.`);
  }

  return parts.join(" ");
}

function getAirportClassForHorizon(ap, horizon) {
  if (horizon === "present") {
    return ap.forecast_h5 && ap.forecast_h5.class ? ap.forecast_h5.class : "stable";
  }
  const hData = horizon === "h5" ? ap.forecast_h5 : ap.forecast_h10;
  return hData && hData.class ? hData.class : "stable";
}

function getAirportScoreForHorizon(ap, horizon) {
  if (horizon === "present") return ap.importance_present || 0;
  if (horizon === "h5" && ap.forecast_h5) return ap.forecast_h5.level;
  if (horizon === "h10" && ap.forecast_h10) return ap.forecast_h10.level;
  return ap.importance_present || 0;
}

function parseAssistantCommand(input, airports = [], activeHorizon = "present") {
  const raw = (input || "").trim();
  if (!raw) {
    return {
      type: "empty",
      text: "Please enter or speak a command.",
      spokenText: "Please enter or speak a command.",
    };
  }

  let clean = raw.toLowerCase().replace(/[?!.]+$/g, "").trim();
  clean = clean.replace(/^\s*please\s+/i, "").replace(/\s+please\s*$/i, "").trim();

  // Command: Help
  if (/^(?:help|\?|commands?)$/i.test(clean)) {
    const helpLines = [
      "Skyline commands:",
      "1. Show airport: show Hyderabad, find SIN, go to Tokyo",
      "2. Compare: compare SIN and DXB",
      "3. Top lists: top 10 emerging [at +5], top 10 hubs, top 10 declining",
      "4. Horizons: switch to +5, switch to +10, switch to current",
      "5. Radar: radar for London",
      "6. Reset: reset map and filters",
    ];
    return {
      type: "help",
      text: helpLines.join("\n"),
      spokenText: "You can ask me to show an airport, compare two airports, list top emerging or hubs, switch horizon, or check radar.",
    };
  }

  // Command: Reset
  if (/^reset(?:\s+all|\s+filters|\s+map)?$/i.test(clean)) {
    return {
      type: "reset",
      text: "Reset map view and active filters.",
      spokenText: "Map view and filters have been reset.",
    };
  }

  // Command: Switch Horizon
  const switchMatch = clean.match(/^switch\s+(?:to\s+)?(\+?5|\+?10|current|present)(?:\s+years?)?$/i);
  if (switchMatch) {
    const rawH = switchMatch[1].replace("+", "").toLowerCase();
    let horizonKey = "present";
    let horizonLabel = "current baseline";
    if (rawH === "5") {
      horizonKey = "h5";
      horizonLabel = "+5 years";
    } else if (rawH === "10") {
      horizonKey = "h10";
      horizonLabel = "+10 years";
    }
    return {
      type: "switch_horizon",
      horizon: horizonKey,
      text: `Switched horizon to ${horizonLabel}.`,
      spokenText: `Switched horizon to ${horizonLabel}.`,
    };
  }

  // Command: Radar for X
  const radarMatch = clean.match(/^radar\s+(?:for\s+)?(.+)$/i);
  if (radarMatch) {
    const radarQuery = radarMatch[1].trim();
    const matches = fuzzyMatchAirport(radarQuery, airports);
    if (matches.length === 0) {
      return {
        type: "radar",
        airport: null,
        text: `Airport not found for Opportunity Radar: "${radarQuery}".`,
        spokenText: `Could not find that airport for Opportunity Radar.`,
      };
    }
    const target = matches[0];
    return {
      type: "radar",
      airport: target,
      text: `Opening Opportunity Radar for ${target.city || target.name} (${target.iata}).`,
      spokenText: `Opening Opportunity Radar for ${target.city || target.name}.`,
    };
  }

  // Command: Compare X and Y
  const compareMatch = clean.match(/^compare\s+(.+?)\s+(?:and|with|vs\.?)\s+(.+)$/i);
  if (compareMatch) {
    const queryA = compareMatch[1].trim();
    const queryB = compareMatch[2].trim();
    const matchA = fuzzyMatchAirport(queryA, airports);
    const matchB = fuzzyMatchAirport(queryB, airports);

    if (matchA.length === 0 || matchB.length === 0) {
      const missing = [];
      if (matchA.length === 0) missing.push(`"${queryA}"`);
      if (matchB.length === 0) missing.push(`"${queryB}"`);
      return {
        type: "compare",
        compareAirports: [],
        text: `Unable to compare. Airport not found: ${missing.join(" and ")}.`,
        spokenText: `Could not find one of the comparison airports.`,
      };
    }

    const apA = matchA[0];
    const apB = matchB[0];
    return {
      type: "compare",
      compareAirports: [apA, apB],
      text: `Comparing ${apA.name} (${apA.iata}) and ${apB.name} (${apB.iata}). Opened comparison drawer.`,
      spokenText: `Comparing ${apA.name} and ${apB.name}.`,
    };
  }

  // Command: Top 10 emerging / hubs / declining [at +5 / +10]
  const topMatch = clean.match(/^top\s*(\d+)?\s*(emerging|hubs?|established_hubs?|declining)(?:\s+(?:at|for|in)?\s*(\+?5|\+?10|current|present))?$/i);
  if (topMatch) {
    const count = parseInt(topMatch[1] || "10", 10);
    const catRaw = topMatch[2].toLowerCase();
    let targetClass = "emerging";
    let catTitle = "Emerging";
    if (catRaw.startsWith("hub") || catRaw.includes("established")) {
      targetClass = "established_hub";
      catTitle = "Established Hubs";
    } else if (catRaw === "declining") {
      targetClass = "declining";
      catTitle = "Declining";
    }

    let horizon = activeHorizon || "present";
    let horizonLabel = horizon === "h5" ? "+5 years" : horizon === "h10" ? "+10 years" : "current";
    if (topMatch[3]) {
      const hStr = topMatch[3].replace("+", "").toLowerCase();
      if (hStr === "5") {
        horizon = "h5";
        horizonLabel = "+5 years";
      } else if (hStr === "10") {
        horizon = "h10";
        horizonLabel = "+10 years";
      } else {
        horizon = "present";
        horizonLabel = "current";
      }
    }

    const matchingAirports = airports.filter((a) => getAirportClassForHorizon(a, horizon) === targetClass);

    if (targetClass === "declining") {
      // Sort by largest negative change if forecast exists, else lowest score
      matchingAirports.sort((a, b) => {
        const chA = a.forecast_h5 ? a.forecast_h5.change : 0;
        const chB = b.forecast_h5 ? b.forecast_h5.change : 0;
        return chA - chB;
      });
    } else {
      matchingAirports.sort((a, b) => getAirportScoreForHorizon(b, horizon) - getAirportScoreForHorizon(a, horizon));
    }

    const topList = matchingAirports.slice(0, count);
    const listLines = topList.map((a, idx) => {
      const score = getAirportScoreForHorizon(a, horizon).toFixed(1);
      return `${idx + 1}. ${a.iata} : ${a.city || a.name} (${score})`;
    });

    const header = `Top ${topList.length} ${catTitle} airports at ${horizonLabel}:`;
    return {
      type: "top",
      category: targetClass,
      horizon: horizon,
      airports: topList,
      text: [header, ...listLines].join("\n"),
      spokenText: `Showing top ${topList.length} ${catTitle.toLowerCase()} airports at ${horizonLabel}.`,
    };
  }

  // Command: Show / Find / Go to / Zoom to / Natural phrases
  const showMatch = clean.match(
    /^(?:i\s+want\s+to\s+see|take\s+me\s+to|where\s+is|tell\s+me\s+about|what\s+about|open|show\s+me|show|find|go\s+to|zoom\s+to)\s+(.+)$/i
  );
  let airportQuery = null;
  if (showMatch) {
    let q = showMatch[1].trim();
    // Strip filler words: please, the, airport, airports
    q = q.replace(/\b(?:please|the|airports?)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (q) airportQuery = q;
  }

  // If no prefix, check if short input directly matches an airport after stripping filler words
  if (!airportQuery) {
    const stripped = clean.replace(/\b(?:please|the|airports?)\b/gi, " ").replace(/\s+/g, " ").trim();
    const words = stripped.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.length <= 2) {
      const directMatches = fuzzyMatchAirport(stripped, airports);
      if (directMatches.length > 0) {
        airportQuery = stripped;
      }
    }
  }

  if (airportQuery) {
    const matches = fuzzyMatchAirport(airportQuery, airports);
    if (matches.length === 0) {
      return {
        type: "unknown",
        text: `Airport not found for "${airportQuery}". Say "help" to see what Skyline can do.`,
        spokenText: `Could not find an airport matching ${airportQuery}.`,
      };
    }

    if (matches.length > 1) {
      const top3 = matches.slice(0, 3);
      const listText = top3
        .map((a, idx) => `${idx + 1}. ${a.iata} : ${a.city || a.name} (${(a.importance_present || 0).toFixed(1)})`)
        .join("\n");
      return {
        type: "show",
        multipleMatches: top3,
        airport: null,
        text: `Multiple airports match "${airportQuery}". Which one would you like to see?\n${listText}`,
        spokenText: `Multiple airports match ${airportQuery}. Which one would you like to see? ${top3.map((a) => a.iata).join(", ")}.`,
      };
    }

    const ap = matches[0];
    const summary = formatAirportSummary(ap);
    return {
      type: "show",
      airport: ap,
      multipleMatches: null,
      text: summary,
      spokenText: summary,
    };
  }

  // Unknown command fallback: say what it can do, never guess
  return {
    type: "unknown",
    text: 'I could not map that to the aviation data yet. Say "help" to see what Skyline can do, or try: "show [airport]", "compare [A] and [B]", "top 10 emerging", "switch to +5", "radar for [airport]", or "reset".',
    spokenText: "I could not map that to the data yet. Say help to hear what I can do.",
  };
}

// Browser Controller
let recognitionInstance = null;
let isListening = false;
let isSpeaking = false;
let voiceUtterance = null;
let typewriterTimer = null;
const conversationHistory = [];

function isSpeakerEnabled() {
  try {
    const val = localStorage.getItem("skyline_voice_enabled");
    return val === null ? true : val === "true";
  } catch (e) {
    return true;
  }
}

function setSpeakerEnabled(enabled) {
  try {
    localStorage.setItem("skyline_voice_enabled", enabled ? "true" : "false");
  } catch (e) {
    // Ignore localStorage storage errors
  }
}

function isSmartModeEnabled() {
  try {
    return localStorage.getItem("skyline_smart_mode") === "true";
  } catch (e) {
    return false;
  }
}

function setSmartModeEnabled(enabled) {
  try {
    localStorage.setItem("skyline_smart_mode", enabled ? "true" : "false");
  } catch (e) {
    // Ignore localStorage storage errors
  }
}

function setNeedleUrlForTesting(url) {
  NEEDLE_URL = url || "";
  isFirstSmartCall = true;
  updateSmartModeVisibility();
  if (NEEDLE_URL && isSmartModeEnabled()) {
    pingSmartModeHealth();
  }
}

async function pingSmartModeHealth() {
  if (!NEEDLE_URL || typeof document === "undefined") return;
  const statusChips = [
    document.getElementById("smart-mode-status"),
    document.getElementById("reply-smart-mode-status"),
  ].filter(Boolean);

  statusChips.forEach((chip) => {
    chip.textContent = "Smart mode warming up";
    chip.style.display = "inline-block";
  });

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
  try {
    const res = await fetch(`${NEEDLE_URL}/health`, { signal: controller ? controller.signal : undefined });
    if (timer) clearTimeout(timer);
    if (res.ok) {
      statusChips.forEach((chip) => {
        chip.textContent = "Smart mode ready";
      });
      setTimeout(() => {
        statusChips.forEach((chip) => {
          if (chip.textContent === "Smart mode ready") chip.style.display = "none";
        });
      }, 3000);
    } else {
      statusChips.forEach((chip) => { chip.textContent = "Smart mode offline"; });
    }
  } catch (e) {
    if (timer) clearTimeout(timer);
    statusChips.forEach((chip) => { chip.textContent = "Smart mode offline"; });
  }
}

function updateSmartModeVisibility() {
  if (typeof document === "undefined") return;
  const groups = [
    document.getElementById("settings-group-smart-mode"),
    document.getElementById("reply-smart-mode-field"),
  ].filter(Boolean);

  const isVisible = Boolean(NEEDLE_URL && NEEDLE_URL.trim() !== "");
  groups.forEach((g) => {
    g.style.display = isVisible ? "block" : "none";
  });

  const enabled = isSmartModeEnabled();
  const toggles = [
    document.getElementById("toggle-smart-mode"),
    document.getElementById("reply-toggle-smart-mode"),
  ].filter(Boolean);

  toggles.forEach((t) => {
    t.checked = enabled;
    t.onchange = (e) => {
      const next = e.target.checked;
      setSmartModeEnabled(next);
      toggles.forEach((other) => {
        if (other !== e.target) other.checked = next;
      });
      const replyStatus = document.getElementById("reply-smart-mode-status");
      if (replyStatus) replyStatus.textContent = next ? "On" : "Off";
      if (next && NEEDLE_URL) {
        pingSmartModeHealth();
      }
    };
  });
}

let isFirstSmartCall = true;

async function queryNeedleParse(queryText) {
  if (!NEEDLE_URL || !queryText) return null;
  const timeoutMs = isFirstSmartCall ? 6000 : 4000;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${NEEDLE_URL}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: queryText.slice(0, 200) }),
      signal: controller ? controller.signal : undefined,
    });
    if (timer) clearTimeout(timer);
    isFirstSmartCall = false;
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (timer) clearTimeout(timer);
    isFirstSmartCall = false;
    return null;
  }
}

let audioCtx = null;
let analyserNode = null;
let currentAudioSource = null;
let micMediaStream = null;
let micSourceNode = null;

let kokoroWorker = null;
let kokoroRequestId = 0;
const pendingKokoroRequests = new Map();
let kokoroFallbackToDevice = false;

let simulatedAudioLevel = 0;
let simulatedAudioInterval = null;

function startSyntheticAudioPulsing() {
  stopSyntheticAudioPulsing();
  simulatedAudioInterval = setInterval(() => {
    simulatedAudioLevel = 0.35 + 0.45 * Math.random();
  }, 80);
}

function stopSyntheticAudioPulsing() {
  if (simulatedAudioInterval) {
    clearInterval(simulatedAudioInterval);
    simulatedAudioInterval = null;
  }
  simulatedAudioLevel = 0;
}

function getAudioContext() {
  if (typeof window === "undefined") return { audioCtx: null, analyserNode: null };
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 128;
      analyserNode.smoothingTimeConstant = 0.8;
      analyserNode.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return { audioCtx, analyserNode };
}

function getKokoroWorker() {
  if (typeof Worker === "undefined") return null;
  if (!kokoroWorker) {
    try {
      kokoroWorker = new Worker("tts-worker.js");
      kokoroWorker.onmessage = (e) => {
        const { type, id, pcmData, sampleRate, latencyMs, error } = e.data || {};
        const pending = pendingKokoroRequests.get(id);
        if (!pending) return;
        pendingKokoroRequests.delete(id);

        if (type === "synthesize-success") {
          pending.resolve({ pcmData, sampleRate, latencyMs });
        } else {
          pending.reject(new Error(error || "Synthesis failed"));
        }
      };
      kokoroWorker.onerror = () => {
        kokoroFallbackToDevice = true;
        updateVoiceFallbackLabels(true);
        for (const req of pendingKokoroRequests.values()) {
          req.reject(new Error("Worker error"));
        }
        pendingKokoroRequests.clear();
      };
    } catch (err) {
      kokoroWorker = null;
      kokoroFallbackToDevice = true;
      updateVoiceFallbackLabels(true);
    }
  }
  return kokoroWorker;
}

function synthesizeWithKokoro(text, voice) {
  return new Promise((resolve, reject) => {
    const worker = getKokoroWorker();
    if (!worker || kokoroFallbackToDevice) {
      return reject(new Error("Worker unavailable or fallback active"));
    }
    const id = ++kokoroRequestId;
    pendingKokoroRequests.set(id, { resolve, reject });
    worker.postMessage({ type: "synthesize", id, text, voice });
    setTimeout(() => {
      if (pendingKokoroRequests.has(id)) {
        pendingKokoroRequests.delete(id);
        kokoroFallbackToDevice = true;
        reject(new Error("Synthesis timed out"));
      }
    }, 450);
  });
}

let activeSpeechUtterances = [];
let speechSentenceQueue = [];
let speechPauseTimer = null;

function cancelSpeech() {
  if (speechPauseTimer) {
    clearTimeout(speechPauseTimer);
    speechPauseTimer = null;
  }
  speechSentenceQueue = [];
  activeSpeechUtterances = [];
  if (currentAudioSource) {
    try { currentAudioSource.stop(); } catch (e) {}
    currentAudioSource = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  stopSyntheticAudioPulsing();
  setSpeakingState(false);
  isAnswering = false;
  hideVisualizer();
}

function normalizeTextForSpeech(text) {
  if (!text) return "";
  let s = String(text);

  // Markdown links [title](url) -> title
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Markdown bold, italic, inline code
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  // Brackets [airport] -> airport
  s = s.replace(/\[([^\]]+)\]/g, "$1");
  // Parentheses -> spaces with commas
  s = s.replace(/[()]/g, ", ");

  // Expand horizon notation
  s = s.replace(/\+5(?:\s*years?)?/gi, "plus 5 years");
  s = s.replace(/\+10(?:\s*years?)?/gi, "plus 10 years");

  // Expand decimals: e.g. 29.4 -> 29 point 4
  s = s.replace(/(\d+)\.(\d+)/g, "$1 point $2");

  // Expand percentages: 80% -> 80 percent
  s = s.replace(/%/g, " percent");

  // Expand common abbreviations
  s = s.replace(/\bvs\.?\b/gi, "versus");
  s = s.replace(/\be\.g\.?,?\b/gi, "for example,");
  s = s.replace(/\bi\.e\.?,?\b/gi, "that is,");
  s = s.replace(/\bapprox\.?\b/gi, "approximately");

  // Clean data quality tags
  s = s.replace(/\bstatic_only\b/gi, "static schedule data");

  // Spell out isolated uppercase 3-letter IATA codes so voice articulates each letter
  s = s.replace(/\b([A-Z]{3})\b/g, (m) => m.split("").join(", "));

  // Convert colons, semicolons, and dashes into gentle comma pauses
  s = s.replace(/\s*[-\u2013\u2014]\s*/g, ", ");
  s = s.replace(/:\s+/g, ", ");

  // Collapse multiple commas and whitespace
  s = s.replace(/,\s*,+/g, ",");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function splitSentencesForSpeech(text) {
  if (!text) return [];
  const sentences = text
    .replace(/([.!?]+)(?:\s+|$)/g, "$1|SPLIT|")
    .split("|SPLIT|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences.length > 0 ? sentences : [text.trim()];
}

const MALE_VOICE_PATTERN = /\b(george|david|mark|daniel|richard|oliver|guy|male|ravi|james|stephen|paul|sean|michael|adam|eric|liam|ryan|alex|fred)\b/i;
const FEMALE_VOICE_PATTERN = /\b(zira|heera|jenny|aria|samantha|libby|sonia|serena|maisie|hazel|susan|kate|stephanie|ava|karen|victoria|female)\b|google.*(female|english|uk|us)/i;

function isExcludedVoice(v) {
  const name = v && v.name ? v.name : "";
  return MALE_VOICE_PATTERN.test(name);
}

function pickVoice(voices, savedVoiceURI = null) {
  if (!voices || voices.length === 0) return null;

  if (savedVoiceURI) {
    const saved = voices.find(
      (v) => (v.voiceURI === savedVoiceURI || v.name === savedVoiceURI) && !isExcludedVoice(v)
    );
    if (saved) return saved;
  }

  const validVoices = voices.filter((v) => !isExcludedVoice(v));
  const pool = validVoices.length > 0 ? validVoices : voices;

  // 1. en-GB female (e.g. Laura, Libby, Susan, Sonia, Hazel, Victoria, Google UK English Female)
  const gbFemale = pool.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const name = v.name || "";
    return lang.startsWith("en-gb") && (FEMALE_VOICE_PATTERN.test(name) || !MALE_VOICE_PATTERN.test(name));
  });
  if (gbFemale) return gbFemale;

  // 2. Modern Natural / Neural / Online female voice
  const naturalFemale = pool.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const name = v.name || "";
    return lang.startsWith("en") && /natural|online|neural|google/i.test(name) && !MALE_VOICE_PATTERN.test(name);
  });
  if (naturalFemale) return naturalFemale;

  // 3. en-US or en-IN female (e.g. Heera, Zira, Samantha, Jenny, Ava)
  const usFemale = pool.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const name = v.name || "";
    return (lang.startsWith("en-us") || lang.startsWith("en-in")) && FEMALE_VOICE_PATTERN.test(name);
  });
  if (usFemale) return usFemale;

  // 4. Any English female voice
  const enFemale = pool.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const name = v.name || "";
    return lang.startsWith("en") && FEMALE_VOICE_PATTERN.test(name);
  });
  if (enFemale) return enFemale;

  // 5. Any English voice not explicitly male
  const enNonMale = pool.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const name = v.name || "";
    return lang.startsWith("en") && !MALE_VOICE_PATTERN.test(name);
  });
  if (enNonMale) return enNonMale;

  // 6. en-GB any
  const gbAny = pool.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang.startsWith("en-gb");
  });
  if (gbAny) return gbAny;

  // 7. en any
  const enAny = pool.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang.startsWith("en");
  });
  if (enAny) return enAny;

  return pool[0] || null;
}

const ELEVENLABS_VOICE_ID = "FGY2WhTYpPnrIDTdsKH5"; // Laura (British female)
let elevenlabsExhausted = false;

function getElevenLabsApiKey() {
  try {
    return localStorage.getItem("skyline_elevenlabs_key") ||
      sessionStorage.getItem("skyline_elevenlabs_key") ||
      (typeof window !== "undefined" && window.ELEVENLABS_API_KEY) ||
      "";
  } catch (e) {
    return "";
  }
}

async function synthesizeWithElevenLabs(text) {
  if (elevenlabsExhausted) throw new Error("ElevenLabs credits exhausted");
  const apiKey = getElevenLabsApiKey();

  if (apiKey) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 402 || res.status === 429) {
        elevenlabsExhausted = true;
      }
      throw new Error(`ElevenLabs HTTP ${res.status}`);
    }
    return await res.arrayBuffer();
  }

  if (NEEDLE_URL) {
    const res = await fetch(`${NEEDLE_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 402 || res.status === 429) {
        elevenlabsExhausted = true;
      }
      throw new Error(`ElevenLabs proxy HTTP ${res.status}`);
    }
    return await res.arrayBuffer();
  }

  throw new Error("No ElevenLabs configuration");
}

function getSelectedKokoroVoice() {
  try {
    return localStorage.getItem("skyline_kokoro_voice") || "elevenlabs_laura";
  } catch (e) {
    return "elevenlabs_laura";
  }
}

function updateVoiceFallbackLabels(isFallback) {
  if (typeof document === "undefined") return;
  const notices = [
    document.getElementById("voice-fallback-note"),
    document.getElementById("settings-voice-fallback"),
    document.getElementById("reply-voice-fallback"),
  ].filter(Boolean);

  notices.forEach((note) => {
    if (isFallback) {
      note.textContent = "device voice";
      note.style.display = "block";
    } else {
      note.style.display = "none";
    }
  });
}

function populateVoicePickers() {
  if (typeof document === "undefined") return;

  const selects = [
    document.getElementById("assistant-voice-select"),
    document.getElementById("settings-voice-select"),
    document.getElementById("assistant-reply-voice-select"),
  ].filter(Boolean);

  const selectedVal = getSelectedKokoroVoice();

  const options = [
    { value: "elevenlabs_laura", label: "Laura (British female, ElevenLabs, default)" },
    { value: "bf_emma", label: "Natural AI: Emma (British female)" },
    { value: "af_heart", label: "Natural AI: Heart (American female)" },
    { value: "af_sarah", label: "Natural AI: Sarah (American female)" },
    { value: "bm_george", label: "Natural AI: George (British male)" },
    { value: "device", label: "Device voice (speechSynthesis)" },
  ];

  selects.forEach((sel) => {
    sel.innerHTML = "";
    options.forEach((optData) => {
      const opt = document.createElement("option");
      opt.value = optData.value;
      opt.textContent = optData.label;
      if (opt.value === selectedVal) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });

    sel.onchange = (e) => {
      const val = e.target.value;
      try {
        localStorage.setItem("skyline_kokoro_voice", val);
      } catch (err) {}
      selects.forEach((other) => {
        if (other !== e.target) other.value = val;
      });
    };
  });

  if (kokoroFallbackToDevice) {
    updateVoiceFallbackLabels(true);
  }
}

function speakDeviceSpeech(text) {
  if (typeof window === "undefined" || !window.speechSynthesis || !isSpeakerEnabled() || !text) return;

  cancelSpeech();

  const cleaned = normalizeTextForSpeech(text);
  const sentences = splitSentencesForSpeech(cleaned);
  if (sentences.length === 0) return;

  const UtteranceClass = window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance;
  if (typeof UtteranceClass !== "function") {
    if (typeof window.speechSynthesis.speak === "function") {
      window.speechSynthesis.speak(text);
    }
    return;
  }

  const voices = window.speechSynthesis.getVoices() || [];
  const voice = pickVoice(voices);

  speechSentenceQueue = [...sentences];
  activeSpeechUtterances = [];

  setSpeakingState(true);
  startSyntheticAudioPulsing();

  function playNextSentence() {
    if (speechSentenceQueue.length === 0) {
      stopSyntheticAudioPulsing();
      setSpeakingState(false);
      activeSpeechUtterances = [];
      return;
    }

    const sentence = speechSentenceQueue.shift();
    let utterance = null;
    try {
      utterance = new UtteranceClass(sentence);
      utterance.rate = 0.92;
      utterance.pitch = 1.0;
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        setSpeakingState(true);
      };
      utterance.onend = () => {
        if (speechSentenceQueue.length > 0) {
          speechPauseTimer = setTimeout(playNextSentence, 80);
        } else {
          stopSyntheticAudioPulsing();
          setSpeakingState(false);
          activeSpeechUtterances = [];
        }
      };
      utterance.onerror = () => {
        if (speechSentenceQueue.length > 0) {
          speechPauseTimer = setTimeout(playNextSentence, 80);
        } else {
          stopSyntheticAudioPulsing();
          setSpeakingState(false);
          activeSpeechUtterances = [];
        }
      };
    } catch (e) {
      utterance = null;
    }

    if (utterance) {
      activeSpeechUtterances.push(utterance);
      voiceUtterance = utterance;
      if (typeof window.speechSynthesis.speak === "function") {
        window.speechSynthesis.speak(utterance);
      }
    } else {
      playNextSentence();
    }
  }

  playNextSentence();
}

function setKokoroWorkerForTesting(worker) {
  kokoroWorker = worker;
}

async function speakSpeech(text) {
  cancelSpeech();
  if (!isSpeakerEnabled() || !text) return;

  const chosenVoice = getSelectedKokoroVoice();
  if ((chosenVoice === "elevenlabs_laura" || !chosenVoice) && !elevenlabsExhausted) {
    try {
      setSpeakingState(true);
      const arrayBuffer = await synthesizeWithElevenLabs(text);
      const { audioCtx, analyserNode } = getAudioContext();
      if (!audioCtx || !analyserNode) throw new Error("AudioContext not supported");

      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyserNode);

      currentAudioSource = source;
      source.onended = () => {
        currentAudioSource = null;
        setSpeakingState(false);
      };
      source.start();
      updateVoiceFallbackLabels(false);
      return;
    } catch (err) {
      elevenlabsExhausted = true;
    }
  }

  if (chosenVoice !== "device" && !kokoroFallbackToDevice) {
    try {
      setSpeakingState(true);
      const kokoroVoice = (chosenVoice === "elevenlabs_laura") ? "bf_emma" : chosenVoice;
      const { pcmData, sampleRate } = await synthesizeWithKokoro(text, kokoroVoice);
      const { audioCtx, analyserNode } = getAudioContext();
      if (!audioCtx || !analyserNode) throw new Error("AudioContext not supported");

      const buffer = audioCtx.createBuffer(1, pcmData.length, sampleRate);
      buffer.copyToChannel(new Float32Array(pcmData), 0);

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyserNode);

      currentAudioSource = source;
      source.onended = () => {
        currentAudioSource = null;
        setSpeakingState(false);
      };
      source.start();
      updateVoiceFallbackLabels(false);
      return;
    } catch (err) {
      kokoroFallbackToDevice = true;
      updateVoiceFallbackLabels(true);
    }
  }

  speakDeviceSpeech(text);
}

async function startListeningWithAnalyser() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micMediaStream = stream;
    const { audioCtx, analyserNode } = getAudioContext();
    if (audioCtx && analyserNode) {
      micSourceNode = audioCtx.createMediaStreamSource(stream);
      micSourceNode.connect(analyserNode);
    }
  } catch (e) {}
}

function stopListeningAnalyser() {
  if (micSourceNode) {
    try { micSourceNode.disconnect(); } catch (e) {}
    micSourceNode = null;
  }
  if (micMediaStream) {
    micMediaStream.getTracks().forEach((track) => track.stop());
    micMediaStream = null;
  }
}

// 3D Icosphere Vertices & Edges (42 vertices)
const ICO_VERTICES = (() => {
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1,  phi, 0], [ 1,  phi, 0], [-1, -phi, 0], [ 1, -phi, 0],
    [ 0, -1,  phi], [ 0,  1,  phi], [ 0, -1, -phi], [ 0,  1, -phi],
    [ phi, 0, -1], [ phi, 0,  1], [-phi, 0, -1], [-phi, 0,  1],
  ];
  return raw.map(([x, y, z]) => {
    const len = Math.hypot(x, y, z);
    return [x / len, y / len, z / len];
  });
})();

const ICO_EDGES = [
  [0, 1], [0, 5], [0, 7], [0, 10], [0, 11],
  [1, 5], [1, 7], [1, 8], [1, 9],
  [2, 3], [2, 4], [2, 6], [2, 10], [2, 11],
  [3, 4], [3, 6], [3, 8], [3, 9],
  [4, 5], [4, 9], [4, 11],
  [5, 9], [5, 11],
  [6, 7], [6, 8], [6, 10],
  [7, 8], [7, 10],
  [8, 9],
  [10, 11],
];

let visualizerCanvas = null;
let visualizerCtx = null;
let visualizerAnimId = null;
let isAnswering = false;

function showVisualizer() {
  if (visualizerCanvas) {
    visualizerCanvas.style.display = "block";
  }
}

function hideVisualizer() {
  if (visualizerCanvas && !isSpeaking && !isAnswering) {
    visualizerCanvas.style.display = "none";
  }
}

function initVisualizer() {
  if (typeof document === "undefined") return;
  visualizerCanvas = document.getElementById("assistant-visualizer");
  if (!visualizerCanvas) return;
  visualizerCtx = visualizerCanvas.getContext("2d");
  if (!visualizerCtx) return;

  let angleY = 0;
  let angleX = 0;
  let ringAngle1 = 0;
  let ringAngle2 = 0;
  let ringAngle3 = 0;
  let lastTime = performance.now();

  const freqArray = new Uint8Array(64);

  function drawFrame(now) {
    visualizerAnimId = requestAnimationFrame(drawFrame);
    if (!visualizerCanvas || visualizerCanvas.style.display === "none") return;

    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    const width = visualizerCanvas.width || 320;
    const height = visualizerCanvas.height || 320;
    const ctx = visualizerCtx;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const baseRadius = width * 0.22;

    let audioLevel = simulatedAudioLevel;
    if (analyserNode && (isSpeaking || isListening)) {
      analyserNode.getByteFrequencyData(freqArray);
      let sum = 0;
      for (let i = 0; i < freqArray.length; i++) {
        sum += freqArray[i];
      }
      audioLevel = Math.max(audioLevel, sum / (freqArray.length * 255));
    }

    const isIdle = !isSpeaking && !isListening;
    const breath = isIdle ? Math.sin(now * 0.001 * Math.PI) * 0.05 : 0;
    const dynamicLevel = isIdle ? 0.04 + breath : audioLevel;

    const peakRatio = Math.min(1, Math.max(0, (dynamicLevel - 0.2) / 0.6));
    const r = Math.round(0 + peakRatio * 255);
    const g = Math.round(210 - peakRatio * 34);
    const b = Math.round(255 - peakRatio * 223);
    const primaryColor = `rgb(${r}, ${g}, ${b})`;
    const glowAlpha = isIdle ? 0.45 : 0.85;

    const rotSpeed = isIdle ? 0.25 : (0.6 + dynamicLevel * 3.5);
    ringAngle1 += dt * rotSpeed;
    ringAngle2 -= dt * rotSpeed * 0.8;
    ringAngle3 += dt * rotSpeed * 1.2;

    ctx.save();
    ctx.shadowBlur = isIdle ? 4 : 10;
    ctx.shadowColor = primaryColor;
    ctx.lineWidth = 1;

    // Outer Ring 3
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha * 0.55})`;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.85 * (1 + breath), ringAngle3, ringAngle3 + Math.PI * 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.85 * (1 + breath), ringAngle3 + Math.PI * 1.4, ringAngle3 + Math.PI * 1.9);
    ctx.stroke();

    // Outer Ring 2
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha * 0.75})`;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.55 * (1 + breath * 0.5), ringAngle2, ringAngle2 + Math.PI * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.55 * (1 + breath * 0.5), ringAngle2 + Math.PI * 0.9, ringAngle2 + Math.PI * 1.7);
    ctx.stroke();

    // Outer Ring 1
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha})`;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.25 * (1 + breath * 0.3), ringAngle1, ringAngle1 + Math.PI * 1.5);
    ctx.stroke();

    // 3D Core wireframe icosphere
    angleY += dt * (isIdle ? 0.4 : 1.2 + dynamicLevel * 2.5);
    angleX += dt * (isIdle ? 0.2 : 0.6 + dynamicLevel * 1.2);

    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);
    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);

    const projected = ICO_VERTICES.map(([vx, vy, vz], idx) => {
      const x1 = vx * cosY + vz * sinY;
      const z1 = -vx * sinY + vz * cosY;
      const y2 = vy * cosX - z1 * sinX;
      const z2 = vy * sinX + z1 * cosX;

      const freqVal = freqArray[idx % freqArray.length] / 255;
      const deform = 1 + (isIdle ? breath : dynamicLevel * 0.45 + freqVal * 0.3);
      const rad = baseRadius * deform;

      const fov = 300;
      const pScale = fov / (fov + z2 * rad * 0.5);
      return {
        px: cx + x1 * rad * pScale,
        py: cy + y2 * rad * pScale,
        pz: z2,
      };
    });

    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha * 0.75})`;
    for (const [i1, i2] of ICO_EDGES) {
      const p1 = projected[i1];
      const p2 = projected[i2];
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
      ctx.stroke();
    }

    ctx.fillStyle = primaryColor;
    for (const p of projected) {
      ctx.beginPath();
      ctx.arc(p.px, p.py, isIdle ? 1.5 : 2.5 + dynamicLevel * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  if (typeof requestAnimationFrame !== "undefined") {
    drawFrame(performance.now());
  }
}

function setListeningState(listening) {
  isListening = listening;
  const orb = document.getElementById("btn-assistant-orb");
  const micBtn = document.getElementById("btn-assistant-mic");
  if (orb) {
    if (listening) orb.classList.add("listening");
    else orb.classList.remove("listening");
  }
  if (micBtn) {
    if (listening) micBtn.classList.add("listening");
    else micBtn.classList.remove("listening");
  }
  if (listening) {
    startListeningWithAnalyser();
  } else {
    stopListeningAnalyser();
  }
}

function setSpeakingState(speaking) {
  isSpeaking = speaking;
  const orb = document.getElementById("btn-assistant-orb");
  const waveform = document.getElementById("assistant-waveform");
  if (orb) {
    if (speaking) orb.classList.add("speaking");
    else orb.classList.remove("speaking");
  }
  if (waveform) {
    waveform.style.display = speaking ? "flex" : "none";
  }
  if (speaking) {
    showVisualizer();
  } else {
    if (!isAnswering) hideVisualizer();
  }
}

function triggerPulseRing(lat, lon) {
  const mapInstance = window.map;
  if (!mapInstance || lat == null || lon == null || typeof L === "undefined") return;

  const pulseMarker = L.circleMarker([lat, lon], {
    radius: 12,
    color: "#F2A93B",
    fillColor: "#F2A93B",
    fillOpacity: 0.6,
    weight: 2,
    className: "skyline-pulse-ring",
  }).addTo(mapInstance);

  let frame = 0;
  const maxFrames = 25;
  const interval = setInterval(() => {
    frame++;
    const progress = frame / maxFrames;
    const currentRadius = 12 + progress * 28;
    const opacity = Math.max(0, 0.6 * (1 - progress));
    pulseMarker.setRadius(currentRadius);
    pulseMarker.setStyle({ fillOpacity: opacity, opacity: opacity });
    if (frame >= maxFrames) {
      clearInterval(interval);
      mapInstance.removeLayer(pulseMarker);
    }
  }, 50);
}

// ---------------------------------------------------------------------------
// Copilot chat thread, action dispatch and optional bring-your-own-model LLM
// ---------------------------------------------------------------------------
const MAX_HISTORY = 60;
let copilotLayerGroup = null;
let copilotHighlightGroup = null;
let copilotSelectedIata = null;
let intelligenceFetchAttempted = false;
let placeholderTimer = null;

const PLACEHOLDER_EXAMPLES = [
  "Which Indian airports grow most by 2035?",
  "Is there a direct route DEL→SFO?",
  "What happens if DXB closes?",
  "Compare SIN and DXB",
  "Fastest growing countries in Africa",
  "Where does Hyderabad rank?",
  "If India's GDP grows 2% faster…",
  "Why is BLR emerging?",
];

function escapeHtmlText(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function getActiveHorizon() {
  if (typeof window.getCurrentHorizon === "function") return window.getCurrentHorizon();
  if (window.currentHorizon) return window.currentHorizon;
  const btn = document.querySelector(".horizon-option.selected, .horizon-option.active");
  return btn ? btn.getAttribute("data-horizon") || "present" : "present";
}

function getSelectedAirportForCopilot() {
  const lookup = window.airportLookup || {};
  if (copilotSelectedIata && lookup[copilotSelectedIata]) return lookup[copilotSelectedIata];
  const summary = document.getElementById("summary-iata");
  if (summary && lookup[summary.textContent.trim()]) return lookup[summary.textContent.trim()];
  return lookup.SIN || null;
}

async function ensureIntelligenceLoaded() {
  if (window.intelligenceData || intelligenceFetchAttempted) return window.intelligenceData || null;
  intelligenceFetchAttempted = true;
  try {
    const res = await fetch("intelligence.json", { cache: "force-cache" });
    if (res.ok) {
      const json = await res.json();
      if (json && json.countries) window.intelligenceData = json;
    }
  } catch (e) {
    // graceful: engine computes aggregates client-side
  }
  return window.intelligenceData || null;
}

function buildCopilotContext() {
  return {
    airports: window.airportsData || [],
    airportLookup: window.airportLookup || {},
    opportunities: window.opportunitiesData || null,
    intelligence: window.intelligenceData || undefined,
    meta: window.forecastsMeta || null,
    horizon: getActiveHorizon(),
    h10Mode: window.SKYLINE_H10_MODE === "raw" ? "raw" : "damped",
    selectedAirport: getSelectedAirportForCopilot(),
    history: conversationHistory.slice(-8),
  };
}

// ---- LLM (bring your own key) --------------------------------------------
function getLlmConfig() {
  try {
    const raw = localStorage.getItem("skyline_llm_config");
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    return cfg && cfg.key && cfg.model ? cfg : null;
  } catch (e) {
    return null;
  }
}

function setLlmConfig(cfg) {
  try {
    if (!cfg) localStorage.removeItem("skyline_llm_config");
    else localStorage.setItem("skyline_llm_config", JSON.stringify(cfg));
  } catch (e) {}
  updateLlmStatus();
}

function updateLlmStatus() {
  const el = document.getElementById("assistant-llm-status");
  if (!el) return;
  const cfg = getLlmConfig();
  el.textContent = cfg ? `Model mode on: ${cfg.model} (${cfg.provider === "gemini" ? "Gemini" : "OpenAI-compatible"})` : "Local engine only";
}

const LLM_TOOLS = [
  { name: "select_airport", description: "Select an airport on the map", parameters: { type: "object", properties: { iata: { type: "string" } }, required: ["iata"] } },
  { name: "set_horizon", description: "Set forecast horizon", parameters: { type: "object", properties: { horizon: { type: "string", enum: ["present", "h5", "h10"] } }, required: ["horizon"] } },
  { name: "switch_tab", description: "Open a view", parameters: { type: "object", properties: { tab: { type: "string", enum: ["map", "radar", "intel", "scenario", "method"] } }, required: ["tab"] } },
  { name: "compare", description: "Compare two airports", parameters: { type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a", "b"] } },
  { name: "draw_route", description: "Draw a route between two airports", parameters: { type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a", "b"] } },
  { name: "highlight", description: "Highlight airports on the map", parameters: { type: "object", properties: { iatas: { type: "array", items: { type: "string" } } }, required: ["iatas"] } },
  { name: "fly_to", description: "Fly the map to coordinates", parameters: { type: "object", properties: { lat: { type: "number" }, lon: { type: "number" }, zoom: { type: "number" } }, required: ["lat", "lon"] } },
];

function llmSystemPrompt() {
  return "You are Skyline Copilot, an aviation intelligence assistant embedded in a map of 4,079 airports with importance scores (0-100) today, 2030 and 2035, class labels (emerging, stable, declining, established_hub), route network and country aggregates. Answer ONLY from the JSON context provided, which comes from the project dataset; never use outside knowledge about airports, traffic or economies. If the context lacks the facts, say so and suggest a more specific question. Reply in at most 3 short sentences of plain text, numbers to one decimal, then optionally call tools to drive the map. Never invent airports or numbers.";
}

async function queryLlm(text, localResult) {
  const cfg = getLlmConfig();
  if (!cfg || !window.SkylineCopilot || typeof fetch !== "function") return null;
  const context = window.SkylineCopilot.compactContext(text, buildCopilotContext(), 6000);
  context.local_engine_answer = (localResult && localResult.reply) || null;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
  try {
    let replyText = "";
    const actions = [];
    if (cfg.provider === "gemini") {
      const base = (cfg.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
      const res = await fetch(`${base}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller ? controller.signal : undefined,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: llmSystemPrompt() }] },
          contents: [{ role: "user", parts: [{ text: `Question: ${text}\nContext JSON: ${JSON.stringify(context)}` }] }],
          tools: [{ functionDeclarations: LLM_TOOLS }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
      parts.forEach((p) => {
        if (p.text) replyText += p.text;
        if (p.functionCall && p.functionCall.name) actions.push(Object.assign({ type: p.functionCall.name }, p.functionCall.args || {}));
      });
    } else {
      const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` }, signal: controller ? controller.signal : undefined,
        body: JSON.stringify({
          model: cfg.model, temperature: 0.2,
          messages: [{ role: "system", content: llmSystemPrompt() }, { role: "user", content: `Question: ${text}\nContext JSON: ${JSON.stringify(context)}` }],
          tools: LLM_TOOLS.map((t) => ({ type: "function", function: t })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const msg = ((json.choices || [])[0] || {}).message || {};
      replyText = msg.content || "";
      (msg.tool_calls || []).forEach((tc) => {
        try { actions.push(Object.assign({ type: tc.function.name }, JSON.parse(tc.function.arguments || "{}"))); } catch (e) {}
      });
    }
    if (timer) clearTimeout(timer);
    replyText = String(replyText || "").trim();
    if (!replyText && !actions.length) return null;
    return { reply: replyText || (localResult && localResult.reply) || "", actions, source: cfg.provider === "gemini" ? "gemini" : "openai" };
  } catch (e) {
    if (timer) clearTimeout(timer);
    return null;
  }
}

// ---- Action dispatch ------------------------------------------------------
function getCopilotLayers() {
  if (!window.map || typeof L === "undefined") return null;
  if (!copilotLayerGroup) copilotLayerGroup = L.layerGroup().addTo(window.map);
  if (!copilotHighlightGroup) copilotHighlightGroup = L.layerGroup().addTo(window.map);
  return { routes: copilotLayerGroup, highlights: copilotHighlightGroup };
}

function clearCopilotOverlays() {
  if (copilotLayerGroup) copilotLayerGroup.clearLayers();
  if (copilotHighlightGroup) copilotHighlightGroup.clearLayers();
}

function latLngOf(iata) {
  const ap = (window.airportLookup || {})[iata];
  return ap && ap.latitude != null && ap.longitude != null ? [ap.latitude, ap.longitude] : null;
}

function applyCopilotAction(action) {
  if (!action || !action.type) return;
  const lookup = window.airportLookup || {};
  const map = window.map;
  switch (action.type) {
    case "select_airport": {
      const ap = lookup[String(action.iata || "").toUpperCase()];
      if (!ap) return;
      copilotSelectedIata = ap.iata;
      if (typeof window.switchTab === "function" && document.body.classList.contains("radar-tab-active")) window.switchTab("map", { closeReply: false });
      if (typeof window.selectAirport === "function") window.selectAirport(ap);
      if (map && ap.latitude != null) {
        map.flyTo([ap.latitude, ap.longitude], Math.max(map.getZoom(), 5), { duration: 1.0 });
        triggerPulseRing(ap.latitude, ap.longitude);
      }
      return;
    }
    case "fly_to": {
      if (map && action.lat != null && action.lon != null) map.flyTo([action.lat, action.lon], action.zoom || 6, { duration: 1.2 });
      return;
    }
    case "set_horizon": {
      if (typeof window.setHorizon === "function") window.setHorizon(action.horizon);
      else { const btn = document.getElementById("btn-horizon-" + action.horizon); if (btn) btn.click(); }
      return;
    }
    case "switch_tab": {
      if (typeof window.switchTab === "function") window.switchTab(action.tab, { closeReply: false });
      return;
    }
    case "compare": {
      if (!lookup[action.a] || !lookup[action.b]) return;
      if (typeof window.setCompareAirports === "function") window.setCompareAirports(action.a, action.b);
      if (typeof window.openCompareDrawer === "function") window.openCompareDrawer();
      return;
    }
    case "filter": {
      const classes = action.classes || [];
      if (classes.length) {
        document.querySelectorAll("#class-filters-list input").forEach((input) => {
          const next = classes.includes(input.value);
          if (input.checked !== next) { input.checked = next; input.dispatchEvent(new Event("change", { bubbles: true })); }
        });
      }
      return;
    }
    case "draw_route": {
      const layers = getCopilotLayers();
      if (!layers) return;
      const path = Array.isArray(action.path) && action.path.length >= 2 ? action.path : [action.a, action.b];
      const pts = path.map(latLngOf).filter(Boolean);
      if (pts.length < 2) return;
      for (let i = 1; i < pts.length; i++) {
        const seg = typeof window.geodesicSegments === "function" ? null : null;
        L.polyline([pts[i - 1], pts[i]], { color: action.candidate ? "#3D9BFF" : "#FFB020", weight: 2.5, opacity: 0.9, dashArray: action.candidate ? "6 8" : null, className: "copilot-route" }).addTo(layers.routes);
      }
      pts.forEach((p) => L.circleMarker(p, { radius: 5, color: "#FFB020", fillColor: "#0B0E12", fillOpacity: 1, weight: 2 }).addTo(layers.routes));
      if (map) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 6 });
      return;
    }
    case "highlight": {
      const layers = getCopilotLayers();
      if (!layers) return;
      (action.iatas || []).slice(0, 250).forEach((code) => {
        const p = latLngOf(code);
        if (p) L.circleMarker(p, { radius: 9, color: "#FFB020", fillColor: "#FFB020", fillOpacity: 0.18, weight: 1.5, className: "copilot-highlight" }).addTo(layers.highlights);
      });
      return;
    }
    case "fit_bounds": {
      const pts = (action.iatas || []).map(latLngOf).filter(Boolean);
      if (map && pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 6 });
      return;
    }
    case "reset": {
      const resetBtn = document.getElementById("btn-reset-filters");
      if (resetBtn) resetBtn.click();
      clearCopilotOverlays();
      if (map) map.flyTo([22.0, 15.0], 3, { duration: 1.0 });
      return;
    }
    case "zoom": {
      if (map) { if (action.direction === "in") map.zoomIn(); else map.zoomOut(); }
      return;
    }
    case "ask": {
      if (action.q) executeAssistantCommand(action.q);
      return;
    }
    default:
      return;
  }
}

function applyCopilotActions(actions) {
  if (!Array.isArray(actions)) return;
  const hasOverlay = actions.some((a) => a.type === "draw_route" || a.type === "highlight");
  if (hasOverlay) clearCopilotOverlays();
  actions.forEach((a) => {
    try { applyCopilotAction(a); } catch (e) { /* never let a UI side effect break the chat */ }
  });
}

// ---- Thread rendering -----------------------------------------------------
function formatTime(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
}

function buildExchangeElement(item, index, animate) {
  const exchangeEl = document.createElement("div");
  exchangeEl.className = "reply-exchange cp-exchange";
  exchangeEl.setAttribute("data-index", String(index));

  const userRow = document.createElement("div");
  userRow.className = "cp-msg cp-msg-user";
  userRow.innerHTML = `<div class="cp-bubble cp-bubble-user reply-query">${escapeHtmlText(item.query)}</div><div class="cp-meta">${formatTime(item.ts)}</div>`;
  exchangeEl.appendChild(userRow);

  const botRow = document.createElement("div");
  botRow.className = "cp-msg cp-msg-bot";
  const bubble = document.createElement("div");
  bubble.className = "cp-bubble cp-bubble-bot";
  const replyEl = document.createElement("div");
  replyEl.className = "reply-answer cp-reply";
  bubble.appendChild(replyEl);
  if (item.html) {
    const rich = document.createElement("div");
    rich.className = "cp-rich";
    rich.innerHTML = item.html;
    bubble.appendChild(rich);
  }
  if (item.followups && item.followups.length) {
    const fu = document.createElement("div");
    fu.className = "cp-followups";
    item.followups.slice(0, 3).forEach((q) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "cp-followup"; b.setAttribute("data-copilot-ask", q); b.textContent = q;
      fu.appendChild(b);
    });
    bubble.appendChild(fu);
  }
  const meta = document.createElement("div");
  meta.className = "cp-meta";
  const intentLabel = (item.intent || "").replace(/_/g, " ");
  meta.innerHTML = `${escapeHtmlText(intentLabel)}${item.confidence != null ? ` · ${Math.round(item.confidence * 100)}%` : ""}${item.smartSource && item.smartSource !== "none" ? ` · <span class="reply-smart-badge" title="${escapeHtmlText(item.smartSource)}">${item.smartSource === "needle" ? "Smart mode" : "Model mode"}</span>` : ""}`;
  botRow.appendChild(bubble);
  botRow.appendChild(meta);
  exchangeEl.appendChild(botRow);

  // Legacy multiple-match chooser (kept for tests)
  if (item.multipleMatches && item.multipleMatches.length > 0) {
    const choicesEl = document.createElement("div");
    choicesEl.className = "reply-choices";
    item.multipleMatches.forEach((matchAp) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "reply-choice-btn"; btn.setAttribute("data-iata", matchAp.iata);
      btn.innerHTML = `<strong>${escapeHtmlText(matchAp.iata)}</strong> ${escapeHtmlText(matchAp.city || matchAp.name)}`;
      btn.addEventListener("click", () => executeAssistantCommand(`show ${matchAp.iata}`));
      choicesEl.appendChild(btn);
    });
    bubble.appendChild(choicesEl);
  }

  if (animate) {
    replyEl.textContent = "";
    isAnswering = true;
    showVisualizer();
    let charIdx = 0;
    const fullText = item.reply || "";
    const panel = document.getElementById("assistant-reply-panel");
    typewriterTimer = setInterval(() => {
      if (charIdx < fullText.length) {
        charIdx = Math.min(fullText.length, charIdx + 2);
        replyEl.textContent = fullText.slice(0, charIdx);
        if (panel) scrollThreadToEnd();
      } else {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
        isAnswering = false;
        if (!isSpeaking) hideVisualizer();
      }
    }, 10);
  } else {
    replyEl.textContent = item.reply || "";
  }
  return exchangeEl;
}

function renderReplyPanel(latestTyped = true) {
  const panel = document.getElementById("assistant-reply-panel");
  const historyList = document.getElementById("assistant-history-list");
  if (!panel || !historyList) return;

  if (conversationHistory.length === 0) {
    panel.style.display = "none";
    document.body.classList.remove("reply-panel-open");
    return;
  }
  panel.style.display = "flex";
  document.body.classList.add("reply-panel-open");
  if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }

  const rendered = historyList.children.length;
  const lastIndex = conversationHistory.length - 1;
  if (rendered === lastIndex && rendered > 0) {
    // Incremental append keeps earlier cards (and their scroll) intact
    historyList.appendChild(buildExchangeElement(conversationHistory[lastIndex], lastIndex, latestTyped));
  } else {
    historyList.innerHTML = "";
    conversationHistory.forEach((item, index) => {
      historyList.appendChild(buildExchangeElement(item, index, latestTyped && index === lastIndex));
    });
  }
  scrollThreadToEnd();
  requestAnimationFrame(() => { scrollThreadToEnd(); nudgePanelIfColliding(panel); });
}

function scrollThreadToEnd() {
  const historyList = document.getElementById("assistant-history-list");
  if (historyList) historyList.scrollTop = historyList.scrollHeight;
}

function nudgePanelIfColliding(panel) {
  // Cooperate with app.js anti-collision helpers when the panel was dragged somewhere awkward.
  if (!panel || typeof window.checkPanelCollision !== "function") return;
  if (panel.classList.contains("is-dragged") && window.checkPanelCollision(panel) && typeof window.animatePanelToDefault === "function") {
    window.animatePanelToDefault(panel, "reply-panel");
  }
}

function setTypingIndicator(on) {
  const el = document.getElementById("assistant-typing");
  if (el) el.style.display = on ? "flex" : "none";
  const panel = document.getElementById("assistant-reply-panel");
  if (on && panel && panel.style.display === "none" && conversationHistory.length === 0) {
    panel.style.display = "flex";
    document.body.classList.add("reply-panel-open");
  }
}

function closeReplyPanel() {
  const panel = document.getElementById("assistant-reply-panel");
  if (panel) panel.style.display = "none";
  document.body.classList.remove("reply-panel-open");
  isAnswering = false;
  if (!isSpeaking) hideVisualizer();
}

function clearConversation() {
  conversationHistory.length = 0;
  const historyList = document.getElementById("assistant-history-list");
  if (historyList) historyList.innerHTML = "";
  clearCopilotOverlays();
  closeReplyPanel();
}

// ---- Legacy Needle mapping (kept, off by default) --------------------------
function mapNeedleCallToText(call) {
  if (!call || !call.name) return null;
  const args = call.args || {};
  switch (call.name) {
    case "select_airport": return args.query ? "show " + args.query : null;
    case "compare_airports": return args.a && args.b ? "compare " + args.a + " and " + args.b : null;
    case "top_airports": return args.kind ? "top " + (args.n || 10) + " " + args.kind + (args.horizon ? " at +" + args.horizon : "") : null;
    case "switch_horizon": return args.horizon != null ? "switch to +" + args.horizon : null;
    case "radar": return args.airport ? "radar for " + args.airport : null;
    case "reset": return "reset";
    case "help": return "help";
    default: return null;
  }
}

// ---- Main entry point -----------------------------------------------------
async function executeAssistantCommand(inputStr) {
  const text = (inputStr || "").trim();
  if (!text) return;

  cancelSpeech();
  setTypingIndicator(true);
  await ensureIntelligenceLoaded();

  const airports = window.airportsData || [];
  const ctx = buildCopilotContext();
  let result;
  let smartSource = null;

  if (window.SkylineCopilot && typeof window.SkylineCopilot.answer === "function" && airports.length) {
    try {
      result = window.SkylineCopilot.answer(text, ctx);
    } catch (err) {
      result = null;
    }
  }
  if (!result) {
    // Engine missing or data not loaded: legacy parser keeps the lights on
    const legacy = parseAssistantCommand(text, airports, ctx.horizon);
    result = { reply: legacy.text, html: "", actions: [], followups: [], confidence: legacy.type === "unknown" ? 0.2 : 0.7, intent: legacy.type, multipleMatches: legacy.multipleMatches, legacy };
  }

  // Low-confidence: optional remote helpers (both off unless the user enables them)
  if (result.confidence < 0.6) {
    if (isSmartModeEnabled() && NEEDLE_URL) {
      const parseRes = await queryNeedleParse(text);
      if (parseRes && Array.isArray(parseRes.calls) && parseRes.calls.length > 0) {
        const mapped = mapNeedleCallToText(parseRes.calls[0]);
        if (mapped && window.SkylineCopilot) {
          const r2 = window.SkylineCopilot.answer(mapped, ctx);
          if (r2 && r2.confidence > result.confidence) { result = r2; smartSource = parseRes.source || "needle"; }
        }
      }
    }
    if (!smartSource && getLlmConfig()) {
      const llm = await queryLlm(text, result);
      if (llm) {
        result = Object.assign({}, result, { reply: llm.reply, actions: (llm.actions || []).concat(result.actions || []), intent: result.intent === "fallback" ? "open_question" : result.intent, confidence: Math.max(result.confidence, 0.7) });
        smartSource = llm.source;
      }
    }
  }

  const item = {
    query: text,
    reply: result.reply || "",
    html: result.html || "",
    intent: result.intent || "fallback",
    confidence: result.confidence != null ? result.confidence : 0.5,
    entities: result.entities || null,
    actions: result.actions || [],
    followups: result.followups || [],
    multipleMatches: result.multipleMatches || null,
    smartSource: smartSource,
    ts: Date.now(),
  };
  conversationHistory.push(item);
  if (conversationHistory.length > MAX_HISTORY) conversationHistory.shift();

  setTypingIndicator(false);
  renderReplyPanel(true);

  if (item.reply) speakSpeech(result && result.spokenText ? result.spokenText : item.reply);

  // Side effects
  if (result.legacy) applyLegacySideEffects(result.legacy);
  else applyCopilotActions(item.actions);
  return item;
}

function applyLegacySideEffects(result) {
  if (result.type === "show" && result.airport) {
    applyCopilotActions([{ type: "select_airport", iata: result.airport.iata }]);
  } else if (result.type === "compare" && result.compareAirports && result.compareAirports.length === 2) {
    applyCopilotActions([{ type: "compare", a: result.compareAirports[0].iata, b: result.compareAirports[1].iata }]);
  } else if (result.type === "top" && result.airports && result.airports.length > 0) {
    applyCopilotActions([{ type: "fit_bounds", iatas: result.airports.map((a) => a.iata) }]);
  } else if (result.type === "switch_horizon") {
    applyCopilotActions([{ type: "set_horizon", horizon: result.horizon }]);
  } else if (result.type === "radar") {
    applyCopilotActions([{ type: "switch_tab", tab: "radar" }]);
  } else if (result.type === "reset") {
    applyCopilotActions([{ type: "reset" }]);
  }
}

function initCopilotUi() {
  const historyList = document.getElementById("assistant-history-list");
  const panel = document.getElementById("assistant-reply-panel");
  if (historyList) {
    historyList.addEventListener("click", (e) => {
      const ask = e.target.closest("[data-copilot-ask]");
      if (ask) { e.preventDefault(); executeAssistantCommand(ask.getAttribute("data-copilot-ask")); return; }
      const actEl = e.target.closest("[data-copilot-action]");
      if (actEl) {
        e.preventDefault();
        try { applyCopilotActions([JSON.parse(actEl.getAttribute("data-copilot-action"))]); } catch (err) {}
      }
    });
    historyList.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-copilot-action][role=button]")) {
        e.preventDefault();
        try { applyCopilotActions([JSON.parse(e.target.getAttribute("data-copilot-action"))]); } catch (err) {}
      }
    });
  }
  const clearBtn = document.getElementById("btn-assistant-clear");
  if (clearBtn) clearBtn.addEventListener("click", clearConversation);

  // Placeholder rotation
  const input = document.getElementById("assistant-input");
  if (input) {
    let i = 0;
    const rotate = () => {
      if (document.activeElement === input && input.value) return;
      i = (i + 1) % PLACEHOLDER_EXAMPLES.length;
      input.setAttribute("placeholder", "Ask Skyline: " + PLACEHOLDER_EXAMPLES[i]);
    };
    input.setAttribute("placeholder", "Ask Skyline: " + PLACEHOLDER_EXAMPLES[0]);
    placeholderTimer = setInterval(rotate, 4000);
  }

  // Bring-your-own-model settings
  const provider = document.getElementById("assistant-llm-provider");
  const model = document.getElementById("assistant-llm-model");
  const base = document.getElementById("assistant-llm-base");
  const key = document.getElementById("assistant-llm-key");
  const save = document.getElementById("btn-assistant-llm-save");
  const clear = document.getElementById("btn-assistant-llm-clear");
  const cfg = getLlmConfig();
  if (cfg) {
    if (provider) provider.value = cfg.provider || "openai";
    if (model) model.value = cfg.model || "";
    if (base) base.value = cfg.baseUrl || "";
    if (key) key.value = cfg.key || "";
  }
  if (save) save.addEventListener("click", () => {
    const next = { provider: provider ? provider.value : "openai", model: model ? model.value.trim() : "", baseUrl: base ? base.value.trim() : "", key: key ? key.value.trim() : "" };
    if (!next.key || !next.model) { const st = document.getElementById("assistant-llm-status"); if (st) st.textContent = "Model and API key are required"; return; }
    setLlmConfig(next);
  });
  if (clear) clear.addEventListener("click", () => {
    if (model) model.value = ""; if (base) base.value = ""; if (key) key.value = "";
    setLlmConfig(null);
  });
  updateLlmStatus();

  // Keep track of selections made elsewhere in the UI (airport card, search)
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-iata]");
    if (t && t.getAttribute("data-iata")) copilotSelectedIata = t.getAttribute("data-iata");
  }, true);

  if (panel) panel.setAttribute("data-copilot", "ready");
}

function initAssistant() {
  const form = document.getElementById("assistant-form");
  const input = document.getElementById("assistant-input");
  const orb = document.getElementById("btn-assistant-orb");
  const micBtn = document.getElementById("btn-assistant-mic");
  const speakerBtn = document.getElementById("btn-assistant-speaker");
  const closePanelBtn = document.getElementById("btn-close-reply-panel");
  const speakerIconOff = document.getElementById("speaker-icon-off");
  const speakerIconOn = document.getElementById("speaker-icon-on");

  // Speaker toggle state
  const speakerActive = isSpeakerEnabled();
  if (speakerIconOff && speakerIconOn) {
    speakerIconOff.style.display = speakerActive ? "none" : "block";
    speakerIconOn.style.display = speakerActive ? "block" : "none";
  }

  if (speakerBtn) {
    speakerBtn.addEventListener("click", () => {
      const current = isSpeakerEnabled();
      const next = !current;
      setSpeakerEnabled(next);
      if (speakerIconOff && speakerIconOn) {
        speakerIconOff.style.display = next ? "none" : "block";
        speakerIconOn.style.display = next ? "block" : "none";
      }
      if (!next) {
        cancelSpeech();
      }
    });
  }

  // SpeechRecognition setup
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (micBtn) micBtn.style.display = "none";
  } else {
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => setListeningState(true);
      recognition.onresult = (e) => {
        setListeningState(false);
        const transcript = e.results[0][0].transcript;
        if (transcript) {
          if (input) input.value = transcript;
          executeAssistantCommand(transcript);
        }
      };
      recognition.onerror = () => setListeningState(false);
      recognition.onend = () => setListeningState(false);
      recognitionInstance = recognition;

      const toggleRecognition = () => {
        if (isListening) {
          recognition.stop();
        } else {
          try {
            recognition.start();
          } catch (err) {
            // Restart if already running
          }
        }
      };

      if (micBtn) micBtn.addEventListener("click", toggleRecognition);
      if (orb) orb.addEventListener("click", toggleRecognition);
    } catch (e) {
      if (micBtn) micBtn.style.display = "none";
    }
  }

  // Form submit
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!input) return;
      const val = input.value.trim();
      if (val) {
        executeAssistantCommand(val);
        input.value = "";
      }
    });
  }

  // Close reply panel button and escape key
  if (closePanelBtn) {
    closePanelBtn.addEventListener("click", closeReplyPanel);
  }
  initCopilotUi();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeReplyPanel();
    }
  });

  initVisualizer();

  // Pre-load synthesis voices if available
  populateVoicePickers();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = populateVoicePickers;
    }
    window.speechSynthesis.addEventListener("voiceschanged", populateVoicePickers);
  }

  // Assistant settings toggle inside reply panel
  const assistantSettingsToggle = document.getElementById("btn-assistant-settings-toggle");
  const assistantSettingsView = document.getElementById("assistant-settings-view");
  if (assistantSettingsToggle && assistantSettingsView) {
    assistantSettingsToggle.addEventListener("click", () => {
      const isHidden = assistantSettingsView.style.display === "none";
      assistantSettingsView.style.display = isHidden ? "block" : "none";
    });
  }

  // ElevenLabs settings
  const elKeyInput = document.getElementById("assistant-elevenlabs-key");
  const elSaveBtn = document.getElementById("btn-elevenlabs-save");
  const elClearBtn = document.getElementById("btn-elevenlabs-clear");
  const elStatus = document.getElementById("assistant-elevenlabs-status");

  function updateElStatus() {
    if (!elStatus) return;
    const hasKey = Boolean(getElevenLabsApiKey());
    if (elevenlabsExhausted) {
      elStatus.textContent = "Credits exhausted or invalid key. Falling back to Kokoro AI and device voice.";
      elStatus.style.color = "var(--accent-amber, #e5a00d)";
    } else if (hasKey) {
      elStatus.textContent = "Using ElevenLabs Laura (British female) with fallback.";
      elStatus.style.color = "var(--accent-green, #10b981)";
    } else {
      elStatus.textContent = "Default: Laura (British female) with Kokoro and device fallback.";
      elStatus.style.color = "";
    }
  }

  if (elKeyInput) {
    elKeyInput.value = getElevenLabsApiKey();
    updateElStatus();
  }
  if (elSaveBtn && elKeyInput) {
    elSaveBtn.addEventListener("click", () => {
      try {
        localStorage.setItem("skyline_elevenlabs_key", elKeyInput.value.trim());
        elevenlabsExhausted = false;
        updateElStatus();
      } catch (e) {}
    });
  }
  if (elClearBtn && elKeyInput) {
    elClearBtn.addEventListener("click", () => {
      try {
        localStorage.removeItem("skyline_elevenlabs_key");
        elKeyInput.value = "";
        elevenlabsExhausted = false;
        updateElStatus();
      } catch (e) {}
    });
  }

  // Request persistent browser storage so cached TTS model is not evicted
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  // Initialize Smart Mode
  updateSmartModeVisibility();
  if (isSmartModeEnabled() && NEEDLE_URL) {
    pingSmartModeHealth();
  }
}

if (typeof window !== "undefined") {
  window.getAudioContext = getAudioContext;
  window.getKokoroWorker = getKokoroWorker;
  window.synthesizeWithKokoro = synthesizeWithKokoro;
  window.synthesizeWithElevenLabs = synthesizeWithElevenLabs;
  window.getElevenLabsApiKey = getElevenLabsApiKey;
  window.ELEVENLABS_VOICE_ID = ELEVENLABS_VOICE_ID;
  window.speakSpeech = speakSpeech;
  window.showVisualizer = showVisualizer;
  window.hideVisualizer = hideVisualizer;
  window.initVisualizer = initVisualizer;
  window.setNeedleUrlForTesting = setNeedleUrlForTesting;
  window.isSmartModeEnabled = isSmartModeEnabled;
  window.setSmartModeEnabled = setSmartModeEnabled;
  window.queryNeedleParse = queryNeedleParse;
  window.pingSmartModeHealth = pingSmartModeHealth;
  window.getConversationHistory = () => conversationHistory;
  window.executeAssistantCommand = executeAssistantCommand;
  window.applyCopilotActions = applyCopilotActions;
  window.clearConversation = clearConversation;
  window.getLlmConfig = getLlmConfig;
  window.setLlmConfig = setLlmConfig;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAssistant);
  } else {
    initAssistant();
  }
}

// Export for Node testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    levenshteinDistance,
    fuzzyMatchAirport,
    formatAirportSummary,
    parseAssistantCommand,
    pickVoice,
    getSelectedKokoroVoice,
    synthesizeWithElevenLabs,
    getElevenLabsApiKey,
    ELEVENLABS_VOICE_ID,
    getAudioContext,
    initVisualizer,
  };
}
