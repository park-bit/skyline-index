import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure telemetry is disabled
os.environ["NEEDLE_TELEMETRY"] = "0"
os.environ["DO_NOT_TRACK"] = "1"

try:
    import needle
    HAVE_NEEDLE = True
except ImportError:
    needle = None
    HAVE_NEEDLE = False

app = FastAPI(title="Skyline Smart Mode API", version="1.0.0")

# Restrict CORS to allowed origins
allowed_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:8000,https://skyline-index.vercel.app")
origins = [o.strip() for o in allowed_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ParseRequest(BaseModel):
    text: str = Field(..., max_length=200)


class ToolCall(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class ParseResponse(BaseModel):
    calls: list[ToolCall] = Field(default_factory=list)
    confidence: float = 0.0


# Tool definitions for Needle
if HAVE_NEEDLE:
    @needle.tool
    def select_airport(query: str) -> dict:
        """Select or zoom to an airport by name, city, or IATA code."""
        return {"action": "select_airport", "query": query}

    @needle.tool
    def compare_airports(a: str, b: str) -> dict:
        """Compare two airports by IATA codes or city names."""
        return {"action": "compare_airports", "a": a, "b": b}

    @needle.tool
    def top_airports(kind: str, horizon: int = 0, n: int = 10) -> dict:
        """List top airports by growth class (emerging, hub, declining, stable) and horizon (0, 5, 10)."""
        return {"action": "top_airports", "kind": kind, "horizon": horizon, "n": n}

    @needle.tool
    def switch_horizon(horizon: int) -> dict:
        """Switch forecast view horizon to present (0), plus 5 years (5), or plus 10 years (10)."""
        return {"action": "switch_horizon", "horizon": horizon}

    @needle.tool
    def radar(airport: str) -> dict:
        """Show multi-metric radar profile for an airport."""
        return {"action": "radar", "airport": airport}

    @needle.tool
    def reset() -> dict:
        """Reset filters and clear map selection."""
        return {"action": "reset"}

    @needle.tool
    def help() -> dict:
        """Show help and available voice commands."""
        return {"action": "help"}

    NEEDLE_TOOLS = [
        select_airport,
        compare_airports,
        top_airports,
        switch_horizon,
        radar,
        reset,
        help,
    ]
else:
    NEEDLE_TOOLS = []


def find_weights() -> Path | None:
    candidates = [
        Path("needle3.cact"),
        Path(__file__).parent / "needle3.cact",
        Path(__file__).resolve().parents[1] / "needle3.cact",
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            return p
    return None


model_instance = None
if HAVE_NEEDLE:
    weights_path = find_weights()
    if weights_path:
        try:
            model_instance = needle.Needle(weights=str(weights_path), tools=NEEDLE_TOOLS, stateless=True)
        except (RuntimeError, ValueError, OSError, AttributeError):
            model_instance = None


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_loaded": model_instance is not None}


@app.post("/parse", response_model=ParseResponse)
def parse_query(req: ParseRequest) -> ParseResponse:
    query = req.text.strip()
    if not query:
        return ParseResponse(calls=[], confidence=0.0)

    if len(query) > 200:
        raise HTTPException(status_code=400, detail="Text length exceeds 200 characters")

    if model_instance is None:
        return ParseResponse(calls=[], confidence=0.0)

    try:
        res = model_instance.run(query=query)
    except (RuntimeError, ValueError, OSError, AttributeError):
        return ParseResponse(calls=[], confidence=0.0)

    confidence = float(res.get("confidence", 0.0))
    raw_calls = res.get("function_calls", [])

    if confidence < 0.5 or not raw_calls:
        return ParseResponse(calls=[], confidence=confidence)

    parsed_calls: list[ToolCall] = []
    for call in raw_calls:
        name = call.get("name")
        args = call.get("arguments", {})
        if name:
            parsed_calls.append(ToolCall(name=name, args=args))

    return ParseResponse(calls=parsed_calls, confidence=confidence)
