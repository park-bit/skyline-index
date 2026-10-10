# Skyline Index: Global Aviation Intelligence Map

I built Skyline Index to model the global aviation network and forecast how the relative importance of commercial airports changes over 5-year and 10-year horizons. The project produces an annual importance percentile rank from 0 to 100 for global airports, trains supervised models on historical network and macroeconomic shifts, and presents the resulting forecasts on an interactive dark-canvas web map with an unserved route Opportunity Radar.

![Global Aviation Intelligence Map](docs/map.png)

## The Problem: Why Importance is Not Only Passenger Volume

Air transport importance is often equated with raw annual passenger volume. While passenger volume measures airport throughput, it fails to capture topological centrality, intercontinental gateway roles, or regional market isolation. A hub that connects forty regional spokes to twelve international flag carriers plays a structural coordination role in the global airline network that volume numbers alone do not reveal. If two airports both handle twenty million passengers annually, but one operates as an isolated domestic origin-destination spoke while the other serves as a global transit crossroads connecting three continents, their systemic importance to global civil aviation differs fundamentally.

In this project, I define airport importance as a composite measure that combines route network topology, annual passenger counts, and regional market catchment. I evaluate it over a 26-year historical panel from 2000 to 2025, and forecast forward changes for 2030 (+5 years) and 2035 (+10 years).

## Probabilistic Reconstruction of Missing Data

A major obstacle in global aviation analytics is reporting asymmetry. Official airport passenger time series are concentrated in the United States (FAA) and Europe (Eurostat). Most other nations do not publish open annual airport-level passenger series. Rather than restricting analysis to Western hubs or treating missing values as zeros, I reconstruct missing historical traffic and network topology probabilistically.

### 1. Airport Traffic Reconstruction (src/reconstruct_traffic.py)

To reconstruct passenger volumes outside the US and Europe:
- National Passenger Anchors: I use World Bank national commercial air passenger totals per country and year. I calibrate the relationship between World Bank country totals and observed airport sums from empirical data rather than assuming parity. The global median ratio is 2.41, with calibrated country multipliers (1.053 in the US and 1.042 in Europe).
- Public Source Ingestion: I evaluated public aviation authority datasets across seven non-EU countries. Automated ingestion scripts successfully parsed UK Civil Aviation Authority and India Directorate General of Civil Aviation annual reports. Portals for Canada, Australia, Brazil, and Mexico required dynamic session authentication or interactive form queries that could not be run unattended without manual editing, so they were left out of automated ingestion.
- Traffic Share Model: I model each airport's share of its national passenger traffic using LightGBM and Ridge regression. Predictors include anchor city population, 100 km catchment population, maximum runway length, airport type, scheduled service flags, OpenSky flight counts, static degree, distance to the nearest larger hub, GDP per capita, and continental region.
- Normalization: Predicted airport shares are normalized within each country and year to sum exactly to the anchored national total. Time variation comes from national totals and dynamic drivers; within-country ranks remain mostly stable over time.
- Uncertainty: I compute split conformal prediction intervals on validation residuals of log traffic share to construct lower (traffic_recon_lo) and upper (traffic_recon_hi) bounds per airport-year.

### 2. Network Reconstruction Over Time (src/reconstruct_network.py)

Because global flight schedules over time are proprietary, I reconstruct the annual route network topology:
- Time-Varying Gravity Model: I fit link probability p_ij(t) for each airport pair and year using time-varying node masses (reconstructed traffic from Phase 1 and country GDP), great-circle distance, and domestic/regional flags.
- Calibration: Route probabilities are calibrated so that expected network degree in 2014 matches the observed 2014 OpenFlights snapshot.
- Topological Features: For every year from 2000 to 2025, I compute expected degree, expected weighted degree, top 50 hub links, direct countries reached, and PageRank averaged over 30 Monte Carlo sampled graphs with its standard deviation.

### 3. Reconstruction Validation and Performance

I validate reconstruction models strictly against held-out ground truth:

| Reconstruction Task | Evaluation Protocol | Metric | Score | Baseline Comparison |
|---|---|---|---|---|
| Traffic Share | Leave-One-Country-Out | Log MAE | 0.384 | Population Split: 0.812, Equal Split: 1.420 |
| Traffic Share | Leave-One-Country-Out | Spearman Correlation | 0.887 | Population Split: 0.694, Equal Split: 0.000 |
| Traffic Share | Leave-One-Country-Out | Top 20 Overlap | 85.0% | Population Split: 65.0% |
| Traffic Share | Leave-One-Country-Out | Within Factor of 2 | 82.4% | Population Split: 51.2% |
| Traffic Share | Leave Europe, Test US | Log MAE / Spearman | 0.521 / 0.841 | Population Split: 0.895 / 0.640 |
| Traffic Share | Leave US, Test Europe | Log MAE / Spearman | 0.493 / 0.856 | Population Split: 0.844 / 0.672 |
| Traffic Uncertainty | Conformal Coverage (80% target) | Empirical Coverage | 78.4% | Within 2 points of nominal |
| Network Routes | Out-of-Time (OpenSky 2019-2022) | ROC AUC | 0.841 | Distance Baseline: 0.760 |
| Network Routes | Out-of-Time (OpenSky 2019-2022) | Precision @ 100 / @ 500 | 0.620 / 0.448 | Persistence Baseline: 0.580 / 0.412 |
| Network Routes | Leave Europe, Test US | ROC AUC | 0.812 | Distance Baseline: 0.742 |

Where reconstruction struggles:
- Traffic share models struggle in island nations and isolated mining territories (for example remote Pacific islands or northern Canadian outposts) where runway length and local population do not correlate with tourism or mineral charter flights.
- Network link prediction precision drops at k=500 because thin regional routes between mid-size cities depend on airline fleet choices that gravity models cannot observe.

## Defining the Importance Index

I calculate airport importance across three component groups:
1. Network Topology (weight 0.47): PageRank centrality (weight 0.25), betweenness centrality (0.20), total route degree (0.20), flight frequency degree (0.15), direct country reach (0.10), and links to top 50 global hubs (0.10).
2. Passenger Traffic (weight 0.48): Observed official passenger throughput where available, and probabilistically reconstructed traffic elsewhere.
3. Catchment and Market Scale (weight 0.05): Metropolitan anchor population (0.40), national GDP per capita (0.25), international tourism arrivals (0.20), and national GDP (0.15).

To prevent temporal leakage, missing values are carried forward from past observations at or before year t, up to a maximum age of 3 years. Future values are never carried backward.

Percentile ranks are calculated against a fixed reference population across all years (commercial airports with scheduled service plus all observed airports). This expands coverage to all 9,051 airports while preventing shifting percentile denominators.

Airports are categorized by data quality:
- Observed (1,640 airports): Official passenger statistics from FAA, Eurostat, or OpenSky movements.
- Reconstructed (2,214 airports): Reconstructed from World Bank national totals with calibrated predictive intervals.
- Static Only (225 airports): Scored from physical capacity and network topology alone.

Uncertainty propagation: I run 50 Monte Carlo draws through the reconstructed inputs to produce lower and upper index bounds (importance_lo and importance_hi) for every airport and year.

## Supervised Models and Validation

I formulate forecasting as predicting the future change in importance percentile rank over 5 years (target_change_h5) and 10 years (target_change_h10), then adding that change back to current importance.

To prevent artificial rank jumps from data availability shifts, a training row is considered comparable only if the data quality classification is preserved between origin year t and target year t+h.

I evaluate three supervised models:
1. LightGBM Regressor with maximum tree depth 5 and 31 leaves.
2. Ridge Regression with logarithmic volume transformations and standard scaling.
3. Equal-weight Ensemble averaging LightGBM and Ridge predictions.

I also fit two quantile LightGBM models at alpha 0.10 and alpha 0.90 to produce uncertainty bands, and a 4-class LightGBM classifier predicting trajectory classes: emerging (change >= +2.0), declining (change <= -2.0), established hub (current rank >= 90 and change >= -1.0), or stable.

### Temporal Validation Folds

Validation uses rolling temporal folds. Origin years 2000 to 2015 train the models, with COVID target years (2020 to 2022) excluded from loss calculations. Folds 1 and 2 are headline evaluation folds. Fold 3 (origin 2020) is reported separately as a pandemic recovery year.

| Horizon | Fold | Origin Year | Model | Test N | Mover Precision | Mover Recall | Faller Precision | Faller Recall | MAE Change | Spearman Level | Calibrated Coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 1 | 2018 | Persistence | 1,553 | 0.122 | 0.122 | 0.058 | 0.058 | 7.213 | 0.8950 | - |
| 5 | 1 | 2018 | Linear Trend | 1,553 | 0.032 | 0.032 | 0.006 | 0.006 | 7.243 | 0.8948 | - |
| 5 | 1 | 2018 | Ridge | 1,553 | 0.327 | 0.327 | 0.237 | 0.237 | 7.357 | 0.8979 | - |
| 5 | 1 | 2018 | LightGBM | 1,553 | 0.308 | 0.308 | 0.051 | 0.051 | 7.008 | 0.9080 | - |
| 5 | 1 | 2018 | Ensemble | 1,553 | 0.359 | 0.359 | 0.244 | 0.244 | 7.102 | 0.9036 | 72.1% |
| 5 | 2 | 2019 | Persistence | 1,151 | 0.147 | 0.147 | 0.052 | 0.052 | 5.734 | 0.9166 | - |
| 5 | 2 | 2019 | Linear Trend | 1,151 | 0.078 | 0.078 | 0.103 | 0.103 | 5.877 | 0.9162 | - |
| 5 | 2 | 2019 | Ridge | 1,151 | 0.345 | 0.345 | 0.198 | 0.198 | 6.177 | 0.9186 | - |
| 5 | 2 | 2019 | LightGBM | 1,151 | 0.491 | 0.491 | 0.164 | 0.164 | 5.644 | 0.9426 | - |
| 5 | 2 | 2019 | Ensemble | 1,151 | 0.491 | 0.491 | 0.276 | 0.276 | 5.842 | 0.9315 | 74.2% |
| 5 | 3 (COVID) | 2020 | Persistence | 1,135 | 0.140 | 0.140 | 0.026 | 0.026 | 6.329 | 0.9140 | - |
| 5 | 3 (COVID) | 2020 | Ensemble | 1,135 | 0.596 | 0.596 | 0.167 | 0.167 | 6.509 | 0.9403 | 71.5% |
| 10 | 1 | 2013-2015 | Persistence | 4,571 | 0.124 | 0.124 | 0.052 | 0.052 | 4.608 | 0.9185 | - |
| 10 | 1 | 2013-2015 | Damped (0.00) | 4,571 | 0.124 | 0.124 | 0.052 | 0.052 | 4.608 | 0.9185 | - |
| 10 | 1 | 2013-2015 | Supervised Model| 4,571 | 0.352 | 0.352 | 0.273 | 0.273 | 7.629 | 0.9080 | 73.8% |

Key Findings:
- Precision equals recall for movers because both predicted and actual sets evaluate fixed top 10 percent quantiles.
- The supervised ensemble achieves 2.5x to 4.2x higher riser precision than persistence (0.359 to 0.491 versus 0.122 to 0.147).
- Detecting fallers is noticeably harder: faller precision reaches 0.244 to 0.276 across folds, reflecting sticky airline commitments.
- At Horizon 10, persistence beats supervised models on MAE (4.608 versus 7.629). Over a 10-year span, multi-year noise mean-reverts, and predicting zero change achieves lower average error than supervised extrapolation. The pipeline selects the damped persistence winner for 10-year forecasts.
- Split conformal calibration on training calibration slices widens the quantile bands, achieving 71.5% to 74.2% test coverage (within reach of the nominal 80% target).

## Region Transfer Experiment

To measure how much predictive quality is lost when a geographic region has no direct observed traffic, I ran a leave-one-region-out experiment hiding Europe and comparing three strategies:

| Model Variant | Mover Precision | Mover Recall | Change MAE | Spearman Rank | Quality Loss vs Observed |
|---|---|---|---|---|---|
| Observed Benchmark | 0.491 | 0.491 | 5.644 | 0.9426 | Baseline |
| Global Model | 0.380 | 0.380 | 7.021 | 0.8984 | +1.38 MAE points |
| Global + Region Effects | 0.410 | 0.410 | 6.840 | 0.9112 | +1.20 MAE points |
| Fine-Tuned on Developing | 0.340 | 0.340 | 7.412 | 0.8845 | +1.77 MAE points |

The results show that relying entirely on reconstructed traffic and regional fixed effects adds approximately 1.20 MAE points of error on 5-year change predictions, while maintaining an acceptable Spearman correlation above 0.91.

## Opportunity Radar

To identify structural growth opportunities, I built an Opportunity Radar evaluating unserved airport pairs using the validated network model:
1. Gravity Model: Origin and destination importance, great-circle distance, and domestic flags.
2. Link Prediction: Adamic-Adar common neighbor centrality and preferential attachment.
3. Momentum Multiplier: Forward 5-year forecast importance changes of both endpoints.

Link prediction validation achieves:
- Gravity AUC: 0.983
- Preferential Attachment AUC: 0.870
- Adamic-Adar AUC: 0.938
- Combined Logistic Model AUC: 0.993

The radar generates three curated views:
- Airline Candidates: Top 250 unserved city pairs with high network overlap and combined momentum.
- Investor Risers: Top 60 established airports experiencing strong predicted percentile increases.
- Tourism Destinations: Top 60 international destinations gaining connectivity.

All radar outputs carry explicit labels designating them as statistical model candidates, not confirmed commercial demand.

## Interpretability with SHAP

I compute TreeExplainer SHAP values from the LightGBM models to explain predictions for every airport:
- "extensive route network connectivity" (large direct route count)
- "central node in global airline graph" (high PageRank centrality)
- "solid three year rank gains" (positive multi-year momentum)
- "direct links to top global megahubs" (intercontinental hub access)
- "lower baseline importance percentile" (small baseline capacity)
- "close competition from larger rival hubs" (nearby competing hub)

## Honest Limitations

1. Network Topology Age: Global airline route edges use the OpenFlights 2014 snapshot combined with OpenSky 2019-2022 ADS-B movement data. Routes established after 2022 that were not captured in public flight logs are missing from the graph.
2. Within-Country Stability: Reconstructed traffic shares within a country remain mostly stable over time because they are driven by national passenger totals and physical airport capacity.
3. 10-Year Horizon Horizon Mean Reversion: Across a 10-year window, supervised models fail to beat persistence on MAE change because long-term aviation growth mean-reverts.
4. Exogenous Geopolitical and Economic Shocks: The model cannot anticipate sudden airspace closures, carrier bankruptcies, or regional conflicts that disrupt routes overnight.

## How to Run the Pipeline

Clone the repository and install dependencies:

```bash
git clone https://github.com/park-bit/skyline-index.git
cd skyline-index
pip install -r requirements.txt
```

To run the full pipeline from scratch:

```bash
python run_all.py
```

Or run individual scripts:

```bash
python scripts/01_download.py
python scripts/02_build_panel.py
python scripts/03_index_sensitivity.py
python scripts/04_build_model_table.py
python scripts/05_evaluate_baselines.py
python scripts/06_make_figures.py
python scripts/07_train_and_evaluate.py
python scripts/08_run_radar.py
python scripts/09_reconstruct_traffic_validation.py
python scripts/10_reconstruct_network_validation.py
pytest -v
```

If make is installed:

```bash
make all
```

## Running the Web Map Locally and Deploying

To launch the web map locally:

```bash
python -m http.server 8000
```

Open `http://localhost:8000/web/index.html` in your browser.

To deploy on Vercel with zero build step:
1. Connect the repository to Vercel.
2. Leave the build command blank and root directory as project root (or `web/`).
3. The included JSON data files are loaded via relative fallback paths with zero compilation required.

## Licence

This project is licensed under the MIT License. See LICENSE for details.
