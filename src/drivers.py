import numpy as np
import shap

DRIVER_PHRASES = {
    ("of_routes_total", True): "extensive route network connectivity",
    ("of_routes_total", False): "limited route network connectivity",
    ("of_routes_weighted", True): "high flight frequency across network",
    ("of_routes_weighted", False): "modest flight frequency on routes",
    ("of_pagerank", True): "central node in global airline graph",
    ("of_pagerank", False): "peripheral position in global airline graph",
    ("of_betweenness", True): "major intercontinental transfer gateway",
    ("of_betweenness", False): "low transfer traffic centrality",
    ("of_clustering", True): "dense regional destination cluster",
    ("of_clustering", False): "sparse regional destination cluster",
    ("of_intl_share", True): "high share of international flights",
    ("of_intl_share", False): "predominantly domestic traffic base",
    ("of_countries_reached", True): "broad direct country reach",
    ("of_countries_reached", False): "narrow direct country reach",
    ("of_top50_hub_links", True): "direct links to top global megahubs",
    ("of_top50_hub_links", False): "few direct links to top megahubs",
    ("nearest_large_city_km", True): "close proximity to major metropolitan area",
    ("nearest_large_city_km", False): "distant from large urban agglomerations",
    ("nearest_large_city_pop", True): "large metropolitan anchor population",
    ("nearest_large_city_pop", False): "smaller metropolitan anchor population",
    ("catchment_pop_100km", True): "deep regional catchment population",
    ("catchment_pop_100km", False): "modest local catchment population",
    ("dist_to_nearest_larger_hub_km", True): "isolated from competing major hubs",
    ("dist_to_nearest_larger_hub_km", False): "close competition from larger rival hubs",
    ("dist_to_nearest_top50_hub_km", True): "distinct geographic reach away from top hubs",
    ("dist_to_nearest_top50_hub_km", False): "under shadow of nearby global hub",
    ("traffic_volume", True): "high baseline passenger throughput",
    ("traffic_volume", False): "smaller passenger throughput",
    ("traffic_growth_1y", True): "positive short term passenger growth",
    ("traffic_growth_1y", False): "annual passenger decline",
    ("traffic_growth_3y", True): "sustained medium term passenger growth",
    ("traffic_growth_3y", False): "sluggish medium term traffic trend",
    ("traffic_growth_5y", True): "strong multi-year traffic expansion",
    ("traffic_growth_5y", False): "lagging multi-year traffic trend",
    ("opensky_growth_recent", True): "resilient recent flight movements",
    ("opensky_growth_recent", False): "softening recent flight movements",
    ("country_gdp", True): "anchored in large national economy",
    ("country_gdp", False): "smaller national economic base",
    ("country_pop", True): "large domestic population base",
    ("country_pop", False): "smaller domestic population base",
    ("gdp_growth_1y", True): "brisk national economic growth",
    ("gdp_growth_1y", False): "decelerating national economy",
    ("gdp_growth_3y", True): "solid multi-year economic expansion",
    ("gdp_growth_3y", False): "subdued multi-year economic growth",
    ("gdp_growth_5y", True): "fast growing national economy",
    ("gdp_growth_5y", False): "sluggish national economy",
    ("pop_growth_1y", True): "positive national population growth",
    ("pop_growth_1y", False): "negative national population growth",
    ("pop_growth_3y", True): "steady national population growth",
    ("pop_growth_3y", False): "stagnant national population growth",
    ("pop_growth_5y", True): "rapid five year population growth",
    ("pop_growth_5y", False): "flat or declining five year population",
    ("tourism_growth_1y", True): "rising tourist arrivals",
    ("tourism_growth_1y", False): "declining tourist arrivals",
    ("tourism_growth_3y", True): "expanding tourist inflow trend",
    ("tourism_growth_3y", False): "contracting tourist inflow trend",
    ("tourism_growth_5y", True): "strong multi-year tourism expansion",
    ("tourism_growth_5y", False): "lagging multi-year tourism demand",
    ("wb_gdp_per_capita", True): "high national income per capita",
    ("wb_gdp_per_capita", False): "lower national income per capita",
    ("imf_gdp_growth_pct", True): "strong projected GDP expansion",
    ("imf_gdp_growth_pct", False): "modest projected GDP growth",
    ("un_median_age", True): "young demographic profile",
    ("un_median_age", False): "mature demographic profile",
    ("importance", True): "high baseline importance percentile",
    ("importance", False): "lower baseline importance percentile",
    ("importance_momentum_1y", True): "positive short term rank momentum",
    ("importance_momentum_1y", False): "negative short term rank momentum",
    ("importance_momentum_3y", True): "solid three year rank gains",
    ("importance_momentum_3y", False): "declining three year rank momentum",
    ("importance_momentum_5y", True): "upward five year rank trajectory",
    ("importance_momentum_5y", False): "downward five year rank trajectory",
}


def extract_shap_drivers(lgb_model, X_sample, features, top_k=3):
    explainer = shap.TreeExplainer(lgb_model)
    vals = explainer.shap_values(X_sample[features])
    pos_drivers = []
    neg_drivers = []

    for row in vals:
        sorted_indices = np.argsort(row)
        top_neg_idx = sorted_indices[:top_k]
        top_pos_idx = sorted_indices[::-1][:top_k]

        pos_list = [
            DRIVER_PHRASES.get((features[i], True), f"favorable {features[i]}")
            for i in top_pos_idx
            if row[i] > 0
        ]
        neg_list = [
            DRIVER_PHRASES.get((features[i], False), f"unfavorable {features[i]}")
            for i in top_neg_idx
            if row[i] < 0
        ]

        while len(pos_list) < top_k:
            pos_list.append("balanced network connectivity")
        while len(neg_list) < top_k:
            neg_list.append("stable competitive environment")

        pos_drivers.append(pos_list[:top_k])
        neg_drivers.append(neg_list[:top_k])

    return pos_drivers, neg_drivers
