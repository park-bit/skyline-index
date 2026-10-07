from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
OUTPUTS = ROOT / "data" / "outputs"

FIRST_YEAR = 2000
LAST_YEAR = 2025
OPENFLIGHTS_YEAR = 2014
