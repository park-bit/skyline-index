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
    port = 8766
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--directory", str(ROOT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(20):
        if is_port_in_use(port):
            break
        time.sleep(0.1)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            page.goto(f"http://127.0.0.1:{port}/web/index.html", wait_until="networkidle")
            time.sleep(2.0)
            page.evaluate("selectAirport(airportsData.find(a => a.iata === 'ATL'))")
            time.sleep(1.0)
            out_path = ROOT / "reports" / "figures" / "map_screenshot.png"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(out_path))
            print(f"Screenshot saved to {out_path}")
            browser.close()
    finally:
        server.terminate()
        server.wait()


if __name__ == "__main__":
    main()
