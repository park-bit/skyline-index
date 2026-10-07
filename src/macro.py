import json
import pandas as pd

from src.config import RAW

INDICATOR_NAMES = {
    "IS.AIR.PSGR": "wb_air_passengers",
    "NY.GDP.MKTP.KD": "wb_gdp_usd",
    "NY.GDP.PCAP.KD": "wb_gdp_per_capita",
    "SP.POP.TOTL": "wb_population",
    "SP.URB.TOTL.IN.ZS": "wb_urban_pct",
    "ST.INT.ARVL": "wb_tourism_arrivals",
}


def load_country_mapping():
    with open(RAW / "worldbank" / "countries.json", "r", encoding="utf-8") as f:
        countries = json.load(f)[1]
    iso3_to_iso2 = {c["id"]: c["iso2Code"] for c in countries if c.get("iso2Code") and c.get("id")}
    return iso3_to_iso2


def load_worldbank_indicators(iso3_to_iso2):
    frames = []
    for indicator_code, col_name in INDICATOR_NAMES.items():
        path = RAW / "worldbank" / f"{indicator_code}.json"
        if not path.exists():
            continue
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if len(data) < 2 or not data[1]:
            continue
        records = []
        for item in data[1]:
            val = item.get("value")
            iso3 = item.get("countryiso3code")
            date_str = item.get("date")
            if val is not None and iso3 in iso3_to_iso2 and date_str:
                records.append({
                    "country_code": iso3_to_iso2[iso3],
                    "year": int(date_str),
                    col_name: float(val),
                })
        if records:
            frames.append(pd.DataFrame(records).drop_duplicates(subset=["country_code", "year"]).set_index(["country_code", "year"]))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, axis=1).reset_index()


def load_imf_indicators(iso3_to_iso2):
    path = RAW / "imf" / "weo.csv"
    if not path.exists():
        return pd.DataFrame()
    df = pd.read_csv(path, usecols=["COUNTRY", "INDICATOR", "TIME_PERIOD", "OBS_VALUE"], low_memory=False)
    df["country_code"] = df["COUNTRY"].map(iso3_to_iso2)
    df = df.dropna(subset=["country_code", "OBS_VALUE"])
    df["year"] = pd.to_numeric(df["TIME_PERIOD"], errors="coerce")
    df["value"] = pd.to_numeric(df["OBS_VALUE"], errors="coerce")
    df = df.dropna(subset=["year", "value"])
    df["year"] = df["year"].astype(int)

    piv = df.pivot_table(index=["country_code", "year"], columns="INDICATOR", values="value").reset_index()
    rename_cols = {
        "NGDP_RPCH": "imf_gdp_growth_pct",
        "NGDPDPC": "imf_gdp_per_capita_usd",
        "PPPPC": "imf_gdp_ppp_per_capita",
        "LP": "imf_population_millions",
    }
    piv = piv.rename(columns={k: v for k, v in rename_cols.items() if k in piv.columns})
    return piv


def load_un_demographics(iso3_to_iso2):
    path = RAW / "un_wpp" / "WPP2024_Demographic_Indicators_Medium.csv.gz"
    if not path.exists():
        return pd.DataFrame()
    usecols = ["ISO3_code", "Time", "TPopulation1July", "PopGrowthRate", "MedianAgePop"]
    df = pd.read_csv(path, usecols=usecols, encoding="utf-8-sig", low_memory=False)
    df["country_code"] = df["ISO3_code"].map(iso3_to_iso2)
    df = df.dropna(subset=["country_code"])
    df["year"] = pd.to_numeric(df["Time"], errors="coerce").astype(int)
    df = df.rename(columns={
        "TPopulation1July": "un_pop_thousands",
        "PopGrowthRate": "un_pop_growth_rate",
        "MedianAgePop": "un_median_age",
    })
    df = df.drop(columns=["ISO3_code", "Time"]).drop_duplicates(subset=["country_code", "year"])
    return df


def build_country_macro_panel():
    iso3_to_iso2 = load_country_mapping()
    wb = load_worldbank_indicators(iso3_to_iso2)
    imf = load_imf_indicators(iso3_to_iso2)
    un = load_un_demographics(iso3_to_iso2)

    macro = wb
    if not imf.empty:
        macro = macro.merge(imf, on=["country_code", "year"], how="outer")
    if not un.empty:
        macro = macro.merge(un, on=["country_code", "year"], how="outer")
    return macro.sort_values(["country_code", "year"]).reset_index(drop=True)
