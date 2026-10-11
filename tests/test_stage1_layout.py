import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

ELEMENT_SELECTORS = {
    "brand_pill": "#pill-brand",
    "tabs_pill": "#pill-tabs",
    "actions_pill": "#pill-actions",
    "filters_panel": "#left-panel",
    "airport_card": "#airport-card",
    "command_bar": "#assistant-bar",
    "reply_panel": "#assistant-reply-panel",
    "stat_strip": "#map-statistics",
    "zoom_controls": ".leaflet-control-zoom",
}

CHECK_INTERSECTIONS_JS = """
() => {
  const elements = {
    brand_pill: "#pill-brand",
    tabs_pill: "#pill-tabs",
    actions_pill: "#pill-actions",
    filters_panel: "#left-panel",
    airport_card: "#airport-card",
    command_bar: "#assistant-bar",
    reply_panel: "#assistant-reply-panel",
    stat_strip: "#map-statistics",
    zoom_controls: ".leaflet-control-zoom",
  };

  const visibleBoxes = [];
  for (const [name, selector] of Object.entries(elements)) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      visibleBoxes.push({
        name,
        rect: {
          left: Math.round(rect.left * 10) / 10,
          top: Math.round(rect.top * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          bottom: Math.round(rect.bottom * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        }
      });
    }
  }

  const intersections = [];
  for (let i = 0; i < visibleBoxes.length; i++) {
    for (let j = i + 1; j < visibleBoxes.length; j++) {
      const a = visibleBoxes[i];
      const b = visibleBoxes[j];
      const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (overlapX > 0.5 && overlapY > 0.5) {
        intersections.push({
          a: a.name,
          b: b.name,
          overlapX: Math.round(overlapX * 10) / 10,
          overlapY: Math.round(overlapY * 10) / 10,
          rectA: a.rect,
          rectB: b.rect,
        });
      }
    }
  }
  return { visibleBoxes, intersections };
}
"""


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


VIEWPORTS = [
    (1366, 768),
    (1440, 900),
    (1920, 1080),
    (390, 844),
]


@pytest.mark.parametrize("width,height", VIEWPORTS)
def test_stage1_layout_zero_overlap(web_server, width, height):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": width, "height": height})
        page.goto(f"http://127.0.0.1:{web_server}/web/index.html", wait_until="networkidle")
        time.sleep(1.0)

        # State (a): Default view
        res_a = page.evaluate(CHECK_INTERSECTIONS_JS)
        assert res_a["intersections"] == [], (
            f"State (a) Default had intersections at {width}x{height}: {res_a['intersections']}"
        )

        # State (b): Airport card open
        page.evaluate("selectAirport(airportsData.find(a => a.iata === 'ATL') || airportsData[0])")
        time.sleep(0.4)
        res_b = page.evaluate(CHECK_INTERSECTIONS_JS)
        assert res_b["intersections"] == [], (
            f"State (b) Card open had intersections at {width}x{height}: {res_b['intersections']}"
        )

        # Reset card
        page.evaluate("const c = document.getElementById('airport-card'); if (c) c.style.display = 'none'; switchTab('map');")
        time.sleep(0.2)

        # State (c): Reply panel open
        page.evaluate("executeAssistantCommand('show ATL')")
        time.sleep(0.4)
        res_c = page.evaluate(CHECK_INTERSECTIONS_JS)
        assert res_c["intersections"] == [], (
            f"State (c) Reply panel open had intersections at {width}x{height}: {res_c['intersections']}"
        )

        # Reset reply panel
        page.evaluate("closeReplyPanel(); switchTab('map');")
        time.sleep(0.2)

        # State (d): Radar tab open
        page.evaluate("switchTab('radar')")
        time.sleep(0.4)
        res_d = page.evaluate(CHECK_INTERSECTIONS_JS)
        assert res_d["intersections"] == [], (
            f"State (d) Radar tab had intersections at {width}x{height}: {res_d['intersections']}"
        )

        page.close()
        browser.close()
