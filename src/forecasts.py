import json
from pathlib import Path
import numpy as np
import pandas as pd

from src.config import OUTPUTS, RAW
from src.macro import load_country_mapping, load_imf_indicators, load_un_demographics
from src.models import (
    ALL_FEATURES,
    predict_classes,
    predict_ensemble,
)
from src.drivers import extract_shap_drivers


def load_future_macro_2030():
    iso_map = load_country_mapping()
    imf = load_imf_indicators(iso_map)
    un = load_un_demographics(iso_map)

    imf_30 = imf[imf["year"] == 2030].set_index("country_code")
    un_30 = un[un["year"] == 2030].set_index("country_code")
    return imf_30, un_30


def build_forecasts(model_table, h5_models, h5_clf):
    df_2025 = model_table[model_table["year"] == 2025].copy().reset_index(drop=True)
    has_routes_or_traffic = (
        (df_2025["of_routes_total"] > 0)
        | (df_2025["has_observed_traffic"] == 1)
        | df_2025["opensky_flights"].notna()
        | (df_2025["importance_confidence"] == "high")
    )
    df_2025 = df_2025[has_routes_or_traffic].copy().reset_index(drop=True)
    features = h5_models["features"]
    cur_imp = df_2025["importance"].values

    # Step 1: 2025 to 2030 (+5 years)
    p_h5 = predict_ensemble(h5_models, df_2025, cur_imp)
    cls_h5 = predict_classes(h5_clf, df_2025, features)
    pos_h5, neg_h5 = extract_shap_drivers(h5_models["lgb"], df_2025, features, top_k=3)

    # Step 2: 2030 forward features using IMF and UN projections
    df_2030 = df_2025.copy()
    df_2030["importance"] = p_h5["pred_level"]
    df_2030["importance_momentum_5y"] = p_h5["pred_change"]

    imf_30, un_30 = load_future_macro_2030()
    imf_growth_30 = imf_30["imf_gdp_growth_pct"].to_dict() if "imf_gdp_growth_pct" in imf_30 else {}
    un_age_30 = un_30["un_median_age"].to_dict() if "un_median_age" in un_30 else {}
    un_pop_30 = un_30["un_pop_thousands"].to_dict() if "un_pop_thousands" in un_30 else {}

    df_2030["imf_gdp_growth_pct"] = df_2030["country_code"].map(imf_growth_30).fillna(df_2025["imf_gdp_growth_pct"])
    df_2030["un_median_age"] = df_2030["country_code"].map(un_age_30).fillna(df_2025["un_median_age"])
    new_pop = df_2030["country_code"].map(un_pop_30) * 1000.0
    df_2030["country_pop"] = new_pop.fillna(df_2025["country_pop"])

    # Step 2: 2030 to 2035 (+10 years)
    p_step2 = predict_ensemble(h5_models, df_2030, p_h5["pred_level"])
    cls_h10 = predict_classes(h5_clf, df_2030, features)
    pos_h10, neg_h10 = extract_shap_drivers(h5_models["lgb"], df_2030, features, top_k=3)

    # Combined 10-year metrics
    lvl_h10 = np.clip(p_step2["pred_level"], 0.0, 100.0)
    chg_h10 = lvl_h10 - cur_imp
    b_low_h10 = np.clip(p_h5["band_low"] + (p_step2["band_low"] - p_h5["pred_level"]), 0.0, 100.0)
    b_high_h10 = np.clip(p_h5["band_high"] + (p_step2["band_high"] - p_h5["pred_level"]), 0.0, 100.0)
    b_low_h10 = np.minimum(b_low_h10, lvl_h10)
    b_high_h10 = np.maximum(b_high_h10, lvl_h10)

    airports_list = []
    for i in range(len(df_2025)):
        row = df_2025.iloc[i]
        rec = {
            "iata": str(row["iata"]),
            "name": str(row.get("name", "")),
            "city": str(row.get("municipality", "")),
            "country": str(row.get("country_code", "")),
            "latitude": round(float(row["latitude"]), 4) if pd.notna(row.get("latitude")) else None,
            "longitude": round(float(row["longitude"]), 4) if pd.notna(row.get("longitude")) else None,
            "importance_present": round(float(cur_imp[i]), 2),
            "importance_confidence": str(row["importance_confidence"]),
            "scored_outside_training_region": int(row.get("scored_outside_training_region", 0)),
            "forecast_h5": {
                "target_year": 2030,
                "change": round(float(p_h5["pred_change"][i]), 2),
                "level": round(float(p_h5["pred_level"][i]), 2),
                "band_low": round(float(p_h5["band_low"][i]), 2),
                "band_high": round(float(p_h5["band_high"][i]), 2),
                "class": cls_h5[i],
                "positive_drivers": pos_h5[i],
                "negative_drivers": neg_h5[i],
            },
            "forecast_h10": {
                "target_year": 2035,
                "change": round(float(chg_h10[i]), 2),
                "level": round(float(lvl_h10[i]), 2),
                "band_low": round(float(b_low_h10[i]), 2),
                "band_high": round(float(b_high_h10[i]), 2),
                "class": cls_h10[i],
                "positive_drivers": pos_h10[i],
                "negative_drivers": neg_h10[i],
            },
        }
        airports_list.append(rec)

    output = {
        "generated_as_of_year": 2025,
        "methodology": "Ensemble of LightGBM and Ridge with IMF and UN forward projections",
        "macro_held_constant": ["network_topology", "airport_catchment", "historical_traffic_volume"],
        "macro_projected": ["imf_gdp_growth_pct", "un_median_age", "un_pop_thousands"],
        "airports": airports_list,
    }
    return output


def save_forecasts_json(forecasts_dict, out_path=None):
    if out_path is None:
        out_path = OUTPUTS / "forecasts.json"
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(forecasts_dict, f, separators=(",", ":"))
    return out_path
