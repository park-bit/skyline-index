# Skyline Smart Mode API

FastAPI backend service running the Needle 3 tool-calling foundation model with Gemini REST API fallback for voice and natural language command parsing.

## Resolution Pipeline

1. In-browser rule parser: Runs instantly in the client for structured queries and fuzzy airport matching.
2. Needle 3 foundation model: 35 MB local on-device or containerized tool-calling model.
3. Gemini fallback: High-coverage cloud fallback via REST (default model `gemini-2.5-flash`), triggered when Needle is absent, errors, or returns confidence below 0.5.

## Running Locally

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and set your optional `GEMINI_API_KEY`:
   ```bash
   cp .env.example .env
   ```
3. Optional: Download Needle 3 weights:
   ```bash
   needle download needle3
   ```
4. Start the service:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

## Deploying to Render

This service can be deployed on the Render free tier using `render.yaml`.

1. Connect this repository on the Render dashboard.
2. Select Blueprint or Web Service with root directory set to `api`.
3. Set build command:
   ```bash
   pip install -r requirements.txt && (needle download needle3 || true)
   ```
4. Set start command:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
5. Environment variables:
   - `NEEDLE_TELEMETRY`: `0`
   - `DO_NOT_TRACK`: `1`
   - `ALLOWED_ORIGINS`: `https://skyline-index-web.vercel.app,https://skyline-index.vercel.app`
   - `GEMINI_API_KEY`: your Google AI Studio API key
   - `GEMINI_MODEL`: `gemini-2.5-flash`
   - `DAILY_LIMIT`: `500`

Free tier spin-down note: On the free tier, Render spins down web services after 15 minutes of inactivity. The initial request after idle can take 40 to 50 seconds to wake up. The frontend pings `/health` on load and displays "Smart mode warming up" while waking. Client timeout is 6 seconds for the first call after waking and 4 seconds subsequently.
