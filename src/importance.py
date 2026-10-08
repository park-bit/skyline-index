import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from src.config import (
    WEIGHT_NETWORK,
    WEIGHT_TRAFFIC,
    WEIGHT_MARKET,
    NETWORK_SUBWEIGHTS,
    MARKET_SUBWEIGHTS,
    SENSITIVITY_SPEARMAN_THRESHOLD,
)


def compute_network_component(panel):
    net = pd.DataFrame(index=panel.index)
    has_net = panel["of_routes_total"].notna() & (panel["of_routes_total"] > 0)

    for col in NETWORK_SUBWEIGHTS:
        if col in panel.columns:
            s = panel[col].where(has_net)
            net[col + "_pct"] = s.groupby(panel["year"]).transform(
                lambda x: x.rank(pct=True) * 100.0
            )

    sub_weights = NETWORK_SUBWEIGHTS
    tot_weight = sum(sub_weights.values())
    score = sum(net[c + "_pct"] * w for c, w in sub_weights.items()) / tot_weight
    return score.where(has_net)


def compute_market_component(panel):
    mkt = pd.DataFrame(index=panel.index)
    mkt["city_pop"] = panel[["nearest_large_city_pop", "catchment_pop_100km"]].max(axis=1)

    country_gdp = panel["wb_gdp_usd"].fillna(
        panel["imf_gdp_per_capita_usd"] * panel["imf_population_millions"]
    )
    mkt["country_gdp"] = country_gdp

    gdp_pcap = panel["wb_gdp_per_capita"].fillna(panel["imf_gdp_per_capita_usd"])
    mkt["gdp_per_capita"] = gdp_pcap

    # Forward fill tourism by country across time to preserve coverage during reporting lags.
    tour_country = (
        panel.dropna(subset=["wb_tourism_arrivals"])
        .sort_values("year")
        .groupby("country_code")["wb_tourism_arrivals"]
        .last()
        .to_dict()
    )
    mkt["tourism"] = panel["wb_tourism_arrivals"].fillna(panel["country_code"].map(tour_country))

    pct_cols = {}
    for col, w in MARKET_SUBWEIGHTS.items():
        if col in mkt.columns:
            pct_cols[col] = mkt[col].groupby(panel["year"]).transform(
                lambda s: s.rank(pct=True) * 100.0
            )

    weighted_sum = sum(pct_cols[col] * w for col, w in MARKET_SUBWEIGHTS.items() if col in pct_cols)
    tot_weight = sum(w for col, w in MARKET_SUBWEIGHTS.items() if col in pct_cols)
    return weighted_sum / tot_weight


def compute_traffic_component(panel):
    psgr = panel["eurostat_passengers"].fillna(
        panel["faa_enplanements"].where(panel["country_code"] == "US") * 2.0
    )

    latest_os = (
        panel.dropna(subset=["opensky_flights"])
        .sort_values("year")
        .groupby("iata")["opensky_flights"]
        .last()
        .to_dict()
    )
    movements = panel["opensky_flights"].fillna(panel["iata"].map(latest_os))

    psgr_pct = psgr.groupby(panel["year"]).transform(
        lambda s: s.rank(pct=True) * 100.0
    )
    mvmt_pct = movements.groupby(panel["year"]).transform(
        lambda s: s.rank(pct=True) * 100.0
    )

    traffic_score = psgr_pct.fillna(mvmt_pct)
    return traffic_score


def compute_importance_index(panel, weights=(WEIGHT_NETWORK, WEIGHT_TRAFFIC, WEIGHT_MARKET)):
    w_net, w_traf, w_mkt = weights

    net_score = compute_network_component(panel)
    traf_score = compute_traffic_component(panel)
    mkt_score = compute_market_component(panel)

    components = [net_score, traf_score, mkt_score]
    base_weights = [w_net, w_traf, w_mkt]

    present = [c.notna().astype(float) for c in components]
    components_used = sum(present).astype(int)

    weighted_components = sum(c.fillna(0.0) * w for c, w in zip(components, base_weights))
    sum_weights = sum(p * w for p, w in zip(present, base_weights))

    raw_score = np.where(components_used > 0, weighted_components / np.maximum(sum_weights, 1e-9), np.nan)

    res = panel.copy()
    res["importance_raw"] = raw_score
    res["components_used"] = components_used

    # Final importance index scaled to 0 to 100 percentile rank within each year.
    res["importance"] = res.groupby("year")["importance_raw"].transform(
        lambda s: s.rank(pct=True) * 100.0
    )
    return res


def run_sensitivity_analysis(panel, n_trials=25, seed=42):
    np.random.seed(seed)
    base_w = (WEIGHT_NETWORK, WEIGHT_TRAFFIC, WEIGHT_MARKET)
    base_panel = compute_importance_index(panel, weights=base_w)

    # Evaluate sensitivity on commercial airports with network data.
    valid_mask = base_panel["components_used"] >= 2
    base_valid = base_panel[valid_mask]

    records = []
    for trial in range(n_trials):
        pert = np.random.uniform(-0.15, 0.15, size=3)
        w = np.array(base_w) + pert
        w = np.clip(w, 0.02, 0.90)
        w = tuple(w / w.sum())

        trial_panel = compute_importance_index(panel, weights=w)
        trial_valid = trial_panel[valid_mask]

        year_corrs = []
        for yr, group in trial_valid.groupby("year"):
            base_group = base_valid[base_valid["year"] == yr]
            corr, _ = spearmanr(base_group["importance"], group["importance"])
            year_corrs.append(corr)

        records.append({
            "trial": trial + 1,
            "weight_network": round(w[0], 3),
            "weight_traffic": round(w[1], 3),
            "weight_market": round(w[2], 3),
            "mean_spearman": round(float(np.mean(year_corrs)), 4),
            "min_spearman": round(float(np.min(year_corrs)), 4),
        })

    return pd.DataFrame(records)
