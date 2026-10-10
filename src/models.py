import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

NETWORK_FEATURES = [
    "of_routes_total", "of_routes_weighted", "of_pagerank", "of_betweenness",
    "of_clustering", "of_intl_share", "of_countries_reached", "of_top50_hub_links",
]
SPATIAL_FEATURES = [
    "nearest_large_city_km", "nearest_large_city_pop", "catchment_pop_100km",
    "dist_to_nearest_larger_hub_km", "dist_to_nearest_top50_hub_km",
]
TRAFFIC_FEATURES = [
    "traffic_volume", "traffic_growth_1y", "traffic_growth_3y", "traffic_growth_5y",
    "opensky_growth_recent",
]
MACRO_FEATURES = [
    "country_gdp", "country_pop", "gdp_growth_1y", "gdp_growth_3y", "gdp_growth_5y",
    "pop_growth_1y", "pop_growth_3y", "pop_growth_5y", "tourism_growth_1y",
    "tourism_growth_3y", "tourism_growth_5y", "wb_gdp_per_capita", "imf_gdp_growth_pct",
    "un_median_age",
]
MOMENTUM_FEATURES = [
    "importance", "importance_momentum_1y", "importance_momentum_3y", "importance_momentum_5y",
]
QUALITY_FEATURES = [
    "is_observed", "is_reconstructed", "is_static_only", "recon_interval_width",
]
REGION_FEATURES = [
    "region_NA", "region_EU", "region_AS", "region_SA", "region_AF", "region_OC",
]
BASE_FEATURES = (
    NETWORK_FEATURES + SPATIAL_FEATURES + TRAFFIC_FEATURES + MACRO_FEATURES + MOMENTUM_FEATURES
)
ALL_FEATURES = (
    BASE_FEATURES + QUALITY_FEATURES + REGION_FEATURES
)

CLASS_NAMES = ["declining", "emerging", "established_hub", "stable"]
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASS_NAMES)}
IDX_TO_CLASS = {i: c for i, c in enumerate(CLASS_NAMES)}


def prepare_model_features(df):
    d = df.copy()
    dq = d.get("data_quality", "static_only")
    if "is_observed" not in d.columns:
        d["is_observed"] = (dq == "observed").astype(float)
    if "is_reconstructed" not in d.columns:
        d["is_reconstructed"] = (dq == "reconstructed").astype(float)
    if "is_static_only" not in d.columns:
        d["is_static_only"] = (dq == "static_only").astype(float)
    if "recon_interval_width" not in d.columns:
        lo = d.get("importance_lo", 0.0)
        hi = d.get("importance_hi", 0.0)
        diff = (pd.Series(hi, index=d.index) - pd.Series(lo, index=d.index)).clip(lower=0.0).fillna(0.0)
        d["recon_interval_width"] = diff
    for c in ["NA", "EU", "AS", "SA", "AF", "OC"]:
        col = f"region_{c}"
        if col not in d.columns:
            d[col] = (d.get("continent", "") == c).astype(float)
    return d


def prepare_ridge_matrix(df, features):
    d = prepare_model_features(df)[features].copy()
    large_cols = [
        "traffic_volume",
        "country_gdp",
        "country_pop",
        "nearest_large_city_pop",
        "catchment_pop_100km",
        "wb_gdp_per_capita",
    ]
    for c in large_cols:
        if c in d.columns:
            d[c] = np.log1p(np.maximum(0, d[c].fillna(0)))
    growth_cols = [
        "traffic_growth_1y",
        "traffic_growth_3y",
        "traffic_growth_5y",
        "gdp_growth_1y",
        "gdp_growth_3y",
        "gdp_growth_5y",
        "pop_growth_1y",
        "pop_growth_3y",
        "pop_growth_5y",
        "tourism_growth_1y",
        "tourism_growth_3y",
        "tourism_growth_5y",
    ]
    for c in growth_cols:
        if c in d.columns:
            d[c] = np.clip(d[c], -1.0, 10.0)
    for c in d.columns:
        if d[c].isna().all():
            d[c] = 0.0
    return d


def train_models(X_train, y_train, features, seed=42, cal_slice=None, cal_y=None, alpha=0.20):
    X_tr = prepare_model_features(X_train)
    lgb_reg = lgb.LGBMRegressor(
        n_estimators=100,
        learning_rate=0.03,
        max_depth=5,
        num_leaves=31,
        random_state=seed,
        verbose=-1,
        n_jobs=-1,
    )
    lgb_reg.fit(X_tr[features], y_train)

    X_ridge = prepare_ridge_matrix(X_tr, features)
    ridge_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("ridge", Ridge(alpha=100.0, random_state=seed)),
    ])
    ridge_pipe.fit(X_ridge, y_train)

    q10 = lgb.LGBMRegressor(
        objective="quantile",
        alpha=0.10,
        n_estimators=100,
        learning_rate=0.03,
        max_depth=5,
        num_leaves=31,
        random_state=seed,
        verbose=-1,
        n_jobs=-1,
    )
    q90 = lgb.LGBMRegressor(
        objective="quantile",
        alpha=0.90,
        n_estimators=100,
        learning_rate=0.03,
        max_depth=5,
        num_leaves=31,
        random_state=seed,
        verbose=-1,
        n_jobs=-1,
    )
    q10.fit(X_tr[features], y_train)
    q90.fit(X_tr[features], y_train)

    conformal_offset = 0.0
    if cal_slice is not None and cal_y is not None and len(cal_slice) > 0:
        cal_p = prepare_model_features(cal_slice)
        cur = cal_p["importance"].values
        y_lvl = cur + cal_y.values
        p10_c = q10.predict(cal_p[features])
        p90_c = q90.predict(cal_p[features])
        recon_w = cal_p.get("recon_interval_width", pd.Series(0.0, index=cal_p.index)).fillna(0.0).values
        recon_half = np.maximum(0.0, recon_w / 2.0)
        b_low_c = np.clip(cur + p10_c - recon_half, 0.0, 100.0)
        b_high_c = np.clip(cur + p90_c + recon_half, 0.0, 100.0)
        s_i = np.maximum(b_low_c - y_lvl, y_lvl - b_high_c)
        conformal_offset = float(np.quantile(s_i, 1.0 - alpha, method="higher"))

    return {
        "lgb": lgb_reg,
        "ridge": ridge_pipe,
        "q10": q10,
        "q90": q90,
        "features": features,
        "conformal_offset": conformal_offset,
    }


def predict_ensemble(models, X, current_importance, damped_factor=1.0):
    features = models["features"]
    X_p = prepare_model_features(X)
    p_lgb = models["lgb"].predict(X_p[features])
    X_ridge = prepare_ridge_matrix(X_p, features)
    p_ridge = models["ridge"].predict(X_ridge)
    p_ens = (0.5 * p_lgb + 0.5 * p_ridge) * damped_factor

    p10 = models["q10"].predict(X_p[features])
    p90 = models["q90"].predict(X_p[features])

    level = np.clip(current_importance + p_ens, 0.0, 100.0)

    b_low_raw = np.clip(current_importance + p10, 0.0, 100.0)
    b_high_raw = np.clip(current_importance + p90, 0.0, 100.0)

    c_off = models.get("conformal_offset", 0.0)
    recon_w = X_p.get("recon_interval_width", pd.Series(0.0, index=X_p.index)).fillna(0.0).values
    recon_half = np.maximum(0.0, recon_w / 2.0)

    b_low_cal = np.clip(b_low_raw - recon_half - c_off, 0.0, 100.0)
    b_high_cal = np.clip(b_high_raw + recon_half + c_off, 0.0, 100.0)

    band_low = np.minimum(b_low_cal, level)
    band_high = np.maximum(b_high_cal, level)

    return {
        "pred_change": p_ens,
        "pred_level": level,
        "band_low": band_low,
        "band_high": band_high,
        "band_low_raw": np.minimum(b_low_raw, level),
        "band_high_raw": np.maximum(b_high_raw, level),
        "pred_lgb_change": p_lgb,
        "pred_ridge_change": p_ridge,
    }


def find_damping_factor(models, cal_slice, cal_y_change):
    features = models["features"]
    cal_p = prepare_model_features(cal_slice)
    p_lgb = models["lgb"].predict(cal_p[features])
    X_ridge = prepare_ridge_matrix(cal_p, features)
    p_ridge = models["ridge"].predict(X_ridge)
    p_raw = 0.5 * p_lgb + 0.5 * p_ridge

    y_act = cal_y_change.values
    best_gamma = 1.0
    best_mae = float("inf")
    for gamma in [0.0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]:
        mae = np.mean(np.abs(y_act - (p_raw * gamma)))
        if mae < best_mae:
            best_mae = mae
            best_gamma = gamma
    return best_gamma


def run_region_transfer_experiment(df, held_out_continent="EU", seed=42):
    from src.baselines import evaluate_mover_metrics

    train_years = list(range(2000, 2014))
    test_year = 2018

    train_pool = df[
        df["year"].isin(train_years)
        & (df["continent"] != held_out_continent)
        & df["comparable_target_h5"]
        & ~df["is_covid_target_h5"]
        & (df["importance_confidence"] == "high")
    ].copy()

    test_real = df[
        (df["year"] == test_year)
        & (df["continent"] == held_out_continent)
        & df["comparable_target_h5"]
        & ~df["is_covid_target_h5"]
        & (df["importance_confidence"] == "high")
    ].copy()

    act_change = test_real["target_change_h5"].values
    act_level = test_real["target_level_h5"].values
    cur_imp = test_real["importance"].values

    test_sim = test_real.copy()
    test_sim["is_observed"] = 0.0
    test_sim["is_reconstructed"] = 1.0
    test_sim["data_quality"] = "reconstructed"
    if "traffic_recon" in test_sim.columns:
        test_sim["traffic_volume"] = test_sim["traffic_recon"]

    m_global = train_models(train_pool, train_pool["target_change_h5"], BASE_FEATURES, seed=seed)
    pred_global = predict_ensemble(m_global, test_sim, cur_imp)

    m_reg = train_models(train_pool, train_pool["target_change_h5"], ALL_FEATURES, seed=seed)
    pred_reg = predict_ensemble(m_reg, test_sim, cur_imp)

    dev_train = train_pool[train_pool["continent"].isin(["AS", "SA", "AF", "OC"])].copy()
    if len(dev_train) > 100:
        m_fine = train_models(dev_train, dev_train["target_change_h5"], BASE_FEATURES, seed=seed)
        pred_fine = predict_ensemble(m_fine, test_sim, cur_imp)
    else:
        pred_fine = pred_global

    pred_real = predict_ensemble(m_global, test_real, cur_imp)

    options = {
        "global_model": pred_global,
        "global_plus_region_effects": pred_reg,
        "fine_tuned_regions": pred_fine,
        "observed_benchmark": pred_real,
    }

    results = []
    for opt_name, p in options.items():
        mae = float(np.mean(np.abs(act_change - p["pred_change"])))
        sp, _ = spearmanr(act_level, p["pred_level"])
        movers = evaluate_mover_metrics(pd.Series(act_change, index=test_real.index), pd.Series(p["pred_change"], index=test_real.index))
        results.append({
            "option": opt_name,
            "held_out_region": held_out_continent,
            "n_test": len(test_real),
            "mae_change": round(mae, 3),
            "spearman_level": round(float(sp), 4),
            "risers_precision": round(float(movers["risers_precision"]), 3),
            "risers_recall": round(float(movers["risers_recall"]), 3),
            "fallers_precision": round(float(movers["fallers_precision"]), 3),
            "fallers_recall": round(float(movers["fallers_recall"]), 3),
        })

    return pd.DataFrame(results)


def train_classifier(X_train, y_train_classes, features, seed=42):
    X_tr = prepare_model_features(X_train)
    y_idx = [CLASS_TO_IDX[c] for c in y_train_classes]
    clf = lgb.LGBMClassifier(
        objective="multiclass",
        num_class=4,
        n_estimators=100,
        learning_rate=0.03,
        max_depth=5,
        num_leaves=31,
        random_state=seed,
        verbose=-1,
        n_jobs=-1,
    )
    clf.fit(X_tr[features], y_idx)
    return clf


def predict_classes(clf, X, features):
    X_p = prepare_model_features(X)
    preds = clf.predict(X_p[features])
    return [IDX_TO_CLASS[p] for p in preds]


def train_level_model(X_train, y_train_level, features, seed=42):
    X_tr = prepare_model_features(X_train)
    lgb_lvl = lgb.LGBMRegressor(
        n_estimators=100,
        learning_rate=0.03,
        max_depth=5,
        num_leaves=31,
        random_state=seed,
        verbose=-1,
        n_jobs=-1,
    )
    lgb_lvl.fit(X_tr[features], y_train_level)
    return lgb_lvl
