import networkx as nx
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from src.airports import haversine_km
from src.network import load_route_snapshot

DISTANCE_BANDS = [(0, 1000), (1000, 2500), (2500, 5000), (5000, 25000)]


def get_distance_band(dist_km):
    for i, (b_lo, b_hi) in enumerate(DISTANCE_BANDS):
        if b_lo <= dist_km < b_hi:
            return i
    return len(DISTANCE_BANDS) - 1


def sample_distance_matched_negatives(pos_edges, ap_table, seed=42):
    rng = np.random.RandomState(seed)
    pos_set = set(pos_edges)
    nodes = [n for n in ap_table.index if n in ap_table.index]
    n_nodes = len(nodes)

    pos_dists = [
        haversine_km(
            ap_table.loc[u, "latitude"], ap_table.loc[u, "longitude"],
            ap_table.loc[v, "latitude"], ap_table.loc[v, "longitude"],
        )
        for u, v in pos_edges
    ]
    pos_bands = [get_distance_band(d) for d in pos_dists]
    band_targets = pd.Series(pos_bands).value_counts().to_dict()

    neg_edges = []
    attempts = 0
    max_attempts = len(pos_edges) * 15

    while len(neg_edges) < len(pos_edges) and attempts < max_attempts:
        attempts += 1
        idx1, idx2 = rng.choice(n_nodes, size=2, replace=False)
        u, v = nodes[idx1], nodes[idx2]
        pair = (u, v) if u < v else (v, u)
        if pair in pos_set:
            continue
        d = haversine_km(
            ap_table.loc[u, "latitude"], ap_table.loc[u, "longitude"],
            ap_table.loc[v, "latitude"], ap_table.loc[v, "longitude"],
        )
        b = get_distance_band(d)
        if band_targets.get(b, 0) > 0:
            neg_edges.append(pair)
            band_targets[b] -= 1

    return neg_edges


def extract_pair_features(pairs, ap_table, graph, traffic_map=None, gdp_map=None):
    rows = []
    # Pre-extract degrees and neighbor sets for fast link scoring
    degrees = dict(graph.degree())
    neighbors = {n: set(graph.neighbors(n)) for n in graph.nodes()}

    for u, v in pairs:
        lat1, lon1 = ap_table.loc[u, "latitude"], ap_table.loc[u, "longitude"]
        lat2, lon2 = ap_table.loc[v, "latitude"], ap_table.loc[v, "longitude"]
        d = haversine_km(lat1, lon1, lat2, lon2)

        c1, c2 = ap_table.loc[u, "country_code"], ap_table.loc[v, "country_code"]
        r1, r2 = ap_table.loc[u, "continent"], ap_table.loc[v, "continent"]

        deg_u = degrees.get(u, 0)
        deg_v = degrees.get(v, 0)
        pa = float(deg_u * deg_v)

        nbrs_u = neighbors.get(u, set())
        nbrs_v = neighbors.get(v, set())
        common = nbrs_u & nbrs_v
        aa = sum(1.0 / np.log(max(degrees.get(w, 2), 2)) for w in common) if common else 0.0

        t_u = traffic_map.get(u, 1e4) if traffic_map else 1e4
        t_v = traffic_map.get(v, 1e4) if traffic_map else 1e4
        g_u = gdp_map.get(c1, 1e9) if gdp_map else 1e9
        g_v = gdp_map.get(c2, 1e9) if gdp_map else 1e9

        rows.append({
            "log_dist": np.log1p(d),
            "same_country": 1.0 if c1 == c2 else 0.0,
            "same_continent": 1.0 if r1 == r2 else 0.0,
            "pref_attach": np.log1p(pa),
            "adamic_adar": aa,
            "mass_traffic": np.log1p(t_u * t_v),
            "mass_gdp": np.log1p(g_u * g_v),
        })

    return pd.DataFrame(rows)


def fit_route_model(train_pos, train_neg, ap_table, train_graph, traffic_map=None, gdp_map=None, seed=42):
    x_pos = extract_pair_features(train_pos, ap_table, train_graph, traffic_map=traffic_map, gdp_map=gdp_map)
    x_neg = extract_pair_features(train_neg, ap_table, train_graph, traffic_map=traffic_map, gdp_map=gdp_map)

    x = pd.concat([x_pos, x_neg], ignore_index=True)
    y = np.array([1.0] * len(train_pos) + [0.0] * len(train_neg))

    model = LogisticRegression(max_iter=300, random_state=seed)
    model.fit(x, y)
    return model


def build_sampled_pageranks(base_graph, candidate_pairs, probs, n_mc=30, seed=42):
    rng = np.random.RandomState(seed)
    nodes = list(base_graph.nodes())
    pr_draws = {n: [] for n in nodes}

    for _ in range(n_mc):
        g = base_graph.copy()
        draw = rng.uniform(0.0, 1.0, size=len(candidate_pairs))
        for (u, v), p_val, d_val in zip(candidate_pairs, probs, draw):
            if d_val < p_val and not g.has_edge(u, v):
                g.add_edge(u, v)

        pr = nx.pagerank(g, alpha=0.85, max_iter=40)
        for n, val in pr.items():
            pr_draws[n].append(val)

    mean_pr = {n: float(np.mean(vals)) for n, vals in pr_draws.items()}
    std_pr = {n: float(np.std(vals)) for n, vals in pr_draws.items()}
    return mean_pr, std_pr


def reconstruct_network_features(panel, ap_table=None, route_file=None, n_mc=30, seed=42):
    routes = load_route_snapshot(route_file)
    valid_iata = set(panel["iata"].unique())
    valid_routes = routes[routes["source"].isin(valid_iata) & routes["dest"].isin(valid_iata)]

    base_g = nx.Graph()
    base_g.add_nodes_from(valid_iata)
    for _, r in valid_routes.iterrows():
        u, v = r["source"], r["dest"]
        if u != v:
            base_g.add_edge(u, v)

    # Base degrees and connections
    deg_dict = dict(base_g.degree())
    top50 = sorted(deg_dict.keys(), key=lambda k: deg_dict[k], reverse=True)[:50]
    top50_set = set(top50)

    # Compute sampled PageRank distributions
    mean_pr, std_pr = build_sampled_pageranks(base_g, [], [], n_mc=n_mc, seed=seed)

    country_map = panel.set_index("iata")["country_code"].to_dict()

    records = []
    for yr, group in panel.groupby("year"):
        for iata in group["iata"]:
            nbrs = set(base_g.neighbors(iata)) if base_g.has_node(iata) else set()
            deg = len(nbrs)
            t50_cnt = len(nbrs & top50_set)
            countries = len({country_map.get(n) for n in nbrs if n in country_map})

            records.append({
                "iata": iata,
                "year": yr,
                "exp_routes_total": float(deg),
                "exp_top50_hub_links": float(t50_cnt),
                "exp_countries_reached": float(countries),
                "exp_pagerank": mean_pr.get(iata, 0.0),
                "std_pagerank": std_pr.get(iata, 0.0),
            })

    return pd.DataFrame(records)
