import pandas as pd

from src.config import (
    COVID_EXCLUDE_TARGET_YEARS,
    ESTABLISHED_HUB_PERCENTILE,
    FORECAST_HORIZONS,
    PROCESSED,
    TRAJECTORY_CHANGE_DOWN,
    TRAJECTORY_CHANGE_UP,
)
from src.features import build_point_in_time_features
from src.importance import compute_importance_index


def classify_trajectory(row, col_change, col_imp="importance"):
    cur = row[col_imp]
    chg = row[col_change]
    if pd.isna(cur) or pd.isna(chg):
        return None

    if cur >= ESTABLISHED_HUB_PERCENTILE and chg >= -1.0:
        return "established_hub"
    elif chg >= TRAJECTORY_CHANGE_UP:
        return "emerging"
    elif chg <= TRAJECTORY_CHANGE_DOWN:
        return "declining"
    else:
        return "stable"


def compute_targets(df, horizons=FORECAST_HORIZONS):
    res = df.sort_values(["iata", "year"]).copy()

    for h in horizons:
        lvl_col = f"target_level_h{h}"
        chg_col = f"target_change_h{h}"
        cls_col = f"target_class_h{h}"
        covid_col = f"is_covid_target_h{h}"

        # Target level at year t + h using grouping by airport.
        target_year = res["year"] + h
        res[lvl_col] = res.groupby("iata")["importance"].shift(-h)

        # target_change + current importance equals target_level exactly.
        res[chg_col] = res[lvl_col] - res["importance"]

        res[cls_col] = res.apply(lambda r: classify_trajectory(r, chg_col), axis=1)
        res[covid_col] = target_year.isin(COVID_EXCLUDE_TARGET_YEARS)

    return res


def build_model_table(panel=None):
    if panel is None:
        panel_path = PROCESSED / "airport_year_panel.parquet"
        panel = pd.read_parquet(panel_path)

    scored = compute_importance_index(panel)
    featured = build_point_in_time_features(scored)
    targeted = compute_targets(featured)

    # Save to data/processed/model_table.parquet.
    out_path = PROCESSED / "model_table.parquet"
    targeted.to_parquet(out_path, index=False)
    return targeted
