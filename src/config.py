from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
OUTPUTS = ROOT / "data" / "outputs"

FIRST_YEAR = 2000
LAST_YEAR = 2025
OPENFLIGHTS_YEAR = 2014
ROUTE_SNAPSHOT_FILE = RAW / "openflights" / "routes.dat"

WEIGHT_NETWORK = 0.47
WEIGHT_TRAFFIC = 0.48
WEIGHT_MARKET = 0.05

NETWORK_SUBWEIGHTS = {
    "of_routes_total": 0.20,
    "of_routes_weighted": 0.15,
    "of_pagerank": 0.25,
    "of_betweenness": 0.20,
    "of_top50_hub_links": 0.10,
    "of_countries_reached": 0.10,
}

MARKET_SUBWEIGHTS = {
    "city_pop": 0.40,
    "gdp_per_capita": 0.25,
    "tourism": 0.20,
    "country_gdp": 0.15,
}

SENSITIVITY_SPEARMAN_THRESHOLD = 0.95
COVID_EXCLUDE_TARGET_YEARS = [2020, 2021, 2022]
FORECAST_HORIZONS = [5, 10]
ESTABLISHED_HUB_PERCENTILE = 90.0
TRAJECTORY_CHANGE_UP = 2.0
TRAJECTORY_CHANGE_DOWN = -2.0
