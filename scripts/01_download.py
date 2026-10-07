"""Fetch raw source files into data/raw. Files already on disk are skipped."""
import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
HEADERS = {"User-Agent": "Mozilla/5.0 (airport network study; python-requests)"}

OPENFLIGHTS = "https://raw.githubusercontent.com/jpatokal/openflights/master/data"
OURAIRPORTS = "https://davidmegginson.github.io/ourairports-data"
WORLDBANK = "https://api.worldbank.org/v2"
EUROSTAT_PAOA = (
    "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/avia_paoa/"
    "A.PAS.PAS_CRD+PAS_BRD..TOTAL.TOTAL+INTL?format=TSV&compressed=true"
)
UN_WPP = (
    "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/"
    "CSV_FILES/WPP2024_Demographic_Indicators_Medium.csv.gz"
)
IMF_WEO = (
    "https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/+/"
    "*.NGDP_RPCH+NGDPDPC+PPPPC+LP.A"
)
GEONAMES = "https://download.geonames.org/export/dump/cities15000.zip"
OPENSKY = "https://zenodo.org/api/records/7923702/files/{name}/content"
FAA_PAGES = [
    "https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger",
    "https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/previous_years",
]

WDI_INDICATORS = [
    "IS.AIR.PSGR",
    "NY.GDP.MKTP.KD",
    "NY.GDP.PCAP.KD",
    "SP.POP.TOTL",
    "SP.URB.TOTL.IN.ZS",
    "ST.INT.ARVL",
]

# One winter and one summer month per year keeps the download near 1.3 GB
# while still catching most seasonal routes.
OPENSKY_MONTHS = [
    "20190101_20190131", "20190701_20190731",
    "20200101_20200131", "20200701_20200731",
    "20210101_20210131", "20210701_20210731",
    "20220101_20220131", "20220701_20220731",
]


def download(url, path, headers=None):
    if path.exists():
        print(f"skip {path.relative_to(RAW)}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(path.name + ".part")
    with requests.get(url, headers={**HEADERS, **(headers or {})}, stream=True, timeout=300) as response:
        response.raise_for_status()
        with open(part, "wb") as out:
            for chunk in response.iter_content(chunk_size=1 << 20):
                out.write(chunk)
    part.replace(path)
    print(f"saved {path.relative_to(RAW)} ({path.stat().st_size // 1024} KB)")


FAA_FILE = re.compile(r"cy[-_]?(\d{4}|\d{2})[-_]?all[-_]?enplanements\.(xlsx?)$", re.IGNORECASE)
FAA_YEAR_PAGE = re.compile(r"/cy\d{2}_all_enplanements/?$", re.IGNORECASE)


def absolute_faa_url(href):
    return href if href.startswith("http") else "https://www.faa.gov" + href


def page_hrefs(url):
    html = requests.get(url, headers=HEADERS, timeout=60).text
    return [absolute_faa_url(href) for href in re.findall(r'href="([^"]+)"', html)]


def faa_enplanement_links():
    # Recent years sit behind a per-year page instead of a direct spreadsheet link.
    hrefs = []
    for page in FAA_PAGES:
        for href in page_hrefs(page):
            hrefs.extend(page_hrefs(href) if FAA_YEAR_PAGE.search(href) else [href])

    links = {}
    for href in hrefs:
        match = FAA_FILE.search(href)
        if match:
            year = int(match.group(1))
            year = year + 2000 if year < 100 else year
            links.setdefault(year, (href, match.group(2).lower()))
    return links


def main():
    for name in ["airports.dat", "routes.dat"]:
        download(f"{OPENFLIGHTS}/{name}", RAW / "openflights" / name)

    for name in ["airports.csv", "countries.csv", "regions.csv", "runways.csv"]:
        download(f"{OURAIRPORTS}/{name}", RAW / "ourairports" / name)

    download(GEONAMES, RAW / "geonames" / "cities15000.zip")
    download(EUROSTAT_PAOA, RAW / "eurostat" / "avia_paoa.tsv.gz")
    download(UN_WPP, RAW / "un_wpp" / "WPP2024_Demographic_Indicators_Medium.csv.gz")
    download(IMF_WEO, RAW / "imf" / "weo.csv", headers={"Accept": "application/vnd.sdmx.data+csv;version=2.0.0"})

    download(f"{WORLDBANK}/country?format=json&per_page=500", RAW / "worldbank" / "countries.json")
    for indicator in WDI_INDICATORS:
        url = f"{WORLDBANK}/country/all/indicator/{indicator}?format=json&per_page=20000&date=1990:2025"
        download(url, RAW / "worldbank" / f"{indicator}.json")

    faa_links = faa_enplanement_links()
    print(f"found {len(faa_links)} faa enplanement files")
    for year, (url, ext) in sorted(faa_links.items()):
        download(url, RAW / "faa" / f"cy{year}_all_enplanements.{ext}")

    if "--skip-opensky" in sys.argv:
        print("skip opensky")
        return
    for month in OPENSKY_MONTHS:
        name = f"flightlist_{month}.csv.gz"
        download(OPENSKY.format(name=name), RAW / "opensky" / name)


if __name__ == "__main__":
    main()
