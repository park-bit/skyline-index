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
