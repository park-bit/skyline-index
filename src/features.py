import numpy as np
import pandas as pd
from scipy.spatial import cKDTree


def compute_dist_to_larger_hub(panel):
    coords_dict = {}
    valid_coords = panel.dropna(subset=["latitude", "longitude"]).drop_duplicates(subset=["iata"])
    lat_r = np.radians(valid_coords["latitude"].values)
    lon_r = np.radians(valid_coords["longitude"].values)
    xyz = np.column_stack([np.cos(lat_r) * np.cos(lon_r), np.cos(lat_r) * np.sin(lon_r), np.sin(lat_r)])
    for iata, pt in zip(valid_coords["iata"], xyz):
        coords_dict[iata] = pt

    dist_larger = []
    dist_top50 = []

    for yr, group in panel.groupby("year"):
        iatas = group["iata"].values
        pts = np.array([coords_dict.get(a, np.array([np.nan, np.nan, np.nan])) for a in iatas])
        valid_idx = np.where(~np.isnan(pts[:, 0]))[0]

        pts_valid = pts[valid_idx]
        imp_valid = group["importance"].values[valid_idx]

        top50_cutoff = np.nanpercentile(imp_valid, 98.0) if len(imp_valid) > 50 else 0.0
        top50_idx = np.where(imp_valid >= top50_cutoff)[0]
        if len(top50_idx) == 0:
            top50_idx = np.arange(len(imp_valid))

        tree_top = cKDTree(pts_valid[top50_idx])
        d_top, _ = tree_top.query(pts_valid, k=1)
        km_top = 2.0 * 6371.0 * np.arcsin(np.clip(d_top / 2.0, 0.0, 1.0))

        sort_order = np.argsort(imp_valid)
        sorted_pts = pts_valid[sort_order]
        sorted_imp = imp_valid[sort_order]

        larger_km = np.zeros(len(pts_valid))

        # Decile trees keep nearest larger hub lookup fast without pairwise distance matrices
        deciles = np.percentile(sorted_imp, np.linspace(0, 100, 11))
        decile_trees = []
        for d_low in deciles[:-1]:
            mask = sorted_imp >= d_low
            decile_trees.append((d_low, cKDTree(sorted_pts[mask]) if mask.sum() > 0 else None))

        for i, val in enumerate(imp_valid):
            chosen_tree = None
            for d_low, t in reversed(decile_trees):
                if d_low > val and t is not None:
                    chosen_tree = t
                    break
            if chosen_tree is not None:
                d, _ = chosen_tree.query(pts_valid[i], k=1)
                larger_km[i] = 2.0 * 6371.0 * np.arcsin(np.clip(d / 2.0, 0.0, 1.0))
            else:
                larger_km[i] = km_top[i]

        yr_larger = pd.Series(np.nan, index=group.index)
        yr_top50 = pd.Series(np.nan, index=group.index)
        yr_larger.iloc[valid_idx] = larger_km
        yr_top50.iloc[valid_idx] = km_top

        dist_larger.append(yr_larger)
        dist_top50.append(yr_top50)

    return pd.concat(dist_larger).sort_index(), pd.concat(dist_top50).sort_index()


def build_point_in_time_features(panel):
    df = panel.sort_values(["iata", "year"]).copy()

    obs_psgr = df["eurostat_passengers"].fillna(
        df["faa_enplanements"].where(df["country_code"] == "US") * 2.0
    )
    df["traffic_volume"] = obs_psgr.fillna(df["opensky_flights"])

    g_traffic = df.groupby("iata")["traffic_volume"]
    t_1 = g_traffic.shift(1)
    t_3 = g_traffic.shift(3)
    t_5 = g_traffic.shift(5)

    df["traffic_growth_1y"] = (df["traffic_volume"] - t_1) / t_1.replace(0, np.nan)
    df["traffic_growth_3y"] = (df["traffic_volume"] - t_3) / t_3.replace(0, np.nan)
    df["traffic_growth_5y"] = (df["traffic_volume"] - t_5) / t_5.replace(0, np.nan)

    g_imp = df.groupby("iata")["importance"]
    df["importance_momentum_1y"] = df["importance"] - g_imp.shift(1)
    df["importance_momentum_3y"] = df["importance"] - g_imp.shift(3)
    df["importance_momentum_5y"] = df["importance"] - g_imp.shift(5)

    country_gdp = df["wb_gdp_usd"].fillna(
        df["imf_gdp_per_capita_usd"] * df["imf_population_millions"]
    )
    country_pop = df["wb_population"].fillna(df["un_pop_thousands"] * 1000.0)
    df["country_gdp"] = country_gdp
    df["country_pop"] = country_pop

    g_gdp = df.groupby("iata")["country_gdp"]
    gdp_1 = g_gdp.shift(1)
    gdp_3 = g_gdp.shift(3)
    gdp_5 = g_gdp.shift(5)
    df["gdp_growth_1y"] = (df["country_gdp"] - gdp_1) / gdp_1.replace(0, np.nan)
    df["gdp_growth_3y"] = (df["country_gdp"] - gdp_3) / gdp_3.replace(0, np.nan)
    df["gdp_growth_5y"] = (df["country_gdp"] - gdp_5) / gdp_5.replace(0, np.nan)

    g_pop = df.groupby("iata")["country_pop"]
    pop_1 = g_pop.shift(1)
    pop_3 = g_pop.shift(3)
    pop_5 = g_pop.shift(5)
    df["pop_growth_1y"] = (df["country_pop"] - pop_1) / pop_1.replace(0, np.nan)
    df["pop_growth_3y"] = (df["country_pop"] - pop_3) / pop_3.replace(0, np.nan)
    df["pop_growth_5y"] = (df["country_pop"] - pop_5) / pop_5.replace(0, np.nan)

    g_tour = df.groupby("iata")["wb_tourism_arrivals"]
    tour_1 = g_tour.shift(1)
    tour_3 = g_tour.shift(3)
    tour_5 = g_tour.shift(5)
    df["tourism_growth_1y"] = (df["wb_tourism_arrivals"] - tour_1) / tour_1.replace(0, np.nan)
    df["tourism_growth_3y"] = (df["wb_tourism_arrivals"] - tour_3) / tour_3.replace(0, np.nan)
    df["tourism_growth_5y"] = (df["wb_tourism_arrivals"] - tour_5) / tour_5.replace(0, np.nan)

    dist_larger, dist_top50 = compute_dist_to_larger_hub(df)
    df["dist_to_nearest_larger_hub_km"] = dist_larger
    df["dist_to_nearest_top50_hub_km"] = dist_top50

    has_obs_traffic = df["eurostat_passengers"].notna() | (
        df["faa_enplanements"].notna() & (df["country_code"] == "US")
    )
    airports_with_traffic_history = set(df[has_obs_traffic]["iata"])

    df["has_observed_traffic"] = has_obs_traffic.astype(int)
    df["scored_outside_training_region"] = (~df["iata"].isin(airports_with_traffic_history)).astype(int)

    # 2019 to 2022 OpenSky growth is strictly point-in-time and evaluated at year 2022 and beyond
    os_19 = df[df["year"] == 2019].set_index("iata")["opensky_flights"].to_dict()
    os_22 = df[df["year"] == 2022].set_index("iata")["opensky_flights"].to_dict()
    recent_growth = {}
    for a in df["iata"].unique():
        f19 = os_19.get(a)
        f22 = os_22.get(a)
        if f19 and f22 and f19 > 0:
            recent_growth[a] = (f22 - f19) / f19

    df["opensky_growth_recent"] = np.where(df["year"] >= 2022, df["iata"].map(recent_growth), np.nan)

    return df
