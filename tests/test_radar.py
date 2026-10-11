import json

from src.config import OUTPUTS, ROOT
from src.network import load_route_snapshot


def test_opportunities_schema():
    opp_path = OUTPUTS / "opportunities.json"
    assert opp_path.exists(), f"opportunities.json missing at {opp_path}"
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
            assert k in r, f"missing key {k} in airline candidate"

    investors = data["investor_opportunities"]
    assert len(investors) > 0
    for inv in investors[:20]:
        for k in [
            "rank", "iata", "name", "city", "country", "latitude", "longitude",
            "importance_present", "forecast_change_h5", "forecast_level_h5",
            "forecast_level_h10", "class", "top_driver",
        ]:
            assert k in inv, f"missing key {k} in investor candidate"

    tourism = data["tourism_opportunities"]
    assert len(tourism) > 0
    for t in tourism[:20]:
        for k in [
            "rank", "iata", "name", "city", "country", "latitude", "longitude",
            "importance_present", "forecast_change_h5", "forecast_level_h5",
            "international_share", "top_driver",
        ]:
            assert k in t, f"missing key {k} in tourism candidate"


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
        assert (u, v) not in existing_edges, f"Candidate ({u}, {v}) already in route network"
        assert (v, u) not in existing_edges, f"Candidate ({v}, {u}) already in route network"


def test_no_self_pairs():
    opp_path = OUTPUTS / "opportunities.json"
    with open(opp_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for cand in data["airline_opportunities"]:
        assert cand["origin_iata"] != cand["dest_iata"], (
            f"Self-pair candidate found: {cand['origin_iata']}"
        )


def test_file_size_limit():
    opp_path = OUTPUTS / "opportunities.json"
    size_mb = opp_path.stat().st_size / (1024 * 1024)
    assert size_mb <= 2.0, f"opportunities.json size {size_mb} MB exceeds 2.0 MB limit"


def test_opportunities_web_sync():
    web_opp_path = ROOT / "web" / "opportunities.json"
    out_opp_path = OUTPUTS / "opportunities.json"
    assert web_opp_path.exists(), "web/opportunities.json missing"
    assert out_opp_path.exists(), "data/outputs/opportunities.json missing"
    assert web_opp_path.read_text(encoding="utf-8") == out_opp_path.read_text(encoding="utf-8"), (
        "web/opportunities.json does not match data/outputs/opportunities.json"
    )


def test_negatives_matched_on_distance_bands_in_network_report():
    report_path = ROOT / "reports" / "reconstruction_network.md"
    assert report_path.exists(), "reconstruction_network.md missing"
    content = report_path.read_text(encoding="utf-8")
    assert "Negative pairs were sampled to match the distance band" in content
    assert "fifteen percent tolerance" in content or "15%" in content
    assert "Combined Model ROC AUC" in content


def test_readme_auc_and_precision_metrics_backed_by_reports_or_outputs():
    import re

    readme_text = (ROOT / "README.md").read_text(encoding="utf-8")
    corpus = []
    for p in (ROOT / "reports").glob("*.md"):
        corpus.append(p.read_text(encoding="utf-8"))
    for p in (ROOT / "data" / "outputs").glob("*.json"):
        corpus.append(p.read_text(encoding="utf-8"))
    if (ROOT / "training_notebook.ipynb").exists():
        corpus.append((ROOT / "training_notebook.ipynb").read_text(encoding="utf-8"))

    combined_corpus = "\n".join(corpus)

    auc_values = set(re.findall(r"(?:ROC\s+)?AUC(?:\s+(?:of|is|equals|=|:))?\s+([0-9]+\.[0-9]+)", readme_text, re.IGNORECASE))
    prec_values = set(re.findall(r"(?:precision|Precision)(?:\s+at\s+\d+)?(?:\s+(?:of|is|equals|=|:))?\s+([0-9]+\.[0-9]+)", readme_text))

    assert len(auc_values) > 0, "No AUC metrics found in README"
    assert len(prec_values) > 0, "No precision metrics found in README"

    for val in auc_values:
        assert val in combined_corpus, f"README AUC value {val} not found in any report, output file, or notebook"

    for val in prec_values:
        assert val in combined_corpus, f"README precision value {val} not found in any report, output file, or notebook"

