# Skyline Smart Mode API

FastAPI backend service running the Needle 3 tool-calling foundation model for natural voice command parsing.

## Running Locally

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Download Needle 3 weights:
   ```bash
   needle download needle3
   ```
3. Start the service:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

## Deploying to Render

This service can be deployed on Render free tier.

1. Connect this repository on the Render dashboard.
2. Select Blueprint or Web Service with root directory set to `api`.
3. Set build command:
   ```bash
   pip install -r requirements.txt && needle download needle3
   ```
4. Set start command:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
5. Set environment variables:
   - `NEEDLE_TELEMETRY`: `0`
   - `DO_NOT_TRACK`: `1`
   - `ALLOWED_ORIGINS`: your frontend domains

Free tier spin-down note: On the free tier, Render spins down web services after 15 minutes of inactivity. The first request after idle can take 40 to 50 seconds to wake up. The frontend pings `/health` on load and displays "Smart mode warming up" while waking.
