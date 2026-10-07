# Skyline Index

Skyline Index models the global aviation network and forecasts changes in relative airport importance across 5-year and 10-year horizons.

Importance is formulated beyond simple passenger volumes: it reflects graph topology, route connectivity, metropolitan market catchments and macroeconomic indicators.

## Project structure

```
skyline-index/
├── data/
│   ├── README.md              # Source documentation and notes
│   └── processed/             # Processed panel dataset
├── scripts/
│   ├── 01_download.py         # Fetch raw open data sources
│   └── 02_build_panel.py      # Assemble airport-year panel
├── src/
│   ├── airports.py            # Master airport table and city catchments
│   ├── config.py              # Path definitions and year bounds
│   ├── macro.py               # World Bank, IMF and UN demographic indicators
│   ├── network.py             # OpenFlights topology and OpenSky movements
│   ├── panel.py               # Dataset joins and panel construction
│   └── traffic.py             # FAA enplanements and Eurostat throughput
├── tests/
│   └── test_data.py           # Panel validation suite
├── web/
│   └── index.html             # Global Aviation Intelligence Map interface
├── Makefile                   # Workflow tasks
├── requirements.txt           # Pinned Python dependencies
└── run_all.py                 # Cross-platform execution script
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
```

Run validation tests:
```bash
pytest -v
```

Or execute all steps end to end:
```bash
python run_all.py
```
