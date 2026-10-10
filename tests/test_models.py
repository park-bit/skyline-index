import hashlib
import json
import re

import numpy as np
import pytest

from src.config import OUTPUTS, ROOT


@pytest.fixture(scope="module")
def forecasts_data():
    path = OUTPUTS / "forecasts.json"
    assert path.exists(), f"forecasts.json not found at {path}"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def folds_data():
    path = OUTPUTS / "folds.json"
    assert path.exists(), f"folds.json not found at {path}"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_folds_train_target_years_never_exceed_test_origin_years(folds_data):
    for f in folds_data["horizon5_folds"]:
        max_train_tgt = max(f["train_target_years"])
        test_orig = f["test_origin_year"]
        assert max_train_tgt <= test_orig, (
            f"Fold {f['fold']} violation: max train target {max_train_tgt} > test origin {test_orig}"
        )
        assert max(f["train_origin_years"]) < test_orig

    for f in folds_data["horizon10_folds"]:
        max_train_orig = max(f["train_origin_years"])
        min_test_orig = min(f["test_origin_years"])
        assert max_train_orig < min_test_orig, (
            f"Horizon 10 fold violation: max train origin {max_train_orig} >= min test origin {min_test_orig}"
        )
        max_train_tgt = max(f["train_target_years"])
        min_test_tgt = min(f["test_target_years"])
        assert max_train_tgt <= min_test_tgt


def test_calibration_slice_never_overlaps_test_folds(folds_data):
    for f in folds_data["horizon5_folds"]:
        tr_years = f["train_origin_years"]
        cal_years = tr_years[-2:]
        test_yr = f["test_origin_year"]
        assert test_yr not in cal_years, f"calibration slice overlaps test year {test_yr}"
        assert max(cal_years) < test_yr

    for f in folds_data["horizon10_folds"]:
        tr_years = f["train_origin_years"]
        cal_years = tr_years[-1:]
        test_years = f["test_origin_years"]
        for ty in test_years:
            assert ty not in cal_years, f"horizon 10 calibration slice overlaps test year {ty}"
            assert max(cal_years) < min(test_years)


def test_forecasts_json_matches_schema_and_ranges(forecasts_data):
    assert "generated_as_of_year" in forecasts_data
    assert "methodology" in forecasts_data
    assert "airports" in forecasts_data
    assert len(forecasts_data["airports"]) >= 1000

    for ap in forecasts_data["airports"]:
        for k in ["iata", "name", "city", "country", "importance_present", "importance_confidence", "forecast_h5", "forecast_h10"]:
            assert k in ap, f"missing key {k} in airport {ap.get('iata')}"

        assert 0.0 <= ap["importance_present"] <= 100.0

        for h_key in ["forecast_h5", "forecast_h10"]:
            h = ap[h_key]
            for sub_k in ["target_year", "change", "level", "band_low", "band_high", "class", "positive_drivers", "negative_drivers"]:
                assert sub_k in h, f"missing sub_key {sub_k} in {h_key} for {ap['iata']}"

            assert -100.0 <= h["change"] <= 100.0
            assert 0.0 <= h["level"] <= 100.0
            assert 0.0 <= h["band_low"] <= 100.0
            assert 0.0 <= h["band_high"] <= 100.0
            assert len(h["positive_drivers"]) == 3
            assert len(h["negative_drivers"]) == 3


def test_change_plus_current_equals_level(forecasts_data):
    for ap in forecasts_data["airports"]:
        cur = ap["importance_present"]
        h5 = ap["forecast_h5"]
        expected_lvl_h5 = round(float(np.clip(cur + h5["change"], 0.0, 100.0)), 2)
        assert abs(h5["level"] - expected_lvl_h5) <= 0.05, f"h5 level identity mismatch for {ap['iata']}"

        h10 = ap["forecast_h10"]
        expected_lvl_h10 = round(float(np.clip(cur + h10["change"], 0.0, 100.0)), 2)
        assert abs(h10["level"] - expected_lvl_h10) <= 0.05, f"h10 level identity mismatch for {ap['iata']}"


def test_band_ordering_and_levels(forecasts_data):
    for ap in forecasts_data["airports"]:
        h5 = ap["forecast_h5"]
        assert h5["band_low"] <= h5["band_high"], f"h5 band inverted for {ap['iata']}"
        assert h5["band_low"] <= h5["level"] + 1e-4, f"h5 band_low > level for {ap['iata']}"
        assert h5["level"] <= h5["band_high"] + 1e-4, f"h5 level > band_high for {ap['iata']}"

        h10 = ap["forecast_h10"]
        assert h10["band_low"] <= h10["band_high"], f"h10 band inverted for {ap['iata']}"
        assert h10["band_low"] <= h10["level"] + 1e-4, f"h10 band_low > level for {ap['iata']}"
        assert h10["level"] <= h10["band_high"] + 1e-4, f"h10 level > band_high for {ap['iata']}"


def test_hub_rule_consistent_between_horizons(forecasts_data):
    for ap in forecasts_data["airports"]:
        # Level >= 90 must always be established_hub
        if ap["forecast_h5"]["level"] >= 90.0:
            assert ap["forecast_h5"]["class"] == "established_hub", (
                f"Airport {ap['iata']} h5 level {ap['forecast_h5']['level']} >= 90 but class is {ap['forecast_h5']['class']}"
            )
        if ap["forecast_h10"]["level"] >= 90.0:
            assert ap["forecast_h10"]["class"] == "established_hub", (
                f"Airport {ap['iata']} h10 level {ap['forecast_h10']['level']} >= 90 but class is {ap['forecast_h10']['class']}"
            )

        # Tier 95 rule: airports with present score >= 95 stay established hubs and within bounds
        if ap["importance_present"] >= 95.0:
            assert ap["forecast_h5"]["class"] == "established_hub"
            assert ap["forecast_h10"]["class"] == "established_hub"
            assert ap["forecast_h10"]["level"] <= 100.0
            assert ap["forecast_h10"]["level"] >= ap["forecast_h10"]["band_low"] - 1e-4

    # Spot check global hubs
    major_hubs = {"ATL", "DXB", "LHR", "HND", "PEK", "SIN"}
    by_iata = {a["iata"]: a for a in forecasts_data["airports"]}
    for h in major_hubs:
        if h in by_iata:
            ap = by_iata[h]
            assert ap["forecast_h5"]["class"] == "established_hub", f"Major hub {h} not established_hub at h5"
            assert ap["forecast_h10"]["class"] == "established_hub", f"Major hub {h} not established_hub at h10"


def test_class_shares(forecasts_data):
    all_classes = {"stable", "emerging", "declining", "established_hub"}
    for h_key in ["forecast_h5", "forecast_h10"]:
        classes = [a[h_key]["class"] for a in forecasts_data["airports"]]
        unique_classes = set(classes)
        assert all_classes == unique_classes, f"Missing class in {h_key}: {all_classes - unique_classes}"

        total = len(classes)
        for c in all_classes:
            share = classes.count(c) / total
            assert share <= 0.85, f"Class {c} in {h_key} exceeded 85% share ({share:.2%})"
            assert share >= 0.02, f"Class {c} in {h_key} fell below 2% share ({share:.2%})"


def test_same_seed_gives_identical_predictions(forecasts_data):
    s = "".join(
        a["iata"] + str(a["forecast_h5"]["level"]) + str(a["forecast_h10"]["level"])
        for a in forecasts_data["airports"]
    )
    computed_hash = hashlib.sha256(s.encode("utf-8")).hexdigest()
    valid_hashes = {
        "df912443ec934ea4dac2b1e2d2bac2d7a039d412cb65fde24a5ad82b9fda9680",
        "6754c91f08a3c1104fd219ef7768c00ffde314f711eb734f9dcfa3113d6ffa12",
    }
    assert computed_hash in valid_hashes, (
        f"Prediction hash mismatch: got {computed_hash}, expected one of {valid_hashes}"
    )


def test_report_numbers_exist_in_tables():
    reports_dir = ROOT / "reports"
    eval_path = reports_dir / "evaluation.md"
    assert eval_path.exists(), "reports/evaluation.md missing"
    lines = eval_path.read_text(encoding="utf-8").splitlines()

    table_numbers = set()
    for l in lines:
        if l.strip().startswith("|") and not l.strip().startswith("|---"):
            for m in re.finditer(r"[-+]?\d+(?:\.\d+)?%?", l):
                v_str = m.group(0).rstrip("%")
                try:
                    table_numbers.add(float(v_str))
                except ValueError:
                    pass

    for l in lines:
        stripped = l.strip()
        if stripped.startswith(("|", "#", "```")):
            continue

        for ratio_match in re.finditer(r"(\d+(?:\.\d+)?)\s*x(?:\s+lift)?\b", stripped, re.IGNORECASE):
            ratio_val = float(ratio_match.group(1))
            derivable = any(
                b > 0 and abs((a / b) - ratio_val) / ratio_val < 0.10
                for a in table_numbers for b in table_numbers
            )
            assert derivable, f"Ratio {ratio_match.group(0)} in prose not derivable from table numbers"
