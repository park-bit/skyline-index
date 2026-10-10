// Unit tests for Skyline assistant command parser
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const assistant = require("../web/assistant.js");
const { parseAssistantCommand, fuzzyMatchAirport, formatAirportSummary } = assistant;

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
    name: "17. Unknown input",
    input: "what is the weather today",
    verify: (res) => {
      assert.strictEqual(res.type, "unknown");
      assert.ok(res.text.includes("Command not recognized"));
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

console.log(`\nAssistant test suite: ${passed}/${tests.length} tests passed.`);
