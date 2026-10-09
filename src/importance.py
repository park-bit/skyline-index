import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from src.config import (
    MARKET_SUBWEIGHTS,
    NETWORK_SUBWEIGHTS,
    PROCESSED,
    WEIGHT_MARKET,
    WEIGHT_NETWORK,
    WEIGHT_TRAFFIC,
)


def get_core_airports(panel=None, min_traffic_years=2):
    cache_path = PROCESSED / "core_airports.parquet"
    if panel is None or len(panel) < 5000:
        if cache_path.exists():
            return pd.read_parquet(cache_path)["iata"].tolist()
        if panel is None:
            panel = pd.read_parquet(PROCESSED / "airport_year_panel.parquet")

    has_traffic = (
        panel["faa_enplanements"].notna()
        | panel["eurostat_passengers"].notna()
        | panel["opensky_flights"].notna()
    )
    traffic_years = panel[has_traffic].groupby("iata")["year"].nunique()

    has_net = panel["of_routes_total"].notna() & (panel["of_routes_total"] > 0)
    net_iatas = set(panel[has_net]["iata"].unique())

    has_mkt = (
        panel["nearest_large_city_pop"].notna() | panel["catchment_pop_100km"].notna()
    ) & (panel["wb_gdp_usd"].notna() | panel["imf_gdp_per_capita_usd"].notna())
    mkt_iatas = set(panel[has_mkt]["iata"].unique())

    core_set = sorted(set(traffic_years[traffic_years >= min_traffic_years].index) & net_iatas & mkt_iatas)

    if len(core_set) > 0 and len(panel) > 50000:
        PROCESSED.mkdir(parents=True, exist_ok=True)
        pd.DataFrame({"iata": core_set}).to_parquet(cache_path, index=False)

    return core_set


def as_of_carry_forward(df, val_col, key_col, max_age=3):
    keys = df[[key_col, "year", val_col]].drop_duplicates()
    lookup = []
    for k, group in keys.groupby(key_col):
        group = group.sort_values("year")
        last_val = np.nan
        last_yr = -9999
        for yr, v in zip(group["year"], group[val_col]):
            if pd.notna(v):
                last_val = v
                last_yr = yr
                lookup.append((k, yr, v))
            elif (yr - last_yr) <= max_age:
                lookup.append((k, yr, last_val))
            else:
                lookup.append((k, yr, np.nan))

    lookup_df = pd.DataFrame(lookup, columns=[key_col, "year", val_col + "_as_of"])
    merged = df[[key_col, "year"]].merge(lookup_df, on=[key_col, "year"], how="left")
    return merged[val_col + "_as_of"].values


def compute_network_component(panel, core_airports=None):
    if core_airports is None:
        core_airports = get_core_airports(panel)
    core_set = set(core_airports)

    net = pd.DataFrame(index=panel.index)
    has_net = panel["of_routes_total"].notna() & (panel["of_routes_total"] > 0)

    core_mask = panel["iata"].isin(core_set) & has_net
    core_slice = panel[core_mask]

    for col in NETWORK_SUBWEIGHTS:
        if col in panel.columns:
            # Using OpenFlights 2014 snapshot values from core airports keeps the denominator fixed
            ref_vals = np.sort(core_slice[core_slice["year"] == core_slice["year"].min()][col].dropna().values)
            if len(ref_vals) > 0:
                vals = panel[col].fillna(-1e9).values
                pct = np.searchsorted(ref_vals, vals, side="right") / len(ref_vals) * 100.0
                net[col + "_pct"] = np.where(has_net, pct, np.nan)
            else:
                net[col + "_pct"] = np.nan

    sub_weights = NETWORK_SUBWEIGHTS
    tot_weight = sum(sub_weights.values())
    score = sum(net[c + "_pct"] * w for c, w in sub_weights.items()) / tot_weight
    return score.where(has_net)


def compute_market_component(panel, core_airports=None):
    if core_airports is None:
        core_airports = get_core_airports(panel)
    core_set = set(core_airports)

    mkt = pd.DataFrame(index=panel.index)
    mkt["city_pop"] = panel[["nearest_large_city_pop", "catchment_pop_100km"]].max(axis=1)

    country_gdp = panel["wb_gdp_usd"].fillna(
        panel["imf_gdp_per_capita_usd"] * panel["imf_population_millions"]
    )
    mkt["country_gdp"] = country_gdp

    gdp_pcap = panel["wb_gdp_per_capita"].fillna(panel["imf_gdp_per_capita_usd"])
    mkt["gdp_per_capita"] = gdp_pcap

    # World Bank tourism reports with publication lags so trailing 3-year carry-forward is applied
    mkt["tourism"] = as_of_carry_forward(panel, "wb_tourism_arrivals", "country_code", max_age=3)

    pct_cols = {}
    for col in MARKET_SUBWEIGHTS:
        pct_series = pd.Series(np.nan, index=panel.index)
        for yr, group in panel.groupby("year"):
            core_group = group[group["iata"].isin(core_set)]
            ref_vals = np.sort(mkt.loc[core_group.index, col].dropna().values)
            if len(ref_vals) > 0:
                vals = mkt.loc[group.index, col].fillna(-1e9).values
                pct = np.searchsorted(ref_vals, vals, side="right") / len(ref_vals) * 100.0
                pct = np.where(mkt.loc[group.index, col].isna(), np.nan, pct)
                pct_series.loc[group.index] = pct
        pct_cols[col] = pct_series

    mkt_weights_sum = pd.Series(0.0, index=panel.index)
    mkt_weighted_sum = pd.Series(0.0, index=panel.index)
    for col, w in MARKET_SUBWEIGHTS.items():
        mkt_weighted_sum += pct_cols[col].fillna(0.0) * w
        mkt_weights_sum += pct_cols[col].notna().astype(float) * w

    return np.where(mkt_weights_sum > 0, mkt_weighted_sum / mkt_weights_sum, np.nan)


def compute_traffic_component(panel, core_airports=None):
    if core_airports is None:
        core_airports = get_core_airports(panel)
    core_set = set(core_airports)

    psgr = panel["eurostat_passengers"].fillna(
        panel["faa_enplanements"].where(panel["country_code"] == "US") * 2.0
    )
    # OpenSky flights only count in observed years or as-of carry forward up to 3 years
    mvmt = as_of_carry_forward(panel, "opensky_flights", "iata", max_age=3)

    traf_series = pd.Series(np.nan, index=panel.index)
    for yr, group in panel.groupby("year"):
        core_group = group[group["iata"].isin(core_set)]
        core_psgr = core_group["eurostat_passengers"].fillna(
            core_group["faa_enplanements"].where(core_group["country_code"] == "US") * 2.0
        )
        ref_psgr = np.sort(core_psgr.dropna().values)
        ref_mvmt = np.sort(pd.Series(mvmt, index=panel.index).loc[core_group.index].dropna().values)

        p_vals = psgr.loc[group.index].fillna(-1e9).values
        if len(ref_psgr) > 0:
            p_pct = np.searchsorted(ref_psgr, p_vals, side="right") / len(ref_psgr) * 100.0
            p_pct = np.where(psgr.loc[group.index].isna(), np.nan, p_pct)
        else:
            p_pct = np.full(len(group), np.nan)

        m_vals = pd.Series(mvmt, index=panel.index).loc[group.index].fillna(-1e9).values
        if len(ref_mvmt) > 0:
            m_pct = np.searchsorted(ref_mvmt, m_vals, side="right") / len(ref_mvmt) * 100.0
            m_pct = np.where(pd.Series(mvmt, index=panel.index).loc[group.index].isna(), np.nan, m_pct)
        else:
            m_pct = np.full(len(group), np.nan)

        traf_series.loc[group.index] = pd.Series(p_pct, index=group.index).fillna(pd.Series(m_pct, index=group.index))

    return traf_series


def compute_importance_index(panel, weights=(WEIGHT_NETWORK, WEIGHT_TRAFFIC, WEIGHT_MARKET), core_airports=None):
    w_net, w_traf, w_mkt = weights
    if core_airports is None:
        core_airports = get_core_airports(panel)
    core_set = set(core_airports)

    net_score = compute_network_component(panel, core_airports=core_airports)
    traf_score = compute_traffic_component(panel, core_airports=core_airports)
    mkt_score = compute_market_component(panel, core_airports=core_airports)

    is_core = panel["iata"].isin(core_set)
    has_traffic = is_core & traf_score.notna()

    present = [
        net_score.notna().astype(int),
        has_traffic.astype(int),
        pd.Series(mkt_score, index=panel.index).notna().astype(int),
    ]
    components_used = sum(present)

    mkt_series = pd.Series(mkt_score, index=panel.index)

    static_w = (net_score.notna().astype(float) * w_net) + (mkt_series.notna().astype(float) * w_mkt)
    static_val = (net_score.fillna(0.0) * w_net) + (mkt_series.fillna(0.0) * w_mkt)
    static_raw = np.where(static_w > 0, static_val / np.maximum(static_w, 1e-9), np.nan)

    full_w = static_w + w_traf
    full_val = static_val + (traf_score.fillna(0.0) * w_traf)
    full_raw = np.where(full_w > 0, full_val / np.maximum(full_w, 1e-9), np.nan)

    raw_score = np.where(has_traffic, full_raw, static_raw)
    raw_score = np.where(components_used > 0, raw_score, np.nan)

    res = panel.copy()
    res["importance_raw"] = raw_score
    res["components_used"] = components_used

    # Evaluating raw scores against the fixed core population keeps percentile ranks comparable across time
    imp = pd.Series(np.nan, index=panel.index)
    for yr, group in res.groupby("year"):
        core_group = group[group["iata"].isin(core_set)]
        ref_raw = np.sort(core_group["importance_raw"].dropna().values)
        if len(ref_raw) > 0:
            vals = group["importance_raw"].fillna(-1e9).values
            pct = np.searchsorted(ref_raw, vals, side="right") / len(ref_raw) * 100.0
            pct = np.where(group["importance_raw"].isna(), np.nan, pct)
            imp.loc[group.index] = pct

    res["importance"] = imp
    res["importance_confidence"] = np.where(is_core, "high", "low")
    return res


def run_sensitivity_analysis(panel, n_trials=25, seed=42, core_airports=None):
    np.random.seed(seed)
    if core_airports is None:
        core_airports = get_core_airports(panel)

    base_w = (WEIGHT_NETWORK, WEIGHT_TRAFFIC, WEIGHT_MARKET)
    base_panel = compute_importance_index(panel, weights=base_w, core_airports=core_airports)

    valid_mask = base_panel["components_used"] >= 2
    base_valid = base_panel[valid_mask]

    records = []
    for trial in range(n_trials):
        pert = np.random.uniform(-0.15, 0.15, size=3)
        w = np.clip(np.array(base_w) + pert, 0.02, 0.90)
        w = tuple(w / w.sum())

        trial_panel = compute_importance_index(panel, weights=w, core_airports=core_airports)
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
