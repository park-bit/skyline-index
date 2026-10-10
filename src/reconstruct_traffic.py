import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor

FEATURE_COLS = [
    "log_city_pop",
    "log_catchment_pop",
    "log_runway",
    "is_large",
    "is_medium",
    "is_small",
    "scheduled",
    "log_opensky_flights",
    "opensky_dest",
    "log_routes",
    "log_dist_city",
    "log_gdp_pc",
]


def extract_features(df):
    f = pd.DataFrame(index=df.index)
    f["log_city_pop"] = np.log1p(df["nearest_large_city_pop"].fillna(0))
    f["log_catchment_pop"] = np.log1p(df["catchment_pop_100km"].fillna(0))
    f["log_runway"] = np.log1p(df["max_runway_ft"].fillna(3000))
    f["is_large"] = (df["airport_type"] == "large_airport").astype(float)
    f["is_medium"] = (df["airport_type"] == "medium_airport").astype(float)
    f["is_small"] = (df["airport_type"] == "small_airport").astype(float)
    f["scheduled"] = df["scheduled_service"].fillna(False).astype(float)
    f["log_opensky_flights"] = np.log1p(df["opensky_flights"].fillna(0))
    f["opensky_dest"] = df["opensky_destinations"].fillna(0).astype(float)
    f["log_routes"] = np.log1p(df["of_routes_total"].fillna(0))
    f["log_dist_city"] = np.log1p(df["nearest_large_city_km"].fillna(50))
    f["log_gdp_pc"] = np.log1p(df["imf_gdp_per_capita_usd"].fillna(10000))
    return f


def calibrate_anchor_scale(panel):
    p = panel.copy()
    p.loc[p["country_code"] != "US", "faa_enplanements"] = np.nan
    obs = pd.Series(np.nan, index=p.index)
    is_us = (p["country_code"] == "US") & p["faa_enplanements"].notna()
    obs.loc[is_us] = p.loc[is_us, "faa_enplanements"] * 2.0
    is_eu = p["eurostat_passengers"].notna()
    obs.loc[is_eu] = p.loc[is_eu, "eurostat_passengers"]
    p["obs_passengers"] = obs

    valid = p[p["obs_passengers"].notna() & (p["obs_passengers"] > 100)]
    grp = valid.groupby(["country_code", "year"]).agg(
        airport_sum=("obs_passengers", "sum"),
        wb_passengers=("wb_air_passengers", "first"),
    ).reset_index()
    grp = grp[grp["wb_passengers"].notna() & (grp["wb_passengers"] > 1e4)]
    grp["ratio"] = grp["airport_sum"] / grp["wb_passengers"]

    country_ratios = grp.groupby("country_code")["ratio"].median().to_dict()
    global_median = float(grp["ratio"].median()) if len(grp) > 0 else 2.15
    return country_ratios, global_median


def build_traffic_share_model(panel, seed=42):
    p = panel.copy()
    p.loc[p["country_code"] != "US", "faa_enplanements"] = np.nan
    obs = pd.Series(np.nan, index=p.index)
    is_us = (p["country_code"] == "US") & p["faa_enplanements"].notna()
    obs.loc[is_us] = p.loc[is_us, "faa_enplanements"] * 2.0
    is_eu = p["eurostat_passengers"].notna()
    obs.loc[is_eu] = p.loc[is_eu, "eurostat_passengers"]
    p["obs_passengers"] = obs

    train_rows = p[p["obs_passengers"].notna() & (p["obs_passengers"] > 100)].copy()
    c_totals = train_rows.groupby(["country_code", "year"])["obs_passengers"].transform("sum")
    train_rows["share"] = train_rows["obs_passengers"] / c_totals
    train_rows["log_share"] = np.log(np.clip(train_rows["share"], 1e-6, 1.0))

    x_feat = extract_features(train_rows)
    y_target = train_rows["log_share"]

    # Calibration slice: reserve 20 percent of training countries for conformal bounds
    countries = train_rows["country_code"].unique()
    rng = np.random.RandomState(seed)
    cal_countries = rng.choice(countries, size=max(1, int(len(countries) * 0.20)), replace=False)

    fit_mask = ~train_rows["country_code"].isin(cal_countries)
    cal_mask = train_rows["country_code"].isin(cal_countries)

    model = LGBMRegressor(n_estimators=120, max_depth=5, num_leaves=31, random_state=seed, verbose=-1)
    model.fit(x_feat[fit_mask], y_target[fit_mask])

    cal_df = train_rows[cal_mask].copy()
    cal_feat = x_feat[cal_mask]
    cal_df["pred_score"] = np.exp(model.predict(cal_feat))
    c_pred_totals = cal_df.groupby(["country_code", "year"])["pred_score"].transform("sum")
    cal_df["pred_share"] = cal_df["pred_score"] / c_pred_totals
    cal_df["pred_traffic"] = cal_df["pred_share"] * cal_df.groupby(["country_code", "year"])["obs_passengers"].transform("sum")

    # Residual on log scale for conformal interval
    res = np.abs(np.log1p(cal_df["obs_passengers"]) - np.log1p(cal_df["pred_traffic"]))
    calib_q = float(np.quantile(res, 0.80))

    return model, calib_q


def reconstruct_airport_traffic(panel, model=None, calib_q=None, anchor_ratios=None, global_median=None, seed=42):
    if model is None or calib_q is None:
        model, calib_q = build_traffic_share_model(panel, seed=seed)

    if anchor_ratios is None or global_median is None:
        anchor_ratios, global_median = calibrate_anchor_scale(panel)

    p = panel.copy()
    p.loc[p["country_code"] != "US", "faa_enplanements"] = np.nan
    obs = pd.Series(np.nan, index=p.index)
    is_us = (p["country_code"] == "US") & p["faa_enplanements"].notna()
    obs.loc[is_us] = p.loc[is_us, "faa_enplanements"] * 2.0
    is_eu = p["eurostat_passengers"].notna()
    obs.loc[is_eu] = p.loc[is_eu, "eurostat_passengers"]

    x_feat = extract_features(p)
    raw_scores = np.exp(model.predict(x_feat))
    p["model_raw_score"] = raw_scores

    # Anchored country total
    # Use observed country ratio when available, otherwise calibrated global scale
    scale_factor = p["country_code"].map(anchor_ratios).fillna(global_median)
    anchored_country_total = p["wb_air_passengers"].fillna(0) * scale_factor

    # Only allocate share to commercial, scheduled, or route-active airports
    is_allocable = (
        (p["airport_type"].isin(["large_airport", "medium_airport"]))
        | (p["scheduled_service"].fillna(False))
        | (p["of_routes_total"].fillna(0) > 0)
        | (p["opensky_flights"].fillna(0) > 0)
    )
    p["alloc_score"] = np.where(is_allocable, p["model_raw_score"], 1e-4)

    group_sums = p.groupby(["country_code", "year"])["alloc_score"].transform("sum")
    pred_share = p["alloc_score"] / np.maximum(group_sums, 1e-9)

    pred_traffic = pred_share * anchored_country_total

    has_obs = obs.notna() & (obs > 0)

    traffic_recon = np.where(has_obs, obs, pred_traffic)
    traffic_source = np.where(has_obs, "observed", "reconstructed")

    # Conformal bounds
    lo = np.where(has_obs, obs, np.maximum(0.0, pred_traffic * np.exp(-calib_q)))
    hi = np.where(has_obs, obs, pred_traffic * np.exp(calib_q))

    p["traffic_recon"] = np.round(traffic_recon, 1)
    p["traffic_recon_lo"] = np.round(lo, 1)
    p["traffic_recon_hi"] = np.round(hi, 1)
    p["traffic_source"] = traffic_source
    p["traffic_share"] = pred_share

    return p[["iata", "year", "traffic_recon", "traffic_recon_lo", "traffic_recon_hi", "traffic_source", "traffic_share"]]
