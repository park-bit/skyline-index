import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.targets import build_model_table

if __name__ == "__main__":
    print("building model table...")
    table = build_model_table()
    out_file = ROOT / "data" / "processed" / "model_table.parquet"
    print(f"saved {out_file} ({out_file.stat().st_size // 1024} KB)")
    print(f"total rows: {len(table)}")
    for h in [5, 10]:
        v = table[table[f"target_level_h{h}"].notna() & ~table[f"is_covid_target_h{h}"]]
        print(
            f"h={h}: {len(v)} valid non-covid rows across {v['year'].nunique()} origin years "
            f"({v['year'].min()} to {v['year'].max()})"
        )
