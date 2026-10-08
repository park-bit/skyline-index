import numpy as np
import pandas as pd
import pytest

from src.config import PROCESSED, SENSITIVITY_SPEARMAN_THRESHOLD
from src.importance import compute_importance_index, run_sensitivity_analysis


@pytest.fixture(scope="module")
def model_table():
    path = PROCESSED / "model_table.parquet"
    if not path.exists():
        pytest.skip("model_table.parquet not found")
    return pd.read_parquet(path)


def test_index_values_within_bounds_and_no_nan_for_model_airports(model_table):
    model_airports = model_table[model_table["components_used"] >= 2]
    scores = model_airports["importance"]

    assert scores.notna().all(), "found NaN index value among modelled airports"
    assert (scores >= 0.0).all(), "found negative index value"
    assert (scores <= 100.0).all(), "found index value exceeding 100"


def test_reweighting_never_scores_zero_components():
    dummy = pd.DataFrame({
        "iata": ["ZZZ"],
        "year": [2020],
        "country_code": ["ZZ"],
        "of_routes_total": [np.nan],
        "of_routes_weighted": [np.nan],
        "of_pagerank": [np.nan],
        "of_betweenness": [np.nan],
        "of_top50_hub_links": [np.nan],
        "of_countries_reached": [np.nan],
        "eurostat_passengers": [np.nan],
        "faa_enplanements": [np.nan],
        "opensky_flights": [np.nan],
        "nearest_large_city_pop": [np.nan],
        "catchment_pop_100km": [np.nan],
        "wb_gdp_usd": [np.nan],
        "imf_gdp_per_capita_usd": [np.nan],
        "imf_population_millions": [np.nan],
        "wb_gdp_per_capita": [np.nan],
        "wb_tourism_arrivals": [np.nan],
        "wb_population": [np.nan],
        "un_pop_thousands": [np.nan],
    })
    scored = compute_importance_index(dummy)
    assert scored.loc[0, "components_used"] == 0
    assert np.isnan(scored.loc[0, "importance_raw"])


def test_sensitivity_spearman_above_threshold(model_table):
    years = [2005, 2015, 2025]
    sample_panel = model_table[model_table["year"].isin(years)].copy()
    sens = run_sensitivity_analysis(sample_panel, n_trials=20, seed=42)
    median_spearman = sens["mean_spearman"].median()

    assert median_spearman >= SENSITIVITY_SPEARMAN_THRESHOLD, (
        f"Spearman median {median_spearman:.4f} fell below threshold {SENSITIVITY_SPEARMAN_THRESHOLD}"
    )


def test_top_hubs_sanity_in_latest_year(model_table):
    p25 = model_table[model_table["year"] == 2025]
    comm = p25[p25["components_used"] >= 2].copy()
    comm["rank"] = comm["importance"].rank(ascending=False, method="min")

    hubs = ["ATL", "DXB", "LHR", "HND", "PEK"]
    for h in hubs:
        row = comm[comm["iata"] == h]
        assert not row.empty, f"hub airport {h} is missing from the panel"
        rank = int(row["rank"].values[0])
        assert rank <= 30, f"hub {h} ranked {rank}, expected rank <= 30"
