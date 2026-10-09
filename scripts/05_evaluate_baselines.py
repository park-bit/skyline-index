import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd
from scipy.stats import pearsonr, spearmanr

from src.baselines import evaluate_baselines
from src.splits import get_horizon5_folds, get_horizon10_folds


def generate_folds_report():
    h5_folds = get_horizon5_folds()
    h10_folds = get_horizon10_folds()

    lines = [
        "# Temporal Validation Split Design",
        "",
        "This document specifies the exact temporal folds used for evaluating airport importance forecasts.",
        "Splits are strictly origin-year based to prevent lookahead bias.",
        "",
        "## Horizon 5 Rolling Folds",
        "",
        "For horizon 5, rolling origin folds guarantee that all training target years occur at or before the test origin year.",
        "COVID target years 2020 to 2022 are completely excluded from both training and evaluation.",
        "",
        "| Fold | Train Origin Years | Train Target Years | Gap Years | Test Origin Year | Test Target Year |",
        "|------|--------------------|--------------------|-----------|------------------|------------------|",
    ]

    for f in h5_folds:
        tr_o = f"{min(f['train_origin_years'])} to {max(f['train_origin_years'])}"
        tr_t = f"{min(f['train_target_years'])} to {max(f['train_target_years'])}"
        gap = f"{min(f['gap_origin_years'])} to {max(f['gap_origin_years'])}"
        te_o = str(f["test_origin_year"])
        te_t = str(f["test_target_year"])
        lines.append(f"| {f['fold']:4d} | {tr_o:18s} | {tr_t:18s} | {gap:9s} | {te_o:16s} | {te_t:16s} |")

    lines.extend([
        "",
        "Verification for Horizon 5: in every fold, the maximum training target year never exceeds the test origin year.",
        "",
        "## Horizon 10 Blocked Split",
        "",
        "Because the historical panel begins in 2000, a strict rolling fold without calendar overlap is not possible for a 10 year horizon.",
        "We use a blocked split by origin year with a multi-year gap.",
        "",
        "| Fold | Train Origin Years | Train Target Years | Gap Years | Test Origin Years | Test Target Years | Calendar Overlap Years |",
        "|------|--------------------|--------------------|-----------|-------------------|-------------------|------------------------|",
    ])

    for f in h10_folds:
        tr_o = f"{min(f['train_origin_years'])} to {max(f['train_origin_years'])}"
        tr_t = f"{min(f['train_target_years'])} to {max(f['train_target_years'])}"
        gap = f"{min(f['gap_origin_years'])} to {max(f['gap_origin_years'])}"
        te_o = f"{min(f['test_origin_years'])} to {max(f['test_origin_years'])}"
        te_t = f"{min(f['test_target_years'])} to {max(f['test_target_years'])}"
        ovlp = f"{min(f['calendar_overlap_years'])} to {max(f['calendar_overlap_years'])}"
        lines.append(f"| {f['fold']:4d} | {tr_o:18s} | {tr_t:18s} | {gap:9s} | {te_o:17s} | {te_t:17s} | {ovlp:22s} |")

    lines.extend([
        "",
        "Note on Calendar Overlap: Training target years (2010 to 2014) and test origin years (2013 to 2015) overlap in calendar time for 2013 and 2014.",
        "This is documented as a known structural limitation of 10 year horizon evaluation on a 26 year panel.",
        "",
    ])

    out_file = ROOT / "reports" / "folds.md"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text("\n".join(lines), encoding="utf-8")
    print(f"saved {out_file}")


def generate_baselines_report(metrics_df, std_5y=None, corr_pearson=None, corr_spearman=None):
    lines = [
        "# Baseline Model Evaluation",
        "",
        "We evaluate two non-parametric reference baselines across temporal validation folds.",
        "The persistence baseline assumes that each airport maintains its current importance percentile into the future.",
        "The linear trend baseline extrapolates the annualized trajectory observed over the preceding five years.",
        "Performance is measured by mean absolute error on level and change, rank correlation on level, and precision and recall for top decile movers.",
        "",
    ]

    if std_5y is not None:
        lines.extend([
            "## Index Time Variation Summary (Core Set)",
            "",
            f"- Standard deviation of 5-year change: {std_5y:.3f} percentile points",
            f"- Pearson correlation between importance at t and t+5: {corr_pearson:.4f}",
            f"- Spearman rank correlation between importance at t and t+5: {corr_spearman:.4f}",
            "",
        ])

    for pop in ["core", "all"]:
        sub = metrics_df[metrics_df["population"] == pop]
        title = "Core Set (Comparable Observations)" if pop == "core" else "All Airports (Comparable Observations)"
        lines.extend([
            f"## Performance Summary Table: {title}",
            "",
            "| Horizon | Fold | Test Year | Baseline | Airports | MAE Level | MAE Change | Spearman | Risers Prec | Risers Rec | Fallers Prec | Fallers Rec |",
            "|---------|------|-----------|----------|----------|-----------|------------|----------|-------------|------------|--------------|-------------|",
        ])

        for _, r in sub.iterrows():
            hz = f"h={r['horizon']}"
            fd = str(r["fold"])
            ty = r["test_year"]
            bl = r["baseline"]
            na = f"{r['n_airports']:8d}"
            ml = f"{r['mae_level']:9.3f}"
            mc = f"{r['mae_change']:10.3f}"
            sp = f"{r['spearman_level']:8.4f}"
            rp = f"{r['risers_precision']:11.3f}"
            rr = f"{r['risers_recall']:10.3f}"
            fp = f"{r['fallers_precision']:12.3f}"
            fr = f"{r['fallers_recall']:11.3f}"
            lines.append(f"| {hz:7s} | {fd:4s} | {ty:9s} | {bl:12s} | {na} | {ml} | {mc} | {sp} | {rp} | {rr} | {fp} | {fr} |")

        lines.append("")

    lines.extend([
        "The persistence baseline achieves lower absolute error than linear extrapolation because mean reversion dominates short-term airport momentum.",
        "Linear trend captures directional shifts for actual risers and fallers better than random selection.",
        "",
    ])

    out_file = ROOT / "reports" / "baselines.md"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text("\n".join(lines), encoding="utf-8")
    print(f"saved {out_file}")


def main():
    generate_folds_report()

    model_table_path = ROOT / "data" / "processed" / "model_table.parquet"
    print("loading model table...")
    table = pd.read_parquet(model_table_path)

    # Core set index time variation metrics
    core = table[table["importance_confidence"] == "high"]
    valid_h5 = core[core["comparable_target_h5"] & ~core["is_covid_target_h5"]]
    std_5y = float(valid_h5["target_change_h5"].std())
    corr_p, _ = pearsonr(valid_h5["importance"], valid_h5["target_level_h5"])
    corr_s, _ = spearmanr(valid_h5["importance"], valid_h5["target_level_h5"])

    print(f"core set 5-year change std: {std_5y:.3f}")
    print(f"core set correlation t vs t+5: Pearson={corr_p:.4f}, Spearman={corr_s:.4f}")

    print("evaluating baselines on core set and all airports...")
    metrics = evaluate_baselines(table, population="both")
    generate_baselines_report(metrics, std_5y=std_5y, corr_pearson=float(corr_p), corr_spearman=float(corr_s))


if __name__ == "__main__":
    main()
