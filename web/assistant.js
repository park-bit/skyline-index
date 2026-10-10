// skyline-index - Voice and Text Assistant (Skyline)

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

  const clean = raw.toLowerCase().replace(/[?!.]+$/g, "").trim();

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

  // Command: Show / Find / Go to / Zoom to
  const showMatch = clean.match(/^(?:show|find|go\s+to|zoom\s+to)\s+(.+)$/i);
  let airportQuery = showMatch ? showMatch[1].trim() : null;

  // If no prefix, check if short input (at most 2 words) directly matches an airport
  if (!airportQuery) {
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length <= 2) {
      const directMatches = fuzzyMatchAirport(clean, airports);
      if (directMatches.length > 0) {
        airportQuery = clean;
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
      const optionsStr = top3.map((a) => `${a.iata} (${a.city || a.name})`).join(", ");
      return {
        type: "show",
        multipleMatches: top3,
        airport: null,
        text: `Multiple airports match "${airportQuery}": ${optionsStr}. Say "show <IATA>" to pick one.`,
        spokenText: `Multiple airports matched. Did you mean ${top3.map((a) => a.iata).join(", ")}?`,
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
    return localStorage.getItem("skyline_voice_enabled") === "true";
  } catch (e) {
    return false;
  }
}

function setSpeakerEnabled(enabled) {
  try {
    localStorage.setItem("skyline_voice_enabled", enabled ? "true" : "false");
  } catch (e) {
    // Ignore localStorage storage errors
  }
}

function cancelSpeech() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  setSpeakingState(false);
}

function getPreferredEnglishVoice() {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const english = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
  if (english.length === 0) return voices[0];

  const preferred = english.find((v) => /google|natural|microsoft/i.test(v.name));
  return preferred || english[0];
}

function speakSpeech(text) {
  cancelSpeech();
  if (!window.speechSynthesis || !isSpeakerEnabled() || !text) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;

  const voice = getPreferredEnglishVoice();
  if (voice) utterance.voice = voice;

  utterance.onstart = () => setSpeakingState(true);
  utterance.onend = () => setSpeakingState(false);
  utterance.onerror = () => setSpeakingState(false);

  voiceUtterance = utterance;
  window.speechSynthesis.speak(utterance);
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
}

function triggerPulseRing(lat, lon) {
  const mapInstance = window.map;
  if (!mapInstance || lat == null || lon == null || typeof L === "undefined") return;

  const pulseMarker = L.circleMarker([lat, lon], {
    radius: 12,
    color: "#3dd9c5",
    fillColor: "#3dd9c5",
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
      historyList.appendChild(exchangeEl);

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
        }
      }, 12);
    } else {
      answerEl.textContent = item.reply;
      exchangeEl.appendChild(answerEl);
      historyList.appendChild(exchangeEl);
    }
  });

  panel.scrollTop = panel.scrollHeight;
  const statStrip = document.getElementById("map-statistics");
  if (statStrip) statStrip.style.display = "none";
}

function closeReplyPanel() {
  const panel = document.getElementById("assistant-reply-panel");
  if (panel) panel.style.display = "none";
  const statStrip = document.getElementById("map-statistics");
  if (statStrip) statStrip.style.display = "flex";
}

function executeAssistantCommand(inputStr) {
  const text = (inputStr || "").trim();
  if (!text) return;

  cancelSpeech();

  const airports = window.airportsData || [];
  const activeHorizon = window.currentHorizon || "present";
  const result = parseAssistantCommand(text, airports, activeHorizon);

  // Store exchange history (keep last 3)
  conversationHistory.push({ query: text, reply: result.text });
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

  // Pre-load synthesis voices if available
  if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      getPreferredEnglishVoice();
    };
  }
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
  };
}
