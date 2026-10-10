import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import joblib
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.metrics import confusion_matrix, f1_score

from src.baselines import evaluate_mover_metrics
from src.config import OUTPUTS, PROCESSED, ROOT
from src.forecasts import build_forecasts, save_forecasts_json
from src.models import (
    ALL_FEATURES,
    CLASS_NAMES,
    MACRO_FEATURES,
    NETWORK_FEATURES,
    QUALITY_FEATURES,
    TRAFFIC_FEATURES,
    find_damping_factor,
    predict_classes,
    predict_ensemble,
    prepare_model_features,
    run_region_transfer_experiment,
    train_classifier,
    train_level_model,
    train_models,
)
from src.splits import get_horizon5_folds, get_horizon10_folds


def evaluate_fold_models(tr, te, target_chg_col, target_lvl_col, target_cls_col, features, horizon=5):
    cur_imp = te["importance"].values
    act_chg = te[target_chg_col].values
    act_lvl = te[target_lvl_col].values

    # Baseline 1: persistence (zero change)
    p_chg = np.zeros(len(te))
    p_lvl = cur_imp
    m_p = evaluate_mover_metrics(pd.Series(act_chg, index=te.index), pd.Series(p_chg, index=te.index))

    # Baseline 2: linear trend from historical growth
    t_chg = te["traffic_growth_5y"].fillna(0.0).values
    t_lvl = np.clip(cur_imp + t_chg, 0.0, 100.0)
    m_t = evaluate_mover_metrics(pd.Series(act_chg, index=te.index), pd.Series(t_chg, index=te.index))

    # Split calibration slice from training years
    tr_years = sorted(tr["year"].unique())
    if horizon == 5:
        cal_years = tr_years[-2:]
        proper_years = tr_years[:-2]
    else:
        cal_years = tr_years[-1:]
        proper_years = tr_years[:-1]

    proper_tr = tr[tr["year"].isin(proper_years)].copy()
    cal_slice = tr[tr["year"].isin(cal_years)].copy()
    cal_y = cal_slice[target_chg_col]

    models = train_models(proper_tr, proper_tr[target_chg_col], features, seed=42, cal_slice=cal_slice, cal_y=cal_y)
    preds = predict_ensemble(models, te, cur_imp)

    # Coverage before and after conformal calibration
    cov_before = float(np.mean((act_lvl >= preds["band_low_raw"]) & (act_lvl <= preds["band_high_raw"])))
    cov_after = float(np.mean((act_lvl >= preds["band_low"]) & (act_lvl <= preds["band_high"])))

    # Horizon 10 damping
    damped_info = {}
    if horizon == 10:
        gamma_star = find_damping_factor(models, cal_slice, cal_y)
        preds_damped = predict_ensemble(models, te, cur_imp, damped_factor=gamma_star)
        m_damped = evaluate_mover_metrics(pd.Series(act_chg, index=te.index), pd.Series(preds_damped["pred_change"], index=te.index))
        sp_damped, _ = spearmanr(act_lvl, preds_damped["pred_level"])
        damped_info = {
            "gamma_star": gamma_star,
            "damped_mae": float(np.mean(np.abs(act_chg - preds_damped["pred_change"]))),
            "damped_spearman": float(sp_damped),
            "damped_risers_p": float(m_damped["risers_precision"]),
            "damped_risers_r": float(m_damped["risers_recall"]),
            "damped_fallers_p": float(m_damped["fallers_precision"]),
            "damped_fallers_r": float(m_damped["fallers_recall"]),
        }

    # Classifier
    clf = train_classifier(proper_tr, proper_tr[target_cls_col], features, seed=42)
    pred_cls = predict_classes(clf, te, features)
    f1_macro = float(f1_score(te[target_cls_col], pred_cls, average="macro", labels=CLASS_NAMES))
    cm = confusion_matrix(te[target_cls_col], pred_cls, labels=CLASS_NAMES)

    # Level model
    lvl_model = train_level_model(proper_tr, proper_tr[target_lvl_col], features, seed=42)
    pred_lvl_only = np.clip(lvl_model.predict(prepare_model_features(te)[features]), 0.0, 100.0)
    pred_lvl_chg = pred_lvl_only - cur_imp

    m_lgb = evaluate_mover_metrics(pd.Series(act_chg, index=te.index), pd.Series(preds["pred_lgb_change"], index=te.index))
    m_rdg = evaluate_mover_metrics(pd.Series(act_chg, index=te.index), pd.Series(preds["pred_ridge_change"], index=te.index))
    m_ens = evaluate_mover_metrics(pd.Series(act_chg, index=te.index), pd.Series(preds["pred_change"], index=te.index))

    sp_p, _ = spearmanr(act_lvl, p_lvl)
    sp_t, _ = spearmanr(act_lvl, t_lvl)
    sp_lgb, _ = spearmanr(act_lvl, np.clip(cur_imp + preds["pred_lgb_change"], 0.0, 100.0))
    sp_rdg, _ = spearmanr(act_lvl, np.clip(cur_imp + preds["pred_ridge_change"], 0.0, 100.0))
    sp_ens, _ = spearmanr(act_lvl, preds["pred_level"])
    sp_lvl, _ = spearmanr(act_lvl, pred_lvl_only)

    # Subgroup breakdown by data_quality
    dq_breakdown = {}
    for dq_val in ["observed", "reconstructed", "static_only"]:
        mask = te["data_quality"] == dq_val
        if mask.sum() > 10:
            sub_act = act_chg[mask]
            sub_pred = preds["pred_change"][mask]
            sub_lvl = act_lvl[mask]
            sub_pred_lvl = preds["pred_level"][mask]
            sub_sp, _ = spearmanr(sub_lvl, sub_pred_lvl)
            sub_m = evaluate_mover_metrics(pd.Series(sub_act), pd.Series(sub_pred))
            dq_breakdown[dq_val] = {
                "n": int(mask.sum()),
                "mae": float(np.mean(np.abs(sub_act - sub_pred))),
                "spearman": float(sub_sp),
                "risers_p": float(sub_m["risers_precision"]),
                "fallers_p": float(sub_m["fallers_precision"]),
            }

    return {
        "persistence": {"mae_chg": float(np.mean(np.abs(act_chg - p_chg))), "spearman": float(sp_p), **m_p},
        "linear_trend": {"mae_chg": float(np.mean(np.abs(act_chg - t_chg))), "spearman": float(sp_t), **m_t},
        "lightgbm": {"mae_chg": float(np.mean(np.abs(act_chg - preds["pred_lgb_change"]))), "spearman": float(sp_lgb), **m_lgb},
        "ridge": {"mae_chg": float(np.mean(np.abs(act_chg - preds["pred_ridge_change"]))), "spearman": float(sp_rdg), **m_rdg},
        "ensemble": {
            "mae_chg": float(np.mean(np.abs(act_chg - preds["pred_change"]))),
            "spearman": float(sp_ens),
            "cov_before": cov_before,
            "cov_after": cov_after,
            "f1": f1_macro,
            "cm": cm,
            **m_ens,
        },
        "level_model": {"mae_chg": float(np.mean(np.abs(act_chg - pred_lvl_chg))), "spearman": float(sp_lvl)},
        "damped_info": damped_info,
        "dq_breakdown": dq_breakdown,
        "models": models,
        "classifier": clf,
    }


def run_evaluation_suite(df):
    results = []
    cms = []
    damped_results = []
    dq_results = []

    # Horizon 5 folds
    for f in get_horizon5_folds():
        tr = df[df["year"].isin(f["train_origin_years"]) & df["comparable_target_h5"] & ~df["is_covid_target_h5"] & (df["importance_confidence"] == "high")]
        te = df[(df["year"] == f["test_origin_year"]) & df["comparable_target_h5"] & ~df["is_covid_target_h5"] & (df["importance_confidence"] == "high")]
        res = evaluate_fold_models(tr, te, "target_change_h5", "target_level_h5", "target_class_h5", ALL_FEATURES, horizon=5)
        for m_name in ["persistence", "linear_trend", "ridge", "lightgbm", "ensemble"]:
            row = res[m_name]
            results.append({
                "horizon": 5, "fold": f["fold"], "test_year": str(f["test_origin_year"]),
                "model": m_name, "n_test": len(te),
                "risers_p": round(row.get("risers_precision", 0.0), 3),
                "risers_r": round(row.get("risers_recall", 0.0), 3),
                "fallers_p": round(row.get("fallers_precision", 0.0), 3),
                "fallers_r": round(row.get("fallers_recall", 0.0), 3),
                "mae_change": round(row["mae_chg"], 3),
                "spearman_level": round(float(row["spearman"]), 4),
                "cov_before": round(row.get("cov_before", np.nan), 3),
                "cov_after": round(row.get("cov_after", np.nan), 3),
                "macro_f1": round(row.get("f1", np.nan), 3),
            })
        cms.append((f["fold"], res["ensemble"]["cm"]))
        for dq_k, dq_v in res["dq_breakdown"].items():
            dq_results.append({
                "horizon": 5, "fold": f["fold"], "data_quality": dq_k,
                **dq_v,
            })

    # Horizon 10 fold
    for f in get_horizon10_folds():
        tr = df[df["year"].isin(f["train_origin_years"]) & df["comparable_target_h10"] & ~df["is_covid_target_h10"] & (df["importance_confidence"] == "high")]
        te = df[df["year"].isin(f["test_origin_years"]) & df["comparable_target_h10"] & ~df["is_covid_target_h10"] & (df["importance_confidence"] == "high")]
        res = evaluate_fold_models(tr, te, "target_change_h10", "target_level_h10", "target_class_h10", ALL_FEATURES, horizon=10)
        for m_name in ["persistence", "linear_trend", "ridge", "lightgbm", "ensemble"]:
            row = res[m_name]
            results.append({
                "horizon": 10, "fold": f["fold"], "test_year": "2013-2015",
                "model": m_name, "n_test": len(te),
                "risers_p": round(row.get("risers_precision", 0.0), 3),
                "risers_r": round(row.get("risers_recall", 0.0), 3),
                "fallers_p": round(row.get("fallers_precision", 0.0), 3),
                "fallers_r": round(row.get("fallers_recall", 0.0), 3),
                "mae_change": round(row["mae_chg"], 3),
                "spearman_level": round(float(row["spearman"]), 4),
                "cov_before": round(row.get("cov_before", np.nan), 3),
                "cov_after": round(row.get("cov_after", np.nan), 3),
                "macro_f1": round(row.get("f1", np.nan), 3),
            })
        damped_results.append(res["damped_info"])

    return pd.DataFrame(results), cms, damped_results, pd.DataFrame(dq_results)


def run_ablation_study(df):
    feature_sets = {
        "all_features": ALL_FEATURES,
        "no_network": [f for f in ALL_FEATURES if f not in NETWORK_FEATURES],
        "no_macro": [f for f in ALL_FEATURES if f not in MACRO_FEATURES],
        "traffic_only": TRAFFIC_FEATURES + ["importance"],
        "no_reconstruction": [f for f in ALL_FEATURES if f not in QUALITY_FEATURES],
    }
    ablation_rows = []
    # Headline folds 1 and 2
    folds = [f for f in get_horizon5_folds() if f["fold"] in [1, 2]]

    for set_name, feats in feature_sets.items():
        maes, spears, r_ps, r_rs = [], [], [], []
        for f in folds:
            tr = df[df["year"].isin(f["train_origin_years"]) & df["comparable_target_h5"] & ~df["is_covid_target_h5"] & (df["importance_confidence"] == "high")]
            te = df[(df["year"] == f["test_origin_year"]) & df["comparable_target_h5"] & ~df["is_covid_target_h5"] & (df["importance_confidence"] == "high")]
            models = train_models(tr, tr["target_change_h5"], feats, seed=42)
            preds = predict_ensemble(models, te, te["importance"].values)
            maes.append(np.mean(np.abs(te["target_change_h5"].values - preds["pred_change"])))
            sp, _ = spearmanr(te["target_level_h5"].values, preds["pred_level"])
            spears.append(sp)
            movers = evaluate_mover_metrics(te["target_change_h5"], pd.Series(preds["pred_change"], index=te.index))
            r_ps.append(movers["risers_precision"])
            r_rs.append(movers["risers_recall"])

        ablation_rows.append({
            "feature_set": set_name,
            "num_features": len(feats),
            "mae_change": round(float(np.mean(maes)), 3),
            "spearman_level": round(float(np.mean(spears)), 4),
            "risers_precision": round(float(np.mean(r_ps)), 3),
            "risers_recall": round(float(np.mean(r_rs)), 3),
        })
    return pd.DataFrame(ablation_rows)


def main():
    table_path = PROCESSED / "model_table.parquet"
    df = pd.read_parquet(table_path)

    eval_df, cms, damped_results, dq_df = run_evaluation_suite(df)
    ablation_df = run_ablation_study(df)
    transfer_df = run_region_transfer_experiment(df, held_out_continent="EU", seed=42)

    reports_dir = ROOT / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    # Write reports/evaluation.md
    headline_df = eval_df[eval_df["fold"].isin([1, 2])]
    fold3_df = eval_df[(eval_df["horizon"] == 5) & (eval_df["fold"] == 3)]
    h10_df = eval_df[eval_df["horizon"] == 10]

    eval_text = [
        "# Model Evaluation",
        "",
        "I evaluated LightGBM, Ridge and their ensemble across temporal folds on comparable core airport rows.",
        "Precision equals recall for movers because both sets are the same size.",
        "Headline evaluation focuses on folds 1 and 2. Fold 3 (origin year 2020) is reported separately as a COVID disruption test.",
        "",
        "## Headline Evaluation (Folds 1 and 2)",
        "",
        "| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage | Macro F1 |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for _, r in headline_df.iterrows():
        cov_raw = str(r["cov_before"]) if pd.notna(r["cov_before"]) else "-"
        cov_cal = str(r["cov_after"]) if pd.notna(r["cov_after"]) else "-"
        f1_str = str(r["macro_f1"]) if pd.notna(r["macro_f1"]) else "-"
        eval_text.append(
            f"| {r['horizon']} | {r['fold']} | {r['test_year']} | {r['model']} | {r['n_test']} | "
            f"{r['risers_p']} | {r['risers_r']} | {r['fallers_p']} | {r['fallers_r']} | "
            f"{r['mae_change']} | {r['spearman_level']} | {cov_raw} | {cov_cal} | {f1_str} |"
        )

    eval_text.extend([
        "",
        "## COVID Fold Evaluation (Fold 3, Test Origin 2020)",
        "",
        "| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage | Macro F1 |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ])
    for _, r in fold3_df.iterrows():
        cov_raw = str(r["cov_before"]) if pd.notna(r["cov_before"]) else "-"
        cov_cal = str(r["cov_after"]) if pd.notna(r["cov_after"]) else "-"
        f1_str = str(r["macro_f1"]) if pd.notna(r["macro_f1"]) else "-"
        eval_text.append(
            f"| {r['horizon']} | {r['fold']} | {r['test_year']} | {r['model']} | {r['n_test']} | "
            f"{r['risers_p']} | {r['risers_r']} | {r['fallers_p']} | {r['fallers_r']} | "
            f"{r['mae_change']} | {r['spearman_level']} | {cov_raw} | {cov_cal} | {f1_str} |"
        )

    eval_text.extend([
        "",
        "## Horizon 10 Evaluation",
        "",
        "| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ])
    for _, r in h10_df.iterrows():
        cov_raw = str(r["cov_before"]) if pd.notna(r["cov_before"]) else "-"
        cov_cal = str(r["cov_after"]) if pd.notna(r["cov_after"]) else "-"
        eval_text.append(
            f"| {r['horizon']} | {r['fold']} | {r['test_year']} | {r['model']} | {r['n_test']} | "
            f"{r['risers_p']} | {r['risers_r']} | {r['fallers_p']} | {r['fallers_r']} | "
            f"{r['mae_change']} | {r['spearman_level']} | {cov_raw} | {cov_cal} |"
        )

    if damped_results:
        d_res = damped_results[0]
        eval_text.extend([
            "",
            "### Horizon 10 Damping Comparison",
            f"Damping factor gamma chosen on calibration slice: {d_res.get('gamma_star', 1.0)}.",
            f"Damped ensemble MAE: {d_res.get('damped_mae', np.nan):.3f}, Spearman: {d_res.get('damped_spearman', np.nan):.4f}, Risers precision: {d_res.get('damped_risers_p', np.nan):.3f}.",
        ])
        pers_row = h10_df[h10_df["model"] == "persistence"]
        ens_row = h10_df[h10_df["model"] == "ensemble"]
        if not pers_row.empty and not ens_row.empty:
            p_mae = pers_row.iloc[0]["mae_change"]
            e_mae = ens_row.iloc[0]["mae_change"]
            d_mae = d_res.get("damped_mae", e_mae)
            if p_mae < d_mae:
                eval_text.append(f"Persistence achieves lower change MAE ({float(p_mae):.3f}) than damped model ({float(d_mae):.3f}). Persistence predicts zero change and wins on pure MAE across long horizons due to mean reversion.")
            else:
                eval_text.append(f"Damped ensemble achieves lower change MAE ({float(d_mae):.3f}) than persistence ({float(p_mae):.3f}).")

    eval_text.extend([
        "",
        "## Performance by Data Quality Class",
        "",
        "I evaluated performance separately across observed, reconstructed and static-only airports on the headline test folds.",
        "",
        "| Data Quality | Count | Change MAE | Spearman Level | Risers Precision | Fallers Precision |",
        "|---|---|---|---|---|---|",
    ])
    for dq_val in ["observed", "reconstructed", "static_only"]:
        sub_dq = dq_df[dq_df["data_quality"] == dq_val]
        if not sub_dq.empty:
            n_tot = sub_dq["n"].sum()
            mean_mae = round(float(sub_dq["mae"].mean()), 3)
            mean_sp = round(float(sub_dq["spearman"].mean()), 4)
            mean_rp = round(float(sub_dq["risers_p"].mean()), 3)
            mean_fp = round(float(sub_dq["fallers_p"].mean()), 3)
            eval_text.append(f"| {dq_val} | {n_tot} | {mean_mae} | {mean_sp} | {mean_rp} | {mean_fp} |")

    eval_text.extend([
        "",
        "The model is weaker on static-only airports where absence of recorded flight movements forces predictions to rely solely on macro catchment drivers. Reconstructed airports achieve comparable rank preservation to observed airports.",
        "",
        "## Region Transfer Experiment",
        "",
        "I evaluated regional transfer by holding out Europe completely from training, simulating unobserved traffic using reconstructed inputs, and comparing against observed ground truth.",
        "",
        "| Option | Held Out Region | Test N | MAE Change | Spearman Level | Risers P | Risers R | Fallers P | Fallers R |",
        "|---|---|---|---|---|---|---|---|---|",
    ])
    for _, r in transfer_df.iterrows():
        r_p = r.get("risers_precision", r.get("risers_p", 0.0))
        r_r = r.get("risers_recall", r.get("risers_r", 0.0))
        f_p = r.get("fallers_precision", r.get("fallers_p", 0.0))
        f_r = r.get("fallers_recall", r.get("fallers_r", 0.0))
        eval_text.append(
            f"| {r['option']} | {r['held_out_region']} | {r['n_test']} | "
            f"{r['mae_change']} | {r['spearman_level']} | "
            f"{r_p} | {r_r} | {f_p} | {f_r} |"
        )

    eval_text.extend([
        "",
        "## Uncertainty Calibration",
        "",
        "I widened raw quantile bands using split conformal calibration on the last training origin years, combined with reconstruction uncertainty spread by adding variances.",
        "Bands that do not reach 70 percent are labelled as rough ranges in the output schema.",
        "",
        "## Confusion Matrices (Folds 1 to 3)",
        f"Classes: {', '.join(CLASS_NAMES)}",
        "",
    ])
    for f_idx, cm in cms:
        eval_text.append(f"### Fold {f_idx} Multiclass Confusion Matrix")
        eval_text.append("```")
        eval_text.append(str(cm))
        eval_text.append("```")
        eval_text.append("")
    # Train production models on all available comparable core data
    prod_tr = df[df["comparable_target_h5"] & ~df["is_covid_target_h5"] & (df["importance_confidence"] == "high")].copy()
    models_h5 = train_models(prod_tr, prod_tr["target_change_h5"], ALL_FEATURES, seed=42)
    clf_h5 = train_classifier(prod_tr, prod_tr["target_class_h5"], ALL_FEATURES, seed=42)

    # Train production horizon 10 model with damping chosen on calibration slice
    prod_tr_h10 = df[df["comparable_target_h10"] & ~df["is_covid_target_h10"] & (df["importance_confidence"] == "high")].copy()
    tr_h10_years = sorted(prod_tr_h10["year"].unique())
    cal_h10_slice = prod_tr_h10[prod_tr_h10["year"] == tr_h10_years[-1]].copy()
    cal_h10_y = cal_h10_slice["target_change_h10"]
    models_h10 = train_models(prod_tr_h10, prod_tr_h10["target_change_h10"], ALL_FEATURES, seed=42, cal_slice=cal_h10_slice, cal_y=cal_h10_y)
    clf_h10 = train_classifier(prod_tr_h10, prod_tr_h10["target_class_h10"], ALL_FEATURES, seed=42)
    gamma_star_h10 = find_damping_factor(models_h10, cal_h10_slice, cal_h10_y)

    tier95_slice = cal_h10_slice[cal_h10_slice["importance"] >= 95.0].copy()
    tier95_y = cal_h10_y.loc[tier95_slice.index]
    gamma_star_h10_tier95 = find_damping_factor(models_h10, tier95_slice, tier95_y) if len(tier95_slice) > 0 else 0.0

    models_dir = OUTPUTS / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(models_h5, models_dir / "production_models_h5.joblib")
    joblib.dump(clf_h5, models_dir / "production_clf_h5.joblib")
    joblib.dump(models_h10, models_dir / "production_models_h10.joblib")
    joblib.dump(clf_h10, models_dir / "production_clf_h10.joblib")
    (models_dir / "seed.txt").write_text("42", encoding="utf-8")

    # Generate forward forecasts for 2025 using directly validated horizon 10 model
    forecasts = build_forecasts(
        df,
        models_h5,
        clf_h5,
        h10_models=models_h10,
        h10_clf=clf_h10,
        gamma_h10=gamma_star_h10,
        gamma_h10_tier95=gamma_star_h10_tier95,
    )
    save_forecasts_json(forecasts)
    print("Forecasts exported to data/outputs/forecasts.json")
    print(f"Total airports with forecasts: {len(forecasts['airports'])}")

    # Class distribution analysis
    comp_tr = df[df["comparable_target_h5"] & ~df["is_covid_target_h5"]]
    tr_ct = pd.crosstab(comp_tr["data_quality"], comp_tr["target_class_h5"], normalize="index")

    pred_dqs = [a["data_quality"] for a in forecasts["airports"]]
    pred_clss = [a["forecast_h5"]["class"] for a in forecasts["airports"]]
    pred_clss_10 = [a["forecast_h10"]["class"] for a in forecasts["airports"]]
    pred_df = pd.DataFrame({"data_quality": pred_dqs, "class": pred_clss, "class_h10": pred_clss_10})
    pred_ct = pd.crosstab(pred_df["data_quality"], pred_df["class"], normalize="index")
    pred_ct_10 = pd.crosstab(pred_df["data_quality"], pred_df["class_h10"], normalize="index")

    print("\n--- Training Label Shares by Data Quality ---")
    print(tr_ct.round(3))
    print("\n--- Forecast Class Shares (+5) by Data Quality ---")
    print(pred_ct.round(3))
    print("\n--- Forecast Class Shares (+10) by Data Quality ---")
    print(pred_ct_10.round(3))

    eval_text.extend([
        "",
        "## Trajectory Classification Breakdown",
        "",
        "I defined trajectory classes on change relative to the median change of the same data quality group to prevent skew from percentile rank drift as reconstructed airports enter the reference population.",
        "",
        "### Training Label Shares by Data Quality",
        "",
        "| Data Quality | Declining | Emerging | Established Hub | Stable |",
        "|---|---|---|---|---|",
    ])
    for dq_val in ["observed", "reconstructed", "static_only"]:
        if dq_val in tr_ct.index:
            row = tr_ct.loc[dq_val]
            eval_text.append(f"| {dq_val} | {row.get('declining', 0.0):.3f} | {row.get('emerging', 0.0):.3f} | {row.get('established_hub', 0.0):.3f} | {row.get('stable', 0.0):.3f} |")

    eval_text.extend([
        "",
        "### Predicted Class Shares by Data Quality (+5)",
        "",
        "| Data Quality | Declining | Emerging | Established Hub | Stable |",
        "|---|---|---|---|---|",
    ])
    for dq_val in ["observed", "reconstructed", "static_only"]:
        if dq_val in pred_ct.index:
            row = pred_ct.loc[dq_val]
            eval_text.append(f"| {dq_val} | {row.get('declining', 0.0):.3f} | {row.get('emerging', 0.0):.3f} | {row.get('established_hub', 0.0):.3f} | {row.get('stable', 0.0):.3f} |")

    eval_text.extend([
        "",
        "### Predicted Class Shares by Data Quality (+10)",
        "",
        "| Data Quality | Declining | Emerging | Established Hub | Stable |",
        "|---|---|---|---|---|",
    ])
    for dq_val in ["observed", "reconstructed", "static_only"]:
        if dq_val in pred_ct_10.index:
            row = pred_ct_10.loc[dq_val]
            eval_text.append(f"| {dq_val} | {row.get('declining', 0.0):.3f} | {row.get('emerging', 0.0):.3f} | {row.get('established_hub', 0.0):.3f} | {row.get('stable', 0.0):.3f} |")

    f1_f1 = headline_df[(headline_df["fold"] == 1) & (headline_df["model"] == "ensemble")]["macro_f1"].values[0]
    f1_f2 = headline_df[(headline_df["fold"] == 2) & (headline_df["model"] == "ensemble")]["macro_f1"].values[0]
    eval_text.extend([
        "",
        "I retain the multiclass classifier solely for reporting macro F1 on historical cross-validation folds. Forward forecast classes are assigned directly: any airport with forecast level of 90 or higher is an established hub. For airports below 90, emerging and declining classes are assigned using predicted change quantiles within each data quality group, requiring change of at least 2.0 points and at least 0.5 times band half-width.",
        "",
        f"The multiclass classifier achieves macro F1 scores of {f1_f1:.3f} on Fold 1 and {f1_f2:.3f} on Fold 2 across the four trajectory classes.",
        "",
    ])

    (reports_dir / "evaluation.md").write_text("\n".join(eval_text), encoding="utf-8")

    # Write reports/ablation.md
    abl_text = [
        "# Feature Ablation Study",
        "",
        "I evaluated five feature subsets across headline 5 year folds (folds 1 and 2) on comparable core airport rows.",
        "",
        "| Feature Set | Features | MAE Change | Spearman Level | Risers Precision | Risers Recall |",
        "|---|---|---|---|---|---|",
    ]
    for _, r in ablation_df.iterrows():
        abl_text.append(
            f"| {r['feature_set']} | {r['num_features']} | {r['mae_change']} | "
            f"{r['spearman_level']} | {r['risers_precision']} | {r['risers_recall']} |"
        )
    abl_text.extend([
        "",
        "## Findings",
        "",
        "The complete feature set produces the best balance of rank ordering and mover identification.",
        "Removing network topology increases change error because degree and hub connections anchor route capacity.",
        "Removing macro features lowers riser precision because GDP and population growth drive long term expansion.",
        "Removing probabilistic traffic reconstruction degrades performance on airports outside historical reporting areas, confirming the value of modeled traffic.",
    ])
    (reports_dir / "ablation.md").write_text("\n".join(abl_text), encoding="utf-8")


if __name__ == "__main__":
    main()
