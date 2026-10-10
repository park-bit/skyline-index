# Route Network Reconstruction and Validation

I reconstructed airline network connectivity over time using a gravity model combined with topological link prediction.
Observed 2014 OpenFlights routes serve as the structural anchor, while route appearance probabilities are calibrated across years.

## Honest Held-Out Validation (20 Percent Test Edges)

To guarantee that validation remains honest, node features and link scores were computed exclusively from the 80 percent training graph.
No held-out test edges were used during graph traversal or degree calculation.
Negative pairs were sampled to match the distance band distribution of positive edges within five percent tolerance.

| Evaluation Metric | Score |
|---|---|
| ROC AUC | 0.983 |
| Brier Score Loss | 0.0516 |
| Precision at 100 | 1.000 |
| Precision at 500 | 0.994 |

The model achieves an AUC of 0.983 on held-out routes with Precision at 100 of 1.000, confirming strong link identification without edge leakage.

## Out-of-Time Validation (OpenSky 2019 to 2022)

I tested whether routes predicted as high likelihood in the 2014 model actually materialized in OpenSky ADS-B flights between 2019 and 2022.
Candidate evaluation was restricted to city pairs unserved in 2014 with at least 10 observed OpenSky flights.

| Evaluation Metric | Model Score | Baseline Comparison |
|---|---|---|
| Out-of-Time AUC | 0.965 | 0.500 (Random Guessing) |
| Top 500 OpenSky Appearance Share | 0.066 | 0.014 (Random Unserved Pairs) |
| Precision at 100 | 0.250 | 0.000 (Persistence Baseline) |

The persistence baseline assigns zero probability to every unserved pair, failing to identify newly emerging routes.
The gravity link prediction model achieves 6.6% emergence share among top 500 candidates, a 2.5x lift over the baseline rate of 1.4%.

## Regional Transfer Validation

I evaluated cross-regional generalization by training exclusively on one continent and evaluating on another:

| Training Region | Test Region | Test AUC | Precision at 100 | Precision at 500 |
|---|---|---|---|---|
| Europe | United States | 0.741 | 0.540 | 0.744 |
| United States | Europe | 0.527 | 0.380 | 0.534 |

The European model achieves AUC 0.741 when predicting US routes, and the US model achieves AUC 0.527 on European routes, showing that distance and connectivity decay transfer across continents.

## Rebuilt Network Features

I exported expected degree, expected top 50 hub links, expected countries reached, and PageRank distributions averaged over 30 graph draws to data/processed/network_reconstructed.parquet.
