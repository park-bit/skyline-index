// skyline-index - Voice and Text Assistant (Skyline)
let NEEDLE_URL = "https://skyline-smart-mode.onrender.com";

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
    text: 'Command not recognized. Say "help" to see available commands, or try: "show [airport]", "compare [A] and [B]", "top 10 emerging", "switch to +5", "radar for [airport]", or "reset".',
    spokenText: "I did not recognize that command. Say help to hear what I can do.",
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
          const hasWebGPU = typeof navigator !== "undefined" && Boolean(navigator.gpu);
          if (!hasWebGPU && latencyMs > 1500) {
            kokoroFallbackToDevice = true;
            updateVoiceFallbackLabels(true);
          }
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
        reject(new Error("Synthesis timed out"));
      }
    }, 8000);
  });
}

function cancelSpeech() {
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

function isExcludedVoice(v) {
  const name = v && v.name ? v.name : "";
  if (/female/i.test(name)) return false;
  return /male$|george|ryan|daniel|oliver/i.test(name);
}

const MALE_VOICE_PATTERN = /\b(george|david|mark|daniel|richard|oliver|guy|male)\b/i;
const FEMALE_VOICE_PATTERN = /\b(jenny|aria|samantha|libby|sonia|serena|maisie|hazel|susan|kate|stephanie|zira|ava|karen|victoria|female)\b|google.*female/i;

function pickVoice(voices, savedVoiceURI = null) {
  if (!voices || voices.length === 0) return null;

  if (savedVoiceURI) {
    const saved = voices.find(
      (v) => (v.voiceURI === savedVoiceURI || v.name === savedVoiceURI) && !isExcludedVoice(v)
    );
    if (saved) return saved;
  }

  const validVoices = voices.filter((v) => !isExcludedVoice(v));
  if (validVoices.length === 0) return voices[0] || null;

  // 1. Natural / neural female voice (en-GB or en-US)
  const naturalFemale = validVoices.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const name = v.name || "";
    return lang.startsWith("en") && FEMALE_VOICE_PATTERN.test(name) && /natural|online|neural|google/i.test(name);
  });
  if (naturalFemale) return naturalFemale;

  // 2. en-GB female
  const gbFemale = validVoices.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang.startsWith("en-gb") && FEMALE_VOICE_PATTERN.test(v.name || "");
  });
  if (gbFemale) return gbFemale;

  // 3. Any English female voice
  const enFemale = validVoices.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang.startsWith("en") && FEMALE_VOICE_PATTERN.test(v.name || "");
  });
  if (enFemale) return enFemale;

  // 4. Any English voice not explicitly male
  const enNonMale = validVoices.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang.startsWith("en") && !MALE_VOICE_PATTERN.test(v.name || "");
  });
  if (enNonMale) return enNonMale;

  // 5. en-GB any
  const gbAny = validVoices.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang.startsWith("en-gb");
  });
  if (gbAny) return gbAny;

  // 6. en any
  const enAny = validVoices.find((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang.startsWith("en");
  });
  if (enAny) return enAny;

  return validVoices[0] || voices[0] || null;
}

function getSelectedKokoroVoice() {
  try {
    return localStorage.getItem("skyline_kokoro_voice") || "bf_emma";
  } catch (e) {
    return "bf_emma";
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
    { value: "bf_emma", label: "Natural AI: Emma (British female, default)" },
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
  const UtteranceClass = window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance;
  let utterance = null;
  if (typeof UtteranceClass === "function") {
    try {
      utterance = new UtteranceClass(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices() || [];
      const voice = pickVoice(voices);
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        setSpeakingState(true);
        startSyntheticAudioPulsing();
      };
      utterance.onend = () => {
        stopSyntheticAudioPulsing();
        setSpeakingState(false);
      };
      utterance.onerror = () => {
        stopSyntheticAudioPulsing();
        setSpeakingState(false);
      };
    } catch (e) {
      utterance = null;
    }
  }

  voiceUtterance = utterance;
  if (typeof window.speechSynthesis.speak === "function") {
    window.speechSynthesis.speak(utterance || text);
  }
}

function setKokoroWorkerForTesting(worker) {
  kokoroWorker = worker;
}

async function speakSpeech(text) {
  cancelSpeech();
  if (!isSpeakerEnabled() || !text) return;

  const chosenVoice = getSelectedKokoroVoice();
  if (chosenVoice !== "device" && !kokoroFallbackToDevice) {
    try {
      setSpeakingState(true);
      const { pcmData, sampleRate } = await synthesizeWithKokoro(text, chosenVoice);
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

function renderReplyPanel(latestTyped = true) {
  const panel = document.getElementById("assistant-reply-panel");
  const historyList = document.getElementById("assistant-history-list");
  if (!panel || !historyList) return;

  if (conversationHistory.length === 0) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";
  historyList.innerHTML = "";

  if (typewriterTimer) {
    clearInterval(typewriterTimer);
    typewriterTimer = null;
  }

  conversationHistory.forEach((item, index) => {
    const exchangeEl = document.createElement("div");
    exchangeEl.className = "reply-exchange";

    const queryEl = document.createElement("div");
    queryEl.className = "reply-query";
    queryEl.textContent = item.query;
    exchangeEl.appendChild(queryEl);

    const answerEl = document.createElement("div");
    answerEl.className = "reply-answer";

    const isLatest = index === conversationHistory.length - 1;
    if (isLatest && latestTyped) {
      answerEl.textContent = "";
      exchangeEl.appendChild(answerEl);

      isAnswering = true;
      showVisualizer();

      let charIdx = 0;
      const fullText = item.reply;
      typewriterTimer = setInterval(() => {
        if (charIdx < fullText.length) {
          answerEl.textContent += fullText.charAt(charIdx);
          charIdx++;
          panel.scrollTop = panel.scrollHeight;
        } else {
          clearInterval(typewriterTimer);
          typewriterTimer = null;
          isAnswering = false;
          if (!isSpeaking) {
            hideVisualizer();
          }
        }
      }, 12);
    } else {
      answerEl.textContent = item.reply;
      exchangeEl.appendChild(answerEl);
    }

    if (item.smartSource && item.smartSource !== "none") {
      const badge = document.createElement("span");
      badge.className = "reply-smart-badge";
      badge.textContent = "Smart mode";
      badge.title = item.smartSource;
      exchangeEl.appendChild(badge);
    }

    if (item.multipleMatches && item.multipleMatches.length > 0) {
      const choicesEl = document.createElement("div");
      choicesEl.className = "reply-choices";
      item.multipleMatches.forEach((matchAp) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "reply-choice-btn";
        btn.setAttribute("data-iata", matchAp.iata);
        btn.innerHTML = `<strong>${matchAp.iata}</strong> ${matchAp.city || matchAp.name}`;
        btn.addEventListener("click", () => {
          executeAssistantCommand(`show ${matchAp.iata}`);
        });
        choicesEl.appendChild(btn);
      });
      exchangeEl.appendChild(choicesEl);
    }

    historyList.appendChild(exchangeEl);
  });

  panel.scrollTop = panel.scrollHeight;
}

function closeReplyPanel() {
  const panel = document.getElementById("assistant-reply-panel");
  if (panel) panel.style.display = "none";
  isAnswering = false;
  if (!isSpeaking) hideVisualizer();
}

async function executeAssistantCommand(inputStr) {
  const text = (inputStr || "").trim();
  if (!text) return;

  cancelSpeech();

  const airports = window.airportsData || [];
  const activeHorizon = window.currentHorizon || "present";
  let result = parseAssistantCommand(text, airports, activeHorizon);
  let smartSource = null;

  if (result.type === "unknown" && isSmartModeEnabled() && NEEDLE_URL) {
    const parseRes = await queryNeedleParse(text);
    if (parseRes && Array.isArray(parseRes.calls) && parseRes.calls.length > 0) {
      smartSource = parseRes.source || "needle";
      const call = parseRes.calls[0];
      const name = call.name;
      const args = call.args || {};
      if (name === "select_airport" && args.query) {
        result = parseAssistantCommand("show " + args.query, airports, activeHorizon);
      } else if (name === "compare_airports" && args.a && args.b) {
        result = parseAssistantCommand("compare " + args.a + " and " + args.b, airports, activeHorizon);
      } else if (name === "top_airports" && args.kind) {
        const hStr = args.horizon ? " at +" + args.horizon : "";
        const nStr = args.n ? " " + args.n : " 10";
        result = parseAssistantCommand("top" + nStr + " " + args.kind + hStr, airports, activeHorizon);
      } else if (name === "switch_horizon" && args.horizon != null) {
        result = parseAssistantCommand("switch to +" + args.horizon, airports, activeHorizon);
      } else if (name === "radar" && args.airport) {
        result = parseAssistantCommand("radar for " + args.airport, airports, activeHorizon);
      } else if (name === "reset") {
        result = parseAssistantCommand("reset", airports, activeHorizon);
      } else if (name === "help") {
        result = parseAssistantCommand("help", airports, activeHorizon);
      }
    }
  }

  // Store exchange history (keep last 3)
  conversationHistory.push({
    query: text,
    reply: result.text,
    multipleMatches: result.multipleMatches,
    smartSource: smartSource,
  });
  if (conversationHistory.length > 3) {
    conversationHistory.shift();
  }

  renderReplyPanel(true);

  if (result.spokenText) {
    speakSpeech(result.spokenText);
  }

  // Handle side effects on map and UI
  if (result.type === "show" && result.airport) {
    const ap = result.airport;
    if (typeof window.selectAirport === "function") {
      window.selectAirport(ap);
    }
    if (window.map && ap.latitude != null && ap.longitude != null) {
      window.map.flyTo([ap.latitude, ap.longitude], 6, { duration: 1.2 });
      triggerPulseRing(ap.latitude, ap.longitude);
    }
  } else if (result.type === "compare" && result.compareAirports && result.compareAirports.length === 2) {
    const [apA, apB] = result.compareAirports;
    if (typeof window.setCompareAirports === "function") {
      window.setCompareAirports(apA.iata, apB.iata);
    }
    if (typeof window.openCompareDrawer === "function") {
      window.openCompareDrawer();
    }
  } else if (result.type === "top" && result.airports && result.airports.length > 0) {
    if (window.map && typeof L !== "undefined") {
      const latLngs = result.airports
        .filter((a) => a.latitude != null && a.longitude != null)
        .map((a) => [a.latitude, a.longitude]);
      if (latLngs.length > 0) {
        window.map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50], maxZoom: 6 });
      }
    }
  } else if (result.type === "switch_horizon") {
    const btn = document.getElementById("btn-horizon-" + result.horizon);
    if (btn) btn.click();
  } else if (result.type === "radar") {
    if (typeof window.switchTab === "function") {
      window.switchTab("radar");
    }
  } else if (result.type === "reset") {
    const resetBtn = document.getElementById("btn-reset-filters");
    if (resetBtn) resetBtn.click();
    if (window.map) {
      window.map.flyTo([22.0, 15.0], 3, { duration: 1.0 });
    }
  }
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
    getAudioContext,
    initVisualizer,
  };
}
