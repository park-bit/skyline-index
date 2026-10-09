import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import lightgbm as lgb

from src.drivers import extract_shap_drivers

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
ALL_FEATURES = (
    NETWORK_FEATURES + SPATIAL_FEATURES + TRAFFIC_FEATURES + MACRO_FEATURES + MOMENTUM_FEATURES
)

CLASS_NAMES = ["declining", "emerging", "established_hub", "stable"]
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASS_NAMES)}
IDX_TO_CLASS = {i: c for i, c in enumerate(CLASS_NAMES)}


def prepare_ridge_matrix(df, features):
    d = df[features].copy()
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


def train_models(X_train, y_train, features, seed=42):
    lgb_reg = lgb.LGBMRegressor(
        n_estimators=100,
        learning_rate=0.03,
        max_depth=5,
        num_leaves=31,
        random_state=seed,
        verbose=-1,
        n_jobs=-1,
    )
    lgb_reg.fit(X_train[features], y_train)

    X_ridge = prepare_ridge_matrix(X_train, features)
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
    q10.fit(X_train[features], y_train)
    q90.fit(X_train[features], y_train)

    return {
        "lgb": lgb_reg,
        "ridge": ridge_pipe,
        "q10": q10,
        "q90": q90,
        "features": features,
    }


def predict_ensemble(models, X, current_importance):
    features = models["features"]
    p_lgb = models["lgb"].predict(X[features])
    X_ridge = prepare_ridge_matrix(X, features)
    p_ridge = models["ridge"].predict(X_ridge)
    p_ens = 0.5 * p_lgb + 0.5 * p_ridge

    p10 = models["q10"].predict(X[features])
    p90 = models["q90"].predict(X[features])

    level = np.clip(current_importance + p_ens, 0.0, 100.0)
    band_low = np.clip(current_importance + p10, 0.0, 100.0)
    band_high = np.clip(current_importance + p90, 0.0, 100.0)
    band_low = np.minimum(band_low, level)
    band_high = np.maximum(band_high, level)

    return {
        "pred_change": p_ens,
        "pred_level": level,
        "band_low": band_low,
        "band_high": band_high,
        "pred_lgb_change": p_lgb,
        "pred_ridge_change": p_ridge,
    }


def train_classifier(X_train, y_train_classes, features, seed=42):
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
    clf.fit(X_train[features], y_idx)
    return clf


def predict_classes(clf, X, features):
    preds = clf.predict(X[features])
    return [IDX_TO_CLASS[p] for p in preds]


def train_level_model(X_train, y_train_level, features, seed=42):
    lgb_lvl = lgb.LGBMRegressor(
        n_estimators=100,
        learning_rate=0.03,
        max_depth=5,
        num_leaves=31,
        random_state=seed,
        verbose=-1,
        n_jobs=-1,
    )
    lgb_lvl.fit(X_train[features], y_train_level)
    return lgb_lvl
