import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from src.splits import get_horizon5_folds, get_horizon10_folds


def evaluate_mover_metrics(actual_change, pred_change, pct=0.10):
    n = len(actual_change)
    k = max(1, int(np.ceil(pct * n)))

    # Top risers.
    act_risers = set(actual_change.nlargest(k).index)
    pred_risers = set(pred_change.nlargest(k).index)
    common_risers = len(act_risers.intersection(pred_risers))
    prec_risers = common_risers / len(pred_risers) if pred_risers else 0.0
    rec_risers = common_risers / len(act_risers) if act_risers else 0.0

    # Bottom fallers.
    act_fallers = set(actual_change.nsmallest(k).index)
    pred_fallers = set(pred_change.nsmallest(k).index)
    common_fallers = len(act_fallers.intersection(pred_fallers))
    prec_fallers = common_fallers / len(pred_fallers) if pred_fallers else 0.0
    rec_fallers = common_fallers / len(act_fallers) if act_fallers else 0.0

    return {
        "risers_precision": prec_risers,
        "risers_recall": rec_risers,
        "fallers_precision": prec_fallers,
        "fallers_recall": rec_fallers,
    }


def evaluate_baselines(model_table):
    df = model_table[model_table["components_used"] >= 2].copy()
    df["change_5y"] = df["importance"] - df.groupby("iata")["importance"].shift(5)

    results = []

    # Horizon 5 rolling folds.
    for f in get_horizon5_folds():
        test_yr = f["test_origin_year"]
        test = df[df["year"] == test_yr].dropna(subset=["target_level_h5"]).copy()
        actual_level = test["target_level_h5"]
        actual_change = test["target_change_h5"]

        # 1. Persistence: forecast equals current importance.
        pred_p_level = test["importance"]
        pred_p_change = pd.Series(0.0, index=test.index)
        mae_p_lvl = float(np.mean(np.abs(actual_level - pred_p_level)))
        mae_p_chg = float(np.mean(np.abs(actual_change - pred_p_change)))
        spear_p, _ = spearmanr(actual_level, pred_p_level)
        m_p = evaluate_mover_metrics(actual_change, pred_p_change)

        results.append({
            "horizon": 5,
            "fold": f["fold"],
            "test_year": str(test_yr),
            "baseline": "persistence",
            "mae_level": round(mae_p_lvl, 3),
            "mae_change": round(mae_p_chg, 3),
            "spearman_level": round(float(spear_p), 4),
            "risers_precision": round(m_p["risers_precision"], 3),
            "risers_recall": round(m_p["risers_recall"], 3),
            "fallers_precision": round(m_p["fallers_precision"], 3),
            "fallers_recall": round(m_p["fallers_recall"], 3),
        })

        # 2. Linear trend: extrapolate the last 5-year change.
        pred_t_change = test["change_5y"].fillna(0.0) * (5.0 / 5.0)
        pred_t_level = test["importance"] + pred_t_change
        mae_t_lvl = float(np.mean(np.abs(actual_level - pred_t_level)))
        mae_t_chg = float(np.mean(np.abs(actual_change - pred_t_change)))
        spear_t, _ = spearmanr(actual_level, pred_t_level)
        m_t = evaluate_mover_metrics(actual_change, pred_t_change)

        results.append({
            "horizon": 5,
            "fold": f["fold"],
            "test_year": str(test_yr),
            "baseline": "linear_trend",
            "mae_level": round(mae_t_lvl, 3),
            "mae_change": round(mae_t_chg, 3),
            "spearman_level": round(float(spear_t), 4),
            "risers_precision": round(m_t["risers_precision"], 3),
            "risers_recall": round(m_t["risers_recall"], 3),
            "fallers_precision": round(m_t["fallers_precision"], 3),
            "fallers_recall": round(m_t["fallers_recall"], 3),
        })

    # Horizon 10 blocked split.
    for f in get_horizon10_folds():
        test_yrs = f["test_origin_years"]
        test = df[df["year"].isin(test_yrs)].dropna(subset=["target_level_h10"]).copy()
        actual_level = test["target_level_h10"]
        actual_change = test["target_change_h10"]

        pred_p_level = test["importance"]
        pred_p_change = pd.Series(0.0, index=test.index)
        mae_p_lvl = float(np.mean(np.abs(actual_level - pred_p_level)))
        mae_p_chg = float(np.mean(np.abs(actual_change - pred_p_change)))
        spear_p, _ = spearmanr(actual_level, pred_p_level)
        m_p = evaluate_mover_metrics(actual_change, pred_p_change)

        results.append({
            "horizon": 10,
            "fold": f["fold"],
            "test_year": "2013-2015",
            "baseline": "persistence",
            "mae_level": round(mae_p_lvl, 3),
            "mae_change": round(mae_p_chg, 3),
            "spearman_level": round(float(spear_p), 4),
            "risers_precision": round(m_p["risers_precision"], 3),
            "risers_recall": round(m_p["risers_recall"], 3),
            "fallers_precision": round(m_p["fallers_precision"], 3),
            "fallers_recall": round(m_p["fallers_recall"], 3),
        })

        pred_t_change = test["change_5y"].fillna(0.0) * (10.0 / 5.0)
        pred_t_level = test["importance"] + pred_t_change
        mae_t_lvl = float(np.mean(np.abs(actual_level - pred_t_level)))
        mae_t_chg = float(np.mean(np.abs(actual_change - pred_t_change)))
        spear_t, _ = spearmanr(actual_level, pred_t_level)
        m_t = evaluate_mover_metrics(actual_change, pred_t_change)

        results.append({
            "horizon": 10,
            "fold": f["fold"],
            "test_year": "2013-2015",
            "baseline": "linear_trend",
            "mae_level": round(mae_t_lvl, 3),
            "mae_change": round(mae_t_chg, 3),
            "spearman_level": round(float(spear_t), 4),
            "risers_precision": round(m_t["risers_precision"], 3),
            "risers_recall": round(m_t["risers_recall"], 3),
            "fallers_precision": round(m_t["fallers_precision"], 3),
            "fallers_recall": round(m_t["fallers_recall"], 3),
        })

    return pd.DataFrame(results)
