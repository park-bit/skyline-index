import networkx as nx
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from src.network import load_route_snapshot


def haversine_km(lat1, lon1, lat2, lon2):
    r_lat1, r_lon1 = np.radians(lat1), np.radians(lon1)
    r_lat2, r_lon2 = np.radians(lat2), np.radians(lon2)
    dlat = r_lat2 - r_lat1
    dlon = r_lon2 - r_lon1
    a = np.sin(dlat / 2.0) ** 2 + np.cos(r_lat1) * np.cos(r_lat2) * np.sin(dlon / 2.0) ** 2
    return 6371.0 * 2.0 * np.arcsin(np.clip(np.sqrt(a), 0.0, 1.0))


def build_route_graph(airports_df):
    routes = load_route_snapshot()
    valid_iata = set(airports_df["iata"])
    valid = routes[routes["source"].isin(valid_iata) & routes["dest"].isin(valid_iata)]

    g = nx.Graph()
    for _, r in valid.iterrows():
        u, v = r["source"], r["dest"]
        if u != v:
            g.add_edge(u, v)
    return g


def validate_link_prediction(g, airports_df, seed=42):
    rng = np.random.default_rng(seed)
    edges = list(g.edges())
    rng.shuffle(edges)

    split_idx = int(0.80 * len(edges))
    train_edges = edges[:split_idx]
    test_pos = edges[split_idx:]

    # 1. Build training graph exclusively from 80% train edges
    g_tr = nx.Graph()
    g_tr.add_nodes_from(g.nodes())
    g_tr.add_edges_from(train_edges)

    deg_tr = dict(g_tr.degree())
    deg_full = dict(g.degree())

    # 2. Recompute node degree percentiles and importance using training graph only
    tr_deg_pct = pd.Series(deg_tr).rank(pct=True) * 100.0
    full_deg_pct = pd.Series(deg_full).rank(pct=True) * 100.0

    ap_dict = {}
    for _, row in airports_df.iterrows():
        iata = str(row["iata"])
        r = dict(row)
        old_imp = r.get("importance", 50.0)
        net_diff = 0.40 * (tr_deg_pct.get(iata, 0.0) - full_deg_pct.get(iata, 0.0))
        r["importance_tr"] = float(np.clip(old_imp + net_diff, 0.0, 100.0))
        r["deg_tr"] = deg_tr.get(iata, 0)
        ap_dict[iata] = r

    def get_dist_band(d):
        return 0 if d < 1000 else (1 if d < 2500 else (2 if d < 5000 else 3))

    def get_size_band(u, v):
        p = ap_dict[u]["deg_tr"] * ap_dict[v]["deg_tr"]
        return 0 if p < 50 else (1 if p < 300 else 2)

    # Calculate target distance and size band counts from positive test edges
    pos_d_bands = [
        get_dist_band(haversine_km(ap_dict[u]["latitude"], ap_dict[u]["longitude"], ap_dict[v]["latitude"], ap_dict[v]["longitude"]))
        for u, v in test_pos
    ]
    pos_s_bands = [get_size_band(u, v) for u, v in test_pos]
    target_bins = pd.Series(list(zip(pos_d_bands, pos_s_bands))).value_counts().to_dict()
    matched_bins = {k: 0 for k in target_bins}

    existing_edges = set(tuple(sorted(e)) for e in edges)
    nodes = [n for n in g_tr.nodes() if n in ap_dict]

    from collections import defaultdict
    grid = defaultdict(list)
    for n in nodes:
        lat, lon = ap_dict[n]["latitude"], ap_dict[n]["longitude"]
        grid[(int(lat // 6), int(lon // 6))].append(n)

    neg_set = set()
    test_neg = []

    # 3. Match negatives to positives on distance band and endpoint size band
    for u, v in test_pos:
        if u not in ap_dict or v not in ap_dict:
            continue
        d_pos = haversine_km(ap_dict[u]["latitude"], ap_dict[u]["longitude"], ap_dict[v]["latitude"], ap_dict[v]["longitude"])
        d_band = get_dist_band(d_pos)
        s_band = get_size_band(u, v)

        found = False
        for anchor in [u, v]:
            if found:
                break
            clat, clon = int(ap_dict[anchor]["latitude"] // 6), int(ap_dict[anchor]["longitude"] // 6)
            if d_band == 0:
                pool = []
                for dlat in range(-2, 3):
                    for dlon in range(-2, 3):
                        pool.extend(grid.get((clat + dlat, clon + dlon), []))
            elif d_band == 1:
                pool = []
                for dlat in range(-5, 6):
                    for dlon in range(-5, 6):
                        if abs(dlat) >= 2 or abs(dlon) >= 2:
                            pool.extend(grid.get((clat + dlat, clon + dlon), []))
            else:
                pool = nodes

            if not pool:
                continue

            cands = rng.choice(pool, size=min(40, len(pool)), replace=False)
            for w in cands:
                if w == anchor:
                    continue
                pair = tuple(sorted([anchor, w]))
                if pair in existing_edges or pair in neg_set:
                    continue
                d = haversine_km(ap_dict[anchor]["latitude"], ap_dict[anchor]["longitude"], ap_dict[w]["latitude"], ap_dict[w]["longitude"])
                if get_dist_band(d) == d_band and get_size_band(anchor, w) == s_band:
                    neg_set.add(pair)
                    test_neg.append(pair)
                    found = True
                    break

    while len(test_neg) < len(test_pos):
        i, j = rng.choice(len(nodes), size=2, replace=False)
        pair = tuple(sorted([nodes[i], nodes[j]]))
        if pair not in existing_edges and pair not in neg_set:
            test_neg.append(pair)
            neg_set.add(pair)

    # Check matching tolerance
    neg_d_bands = [
        get_dist_band(haversine_km(ap_dict[u]["latitude"], ap_dict[u]["longitude"], ap_dict[v]["latitude"], ap_dict[v]["longitude"]))
        for u, v in test_neg
    ]
    neg_s_bands = [get_size_band(u, v) for u, v in test_neg]
    pos_d_dist = pd.Series(pos_d_bands).value_counts(normalize=True).sort_index()
    neg_d_dist = pd.Series(neg_d_bands).value_counts(normalize=True).sort_index()
    pos_s_dist = pd.Series(pos_s_bands).value_counts(normalize=True).sort_index()
    neg_s_dist = pd.Series(neg_s_bands).value_counts(normalize=True).sort_index()
    diff_dist = float((pos_d_dist - neg_d_dist).abs().max())
    diff_size = float((pos_s_dist - neg_s_dist).abs().max())

    def pair_features(pairs):
        feats = []
        for u, v in pairs:
            r1, r2 = ap_dict[u], ap_dict[v]
            d = max(50.0, haversine_km(r1["latitude"], r1["longitude"], r2["latitude"], r2["longitude"]))
            same_c = 1.0 if r1["country_code"] == r2["country_code"] else 0.0
            pref = r1["deg_tr"] * r2["deg_tr"]
            common = list(nx.common_neighbors(g_tr, u, v)) if (g_tr.has_node(u) and g_tr.has_node(v)) else []
            aa = sum(1.0 / np.log(max(2, g_tr.degree(w))) for w in common) if common else 0.0
            grav = (max(1.0, r1["importance_tr"]) * max(1.0, r2["importance_tr"])) / (d ** 0.8) * (1.5 if same_c else 1.0)
            feats.append([np.log1p(grav), np.log1p(pref), aa])
        return np.array(feats)

    X_test = np.vstack([pair_features(test_pos), pair_features(test_neg)])
    y_test = np.array([1] * len(test_pos) + [0] * len(test_neg))
    auc_grav = float(roc_auc_score(y_test, X_test[:, 0]))
    auc_pref = float(roc_auc_score(y_test, X_test[:, 1]))
    auc_aa = float(roc_auc_score(y_test, X_test[:, 2]))

    tr_pos_sample = train_edges[:2500]
    tr_neg_sample = []
    tr_neg_set = set()
    while len(tr_neg_sample) < len(tr_pos_sample):
        u, v = rng.choice(nodes, size=2, replace=False)
        p = tuple(sorted([u, v]))
        if p not in existing_edges and p not in tr_neg_set:
            tr_neg_sample.append(p)
            tr_neg_set.add(p)

    clf = LogisticRegression(random_state=seed)
    clf.fit(np.vstack([pair_features(tr_pos_sample), pair_features(tr_neg_sample)]), np.array([1] * len(tr_pos_sample) + [0] * len(tr_neg_sample)))
    probs = clf.predict_proba(X_test)[:, 1]
    auc_comb = float(roc_auc_score(y_test, probs))

    # Precision at 100 and 500
    top100_idx = np.argsort(probs)[-100:]
    p100 = float(np.mean(y_test[top100_idx]))
    top500_idx = np.argsort(probs)[-500:]
    p500 = float(np.mean(y_test[top500_idx]))

    return {
        "gravity_auc": round(auc_grav, 3),
        "preferential_attachment_auc": round(auc_pref, 3),
        "adamic_adar_auc": round(auc_aa, 3),
        "combined_auc": round(auc_comb, 3),
        "precision_at_100": round(p100, 3),
        "precision_at_500": round(p500, 3),
        "max_dist_diff": round(diff_dist, 3),
        "max_size_diff": round(diff_size, 3),
        "model": clf,
    }


def find_candidate_routes(g, airports_df, forecast_dict, top_k=250):
    ap_dict = {row["iata"]: row for _, row in airports_df.iterrows()}
    f_map = {a["iata"]: a for a in forecast_dict.get("airports", [])}

    # Restrict to active commercial nodes with at least 5 connections
    active_nodes = [n for n in g.nodes() if g.degree(n) >= 5 and n in ap_dict]
    active_set = set(active_nodes)
    existing_edges = {tuple(sorted(e)) for e in g.edges()}
    nbrs_map = {n: set(g.neighbors(n)) for n in active_nodes}

    candidates = []
    tested_pairs = set()

    for u in active_nodes:
        nbrs_u = nbrs_map[u]
        # Candidate pairs share at least one hub connection
        hop2 = set()
        for w in nbrs_u:
            hop2.update(nbrs_map.get(w, ()))

        for v in hop2:
            if u >= v or v not in active_set:
                continue
            pair = (u, v)
            if pair in existing_edges or pair in tested_pairs:
                continue
            tested_pairs.add(pair)

            common = nbrs_u.intersection(nbrs_map[v])
            if len(common) < 2:
                continue

            r1, r2 = ap_dict[u], ap_dict[v]
            dist = haversine_km(r1["latitude"], r1["longitude"], r2["latitude"], r2["longitude"])
            if dist < 200.0 or dist > 11000.0:
                continue

            same_c = 1.0 if r1["country_code"] == r2["country_code"] else 0.0
            grav = (max(1.0, r1["importance"]) * max(1.0, r2["importance"])) / (dist ** 0.8) * (1.4 if same_c else 1.0)
            pref = g.degree(u) * g.degree(v)
            aa = sum(1.0 / np.log(max(2, g.degree(w))) for w in common)

            f1 = f_map.get(u, {})
            f2 = f_map.get(v, {})
            chg1 = max(0.0, f1.get("forecast_h5", {}).get("change", 0.0))
            chg2 = max(0.0, f2.get("forecast_h5", {}).get("change", 0.0))
            growth_mult = 1.0 + (chg1 + chg2) / 25.0

            base_score = np.log1p(grav) * 0.4 + np.log1p(pref) * 0.3 + aa * 0.3
            total_score = float(base_score * growth_mult)

            candidates.append({
                "origin_iata": u, "dest_iata": v,
                "origin_name": str(r1.get("name", "")), "dest_name": str(r2.get("name", "")),
                "origin_city": str(r1.get("municipality", "")), "dest_city": str(r2.get("municipality", "")),
                "origin_country": str(r1.get("country_code", "")), "dest_country": str(r2.get("country_code", "")),
                "origin_lat": round(float(r1["latitude"]), 4), "origin_lon": round(float(r1["longitude"]), 4),
                "dest_lat": round(float(r2["latitude"]), 4), "dest_lon": round(float(r2["longitude"]), 4),
                "distance_km": round(float(dist), 1), "score": round(total_score, 2), "common_connections": len(common),
                "candidate_label": "model candidate, not confirmed demand",
                "reason": f"Model candidate: network overlap with {len(common)} common hubs and +{round(chg1 + chg2, 1)} combined growth",
            })

    candidates.sort(key=lambda x: x["score"], reverse=True)
    for rank, c in enumerate(candidates[:top_k], 1):
        c["rank"] = rank
    return candidates[:top_k]


def build_three_lists(airports_df, forecast_dict, candidate_routes):
    f_airports = forecast_dict.get("airports", [])
    core_risers = sorted(
        [
            a for a in f_airports
            if (a.get("data_quality") == "observed" or a.get("importance_confidence") in ["high", "medium"])
            and a.get("forecast_h5", {}).get("change", 0.0) > 0.0
        ],
        key=lambda x: x["forecast_h5"]["change"], reverse=True
    )
    investor_list = [
        {
            "rank": rank, "iata": a["iata"], "name": a["name"], "city": a["city"], "country": a["country"],
            "latitude": a["latitude"], "longitude": a["longitude"], "importance_present": a["importance_present"],
            "forecast_change_h5": a["forecast_h5"]["change"], "forecast_level_h5": a["forecast_h5"]["level"],
            "forecast_level_h10": a["forecast_h10"]["level"], "class": a["forecast_h5"]["class"],
            "candidate_label": "model candidate, not confirmed demand",
            "top_driver": a["forecast_h5"]["positive_drivers"][0] if a["forecast_h5"]["positive_drivers"] else "growth",
        }
        for rank, a in enumerate(core_risers[:60], 1)
    ]

    ap_map = airports_df.set_index("iata")
    tourism_cands = []
    for a in f_airports:
        iata = a["iata"]
        if iata in ap_map.index:
            r = ap_map.loc[iata]
            intl_sh = float(r.get("of_intl_share", 0.0) or 0.0)
            routes = float(r.get("of_routes_total", 0.0) or 0.0)
            chg = a.get("forecast_h5", {}).get("change", 0.0)
            if routes >= 5 and intl_sh >= 0.15 and chg > 0.0:
                score = chg * (1.0 + intl_sh)
                tourism_cands.append((score, a, intl_sh))
    tourism_cands.sort(key=lambda x: x[0], reverse=True)

    tourism_list = [
        {
            "rank": rank, "iata": a["iata"], "name": a["name"], "city": a["city"], "country": a["country"],
            "latitude": a["latitude"], "longitude": a["longitude"], "importance_present": a["importance_present"],
            "forecast_change_h5": a["forecast_h5"]["change"], "forecast_level_h5": a["forecast_h5"]["level"],
            "international_share": round(float(intl_sh), 3),
            "candidate_label": "model candidate, not confirmed demand",
            "top_driver": a["forecast_h5"]["positive_drivers"][0] if a["forecast_h5"]["positive_drivers"] else "reach",
        }
        for rank, (_, a, intl_sh) in enumerate(tourism_cands[:60], 1)
    ]

    return {
        "disclaimer": "Candidate routes and lists are generated from the network model as model candidates, not confirmed demand. Underlying network topology uses OpenFlights 2014 and OpenSky 2019 to 2022 route data.",
        "airline_opportunities": candidate_routes,
        "investor_opportunities": investor_list,
        "tourism_opportunities": tourism_list,
    }
