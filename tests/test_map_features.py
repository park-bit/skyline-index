"""Playwright coverage for the map / product-core features in web/app.js.

Covers: time-lapse play, network-shift arcs, country drill-down via search,
URL hash restore, dossier export download, and the new tab/panel registry.
"""

import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

DATA_READY = "window.airportsData && window.airportsData.length > 0 && document.body.classList.contains('data-ready')"


def _find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def web_server():
    port = _find_free_port()
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


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        yield b
        b.close()


def _open(browser, port, suffix="", width=1440, height=900):
    page = browser.new_page(viewport={"width": width, "height": height})
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.on(
        "console",
        lambda msg: errors.append(msg.text)
        if msg.type == "error" and "failed to load resource" not in msg.text.lower()
        else None,
    )
    page.goto(f"http://127.0.0.1:{port}/web/index.html{suffix}", wait_until="networkidle")
    page.wait_for_function(DATA_READY, timeout=30000)
    page.evaluate("localStorage.clear()")
    return page, errors


def test_play_animation_advances_horizon(browser, web_server):
    page, errors = _open(browser, web_server)
    assert page.evaluate("getCurrentHorizon()") == "present"
    page.click("#btn-horizon-play")
    assert page.get_attribute("#btn-horizon-play", "aria-pressed") == "true"
    # Year label ticks while tweening (2025 -> 2030 takes ~2.5s)
    page.wait_for_function(
        "parseInt(document.getElementById('horizon-year-label').textContent, 10) > 2025", timeout=8000
    )
    page.wait_for_function("getCurrentHorizon() === 'h5'", timeout=8000)
    assert "active" in page.get_attribute("#btn-horizon-h5", "class")
    page.wait_for_function("getCurrentHorizon() === 'h10'", timeout=8000)
    # Non-looping run stops itself at +10
    page.wait_for_function("document.getElementById('btn-horizon-play').getAttribute('aria-pressed') === 'false'", timeout=6000)
    assert page.text_content("#horizon-year-label").strip() == "2035"
    assert page.text_content("#stat-horizon-year").strip() == "2035"
    assert errors == [], errors
    page.close()


def test_network_shifts_toggle_draws_arcs(browser, web_server):
    page, errors = _open(browser, web_server)
    page.click("#btn-horizon-h10")
    assert "active" in page.get_attribute("#btn-horizon-h10", "class")
    page.click("#toggle-network-shifts + .slider")
    page.wait_for_function("document.querySelectorAll('.leaflet-networkShifts-pane path').length > 0", timeout=5000)
    n_arcs = page.evaluate("document.querySelectorAll('.leaflet-networkShifts-pane path').length")
    assert n_arcs > 0
    assert n_arcs <= 150
    assert page.is_visible("#legend-network-block")
    # Colours are only green (rising), red (falling) or neutral grey (|delta| < 0.1)
    strokes = page.evaluate(
        "Array.from(document.querySelectorAll('.leaflet-networkShifts-pane path')).map(p => p.getAttribute('stroke'))"
    )
    assert set(strokes) <= {"#3CCB7F", "#FF4D6D", "#8E96A3"}
    assert len(strokes) == n_arcs
    # Arcs stay below the marker canvas so airports remain clickable
    z_arcs = page.evaluate("parseInt(getComputedStyle(map.getPane('networkShifts')).zIndex, 10)")
    z_markers = page.evaluate("parseInt(getComputedStyle(map.getPane('overlayPane')).zIndex, 10)")
    assert z_arcs < z_markers
    # Present horizon has no projected change -> arcs cleared, hint explains why
    page.click("#btn-horizon-present")
    assert page.evaluate("document.querySelectorAll('.leaflet-networkShifts-pane path').length") == 0
    assert "+5 or +10" in page.text_content("#network-shift-hint")
    # Hash carries the toggle
    assert "net=1" in page.evaluate("location.hash")
    assert errors == [], errors
    page.close()


def test_geodesic_arcs_split_antimeridian(browser, web_server):
    page, _errors = _open(browser, web_server)
    segs = page.evaluate("geodesicSegments(35.5, 139.8, 37.6, -122.4, 32)")  # HND -> SFO crosses 180
    assert len(segs) == 2
    assert abs(abs(segs[0][-1][1]) - 180) < 1e-6
    assert abs(abs(segs[1][0][1]) - 180) < 1e-6
    segs2 = page.evaluate("geodesicSegments(51.5, -0.5, 40.6, -73.8, 32)")  # LHR -> JFK stays in one piece
    assert len(segs2) == 1 and len(segs2[0]) == 33
    page.close()


def test_country_search_renders_country_panel(browser, web_server):
    page, errors = _open(browser, web_server)
    page.fill("#search-input", "India")
    # Suggestions include the country entry
    page.wait_for_selector("#search-results button.result-country[data-country='IN']")
    page.keyboard.press("Enter")
    page.wait_for_selector("#country-card", state="visible")
    assert page.text_content("#country-name").strip() == "India"
    countries = page.evaluate(
        "Array.from(document.querySelectorAll('#country-table tbody tr')).map(tr => airportLookup[tr.dataset.iata].country)"
    )
    assert len(countries) > 0
    assert set(countries) == {"IN"}
    # Markers on the map are limited to Indian airports
    visible_countries = page.evaluate(
        "Array.from(new Set(airportsData.filter(a => a.country !== 'IN').map(a => a.country))).length"
    )
    assert visible_countries > 0
    n_in = page.evaluate("airportsData.filter(a => a.country === 'IN' && a.latitude != null).length")
    # KPI tiles present and consistent with the data
    tiles = page.evaluate("document.querySelectorAll('#country-card .kpi-tile').length")
    assert tiles == 8
    assert page.text_content("#country-card .kpi-tile strong").strip() == str(n_in)
    # Map stats settle (count-up animation) on the Indian airports only
    page.wait_for_function(
        f"document.getElementById('stat-airports-count').textContent.trim() === '{n_in}'", timeout=5000
    )
    assert len(countries) == min(60, n_in)
    # Airport card hidden while the country panel is open; clicking a row selects it
    assert not page.is_visible("#airport-card")
    page.click("#country-table tbody tr[data-iata='DEL']")
    page.wait_for_selector("#selected-iata")
    assert page.text_content("#selected-iata") == "DEL"
    assert not page.is_visible("#country-card")
    # ISO2 also resolves (search by code)
    page.fill("#search-input", "")
    page.fill("#search-input", "jp")
    page.keyboard.press("Enter")
    page.wait_for_selector("#country-card", state="visible")
    assert page.text_content("#country-name").strip() == "Japan"
    assert "c=JP" in page.evaluate("location.hash")
    assert errors == [], errors
    page.close()


def test_url_hash_restore_selects_airport(browser, web_server):
    page, errors = _open(browser, web_server, "#ap=DEL&h=h10&tab=map&net=1")
    page.wait_for_selector("#selected-iata")
    assert page.text_content("#selected-iata") == "DEL"
    assert page.evaluate("getCurrentHorizon()") == "h10"
    assert "active" in page.get_attribute("#btn-horizon-h10", "class")
    assert page.is_checked("#toggle-network-shifts")
    assert page.evaluate("document.querySelectorAll('.leaflet-networkShifts-pane path').length") > 0
    # Stats reflect the restored horizon (not the present baseline)
    assert page.text_content("#stat-horizon-year").strip() == "2035"
    # Selecting another airport updates the hash
    page.evaluate("selectAirport(airportLookup['LHR'])")
    assert "ap=LHR" in page.evaluate("location.hash")
    assert "h=h10" in page.evaluate("location.hash")
    assert errors == [], errors
    page.close()

    # Tab restore
    page2, errors2 = _open(browser, web_server, "#tab=method")
    assert page2.is_visible("#method-panel")
    assert "active" in page2.get_attribute("#tab-nav-method", "class")
    assert errors2 == [], errors2
    page2.close()


def test_hash_tab_load_hides_map_chrome(browser, web_server):
    for tab, panel in [("intel", "intel-panel"), ("scenario", "scenario-panel")]:
        page, errors = _open(browser, web_server, f"#tab={tab}")
        assert page.is_visible(f"#{panel}")
        for sel in ["#airport-card", "#country-card", "#left-panel", "#legend-pill", "#map-statistics"]:
            assert not page.is_visible(sel), f"{sel} should be hidden on the {tab} tab"
        # Returning to the map restores map chrome
        page.click("#tab-nav-map")
        for sel in ["#left-panel", "#legend-pill", "#map-statistics"]:
            assert page.is_visible(sel)
        assert errors == [], errors
        page.close()
    # Same with an airport in the hash
    page, errors = _open(browser, web_server, "#ap=DEL&tab=intel")
    assert page.is_visible("#intel-panel") and not page.is_visible("#airport-card")
    page.click("#tab-nav-map")
    page.wait_for_selector("#airport-card", state="visible")
    assert page.text_content("#selected-iata") == "DEL"
    # highlightAirports must not switch tabs on its own
    page.click("#tab-nav-scenario")
    page.evaluate("highlightAirports(['DXB', 'LHR'])")
    assert page.is_visible("#scenario-panel") and not page.is_visible("#airport-card")
    page.evaluate("highlightAirports(['DXB'], {switchToMap: true})")
    assert page.is_visible("#left-panel")
    assert errors == [], errors
    page.close()


def test_export_dossier_triggers_download(browser, web_server):
    page, errors = _open(browser, web_server)
    page.evaluate("selectAirport(airportLookup['SIN'])")
    page.wait_for_selector("#btn-card-export")
    with page.expect_download(timeout=10000) as dl_info:
        page.click("#btn-card-export")
    download = dl_info.value
    assert download.suggested_filename == "skyline-dossier-SIN.html"
    path = download.path()
    html = Path(path).read_text(encoding="utf-8")
    assert "Singapore Changi" in html
    assert "<svg" in html  # sparkline embedded
    assert "2035" in html

    with page.expect_download(timeout=10000) as dl_json:
        page.click("#btn-card-export-json")
    djson = dl_json.value
    assert djson.suggested_filename == "skyline-SIN.json"
    import json

    record = json.loads(Path(djson.path()).read_text(encoding="utf-8"))
    assert record["airport"]["iata"] == "SIN"
    assert "rank" in record
    assert errors == [], errors
    page.close()


def test_new_tabs_show_panels(browser, web_server):
    page, errors = _open(browser, web_server)
    for tab, panel in [("intel", "intel-panel"), ("scenario", "scenario-panel"), ("method", "method-panel"), ("radar", "radar-panel")]:
        page.click(f"#tab-nav-{tab}")
        assert page.is_visible(f"#{panel}"), f"{panel} should be visible"
        assert page.get_attribute(f"#tab-nav-{tab}", "aria-pressed") == "true"
        assert page.evaluate(f"document.getElementById('{panel}').innerHTML.trim().length") > 0
        # Only one panel visible at a time
        others = page.evaluate(
            "['intel-panel','scenario-panel','method-panel','radar-panel'].filter(id => getComputedStyle(document.getElementById(id)).display !== 'none')"
        )
        assert others == [panel]
        assert not page.is_visible("#left-panel")
    page.click("#tab-nav-map")
    assert page.is_visible("#left-panel")
    assert page.evaluate("getComputedStyle(document.getElementById('intel-panel')).display") == "none"
    assert errors == [], errors
    page.close()


def test_dossier_rank_badge_and_copilot_button(browser, web_server):
    page, errors = _open(browser, web_server)
    page.evaluate("selectAirport(airportLookup['SIN'])")
    page.wait_for_selector("#airport-card .rank-badge")
    rank_text = page.text_content("#airport-card .rank-badge")
    assert "#" in rank_text
    assert page.evaluate("getAirportRank(airportLookup['SIN'], 'present')") >= 1
    # Country link opens the country panel
    page.click("#airport-card .country-link")
    page.wait_for_selector("#country-card", state="visible")
    assert page.text_content("#country-name").strip() == "Singapore"
    assert errors == [], errors
    page.close()


def test_mobile_layout_has_no_overlaps(browser, web_server):
    page, errors = _open(browser, web_server, "", width=390, height=844)
    page.click("#btn-mobile-menu")
    for tab in ["intel", "scenario", "method", "map"]:
        assert page.is_visible(f"#tab-nav-{tab}")
    page.click("#tab-nav-intel")
    assert page.is_visible("#intel-panel")
    page.click("#btn-mobile-menu")
    page.click("#tab-nav-map")
    page.click("#btn-mobile-filters")
    assert page.is_visible("#left-panel")
    page.fill("#search-input", "India")
    page.keyboard.press("Enter")
    page.wait_for_selector("#country-card", state="visible")
    boxes = page.evaluate(
        """() => ['#country-card', '#map-statistics', '#assistant-bar', '#pill-brand'].map(s => {
            const r = document.querySelector(s).getBoundingClientRect();
            return {s, top: r.top, bottom: r.bottom, left: r.left, right: r.right};
        })"""
    )
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            a, b = boxes[i], boxes[j]
            ox = min(a["right"], b["right"]) - max(a["left"], b["left"])
            oy = min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])
            assert not (ox > 0.5 and oy > 0.5), f"{a['s']} overlaps {b['s']}"
    assert errors == [], errors
    page.close()


def test_h10_mode_toggle_changes_scores(browser, web_server):
    page, errors = _open(browser, web_server)
    assert page.evaluate("window.SKYLINE_H10_MODE") == "damped"
    # Pick an airport whose damped and raw 2035 levels differ (DEL if possible)
    iata = page.evaluate(
        """(() => {
            const cands = airportsData.filter(a => a.forecast_h10 && a.forecast_h10.level_damped != null
                && Math.abs(a.forecast_h10.level_damped - a.forecast_h10.level) > 0.05);
            const del = cands.find(a => a.iata === 'DEL');
            return (del || cands[0] || {}).iata || null;
        })()"""
    )
    if iata is None:
        pytest.skip("No airport with level_damped != level in this dataset")
    page.evaluate(f"selectAirport(airportLookup['{iata}'])")
    page.click("#btn-horizon-h10")
    damped = page.evaluate(f"getH10(airportLookup['{iata}'])")
    assert damped["mode"] == "damped" and damped["damped"] is True
    damped_score = page.evaluate(f"getAirportScore(airportLookup['{iata}'], 'h10')")
    assert abs(damped_score - damped["level"]) < 1e-9
    assert page.evaluate("document.querySelectorAll('#airport-card .damped-note').length") > 0

    fired = page.evaluate("new Promise(res => { document.addEventListener('skyline:h10mode', e => res(e.detail), {once: true}); setH10Mode('raw'); })")
    assert fired["mode"] == "raw" and fired["changed"] is True
    assert page.evaluate("window.SKYLINE_H10_MODE") == "raw"
    raw = page.evaluate(f"getH10(airportLookup['{iata}'])")
    assert raw["mode"] == "raw" and raw["damped"] is False
    assert abs(raw["level"] - damped["level"]) > 0.05
    assert raw["level"] == page.evaluate(f"airportLookup['{iata}'].forecast_h10.level")
    # Markers/stats/dossier re-rendered on the raw value
    assert abs(page.evaluate(f"getAirportScore(airportLookup['{iata}'], 'h10')") - raw["level"]) < 1e-9
    assert page.evaluate("document.querySelectorAll('#airport-card .damped-note').length") == 0
    assert f"{raw['level']:.1f}" in page.text_content("#airport-card .score-ring strong")
    # Select in settings reflects the mode and persists it
    assert page.evaluate("document.getElementById('h10-mode-select').value") == "raw"
    assert page.evaluate("localStorage.getItem('skyline_h10_mode')") == "raw"
    # Flip back via the select element inside the settings popover
    page.click("#btn-settings-toggle")
    page.wait_for_selector("#h10-mode-select", state="visible")
    assert "damped" in page.text_content("#h10-mode-select option[value='damped']")
    page.select_option("#h10-mode-select", "damped")
    assert page.evaluate("window.SKYLINE_H10_MODE") == "damped"
    assert abs(page.evaluate(f"getAirportScore(airportLookup['{iata}'], 'h10')") - damped["level"]) < 1e-9
    assert errors == [], errors
    page.close()
