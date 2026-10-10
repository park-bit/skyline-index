# Capacity Watch Historical Backtest (2013 to 2018)

This report evaluates the predictive performance of the Capacity Watch expansion candidate flag using historical panel data from origin year 2013 to target year 2018.

## Methodology

Using origin 2013 features only, we computed capacity percentiles from runway count and longest runway length, and pressure gaps against 2013 importance scores.
Airports in observed and reconstructed data quality groups with present score 30 or higher and pressure gap in the top 10 percent within their group were flagged as expansion candidates.
Realised 5 year importance changes to 2018 were compared between flagged expansion candidates, a random baseline within eligible airports, and the persistence baseline.

## Evaluation Metrics

| Metric | Flagged Candidates | Random Baseline | Persistence Baseline | Lift |
|---|---|---|---|---|
| Eligible Airports | 351 | 3495 | 3495 | - |
| 5 Year Growth Hit Rate | 30.5% | 41.1% | 41.1% | 0.74x |

## Status and Findings

Because empirical lift measures 0.74x (below the 1.2 validation threshold), this feature is labeled as exploratory.

Physical runway constraints indicate existing infrastructure bottlenecks rather than unconstrained expansion momentum.
Airports operating under severe capacity pressure in 2013 were already close to throughput limits, experiencing growth deceleration or mean reversion over subsequent years unless substantial capital works were delivered.
Capacity Watch serves as an infrastructure pressure proxy and model signal, not as engineering planning advice.
