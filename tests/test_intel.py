"""Playwright tests for the Intelligence, Scenario Lab and Methodology views (web/intel.js, web/scenario.js).

The tests inject their own containers and call the window.SkylineIntel API directly, so they do not
depend on the tab wiring in app.js. Both modes are exercised: intelligence.json absent (client-side
fallback) and, when web/intelligence.json exists, present.
"""
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
INTEL_PATH = ROOT / "web" / "intelligence.json"

IGNORED_CONSOLE = ("ERR_TUNNEL", "arcgisonline", "net::ERR", "Failed to load resource", "intelligence.json")


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def base_url():
    # Reuse the already running dev server when available, else start one.
    port = 8765
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            yield f"http://localhost:{port}"
            return
    except OSError:
        pass
    port = _free_port()
    proc = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--directory", str(ROOT)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                break
        except OSError:
            time.sleep(0.1)
    yield f"http://localhost:{port}"
    proc.terminate()
    proc.wait()


SETUP_JS = """
async (useIntel) => {
  const f = await (await fetch('forecasts.json')).json();
  const o = await (await fetch('opportunities.json')).json();
  let i = null;
  if (useIntel) { const r = await fetch('intelligence.json'); if (r.ok) i = await r.json(); }
  window.SkylineIntel.onDataReady(f, o, i);
  ['intel', 'scenario', 'method'].forEach((k) => {
    let el = document.getElementById('test-' + k);
    if (!el) { el = document.createElement('div'); el.id = 'test-' + k; el.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:9999;background:#0B0E12;padding:16px;display:none'; document.body.appendChild(el); }
  });
  window.__show = (k) => ['intel', 'scenario', 'method'].forEach((x) => { document.getElementById('test-' + x).style.display = x === k ? 'block' : 'none'; });
  return { airports: f.airports.length, hasIntel: !!i };
}
"""


def _open(pw, base_url, use_intel, width=1440, height=1000):
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": width, "height": height})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(f"{base_url}/web/index.html", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("() => window.SkylineIntel && typeof window.SkylineIntel.onDataReady === 'function'", timeout=30000)
    info = page.evaluate(SETUP_JS, use_intel)
    return browser, page, errors, info


def _real_errors(errors):
    return [e for e in errors if not any(tok in e for tok in IGNORED_CONSOLE)]


MODES = [False] + ([True] if INTEL_PATH.exists() else [])


@pytest.mark.parametrize("use_intel", MODES, ids=["no-intelligence", "with-intelligence"][: len(MODES)])
def test_intel_view_renders(base_url, use_intel):
    with sync_playwright() as pw:
        browser, page, errors, info = _open(pw, base_url, use_intel)
        assert info["airports"] > 4000
        assert info["hasIntel"] == use_intel
        page.evaluate("() => { window.__show('intel'); window.SkylineIntel.renderIntelView(document.getElementById('test-intel')); }")
        rows = page.evaluate("() => document.querySelectorAll('#test-intel #si-leader-table tbody tr').length")
        assert rows > 100
        text = page.inner_text("#test-intel")
        assert "India" in text
        if use_intel:
            assert "intelligence.json not found" not in text
        else:
            assert "intelligence.json not found" in text
        # Region cards present
        assert page.evaluate("() => document.querySelectorAll('#test-intel .si-region-card').length") >= 5
        # Sort by airports descending: first row should be United States (1,269 airports)
        page.click("#test-intel th[data-key='n_airports'] button")
        first = page.inner_text("#test-intel #si-leader-table tbody tr:first-child")
        assert "United States" in first
        # Country click lists its airports (selectCountry may or may not exist)
        page.click("#test-intel #si-leader-table tbody tr:first-child")
        page.wait_for_timeout(200)
        detail_visible = page.evaluate("() => { const d = document.querySelector('#test-intel #si-country-detail'); return !!d && d.style.display !== 'none' && d.querySelectorAll('tr[data-iata]').length > 10; }")
        handled_by_c1 = page.evaluate("() => typeof window.selectCountry === 'function'")
        assert detail_visible or handled_by_c1

        # Horizon toggle defaults to 2030 and switches to 2035; h10mode event re-renders in place
        assert page.inner_text("#test-intel .si-hz-btn.active").startswith("2030")
        page.click("#test-intel .si-hz-btn[data-hz='h10']")
        assert "2035" in page.inner_text("#test-intel .si-hz-note") or "indicative" in page.inner_text("#test-intel .si-hz-note")
        assert "Δ +10" in page.inner_text("#test-intel #si-leader-table thead")
        page.evaluate("() => document.dispatchEvent(new CustomEvent('skyline:h10mode', { detail: { mode: 'raw', changed: true } }))")
        assert page.evaluate("() => document.querySelectorAll('#test-intel #si-leader-table tbody tr').length") > 100
        page.click("#test-intel .si-hz-btn[data-hz='h5']")
        # Long tables are bounded so they scroll inside the panel
        assert page.evaluate("() => { const w = document.querySelector('#test-intel #si-leader-table').closest('.si-table-wrap'); return getComputedStyle(w).overflowY === 'auto' && w.clientHeight < w.scrollHeight; }")
        # Sub-tabs
        for tab, needle in [("movers", "Top 25 risers"), ("resilience", "Critical hubs"), ("network", "nodes"), ("briefs", "Generate brief")]:
            page.click(f"#test-intel .si-tab[data-tab='{tab}']")
            t = page.inner_text("#test-intel")
            assert needle.lower() in t.lower(), f"{tab} missing {needle}"
        assert page.evaluate("() => document.querySelectorAll('#test-intel .si-gen-brief').length") == 3
        # brief HTML carries the candidate_label disclaimer
        brief = page.evaluate("() => window.SkylineIntel.buildBriefHtml('airlines')")
        assert "model candidate, not confirmed demand" in brief
        assert "<table" in brief
        # Resilience table has numbers and a simulate button
        page.click("#test-intel .si-tab[data-tab='resilience']")
        assert page.evaluate("() => document.querySelectorAll('#test-intel .si-simulate').length") >= 10
        assert _real_errors(errors) == [], _real_errors(errors)
        browser.close()


@pytest.mark.parametrize("use_intel", MODES, ids=["no-intelligence", "with-intelligence"][: len(MODES)])
def test_scenario_hub_closure_dxb(base_url, use_intel):
    with sync_playwright() as pw:
        browser, page, errors, _ = _open(pw, base_url, use_intel)
        page.evaluate("() => { window.__show('scenario'); window.SkylineIntel.renderScenarioView(document.getElementById('test-scenario')); }")
        text = page.inner_text("#test-scenario")
        assert "not a re-run of the model" in text
        # programmatic computation
        r = page.evaluate("() => { const x = window.SkylineIntel.runClosure('DXB'); return {deg: x.degree, loss: x.reach_loss_pct, disc: x.disconnected.length, top: x.most_affected.length, art: x.is_articulation_point}; }")
        assert r["deg"] > 20
        assert r["loss"] >= 0
        assert r["top"] == 10
        # UI flow: pick DXB through the searchable input
        page.fill("#si-closure-pick", "DXB")
        page.wait_for_selector("#test-scenario .si-suggest button")
        page.keyboard.press("Enter")
        page.wait_for_function("() => document.querySelectorAll('#si-closure-result .si-kpi').length >= 5", timeout=15000)
        kpis = page.inner_text("#si-closure-result")
        assert "direct routes removed" in kpis
        assert "lose connectivity" in kpis
        assert "%" in kpis
        if use_intel:
            assert "Cross-check with intelligence.json" in kpis
        # Results stay in the Scenario panel; map highlighting is an explicit action
        if page.evaluate("() => typeof window.highlightAirports === 'function'"):
            assert page.evaluate("() => !!document.getElementById('si-closure-show-map')")
        # New route tab
        page.click("#test-scenario .si-tab[data-tab='route']")
        page.click("#test-scenario .si-chip[data-a='BLR']")
        rt = page.inner_text("#si-route-result")
        assert "km" in rt and "common neighbours" in rt
        # Macro tab degrades gracefully
        page.click("#test-scenario .si-tab[data-tab='macro']")
        mt = page.inner_text("#test-scenario")
        if use_intel:
            assert page.evaluate("() => !document.getElementById('si-macro-gdp').disabled")
            page.evaluate("() => { const e = document.getElementById('si-macro-gdp'); e.value = 2; e.dispatchEvent(new Event('input')); }")
            assert page.evaluate("() => document.querySelectorAll('#si-macro-result tr[data-iata]').length") > 10
        else:
            assert page.evaluate("() => document.getElementById('si-macro-gdp').disabled")
            assert "disabled" in mt.lower()
        assert _real_errors(errors) == [], _real_errors(errors)
        browser.close()


def test_method_view(base_url):
    with sync_playwright() as pw:
        browser, page, errors, _ = _open(pw, base_url, INTEL_PATH.exists())
        page.evaluate("() => { window.__show('method'); window.SkylineIntel.renderMethodView(document.getElementById('test-method')); }")
        text = page.inner_text("#test-method")
        assert "LightGBM" in text
        # Headline numbers from README.md
        for needle in ["4.319", "2.824", "5.282", "10.768", "0.9721", "32.3", "0.47", "0.48", "0.05"]:
            assert needle in text, needle
        assert page.evaluate("() => document.querySelectorAll('#test-method .si-results tbody tr').length") == 17
        assert page.evaluate("() => !!document.querySelector('#test-method svg.si-pipeline')")
        assert "limitations" in text.lower() and "python run_all.py" in text
        if INTEL_PATH.exists():
            shrink = json.loads(INTEL_PATH.read_text(encoding="utf-8")).get("horizon10_shrinkage")
            if shrink and shrink.get("best_alpha") is not None:
                assert f"{float(shrink['best_alpha']):.2f}" in text
        assert _real_errors(errors) == [], _real_errors(errors)
        browser.close()


def test_mobile_width_no_horizontal_overflow(base_url):
    with sync_playwright() as pw:
        browser, page, errors, _ = _open(pw, base_url, INTEL_PATH.exists(), width=390, height=844)
        page.evaluate("() => { window.__show('intel'); window.SkylineIntel.renderIntelView(document.getElementById('test-intel')); }")
        over = page.evaluate("() => { const el = document.getElementById('test-intel'); return el.scrollWidth - el.clientWidth; }")
        assert over <= 2, f"intel view overflows by {over}px at 390px"
        page.evaluate("() => { window.__show('scenario'); window.SkylineIntel.renderScenarioView(document.getElementById('test-scenario')); }")
        over = page.evaluate("() => { const el = document.getElementById('test-scenario'); return el.scrollWidth - el.clientWidth; }")
        assert over <= 2, f"scenario view overflows by {over}px at 390px"
        assert _real_errors(errors) == [], _real_errors(errors)
        browser.close()
