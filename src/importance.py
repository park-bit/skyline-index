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

    p = panel.copy()
    p.loc[p["country_code"] != "US", "faa_enplanements"] = np.nan
    has_obs = p["faa_enplanements"].notna() | p["eurostat_passengers"].notna()
    obs_iatas = set(p[has_obs]["iata"].unique())
    sched_iatas = set(p[p["scheduled_service"].fillna(False) == True]["iata"].unique())

    core_set = sorted(obs_iatas | sched_iatas)

    if len(core_set) > 0 and len(panel) > 50000:
        PROCESSED.mkdir(parents=True, exist_ok=True)
        pd.DataFrame({"iata": core_set}).to_parquet(cache_path, index=False)

    return core_set


def as_of_carry_forward(df, val_col, key_col, max_age=3):
    keys = df[[key_col, "year", val_col]].drop_duplicates().sort_values([key_col, "year"]).copy()
    keys["val_ffill"] = keys.groupby(key_col)[val_col].ffill()
    keys["year_valid"] = keys["year"].where(keys[val_col].notna())
    keys["last_yr"] = keys.groupby(key_col)["year_valid"].ffill()
    keys["age"] = keys["year"] - keys["last_yr"]
    keys["val_as_of"] = keys["val_ffill"].where(keys["age"] <= max_age, np.nan)
    merged = df[[key_col, "year"]].merge(keys[[key_col, "year", "val_as_of"]], on=[key_col, "year"], how="left")
    return merged["val_as_of"].values


def compute_network_component(panel, core_airports=None):
    if core_airports is None:
        core_airports = get_core_airports(panel)
    core_set = set(core_airports)

    net = pd.DataFrame(index=panel.index)
    has_net = panel["of_routes_total"].fillna(0) > 0

    core_mask = panel["iata"].isin(core_set) & has_net
    core_slice = panel[core_mask]

    for col in NETWORK_SUBWEIGHTS:
        src_col = "exp_" + col.replace("of_", "") if ("exp_" + col.replace("of_", "")) in panel.columns else col
        if src_col in panel.columns:
            ref_vals = np.sort(core_slice[core_slice["year"] == core_slice["year"].min()][src_col].dropna().values)
            if len(ref_vals) > 0:
                vals = panel[src_col].fillna(-1e9).values
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

    # Use reconstructed traffic table when available
    psgr = panel.get("traffic_recon", None)
    if psgr is None:
        tr_cache = PROCESSED / "traffic_reconstructed.parquet"
        if tr_cache.exists():
            tr_df = pd.read_parquet(tr_cache)
            p_m = panel[["iata", "year"]].merge(tr_df[["iata", "year", "traffic_recon"]], on=["iata", "year"], how="left")
            psgr = p_m["traffic_recon"]
        else:
            p_us = panel["country_code"] == "US"
            psgr = panel["eurostat_passengers"].fillna(panel["faa_enplanements"].where(p_us) * 2.0)

    mvmt = as_of_carry_forward(panel, "opensky_flights", "iata", max_age=3)

    traf_series = pd.Series(np.nan, index=panel.index)
    for yr, group in panel.groupby("year"):
        core_group = group[group["iata"].isin(core_set)]
        ref_psgr = np.sort(psgr.loc[core_group.index].dropna().values)
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


def compute_importance_index(panel, weights=(WEIGHT_NETWORK, WEIGHT_TRAFFIC, WEIGHT_MARKET), core_airports=None, n_mc=50, seed=42):
    w_net, w_traf, w_mkt = weights
    if core_airports is None:
        core_airports = get_core_airports(panel)
    core_set = set(core_airports)

    # Attach reconstructed tables if missing
    p = panel.copy()
    if "traffic_recon" not in p.columns:
        tr_cache = PROCESSED / "traffic_reconstructed.parquet"
        if tr_cache.exists():
            tr_df = pd.read_parquet(tr_cache)
            p = p.merge(tr_df[["iata", "year", "traffic_recon", "traffic_source"]], on=["iata", "year"], how="left")

    if "exp_routes_total" not in p.columns:
        net_cache = PROCESSED / "network_reconstructed.parquet"
        if net_cache.exists():
            net_df = pd.read_parquet(net_cache)
            p = p.merge(net_df[["iata", "year", "exp_routes_total", "exp_top50_hub_links", "exp_countries_reached", "exp_pagerank", "std_pagerank"]], on=["iata", "year"], how="left")

    # Determine data_quality
    has_obs_traf = (
        (p["eurostat_passengers"].notna() & (p["eurostat_passengers"] > 0))
        | ((p["country_code"] == "US") & p["faa_enplanements"].notna() & (p["faa_enplanements"] > 0))
    )
    is_obs = has_obs_traf | (p.get("traffic_source", "") == "observed")
    has_recon_traf = p.get("traffic_recon", pd.Series(np.nan, index=p.index)).notna() & (p.get("traffic_recon", 0) > 0)
    data_quality = np.where(is_obs, "observed", np.where(has_recon_traf, "reconstructed", "static_only"))

    net_score = compute_network_component(p, core_airports=core_airports)
    traf_score = compute_traffic_component(p, core_airports=core_airports)
    mkt_score = compute_market_component(p, core_airports=core_airports)

    has_traffic = traf_score.notna() & (data_quality != "static_only")
    has_obs_traffic = (data_quality == "observed") & traf_score.notna()

    present = [
        net_score.notna().astype(int),
        has_obs_traffic.astype(int),
        pd.Series(mkt_score, index=p.index).notna().astype(int),
    ]
    components_used = sum(present)
    mkt_series = pd.Series(mkt_score, index=p.index)

    static_w = (net_score.notna().astype(float) * w_net) + (mkt_series.notna().astype(float) * w_mkt)
    static_val = (net_score.fillna(0.0) * w_net) + (mkt_series.fillna(0.0) * w_mkt)
    static_raw = np.where(static_w > 0, static_val / np.maximum(static_w, 1e-9), np.nan)

    full_w = static_w + w_traf
    full_val = static_val + (traf_score.fillna(0.0) * w_traf)
    full_raw = np.where(full_w > 0, full_val / np.maximum(full_w, 1e-9), np.nan)

    raw_score = np.where(has_traffic, full_raw, static_raw)
    raw_score = np.where(components_used > 0, raw_score, np.nan)

    res = p.copy()
    res["importance_raw"] = raw_score
    res["components_used"] = components_used
    res["data_quality"] = data_quality

    imp = pd.Series(np.nan, index=p.index)
    imp_lo = pd.Series(np.nan, index=p.index)
    imp_hi = pd.Series(np.nan, index=p.index)

    rng = np.random.RandomState(seed)

    for yr, group in res.groupby("year"):
        core_group = group[group["iata"].isin(core_set)]
        ref_raw = np.sort(core_group["importance_raw"].dropna().values)
        if len(ref_raw) > 0:
            vals = group["importance_raw"].fillna(-1e9).values
            pct = np.searchsorted(ref_raw, vals, side="right") / len(ref_raw) * 100.0
            pct = np.where(group["importance_raw"].isna(), np.nan, pct)
            imp.loc[group.index] = pct

            # Monte Carlo spread for reconstructed rows
            is_recon = group["data_quality"] == "reconstructed"
            recon_idx = group[is_recon].index

            if len(recon_idx) > 0 and n_mc > 0:
                recon_raw = vals[is_recon.values]
                mc_draws = np.zeros((n_mc, len(recon_raw)))
                for m in range(n_mc):
                    pert = rng.normal(0.0, 3.5, size=len(recon_raw))
                    draw_raw = np.clip(recon_raw + pert, 0.0, 100.0)
                    mc_draws[m, :] = np.searchsorted(ref_raw, draw_raw, side="right") / len(ref_raw) * 100.0

                lo_vals = np.clip(np.percentile(mc_draws, 10, axis=0), 0.0, pct[is_recon.values])
                hi_vals = np.clip(np.percentile(mc_draws, 90, axis=0), pct[is_recon.values], 100.0)

                imp_lo.loc[recon_idx] = lo_vals
                imp_hi.loc[recon_idx] = hi_vals

            # For observed rows, interval matches point value
            obs_idx = group[group["data_quality"] == "observed"].index
            imp_lo.loc[obs_idx] = pct[group["data_quality"] == "observed"]
            imp_hi.loc[obs_idx] = pct[group["data_quality"] == "observed"]

            # For static_only rows, narrow baseline spread
            static_idx = group[group["data_quality"] == "static_only"].index
            imp_lo.loc[static_idx] = np.maximum(0.0, pct[group["data_quality"] == "static_only"] - 2.0)
            imp_hi.loc[static_idx] = np.minimum(100.0, pct[group["data_quality"] == "static_only"] + 2.0)

    res["importance"] = imp
    res["importance_lo"] = imp_lo
    res["importance_hi"] = imp_hi
    res["importance_confidence"] = np.where(res["iata"].isin(core_set), "high", "low")
    return res


def run_sensitivity_analysis(panel, n_trials=25, seed=42, core_airports=None):
    np.random.seed(seed)
    if core_airports is None:
        core_airports = get_core_airports(panel)

    base_w = (WEIGHT_NETWORK, WEIGHT_TRAFFIC, WEIGHT_MARKET)
    base_panel = compute_importance_index(panel, weights=base_w, core_airports=core_airports, n_mc=0)

    valid_mask = base_panel["components_used"] >= 2
    base_valid = base_panel[valid_mask]

    records = []
    for trial in range(n_trials):
        pert = np.random.uniform(-0.15, 0.15, size=3)
        w = np.clip(np.array(base_w) + pert, 0.02, 0.90)
        w = tuple(w / w.sum())

        trial_panel = compute_importance_index(panel, weights=w, core_airports=core_airports, n_mc=0)
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
