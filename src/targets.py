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
from src.importance import compute_importance_index, get_core_airports


def classify_trajectory(cur, chg):
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

    core_set = set(get_core_airports(res))
    is_core = res["iata"].isin(core_set)

    has_net = res["of_routes_total"].notna() & (res["of_routes_total"] > 0)
    psgr = res["eurostat_passengers"].fillna(
        res["faa_enplanements"].where(res["country_code"] == "US") * 2.0
    )
    has_traf = is_core & (psgr.notna() | res["opensky_flights"].notna())
    has_mkt = (
        res["nearest_large_city_pop"].notna() | res["catchment_pop_100km"].notna()
    ) & (res["wb_gdp_usd"].notna() | res["imf_gdp_per_capita_usd"].notna())

    comp_sig = res["data_quality"] if "data_quality" in res.columns else (
        has_net.astype(int).astype(str)
        + "_"
        + has_traf.astype(int).astype(str)
        + "_"
        + has_mkt.astype(int).astype(str)
    )
    res["component_signature"] = comp_sig

    for h in horizons:
        lvl_col = f"target_level_h{h}"
        chg_col = f"target_change_h{h}"
        cls_col = f"target_class_h{h}"
        comp_col = f"comparable_target_h{h}"
        covid_col = f"is_covid_target_h{h}"

        target_year = res["year"] + h
        target_lvl = res.groupby("iata")["importance"].shift(-h)
        target_sig = res.groupby("iata")["component_signature"].shift(-h)

        res[lvl_col] = target_lvl
        res[chg_col] = target_lvl - res["importance"]

        match_sig = (res["component_signature"] == target_sig)
        is_comparable = (
            match_sig
            & target_lvl.notna()
            & res["importance"].notna()
            & (target_year <= 2025)
        )
        res[comp_col] = is_comparable
        res[covid_col] = target_year.isin(COVID_EXCLUDE_TARGET_YEARS)

        # Classes are assigned only on comparable observations
        classes = []
        for cur, chg, comp in zip(res["importance"], res[chg_col], is_comparable):
            if comp:
                classes.append(classify_trajectory(cur, chg))
            else:
                classes.append(None)
        res[cls_col] = classes

    res["comparable_target"] = res["comparable_target_h5"]
    return res


def build_model_table(panel=None):
    if panel is None:
        panel = pd.read_parquet(PROCESSED / "airport_year_panel.parquet")

    scored = compute_importance_index(panel)
    featured = build_point_in_time_features(scored)
    targeted = compute_targets(featured)

    PROCESSED.mkdir(parents=True, exist_ok=True)
    out_path = PROCESSED / "model_table.parquet"
    targeted.to_parquet(out_path, index=False)
    return targeted
