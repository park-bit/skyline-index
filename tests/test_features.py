import numpy as np
import pandas as pd
import pytest

from src.config import PROCESSED
from src.splits import get_horizon5_folds, get_horizon10_folds


@pytest.fixture(scope="module")
def model_table():
    path = PROCESSED / "model_table.parquet"
    if not path.exists():
        pytest.skip("model_table.parquet not found")
    return pd.read_parquet(path)


def test_no_leakage_and_target_alignment(model_table):
    # Verify that target_level_h5 at year t matches importance at year t+5 for the same airport.
    h5_valid = model_table.dropna(subset=["target_level_h5"]).copy()
    lookup = model_table.set_index(["iata", "year"])["importance"].to_dict()

    for _, row in h5_valid.sample(100, random_state=42).iterrows():
        expected_level = lookup.get((row["iata"], row["year"] + 5))
        assert np.isclose(row["target_level_h5"], expected_level, atol=1e-5), (
            f"target_level_h5 mismatch for {row['iata']} at year {row['year']}"
        )


def test_target_change_identity(model_table):
    for h in [5, 10]:
        lvl_col = f"target_level_h{h}"
        chg_col = f"target_change_h{h}"
        valid = model_table.dropna(subset=[lvl_col, chg_col])
        diff = np.abs((valid[chg_col] + valid["importance"]) - valid[lvl_col])
        assert (diff < 1e-5).all(), f"target_change + importance did not equal target_level exactly for h={h}"


def test_all_four_classes_present_and_none_above_share_limit(model_table):
    classes = {"stable", "emerging", "declining", "established_hub"}
    for h in [5, 10]:
        cls_col = f"target_class_h{h}"
        covid_col = f"is_covid_target_h{h}"
        train_rows = model_table[model_table[cls_col].notna() & ~model_table[covid_col]]

        present_classes = set(train_rows[cls_col].unique())
        assert classes.issubset(present_classes), f"missing trajectory classes in h={h}: {classes - present_classes}"

        shares = train_rows[cls_col].value_counts(normalize=True)
        for c, s in shares.items():
            assert s <= 0.70, f"class {c} share {s:.2%} exceeded 70% threshold in h={h}"


def test_fold_bounds_and_overlap_specifications():
    # Horizon 5: max training target year <= test origin year.
    for f in get_horizon5_folds():
        max_train_tgt = max(f["train_target_years"])
        test_orig = f["test_origin_year"]
        assert max_train_tgt <= test_orig, (
            f"Fold {f['fold']} violation: train target {max_train_tgt} > test origin {test_orig}"
        )

    # Horizon 10: calendar overlap is exactly [2013, 2014].
    h10_folds = get_horizon10_folds()
    assert len(h10_folds) == 1
    f10 = h10_folds[0]
    assert f10["calendar_overlap_years"] == [2013, 2014], (
        f"Horizon 10 calendar overlap was {f10['calendar_overlap_years']}, expected [2013, 2014]"
    )
