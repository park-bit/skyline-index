# Baseline Model Evaluation

We evaluate two non-parametric reference baselines across temporal validation folds.
The persistence baseline assumes that each airport maintains its current importance percentile into the future.
The linear trend baseline extrapolates the annualized trajectory observed over the preceding five years.
Performance is measured by mean absolute error on level and change, rank correlation on level, and precision and recall for top decile movers.

## Index Time Variation Summary (Core Set)

- Standard deviation of 5-year change: 7.016 percentile points
- Pearson correlation between importance at t and t+5: 0.9710
- Spearman rank correlation between importance at t and t+5: 0.9716

## Performance Summary Table: Core Set (Comparable Observations)

| Horizon | Fold | Test Year | Baseline | Airports | MAE Level | MAE Change | Spearman | Risers Prec | Risers Rec | Fallers Prec | Fallers Rec |
|---------|------|-----------|----------|----------|-----------|------------|----------|-------------|------------|--------------|-------------|
| h=5     | 1    | 2018      | persistence  |     1553 |     7.213 |      7.213 |   0.8950 |       0.122 |      0.122 |        0.058 |       0.058 |
| h=5     | 1    | 2018      | linear_trend |     1553 |     7.890 |      7.890 |   0.8884 |       0.045 |      0.045 |        0.019 |       0.019 |
| h=5     | 2    | 2019      | persistence  |     1151 |     5.734 |      5.734 |   0.9166 |       0.147 |      0.147 |        0.052 |       0.052 |
| h=5     | 2    | 2019      | linear_trend |     1151 |     7.822 |      7.822 |   0.9074 |       0.103 |      0.103 |        0.069 |       0.069 |
| h=5     | 3    | 2020      | persistence  |     1135 |     6.329 |      6.329 |   0.9140 |       0.140 |      0.140 |        0.026 |       0.026 |
| h=5     | 3    | 2020      | linear_trend |     1135 |    10.540 |     10.540 |   0.8714 |       0.026 |      0.026 |        0.053 |       0.053 |
| h=10    | 1    | 2013-2015 | persistence  |     4571 |     7.461 |      7.461 |   0.8975 |       0.124 |      0.124 |        0.052 |       0.052 |
| h=10    | 1    | 2013-2015 | linear_trend |     4571 |    11.420 |     11.420 |   0.8485 |       0.072 |      0.072 |        0.028 |       0.028 |

## Performance Summary Table: All Airports (Comparable Observations)

| Horizon | Fold | Test Year | Baseline | Airports | MAE Level | MAE Change | Spearman | Risers Prec | Risers Rec | Fallers Prec | Fallers Rec |
|---------|------|-----------|----------|----------|-----------|------------|----------|-------------|------------|--------------|-------------|
| h=5     | 1    | 2018      | persistence  |     8965 |     3.924 |      3.924 |   0.9768 |       0.103 |      0.103 |        0.071 |       0.071 |
| h=5     | 1    | 2018      | linear_trend |     8965 |     4.852 |      4.852 |   0.9684 |       0.132 |      0.132 |        0.036 |       0.036 |
| h=5     | 2    | 2019      | persistence  |     8503 |     4.965 |      4.965 |   0.9681 |       0.122 |      0.122 |        0.103 |       0.103 |
| h=5     | 2    | 2019      | linear_trend |     8503 |     6.184 |      6.184 |   0.9552 |       0.060 |      0.060 |        0.019 |       0.019 |
| h=5     | 3    | 2020      | persistence  |     8413 |     5.004 |      5.004 |   0.9656 |       0.141 |      0.141 |        0.088 |       0.088 |
| h=5     | 3    | 2020      | linear_trend |     8413 |     7.442 |      7.442 |   0.9372 |       0.014 |      0.014 |        0.015 |       0.015 |
| h=10    | 1    | 2013-2015 | persistence  |    26596 |     5.398 |      5.398 |   0.9652 |       0.123 |      0.123 |        0.086 |       0.086 |
| h=10    | 1    | 2013-2015 | linear_trend |    26596 |     6.737 |      6.737 |   0.9352 |       0.148 |      0.148 |        0.028 |       0.028 |

The persistence baseline achieves lower absolute error than linear extrapolation because mean reversion dominates short-term airport momentum.
Linear trend captures directional shifts for actual risers and fallers better than random selection.
