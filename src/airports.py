import zipfile

import numpy as np
import pandas as pd

from src.config import RAW

EARTH_RADIUS_KM = 6371.0
TYPE_RANK = {"large_airport": 0, "medium_airport": 1, "small_airport": 2, "seaplane_base": 3, "heliport": 4}
LARGE_CITY_POP = 1_000_000
CATCHMENT_KM = 100

GEONAMES_COLUMNS = [
    "geonameid", "name", "asciiname", "alternatenames", "latitude", "longitude",
    "feature_class", "feature_code", "country_code", "cc2", "admin1", "admin2",
    "admin3", "admin4", "population", "elevation", "dem", "timezone", "modified",
]


def read_ourairports(name):
    # "NA" is both North America and Namibia here, so pandas must not treat it as missing.
    return pd.read_csv(RAW / "ourairports" / name, keep_default_na=False, na_values=[""], low_memory=False)


def four_letter_code(series):
    return series.where(series.str.fullmatch(r"[A-Z]{4}", na=False))


def longest_runways():
    runways = read_ourairports("runways.csv")
    runways = runways[runways["closed"] != 1]
    return runways.groupby("airport_ref")["length_ft"].max().rename("max_runway_ft")


def load_openflights_airports():
    columns = ["of_id", "name", "city", "country", "iata", "icao", "latitude", "longitude",
               "altitude", "tz_offset", "dst", "tz", "type", "source"]
    airports = pd.read_csv(RAW / "openflights" / "airports.dat", header=None, names=columns, na_values=["\\N"])
    airports = airports[airports["iata"].str.fullmatch(r"[A-Z]{3}", na=False)]
    return airports.drop_duplicates("iata").set_index("iata")


def build_airport_table():
    """One row per IATA code from OurAirports, with OpenFlights only filling missing ICAO codes."""
    airports = read_ourairports("airports.csv")
    airports = airports[(airports["type"] != "closed") & airports["iata_code"].str.fullmatch(r"[A-Z]{3}", na=False)]

    airports = airports.assign(
        type_rank=airports["type"].map(TYPE_RANK).fillna(9),
        scheduled_rank=(airports["scheduled_service"] != "yes").astype(int),
    )
    airports = airports.sort_values(["scheduled_rank", "type_rank", "id"]).drop_duplicates("iata_code")

    icao = four_letter_code(airports["icao_code"])
    icao = icao.fillna(four_letter_code(airports["gps_code"])).fillna(four_letter_code(airports["ident"]))
    openflights_icao = airports["iata_code"].map(load_openflights_airports()["icao"])
    icao = icao.fillna(four_letter_code(openflights_icao))

    table = pd.DataFrame({
        "iata": airports["iata_code"],
        "icao": icao,
        "ourairports_id": airports["id"],
        "name": airports["name"],
        "municipality": airports["municipality"],
        "country_code": airports["iso_country"],
        "iso_region": airports["iso_region"],
        "continent": airports["continent"],
        "airport_type": airports["type"],
        "scheduled_service": airports["scheduled_service"] == "yes",
        "latitude": airports["latitude_deg"],
        "longitude": airports["longitude_deg"],
        "elevation_ft": airports["elevation_ft"],
        "local_code": airports["local_code"],
    })
    table = table.merge(longest_runways(), left_on="ourairports_id", right_index=True, how="left")
    return table.reset_index(drop=True)


def icao_to_iata(airports):
    """Map every 4 letter code OurAirports knows for an airport to its IATA code."""
    raw = read_ourairports("airports.csv")
    raw = raw[raw["iata_code"].isin(airports["iata"])]
    pairs = [airports[["icao", "iata"]].rename(columns={"icao": "code"})]
    for column in ["icao_code", "gps_code", "ident"]:
        pairs.append(raw[[column, "iata_code"]].rename(columns={column: "code", "iata_code": "iata"}))
    pairs = pd.concat(pairs).dropna()
    pairs = pairs[pairs["code"].str.fullmatch(r"[A-Z]{4}")]
    return pairs.drop_duplicates("code").set_index("code")["iata"]


def load_cities():
    with zipfile.ZipFile(RAW / "geonames" / "cities15000.zip") as archive:
        with archive.open("cities15000.txt") as handle:
            cities = pd.read_csv(handle, sep="\t", header=None, names=GEONAMES_COLUMNS,
                                 keep_default_na=False, na_values=[""], quoting=3, low_memory=False)
    # PPLX rows are districts of a city that is already listed, so they would double count.
    cities = cities[cities["feature_code"] != "PPLX"]
    return cities[["name", "country_code", "latitude", "longitude", "population"]].reset_index(drop=True)


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def city_features(airports, cities, chunk_size=250):
    large = cities[cities["population"] >= LARGE_CITY_POP].reset_index(drop=True)
    rows = []
    for start in range(0, len(airports), chunk_size):
        chunk = airports.iloc[start:start + chunk_size]
        lat = chunk["latitude"].to_numpy()[:, None]
        lon = chunk["longitude"].to_numpy()[:, None]

        to_large = haversine_km(lat, lon, large["latitude"].to_numpy(), large["longitude"].to_numpy())
        nearest = to_large.argmin(axis=1)
        to_all = haversine_km(lat, lon, cities["latitude"].to_numpy(), cities["longitude"].to_numpy())
        catchment = (to_all <= CATCHMENT_KM) @ cities["population"].to_numpy()

        rows.append(pd.DataFrame({
            "iata": chunk["iata"].to_numpy(),
            "nearest_large_city": large["name"].to_numpy()[nearest],
            "nearest_large_city_pop": large["population"].to_numpy()[nearest],
            "nearest_large_city_km": to_large[np.arange(len(chunk)), nearest].round(1),
            "catchment_pop_100km": catchment,
        }))
    return pd.concat(rows, ignore_index=True)
