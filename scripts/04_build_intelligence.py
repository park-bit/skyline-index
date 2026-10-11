"""Build web/intelligence.json (+ data/outputs/intelligence.json) and post-process forecasts.json.

Steps (printed with timings):
  1. load forecasts.json, model table, horizon-10 shrinkage result (runs scripts/05 if missing)
  2. ranks + damped horizon-10 fields, written back into forecasts.json (idempotent)
  3. country / region aggregates, rankings
  4. route graph: network stats (present + forecast-weighted h5/h10), resilience
  5. scenario sensitivities (standardised Ridge surrogate) + country GDP shocks on the production model
  6. web/vendor/world-110m.geojson from the world-atlas TopoJSON (decoded here, no dependency)
  7. write intelligence.json

Schema: see UPGRADE_SPEC (shared contract). Keys are fixed; anything that cannot be computed is null.
Run: python scripts/04_build_intelligence.py   (about 2-3 minutes on 2 cores)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from multiprocessing import Pool
from pathlib import Path

import joblib
import networkx as nx
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components, shortest_path
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SEED = 42
AS_OF_YEAR = 2025
EXACT_REACH_TOP_N = int(os.environ.get("SKYLINE_EXACT_REACH_TOP_N", "40"))
BETWEENNESS_SAMPLE_K = 300

CONTINENT_NAMES = {"AS": "Asia", "EU": "Europe", "NA": "North America", "SA": "South America",
                   "AF": "Africa", "OC": "Oceania", "AN": "Antarctica"}

# ISO2 -> English name for every country present in the panel (generated from pycountry 26.2;
# used when pycountry is not installed). A few display overrides are applied on top.
COUNTRY_NAMES_FALLBACK = {
    "AD": "Andorra", "AE": "United Arab Emirates", "AF": "Afghanistan", "AG": "Antigua and Barbuda", "AI": "Anguilla",
    "AL": "Albania", "AM": "Armenia", "AO": "Angola", "AQ": "Antarctica", "AR": "Argentina", "AS": "American Samoa",
    "AT": "Austria", "AU": "Australia", "AW": "Aruba", "AZ": "Azerbaijan", "BA": "Bosnia and Herzegovina",
    "BB": "Barbados", "BD": "Bangladesh", "BE": "Belgium", "BF": "Burkina Faso", "BG": "Bulgaria", "BH": "Bahrain",
    "BI": "Burundi", "BJ": "Benin", "BL": "Saint Barthélemy", "BM": "Bermuda", "BN": "Brunei Darussalam",
    "BO": "Bolivia", "BQ": "Bonaire, Sint Eustatius and Saba", "BR": "Brazil", "BS": "Bahamas", "BT": "Bhutan",
    "BW": "Botswana", "BY": "Belarus", "BZ": "Belize", "CA": "Canada", "CC": "Cocos (Keeling) Islands",
    "CD": "Congo, The Democratic Republic of the", "CF": "Central African Republic", "CG": "Congo",
    "CH": "Switzerland", "CI": "Côte d'Ivoire", "CK": "Cook Islands", "CL": "Chile", "CM": "Cameroon", "CN": "China",
    "CO": "Colombia", "CR": "Costa Rica", "CU": "Cuba", "CV": "Cabo Verde", "CW": "Curaçao", "CX": "Christmas Island",
    "CY": "Cyprus", "CZ": "Czechia", "DE": "Germany", "DJ": "Djibouti", "DK": "Denmark", "DM": "Dominica",
    "DO": "Dominican Republic", "DZ": "Algeria", "EC": "Ecuador", "EE": "Estonia", "EG": "Egypt", "EH": "Western Sahara",
    "ER": "Eritrea", "ES": "Spain", "ET": "Ethiopia", "FI": "Finland", "FJ": "Fiji", "FK": "Falkland Islands (Malvinas)",
    "FM": "Micronesia, Federated States of", "FO": "Faroe Islands", "FR": "France", "GA": "Gabon", "GB": "United Kingdom",
    "GD": "Grenada", "GE": "Georgia", "GF": "French Guiana", "GG": "Guernsey", "GH": "Ghana", "GI": "Gibraltar",
    "GL": "Greenland", "GM": "Gambia", "GN": "Guinea", "GP": "Guadeloupe", "GQ": "Equatorial Guinea", "GR": "Greece",
    "GT": "Guatemala", "GU": "Guam", "GW": "Guinea-Bissau", "GY": "Guyana", "HK": "Hong Kong", "HN": "Honduras",
    "HR": "Croatia", "HT": "Haiti", "HU": "Hungary", "ID": "Indonesia", "IE": "Ireland", "IL": "Israel",
    "IM": "Isle of Man", "IN": "India", "IO": "British Indian Ocean Territory", "IQ": "Iraq", "IR": "Iran",
    "IS": "Iceland", "IT": "Italy", "JE": "Jersey", "JM": "Jamaica", "JO": "Jordan", "JP": "Japan", "KE": "Kenya",
    "KG": "Kyrgyzstan", "KH": "Cambodia", "KI": "Kiribati", "KM": "Comoros", "KN": "Saint Kitts and Nevis",
    "KP": "North Korea", "KR": "South Korea", "KW": "Kuwait", "KY": "Cayman Islands", "KZ": "Kazakhstan", "LA": "Laos",
    "LB": "Lebanon", "LC": "Saint Lucia", "LK": "Sri Lanka", "LR": "Liberia", "LS": "Lesotho", "LT": "Lithuania",
    "LU": "Luxembourg", "LV": "Latvia", "LY": "Libya", "MA": "Morocco", "MC": "Monaco", "MD": "Moldova",
    "ME": "Montenegro", "MF": "Saint Martin (French part)", "MG": "Madagascar", "MH": "Marshall Islands",
    "MK": "North Macedonia", "ML": "Mali", "MM": "Myanmar", "MN": "Mongolia", "MO": "Macao",
    "MP": "Northern Mariana Islands", "MQ": "Martinique", "MR": "Mauritania", "MS": "Montserrat", "MT": "Malta",
    "MU": "Mauritius", "MV": "Maldives", "MW": "Malawi", "MX": "Mexico", "MY": "Malaysia", "MZ": "Mozambique",
    "NA": "Namibia", "NC": "New Caledonia", "NE": "Niger", "NF": "Norfolk Island", "NG": "Nigeria", "NI": "Nicaragua",
    "NL": "Netherlands", "NO": "Norway", "NP": "Nepal", "NR": "Nauru", "NU": "Niue", "NZ": "New Zealand", "OM": "Oman",
    "PA": "Panama", "PE": "Peru", "PF": "French Polynesia", "PG": "Papua New Guinea", "PH": "Philippines",
    "PK": "Pakistan", "PL": "Poland", "PM": "Saint Pierre and Miquelon", "PR": "Puerto Rico", "PS": "Palestine, State of",
    "PT": "Portugal", "PW": "Palau", "PY": "Paraguay", "QA": "Qatar", "RE": "Réunion", "RO": "Romania", "RS": "Serbia",
    "RU": "Russian Federation", "RW": "Rwanda", "SA": "Saudi Arabia", "SB": "Solomon Islands", "SC": "Seychelles",
    "SD": "Sudan", "SE": "Sweden", "SG": "Singapore", "SH": "Saint Helena, Ascension and Tristan da Cunha",
    "SI": "Slovenia", "SK": "Slovakia", "SL": "Sierra Leone", "SN": "Senegal", "SO": "Somalia", "SR": "Suriname",
    "SS": "South Sudan", "ST": "Sao Tome and Principe", "SV": "El Salvador", "SX": "Sint Maarten (Dutch part)",
    "SY": "Syria", "SZ": "Eswatini", "TC": "Turks and Caicos Islands", "TD": "Chad", "TG": "Togo", "TH": "Thailand",
    "TJ": "Tajikistan", "TL": "Timor-Leste", "TM": "Turkmenistan", "TN": "Tunisia", "TO": "Tonga", "TR": "Türkiye",
    "TT": "Trinidad and Tobago", "TV": "Tuvalu", "TW": "Taiwan", "TZ": "Tanzania", "UA": "Ukraine", "UG": "Uganda",
    "UM": "United States Minor Outlying Islands", "US": "United States", "UY": "Uruguay", "UZ": "Uzbekistan",
    "VC": "Saint Vincent and the Grenadines", "VE": "Venezuela", "VG": "Virgin Islands, British",
    "VI": "Virgin Islands, U.S.", "VN": "Vietnam", "VU": "Vanuatu", "WF": "Wallis and Futuna", "WS": "Samoa",
    "YE": "Yemen", "YT": "Mayotte", "ZA": "South Africa", "ZM": "Zambia", "ZW": "Zimbabwe", "XK": "Kosovo",
}
COUNTRY_NAME_OVERRIDES = {
    "RU": "Russia", "CD": "DR Congo", "CG": "Republic of the Congo", "FM": "Micronesia", "FK": "Falkland Islands",
    "PS": "Palestine", "VG": "British Virgin Islands", "VI": "U.S. Virgin Islands", "BN": "Brunei",
    "SH": "Saint Helena", "MF": "Saint Martin", "SX": "Sint Maarten", "BQ": "Caribbean Netherlands",
    "XK": "Kosovo", "LA": "Laos", "SY": "Syria", "IR": "Iran", "KP": "North Korea", "KR": "South Korea",
    "TW": "Taiwan", "VN": "Vietnam", "BO": "Bolivia", "VE": "Venezuela", "TZ": "Tanzania", "MD": "Moldova",
    "UM": "U.S. Minor Outlying Islands", "TR": "Türkiye",
}

SCENARIO_HEADLINE = ["gdp_growth_1y", "tourism_growth_1y", "pop_growth_1y", "traffic_growth_1y",
                     "of_routes_total", "of_top50_hub_links"]
COMPOSITES = {
    "gdp_growth_sustained": ["gdp_growth_1y", "gdp_growth_3y", "gdp_growth_5y", "imf_gdp_growth_pct"],
    "tourism_growth_sustained": ["tourism_growth_1y", "tourism_growth_3y", "tourism_growth_5y"],
    "pop_growth_sustained": ["pop_growth_1y", "pop_growth_3y", "pop_growth_5y"],
    "traffic_growth_sustained": ["traffic_growth_1y", "traffic_growth_3y", "traffic_growth_5y"],
}


def log(msg: str, t0: float | None = None) -> None:
    if t0 is None:
        print(msg, flush=True)
    else:
        print(f"{msg} ({time.time() - t0:.1f}s)", flush=True)


def r2(x) -> float | None:
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 2)


def r4(x) -> float | None:
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 4)


# --------------------------------------------------------------------------------------
# 1. inputs
# --------------------------------------------------------------------------------------
def country_names_for(codes: list[str]) -> dict[str, str]:
    names = {}
    try:
        import pycountry  # type: ignore
    except Exception:  # noqa: BLE001 - optional dependency
        pycountry = None
    for c in codes:
        name = None
        if pycountry is not None:
            rec = pycountry.countries.get(alpha_2=c)
            if rec is not None:
                name = getattr(rec, "common_name", None) or rec.name
        name = COUNTRY_NAME_OVERRIDES.get(c, name or COUNTRY_NAMES_FALLBACK.get(c, c))
        names[c] = name
    return names


def load_shrinkage() -> dict:
    path = ROOT / "data" / "outputs" / "horizon10_shrinkage.json"
    if not path.exists():
        log("  horizon10_shrinkage.json missing -> running scripts/05_horizon10_shrinkage.py")
        subprocess.run([sys.executable, str(ROOT / "scripts" / "05_horizon10_shrinkage.py")], check=True)
    return json.loads(path.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------------------
# 2. ranks + damped horizon 10, written back to forecasts.json
# --------------------------------------------------------------------------------------
def rank_series(values: dict[str, float]) -> dict[str, int]:
    """1 = highest value. Ties broken by IATA for determinism."""
    order = sorted(values.items(), key=lambda kv: (-kv[1], kv[0]))
    return {k: i + 1 for i, (k, _) in enumerate(order)}


def postprocess_forecasts(fc: dict, alpha: float, continent_of: dict[str, str]) -> dict[str, dict]:
    aps = fc["airports"]
    for a in aps:
        h10 = a["forecast_h10"]
        chg_d = round(alpha * float(h10["change"]), 2)
        lvl_d = round(float(np.clip(a["importance_present"] + chg_d, 0.0, 100.0)), 2)
        h10["change_damped"] = chg_d
        h10["level_damped"] = lvl_d
    rp = rank_series({a["iata"]: a["importance_present"] for a in aps})
    r5 = rank_series({a["iata"]: a["forecast_h5"]["level"] for a in aps})
    r10 = rank_series({a["iata"]: a["forecast_h10"]["level_damped"] for a in aps})
    for a in aps:
        a["rank_present"] = rp[a["iata"]]
        a["rank_h5"] = r5[a["iata"]]
        a["rank_h10"] = r10[a["iata"]]
        a["continent"] = continent_of.get(a["iata"])
    return {a["iata"]: {"present": rp[a["iata"]], "h5": r5[a["iata"]], "h10": r10[a["iata"]]} for a in aps}


# --------------------------------------------------------------------------------------
# 3. countries / regions / rankings
# --------------------------------------------------------------------------------------
def latest_macro(panel: pd.DataFrame) -> pd.DataFrame:
    """Latest non-null value per country for each macro field (panel years <= AS_OF_YEAR)."""
    cols = {"imf_gdp_growth_pct": "gdp_growth_pct", "wb_gdp_per_capita": "gdp_per_capita_usd",
            "imf_gdp_per_capita_usd": "gdp_per_capita_usd_alt", "un_pop_thousands": "population_k",
            "wb_population": "population_alt", "wb_tourism_arrivals": "tourism_arrivals", "un_median_age": "median_age"}
    p = panel[panel["year"] <= AS_OF_YEAR][["country_code", "year", *cols]].sort_values("year")
    out = {}
    for src, dst in cols.items():
        s = p.dropna(subset=[src]).groupby("country_code")[src].last()
        out[dst] = s
    m = pd.DataFrame(out)
    m["gdp_per_capita_usd"] = m["gdp_per_capita_usd"].fillna(m["gdp_per_capita_usd_alt"])
    m["population"] = (m["population_k"] * 1000.0).fillna(m["population_alt"])
    return m[["gdp_growth_pct", "gdp_per_capita_usd", "population", "tourism_arrivals", "median_age"]]


def aggregate_group(df: pd.DataFrame) -> dict:
    w = df["importance_present"].to_numpy(dtype=float)
    wsum = w.sum()
    tw5 = float((w * df["change_h5"]).sum() / wsum) if wsum > 0 else 0.0
    tw10 = float((w * df["change_h10"]).sum() / wsum) if wsum > 0 else 0.0
    top = df.sort_values(["importance_present", "iata"], ascending=[False, True])
    riser = df.sort_values(["change_h10", "iata"], ascending=[False, True]).iloc[0]
    faller = df.sort_values(["change_h10", "iata"], ascending=[True, True]).iloc[0]
    return {
        "n_airports": len(df),
        "mean_importance_present": r2(df["importance_present"].mean()),
        "mean_level_h5": r2(df["level_h5"].mean()),
        "mean_level_h10": r2(df["level_h10"].mean()),
        "traffic_weighted_change_h5": r2(tw5),
        "traffic_weighted_change_h10": r2(tw10),
        "n_emerging_h5": int((df["class_h5"] == "emerging").sum()),
        "n_declining_h5": int((df["class_h5"] == "declining").sum()),
        "n_hub": int((df["class_h5"] == "established_hub").sum()),
        "n_stable_h5": int((df["class_h5"] == "stable").sum()),
        "n_emerging_h10": int((df["class_h10"] == "emerging").sum()),
        "n_declining_h10": int((df["class_h10"] == "declining").sum()),
        "top_airports": top["iata"].head(5).tolist(),
        "top_riser": {"iata": str(riser["iata"]), "change_h10": r2(riser["change_h10"])},
        "top_faller": {"iata": str(faller["iata"]), "change_h10": r2(faller["change_h10"])},
    }


def _pop_weighted(sub: pd.DataFrame, col: str) -> float | None:
    """Population-weighted mean of a country macro column across a region's countries."""
    s = sub[[col, "population"]].dropna()
    if len(s) == 0 or s["population"].sum() <= 0:
        return None
    return r2((s[col] * s["population"]).sum() / s["population"].sum())


def build_groups(ap: pd.DataFrame, macro: pd.DataFrame, names: dict[str, str]) -> tuple[list, list]:
    countries = []
    for iso2, g in ap.groupby("country", sort=True):
        rec = {"iso2": iso2, "name": names.get(iso2, iso2), "continent": g["continent"].mode().iloc[0]}
        rec.update(aggregate_group(g))
        mrow = macro.loc[iso2] if iso2 in macro.index else None
        rec["macro"] = {k: (r2(mrow[k]) if mrow is not None and pd.notna(mrow[k]) else None)
                        for k in ["gdp_growth_pct", "gdp_per_capita_usd", "population", "tourism_arrivals", "median_age"]}
        countries.append(rec)
    eligible = sorted([c for c in countries if c["n_airports"] >= 3],
                      key=lambda c: (-c["traffic_weighted_change_h10"], c["iso2"]))
    rank = {c["iso2"]: i + 1 for i, c in enumerate(eligible)}
    for c in countries:
        c["momentum_rank_h10"] = rank.get(c["iso2"])

    regions = []
    for code, g in ap.groupby("continent", sort=True):
        rec = {"code": code, "name": CONTINENT_NAMES.get(code, code), "continent": code}
        rec.update(aggregate_group(g))
        sub = macro.loc[macro.index.intersection(g["country"].unique())]
        pop = sub["population"]
        rec["macro"] = {
            "gdp_growth_pct": _pop_weighted(sub, "gdp_growth_pct"),
            "gdp_per_capita_usd": _pop_weighted(sub, "gdp_per_capita_usd"),
            "population": r2(pop.sum()) if pop.notna().any() else None,
            "tourism_arrivals": r2(sub["tourism_arrivals"].sum()) if sub["tourism_arrivals"].notna().any() else None,
            "median_age": _pop_weighted(sub, "median_age"),
        }
        regions.append(rec)
    reg_sorted = sorted([r for r in regions if r["n_airports"] >= 3],
                        key=lambda r: (-r["traffic_weighted_change_h10"], r["code"]))
    rrank = {r["code"]: i + 1 for i, r in enumerate(reg_sorted)}
    for r in regions:
        r["momentum_rank_h10"] = rrank.get(r["code"])
    return countries, regions


def build_rankings(ap: pd.DataFrame, ranks: dict) -> dict:
    def movers(col_chg, col_lvl, ascending, n=50):
        s = ap.sort_values([col_chg, "iata"], ascending=[ascending, True]).head(n)
        return [{"iata": r.iata, "name": r.name, "country": r.country, "change": r2(getattr(r, col_chg)),
                 "level": r2(getattr(r, col_lvl))} for r in s.itertuples(index=False)]

    def hubs(col, n=50):
        s = ap.sort_values([col, "iata"], ascending=[False, True]).head(n)
        return [{"iata": r.iata, "name": r.name, "country": r.country, "score": r2(getattr(r, col))}
                for r in s.itertuples(index=False)]

    rk = pd.DataFrame({"iata": list(ranks), "rank_present": [v["present"] for v in ranks.values()],
                       "rank_h10": [v["h10"] for v in ranks.values()]})
    rk = rk.merge(ap[["iata", "name", "country"]], on="iata")
    rk["rank_delta"] = rk["rank_present"] - rk["rank_h10"]  # positive = climbs the table

    def climbers(ascending, n=50):
        s = rk.sort_values(["rank_delta", "iata"], ascending=[ascending, True]).head(n)
        return [{"iata": r.iata, "name": r.name, "country": r.country, "rank_present": int(r.rank_present),
                 "rank_h10": int(r.rank_h10), "rank_delta": int(r.rank_delta)} for r in s.itertuples(index=False)]

    return {
        "top_risers_h5": movers("change_h5", "level_h5", False),
        "top_risers_h10": movers("change_h10", "level_h10", False),
        "top_fallers_h5": movers("change_h5", "level_h5", True),
        "top_fallers_h10": movers("change_h10", "level_h10", True),
        "top_hubs_present": hubs("importance_present"),
        "top_hubs_h10": hubs("level_h10"),
        "biggest_rank_climbers_h10": climbers(False),
        "biggest_rank_drops_h10": climbers(True),
    }


# --------------------------------------------------------------------------------------
# 4. network + resilience
# --------------------------------------------------------------------------------------
def build_graph(fc: dict) -> nx.Graph:
    """Undirected route graph over the forecast airports.

    forecasts.json truncates each airport's `routes` list to its first 15 partners, so the
    graph is the union of (a) those lists in both directions and (b) the full OpenFlights
    route snapshot (data/inputs/routes.dat, the same source the lists were cut from),
    restricted to airports in forecasts.json. Airports with no route are left out."""
    iatas = {a["iata"] for a in fc["airports"]}
    G = nx.Graph()
    for a in fc["airports"]:
        for b in a["routes"]:
            if b in iatas and b != a["iata"]:
                G.add_edge(a["iata"], b)
    snap = ROOT / "data" / "inputs" / "routes.dat"
    if snap.exists():
        cols = ["airline", "airline_id", "source", "source_id", "dest", "dest_id", "codeshare", "stops", "equipment"]
        r = pd.read_csv(snap, header=None, names=cols, na_values=["\\N"], usecols=["source", "dest"])
        r = r[r["source"].isin(iatas) & r["dest"].isin(iatas) & (r["source"] != r["dest"])]
        G.add_edges_from(zip(r["source"], r["dest"]))
    return G


_G: nx.Graph | None = None  # shared with forked workers
_A: csr_matrix | None = None
_D0: np.ndarray | None = None
_NODES: list[str] = []


def _worker_betweenness(job: tuple) -> tuple:
    kind, weight_attr, k = job
    if k is None:
        bc = nx.betweenness_centrality(_G, weight=weight_attr, normalized=True)
    else:
        bc = nx.betweenness_centrality(_G, k=min(k, _G.number_of_nodes()), seed=SEED, weight=weight_attr, normalized=True)
    top = sorted(bc.items(), key=lambda kv: (-kv[1], kv[0]))[:15]
    return kind, [{"iata": i, "value": round(float(v), 5)} for i, v in top]


def _worker_reach(v: int) -> tuple:
    """Exact pair loss when node v is removed: pairs disconnected + pairs whose hop count grows >= 2."""
    n = _A.shape[0]
    keep = np.ones(n, dtype=bool)
    keep[v] = False
    A2 = _A[keep][:, keep]
    D2 = shortest_path(A2, method="D", unweighted=True, directed=False)
    D1 = _D0[keep][:, keep]
    was_conn = np.isfinite(D1)
    now_inf = ~np.isfinite(D2) & was_conn
    with np.errstate(invalid="ignore"):
        lengthened = was_conn & np.isfinite(D2) & ((D2 - D1) >= 2)
    base_pairs = int(np.triu(was_conn, 1).sum())
    n_disc = int(np.triu(now_inf, 1).sum())
    n_long = int(np.triu(lengthened, 1).sum())
    return v, base_pairs, n_disc, n_long


def network_block(G: nx.Graph, weight: str | None, top_bc: list, node_level: pd.Series | None = None,
                  clustering: dict | None = None) -> dict:
    n = G.number_of_nodes()
    clustering = clustering if clustering is not None else nx.clustering(G)
    if weight is None:
        deg = np.array([d for _, d in G.degree()], dtype=float)
        e_sum = G.number_of_edges()
        clus = float(np.mean(list(clustering.values())))
    else:
        deg = np.array([d for _, d in G.degree(weight=weight)], dtype=float)
        e_sum = sum(d[weight] for _, _, d in G.edges(data=True))
        lv = np.array([node_level[u] for u in G.nodes()], dtype=float)
        cv = np.array([clustering[u] for u in G.nodes()], dtype=float)
        clus = float((lv * cv).sum() / lv.sum())
    comps = list(nx.connected_components(G))
    return {
        "n_nodes": int(n),
        "n_edges": int(G.number_of_edges()),
        "avg_degree": r4(deg.mean()),
        "density": r4(2.0 * e_sum / (n * (n - 1))),
        "n_components": len(comps),
        "giant_component_share": r4(max(len(c) for c in comps) / n),
        "avg_clustering": r4(clus),
        "top_betweenness": top_bc,
    }


def compute_network_and_resilience(fc: dict, ap: pd.DataFrame) -> tuple[dict, dict]:
    global _G, _A, _D0, _NODES
    t0 = time.time()
    G = build_graph(fc)
    nodes = sorted(G.nodes())
    idx = {u: i for i, u in enumerate(nodes)}
    n = len(nodes)
    log(f"  graph: {n:,} nodes with >=1 route, {G.number_of_edges():,} edges", t0)

    present = ap.set_index("iata")["importance_present"].clip(lower=1.0)
    lvl5 = ap.set_index("iata")["level_h5"].clip(lower=1.0)
    lvl10 = ap.set_index("iata")["level_h10"].clip(lower=1.0)
    # Projected weights: topology held constant, each edge re-weighted by the geometric mean of the
    # endpoints' forecast level / present importance ratio (present weight == 1 for every edge).
    for u, v, d in G.edges(data=True):
        d["w5"] = float(np.sqrt((lvl5[u] / present[u]) * (lvl5[v] / present[v])))
        d["w10"] = float(np.sqrt((lvl10[u] / present[u]) * (lvl10[v] / present[v])))
        d["dist0"] = 1.0 / float(present[u] * present[v] / 1e4)
        d["dist5"] = 1.0 / float(lvl5[u] * lvl5[v] / 1e4)
        d["dist10"] = 1.0 / float(lvl10[u] * lvl10[v] / 1e4)

    rows, cols = [], []
    for u, v in G.edges():
        rows += [idx[u], idx[v]]
        cols += [idx[v], idx[u]]
    A = csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n))
    t1 = time.time()
    D0 = shortest_path(A, method="D", unweighted=True, directed=False)
    log("  all-pairs hop distances", t1)
    _G, _A, _D0, _NODES = G, A, D0, nodes

    deg = dict(G.degree())
    top_exact = sorted(nodes, key=lambda u: (-deg[u], u))[:EXACT_REACH_TOP_N]
    jobs_bc = [("present", "dist0", BETWEENNESS_SAMPLE_K), ("h5", "dist5", BETWEENNESS_SAMPLE_K),
               ("h10", "dist10", BETWEENNESS_SAMPLE_K)]
    t2 = time.time()
    n_workers = max(1, min(2, os.cpu_count() or 1))
    with Pool(n_workers) as pool:
        bc_async = pool.map_async(_worker_betweenness, jobs_bc, chunksize=1)
        reach_exact = {}
        for v, base, n_disc, n_long in pool.imap_unordered(_worker_reach, [idx[u] for u in top_exact], chunksize=4):
            reach_exact[nodes[v]] = (base, n_disc, n_long)
        bc_results = dict(bc_async.get())
    log(f"  betweenness x3 + exact removal reach for top {len(top_exact)} nodes on {n_workers} workers", t2)

    # Disconnection-only pair loss for every other node (exact via components of G - v; only
    # articulation points can disconnect anything).
    t3 = time.time()
    aps_set = set(nx.articulation_points(G))
    conn_pairs_total = int(np.triu(np.isfinite(D0), 1).sum())
    comp_label = connected_components(A, directed=False)[1]
    comp_size = np.bincount(comp_label)
    reach = {}
    alt_neighbors = {}
    kept_all = np.arange(n)
    for u in nodes:
        i = idx[u]
        base = conn_pairs_total - int(comp_size[comp_label[i]] - 1)
        n_disc, n_long, n_cut = 0, None, 0
        if u in reach_exact:
            base, n_disc, n_long = reach_exact[u]
        if u in aps_set:
            keep = np.ones(n, dtype=bool)
            keep[i] = False
            lab = connected_components(A[keep][:, keep], directed=False)[1]
            kept_idx = kept_all[keep]
            former_idx = np.where(comp_label == comp_label[i])[0]
            former_idx = former_idx[former_idx != i]
            lab_f = lab[np.searchsorted(kept_idx, former_idx)]
            sizes = np.bincount(lab_f)
            if u not in reach_exact:
                m = len(former_idx)
                n_disc = int(m * (m - 1) // 2 - sum(int(sz) * (int(sz) - 1) // 2 for sz in sizes))
            big = int(sizes.argmax())
            n_cut = int((lab_f != big).sum())
            nb_pos = np.searchsorted(kept_idx, [idx[w] for w in G.neighbors(u)])
            alt_neighbors[u] = int((lab[nb_pos] == big).sum())
        else:
            alt_neighbors[u] = deg[u]
        loss_pct = 100.0 * (n_disc + (n_long or 0)) / base if base > 0 else 0.0
        reach[u] = {"loss_pct": loss_pct, "n_cut": n_cut, "exact_hops": n_long is not None}
    log(f"  disconnection analysis for {len(aps_set)} articulation points", t3)

    # Dependency HHI: shares of a node's edges weighted by partner importance_present.
    t4 = time.time()
    imp = ap.set_index("iata")["importance_present"].clip(lower=0.1)
    two_hop_share = {}
    hhi, top_dep = {}, {}
    for u in nodes:
        nbrs = list(G.neighbors(u))
        w = np.array([imp[v] for v in nbrs], dtype=float)
        s = w / w.sum()
        hhi[u] = float((s ** 2).sum())
        order = np.argsort(-s, kind="stable")[:3]
        top_dep[u] = [{"iata": nbrs[j], "share": round(float(s[j]), 4)} for j in order]
        i = idx[u]
        two_hop_share[u] = float((D0[i] <= 2).sum() - 1) / max(1, n - 1)
    # Redundancy: 0.5 * alternative edge-disjoint entries into the core (capped at 6) + 0.5 * percentile
    # rank of 2-hop reach share. alt = neighbours that stay attached to the largest remaining component
    # once the node itself is removed (each is an edge-disjoint path into the core).
    th = pd.Series(two_hop_share)
    th_pct = th.rank(pct=True)
    redundancy = {u: float(100.0 * (0.5 * min(alt_neighbors[u], 6) / 6.0 + 0.5 * th_pct[u])) for u in nodes}
    hhi_s = pd.Series(hhi)
    hhi_q75 = float(hhi_s.quantile(0.75))
    red_s = pd.Series(redundancy)
    red_q60 = float(red_s.quantile(0.60))

    airports_out = []
    for u in nodes:
        if hhi[u] >= hhi_q75 and deg[u] <= 3:
            cls = "fragile"
        elif redundancy[u] >= red_q60:
            cls = "robust"
        else:
            cls = "watch"
        airports_out.append({
            "iata": u,
            "removal_reach_loss_pct": round(reach[u]["loss_pct"], 4),
            "removal_disconnected_airports": int(reach[u]["n_cut"]),
            "is_articulation_point": bool(u in aps_set),
            "dependency_hhi": round(hhi[u], 4),
            "top_dependencies": top_dep[u],
            "redundancy_score": round(redundancy[u], 1),
            "vulnerability_class": cls,
        })
    critical = [a["iata"] for a in sorted(airports_out, key=lambda a: (-a["removal_reach_loss_pct"], -deg[a["iata"]], a["iata"]))[:25]]
    fragile_pool = [a for a in airports_out if deg[a["iata"]] <= 3]
    fragile = [a["iata"] for a in sorted(fragile_pool, key=lambda a: (-a["dependency_hhi"], -imp[a["iata"]], a["iata"]))[:50]]
    log("  HHI / redundancy / classes", t4)

    method = (
        f"Undirected route graph over the {n:,} forecast airports with >=1 route ({G.number_of_edges():,} edges): "
        "union of the (15-partner truncated) `routes` lists in forecasts.json and the full OpenFlights snapshot "
        "(data/inputs/routes.dat) restricted to these airports; the 706 airports without any route are excluded. "
        f"removal_reach_loss_pct = 100 x (pairs of other airports that become disconnected + pairs whose shortest "
        f"hop path lengthens by >=2) / pairs that were connected before removal. The hop-lengthening term is computed "
        f"exactly (all-pairs BFS on G minus v) for the top {len(top_exact)} airports by degree; for every other airport "
        "only the disconnection term is used (exact, via connected components of G minus v, non-zero only for "
        f"articulation points; {len(aps_set)} found). removal_disconnected_airports = airports cut off from the largest "
        "surviving piece of the airport's component. dependency_hhi = Herfindahl index of the airport's edge shares, "
        "share_j = importance_present(partner j) / sum over partners (1.0 = single partner). redundancy_score (0-100) = "
        "100 x [0.5 x min(alt, 6)/6 + 0.5 x percentile rank of 2-hop reach share], where alt = number of neighbours that "
        "remain attached to the largest surviving component when the airport is removed (each is an edge-disjoint path "
        "into the core) and 2-hop reach share = share of all graph airports within 2 hops. vulnerability_class: "
        f"fragile if dependency_hhi >= 75th percentile ({hhi_q75:.3f}) and degree <= 3; robust if redundancy_score >= "
        f"60th percentile ({red_q60:.1f}); otherwise watch. critical_hubs = top 25 by removal_reach_loss_pct; "
        "fragile_spokes = airports with degree <= 3 sorted by dependency_hhi (ties by importance_present). Projected "
        "network_stats (h5/h10) hold the topology constant: avg_degree and density use edge weights "
        "sqrt(level_u/present_u x level_v/present_v) (every present weight = 1), avg_clustering is the mean node "
        "clustering coefficient weighted by projected level (plain mean for present), and top_betweenness at every "
        f"horizon uses path length 1/(score_u x score_v / 1e4) with score = importance_present / level_h5 / "
        f"level_h10_damped, k={BETWEENNESS_SAMPLE_K} sampled sources (seed 42), so the three lists are directly comparable."
    )
    clustering = nx.clustering(G)
    net = {
        "present": network_block(G, None, bc_results["present"], clustering=clustering),
        "h5": network_block(G, "w5", bc_results["h5"], node_level=lvl5, clustering=clustering),
        "h10": network_block(G, "w10", bc_results["h10"], node_level=lvl10, clustering=clustering),
    }
    res = {"method": method, "airports": airports_out, "critical_hubs": critical, "fragile_spokes": fragile}
    return net, res


# --------------------------------------------------------------------------------------
# 5. scenario surrogate
# --------------------------------------------------------------------------------------
def scenario_block(mt: pd.DataFrame, ap: pd.DataFrame) -> dict:
    import importlib.util
    spec = importlib.util.spec_from_file_location("h10s", ROOT / "scripts" / "05_horizon10_shrinkage.py")
    h10s = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(h10s)
    feats = h10s.ALL_FEATURES

    units = {}
    for f in feats:
        if f in h10s.GROWTH_COLS or f == "opensky_growth_recent":
            units[f] = "pct points of annual growth (+1 = +1pp)"
        elif f in h10s.LARGE_COLS:
            units[f] = "+1% of the raw value (log scale)"
        elif f == "imf_gdp_growth_pct":
            units[f] = "pct points of projected GDP growth"
        elif f in ("of_routes_total",):
            units[f] = "routes"
        elif f in ("of_top50_hub_links", "of_countries_reached"):
            units[f] = "links" if f == "of_top50_hub_links" else "countries"
        elif f in ("of_pagerank", "of_betweenness", "of_clustering", "of_intl_share"):
            units[f] = "+0.01 of the index (0-1)"
        elif f.endswith("_km"):
            units[f] = "+100 km"
        elif f == "un_median_age":
            units[f] = "years"
        elif f == "importance" or f.startswith("importance_momentum"):
            units[f] = "importance points"
        elif f == "recon_interval_width":
            units[f] = "importance points of interval width"
        elif f == "of_routes_weighted":
            units[f] = "weighted routes"
        else:
            units[f] = "0/1 flag"
    for stem, parts in COMPOSITES.items():
        units[stem] = "pct points applied simultaneously to " + ", ".join(parts)
    scale = {}
    for f in feats:
        if f in h10s.GROWTH_COLS or f == "opensky_growth_recent" or f in h10s.LARGE_COLS or f in ("of_pagerank", "of_betweenness", "of_clustering", "of_intl_share"):
            scale[f] = 0.01
        elif f.endswith("_km"):
            scale[f] = 100.0
        else:
            scale[f] = 1.0

    sens = {}
    for h in (5, 10):
        mask = mt[f"comparable_target_h{h}"] & ~mt[f"is_covid_target_h{h}"] & (mt["importance_confidence"] == "high")
        tr = mt[mask]
        X = h10s.prepare_ridge_matrix(tr, feats)
        y = tr[f"target_change_h{h}"].to_numpy(dtype=float)
        pipe = Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler()),
                         ("ridge", Ridge(alpha=100.0, random_state=SEED))])
        pipe.fit(X, y)
        coef = pipe.named_steps["ridge"].coef_
        std = pipe.named_steps["scaler"].scale_
        per_unit = coef / np.where(std > 0, std, np.nan)
        sens[h] = {f: (round(float(per_unit[i] * scale[f]), 5) if np.isfinite(per_unit[i]) else None)
                   for i, f in enumerate(feats)}
        # Composite: +1pp applied to the 1y/3y/5y (and IMF projected) growth terms together, because the
        # three horizons of the same driver are collinear and their individual partial effects offset.
        for stem, parts in COMPOSITES.items():
            sens[h][stem] = round(float(sum(sens[h][p] or 0.0 for p in parts)), 5)
        sens[h]["_n_train"] = len(tr)

    # Country shocks on the actual production h5 ensemble (non-linear): +2pp GDP growth applied to the
    # 1y/3y/5y growth features and the IMF projection for every airport of the country.
    shocks = []
    try:
        models = joblib.load(ROOT / "data" / "outputs" / "models" / "production_models_h5.joblib")
        rows = mt[(mt["year"] == AS_OF_YEAR) & mt["iata"].isin(ap["iata"])].copy()
        rows = h10s.prepare_model_features(rows)
        base = h10s.predict_change(models, rows)
        shocked = rows.copy()
        for c in ("gdp_growth_1y", "gdp_growth_3y", "gdp_growth_5y"):
            shocked[c] = shocked[c].fillna(0.0) + 0.02
        shocked["imf_gdp_growth_pct"] = shocked["imf_gdp_growth_pct"].fillna(0.0) + 2.0
        delta = h10s.predict_change(models, shocked) - base
        rows["delta"] = delta
        counts = rows["country_code"].value_counts()
        preferred = [c for c in ["IN", "BR", "ID", "NG", "DE"] if counts.get(c, 0) >= 10]
        extra = [c for c in counts.index if c not in preferred and counts[c] >= 10]
        for c in (preferred + extra)[:5]:
            sub = rows[rows["country_code"] == c]
            shocks.append({"country": c, "shock": "gdp_growth +2pp", "mean_delta_h5": round(float(sub["delta"].mean()), 3)})
    except Exception as exc:  # noqa: BLE001
        log(f"  WARNING country shocks skipped: {exc}")

    n5, n10 = sens[5].pop("_n_train"), sens[10].pop("_n_train")
    method = (
        "Linear surrogate: a standardised Ridge regression (alpha=100, median imputation, the notebook's "
        "log1p/clipping transforms) fitted on the production training slice (comparable, non-COVID, high-confidence "
        f"rows; n={n5:,} for h5, n={n10:,} for h10) predicting the 5-/10-year importance change from the 46 model "
        "features. Each sensitivity is coef / feature std, i.e. d(importance change, points) per unit of the feature, "
        "then rescaled to the unit stated in `units` (growth rates are stored as fractions, so x0.01 gives per "
        "percentage point; log1p features give per +1% of the raw value). Sensitivities are partial effects holding "
        "the other features fixed and are not causal; the 1y/3y/5y horizons of one driver are collinear, so read "
        "them jointly via the *_sustained composites (+1pp applied to all horizons of that driver at once). "
        "country_shock_examples instead use the shipped non-linear "
        "production h5 ensemble (LightGBM + Ridge): +2pp is added to gdp_growth_1y/3y/5y and imf_gdp_growth_pct for "
        "every airport of the country and the mean change in the predicted 5-year importance change is reported."
    )
    ordered5 = {f: sens[5][f] for f in SCENARIO_HEADLINE} | {f: v for f, v in sens[5].items() if f not in SCENARIO_HEADLINE}
    ordered10 = {f: sens[10][f] for f in SCENARIO_HEADLINE} | {f: v for f, v in sens[10].items() if f not in SCENARIO_HEADLINE}
    return {"method": method, "sensitivities_h5": ordered5, "sensitivities_h10": ordered10,
            "units": {f: units[f] for f in ordered5}, "country_shock_examples": shocks}


# --------------------------------------------------------------------------------------
# 6. world GeoJSON from TopoJSON (world-atlas@2.0.2, countries-110m.json)
# --------------------------------------------------------------------------------------
def topojson_to_geojson(topo: dict, object_name: str = "countries", precision: int = 3) -> dict:
    scale = topo.get("transform", {}).get("scale", [1.0, 1.0])
    translate = topo.get("transform", {}).get("translate", [0.0, 0.0])
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append([round(x * scale[0] + translate[0], precision), round(y * scale[1] + translate[1], precision)])
        arcs.append(pts)

    def ring(arc_ids):
        out = []
        for a in arc_ids:
            pts = arcs[a] if a >= 0 else arcs[~a][::-1]
            if out:
                pts = pts[1:]
            out.extend(pts)
        return out

    feats = []
    for g in topo["objects"][object_name]["geometries"]:
        t = g["type"]
        if t == "Polygon":
            coords = [ring(r) for r in g["arcs"]]
        elif t == "MultiPolygon":
            coords = [[ring(r) for r in poly] for poly in g["arcs"]]
        else:
            continue
        feats.append({"type": "Feature", "properties": {"name": g.get("properties", {}).get("name", "")},
                      "geometry": {"type": t, "coordinates": coords}})
    return {"type": "FeatureCollection", "features": feats}


def build_world_geojson(out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    topo = None
    env = os.environ.get("WORLD_ATLAS_TOPOJSON", "").strip()
    candidates = [p for p in ([Path(env)] if env else []) + [ROOT / "data" / "raw" / "world-atlas" / "countries-110m.json"]
                  if p.is_file()]
    if candidates:
        topo = json.loads(candidates[0].read_text(encoding="utf-8"))
    else:
        try:
            with tempfile.TemporaryDirectory() as td:
                subprocess.run(["npm", "pack", "world-atlas@2.0.2"], cwd=td, check=True, capture_output=True, timeout=120)
                tgz = next(Path(td).glob("world-atlas-*.tgz"))
                with tarfile.open(tgz) as tf:
                    member = tf.getmember("package/countries-110m.json")
                    topo = json.load(tf.extractfile(member))
        except Exception as exc:
            if out_path.exists():
                log(f"  world-atlas download unavailable ({type(exc).__name__}); keeping existing {out_path.name}")
                return
            raise RuntimeError("world-atlas@2.0.2 could not be fetched and no existing GeoJSON is present") from exc
    gj = topojson_to_geojson(topo, "countries", precision=3)
    out_path.write_text(json.dumps(gj, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    log(f"  wrote {out_path.relative_to(ROOT)}: {len(gj['features'])} features, {out_path.stat().st_size / 1024:.0f} KB")


# --------------------------------------------------------------------------------------
def main() -> int:
    T = time.time()
    t = time.time()
    log("04_build_intelligence: [1/7] loading inputs")
    fc_path = ROOT / "web" / "forecasts.json"
    fc = json.loads(fc_path.read_text(encoding="utf-8"))
    mt = pd.read_parquet(ROOT / "data" / "processed" / "model_table.parquet")
    panel = pd.read_parquet(ROOT / "data" / "processed" / "airport_year_panel.parquet",
                            columns=["iata", "year", "country_code", "continent", "imf_gdp_growth_pct",
                                     "wb_gdp_per_capita", "imf_gdp_per_capita_usd", "un_pop_thousands",
                                     "wb_population", "wb_tourism_arrivals", "un_median_age"])
    shrink = load_shrinkage()
    alpha = float(shrink["best_alpha"])
    continent_of = (panel.sort_values("year").dropna(subset=["continent"]).groupby("iata")["continent"].last().to_dict())
    log(f"  {len(fc['airports']):,} airports, alpha={alpha}", t)

    t = time.time()
    log("[2/7] ranks + damped horizon 10 -> forecasts.json")
    ranks = postprocess_forecasts(fc, alpha, continent_of)
    payload = json.dumps(fc, separators=(",", ":"), ensure_ascii=False)
    for p in (fc_path, ROOT / "data" / "outputs" / "forecasts.json"):
        p.write_text(payload, encoding="utf-8")
    log(f"  wrote forecasts.json x2 ({len(payload) / 1e6:.2f} MB)", t)

    ap = pd.DataFrame([{
        "iata": a["iata"], "name": a["name"], "country": a["country"], "continent": a["continent"],
        "importance_present": a["importance_present"],
        "change_h5": a["forecast_h5"]["change"], "level_h5": a["forecast_h5"]["level"], "class_h5": a["forecast_h5"]["class"],
        "change_h10": a["forecast_h10"]["change_damped"], "level_h10": a["forecast_h10"]["level_damped"],
        "class_h10": a["forecast_h10"]["class"],
    } for a in fc["airports"]])

    t = time.time()
    log("[3/7] countries / regions / rankings")
    names = country_names_for(sorted(ap["country"].unique()))
    macro = latest_macro(panel)
    countries, regions = build_groups(ap, macro, names)
    rankings = build_rankings(ap, ranks)
    log(f"  {len(countries)} countries, {len(regions)} regions", t)

    t = time.time()
    log("[4/7] network stats + resilience")
    net, res = compute_network_and_resilience(fc, ap)
    log("  network block done", t)

    t = time.time()
    log("[5/7] scenario surrogate")
    scen = scenario_block(mt, ap)
    log("  scenario done", t)

    t = time.time()
    log("[6/7] world GeoJSON")
    build_world_geojson(ROOT / "web" / "vendor" / "world-110m.geojson")

    t = time.time()
    log("[7/7] writing intelligence.json")
    out = {
        "generated_at": datetime.now(timezone.utc).date().isoformat(),
        "as_of_year": AS_OF_YEAR,
        "country_names": names,
        "continent_names": CONTINENT_NAMES,
        "airport_continent": {a["iata"]: a["continent"] for a in fc["airports"]},
        "countries": countries,
        "regions": regions,
        "rankings": rankings,
        "ranks": ranks,
        "network_stats": net,
        "resilience": res,
        "scenario": scen,
        "horizon10_shrinkage": {
            "alpha_grid": shrink["alpha_grid"],
            "mae_by_alpha": shrink["mae_by_alpha"],
            "best_alpha": shrink["best_alpha"],
            "persistence_mae": shrink["persistence_mae"],
            "best_mae": shrink["best_mae"],
            "note": shrink["note"],
        },
    }
    payload = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
    for p in (ROOT / "web" / "intelligence.json", ROOT / "data" / "outputs" / "intelligence.json"):
        p.write_text(payload, encoding="utf-8")
    log(f"  wrote intelligence.json x2 ({len(payload) / 1e6:.2f} MB)", t)
    log(f"done in {time.time() - T:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
