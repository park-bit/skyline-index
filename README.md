# Skyline Index

Skyline Index models the global aviation network and forecasts changes in relative airport importance across 5-year and 10-year horizons.

Importance is formulated beyond simple passenger volumes: it reflects graph topology, route connectivity, metropolitan market catchments and macroeconomic indicators.
The Airport Importance Index blends network centrality, passenger throughput, and catchment market metrics into an annual percentile score from 0 to 100.
Point-in-time features, target trajectories, rolling validation folds, and reference baselines are assembled in the model table.
The pipeline is validated against persistence and linear trend baselines and ready for supervised model training.

## Project structure

```
skyline-index/
├── data/
│   ├── README.md              # Source documentation and notes
│   └── processed/             # Processed panel and model dataset
├── scripts/
│   ├── 01_download.py         # Fetch raw open data sources
│   ├── 02_build_panel.py      # Assemble airport-year panel
│   ├── 03_index_sensitivity.py # Perturbation sensitivity analysis
│   ├── 04_build_model_table.py # Point-in-time features and targets
│   ├── 05_evaluate_baselines.py # Evaluate reference baselines on folds
│   └── 06_make_figures.py     # Generate diagnostic figures
├── src/
│   ├── airports.py            # Master airport table and city catchments
│   ├── baselines.py           # Persistence and linear trend baselines
│   ├── config.py              # Path definitions and weights
│   ├── features.py            # Historical feature construction
│   ├── importance.py          # Airport Importance Index calculation
│   ├── macro.py               # World Bank, IMF and UN demographic indicators
│   ├── network.py             # OpenFlights topology and OpenSky movements
│   ├── panel.py               # Dataset joins and panel construction
│   ├── splits.py              # Temporal fold definitions
│   ├── targets.py             # Target generation and classification
│   └── traffic.py             # FAA enplanements and Eurostat throughput
├── tests/
│   ├── test_data.py           # Panel validation suite
│   ├── test_features.py       # Feature, target, and split validation
│   └── test_importance.py     # Importance index sanity and sensitivity tests
├── web/
│   └── index.html             # Global Aviation Intelligence Map interface
├── Makefile                   # Workflow tasks
└── requirements.txt           # Pinned Python dependencies
```

## Setup

```bash
pip install -r requirements.txt
```

## Running the pipeline

Download raw data and assemble the panel:
```bash
python scripts/01_download.py
python scripts/02_build_panel.py
python scripts/03_index_sensitivity.py
python scripts/04_build_model_table.py
python scripts/05_evaluate_baselines.py
python scripts/06_make_figures.py
```

Run validation tests:
```bash
pytest -v
```

Or execute all steps end to end:
```bash
make all
```

On systems without make:
```bash
python scripts/01_download.py
python scripts/02_build_panel.py
python scripts/03_index_sensitivity.py
python scripts/04_build_model_table.py
python scripts/05_evaluate_baselines.py
python scripts/06_make_figures.py
pytest -v
```
