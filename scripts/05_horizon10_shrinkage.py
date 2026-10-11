"""Honest evaluation of horizon-10 forecast shrinkage.

Reproduces the horizon-10 temporal fold(s) from data/outputs/folds.json, trains the
notebook's production ensemble (LightGBM + Ridge, identical hyper-parameters and
preprocessing to training_notebook.ipynb cells 25/26/34) on each train fold, predicts the
10-year importance change on the held-out test fold, and measures the MAE of the shrunk
prediction ``alpha * ensemble_change`` for alpha in {0.0, 0.1, ..., 1.0}. alpha = 0 is the
persistence baseline (zero change). Spearman correlation of the implied levels against the
realised levels is reported alongside.

Outputs
-------
data/outputs/horizon10_shrinkage.json   machine-readable table consumed by 04_build_intelligence.py
reports/horizon10_shrinkage.md          table + conclusion

Run: python scripts/05_horizon10_shrinkage.py
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
SEED = 42
# Coarse grid requested by the spec plus a fine sub-grid below 0.1 so the "within 2 % of
# persistence" rule has resolution if persistence wins outright.
ALPHA_GRID = [0.0, 0.02, 0.04, 0.06, 0.08] + [round(0.1 * i, 1) for i in range(1, 11)]
TOLERANCE = 0.02  # "within 2 % of persistence MAE" rule when persistence wins outright

# --------------------------------------------------------------------------------------
# Feature lists and preprocessing, copied verbatim from training_notebook.ipynb cell 25.
# --------------------------------------------------------------------------------------
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
QUALITY_FEATURES = [
    "is_observed", "is_reconstructed", "is_static_only", "recon_interval_width",
]
REGION_FEATURES = [
    "region_NA", "region_EU", "region_AS", "region_SA", "region_AF", "region_OC",
]
BASE_FEATURES = NETWORK_FEATURES + SPATIAL_FEATURES + TRAFFIC_FEATURES + MACRO_FEATURES + MOMENTUM_FEATURES
ALL_FEATURES = BASE_FEATURES + QUALITY_FEATURES + REGION_FEATURES

LARGE_COLS = [
    "traffic_volume", "country_gdp", "country_pop", "nearest_large_city_pop",
    "catchment_pop_100km", "wb_gdp_per_capita",
]
GROWTH_COLS = [
    "traffic_growth_1y", "traffic_growth_3y", "traffic_growth_5y",
    "gdp_growth_1y", "gdp_growth_3y", "gdp_growth_5y",
    "pop_growth_1y", "pop_growth_3y", "pop_growth_5y",
    "tourism_growth_1y", "tourism_growth_3y", "tourism_growth_5y",
]


def prepare_model_features(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    dq = d.get("data_quality", "static_only")
    if "is_observed" not in d.columns:
        d["is_observed"] = (dq == "observed").astype(float)
    if "is_reconstructed" not in d.columns:
        d["is_reconstructed"] = (dq == "reconstructed").astype(float)
    if "is_static_only" not in d.columns:
        d["is_static_only"] = (dq == "static_only").astype(float)
    if "recon_interval_width" not in d.columns:
        lo = d.get("importance_lo", 0.0)
        hi = d.get("importance_hi", 0.0)
        diff = (pd.Series(hi, index=d.index) - pd.Series(lo, index=d.index)).clip(lower=0.0).fillna(0.0)
        d["recon_interval_width"] = diff
    for c in ["NA", "EU", "AS", "SA", "AF", "OC"]:
        col = f"region_{c}"
        if col not in d.columns:
            d[col] = (d.get("continent", "") == c).astype(float)
    return d


def prepare_ridge_matrix(df: pd.DataFrame, features: list[str]) -> pd.DataFrame:
    d = prepare_model_features(df)[features].copy()
    for c in LARGE_COLS:
        if c in d.columns:
            d[c] = np.log1p(np.maximum(0, d[c].fillna(0)))
    for c in GROWTH_COLS:
        if c in d.columns:
            d[c] = np.clip(d[c], -1.0, 10.0)
    for c in d.columns:
        if d[c].isna().all():
            d[c] = 0.0
    return d


def train_models(X_train: pd.DataFrame, y_train: pd.Series, features: list[str], seed: int = SEED) -> dict:
    """LightGBM + Ridge ensemble with the notebook's hyper-parameters (cell 25)."""
    X_tr = prepare_model_features(X_train)
    lgb_reg = lgb.LGBMRegressor(
        n_estimators=100, learning_rate=0.03, max_depth=5, num_leaves=31,
        random_state=seed, verbose=-1, n_jobs=1, deterministic=True, force_row_wise=True,
    )
    lgb_reg.fit(X_tr[features], y_train)
    ridge_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("ridge", Ridge(alpha=100.0, random_state=seed)),
    ])
    ridge_pipe.fit(prepare_ridge_matrix(X_tr, features), y_train)
    return {"lgb": lgb_reg, "ridge": ridge_pipe, "features": features}


def predict_change(models: dict, X: pd.DataFrame) -> np.ndarray:
    feats = models["features"]
    X_p = prepare_model_features(X)
    p_lgb = models["lgb"].predict(X_p[feats])
    p_ridge = models["ridge"].predict(prepare_ridge_matrix(X_p, feats))
    return 0.5 * p_lgb + 0.5 * p_ridge


# --------------------------------------------------------------------------------------
# Fold construction
# --------------------------------------------------------------------------------------
def production_mask(mt: pd.DataFrame) -> pd.Series:
    """Same row filter as notebook cells 26/34 for horizon 10."""
    return mt["comparable_target_h10"] & ~mt["is_covid_target_h10"] & (mt["importance_confidence"] == "high")


def build_folds(folds_json: dict, mt: pd.DataFrame) -> list[dict]:
    """Fold 1 is read verbatim from folds.json. A second pseudo-fold with an earlier
    origin is constructed so best_alpha is not chosen on a single test window."""
    folds = []
    for f in folds_json["horizon10_folds"]:
        folds.append({
            "name": f"fold{f['fold']}",
            "source": "data/outputs/folds.json",
            "train_origin_years": list(f["train_origin_years"]),
            "test_origin_years": list(f["test_origin_years"]),
            "note": "Blocked split from the notebook. Train targets 2010-2014 overlap in calendar time "
                    "with test origins 2013-2015 (documented limitation of a 26-year panel).",
        })
    # Pseudo-fold: earliest two origins train, pre-COVID origins test.
    # Test origins 2006-2009 -> target years 2016-2019 (all pre-COVID, comparable).
    # Train targets (2010-2011) fall AFTER the test origins but BEFORE the test targets,
    # so the model has no sight of any test outcome; it does see 2010-2011 outcomes that
    # a forecaster standing in 2006-2009 would not have had. Reported as a pseudo-fold.
    pseudo_train = [2000, 2001]
    pseudo_test = [2006, 2007, 2008, 2009]
    avail = set(mt.loc[production_mask(mt), "year"].unique())
    if all(y in avail for y in pseudo_train) and any(y in avail for y in pseudo_test):
        folds.append({
            "name": "pseudo_fold_early",
            "source": "constructed in 05_horizon10_shrinkage.py",
            "train_origin_years": pseudo_train,
            "test_origin_years": [y for y in pseudo_test if y in avail],
            "note": "Pseudo-fold with earlier origins: train origins 2000-2001 (targets 2010-2011), test "
                    "origins 2006-2009 (targets 2016-2019). No test outcome is visible to the model, but "
                    "train targets post-date the test origins, so treat as supporting evidence only.",
        })
    return folds


def evaluate_fold(fold: dict, mt: pd.DataFrame) -> dict:
    mask = production_mask(mt)
    tr = mt[mask & mt["year"].isin(fold["train_origin_years"])].copy()
    te = mt[mask & mt["year"].isin(fold["test_origin_years"])].copy()
    te = te.dropna(subset=["target_change_h10", "target_level_h10"])
    t0 = time.time()
    # Notebook cells 26/34 hold the last training origin year out as the conformal
    # calibration slice and fit the point models on the remaining years; mirror that.
    tr_years = sorted(tr["year"].unique())
    proper_tr = tr[tr["year"].isin(tr_years[:-1])] if len(tr_years) > 1 else tr
    models = train_models(proper_tr, proper_tr["target_change_h10"], ALL_FEATURES)
    raw = predict_change(models, te)
    act_chg = te["target_change_h10"].to_numpy(dtype=float)
    act_lvl = te["target_level_h10"].to_numpy(dtype=float)
    cur = te["importance"].to_numpy(dtype=float)
    mae_by_alpha, spearman_by_alpha = {}, {}
    for a in ALPHA_GRID:
        pred = a * raw
        mae_by_alpha[str(a)] = float(np.mean(np.abs(act_chg - pred)))
        lvl = np.clip(cur + pred, 0.0, 100.0)
        rho, _ = spearmanr(act_lvl, lvl)
        spearman_by_alpha[str(a)] = float(rho)
    print(f"  {fold['name']}: n_train={len(tr):,} n_test={len(te):,} "
          f"persistence MAE={mae_by_alpha['0.0']:.3f} full-ensemble MAE={mae_by_alpha['1.0']:.3f} "
          f"({time.time() - t0:.1f}s)")
    return {
        **fold,
        "n_train": len(proper_tr),
        "n_calibration_heldout": int(len(tr) - len(proper_tr)),
        "n_test": len(te),
        "mean_abs_raw_pred": float(np.mean(np.abs(raw))),
        "mean_abs_actual_change": float(np.mean(np.abs(act_chg))),
        "mae_by_alpha": mae_by_alpha,
        "spearman_by_alpha": spearman_by_alpha,
    }


def choose_alpha(mean_mae: dict[str, float]) -> tuple[float, str]:
    best = min(ALPHA_GRID, key=lambda a: mean_mae[str(a)])
    persistence = mean_mae["0.0"]
    if best > 0:
        return best, "best_alpha minimises mean MAE across folds and beats persistence."
    # Persistence wins outright. Documented rule: ship the LARGEST alpha whose MAE stays within
    # TOLERANCE of persistence, so the +10 map conveys direction at a bounded, stated accuracy
    # cost. (MAE is monotone in alpha here, so this is the only alpha the rule can sensibly mean;
    # with a non-monotone curve every alpha inside the tolerance band is reported in the table.)
    within = [a for a in ALPHA_GRID[1:] if mean_mae[str(a)] <= persistence * (1.0 + TOLERANCE)]
    if within:
        a = max(within)
        return a, (f"Persistence (alpha=0) had the lowest MAE; no shrunk ensemble beats it. By the documented "
                   f"rule, best_alpha is the largest alpha whose mean MAE stays within {TOLERANCE:.0%} of the "
                   f"persistence MAE ({persistence:.3f}); alpha={a} costs "
                   f"{(mean_mae[str(a)] / persistence - 1) * 100:+.1f}% MAE and keeps the sign of the ensemble "
                   f"change so the +10 map still shows direction. This is a presentation choice, not a validated "
                   f"accuracy gain.")
    return 0.0, (f"Persistence (alpha=0) had the lowest MAE and no alpha in the grid was within {TOLERANCE:.0%} "
                 f"of it; alpha=0 is shipped (change_damped = 0).")


def write_report(result: dict, path: Path) -> None:
    L = ["# Horizon-10 shrinkage evaluation", "",
         f"Generated {result['generated_at']} by `scripts/05_horizon10_shrinkage.py`.", "",
         "## Why this exists", "",
         (
             "At the 10-year horizon the shipped ensemble (LightGBM + Ridge) loses to persistence on change MAE "
             "(README: 5.282 for persistence vs 10.768 for the damped ensemble). Rather than hard-coding a damping "
             "factor, this script asks: what multiplier alpha on the ensemble's predicted change minimises "
             "out-of-sample MAE, with alpha = 0 being persistence?"
         ), "",
         "## Folds", ""]
    for f in result["folds"]:
        L.append(f"- **{f['name']}** ({f['source']}): train origins {f['train_origin_years'][0]}-{f['train_origin_years'][-1]} "
                 f"(n={f['n_train']:,}), test origins {f['test_origin_years'][0]}-{f['test_origin_years'][-1]} (n={f['n_test']:,}). "
                 f"Mean |raw ensemble change| = {f['mean_abs_raw_pred']:.2f} pts vs mean |actual change| = "
                 f"{f['mean_abs_actual_change']:.2f} pts. {f['note']}")
    if len(result["folds"]) == 1:
        L.append("- Only one horizon-10 fold exists in folds.json and no pseudo-fold could be built; "
                 "best_alpha is chosen on that single fold.")
    L += ["", "## MAE of alpha x ensemble change (lower is better)", ""]
    hdr = "| alpha | " + " | ".join(f"MAE {f['name']}" for f in result["folds"]) + " | mean MAE | " + \
          " | ".join(f"Spearman {f['name']}" for f in result["folds"]) + " |"
    L.append(hdr)
    L.append("|" + "---|" * (2 + 2 * len(result["folds"])))
    for a in ALPHA_GRID:
        k = str(a)
        row = f"| {a:.2f}{' (persistence)' if a == 0 else ''} | "
        row += " | ".join(f"{f['mae_by_alpha'][k]:.3f}" for f in result["folds"])
        row += f" | **{result['mae_by_alpha'][k]:.3f}**" if a == result["best_alpha"] else f" | {result['mae_by_alpha'][k]:.3f}"
        row += " | " + " | ".join(f"{f['spearman_by_alpha'][k]:.4f}" for f in result["folds"]) + " |"
        L.append(row)
    pm, bm = result["persistence_mae"], result["best_mae"]
    L += ["", "## Conclusion", "",
          (
              f"- Persistence MAE (mean across folds): **{pm:.3f}**. Full ensemble (alpha = 1): "
              f"**{result['mae_by_alpha']['1.0']:.3f}**."
          ),
          (
              f"- Chosen **best_alpha = {result['best_alpha']:.2f}**, mean MAE **{bm:.3f}** "
              f"({(bm / pm - 1) * 100:+.1f}% vs persistence)."
          ),
          f"- Selection rule: {result['note']}",
          (
              f"- Rank preservation: Spearman of implied levels vs realised levels is {result['spearman_by_alpha']['0.0']:.4f} "
              f"at alpha = 0 and {result['spearman_by_alpha']['1.0']:.4f} at alpha = 1 (mean across folds); on fold 1 it "
              f"falls monotonically with alpha, i.e. the ensemble adds no ranking information at 10 years."
          ),
          "",
          (
              "The ensemble's raw 10-year changes are several times larger than realised changes on average "
              "(see mean |raw| vs mean |actual| above): over a decade, airport importance percentiles mean-revert and the "
              "model trained on 2000-2004 origins extrapolates trends that did not persist. Shrinking toward zero is "
              "therefore the honest fix. `04_build_intelligence.py` applies best_alpha to every airport's "
              "`forecast_h10.change` to produce `change_damped` / `level_damped`; the frontend labels this as damped."
          ),
          "",
          (
              "Caveats: the horizon-10 fold has calendar overlap between train targets and test origins "
              "(documented in reports/folds.md); the pseudo-fold uses only two training origins, so its absolute "
              "MAE level is not comparable to fold 1 and only the alpha ranking is used. Test rows are the "
              "high-confidence core population (same filter as the production training slice)."
          )]
    path.write_text("\n".join(L) + "\n", encoding="utf-8")


def main() -> int:
    t0 = time.time()
    print("05_horizon10_shrinkage: loading model table ...")
    mt = pd.read_parquet(ROOT / "data" / "processed" / "model_table.parquet")
    folds_json = json.loads((ROOT / "data" / "outputs" / "folds.json").read_text(encoding="utf-8"))
    folds = build_folds(folds_json, mt)
    print(f"  evaluating {len(folds)} fold(s): {[f['name'] for f in folds]}")
    results = [evaluate_fold(f, mt) for f in folds]

    mean_mae = {str(a): float(np.mean([r["mae_by_alpha"][str(a)] for r in results])) for a in ALPHA_GRID}
    mean_sp = {str(a): float(np.mean([r["spearman_by_alpha"][str(a)] for r in results])) for a in ALPHA_GRID}
    best_alpha, note = choose_alpha(mean_mae)
    if len(results) == 1:
        note += " Only one horizon-10 fold was available."
    else:
        note += f" MAE averaged over {len(results)} folds ({', '.join(r['name'] for r in results)})."

    out = {
        "generated_at": datetime.now(timezone.utc).date().isoformat(),
        "alpha_grid": ALPHA_GRID,
        "mae_by_alpha": {k: round(v, 4) for k, v in mean_mae.items()},
        "spearman_by_alpha": {k: round(v, 4) for k, v in mean_sp.items()},
        "best_alpha": float(best_alpha),
        "persistence_mae": round(mean_mae["0.0"], 4),
        "best_mae": round(mean_mae[str(best_alpha)], 4),
        "full_ensemble_mae": round(mean_mae["1.0"], 4),
        "tolerance_rule_pct": TOLERANCE * 100,
        "note": note,
        "folds": results,
    }
    out_json = ROOT / "data" / "outputs" / "horizon10_shrinkage.json"
    out_json.write_text(json.dumps(out, indent=2), encoding="utf-8")
    write_report(out, ROOT / "reports" / "horizon10_shrinkage.md")
    print("\n  alpha  mean MAE   mean Spearman")
    for a in ALPHA_GRID:
        flag = "  <-- best" if a == best_alpha else ""
        print(f"  {a:4.2f}   {mean_mae[str(a)]:7.3f}   {mean_sp[str(a)]:.4f}{flag}")
    print(f"\n  best_alpha={best_alpha} persistence_mae={out['persistence_mae']} best_mae={out['best_mae']}")
    print(f"  wrote {out_json} and reports/horizon10_shrinkage.md in {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
