// Unit tests for Skyline assistant command parser
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const assistant = require("../web/assistant.js");
const { parseAssistantCommand, fuzzyMatchAirport, formatAirportSummary, pickVoice } = assistant;

// Load forecasts data
const forecastsPath = path.join(__dirname, "../web/forecasts.json");
const forecastsData = JSON.parse(fs.readFileSync(forecastsPath, "utf8"));
const airports = forecastsData.airports;

console.log(`Loaded ${airports.length} airports for assistant test.`);

const tests = [
  {
    name: "1. Show Hyderabad exact city",
    input: "show Hyderabad",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.airport, "Expected matched airport object");
      assert.strictEqual(res.airport.iata, "HYD");
      assert.ok(res.text.includes("Hyderabad, HYD. Importance 95.2 now, 100 at plus five, 100 at plus ten. Established hub."));
      assert.ok(res.text.includes("Data is reconstructed with medium confidence."));
      assert.ok(res.text.includes("The plus ten range is indicative only."));
    },
  },
  {
    name: "2. Find hyderbad typo single word",
    input: "find hyderbad",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.airport, "Expected typo to resolve to HYD");
      assert.strictEqual(res.airport.iata, "HYD");
    },
  },
  {
    name: "3. Go to SIN exact IATA",
    input: "go to SIN",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.airport);
      assert.strictEqual(res.airport.iata, "SIN");
    },
  },
  {
    name: "4. Zoom to London ambiguous match",
    input: "zoom to London",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.multipleMatches && res.multipleMatches.length >= 2, "Expected multiple matches for London");
      assert.ok(res.text.includes("Multiple airports match"));
      assert.ok(res.text.includes("LHR") || res.text.includes("LGW"));
    },
  },
  {
    name: "5. Show JFK capital IATA",
    input: "show JFK",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.airport);
      assert.strictEqual(res.airport.iata, "JFK");
    },
  },
  {
    name: "6. Compare SIN and DXB",
    input: "compare SIN and DXB",
    verify: (res) => {
      assert.strictEqual(res.type, "compare");
      assert.strictEqual(res.compareAirports.length, 2);
      assert.strictEqual(res.compareAirports[0].iata, "SIN");
      assert.strictEqual(res.compareAirports[1].iata, "DXB");
    },
  },
  {
    name: "7. Compare London and Paris cities",
    input: "compare London and Paris",
    verify: (res) => {
      assert.strictEqual(res.type, "compare");
      assert.strictEqual(res.compareAirports.length, 2);
      assert.ok(["LHR", "LGW", "STN", "LCY"].includes(res.compareAirports[0].iata));
      assert.ok(["CDG", "ORY"].includes(res.compareAirports[1].iata));
    },
  },
  {
    name: "8. Top 10 emerging default horizon",
    input: "top 10 emerging",
    verify: (res) => {
      assert.strictEqual(res.type, "top");
      assert.strictEqual(res.category, "emerging");
      assert.ok(res.airports.length <= 10 && res.airports.length > 0);
      assert.ok(res.text.includes("Top 10 Emerging airports"));
    },
  },
  {
    name: "9. Top 10 hubs at +5",
    input: "top 10 hubs at +5",
    verify: (res) => {
      assert.strictEqual(res.type, "top");
      assert.strictEqual(res.category, "established_hub");
      assert.strictEqual(res.horizon, "h5");
      assert.strictEqual(res.airports.length, 10);
    },
  },
  {
    name: "10. Top 10 declining at +10",
    input: "top 10 declining at +10",
    verify: (res) => {
      assert.strictEqual(res.type, "top");
      assert.strictEqual(res.category, "declining");
      assert.strictEqual(res.horizon, "h10");
      assert.ok(res.airports.length > 0 && res.airports.length <= 10);
    },
  },
  {
    name: "11. Switch to +5",
    input: "switch to +5",
    verify: (res) => {
      assert.strictEqual(res.type, "switch_horizon");
      assert.strictEqual(res.horizon, "h5");
      assert.ok(res.text.includes("+5 years"));
    },
  },
  {
    name: "12. Switch to +10",
    input: "switch to +10",
    verify: (res) => {
      assert.strictEqual(res.type, "switch_horizon");
      assert.strictEqual(res.horizon, "h10");
      assert.ok(res.text.includes("+10 years"));
    },
  },
  {
    name: "13. Switch to current",
    input: "switch to current",
    verify: (res) => {
      assert.strictEqual(res.type, "switch_horizon");
      assert.strictEqual(res.horizon, "present");
    },
  },
  {
    name: "14. Radar for SIN",
    input: "radar for SIN",
    verify: (res) => {
      assert.strictEqual(res.type, "radar");
      assert.ok(res.airport);
      assert.strictEqual(res.airport.iata, "SIN");
    },
  },
  {
    name: "15. Reset",
    input: "reset",
    verify: (res) => {
      assert.strictEqual(res.type, "reset");
      assert.ok(res.text.includes("Reset map view"));
    },
  },
  {
    name: "16. Help",
    input: "help",
    verify: (res) => {
      assert.strictEqual(res.type, "help");
      assert.ok(res.text.includes("Skyline commands:"));
    },
  },
  {
    name: "17. Unknown input (legacy parser: graceful, never 'not recognized')",
    input: "what is the weather today",
    verify: (res) => {
      assert.strictEqual(res.type, "unknown");
      assert.ok(!res.text.includes("Command not recognized"));
      assert.ok(res.text.includes("help"));
    },
  },
  {
    name: "18. Natural phrase: I want to see london",
    input: "I want to see london",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.multipleMatches, "Expected multipleMatches for London");
      assert.strictEqual(res.multipleMatches.length, 3, "Expected top 3 airports for London");
      assert.strictEqual(res.multipleMatches[0].iata, "LHR");
      assert.ok(res.text.includes("Multiple airports match"));
    },
  },
  {
    name: "19. Natural phrase: take me to SIN",
    input: "take me to SIN",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.airport);
      assert.strictEqual(res.airport.iata, "SIN");
    },
  },
  {
    name: "20. Natural phrase: where is Tokyo",
    input: "where is Tokyo",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.airport || res.multipleMatches);
    },
  },
  {
    name: "21. Natural phrase: tell me about Hyderabad",
    input: "tell me about Hyderabad",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.airport);
      assert.strictEqual(res.airport.iata, "HYD");
    },
  },
  {
    name: "22. Natural phrase: what about DXB",
    input: "what about DXB",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.airport);
      assert.strictEqual(res.airport.iata, "DXB");
    },
  },
  {
    name: "23. Natural phrase: open JFK",
    input: "open JFK",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.airport);
      assert.strictEqual(res.airport.iata, "JFK");
    },
  },
  {
    name: "24. Natural phrase: show me Paris",
    input: "show me Paris",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.airport || res.multipleMatches);
    },
  },
  {
    name: "25. Natural phrase with filler words: please show me the London airport please",
    input: "please show me the London airport please",
    verify: (res) => {
      assert.strictEqual(res.type, "show");
      assert.ok(res.multipleMatches);
      assert.strictEqual(res.multipleMatches.length, 3);
      assert.strictEqual(res.multipleMatches[0].iata, "LHR");
    },
  },
];

let passed = 0;
tests.forEach((t) => {
  try {
    const res = parseAssistantCommand(t.input, airports, "present");
    t.verify(res);
    passed++;
    console.log(`PASS: ${t.name}`);
  } catch (err) {
    console.error(`FAIL: ${t.name}:`, err.message);
    process.exitCode = 1;
  }
});

// Voice picking test suite
const voiceTests = [
  {
    name: "18. Voice pick: en-GB female present",
    run: () => {
      const list = [
        { name: "George", lang: "en-GB" },
        { name: "Libby", lang: "en-GB" },
        { name: "Samantha", lang: "en-US" },
      ];
      const picked = pickVoice(list);
      assert.ok(picked);
      assert.strictEqual(picked.name, "Libby");
    },
  },
  {
    name: "19. Voice pick: en-GB female matching pattern",
    run: () => {
      const list = [
        { name: "Oliver", lang: "en-GB" },
        { name: "Google UK English Female", lang: "en-GB" },
        { name: "Microsoft Susan", lang: "en-GB" },
      ];
      const picked = pickVoice(list);
      assert.ok(picked);
      assert.strictEqual(picked.name, "Google UK English Female");
    },
  },
  {
    name: "20. Voice pick: only en-US present",
    run: () => {
      const list = [
        { name: "Daniel", lang: "en-US" },
        { name: "Samantha", lang: "en-US" },
      ];
      const picked = pickVoice(list);
      assert.ok(picked);
      assert.strictEqual(picked.name, "Samantha");
    },
  },
  {
    name: "21. Voice pick: empty voice list",
    run: () => {
      assert.strictEqual(pickVoice([]), null);
      assert.strictEqual(pickVoice(null), null);
    },
  },
  {
    name: "22. Voice pick: saved voice choice respected",
    run: () => {
      const list = [
        { name: "Libby", lang: "en-GB", voiceURI: "uri-libby" },
        { name: "Samantha", lang: "en-US", voiceURI: "uri-samantha" },
      ];
      const picked = pickVoice(list, "uri-samantha");
      assert.ok(picked);
      assert.strictEqual(picked.name, "Samantha");
    },
  },
];

voiceTests.forEach((vt) => {
  try {
    vt.run();
    passed++;
    console.log(`PASS: ${vt.name}`);
  } catch (err) {
    console.error(`FAIL: ${vt.name}:`, err.message);
    process.exitCode = 1;
  }
});

// Copilot engine (pure, DOM-free) smoke tests
const Copilot = require("../web/copilot.js");
const lookup = {};
airports.forEach((a) => { lookup[a.iata] = a; });
const copilotCtx = { airports, airportLookup: lookup, horizon: "present", selectedAirport: lookup.SIN, history: [] };
const copilotTests = [
  ["which airports in india will grow the most by 2035", "top_n", (r) => r.rows.length === 10 && r.rows.every((i) => lookup[i].country === "IN")],
  ["is there a direct flight DEL to SFO", "route_between", (r) => /direct|hops?/.test(r.reply)],
  ["what happens if DXB closes", "resilience", (r) => /\d/.test(r.reply)],
  ["compare SIN and DXB", "compare", (r) => r.actions.some((a) => a.type === "compare")],
  ["what is the weather today", "fallback", (r) => r.followups.length === 3 && !/not recognized/i.test(r.reply)],
  ["help", "help", (r) => r.html.includes("data-copilot-ask")],
];
copilotTests.forEach(([q, intent, check], i) => {
  try {
    const r = Copilot.answer(q, copilotCtx);
    assert.strictEqual(r.intent, intent, `intent ${r.intent} != ${intent}`);
    assert.ok(r.reply && r.html && Array.isArray(r.actions) && typeof r.confidence === "number");
    assert.ok(check(r), "check failed: " + r.reply);
    passed++;
    console.log(`PASS: C${i + 1}. Copilot: ${q}`);
  } catch (err) {
    console.error(`FAIL: C${i + 1}. Copilot: ${q}:`, err.message);
    process.exitCode = 1;
  }
});

const totalCount = tests.length + voiceTests.length + copilotTests.length;
console.log(`\nAssistant test suite: ${passed}/${totalCount} tests passed.`);
