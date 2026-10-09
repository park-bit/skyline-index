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
    # We require a margin of at least 0.20 above 0.5 (threshold: AUC >= 0.70)
    for model_name, score in aucs.items():
        assert score >= 0.70, f"{model_name} AUC {score} is below stated margin threshold 0.70"


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
