// Web Worker for Kokoro TTS on-device synthesis
let ttsInstance = null;
let isInitializing = false;

self.onmessage = async (e) => {
  const { type, id, text, voice } = e.data || {};

  if (type === "init") {
    if (ttsInstance) {
      self.postMessage({ type: "init-success", id });
      return;
    }
    try {
      isInitializing = true;
      const { KokoroTTS } = await import("https://cdn.jsdelivr.net/npm/kokoro-js");
      const hasWebGPU = typeof navigator !== "undefined" && Boolean(navigator.gpu);
      const device = hasWebGPU ? "webgpu" : "wasm";

      ttsInstance = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8",
        device: device,
      });
      isInitializing = false;
      self.postMessage({ type: "init-success", id, device });
    } catch (err) {
      isInitializing = false;
      self.postMessage({ type: "init-error", id, error: err.message || "Failed to load Kokoro TTS" });
    }
  } else if (type === "synthesize") {
    const startTime = performance.now();
    try {
      if (!ttsInstance) {
        isInitializing = true;
        const { KokoroTTS } = await import("https://cdn.jsdelivr.net/npm/kokoro-js");
        const hasWebGPU = typeof navigator !== "undefined" && Boolean(navigator.gpu);
        const device = hasWebGPU ? "webgpu" : "wasm";

        ttsInstance = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
          dtype: "q8",
          device: device,
        });
        isInitializing = false;
      }

      const selectedVoice = voice || "bf_emma";
      const audioResult = await ttsInstance.generate(text, {
        voice: selectedVoice,
      });

      const latencyMs = performance.now() - startTime;
      const pcmData = audioResult.audio;
      const sampleRate = audioResult.sampling_rate || 24000;

      self.postMessage({
        type: "synthesize-success",
        id,
        pcmData,
        sampleRate,
        latencyMs,
      });
    } catch (err) {
      const latencyMs = performance.now() - startTime;
      self.postMessage({
        type: "synthesize-error",
        id,
        error: err.message || "Synthesis failed",
        latencyMs,
      });
    }
  }
};
