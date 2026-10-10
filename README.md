# Skyline Index: Global Aviation Intelligence Map

I built Skyline Index to model the global aviation network and forecast how the relative importance of commercial airports changes over 5-year and 10-year horizons. The project produces an annual importance percentile rank from 0 to 100 for global airports, trains supervised models on historical network and macroeconomic shifts, and presents the resulting forecasts on an interactive dark-canvas web map with an unserved route Opportunity Radar.

The interactive map displays 4,079 commercial airports. Out of 9,051 total airport facilities in the historical panel, the map includes active commercial airports with recorded network routes or observed traffic, excluding private airstrips, closed facilities, and unserved rural airfields without commercial flights.

![Global Aviation Intelligence Map](docs/map.png)




find more [here](https://skyline-index-web.vercel.app/)

## Why Importance is Not Only Passenger Volume

Air transport importance is often equated with raw annual passenger volume. While passenger volume measures airport throughput, it fails to capture topological centrality, intercontinental gateway roles, or regional market isolation. A hub that connects forty regional spokes to twelve international flag carriers plays a structural coordination role in the global airline network that volume numbers alone do not reveal. If two airports both handle twenty million passengers annually, but one operates as an isolated domestic origin-destination spoke while the other serves as a global transit crossroads connecting three continents, their systemic importance to global civil aviation differs fundamentally.

In this project, I define airport importance as a composite measure that combines route network topology, annual passenger counts, and regional market catchment. I evaluate it over a 26-year panel from 2000 to 2025, and forecast forward changes for 2030 (+5 years) and 2035 (+10 years).

## Probabilistic Reconstruction of Missing Data

Official airport passenger time series are concentrated in the United States (FAA) and Europe (Eurostat). Most other nations do not publish open annual airport-level passenger counts. Rather than restricting analysis to Western hubs or treating missing values as zeros, I reconstruct missing historical traffic and network topology probabilistically.

### 1. Airport Traffic Reconstruction (src/reconstruct_traffic.py)

- National passenger anchors: I use World Bank national commercial air passenger totals per country and year. Across observed countries and years, the empirical ratio between airport throughput sums and World Bank passengers has a global median of 2.47, with 1.98 in the United States, 1.78 in Germany, and 2.48 in France.
- Public source availability: Automated download scripts confirmed that UK Civil Aviation Authority data is already embedded in the Eurostat avia_paoa release (1993 to 2019). Standalone portals for Canada, Australia, Brazil, and Mexico timed out, failed connection, or returned interactive form shells, and India (data.gov.in) required API key authentication. They were not ingested to avoid manual editing.
- Traffic share model: I model each airport's share of its national passenger traffic using LightGBM and Ridge regression. Predictors include anchor city population, 100 km catchment population, maximum runway length, airport type, scheduled service flags, OpenSky flight counts, static degree, distance to the nearest larger hub, GDP per capita, and continental region.
- Normalization: Predicted airport shares are normalized within each country and year to sum to the anchored national total. Within-country ranks remain mostly stable over time because local drivers change slowly.
- Uncertainty: I compute split conformal prediction intervals on validation residuals of log traffic share to construct lower (traffic_recon_lo) and upper (traffic_recon_hi) bounds per airport-year.

### 2. Network Reconstruction Over Time (src/reconstruct_network.py)

- Time-varying gravity model: I fit link probability p_ij(t) for each airport pair and year using time-varying node masses (reconstructed traffic from Phase 1 and country GDP), great-circle distance, and domestic or regional flags.
- Calibration: Route probabilities are calibrated so that expected network degree in 2014 matches the observed 2014 OpenFlights snapshot.
- Topological features: For every year from 2000 to 2025, I compute expected degree, expected weighted degree, top 50 hub links, direct countries reached, and PageRank averaged over 30 Monte Carlo sampled graphs with its standard deviation.

### 3. Reconstruction Validation Results

From reports/reconstruction_traffic.md, leave-one-country-out validation in 2019 gives:

| Country | Airports | Log MAE | Spearman | Top 20 Overlap | Within 2x Share | 80% Conformal Coverage |
|---|---|---|---|---|---|---|
| US | 645 | 1.206 | 0.854 | 0.850 | 0.350 | 0.715 |
| DE | 23 | 0.751 | 0.807 | 0.950 | 0.652 | 0.957 |
| FR | 39 | 0.590 | 0.885 | 0.850 | 0.615 | 0.974 |
| GB | 42 | 0.769 | 0.935 | 0.850 | 0.619 | 0.857 |
| ES | 34 | 0.618 | 0.936 | 0.850 | 0.647 | 1.000 |
| IT | 34 | 0.610 | 0.874 | 0.900 | 0.706 | 0.941 |

When training on Europe and testing on the United States, the model achieves Log MAE 1.224, Spearman 0.851, top 20 overlap 0.850, and 71.2% interval coverage, beating the city population split (Log MAE 2.356, Spearman 0.424) and equal split (Log MAE 4.002, Spearman 0.000). Applying the US model to Germany yields Log MAE 0.926 and Spearman 0.781 (versus 1.554 and 0.331 for population split).

From reports/reconstruction_network.md, held-out route validation on the 20% test graph yields Combined Model ROC AUC 0.744 (Gravity 0.603, Preferential Attachment 0.665, Adamic-Adar 0.761), Brier loss 0.0510, Precision at 100 of 0.870, and Precision at 500 of 0.866. In out-of-time validation on OpenSky 2019 to 2022 route appearances, the model achieves AUC 0.959, Precision at 100 of 0.250 (versus 0.000 for persistence), and top 500 candidate appearance share of 0.084 (versus 0.017 for random unserved pairs, a 5.0x lift). Regional transfer from Europe to the US yields AUC 0.741, and US to Europe yields AUC 0.527.

Where reconstruction struggles:
- Island nations and isolated resource outposts have passenger volumes driven by tourism charters or mining shifts that local population and runway length do not explain.
- Network link prediction on cross-continental transfer loses precision on thin secondary routes that depend on airline fleet planning rather than gravity mass.

## Defining the Importance Index

I calculate airport importance across three component groups:
1. Network Topology (weight 0.47): PageRank centrality (weight 0.25), betweenness centrality (0.20), total route degree (0.20), flight frequency degree (0.15), direct country reach (0.10), and links to top 50 global hubs (0.10).
2. Passenger Traffic (weight 0.48): Observed passenger throughput where available, and probabilistically reconstructed traffic elsewhere.
3. Catchment and Market Scale (weight 0.05): Metropolitan anchor population (0.40), national GDP per capita (0.25), international tourism arrivals (0.20), and national GDP (0.15).

Missing values are carried forward from past observations at or before year t, up to a limit of 3 years. Future values are never carried backward.

Percentile ranks are calculated against a fixed reference population across all years (commercial airports with scheduled service plus all observed airports). This scores all 9,051 airports without shifting percentile denominators.

Airports carry data quality labels:
- Observed (1,640 airports): Official passenger statistics from FAA, Eurostat, or OpenSky.
- Reconstructed (2,214 airports): Reconstructed from World Bank national totals with calibrated intervals.
- Static Only (225 airports): Scored from physical capacity and network topology alone.

Uncertainty propagation: I run 50 Monte Carlo draws through the reconstructed inputs to produce lower and upper index bounds (importance_lo and importance_hi) for every airport and year.

## Supervised Models and Validation

I formulate forecasting as predicting the future change in importance percentile rank over 5 years (target_change_h5) and 10 years (target_change_h10), then adding that change back to current importance. A training row is comparable only if its data quality class is identical at origin year t and target year t+h.

I evaluate three supervised models:
1. LightGBM Regressor with maximum tree depth 5 and 31 leaves.
2. Ridge Regression with logarithmic volume transformations and standard scaling.
3. Equal-weight Ensemble averaging LightGBM and Ridge predictions.

I also fit two quantile LightGBM models at alpha 0.10 and alpha 0.90 to produce uncertainty bands, and a 4-class LightGBM classifier for historical fold macro F1 reporting. In production forecasts at +5 and +10, trajectory classes are assigned directly from predicted change quantiles within each data quality group: the top 20 percent of predicted change are emerging while the bottom 20 percent are declining, unless established hub applies (current rank >= 90 and predicted change >= -1.0).

### Temporal Validation Folds

Validation uses rolling temporal folds. Origin years 2000 to 2015 train the models, with COVID target years (2020 to 2022) excluded from loss calculations.

Results from reports/evaluation.md:

| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Calibrated Coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 1 | 2018 | persistence | 1,479 | 0.088 | 0.088 | 0.054 | 0.054 | 4.538 | 0.9721 | - |
| 5 | 1 | 2018 | linear_trend | 1,479 | 0.155 | 0.155 | 0.088 | 0.088 | 4.948 | 0.9643 | - |
| 5 | 1 | 2018 | ridge | 1,479 | 0.061 | 0.061 | 0.169 | 0.169 | 4.940 | 0.9699 | - |
| 5 | 1 | 2018 | lightgbm | 1,479 | 0.108 | 0.108 | 0.155 | 0.155 | 4.319 | 0.9727 | - |
| 5 | 1 | 2018 | ensemble | 1,479 | 0.074 | 0.074 | 0.176 | 0.176 | 4.542 | 0.9719 | 0.590 |
| 5 | 2 | 2019 | persistence | 1,416 | 0.106 | 0.106 | 0.077 | 0.077 | 3.481 | 0.9851 | - |
| 5 | 2 | 2019 | linear_trend | 1,416 | 0.155 | 0.155 | 0.077 | 0.077 | 7.033 | 0.9732 | - |
| 5 | 2 | 2019 | ridge | 1,416 | 0.261 | 0.261 | 0.218 | 0.218 | 3.326 | 0.9848 | - |
| 5 | 2 | 2019 | lightgbm | 1,416 | 0.394 | 0.394 | 0.261 | 0.261 | 2.824 | 0.9839 | - |
| 5 | 2 | 2019 | ensemble | 1,416 | 0.401 | 0.401 | 0.239 | 0.239 | 2.952 | 0.9850 | 0.946 |
| 5 | 3 (COVID) | 2020 | persistence | 1,322 | 0.098 | 0.098 | 0.060 | 0.060 | 3.871 | 0.9810 | - |
| 5 | 3 (COVID) | 2020 | lightgbm | 1,322 | 0.195 | 0.195 | 0.406 | 0.406 | 3.899 | 0.9809 | - |
| 5 | 3 (COVID) | 2020 | ensemble | 1,322 | 0.218 | 0.218 | 0.391 | 0.391 | 3.867 | 0.9829 | 0.932 |
| 10 | 1 | 2013-2015 | persistence | 4,123 | 0.097 | 0.097 | 0.075 | 0.075 | 5.282 | 0.9576 | - |
| 10 | 1 | 2013-2015 | lightgbm | 4,123 | 0.063 | 0.063 | 0.090 | 0.090 | 11.044 | 0.9357 | - |
| 10 | 1 | 2013-2015 | ensemble | 4,123 | 0.065 | 0.065 | 0.099 | 0.099 | 13.904 | 0.8858 | 0.542 |
| 10 | 1 | 2013-2015 | damped (gamma 0.7) | 4,123 | 0.065 | 0.065 | 0.099 | 0.099 | 10.768 | 0.9202 | - |

Findings:
- Precision equals recall for movers because both predicted and actual sets evaluate fixed top 10 percent quantiles.
- Riser precision is close to random (0.10) at horizon 5 on Fold 1 (0.074 to 0.108), reaching 0.394 to 0.401 on Fold 2.
- LightGBM beats persistence on change MAE (4.319 versus 4.538 on Fold 1, and 2.824 versus 3.481 on Fold 2).
- The model does better on fallers than risers, achieving 0.155 on Fold 1 and 0.261 on Fold 2 (versus 0.054 and 0.077 for persistence).
- At Horizon 10, supervised models lose to persistence on change MAE (persistence achieves 5.282, while LightGBM yields 11.044 and the damped ensemble yields 10.768). Over ten years, multi-year noise mean-reverts, and predicting zero change achieves lower average error than supervised extrapolation. We ship the damped model (damping factor 0.7 chosen on calibration slice) to provide directional signals, but report both.
- The 10-year calibrated band achieves 54.2% coverage, well below the 70% threshold. It is labeled as a rough range in the map and documentation.

### Trajectory Classification Breakdown

Defining trajectory classes relative to data quality group medians balances classes across tiers. Training label shares: declining 0.196 to 0.310, emerging 0.229 to 0.374, established hub 0.036 to 0.151, stable 0.266 to 0.453. In forward predictions at +5, shares by data quality are declining 0.199 to 0.200, emerging 0.153 to 0.196, established hub 0.040 to 0.102, stable 0.513 to 0.564, yielding overall shares of stable 0.534, declining 0.199, emerging 0.168, and established hub 0.098. At +10, overall shares are stable 0.530, declining 0.200, emerging 0.196, and established hub 0.075. The classifier is retained solely for reporting macro F1 on historical folds (0.542 on Fold 1 and 0.643 on Fold 2).

### Region Transfer Experiment

From reports/evaluation.md, holding out Europe and evaluating on 326 European airports:

| Option | Held Out Region | Test N | MAE Change | Spearman Level | Risers P | Fallers P |
|---|---|---|---|---|---|---|
| global_model | EU | 326 | 3.476 | 0.9778 | 0.030 | 0.242 |
| global_plus_region_effects | EU | 326 | 3.495 | 0.9774 | 0.030 | 0.182 |
| fine_tuned_regions | EU | 326 | 3.524 | 0.9790 | 0.121 | 0.212 |
| observed_benchmark | EU | 326 | 3.476 | 0.9778 | 0.030 | 0.242 |

Performance across observed airports on headline folds shows change MAE 3.787, Spearman 0.9800, risers precision 0.231, and fallers precision 0.269.

From reports/ablation.md, the 5-year change MAE is 3.887 with all 46 features, 3.914 without network features, 3.607 without macro features, 3.630 with traffic features only, and 3.887 without reconstructed traffic.

## Opportunity Radar

I built an Opportunity Radar evaluating unserved airport pairs using the network model:
1. Gravity model based on origin and destination importance, great-circle distance, and domestic flags.
2. Link prediction using Adamic-Adar common neighbor centrality and preferential attachment.
3. Momentum multiplier from the 5-year forecast importance changes of both endpoints.

Validation on 2014 route splits with distance and endpoint size matched negatives yields AUC scores of 0.603 (gravity), 0.665 (preferential attachment), 0.761 (Adamic-Adar), and 0.744 (combined logistic model), with precision at 100 of 0.870 and precision at 500 of 0.866. Out-of-time validation against OpenSky 2019 to 2022 yields an AUC of 0.959 and 8.4% appearance share among the top 500 candidates (a 5.0x lift over the 1.7% random baseline).

The radar exports the top 250 candidate unserved routes, alongside curated views for investors and tourism boards. The investor radar includes only airports with observed or medium confidence data. All candidates are labeled as statistical model candidates, not confirmed commercial demand.

## Interpretability with SHAP

I compute TreeExplainer SHAP values from the LightGBM models to explain predictions for each airport:
- "extensive route network connectivity" (large direct route count)
- "central node in global airline graph" (high PageRank centrality)
- "solid three year rank gains" (positive multi-year momentum)
- "direct links to top global megahubs" (intercontinental hub access)
- "lower baseline importance percentile" (small baseline capacity)
- "close competition from larger rival hubs" (nearby competing hub)

## Limitations

1. Network topology age: Global airline route edges use the OpenFlights 2014 snapshot combined with OpenSky 2019-2022 ADS-B movement data. Routes established after 2022 that were not captured in public flight logs are missing from the graph.
2. Within-country stability: Reconstructed traffic shares within a country remain mostly stable over time because they are driven by national passenger totals and physical airport capacity.
3. Decade mean reversion: Across a 10-year window, supervised models fail to beat persistence on MAE change because long-term aviation growth mean-reverts.
4. Exogenous shocks: The model cannot anticipate sudden airspace closures, carrier bankruptcies, or regional conflicts that disrupt routes overnight.

## How to Run the Pipeline

Clone the repository and install dependencies:

```bash
git clone https://github.com/park-bit/skyline-index.git
cd skyline-index
pip install -r requirements.txt
```

Download public raw datasets (OurAirports, OpenFlights, World Bank, Eurostat):

```bash
python scripts/01_download.py
```

To run the full pipeline:

```bash
python run_all.py
```

Or run individual scripts in order:

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
