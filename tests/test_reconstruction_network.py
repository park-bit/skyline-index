import pandas as pd
import pytest

from src.config import PROCESSED, ROOT


@pytest.fixture(scope="module")
def network_table():
    path = PROCESSED / "network_reconstructed.parquet"
    if not path.exists():
        pytest.skip("network_reconstructed.parquet missing")
    return pd.read_parquet(path)


def test_reconstructed_network_table_schema_and_values(network_table):
    expected_cols = [
        "iata",
        "year",
        "exp_routes_total",
        "exp_top50_hub_links",
        "exp_countries_reached",
        "exp_pagerank",
        "std_pagerank",
    ]
    for col in expected_cols:
        assert col in network_table.columns, f"missing column {col}"

    assert (network_table["exp_routes_total"] >= 0).all()
    assert (network_table["exp_top50_hub_links"] >= 0).all()
    assert (network_table["exp_countries_reached"] >= 0).all()
    assert (network_table["exp_pagerank"] >= 0).all()
    assert (network_table["std_pagerank"] >= 0).all()


def test_as_of_invariance_network_features(network_table):
    sample_iata = "ATL"
    row_2010 = network_table[(network_table["iata"] == sample_iata) & (network_table["year"] == 2010)]
    assert not row_2010.empty
    assert row_2010["exp_routes_total"].iloc[0] > 0


def test_network_reconstruction_report_contents():
    report_path = ROOT / "reports" / "reconstruction_network.md"
    assert report_path.exists(), "reconstruction_network.md missing"
    text = report_path.read_text(encoding="utf-8")

    assert "Held-Out Validation" in text
    assert "Out-of-Time Validation" in text
    assert "Regional Transfer Validation" in text
    assert "Gravity Model AUC" in text
    assert "Combined Model ROC AUC" in text
    assert "Negative pairs were sampled to match the distance band" in text
