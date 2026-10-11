"""Skyline Copilot end-to-end tests (playwright, fully local).

Runs against the static web app served at http://localhost:8765/web/index.html
(start with `python -m http.server 8765 --directory <repo>` if not running; the
fixture falls back to launching its own server). Map tiles are blocked in CI
sandboxes; ERR_TUNNEL console errors are ignored.
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
DEFAULT_URL = "http://localhost:8765/web/index.html"

AFRICA = {"DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CD", "CG", "CI", "DJ", "EG", "GQ", "ER", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "YT", "MA", "MZ", "NA", "NE", "NG", "RE", "RW", "SH", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "SZ", "TZ", "TG", "TN", "UG", "EH", "ZM", "ZW"}


def _port_open(host, port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


@pytest.fixture(scope="module")
def base_url():
    if _port_open("127.0.0.1", 8765):
        yield DEFAULT_URL
        return
    port = 8765
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        if _port_open("127.0.0.1", port):
            break
        time.sleep(0.1)
    yield f"http://127.0.0.1:{port}/web/index.html"
    server.terminate()
    server.wait()


@pytest.fixture(scope="module")
def page(base_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        pg = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(base_url, wait_until="networkidle", timeout=60000)
        pg.wait_for_function("() => window.SkylineCopilot && window.airportsData && window.airportsData.length > 1000", timeout=30000)
        pg.evaluate("() => { try { localStorage.setItem('skyline_voice_enabled', 'false'); } catch (e) {} }")
        pg.errors = errors
        yield pg
        browser.close()


ASK_JS = """async (q) => {
  const item = await window.executeAssistantCommand(q);
  const hist = window.getConversationHistory();
  const last = hist[hist.length - 1];
  const lookup = window.airportLookup || {};
  const rowIatas = Array.from(document.querySelectorAll('#assistant-history-list .cp-exchange:last-child .cp-table tbody tr[data-copilot-action]'))
     .map(tr => { try { return JSON.parse(tr.getAttribute('data-copilot-action')).iata; } catch (e) { return null; } }).filter(Boolean);
  return {
    intent: last.intent, confidence: last.confidence, reply: last.reply, html: last.html,
    entities: last.entities, actions: last.actions, followups: last.followups,
    rowIatas, rowCountries: rowIatas.map(i => (lookup[i] || {}).country),
    rowCount: document.querySelectorAll('#assistant-history-list .cp-exchange:last-child .cp-table tbody tr').length,
    panelVisible: document.getElementById('assistant-reply-panel').style.display !== 'none',
    horizon: typeof window.getCurrentHorizon === 'function' ? window.getCurrentHorizon() : null,
  };
}"""


def ask(page, q):
    res = page.evaluate(ASK_JS, q)
    assert res["intent"], f"no intent for {q!r}"
    assert "not recognized" not in res["reply"].lower(), f"dead-end reply for {q!r}: {res['reply']}"
    assert res["html"] and len(res["html"]) > 40, f"empty html for {q!r}"
    assert res["panelVisible"], "reply panel should be open"
    assert isinstance(res["followups"], list) and len(res["followups"]) >= 1, f"no followups for {q!r}"
    return res


# ---------------------------------------------------------------------------
# Core natural-language coverage (≥ 40 queries)
# ---------------------------------------------------------------------------
NL_CASES = [
    # (query, expected intent(s), reply must contain regex or None)
    ("which airports in india will grow the most by 2035", {"top_n"}, r"India"),
    ("Which Indian airports grow most by 2035?", {"top_n"}, r"India"),
    ("top 5 risers in africa by 2035", {"top_n"}, r"Africa"),
    ("top 10 emerging", {"top_n"}, None),
    ("top 10 hubs at +5", {"top_n"}, None),
    ("top ten declining at +10", {"top_n"}, None),
    ("biggest hubs in the middle east", {"top_n"}, r"Middle East"),
    ("most connected airports in europe", {"top_n"}, r"Europe"),
    ("uk hubs", {"top_n"}, r"United Kingdom"),
    ("how many emerging airports in africa", {"count"}, r"\d+ of \d+"),
    ("how many airports in the us", {"count"}, r"\d+"),
    ("tell me about india's aviation", {"country_overview"}, r"India has \d+"),
    ("india 2035", {"country_overview"}, r"India"),
    ("vietnam 2030", {"country_overview"}, r"Vietnam"),
    ("gulf 2030", {"region_overview"}, r"Gulf"),
    ("fastest growing countries", {"region_overview"}, r"momentum"),
    ("which countries grow fastest in asia", {"region_overview"}, r"Asia"),
    ("is there a direct flight DEL to SFO", {"route_between"}, r"(direct|hops?)"),
    ("Is there a direct route DEL→SFO?", {"route_between"}, r"(direct|hops?)"),
    ("how do I get from nairobi to lima", {"route_between"}, r"(direct|hops?|path)"),
    ("where does DOH fly", {"routes_from"}, r"Doha \(DOH\) connects to \d+"),
    ("how many routes does AMS have", {"routes_from"}, r"\d+"),
    ("what happens if DXB closes", {"resilience"}, r"(\d+(\.\d+)?%|\d+ airports?)"),
    ("most critical hub", {"resilience"}, r"critical"),
    ("compare SIN and DXB", {"compare"}, r"SIN|DXB"),
    ("compare London and Paris", {"compare"}, r"London|Paris"),
    ("Compare SIN and DXB", {"compare"}, None),
    ("will BLR overtake MAA", {"trajectory"}, r"BLR|MAA|Bengaluru|Chennai"),
    ("will DEL decline", {"trajectory"}, r"DEL|Delhi"),
    ("where does hyderabad rank", {"rank_of"}, r"#\d+"),
    ("why is BLR emerging", {"airport_details"}, r"driven by"),
    ("how confident is the SIN forecast", {"uncertainty"}, r"band"),
    ("what is importance score", {"methodology"}, r"Importance score"),
    ("what does emerging mean", {"methodology"}, r"Emerging"),
    ("what are the data sources", {"methodology"}, r"OpenFlights"),
    ("how is the forecast computed", {"methodology"}, None),
    ("network stats", {"network_stats"}, r"\d[\d,]* connected airports"),
    ("if india's gdp grows 2% faster", {"scenario"}, r"GDP"),
    ("airline opportunities from DEL", {"opportunities"}, r"DEL|Delhi"),
    ("investor picks in southeast asia", {"opportunities"}, r"Southeast Asia"),
    ("tourism picks in africa", {"opportunities"}, r"Africa"),
    ("show hyderbad", {"show_airport"}, r"Hyderabad, HYD"),
    ("take me to SIN", {"show_airport"}, r"Singapore"),
    ("where is Tokyo", {"show_airport"}, r"Tokyo"),
    ("find Dubai", {"show_airport"}, r"Dubai"),
    ("switch to 2030", {"navigate"}, r"2030"),
    ("open radar", {"navigate"}, r"Radar"),
    ("reset map", {"navigate"}, r"reset"),
    ("show only emerging airports", {"navigate"}, r"emerging"),
    ("hello", {"greeting"}, r"Copilot"),
    ("help", {"help"}, None),
]


@pytest.mark.parametrize("query,intents,pattern", NL_CASES, ids=[c[0] for c in NL_CASES])
def test_natural_language_query(page, query, intents, pattern):
    import re
    res = ask(page, query)
    assert res["intent"] in intents, f"{query!r} -> {res['intent']} (expected {intents}); reply={res['reply']}"
    if pattern:
        assert re.search(pattern, res["reply"]), f"{query!r}: reply {res['reply']!r} does not match {pattern!r}"


def test_india_query_returns_only_indian_airports(page):
    res = ask(page, "which airports in india will grow the most by 2035")
    assert res["rowCount"] == 10
    assert res["rowCountries"] and set(res["rowCountries"]) == {"IN"}, res["rowCountries"]
    assert res["entities"]["countries"] == ["IN"]
    assert res["entities"]["horizon"] == "h10"


def test_top5_africa_risers_rows(page):
    res = ask(page, "top 5 risers in africa by 2035")
    assert res["rowCount"] == 5
    assert all(c in AFRICA for c in res["rowCountries"]), res["rowCountries"]
    assert "▲" in res["html"] or "cp-delta" in res["html"]
    assert "cp-badge" in res["html"]


def test_route_answer_mentions_hops_or_direct(page):
    import re
    res = ask(page, "is there a direct flight DEL to SFO")
    assert re.search(r"\b(direct|hops?)\b", res["reply"], re.I)
    assert "cp-path" in res["html"]
    assert any(a["type"] == "draw_route" for a in res["actions"])


def test_dxb_closure_mentions_numbers(page):
    import re
    res = ask(page, "what happens if DXB closes")
    assert re.search(r"(\d+(\.\d+)?%|\d+ airports?)", res["reply"]), res["reply"]
    assert "cp-kpi" in res["html"]


def test_country_overview_cards(page):
    res = ask(page, "tell me about india's aviation")
    assert "cp-kpi" in res["html"] and "cp-table" in res["html"]
    assert res["entities"]["countries"] == ["IN"]


def test_fallback_never_dead_ends(page):
    res = ask(page, "what is the weather today")
    assert res["intent"] == "fallback"
    assert res["confidence"] < 0.5
    assert "not recognized" not in res["reply"].lower()
    assert "data-copilot-ask" in res["html"]  # clickable suggestions
    assert len(res["followups"]) == 3
    res2 = ask(page, "asdkjh qwe zzz")
    assert res2["intent"] == "fallback" and res2["followups"]


def test_typo_and_lowercase_iata(page):
    res = ask(page, "show hyderbad")
    assert res["entities"]["airports"] == ["HYD"]
    res = ask(page, "compare del and bom")
    assert res["intent"] == "compare" and set(res["entities"]["airports"]) == {"DEL", "BOM"}


def test_multi_part_question(page):
    res = ask(page, "compare DEL and BOM and show on map")
    assert res["intent"] == "compare"
    types = {a["type"] for a in res["actions"]}
    assert "compare" in types and "draw_route" in types


def test_followups_use_history_and_selection(page):
    page.evaluate("() => window.clearConversation()")
    ask(page, "show SIN")
    res = ask(page, "compare it with DXB")
    assert res["intent"] == "compare" and res["entities"]["airports"] == ["SIN", "DXB"]
    ask(page, "top 5 risers in india by 2035")
    res = ask(page, "and in 2030?")
    assert res["intent"] == "top_n"
    assert set(res["rowCountries"]) == {"IN"} and res["entities"]["horizon"] == "h5"
    ask(page, "show BLR")
    res = ask(page, "why?")
    assert res["intent"] == "airport_details" and res["entities"]["airports"] == ["BLR"]


def test_actions_drive_the_ui(page):
    res = ask(page, "switch to 2030")
    assert res["horizon"] == "h5"
    res = ask(page, "switch to current")
    assert res["horizon"] == "present"
    ask(page, "open radar")
    assert page.evaluate("() => document.body.classList.contains('radar-tab-active') || document.getElementById('radar-panel').style.display !== 'none'")
    ask(page, "back to map")
    ask(page, "show hyderabad")
    assert page.evaluate("() => document.getElementById('airport-card').style.display !== 'none'")
    assert page.evaluate("() => (document.getElementById('airport-card-body').textContent || '').includes('HYD')")


def test_chip_click_dispatches_action(page):
    ask(page, "top 3 hubs in the gulf")
    page.click("#assistant-history-list .cp-exchange:last-child .cp-table tbody tr[data-copilot-action]:first-child")
    page.wait_for_timeout(500)
    assert page.evaluate("() => (document.getElementById('airport-card-body').textContent || '').includes('DXB')")
    before = page.evaluate("() => window.getConversationHistory().length")
    page.click("#assistant-history-list .cp-exchange:last-child .cp-followup")
    page.wait_for_timeout(600)
    assert page.evaluate("() => window.getConversationHistory().length") == before + 1


def test_thread_ui_elements(page):
    page.evaluate("() => window.clearConversation()")
    assert page.evaluate("() => document.getElementById('assistant-reply-panel').style.display") == "none"
    ask(page, "hello")
    ask(page, "compare SIN and DXB")
    counts = page.evaluate("""() => ({
        exchanges: document.querySelectorAll('#assistant-history-list .cp-exchange').length,
        user: document.querySelectorAll('#assistant-history-list .cp-bubble-user').length,
        bot: document.querySelectorAll('#assistant-history-list .cp-bubble-bot').length,
        rich: document.querySelectorAll('#assistant-history-list .cp-rich').length,
        clearBtn: !!document.getElementById('btn-assistant-clear'),
        typing: document.getElementById('assistant-typing').style.display,
        placeholder: document.getElementById('assistant-input').getAttribute('placeholder'),
    })""")
    assert counts["exchanges"] == 2 and counts["user"] == 2 and counts["bot"] == 2 and counts["rich"] == 2
    assert counts["clearBtn"] and counts["typing"] == "none"
    assert counts["placeholder"].startswith("Ask Skyline")
    # History items keep the required shape
    item = page.evaluate("() => { const h = window.getConversationHistory(); const l = h[h.length-1]; return Object.keys(l); }")
    for key in ("query", "reply", "html", "intent", "confidence"):
        assert key in item
    # the compare action opened the modal drawer; close it so the chat is clickable again
    page.evaluate("() => { const b = document.getElementById('btn-close-compare'); if (b) b.click(); }")
    page.click("#btn-assistant-clear")
    assert page.evaluate("() => window.getConversationHistory().length") == 0


def test_panel_does_not_collide_with_bottom_bar(page):
    ask(page, "top 10 risers in asia by 2035")
    rects = page.evaluate("""() => {
        const r = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return {top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height}; };
        return { panel: r('assistant-reply-panel'), bar: r('assistant-bar'), stats: r('map-statistics'), vh: window.innerHeight,
                 collides: window.checkPanelCollision ? window.checkPanelCollision(document.getElementById('assistant-reply-panel')) : null };
    }""")
    panel, bar = rects["panel"], rects["bar"]
    assert panel and bar
    assert panel["bottom"] <= bar["top"] + 2, rects
    assert panel["h"] <= rects["vh"] * 0.7
    if rects["stats"]:
        assert panel["bottom"] <= rects["stats"]["top"] + 8, rects
    assert rects["collides"] in (False, None), rects


def test_llm_config_is_local_and_optional(page):
    page.evaluate("() => window.setLlmConfig({provider:'openai', model:'test-model', key:'sk-test', baseUrl:'http://127.0.0.1:9/v1'})")
    assert page.evaluate("() => JSON.parse(localStorage.getItem('skyline_llm_config')).model") == "test-model"
    # Unreachable endpoint must fall back silently to the local answer
    res = ask(page, "what is the weather today")
    assert res["intent"] in ("fallback", "open_question") and "not recognized" not in res["reply"].lower()
    page.evaluate("() => window.setLlmConfig(null)")
    assert page.evaluate("() => localStorage.getItem('skyline_llm_config')") is None
    assert page.evaluate("() => document.getElementById('assistant-llm-status').textContent") == "Local engine only"


def test_engine_is_pure_and_fast(page):
    stats = page.evaluate("""() => {
        const ctx = { airports: window.airportsData, airportLookup: window.airportLookup, opportunities: window.opportunitiesData, intelligence: window.intelligenceData, horizon: 'present', selectedAirport: null, history: [] };
        const qs = ['top 10 risers in asia by 2035', 'what happens if LHR closes', 'how do I get from Nairobi to Lima', 'fastest growing countries in africa', 'tell me about brazil'];
        const t0 = performance.now();
        const out = qs.map(q => window.SkylineCopilot.answer(q, ctx));
        return { ms: performance.now() - t0, intents: out.map(o => o.intent), ok: out.every(o => o.reply && o.html && Array.isArray(o.actions) && o.followups.length === 3 && typeof o.confidence === 'number') };
    }""")
    assert stats["ok"], stats
    assert stats["ms"] < 4000, stats


def test_no_page_errors(page):
    bad = [e for e in page.errors if "ERR_TUNNEL" not in e]
    assert not bad, bad


def test_h10_mode_raw_vs_damped(page):
    res = page.evaluate("""() => {
        const ctx = { airports: window.airportsData, airportLookup: window.airportLookup, intelligence: window.intelligenceData, meta: window.forecastsMeta, horizon: 'present', selectedAirport: null, history: [] };
        const ap = window.airportsData.find(a => a.forecast_h10 && a.forecast_h10.level_damped != null && Math.abs(a.forecast_h10.level_damped - a.forecast_h10.level) > 0.5);
        if (!ap) return { skip: true };
        const damped = window.SkylineCopilot.answer('show ' + ap.iata, Object.assign({}, ctx, { h10Mode: 'damped' }));
        const raw = window.SkylineCopilot.answer('show ' + ap.iata, Object.assign({}, ctx, { h10Mode: 'raw' }));
        const num = (s) => Number(s.match(/([\\d.]+) by 2035/)[1]);
        return { iata: ap.iata, lvlDamped: ap.forecast_h10.level_damped, lvlRaw: ap.forecast_h10.level,
                 dampedReply: num(damped.reply), rawReply: num(raw.reply), dampedHtml: damped.html, rawHtml: raw.html,
                 uiMode: window.SKYLINE_H10_MODE };
    }""")
    if res.get("skip"):
        pytest.skip("no airport with a materially damped 2035 level in this dataset")
    assert abs(res["dampedReply"] - round(res["lvlDamped"], 1)) < 0.11, res
    assert abs(res["rawReply"] - round(res["lvlRaw"], 1)) < 0.11, res
    assert "damped" in res["dampedHtml"] and "raw ensemble" in res["rawHtml"]
    # The live UI passes window.SKYLINE_H10_MODE through to the engine
    page.evaluate("() => { window.SKYLINE_H10_MODE = 'raw'; }")
    try:
        live = ask(page, "show " + res["iata"])
        assert "raw ensemble" in live["html"]
    finally:
        page.evaluate("() => { window.SKYLINE_H10_MODE = 'damped'; }")
    live = ask(page, "show " + res["iata"])
    assert "damped" in live["html"] and "raw ensemble" not in live["html"]


def test_no_external_network_without_llm_config(page):
    """Answers come only from the project data: with no BYOK config, 30 queries must not fetch any non-local origin."""
    page.evaluate("() => { window.setLlmConfig(null); window.setSmartModeEnabled(false); try { localStorage.setItem('skyline_voice_enabled', 'false'); } catch (e) {} }")
    page.evaluate("""() => {
        window.__fetchLog = [];
        window.__origFetch = window.fetch;
        window.fetch = function (url, opts) {
            const u = String(url && url.url ? url.url : url);
            window.__fetchLog.push(u);
            return window.__origFetch.apply(this, arguments);
        };
    }""")
    queries = [c[0] for c in NL_CASES[:30]]
    for q in queries:
        ask(page, q)
    log = page.evaluate("() => { const l = window.__fetchLog.slice(); window.fetch = window.__origFetch; return l; }")
    external = [u for u in log if u.startswith("http") and not any(h in u for h in ("localhost", "127.0.0.1"))]
    assert external == [], f"external fetches detected: {external}"
    # anything fetched must be a same-origin project file (e.g. intelligence.json)
    for u in log:
        assert u.endswith(".json") or "localhost" in u or "127.0.0.1" in u or not u.startswith("http"), u
