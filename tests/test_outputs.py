import json
import socket
import subprocess
import sys
import time

import pytest

from src.config import OUTPUTS, ROOT


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def test_forecasts_json_validity_and_size():
    path = OUTPUTS / "forecasts.json"
    assert path.exists(), "forecasts.json does not exist"
    size_mb = path.stat().st_size / (1024 * 1024)
    assert size_mb < 5.0, f"forecasts.json size {size_mb:.2f} MB exceeds 5 MB limit"

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "generated_as_of_year" in data
    assert "airports" in data
    airports = data["airports"]
    assert len(airports) >= 1000

    sample = airports[0]
    for key in ["iata", "name", "city", "country", "importance_present", "forecast_h5", "forecast_h10"]:
        assert key in sample


def test_opportunities_json_validity_and_size():
    path = OUTPUTS / "opportunities.json"
    assert path.exists(), "opportunities.json does not exist"
    size_mb = path.stat().st_size / (1024 * 1024)
    assert size_mb < 5.0, f"opportunities.json size {size_mb:.2f} MB exceeds 5 MB limit"

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for list_key in ["airline_opportunities", "investor_opportunities", "tourism_opportunities"]:
        assert list_key in data
        assert len(data[list_key]) > 0


def test_browser_smoke_test_with_playwright():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        pytest.skip("Playwright is not installed")

    port = 8765
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--directory", str(ROOT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Wait for server to bind
    for _ in range(20):
        if is_port_in_use(port):
            break
        time.sleep(0.1)

    console_errors = []
    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(headless=True)
            except Exception as e:
                pytest.skip(f"Playwright browser not installed: {e}")
            page = browser.new_page()

            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda err: console_errors.append(str(err)))

            page.goto(f"http://127.0.0.1:{port}/web/index.html", wait_until="networkidle")

            # Check heading
            title = page.locator("#app-title").inner_text()
            assert "Global Aviation Intelligence Map" in title

            # Switch horizons
            btn_h5 = page.locator("#btn-horizon-h5")
            btn_h5.click()
            assert "active" in btn_h5.get_attribute("class")

            btn_h10 = page.locator("#btn-horizon-h10")
            btn_h10.click()
            assert "active" in btn_h10.get_attribute("class")

            # Switch to Radar tab
            tab_radar = page.locator("#tab-nav-radar")
            tab_radar.click()
            radar_cards = page.locator(".radar-card")
            assert radar_cards.count() > 0

            # Switch back to Map tab
            tab_map = page.locator("#tab-nav-map")
            tab_map.click()

            # Select an airport via search and click
            search_input = page.locator("#search-input")
            search_input.fill("ATL")

            # Trigger selection programmatically or click first marker
            page.evaluate("selectAirport(airportsData.find(a => a.iata === 'ATL'))")
            page.wait_for_selector("#selected-iata")

            selected_iata = page.locator("#selected-iata").inner_text()
            assert selected_iata == "ATL"

            drawer_name = page.locator("#selected-name").inner_text()
            assert "Atlanta" in drawer_name or "Hartsfield" in drawer_name

            browser.close()
    finally:
        server.terminate()
        server.wait()

    # Verify no serious console or page runtime errors occurred
    severe_errors = [e for e in console_errors if "favicon" not in e.lower()]
    assert len(severe_errors) == 0, f"Encountered console errors: {severe_errors}"


def test_reports_contain_no_unsupported_numbers_or_ranges():
    import re

    reports_dir = ROOT / "reports"
    report_files = [
        "evaluation.md",
        "ablation.md",
        "reconstruction_traffic.md",
        "reconstruction_network.md",
        "baselines.md",
        "folds.md",
    ]

    for fname in report_files:
        fpath = reports_dir / fname
        if not fpath.exists():
            continue
        lines = fpath.read_text(encoding="utf-8").splitlines()

        table_numbers = set()
        for l in lines:
            if l.strip().startswith("|") and not l.strip().startswith("|---"):
                for m in re.finditer(r"[-+]?\d+(?:\.\d+)?%?", l):
                    v_str = m.group(0).rstrip("%")
                    try:
                        table_numbers.add(float(v_str))
                    except ValueError:
                        pass
            elif l.strip().startswith("- ") or l.strip().startswith("Damped ") or "ratio is" in l or "median of" in l:
                for m in re.finditer(r"[-+]?\d+(?:\.\d+)?%?", l):
                    v_str = m.group(0).rstrip("%")
                    try:
                        table_numbers.add(float(v_str))
                    except ValueError:
                        pass

        for l in lines:
            stripped = l.strip()
            if stripped.startswith("|") or stripped.startswith("#") or stripped.startswith("```"):
                continue

            for ratio_match in re.finditer(r"(\d+(?:\.\d+)?)\s*x(?:\s+lift)?\b", stripped, re.IGNORECASE):
                ratio_val = float(ratio_match.group(1))
                derivable = False
                for a in table_numbers:
                    for b in table_numbers:
                        if b > 0 and abs((a / b) - ratio_val) / ratio_val < 0.10:
                            derivable = True
                            break
                    if derivable:
                        break
                assert derivable, (
                    f"Report {fname} contains ratio '{ratio_match.group(0)}' in prose '{l}' "
                    f"that is not derivable from table values."
                )

            for range_match in re.finditer(
                r"(?:between\s+)?(\d+(?:\.\d+)?%?)\s+(?:to|and)\s+(\d+(?:\.\d+)?%?)",
                stripped,
                re.IGNORECASE,
            ):
                s1, s2 = range_match.group(1), range_match.group(2)
                v1_str, v2_str = s1.rstrip("%"), s2.rstrip("%")
                try:
                    v1, v2 = float(v1_str), float(v2_str)
                except ValueError:
                    continue

                if v1 >= 1900 and v2 >= 1900 and "." not in s1 and "." not in s2:
                    continue
                if "." not in s1 and "." not in s2 and "%" not in s1 and "%" not in s2:
                    if v1 < 10 and v2 < 10:
                        continue

                v1_in = any(abs(v1 - t) < 1e-3 or abs(v1 - t * 100) < 1e-3 for t in table_numbers)
                v2_in = any(abs(v2 - t) < 1e-3 or abs(v2 - t * 100) < 1e-3 for t in table_numbers)
                assert v1_in and v2_in, (
                    f"Report {fname} contains range '{range_match.group(0)}' in prose '{l}' "
                    f"that is not derivable from table values."
                )

