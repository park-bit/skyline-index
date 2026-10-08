import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from src.splits import get_horizon5_folds, get_horizon10_folds

FIGURES_DIR = ROOT / "reports" / "figures"
FIGURES_DIR.mkdir(parents=True, exist_ok=True)


def plot_top20_airports(df):
    years = [2005, 2015, 2025]
    fig, axes = plt.subplots(1, 3, figsize=(15, 7), sharex=True)

    for ax, yr in zip(axes, years):
        yr_df = df[df["year"] == yr].sort_values("importance", ascending=False).head(20)
        labels = [f"{r['iata']} ({r['country_code']})" for _, r in yr_df.iterrows()]
        y_pos = np.arange(len(labels))
        ax.barh(y_pos, yr_df["importance"].values, color="#1f77b4", alpha=0.85)
        ax.set_yticks(y_pos)
        ax.set_yticklabels(labels, fontsize=8)
        ax.invert_yaxis()
        ax.set_title(f"Year {yr}", fontsize=11, fontweight="bold")
        ax.set_xlabel("Importance Index (0-100)")
        ax.grid(axis="x", linestyle="--", alpha=0.5)

    fig.suptitle("Top 20 Global Airports by Importance Index (2005, 2015, 2025)", fontsize=13)
    plt.tight_layout()
    out_file = FIGURES_DIR / "top20_airports_2005_2015_2025.png"
    plt.savefig(out_file, dpi=150)
    plt.close()
    print(f"saved {out_file}")


def plot_index_vs_passengers(df):
    sub = df[df["traffic_volume"].notna() & (df["traffic_volume"] > 1000) & (df["year"] == 2019)].copy()
    fig, ax = plt.subplots(figsize=(8, 6))

    psgr_millions = sub["traffic_volume"] / 1e6
    ax.scatter(sub["importance"], psgr_millions, alpha=0.35, color="#2ca02c", edgecolors="none", s=25)
    ax.set_yscale("log")
    ax.set_xlabel("Airport Importance Index (0-100)", fontsize=10)
    ax.set_ylabel("Annual Passenger Throughput (Millions, Log Scale)", fontsize=10)
    ax.set_title("Airport Importance Index vs Observed Passenger Traffic (2019)", fontsize=11, fontweight="bold")
    ax.grid(True, linestyle="--", alpha=0.5)

    hubs = ["ATL", "DXB", "LHR", "HND", "PEK", "ORD", "CDG"]
    for h in hubs:
        row = sub[sub["iata"] == h]
        if not row.empty:
            r = row.iloc[0]
            ax.annotate(
                h,
                (r["importance"], r["traffic_volume"] / 1e6),
                xytext=(5, 5),
                textcoords="offset points",
                fontsize=9,
                fontweight="bold",
            )

    plt.tight_layout()
    out_file = FIGURES_DIR / "index_vs_passengers.png"
    plt.savefig(out_file, dpi=150)
    plt.close()
    print(f"saved {out_file}")


def plot_target_change_distribution(df):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5), sharey=True)

    chg5 = df.dropna(subset=["target_change_h5"])["target_change_h5"]
    chg10 = df.dropna(subset=["target_change_h10"])["target_change_h10"]

    ax1.hist(chg5, bins=50, color="#1f77b4", alpha=0.75, density=True)
    ax1.axvline(2.0, color="green", linestyle="--", label="Emerging threshold (+2.0)")
    ax1.axvline(-2.0, color="red", linestyle="--", label="Declining threshold (-2.0)")
    ax1.set_title("5-Year Horizon Target Change Distribution", fontsize=11, fontweight="bold")
    ax1.set_xlabel("Target Change (Percentile Shift)")
    ax1.set_ylabel("Density")
    ax1.legend(loc="upper left", fontsize=8)
    ax1.grid(True, linestyle="--", alpha=0.5)

    ax2.hist(chg10, bins=50, color="#ff7f0e", alpha=0.75, density=True)
    ax2.axvline(2.0, color="green", linestyle="--", label="Emerging threshold (+2.0)")
    ax2.axvline(-2.0, color="red", linestyle="--", label="Declining threshold (-2.0)")
    ax2.set_title("10-Year Horizon Target Change Distribution", fontsize=11, fontweight="bold")
    ax2.set_xlabel("Target Change (Percentile Shift)")
    ax2.legend(loc="upper left", fontsize=8)
    ax2.grid(True, linestyle="--", alpha=0.5)

    plt.tight_layout()
    out_file = FIGURES_DIR / "distribution_of_target_change.png"
    plt.savefig(out_file, dpi=150)
    plt.close()
    print(f"saved {out_file}")


def plot_class_counts_per_fold(df):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

    classes = ["stable", "emerging", "declining", "established_hub"]
    colors = ["#1f77b4", "#2ca02c", "#d62728", "#9467bd"]

    # Horizon 5 folds.
    h5_folds = get_horizon5_folds()
    fold_names_h5 = [f"Fold {f['fold']} ({f['test_origin_year']})" for f in h5_folds]
    counts_h5 = {c: [] for c in classes}
    for f in h5_folds:
        test_df = df[df["year"] == f["test_origin_year"]].dropna(subset=["target_class_h5"])
        for c in classes:
            counts_h5[c].append((test_df["target_class_h5"] == c).sum())

    x = np.arange(len(fold_names_h5))
    width = 0.2
    for i, c in enumerate(classes):
        ax1.bar(x + i * width, counts_h5[c], width=width, label=c, color=colors[i], alpha=0.85)

    ax1.set_xticks(x + 1.5 * width)
    ax1.set_xticklabels(fold_names_h5)
    ax1.set_title("Horizon 5 Test Set Trajectory Class Counts", fontsize=11, fontweight="bold")
    ax1.set_ylabel("Airports")
    ax1.legend(fontsize=8)
    ax1.grid(axis="y", linestyle="--", alpha=0.5)

    # Horizon 10 blocked fold.
    h10_folds = get_horizon10_folds()
    fold_names_h10 = [f"Fold {f['fold']} (2013-2015)" for f in h10_folds]
    counts_h10 = {c: [] for c in classes}
    for f in h10_folds:
        test_df = df[df["year"].isin(f["test_origin_years"])].dropna(subset=["target_class_h10"])
        for c in classes:
            counts_h10[c].append((test_df["target_class_h10"] == c).sum())

    x10 = np.arange(len(fold_names_h10))
    for i, c in enumerate(classes):
        ax2.bar(x10 + i * width, counts_h10[c], width=width, label=c, color=colors[i], alpha=0.85)

    ax2.set_xticks(x10 + 1.5 * width)
    ax2.set_xticklabels(fold_names_h10)
    ax2.set_title("Horizon 10 Test Set Trajectory Class Counts", fontsize=11, fontweight="bold")
    ax2.legend(fontsize=8)
    ax2.grid(axis="y", linestyle="--", alpha=0.5)

    plt.tight_layout()
    out_file = FIGURES_DIR / "class_counts_per_fold.png"
    plt.savefig(out_file, dpi=150)
    plt.close()
    print(f"saved {out_file}")


def main():
    model_table_path = ROOT / "data" / "processed" / "model_table.parquet"
    print("loading model table...")
    df = pd.read_parquet(model_table_path)

    plot_top20_airports(df)
    plot_index_vs_passengers(df)
    plot_target_change_distribution(df)
    plot_class_counts_per_fold(df)


if __name__ == "__main__":
    main()
