import itertools

import pandas as pd

from src.airports import (
    build_airport_table,
    city_features,
    icao_to_iata,
    load_cities,
)
from src.config import FIRST_YEAR, LAST_YEAR, PROCESSED
from src.macro import build_country_macro_panel
from src.network import (
    compute_openflights_metrics,
    compute_opensky_metrics,
)
from src.traffic import (
    parse_eurostat_passengers,
    parse_faa_enplanements,
)


def build_panel(first_year=FIRST_YEAR, last_year=LAST_YEAR):
    airports = build_airport_table()
    icao_map = icao_to_iata(airports)

    cities = load_cities()
    cities_cache = PROCESSED / "airport_city_features.parquet"
    if cities_cache.exists():
        c_feats = pd.read_parquet(cities_cache)
    else:
        c_feats = city_features(airports, cities)
        PROCESSED.mkdir(parents=True, exist_ok=True)
        c_feats.to_parquet(cities_cache, index=False)

    airports_full = airports.merge(c_feats, on="iata", how="left")

    net_feats = compute_openflights_metrics(airports)
    if not net_feats.empty:
        airports_full = airports_full.merge(net_feats, on="iata", how="left")

    years = list(range(first_year, last_year + 1))
    grid = pd.DataFrame(
        list(itertools.product(airports_full["iata"], years)),
        columns=["iata", "year"],
    )
    panel = grid.merge(airports_full, on="iata", how="left")

    faa = parse_faa_enplanements(airports)
    if not faa.empty:
        panel = panel.merge(faa, on=["iata", "year"], how="left")
    else:
        panel["faa_enplanements"] = float("nan")

    euro = parse_eurostat_passengers(airports, icao_map)
    if not euro.empty:
        panel = panel.merge(euro, on=["iata", "year"], how="left")
    else:
        panel["eurostat_passengers"] = float("nan")

    opensky = compute_opensky_metrics(airports, icao_map)
    if not opensky.empty:
        panel = panel.merge(opensky, on=["iata", "year"], how="left")
    else:
        for col in ["opensky_flights", "opensky_departures", "opensky_arrivals", "opensky_destinations"]:
            panel[col] = float("nan")

    macro = build_country_macro_panel()
    if not macro.empty:
        panel = panel.merge(macro, on=["country_code", "year"], how="left")

    return panel.sort_values(["iata", "year"]).reset_index(drop=True)
