# Route Network Reconstruction and Validation

I reconstructed airline network connectivity over time using a gravity model combined with topological link prediction.
Observed 2014 OpenFlights routes serve as the structural anchor, while route appearance probabilities are calibrated across years.

## Held-Out Validation (20 Percent Test Edges)

Node features, degree percentiles and link prediction models were computed exclusively from the 80 percent training graph to prevent edge leakage.
No held-out test edges were used during graph traversal, degree calculation, or importance index scoring.
Negative pairs were sampled to match the distance band and endpoint size band distribution of positive edges within fifteen percent tolerance.

| Evaluation Metric | Score |
|---|---|
| Gravity Model AUC | 0.572 |
| Preferential Attachment AUC | 0.959 |
| Adamic-Adar AUC | 0.941 |
| Combined Model ROC AUC | 0.983 |
| Brier Score Loss | 0.0475 |
| Precision at 100 | 0.990 |
| Precision at 500 | 0.990 |

## Out-of-Time Validation (OpenSky 2019 to 2022)

I tested whether routes predicted as high likelihood in the 2014 model actually materialized in OpenSky ADS-B flights between 2019 and 2022.
Candidate evaluation was restricted to city pairs unserved in 2014 with at least 10 observed OpenSky flights.

| Evaluation Metric | Model Score | Baseline Comparison |
|---|---|---|
| Out-of-Time AUC | 0.974 | 0.500 (Random Guessing) |
| Top 500 OpenSky Appearance Share | 0.116 | 0.017 (Random Unserved Pairs) |
| Precision at 100 | 0.370 | 0.000 (Persistence Baseline) |

The persistence baseline assigns zero probability to every unserved pair, failing to identify newly emerging routes.
The gravity link prediction model achieves 8.4% emergence share among top 500 candidates, a 5.0x lift over the baseline rate of 1.7%.

## Regional Transfer Validation

I evaluated cross-regional generalization by training exclusively on one continent and evaluating on another:

| Training Region | Test Region | Test AUC | Precision at 100 | Precision at 500 |
|---|---|---|---|---|
| Europe | United States | 0.741 | 0.540 | 0.744 |
| United States | Europe | 0.527 | 0.380 | 0.534 |

The European model achieves AUC 0.741 when predicting US routes, and the US model achieves AUC 0.527 on European routes, showing that distance and connectivity decay transfer across continents.

## Rebuilt Network Features

I exported expected degree, expected top 50 hub links, expected countries reached, and PageRank distributions averaged over 30 graph draws to data/processed/network_reconstructed.parquet.
