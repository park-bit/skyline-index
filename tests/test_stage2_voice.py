import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

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


def test_voice_picker_and_kokoro_options(web_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1366, "height": 768})
        page.goto(f"http://127.0.0.1:{web_server}/web/index.html", wait_until="networkidle")

        voice_options = page.evaluate("""() => {
            const select = document.getElementById("assistant-voice-select");
            if (!select) return [];
            return Array.from(select.options).map(o => ({ value: o.value, text: o.text, selected: o.selected }));
        }""")

        values = [opt["value"] for opt in voice_options]
        assert "elevenlabs_laura" in values, f"Expected elevenlabs_laura in options: {values}"
        assert "bf_emma" in values, f"Expected bf_emma in options: {values}"
        assert "bm_george" in values, f"Expected bm_george in options: {values}"
        assert "af_sarah" in values, f"Expected af_sarah in options: {values}"
        assert "device" in values, f"Expected device in options: {values}"

        default_opt = next((opt for opt in voice_options if opt["selected"]), None)
        assert default_opt is not None, "Expected an option to be selected by default"
        assert default_opt["value"] == "elevenlabs_laura", f"Expected elevenlabs_laura default, got {default_opt['value']}"

        browser.close()


def test_tts_worker_fallback_to_device(web_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1366, "height": 768})
        page.on("console", lambda msg: print("PAGE CONSOLE:", msg.text))
        page.goto(f"http://127.0.0.1:{web_server}/web/index.html", wait_until="networkidle")

        fallback_triggered = page.evaluate("""() => {
            localStorage.setItem("skyline_voice_enabled", "true");
            let deviceSpeechCalled = false;
            window.speechSynthesis.speak = () => { deviceSpeechCalled = true; };

            window.Worker = class MockWorker {
                constructor() {
                    setTimeout(() => {
                        if (this.onerror) this.onerror(new Error("Simulated worker error"));
                    }, 10);
                }
                postMessage() {}
            };

            const notice = document.getElementById("reply-voice-fallback");
            window.speakSpeech("Testing fallback");

            return new Promise((resolve) => {
                setTimeout(() => {
                    const fallbackLabel = notice ? notice.textContent : "";
                    const isVisible = notice ? notice.style.display !== "none" : false;
                    resolve({ deviceSpeechCalled, fallbackLabel, isVisible });
                }, 300);
            });
        }""")

        assert fallback_triggered["deviceSpeechCalled"] is True, "Expected device speech fallback to be called"
        assert fallback_triggered["isVisible"] is True, "Expected fallback notice to be visible"
        assert "device voice" in fallback_triggered["fallbackLabel"], f"Expected 'device voice' label: {fallback_triggered['fallbackLabel']}"

        browser.close()


def test_jarvis_visualizer_renders_and_audio_analyser(web_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1366, "height": 768})
        page.goto(f"http://127.0.0.1:{web_server}/web/index.html", wait_until="networkidle")

        vis_check = page.evaluate("""() => {
            const canvas = document.getElementById("assistant-visualizer");
            if (!canvas) return { canvasExists: false };

            window.showVisualizer();
            const width = canvas.width;
            const height = canvas.height;
            const display = canvas.style.display;

            const { audioCtx, analyserNode } = window.getAudioContext();
            const hasAnalyser = Boolean(analyserNode && analyserNode.frequencyBinCount);
            const binCount = analyserNode ? analyserNode.frequencyBinCount : 0;

            return {
                canvasExists: true,
                width,
                height,
                display,
                hasAnalyser,
                binCount,
            };
        }""")

        assert vis_check["canvasExists"] is True, "Expected assistant-visualizer canvas to exist"
        assert vis_check["width"] == 320, f"Expected 320 width, got {vis_check['width']}"
        assert vis_check["height"] == 320, f"Expected 320 height, got {vis_check['height']}"
        assert vis_check["display"] == "block", "Expected visualizer to be displayed"
        assert vis_check["hasAnalyser"] is True, "Expected AnalyserNode to be connected"

        fps_data = page.evaluate("""() => {
            return new Promise((resolve) => {
                let frames = 0;
                const start = performance.now();
                function countFrame() {
                    frames++;
                    if (performance.now() - start < 500) {
                        requestAnimationFrame(countFrame);
                    } else {
                        const elapsed = performance.now() - start;
                        const fps = (frames / elapsed) * 1000;
                        resolve({ frames, elapsed, fps });
                    }
                }
                requestAnimationFrame(countFrame);
            });
        }""")

        assert fps_data["frames"] >= 3, f"Expected smooth frames in 500ms, got {fps_data['frames']}"
        assert fps_data["fps"] > 5, f"Expected active animation without blocking, got {fps_data['fps']} FPS"

        hide_check = page.evaluate("""() => {
            window.hideVisualizer();
            const canvas = document.getElementById("assistant-visualizer");
            return canvas ? canvas.style.display : "";
        }""")
        assert hide_check == "none", "Expected visualizer to hide when inactive"

        browser.close()
