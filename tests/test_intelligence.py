"""Schema and integrity checks for web/intelligence.json, the post-processed forecasts.json
fields added by scripts/04_build_intelligence.py, and the offline world GeoJSON."""
import json
import math
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
INTEL_PATH = ROOT / "web" / "intelligence.json"
FC_PATH = ROOT / "web" / "forecasts.json"
GEO_PATH = ROOT / "web" / "vendor" / "world-110m.geojson"

pytestmark = pytest.mark.skipif(not INTEL_PATH.exists(), reason="run scripts/04_build_intelligence.py first")


@pytest.fixture(scope="module")
def intel():
    return json.loads(INTEL_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def forecasts():
    return json.loads(FC_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def airports(forecasts):
    return forecasts["airports"]


def _is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


# ---------------------------------------------------------------- top level
def test_top_level_keys(intel):
    expected = {"generated_at", "as_of_year", "country_names", "continent_names", "airport_continent", "countries",
                "regions", "rankings", "ranks", "network_stats", "resilience", "scenario", "horizon10_shrinkage"}
    assert set(intel) == expected
    assert intel["as_of_year"] == 2025
    assert len(intel["generated_at"]) == 10


def test_copies_identical(intel):
    other = json.loads((ROOT / "data" / "outputs" / "intelligence.json").read_text(encoding="utf-8"))
    assert other == intel


def test_country_and_continent_names(intel, airports):
    codes = {a["country"] for a in airports}
    assert codes <= set(intel["country_names"])
    assert all(isinstance(v, str) and v for v in intel["country_names"].values())
    assert intel["continent_names"] == {"AS": "Asia", "EU": "Europe", "NA": "North America", "SA": "South America",
                                        "AF": "Africa", "OC": "Oceania", "AN": "Antarctica"}
    assert set(intel["airport_continent"]) == {a["iata"] for a in airports}
    assert set(intel["airport_continent"].values()) <= set(intel["continent_names"])


# ---------------------------------------------------------------- countries / regions
GROUP_KEYS = {"n_airports", "mean_importance_present", "mean_level_h5", "mean_level_h10", "traffic_weighted_change_h5",
              "traffic_weighted_change_h10", "n_emerging_h5", "n_declining_h5", "n_hub", "n_stable_h5", "n_emerging_h10",
              "n_declining_h10", "top_airports", "top_riser", "top_faller", "momentum_rank_h10", "macro"}
MACRO_KEYS = {"gdp_growth_pct", "gdp_per_capita_usd", "population", "tourism_arrivals", "median_age"}


def _check_group(rec, n_total_airports):
    assert GROUP_KEYS <= set(rec)
    assert 1 <= rec["n_airports"] <= n_total_airports
    for k in ("mean_importance_present", "mean_level_h5", "mean_level_h10"):
        assert 0 <= rec[k] <= 100
    assert rec["n_emerging_h5"] + rec["n_declining_h5"] + rec["n_hub"] + rec["n_stable_h5"] == rec["n_airports"]
    assert 1 <= len(rec["top_airports"]) <= 5
    assert set(rec["top_riser"]) == {"iata", "change_h10"} and set(rec["top_faller"]) == {"iata", "change_h10"}
    assert rec["top_riser"]["change_h10"] >= rec["top_faller"]["change_h10"]
    assert set(rec["macro"]) == MACRO_KEYS
    assert all(v is None or _is_num(v) for v in rec["macro"].values())


def test_countries(intel, airports):
    cs = intel["countries"]
    assert {c["iso2"] for c in cs} == {a["country"] for a in airports}
    assert sum(c["n_airports"] for c in cs) == len(airports)
    for c in cs:
        assert {"iso2", "name", "continent"} <= set(c)
        assert c["name"] == intel["country_names"][c["iso2"]]
        _check_group(c, len(airports))
    ranked = sorted([c for c in cs if c["momentum_rank_h10"] is not None], key=lambda c: c["momentum_rank_h10"])
    assert [c["momentum_rank_h10"] for c in ranked] == list(range(1, len(ranked) + 1))
    assert all(c["n_airports"] >= 3 for c in ranked)
    assert all(c["momentum_rank_h10"] is None for c in cs if c["n_airports"] < 3)
    tw = [c["traffic_weighted_change_h10"] for c in ranked]
    assert tw == sorted(tw, reverse=True)
    assert any(c["macro"]["gdp_growth_pct"] is not None for c in cs)


def test_regions(intel, airports):
    rs = intel["regions"]
    assert {r["code"] for r in rs} == set(intel["airport_continent"].values())
    assert sum(r["n_airports"] for r in rs) == len(airports)
    for r in rs:
        assert r["name"] == intel["continent_names"][r["code"]]
        _check_group(r, len(airports))
    ranks = sorted(r["momentum_rank_h10"] for r in rs if r["momentum_rank_h10"] is not None)
    assert ranks == list(range(1, len(ranks) + 1))


# ---------------------------------------------------------------- rankings / ranks
def test_rankings(intel, airports):
    rk = intel["rankings"]
    iatas = {a["iata"] for a in airports}
    expected = {"top_risers_h5", "top_risers_h10", "top_fallers_h5", "top_fallers_h10", "top_hubs_present", "top_hubs_h10",
                "biggest_rank_climbers_h10", "biggest_rank_drops_h10"}
    assert set(rk) == expected
    for k, lst in rk.items():
        assert len(lst) == 50, k
        assert len({x["iata"] for x in lst}) == 50
        assert all(x["iata"] in iatas for x in lst)
        assert all({"iata", "name", "country"} <= set(x) for x in lst)
    for k in ("top_risers_h5", "top_risers_h10"):
        ch = [x["change"] for x in rk[k]]
        assert ch == sorted(ch, reverse=True) and ch[0] > 0
    for k in ("top_fallers_h5", "top_fallers_h10"):
        ch = [x["change"] for x in rk[k]]
        assert ch == sorted(ch) and ch[0] < 0
    for k in ("top_hubs_present", "top_hubs_h10"):
        sc = [x["score"] for x in rk[k]]
        assert sc == sorted(sc, reverse=True) and 0 <= sc[-1] <= sc[0] <= 100
    for x in rk["biggest_rank_climbers_h10"] + rk["biggest_rank_drops_h10"]:
        assert x["rank_delta"] == x["rank_present"] - x["rank_h10"]
    assert rk["biggest_rank_climbers_h10"][0]["rank_delta"] >= 0 >= rk["biggest_rank_drops_h10"][0]["rank_delta"]
    assert rk["top_hubs_present"][0]["score"] == max(a["importance_present"] for a in airports)


def test_ranks_are_permutations(intel, airports):
    ranks = intel["ranks"]
    n = len(airports)
    assert set(ranks) == {a["iata"] for a in airports}
    for h in ("present", "h5", "h10"):
        vals = sorted(v[h] for v in ranks.values())
        assert vals == list(range(1, n + 1)), h
    lookup = {a["iata"]: a for a in airports}
    # rank 1 is the highest level at each horizon
    best = min(ranks, key=lambda i: ranks[i]["present"])
    assert lookup[best]["importance_present"] == max(a["importance_present"] for a in airports)
    best10 = min(ranks, key=lambda i: ranks[i]["h10"])
    assert lookup[best10]["forecast_h10"]["level_damped"] == max(a["forecast_h10"]["level_damped"] for a in airports)
    # monotone: higher level never has a worse rank
    by_rank = sorted(airports, key=lambda a: ranks[a["iata"]]["h5"])
    lv = [a["forecast_h5"]["level"] for a in by_rank]
    assert lv == sorted(lv, reverse=True)


# ---------------------------------------------------------------- network / resilience
NET_KEYS = {"n_nodes", "n_edges", "avg_degree", "density", "n_components", "giant_component_share", "avg_clustering",
            "top_betweenness"}


def test_network_stats(intel):
    ns = intel["network_stats"]
    assert set(ns) == {"present", "h5", "h10"}
    for h, b in ns.items():
        assert set(b) == NET_KEYS, h
        assert b["n_nodes"] > 1000 and b["n_edges"] > b["n_nodes"]
        assert b["avg_degree"] > 0 and 0 < b["density"] < 1 and 0 <= b["avg_clustering"] <= 1
        assert b["n_components"] >= 1 and 0 < b["giant_component_share"] <= 1
        assert len(b["top_betweenness"]) == 15
        vals = [x["value"] for x in b["top_betweenness"]]
        assert vals == sorted(vals, reverse=True) and all(0 <= v <= 1 for v in vals)
    assert ns["present"]["n_edges"] == ns["h5"]["n_edges"] == ns["h10"]["n_edges"]


def test_resilience(intel, airports):
    res = intel["resilience"]
    assert set(res) == {"method", "airports", "critical_hubs", "fragile_spokes"}
    assert "removal_reach_loss_pct" in res["method"] and "dependency_hhi" in res["method"]
    with_routes = {a["iata"] for a in airports if a["routes"]}
    seen = {a["iata"] for a in res["airports"]}
    assert with_routes <= seen
    assert len(seen) == len(res["airports"])
    assert len(seen) == intel["network_stats"]["present"]["n_nodes"]
    classes = set()
    for a in res["airports"]:
        assert set(a) == {"iata", "removal_reach_loss_pct", "removal_disconnected_airports", "is_articulation_point",
                          "dependency_hhi", "top_dependencies", "redundancy_score", "vulnerability_class"}
        assert 0 <= a["removal_reach_loss_pct"] <= 100
        assert a["removal_disconnected_airports"] >= 0
        assert isinstance(a["is_articulation_point"], bool)
        assert 0 < a["dependency_hhi"] <= 1
        assert 1 <= len(a["top_dependencies"]) <= 3
        assert all(0 < d["share"] <= 1 for d in a["top_dependencies"])
        if len(a["top_dependencies"]) < 3:  # fewer than 3 partners -> shares must sum to 1
            assert abs(sum(d["share"] for d in a["top_dependencies"]) - 1) < 1e-3
        assert 0 <= a["redundancy_score"] <= 100
        assert a["vulnerability_class"] in {"fragile", "watch", "robust"}
        classes.add(a["vulnerability_class"])
        if not a["is_articulation_point"]:
            assert a["removal_disconnected_airports"] == 0
    assert classes == {"fragile", "watch", "robust"}
    assert len(res["critical_hubs"]) == 25 and len(set(res["critical_hubs"])) == 25
    assert len(res["fragile_spokes"]) == 50 and len(set(res["fragile_spokes"])) == 50
    lookup = {a["iata"]: a for a in res["airports"]}
    loss = [lookup[i]["removal_reach_loss_pct"] for i in res["critical_hubs"]]
    assert loss == sorted(loss, reverse=True) and loss[0] > 0
    assert all(lookup[i]["is_articulation_point"] for i in res["critical_hubs"][:5])
    hhi = [lookup[i]["dependency_hhi"] for i in res["fragile_spokes"]]
    assert hhi == sorted(hhi, reverse=True) and hhi[0] == 1.0
    assert all(lookup[i]["vulnerability_class"] == "fragile" for i in res["fragile_spokes"][:10])


# ---------------------------------------------------------------- scenario
def test_scenario(intel):
    sc = intel["scenario"]
    assert set(sc) == {"method", "sensitivities_h5", "sensitivities_h10", "units", "country_shock_examples"}
    required = {"gdp_growth_1y", "tourism_growth_1y", "pop_growth_1y", "traffic_growth_1y", "of_routes_total",
                "of_top50_hub_links"}
    for key in ("sensitivities_h5", "sensitivities_h10"):
        s = sc[key]
        assert required <= set(s)
        assert set(s) == set(sc["units"])
        assert all(_is_num(v) for v in s.values())
        assert all(abs(v) < 100 for v in s.values())
    assert all(isinstance(u, str) and u for u in sc["units"].values())
    assert len(sc["country_shock_examples"]) == 5
    for ex in sc["country_shock_examples"]:
        assert set(ex) == {"country", "shock", "mean_delta_h5"}
        assert ex["country"] in intel["country_names"] and _is_num(ex["mean_delta_h5"])
        assert ex["shock"] == "gdp_growth +2pp"
    assert "Ridge" in sc["method"]


# ---------------------------------------------------------------- shrinkage
def test_horizon10_shrinkage(intel):
    hs = intel["horizon10_shrinkage"]
    assert set(hs) == {"alpha_grid", "mae_by_alpha", "best_alpha", "persistence_mae", "best_mae", "note"}
    grid = hs["alpha_grid"]
    assert grid[0] == 0.0 and grid[-1] == 1.0 and grid == sorted(grid)
    assert {1.0, 0.5, 0.1}.issubset(set(grid))
    assert set(hs["mae_by_alpha"]) == {str(a) for a in grid}
    assert hs["best_alpha"] in grid
    assert hs["persistence_mae"] == hs["mae_by_alpha"]["0.0"]
    assert hs["best_mae"] == hs["mae_by_alpha"][str(hs["best_alpha"])]
    assert hs["best_mae"] <= hs["persistence_mae"] * 1.02 + 1e-9
    assert isinstance(hs["note"], str) and len(hs["note"]) > 20
    on_disk = json.loads((ROOT / "data" / "outputs" / "horizon10_shrinkage.json").read_text(encoding="utf-8"))
    assert on_disk["best_alpha"] == hs["best_alpha"]
    assert (ROOT / "reports" / "horizon10_shrinkage.md").exists()


# ---------------------------------------------------------------- forecasts.json post-processing
def test_forecasts_new_fields(intel, airports):
    alpha = intel["horizon10_shrinkage"]["best_alpha"]
    n = len(airports)
    for a in airports:
        for k in ("rank_present", "rank_h5", "rank_h10"):
            assert isinstance(a[k], int) and 1 <= a[k] <= n
        assert a["continent"] == intel["airport_continent"][a["iata"]]
        h10 = a["forecast_h10"]
        assert {"change_damped", "level_damped"} <= set(h10)
        assert abs(h10["change_damped"] - round(alpha * h10["change"], 2)) <= 0.011
        assert abs(h10["level_damped"] - min(100.0, max(0.0, a["importance_present"] + h10["change_damped"]))) <= 0.011
        assert 0 <= h10["level_damped"] <= 100
        assert a["rank_present"] == intel["ranks"][a["iata"]]["present"]
        assert a["rank_h10"] == intel["ranks"][a["iata"]]["h10"]
        # original fields untouched
        assert {"target_year", "change", "level", "band_low", "band_high", "band_label", "class", "positive_drivers",
                "negative_drivers"} <= set(h10)
    assert sorted(a["rank_present"] for a in airports) == list(range(1, n + 1))


def test_forecasts_copies_and_size(forecasts):
    other = json.loads((ROOT / "data" / "outputs" / "forecasts.json").read_text(encoding="utf-8"))
    assert other == forecasts
    assert FC_PATH.stat().st_size <= 6.5 * 1024 * 1024
    assert forecasts["horizon10_evaluation"]["persistence_mae"] == 5.282


# ---------------------------------------------------------------- geojson
def test_world_geojson():
    assert GEO_PATH.exists()
    assert GEO_PATH.stat().st_size <= 700 * 1024
    gj = json.loads(GEO_PATH.read_text(encoding="utf-8"))
    assert gj["type"] == "FeatureCollection"
    feats = gj["features"]
    assert 170 <= len(feats) <= 185
    names = set()
    for f in feats:
        assert f["type"] == "Feature"
        assert set(f["properties"]) == {"name"}
        names.add(f["properties"]["name"])
        g = f["geometry"]
        assert g["type"] in {"Polygon", "MultiPolygon"}
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                assert len(ring) >= 4 and ring[0] == ring[-1]
                for lon, lat in ring:
                    assert -180.001 <= lon <= 180.001 and -90.001 <= lat <= 90.001
    assert {"India", "Brazil", "France", "Australia"} <= names
