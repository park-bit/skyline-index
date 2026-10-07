import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.config import PROCESSED
from src.panel import build_panel


def print_coverage_summary(panel):
    print("coverage summary")
    print(f"total rows: {len(panel)}")
    print(f"unique airports: {panel['iata'].nunique()}")
    print(f"year range: {panel['year'].min()} to {panel['year'].max()}")
    print(f"countries covered: {panel['country_code'].nunique()}")

    print("\nairports per year:")
    by_year = panel.groupby("year")["iata"].nunique()
    for yr, count in by_year.items():
        faa_valid = panel[panel["year"] == yr]["faa_enplanements"].notna().sum()
        euro_valid = panel[panel["year"] == yr]["eurostat_passengers"].notna().sum()
        os_valid = panel[panel["year"] == yr]["opensky_flights"].notna().sum()
        print(f"{yr}: {count} total airports (faa: {faa_valid}, eurostat: {euro_valid}, opensky: {os_valid})")

    print("\nshare missing per column:")
    missing = panel.isna().mean().sort_values(ascending=False)
    for col, share in missing.items():
        print(f"{col:26s}: {share * 100:5.1f}% missing")


def main():
    print("building panel...")
    panel = build_panel()
    PROCESSED.mkdir(parents=True, exist_ok=True)
    out_path = PROCESSED / "airport_year_panel.parquet"
    panel.to_parquet(out_path, index=False)
    print(f"saved {out_path} ({out_path.stat().st_size // 1024} KB)")
    print_coverage_summary(panel)


if __name__ == "__main__":
    main()
