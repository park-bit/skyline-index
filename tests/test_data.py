import numpy as np
import pandas as pd
import pytest

from src.config import FIRST_YEAR, LAST_YEAR, PROCESSED


@pytest.fixture(scope="module")
def panel():
    path = PROCESSED / "airport_year_panel.parquet"
    assert path.exists(), f"missing processed panel at {path}"
    return pd.read_parquet(path)


def test_no_duplicate_airport_and_year(panel):
    duplicates = panel.duplicated(subset=["iata", "year"]).sum()
    assert duplicates == 0, f"found {duplicates} duplicate airport-year pairs"


def test_coordinates_within_valid_bounds(panel):
    bad_lat = panel[(panel["latitude"] < -90.0) | (panel["latitude"] > 90.0)]
    bad_lon = panel[(panel["longitude"] < -180.0) | (panel["longitude"] > 180.0)]
    assert len(bad_lat) == 0, f"found {len(bad_lat)} rows with latitude outside [-90, 90]"
    assert len(bad_lon) == 0, f"found {len(bad_lon)} rows with longitude outside [-180, 180]"


def test_passengers_and_route_counts_never_negative(panel):
    non_negative_cols = [
        "faa_enplanements",
        "eurostat_passengers",
        "opensky_flights",
        "opensky_departures",
        "opensky_arrivals",
        "opensky_destinations",
        "of_routes_out",
        "of_routes_in",
        "of_routes_total",
        "of_intl_routes",
        "of_domestic_routes",
        "wb_air_passengers",
        "catchment_pop_100km",
        "max_runway_ft",
    ]
    for col in non_negative_cols:
        if col in panel.columns:
            series = panel[col].dropna()
            neg_count = (series < 0).sum()
            assert neg_count == 0, f"column {col} contains {neg_count} negative values"


def test_iata_codes_format(panel):
    invalid = panel[~panel["iata"].str.fullmatch(r"[A-Z]{3}")]
    assert len(invalid) == 0, f"found {len(invalid)} non-standard IATA codes"


def test_year_range_matches_data_sources(panel):
    assert panel["year"].min() == FIRST_YEAR, f"expected start year {FIRST_YEAR}, got {panel['year'].min()}"
    assert panel["year"].max() == LAST_YEAR, f"expected end year {LAST_YEAR}, got {panel['year'].max()}"
    expected_years = set(range(FIRST_YEAR, LAST_YEAR + 1))
    assert set(panel["year"].unique()) == expected_years


def test_minimum_airports_with_ten_plus_years_of_data(panel):
    # Over 1500 airports must have at least 10 years of observed airport traffic.
    traffic_obs = panel.dropna(subset=["faa_enplanements", "eurostat_passengers"], how="all")
    airports_with_10_yrs_traffic = traffic_obs.groupby("iata")["year"].nunique()
    count = (airports_with_10_yrs_traffic >= 10).sum()
    assert count >= 1500, f"expected at least 1500 airports with 10+ years of traffic data, found {count}"

    # Over 8000 airports must have at least 10 years of national passenger context.
    macro_obs = panel.dropna(subset=["wb_air_passengers"])
    airports_with_10_yrs_macro = macro_obs.groupby("iata")["year"].nunique()
    count_macro = (airports_with_10_yrs_macro >= 10).sum()
    assert count_macro >= 8000, f"expected at least 8000 airports with 10+ years of macro data, found {count_macro}"


def test_spot_check_major_global_hubs(panel):
    hubs = {
        "ATL": {"country": "US", "min_routes": 200, "min_faa": 40_000_000},
        "LHR": {"country": "GB", "min_routes": 200, "min_euro": 60_000_000},
        "DXB": {"country": "AE", "min_routes": 200, "min_wb": 50_000_000},
        "HND": {"country": "JP", "min_routes": 50, "min_wb": 80_000_000},
        "DEL": {"country": "IN", "min_routes": 100, "min_wb": 80_000_000},
    }

    for iata, checks in hubs.items():
        subset = panel[panel["iata"] == iata]
        assert len(subset) == (LAST_YEAR - FIRST_YEAR + 1), f"{iata} missing year rows"

        latest = subset[subset["year"] == 2019].iloc[0]
        assert latest["country_code"] == checks["country"], f"{iata} wrong country code"
        assert latest["of_routes_total"] >= checks["min_routes"], f"{iata} route count too low"

        if "min_faa" in checks:
            assert latest["faa_enplanements"] >= checks["min_faa"], f"{iata} enplanements too low"
        if "min_euro" in checks:
            assert latest["eurostat_passengers"] >= checks["min_euro"], f"{iata} eurostat count too low"
        if "min_wb" in checks:
            assert latest["wb_air_passengers"] >= checks["min_wb"], f"{iata} country passengers too low"
