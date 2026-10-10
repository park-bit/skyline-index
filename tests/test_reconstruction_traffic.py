import numpy as np
import pandas as pd
import pytest

from src.config import PROCESSED, ROOT


@pytest.fixture(scope="module")
def traffic_table():
    path = PROCESSED / "traffic_reconstructed.parquet"
    if not path.exists():
        pytest.skip("traffic_reconstructed.parquet missing")
    return pd.read_parquet(path)


def test_reconstructed_traffic_table_structure_and_ordering(traffic_table):
    expected_cols = [
        "iata",
        "year",
        "traffic_recon",
        "traffic_recon_lo",
        "traffic_recon_hi",
        "traffic_source",
        "traffic_share",
    ]
    for c in expected_cols:
        assert c in traffic_table.columns, f"missing column {c}"

    assert (traffic_table["traffic_recon"] >= 0).all()
    # Uncertainty intervals strictly order lower <= point <= upper
    assert (traffic_table["traffic_recon_lo"] <= traffic_table["traffic_recon"] + 1e-3).all()
    assert (traffic_table["traffic_recon"] <= traffic_table["traffic_recon_hi"] + 1e-3).all()

    # Sources must only be observed or reconstructed
    assert set(traffic_table["traffic_source"].unique()).issubset({"observed", "reconstructed"})


def test_shares_sum_to_national_totals_within_tolerance(traffic_table):
    panel_path = PROCESSED / "airport_year_panel.parquet"
    if not panel_path.exists():
        pytest.skip("airport_year_panel.parquet missing")
    panel = pd.read_parquet(panel_path)
    m = panel[["iata", "year", "country_code"]].merge(traffic_table, on=["iata", "year"])

    # Sum of shares per country and year must equal 1.0 within tolerance for active commercial airports
    share_sums = m.groupby(["country_code", "year"])["traffic_share"].sum()
    valid_sums = share_sums[share_sums > 0]
    assert np.allclose(valid_sums, 1.0, atol=1e-3)


def test_observed_and_reconstructed_sources_assignment(traffic_table):
    # US and major EU hubs must be marked as observed in modern years
    us_atl = traffic_table[(traffic_table["iata"] == "ATL") & (traffic_table["year"] == 2019)]
    if not us_atl.empty:
        assert us_atl["traffic_source"].iloc[0] == "observed"

    # Unobserved countries should have reconstructed entries
    unobserved = traffic_table[traffic_table["traffic_source"] == "reconstructed"]
    assert not unobserved.empty
    assert (unobserved["traffic_recon"] >= 0).all()


def test_traffic_reconstruction_report_contents():
    report_path = ROOT / "reports" / "reconstruction_traffic.md"
    assert report_path.exists(), "reconstruction_traffic.md missing"
    text = report_path.read_text(encoding="utf-8")

    assert "Leave-One-Country-Out Validation" in text
    assert "Leave-One-Region-Out and Baseline Comparison" in text
    assert "Gradient Boosting Model" in text
    assert "Equal Split Baseline" in text
    assert "City Population Split" in text
