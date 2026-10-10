import json

from src.config import OUTPUTS
from src.network import load_route_snapshot


def test_opportunities_schema():
    opp_path = OUTPUTS / "opportunities.json"
    assert opp_path.exists()
    with open(opp_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "disclaimer" in data
    assert "validation_auc" in data
    assert "airline_opportunities" in data
    assert "investor_opportunities" in data
    assert "tourism_opportunities" in data

    airlines = data["airline_opportunities"]
    assert len(airlines) > 0
    for r in airlines[:20]:
        for k in [
            "rank", "origin_iata", "dest_iata", "origin_name", "dest_name",
            "origin_city", "dest_city", "origin_country", "dest_country",
            "origin_lat", "origin_lon", "dest_lat", "dest_lon", "distance_km",
            "score", "reason",
        ]:
            assert k in r

    investors = data["investor_opportunities"]
    assert len(investors) > 0
    for inv in investors[:20]:
        for k in [
            "rank", "iata", "name", "city", "country", "latitude", "longitude",
            "importance_present", "forecast_change_h5", "forecast_level_h5",
            "forecast_level_h10", "class", "top_driver",
        ]:
            assert k in inv

    tourism = data["tourism_opportunities"]
    assert len(tourism) > 0
    for t in tourism[:20]:
        for k in [
            "rank", "iata", "name", "city", "country", "latitude", "longitude",
            "importance_present", "forecast_change_h5", "forecast_level_h5",
            "international_share", "top_driver",
        ]:
            assert k in t


def test_auc_on_held_out_routes_above_threshold():
    opp_path = OUTPUTS / "opportunities.json"
    with open(opp_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    aucs = data["validation_auc"]
    for model_name, score in aucs.items():
        assert score >= 0.55, f"{model_name} AUC {score} is below threshold 0.55"
    assert aucs["combined"] >= 0.70
    assert aucs["adamic_adar"] >= 0.70


def test_no_candidate_pair_already_in_network():
    routes = load_route_snapshot()
    existing_edges = set()
    for _, r in routes.iterrows():
        u, v = r["source"], r["dest"]
        existing_edges.add((u, v))
        existing_edges.add((v, u))

    opp_path = OUTPUTS / "opportunities.json"
    with open(opp_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for cand in data["airline_opportunities"]:
        u, v = cand["origin_iata"], cand["dest_iata"]
        assert (u, v) not in existing_edges
        assert (v, u) not in existing_edges


def test_no_self_pairs():
    opp_path = OUTPUTS / "opportunities.json"
    with open(opp_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for cand in data["airline_opportunities"]:
        assert cand["origin_iata"] != cand["dest_iata"]


def test_file_size_limit():
    opp_path = OUTPUTS / "opportunities.json"
    size_mb = opp_path.stat().st_size / (1024 * 1024)
    assert size_mb <= 2.0, f"opportunities.json size {size_mb} MB exceeds 2.0 MB limit"


def test_radar_validation_no_edge_leakage_and_matched_negatives():
    import pandas as pd
    from src.config import PROCESSED
    from src.radar import build_route_graph, validate_link_prediction

    airports = pd.read_parquet(PROCESSED / "model_table.parquet")
    p25 = airports[airports["year"] == 2025].copy()
    g = build_route_graph(p25)

    res = validate_link_prediction(g, p25, seed=42)

    for k in ["gravity_auc", "preferential_attachment_auc", "adamic_adar_auc", "combined_auc"]:
        assert k in res
        assert res[k] >= 0.55, f"{k} fell below 0.55 threshold"

    assert res["adamic_adar_auc"] >= 0.70
    assert res["combined_auc"] >= 0.70
    assert "precision_at_100" in res and res["precision_at_100"] >= 0.50
    assert "precision_at_500" in res and res["precision_at_500"] >= 0.50

    assert res["max_dist_diff"] <= 0.15, f"Distance band difference {res['max_dist_diff']} exceeds 0.15 tolerance"
    assert res["max_size_diff"] <= 0.15, f"Size band difference {res['max_size_diff']} exceeds 0.15 tolerance"

