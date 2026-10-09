import glob
import pandas as pd
import networkx as nx

from pathlib import Path
from src.config import RAW, PROCESSED, ROUTE_SNAPSHOT_FILE


def load_route_snapshot(file_path=None):
    target = ROUTE_SNAPSHOT_FILE if file_path is None else Path(file_path)
    if not target.exists():
        return pd.DataFrame()
    cols = ["airline", "airline_id", "source", "source_id", "dest", "dest_id", "codeshare", "stops", "equipment"]
    return pd.read_csv(target, header=None, names=cols, na_values=["\\N"])


def compute_openflights_metrics(airports):
    cache_file = PROCESSED / "openflights_network.parquet"
    if cache_file.exists():
        return pd.read_parquet(cache_file)

    routes = load_route_snapshot()
    if routes.empty:
        return pd.DataFrame()

    valid_iata = set(airports["iata"])
    valid = routes[routes["source"].isin(valid_iata) & routes["dest"].isin(valid_iata)].copy()

    country_map = airports.set_index("iata")["country_code"].to_dict()

    g_di = nx.DiGraph()
    for _, r in valid.iterrows():
        u, v = r["source"], r["dest"]
        if g_di.has_edge(u, v):
            g_di[u][v]["weight"] += 1
        else:
            g_di.add_edge(u, v, weight=1)

    g_un = nx.Graph(g_di)
    pr = nx.pagerank(g_di, weight="weight")
    deg_in = dict(g_di.in_degree())
    deg_out = dict(g_di.out_degree())
    deg_in_w = dict(g_di.in_degree(weight="weight"))
    deg_out_w = dict(g_di.out_degree(weight="weight"))
    clustering = nx.clustering(g_un)
    # k=400 sample gives stable betweenness ranking without slow exact computation.
    betweenness = nx.betweenness_centrality(g_un, k=min(400, g_un.number_of_nodes()), seed=42)

    intl_counts = {}
    dom_counts = {}
    for u in g_di.nodes():
        u_country = country_map.get(u)
        neighbors = list(g_di.successors(u))
        intl = sum(1 for v in neighbors if country_map.get(v) != u_country)
        dom = len(neighbors) - intl
        intl_counts[u] = intl
        dom_counts[u] = dom

    top50_hubs = set(sorted(g_di.nodes(), key=lambda n: deg_out.get(n, 0), reverse=True)[:50])
    countries_reached = {}
    top50_links = {}
    for u in g_di.nodes():
        successors = list(g_di.successors(u))
        countries_reached[u] = len({country_map.get(v) for v in successors if country_map.get(v)})
        top50_links[u] = sum(1 for v in successors if v in top50_hubs)

    avg_neighbor_deg = nx.average_neighbor_degree(g_un)

    records = []
    for node in g_di.nodes():
        out_d = deg_out.get(node, 0)
        in_d = deg_in.get(node, 0)
        out_w = deg_out_w.get(node, 0)
        in_w = deg_in_w.get(node, 0)
        intl_d = intl_counts.get(node, 0)
        records.append({
            "iata": node,
            "of_routes_out": out_d,
            "of_routes_in": in_d,
            "of_routes_total": out_d + in_d,
            "of_routes_weighted": out_w + in_w,
            "of_pagerank": pr.get(node, 0.0),
            "of_betweenness": betweenness.get(node, 0.0),
            "of_clustering": clustering.get(node, 0.0),
            "of_intl_routes": intl_d,
            "of_domestic_routes": dom_counts.get(node, 0),
            "of_intl_share": (intl_d / out_d) if out_d > 0 else 0.0,
            "of_avg_neighbor_degree": avg_neighbor_deg.get(node, 0.0),
            "of_countries_reached": countries_reached.get(node, 0),
            "of_top50_hub_links": top50_links.get(node, 0),
        })

    df = pd.DataFrame(records).sort_values("iata").reset_index(drop=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache_file, index=False)
    return df


def compute_opensky_metrics(airports, icao_map):
    cache_file = PROCESSED / "opensky_movements.parquet"
    if cache_file.exists():
        return pd.read_parquet(cache_file)

    yearly_records = []
    for year in [2019, 2020, 2021, 2022]:
        files = sorted(glob.glob(str(RAW / "opensky" / f"flightlist_{year}*.csv.gz")))
        if not files:
            continue
        orig_counts = []
        dest_counts = []
        pairs_list = []
        for f in files:
            df = pd.read_csv(f, usecols=["origin", "destination"])
            orig_counts.append(df["origin"].value_counts())
            dest_counts.append(df["destination"].value_counts())
            valid_pairs = df.dropna(subset=["origin", "destination"])[["origin", "destination"]].drop_duplicates()
            pairs_list.append(valid_pairs)

        tot_orig = pd.concat(orig_counts).groupby(level=0).sum()
        tot_dest = pd.concat(dest_counts).groupby(level=0).sum()
        all_pairs = pd.concat(pairs_list).drop_duplicates()
        out_deg = all_pairs.groupby("origin")["destination"].nunique()

        all_icaos = set(tot_orig.index).union(set(tot_dest.index))
        for icao in all_icaos:
            iata = icao_map.get(icao)
            if not iata:
                continue
            dep = int(tot_orig.get(icao, 0))
            arr = int(tot_dest.get(icao, 0))
            dests = int(out_deg.get(icao, 0))
            yearly_records.append({
                "iata": iata,
                "year": year,
                "opensky_flights": dep + arr,
                "opensky_departures": dep,
                "opensky_arrivals": arr,
                "opensky_destinations": dests,
            })

    if not yearly_records:
        return pd.DataFrame(columns=["iata", "year", "opensky_flights", "opensky_departures", "opensky_arrivals", "opensky_destinations"])

    res = pd.DataFrame(yearly_records).drop_duplicates(subset=["iata", "year"])
    res = res.sort_values(["iata", "year"]).reset_index(drop=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    res.to_parquet(cache_file, index=False)
    return res
