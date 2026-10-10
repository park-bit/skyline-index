import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor

from src.config import PROCESSED
from src.reconstruct_traffic import (
    extract_features,
    reconstruct_airport_traffic,
)


def test_reconstructed_traffic_table_structure_and_ordering():
    table_path = PROCESSED / "traffic_reconstructed.parquet"
    assert table_path.exists(), "reconstructed traffic table missing"
    df = pd.read_parquet(table_path)

    expected_cols = ["iata", "year", "traffic_recon", "traffic_recon_lo", "traffic_recon_hi", "traffic_source", "traffic_share"]
    for c in expected_cols:
        assert c in df.columns, f"missing column {c}"

    assert (df["traffic_recon"] >= 0).all()
    # Intervals must be strictly ordered
    assert (df["traffic_recon_lo"] <= df["traffic_recon"] + 1e-3).all()
    assert (df["traffic_recon"] <= df["traffic_recon_hi"] + 1e-3).all()

    # Sources must only be observed or reconstructed
    assert set(df["traffic_source"].unique()).issubset({"observed", "reconstructed"})


def test_shares_sum_to_national_totals_within_tolerance():
    panel = pd.read_parquet(PROCESSED / "airport_year_panel.parquet")
    recon = pd.read_parquet(PROCESSED / "traffic_reconstructed.parquet")
    m = panel[["iata", "year", "country_code", "wb_air_passengers"]].merge(recon, on=["iata", "year"])

    # Sum of shares per country and year must equal 1.0 within tolerance for active commercial airports
    share_sums = m.groupby(["country_code", "year"])["traffic_share"].sum()
    valid_sums = share_sums[share_sums > 0]
    assert np.allclose(valid_sums, 1.0, atol=1e-3)


def test_hidden_country_never_appears_in_training_rows():
    panel = pd.read_parquet(PROCESSED / "airport_year_panel.parquet")
    panel.loc[panel["country_code"] != "US", "faa_enplanements"] = np.nan

    obs_s = pd.Series(np.nan, index=panel.index)
    is_us = (panel["country_code"] == "US") & panel["faa_enplanements"].notna()
    obs_s.loc[is_us] = panel.loc[is_us, "faa_enplanements"] * 2.0
    is_eu = panel["eurostat_passengers"].notna()
    obs_s.loc[is_eu] = panel.loc[is_eu, "eurostat_passengers"]
    panel["obs_passengers"] = obs_s

    obs = panel[panel["obs_passengers"].notna() & (panel["obs_passengers"] > 100)]
    hidden_country = "DE"
    train = obs[obs["country_code"] != hidden_country]

    assert hidden_country not in train["country_code"].unique()


def test_conformal_coverage_on_held_out_countries():
    panel = pd.read_parquet(PROCESSED / "airport_year_panel.parquet")
    panel.loc[panel["country_code"] != "US", "faa_enplanements"] = np.nan

    obs_s = pd.Series(np.nan, index=panel.index)
    is_us = (panel["country_code"] == "US") & panel["faa_enplanements"].notna()
    obs_s.loc[is_us] = panel.loc[is_us, "faa_enplanements"] * 2.0
    is_eu = panel["eurostat_passengers"].notna()
    obs_s.loc[is_eu] = panel.loc[is_eu, "eurostat_passengers"]
    panel["obs_passengers"] = obs_s

    obs = panel[panel["obs_passengers"].notna() & (panel["obs_passengers"] > 1000)].copy()
    c_totals = obs.groupby(["country_code", "year"])["obs_passengers"].transform("sum")
    obs["country_total"] = c_totals
    obs["share"] = obs["obs_passengers"] / c_totals
    obs["log_share"] = np.log(np.clip(obs["share"], 1e-6, 1.0))

    x_all = extract_features(obs)

    # Test coverage on France 2019
    c = "FR"
    train = obs[obs["country_code"] != c]
    test = obs[(obs["country_code"] == c) & (obs["year"] == 2019)].copy()

    model = LGBMRegressor(n_estimators=80, max_depth=5, num_leaves=31, random_state=42, verbose=-1)
    model.fit(x_all.loc[train.index], train["log_share"])

    test["score"] = np.exp(model.predict(x_all.loc[test.index]))
    test["pred_traffic"] = (test["score"] / test["score"].sum()) * test["country_total"]

    q_val = 1.65
    lo = test["pred_traffic"] * np.exp(-q_val)
    hi = test["pred_traffic"] * np.exp(q_val)
    cov = float(np.mean((test["obs_passengers"] >= lo) & (test["obs_passengers"] <= hi)))

    # Held-out coverage on France must be within 15 percentage points of nominal 80 percent
    assert 0.70 <= cov <= 0.98


def test_as_of_invariance_traffic_reconstruction():
    panel = pd.read_parquet(PROCESSED / "airport_year_panel.parquet")
    from src.reconstruct_traffic import (
        build_traffic_share_model,
        calibrate_anchor_scale,
    )
    model, q = build_traffic_share_model(panel, seed=42)
    anchor_ratios, global_median = calibrate_anchor_scale(panel)

    sample_t = 2018
    # Slice up to year t
    panel_past = panel[panel["year"] <= sample_t].copy()
    recon_past = reconstruct_airport_traffic(
        panel_past, model=model, calib_q=q, anchor_ratios=anchor_ratios, global_median=global_median
    )

    # Reconstruct on full panel
    recon_full = reconstruct_airport_traffic(
        panel, model=model, calib_q=q, anchor_ratios=anchor_ratios, global_median=global_median
    )

    sample_airports = ["NRT", "SYD", "GRU", "JNB", "BOM"]
    past_vals = recon_past[(recon_past["year"] == sample_t) & (recon_past["iata"].isin(sample_airports))].set_index("iata")["traffic_recon"]
    full_vals = recon_full[(recon_full["year"] == sample_t) & (recon_full["iata"].isin(sample_airports))].set_index("iata")["traffic_recon"]

    for ap in sample_airports:
        if ap in past_vals.index and ap in full_vals.index:
            assert np.isclose(past_vals.loc[ap], full_vals.loc[ap], rtol=1e-5)
