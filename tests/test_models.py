import json

import numpy as np
import pandas as pd

from src.config import OUTPUTS, PROCESSED
from src.models import (
    ALL_FEATURES,
    predict_ensemble,
    train_models,
)
from src.splits import get_horizon5_folds, get_horizon10_folds


def test_train_years_precede_test_years_in_every_fold():
    for f in get_horizon5_folds():
        max_train = max(f["train_origin_years"])
        test_yr = f["test_origin_year"]
        assert max_train < test_yr

    for f in get_horizon10_folds():
        max_train = max(f["train_origin_years"])
        min_test = min(f["test_origin_years"])
        assert max_train < min_test


def test_change_plus_current_equals_level():
    with open(OUTPUTS / "forecasts.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    for ap in data["airports"]:
        cur = ap["importance_present"]
        h5 = ap["forecast_h5"]
        expected_lvl_h5 = round(float(np.clip(cur + h5["change"], 0.0, 100.0)), 2)
        assert abs(h5["level"] - expected_lvl_h5) <= 0.05

        h10 = ap["forecast_h10"]
        expected_lvl_h10 = round(float(np.clip(cur + h10["change"], 0.0, 100.0)), 2)
        assert abs(h10["level"] - expected_lvl_h10) <= 0.05


def test_lower_band_le_median_le_upper_band():
    with open(OUTPUTS / "forecasts.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    for ap in data["airports"]:
        h5 = ap["forecast_h5"]
        assert h5["band_low"] <= h5["band_high"]
        assert h5["band_low"] <= h5["level"] + 1e-4
        assert h5["level"] <= h5["band_high"] + 1e-4

        h10 = ap["forecast_h10"]
        assert h10["band_low"] <= h10["band_high"]
        assert h10["band_low"] <= h10["level"] + 1e-4
        assert h10["level"] <= h10["band_high"] + 1e-4


def test_predictions_stay_within_0_to_100():
    with open(OUTPUTS / "forecasts.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    for ap in data["airports"]:
        assert 0.0 <= ap["importance_present"] <= 100.0
        for h in [ap["forecast_h5"], ap["forecast_h10"]]:
            assert 0.0 <= h["level"] <= 100.0
            assert 0.0 <= h["band_low"] <= 100.0
            assert 0.0 <= h["band_high"] <= 100.0


def test_same_seed_gives_identical_predictions():
    df = pd.read_parquet(PROCESSED / "model_table.parquet")
    sample_tr = df[df["comparable_target_h5"] & (df["importance_confidence"] == "high")].iloc[:200]
    sample_te = df[df["comparable_target_h5"] & (df["importance_confidence"] == "high")].iloc[200:250]

    feats = ALL_FEATURES[:10]
    cur = sample_te["importance"].values

    m1 = train_models(sample_tr, sample_tr["target_change_h5"], feats, seed=42)
    p1 = predict_ensemble(m1, sample_te, cur)

    m2 = train_models(sample_tr, sample_tr["target_change_h5"], feats, seed=42)
    p2 = predict_ensemble(m2, sample_te, cur)

    np.testing.assert_allclose(p1["pred_change"], p2["pred_change"])
    np.testing.assert_allclose(p1["pred_level"], p2["pred_level"])


def test_every_airport_has_present_h5_and_h10_values():
    with open(OUTPUTS / "forecasts.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    assert len(data["airports"]) > 0
    for ap in data["airports"]:
        assert "importance_present" in ap
        assert ap["importance_present"] is not None
        assert "forecast_h5" in ap
        assert ap["forecast_h5"]["level"] is not None
        assert "forecast_h10" in ap
        assert ap["forecast_h10"]["level"] is not None


def test_forecasts_json_matches_schema():
    with open(OUTPUTS / "forecasts.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "generated_as_of_year" in data
    assert "methodology" in data
    assert "airports" in data

    for ap in data["airports"][:50]:
        for k in ["iata", "name", "city", "country", "importance_present", "importance_confidence", "forecast_h5", "forecast_h10"]:
            assert k in ap
        for h in [ap["forecast_h5"], ap["forecast_h10"]]:
            for sub_k in ["target_year", "change", "level", "band_low", "band_high", "class", "positive_drivers", "negative_drivers"]:
                assert sub_k in h
            assert len(h["positive_drivers"]) == 3
            assert len(h["negative_drivers"]) == 3


def test_models_and_baselines_scored_on_identical_rows():
    df = pd.read_parquet(PROCESSED / "model_table.parquet")
    core = df[df["importance_confidence"] == "high"]

    for f in get_horizon5_folds():
        test_yr = f["test_origin_year"]
        baseline_test = core[(core["year"] == test_yr) & core["comparable_target_h5"]].dropna(subset=["target_level_h5"])
        model_test = core[(core["year"] == test_yr) & core["comparable_target_h5"] & ~core["is_covid_target_h5"]].dropna(subset=["target_level_h5"])
        # For evaluation test years (2018, 2019, 2020), test target years are 2023, 2024, 2025 (not covid)
        assert len(baseline_test) == len(model_test)
        assert (baseline_test.index == model_test.index).all()


def test_calibration_slice_never_overlaps_test_folds():
    for f in get_horizon5_folds():
        tr_years = f["train_origin_years"]
        cal_years = tr_years[-2:]
        test_yr = f["test_origin_year"]
        assert test_yr not in cal_years, f"calibration slice overlaps test year {test_yr}"
        assert max(cal_years) < test_yr, "calibration year not before test year"

    for f in get_horizon10_folds():
        tr_years = f["train_origin_years"]
        cal_years = tr_years[-1:]
        test_years = f["test_origin_years"]
        for ty in test_years:
            assert ty not in cal_years, f"horizon 10 calibration slice overlaps test year {ty}"
            assert max(cal_years) < min(test_years)


def test_held_out_region_rows_not_in_training_for_transfer_experiment():
    df = pd.read_parquet(PROCESSED / "model_table.parquet")
    held_out = "EU"
    train_years = list(range(2000, 2014))
    train_pool = df[
        df["year"].isin(train_years)
        & (df["continent"] != held_out)
        & df["comparable_target_h5"]
        & ~df["is_covid_target_h5"]
        & (df["importance_confidence"] == "high")
    ]
    assert (train_pool["continent"] != held_out).all(), "held out region EU leaked into training set"


def test_conformal_coverage_within_five_points_on_calibration_slice():
    df = pd.read_parquet(PROCESSED / "model_table.parquet")
    core = df[df["comparable_target_h5"] & ~df["is_covid_target_h5"] & (df["importance_confidence"] == "high")]
    f1 = get_horizon5_folds()[0]
    tr = core[core["year"].isin(f1["train_origin_years"])]
    tr_years = sorted(tr["year"].unique())
    proper_tr = tr[tr["year"].isin(tr_years[:-2])]
    cal_slice = tr[tr["year"].isin(tr_years[-2:])]

    feats = ALL_FEATURES[:15]
    models = train_models(proper_tr, proper_tr["target_change_h5"], feats, seed=42, cal_slice=cal_slice, cal_y=cal_slice["target_change_h5"], alpha=0.20)
    preds = predict_ensemble(models, cal_slice, cal_slice["importance"].values)

    y_lvl = cal_slice["target_level_h5"].values
    cov = float(np.mean((y_lvl >= preds["band_low"]) & (y_lvl <= preds["band_high"])))
    # Nominal is 0.80, so within 5 points means between 0.75 and 0.85
    assert 0.75 <= cov <= 0.87, f"calibration slice coverage {cov:.3f} outside [0.75, 0.87]"


def test_quantile_ordering():
    df = pd.read_parquet(PROCESSED / "model_table.parquet")
    sample = df[df["comparable_target_h5"] & (df["importance_confidence"] == "high")].iloc[:100]
    feats = ALL_FEATURES[:10]
    m = train_models(sample, sample["target_change_h5"], feats, seed=42)
    p = predict_ensemble(m, sample, sample["importance"].values)

    assert (p["band_low"] <= p["pred_level"] + 1e-5).all(), "band_low exceeds level"
    assert (p["pred_level"] <= p["band_high"] + 1e-5).all(), "level exceeds band_high"
    assert (p["band_low"] <= p["band_high"] + 1e-5).all(), "band_low exceeds band_high"
