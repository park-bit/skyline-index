import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import pandas as pd

from src.config import OUTPUTS, PROCESSED
from src.radar import (
    build_route_graph,
    build_three_lists,
    find_candidate_routes,
    validate_link_prediction,
)


def main():
    table_path = PROCESSED / "model_table.parquet"
    df = pd.read_parquet(table_path)
    df_2025 = df[df["year"] == 2025].copy()

    forecasts_path = OUTPUTS / "forecasts.json"
    with open(forecasts_path, "r", encoding="utf-8") as f:
        forecast_dict = json.load(f)

    # Build network and validate
    g = build_route_graph(df_2025)
    print(f"Network nodes: {g.number_of_nodes()}, edges: {g.number_of_edges()}")

    val_metrics = validate_link_prediction(g, df_2025, seed=42)
    print(f"Validation AUC - Gravity: {val_metrics['gravity_auc']}, Pref: {val_metrics['preferential_attachment_auc']}, AA: {val_metrics['adamic_adar_auc']}, Combined: {val_metrics['combined_auc']}")

    # Find candidates and build lists
    candidates = find_candidate_routes(g, df_2025, forecast_dict, top_k=250)
    print(f"Top candidate routes generated: {len(candidates)}")

    radar_payload = build_three_lists(df_2025, forecast_dict, candidates)
    radar_payload["validation_auc"] = {
        "gravity": val_metrics["gravity_auc"],
        "preferential_attachment": val_metrics["preferential_attachment_auc"],
        "adamic_adar": val_metrics["adamic_adar_auc"],
        "combined": val_metrics["combined_auc"],
    }

    out_path = OUTPUTS / "opportunities.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(radar_payload, f, separators=(",", ":"))

    print(f"Exported Opportunity Radar to {out_path}")
    print(f"Airline candidates: {len(radar_payload['airline_opportunities'])}, Investor: {len(radar_payload['investor_opportunities'])}, Tourism: {len(radar_payload['tourism_opportunities'])}")


if __name__ == "__main__":
    main()
