# Skyline Index

Skyline Index models the global aviation network and forecasts changes in relative airport importance across 5-year and 10-year horizons. The index combines graph topology, observed passenger traffic, catchment demographics, and macroeconomic indicators into an annual percentile score from 0 to 100.

Status: Core reference population established, leakage removed, and reference baselines evaluated.

## Setup

```bash
pip install -r requirements.txt
```

## Commands

```bash
python scripts/01_download.py
python scripts/02_build_panel.py
python scripts/03_index_sensitivity.py
python scripts/04_build_model_table.py
python scripts/05_evaluate_baselines.py
python scripts/06_make_figures.py
pytest -v
```
