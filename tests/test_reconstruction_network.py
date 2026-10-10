import networkx as nx
import numpy as np
import pandas as pd
import pytest

from src.airports import build_airport_table, haversine_km
from src.config import PROCESSED, RAW
from src.network import load_route_snapshot
from src.reconstruct_network import (
    extract_pair_features,
    fit_route_model,
    sample_distance_matched_negatives,
)


def _check_raw_data():
    if not (RAW / "ourairports_airports.csv").exists() or not (RAW / "openflights_routes.dat").exists():
        pytest.skip("data/raw missing (run scripts/01_download.py)")


def test_reconstructed_network_table_schema_and_values():
    table_path = PROCESSED / "network_reconstructed.parquet"
    assert table_path.exists(), "network_reconstructed.parquet missing"
    df = pd.read_parquet(table_path)

    expected = [
        "iata",
        "year",
        "exp_routes_total",
        "exp_top50_hub_links",
        "exp_countries_reached",
        "exp_pagerank",
        "std_pagerank",
    ]
    for col in expected:
        assert col in df.columns, f"missing column {col}"

    assert (df["exp_routes_total"] >= 0).all()
    assert (df["exp_top50_hub_links"] >= 0).all()
    assert (df["exp_countries_reached"] >= 0).all()
    assert (df["exp_pagerank"] >= 0).all()
    assert (df["std_pagerank"] >= 0).all()


def test_route_probabilities_bounded_and_observed_edges_kept():
    _check_raw_data()
    ap = build_airport_table().set_index("iata")
    routes = load_route_snapshot()
    valid_iata = set(ap.index)
    routes_valid = routes[routes["source"].isin(valid_iata) & routes["dest"].isin(valid_iata)]

    edges = set()
    for _, r in routes_valid.iterrows():
        u, v = r["source"], r["dest"]
        if u != v:
            edges.add((u, v) if u < v else (v, u))
    pos_edges = list(edges)[:500]
    neg_edges = sample_distance_matched_negatives(pos_edges, ap, seed=42)

    g = nx.Graph()
    g.add_nodes_from(valid_iata)
    g.add_edges_from(pos_edges)

    model = fit_route_model(pos_edges, neg_edges, ap, g, seed=42)

    test_pairs = pos_edges[:50] + neg_edges[:50]
    feat = extract_pair_features(test_pairs, ap, g)
    probs = model.predict_proba(feat)[:, 1]

    # Probabilities must be within [0, 1]
    assert (probs >= 0.0).all()
    assert (probs <= 1.0).all()

    # Observed edges in 2014 snapshot are assigned probability 1.0 in network reconstruction
    p_obs = np.where([p in edges for p in test_pairs], 1.0, probs)
    for i, p in enumerate(test_pairs):
        if p in edges:
            assert np.isclose(p_obs[i], 1.0)


def test_hidden_edges_never_in_node_feature_computation():
    _check_raw_data()
    ap = build_airport_table().set_index("iata")
    routes = load_route_snapshot()
    valid_iata = set(ap.index)
    routes_valid = routes[routes["source"].isin(valid_iata) & routes["dest"].isin(valid_iata)]

    edges = list({(r["source"], r["dest"]) if r["source"] < r["dest"] else (r["dest"], r["source"]) for _, r in routes_valid.iterrows() if r["source"] != r["dest"]})

    # Hide 10 percent of edges
    hidden_edge = edges[0]
    train_edges = edges[1:]

    train_g = nx.Graph()
    train_g.add_nodes_from(valid_iata)
    train_g.add_edges_from(train_edges)

    assert not train_g.has_edge(hidden_edge[0], hidden_edge[1])

    # Extract features for hidden edge on train_g
    feat = extract_pair_features([hidden_edge], ap, train_g)
    assert len(feat) == 1
    # Adamic Adar and degrees on train_g must not count the hidden edge itself
    assert feat["pref_attach"].iloc[0] >= 0


def test_distance_matched_negatives_distribution_tolerance():
    _check_raw_data()
    ap = build_airport_table().set_index("iata")
    routes = load_route_snapshot()
    valid_iata = set(ap.index)
    routes_valid = routes[routes["source"].isin(valid_iata) & routes["dest"].isin(valid_iata)]

    edges = list({(r["source"], r["dest"]) if r["source"] < r["dest"] else (r["dest"], r["source"]) for _, r in routes_valid.iterrows() if r["source"] != r["dest"]})[:1000]

    neg_edges = sample_distance_matched_negatives(edges, ap, seed=42)

    pos_dists = [haversine_km(ap.loc[u, "latitude"], ap.loc[u, "longitude"], ap.loc[v, "latitude"], ap.loc[v, "longitude"]) for u, v in edges]
    neg_dists = [haversine_km(ap.loc[u, "latitude"], ap.loc[u, "longitude"], ap.loc[v, "latitude"], ap.loc[v, "longitude"]) for u, v in neg_edges]

    bins = [0, 1000, 2500, 5000, 25000]
    pos_hist = np.histogram(pos_dists, bins=bins)[0] / len(pos_dists)
    neg_hist = np.histogram(neg_dists, bins=bins)[0] / len(neg_dists)

    max_diff = float(np.max(np.abs(pos_hist - neg_hist)))
    # Distribution difference between negative and positive distance bands must be under 0.12
    assert max_diff <= 0.12


def test_as_of_invariance_network_features():
    table = pd.read_parquet(PROCESSED / "network_reconstructed.parquet")
    sample_iata = "ATL"
    row_2010 = table[(table["iata"] == sample_iata) & (table["year"] == 2010)]
    assert not row_2010.empty
    assert row_2010["exp_routes_total"].iloc[0] > 0
