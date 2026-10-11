// Web Worker for Kokoro TTS on-device synthesis with persistent browser cache
let ttsInstance = null;
let isInitializing = false;

async function getOrInitTTS(device) {
  if (ttsInstance) return ttsInstance;
  const { KokoroTTS, env } = await import("https://cdn.jsdelivr.net/npm/kokoro-js");
  if (env) {
    env.useBrowserCache = true;
    env.allowLocalModels = false;
  }
  ttsInstance = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8",
    device: device,
  });
  return ttsInstance;
}

self.onmessage = async (e) => {
  const { type, id, text, voice } = e.data || {};

  if (type === "init") {
    if (ttsInstance) {
      self.postMessage({ type: "init-success", id });
      return;
    }
    try {
      isInitializing = true;
      const hasWebGPU = typeof navigator !== "undefined" && Boolean(navigator.gpu);
      const device = hasWebGPU ? "webgpu" : "wasm";
      await getOrInitTTS(device);
      isInitializing = false;
      self.postMessage({ type: "init-success", id, device });
    } catch (err) {
      isInitializing = false;
      self.postMessage({ type: "init-error", id, error: err.message || "Failed to load Kokoro TTS" });
    }
  } else if (type === "synthesize") {
    const startTime = performance.now();
    try {
      const hasWebGPU = typeof navigator !== "undefined" && Boolean(navigator.gpu);
      const device = hasWebGPU ? "webgpu" : "wasm";
      const model = await getOrInitTTS(device);

      const selectedVoice = voice || "bf_emma";
      const audioResult = await model.generate(text, {
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
