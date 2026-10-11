import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright

from api.main import app, model_instance

ROOT = Path(__file__).resolve().parents[1]


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def web_server():
    port = find_free_port()
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--directory", str(ROOT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                break
        time.sleep(0.1)
    yield port
    server.terminate()
    server.wait()

SAMPLE_PHRASES = [
    "show london",
    "take me to SIN",
    "where is Tokyo",
    "tell me about Hyderabad",
    "what about DXB",
    "open JFK",
    "show me Paris",
    "compare SIN and DXB",
    "compare London and Paris",
    "top 10 emerging",
    "top 5 hubs at +5",
    "top 10 declining at +10",
    "switch to +5",
    "switch to +10",
    "switch to current",
    "radar for SIN",
    "reset filters",
    "help me",
    "please show Heathrow airport",
    "find Dubai",
]


def test_needle_api_health():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_needle_api_validation():
    client = TestClient(app)
    # Long text exceeds 200 chars
    long_text = "a" * 201
    resp = client.post("/parse", json={"text": long_text})
    assert resp.status_code == 422 or resp.status_code == 400

    # Empty text returns empty calls
    resp = client.post("/parse", json={"text": ""})
    assert resp.status_code == 200
    assert resp.json()["calls"] == []


def test_needle_api_20_phrases():
    if model_instance is None:
        pytest.skip("Needle model weights missing")

    client = TestClient(app)
    assert len(SAMPLE_PHRASES) == 20

    for phrase in SAMPLE_PHRASES:
        resp = client.post("/parse", json={"text": phrase})
        assert resp.status_code == 200
        data = resp.json()
        assert "calls" in data
        assert "confidence" in data
        assert isinstance(data["calls"], list)
        assert isinstance(data["confidence"], (int, float))


def test_frontend_needle_handler_mappings(web_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1366, "height": 768})
        page.goto(f"http://127.0.0.1:{web_server}/web/index.html", wait_until="networkidle")

        # Test success mapping, empty calls fallback, error fallback, timeout fallback
        results = page.evaluate("""async () => {
            window.setNeedleUrlForTesting("http://127.0.0.1:9999");
            window.setSmartModeEnabled(true);

            const outcomes = {};

            // 1. Success mock
            window.fetch = async (url, options) => {
                if (url.includes("/parse")) {
                    return {
                        ok: true,
                        json: async () => ({
                            calls: [{ name: "select_airport", args: { query: "SIN" } }],
                            confidence: 0.95
                        })
                    };
                }
                return { ok: true, json: async () => ({ status: "ok" }) };
            };

            await window.executeAssistantCommand("fly me over to Singapore now");
            let history = window.getConversationHistory();
            let lastItem = history[history.length - 1];
            outcomes.successMapped = lastItem && (lastItem.reply.includes("SIN") || lastItem.reply.includes("Singapore"));

            // 2. Empty calls mock -> fallback to help
            window.fetch = async (url, options) => {
                return {
                    ok: true,
                    json: async () => ({ calls: [], confidence: 0.1 })
                };
            };
            await window.executeAssistantCommand("unrecognized gibberish command");
            history = window.getConversationHistory();
            lastItem = history[history.length - 1];
            outcomes.emptyFallback = lastItem && (lastItem.reply.includes("Command not recognized") || lastItem.reply.includes("help"));

            // 3. Error mock -> fallback to help
            window.fetch = async (url, options) => {
                return { ok: false, status: 500 };
            };
            await window.executeAssistantCommand("another unrecognized command");
            history = window.getConversationHistory();
            lastItem = history[history.length - 1];
            outcomes.errorFallback = lastItem && (lastItem.reply.includes("Command not recognized") || lastItem.reply.includes("help"));

            // 4. Timeout / abort mock -> fallback to help
            window.fetch = async (url, options) => {
                const err = new Error("The user aborted a request.");
                err.name = "AbortError";
                throw err;
            };
            await window.executeAssistantCommand("timed out command");
            history = window.getConversationHistory();
            lastItem = history[history.length - 1];
            outcomes.timeoutFallback = lastItem && (lastItem.reply.includes("Command not recognized") || lastItem.reply.includes("help"));

            return outcomes;
        }""")

        assert results["successMapped"] is True, "Success call should map to select_airport"
        assert results["emptyFallback"] is True, "Empty calls should fall back to help"
        assert results["errorFallback"] is True, "Server error should fall back to help"
        assert results["timeoutFallback"] is True, "Timeout should fall back to help"

        browser.close()
