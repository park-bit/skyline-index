# Datasets

## Source Summary

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

## Data Structure

- `data/inputs/`: Tracked input files needed for network reconstruction (`routes.dat`, 2.27 MB).
- `data/processed/`: Processed parquets tracked in git so the repository runs from a fresh clone without `data/raw/`:
  - `airport_year_panel.parquet` (3.7 MB): 9,051 airports from 2000 to 2025.
  - `model_table.parquet` (16.6 MB): Point-in-time features, importance scores, and 5-year/10-year target changes.
  - `traffic_reconstructed.parquet` (4.0 MB): Reconstructed passenger throughput and conformal intervals.
  - `network_reconstructed.parquet` (0.7 MB): Expected degrees and PageRank from gravity modeling.
  - `opensky_route_pairs.parquet` (0.6 MB): ADS-B route observation pairs for out-of-time evaluation.
  - `opensky_movements.parquet` (0.1 MB): Annual flight counts by airport.
  - `openflights_network.parquet` (0.1 MB): Base network centrality metrics.
  - `airport_city_features.parquet` (0.2 MB): City catchment and geographical coordinates.
  - `core_airports.parquet` (35 KB): Reference population of active commercial airports.
- `data/outputs/`: Generated forecast tables, fold splits, and serialized models. See `data/outputs/README.md`.

## Data Notes and Known Gaps

Global route network schedules by year are not publicly available for free. We use OpenFlights for baseline network topology and sample OpenSky ADS-B flights (January and July, 2019 to 2022) for pandemic period movements.

Airport-level traffic is reported differently by region. US FAA numbers measure revenue passenger boardings (enplanements), while Eurostat measures total passengers carried (arrivals plus departures). These are kept in separate columns to avoid mixing metrics. Outside the US and Europe, national World Bank air passenger totals anchor traffic levels.

## Full Rebuild from Raw Data

To rebuild all processed tables from raw sources:

```bash
python scripts/01_download.py
python scripts/02_build_panel.py
python scripts/03_build_model_table.py
```

Then execute `training_notebook.ipynb` to run reconstruction, model training, evaluation, and forecast generation.
