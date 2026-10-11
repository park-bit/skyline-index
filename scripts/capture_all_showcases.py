import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def main():
    port = 8769
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--directory", str(ROOT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(25):
        if is_port_in_use(port):
            break
        time.sleep(0.1)

    docs_dir = ROOT / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.goto(f"http://127.0.0.1:{port}/web/index.html", wait_until="networkidle")
            time.sleep(2.0)

            # 1. Map Showcase with Airport Dossier
            page.evaluate("selectAirport(airportsData.find(a => a.iata === 'ATL'))")
            time.sleep(1.0)
            map_path = docs_dir / "map.png"
            page.screenshot(path=str(map_path))
            print(f"Map screenshot saved to {map_path}")

            # 2. Opportunity Radar Showcase
            page.evaluate("window.switchTab('radar')")
            time.sleep(1.0)
            radar_path = docs_dir / "radar.png"
            page.screenshot(path=str(radar_path))
            print(f"Radar screenshot saved to {radar_path}")

            # 3. Intelligence Hub Showcase
            page.evaluate("window.switchTab('intel')")
            time.sleep(1.0)
            intel_path = docs_dir / "intelligence.png"
            page.screenshot(path=str(intel_path))
            print(f"Intelligence screenshot saved to {intel_path}")

            # 4. Scenario Lab Showcase
            page.evaluate("window.switchTab('scenario')")
            time.sleep(1.0)
            scenario_path = docs_dir / "scenario_lab.png"
            page.screenshot(path=str(scenario_path))
            print(f"Scenario Lab screenshot saved to {scenario_path}")

            # 5. Skyline Copilot Showcase
            page.evaluate("window.switchTab('map')")
            time.sleep(0.5)
            page.evaluate("window.executeAssistantCommand('which Indian airports grow most by 2035')")
            time.sleep(1.5)
            copilot_path = docs_dir / "copilot.png"
            page.screenshot(path=str(copilot_path))
            print(f"Copilot screenshot saved to {copilot_path}")

            browser.close()
    finally:
        server.terminate()
        server.wait()


if __name__ == "__main__":
    main()
