# Datasets

## Source summary

| Source | URL | Years | Level | Licence |
| --- | --- | --- | --- | --- |
| OpenFlights | raw.githubusercontent.com/jpatokal/openflights | 2014 snapshot | Route and airport | ODbL / DbCL |
| OurAirports | davidmegginson.github.io/ourairports-data | Continuous (2026) | Airport and runway | CC0 (Public domain) |
| OpenSky Network | zenodo.org/record/7923702 | 2019 to 2022 | Flight and airport pair | CC BY-NC 4.0 |
| Eurostat (avia_paoa) | ec.europa.eu avia_paoa | 1993 to 2025 | Airport year and route | Eurostat open reuse |
| FAA Enplanements | faa.gov passenger stats | 2004 to 2025 | Airport year | US Public domain |
| World Bank WDI | api.worldbank.org/v2 | 1990 to 2024 | Country year | CC BY 4.0 |
| UN WPP | population.un.org/wpp | 1950 to 2100 | Country year | UN Open access |
| IMF WEO | api.imf.org SDMX WEO | 1980 to 2031 | Country year | IMF Open access |
| GeoNames | download.geonames.org cities15000 | Continuous (2026) | City | CC BY 4.0 |

## Data notes and known gaps

Global route network schedules by year are not publicly available for free. We use OpenFlights for baseline network topology and sample OpenSky ADS-B flights (January and July, 2019 to 2022) for pandemic period movements.

Airport-level traffic is reported differently by region. US FAA numbers measure revenue passenger boardings (enplanements), while Eurostat measures total passengers carried (arrivals plus departures). These are kept in separate columns to avoid mixing metrics. Outside the US and Europe, national World Bank air passenger totals anchor traffic levels.

## Processed panel

Processed files are stored in data/processed/. The main dataset is airport_year_panel.parquet (about 3.6 MB), covering 9051 airports across 2000 to 2025. Because the file is well under 50 MB, it is tracked directly in the repository.

To rebuild the dataset from scratch, run:
```bash
python scripts/01_download.py
python scripts/02_build_panel.py
```
