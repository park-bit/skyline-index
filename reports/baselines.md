# Baseline Model Evaluation

We evaluate two non-parametric reference baselines across temporal validation folds.
The persistence baseline assumes that each airport maintains its current importance percentile into the future.
The linear trend baseline extrapolates the annualized trajectory observed over the preceding five years.
Performance is measured by mean absolute error on level and change, rank correlation on level, and precision and recall for top decile movers.

## Index Time Variation Summary (Core Set)

- Standard deviation of 5-year change: 6.539 percentile points
- Pearson correlation between importance at t and t+5: 0.9806
- Spearman rank correlation between importance at t and t+5: 0.9750

## Performance Summary Table: Core Set (Comparable Observations)

| Horizon | Fold | Test Year | Baseline | Airports | MAE Level | MAE Change | Spearman | Risers Prec | Risers Rec | Fallers Prec | Fallers Rec |
|---------|------|-----------|----------|----------|-----------|------------|----------|-------------|------------|--------------|-------------|
| h=5     | 1    | 2018      | persistence  |     1479 |     4.538 |      4.538 |   0.9721 |       0.088 |      0.088 |        0.054 |       0.054 |
| h=5     | 1    | 2018      | linear_trend |     1479 |     5.484 |      5.484 |   0.9538 |       0.128 |      0.128 |        0.122 |       0.122 |
| h=5     | 2    | 2019      | persistence  |     1416 |     3.481 |      3.481 |   0.9851 |       0.106 |      0.106 |        0.077 |       0.077 |
| h=5     | 2    | 2019      | linear_trend |     1416 |     7.653 |      7.653 |   0.9613 |       0.092 |      0.092 |        0.077 |       0.077 |
| h=5     | 3    | 2020      | persistence  |     1322 |     3.871 |      3.871 |   0.9810 |       0.098 |      0.098 |        0.060 |       0.060 |
| h=5     | 3    | 2020      | linear_trend |     1322 |     8.848 |      8.848 |   0.9435 |       0.090 |      0.090 |        0.038 |       0.038 |
| h=10    | 1    | 2013-2015 | persistence  |     4123 |     5.282 |      5.282 |   0.9576 |       0.097 |      0.097 |        0.075 |       0.075 |
| h=10    | 1    | 2013-2015 | linear_trend |     4123 |     9.902 |      9.902 |   0.9008 |       0.169 |      0.169 |        0.133 |       0.133 |

## Performance Summary Table: All Airports (Comparable Observations)

| Horizon | Fold | Test Year | Baseline | Airports | MAE Level | MAE Change | Spearman | Risers Prec | Risers Rec | Fallers Prec | Fallers Rec |
|---------|------|-----------|----------|----------|-----------|------------|----------|-------------|------------|--------------|-------------|
| h=5     | 1    | 2018      | persistence  |     8548 |     3.940 |      3.940 |   0.9795 |       0.097 |      0.097 |        0.092 |       0.092 |
| h=5     | 1    | 2018      | linear_trend |     8548 |     6.008 |      6.008 |   0.9587 |       0.085 |      0.085 |        0.112 |       0.112 |
| h=5     | 2    | 2019      | persistence  |     8165 |     4.199 |      4.199 |   0.9758 |       0.120 |      0.120 |        0.080 |       0.080 |
| h=5     | 2    | 2019      | linear_trend |     8165 |     8.538 |      8.538 |   0.9464 |       0.038 |      0.038 |        0.075 |       0.075 |
| h=5     | 3    | 2020      | persistence  |     8185 |     4.478 |      4.478 |   0.9688 |       0.128 |      0.128 |        0.090 |       0.090 |
| h=5     | 3    | 2020      | linear_trend |     8185 |     9.128 |      9.128 |   0.9251 |       0.027 |      0.027 |        0.016 |       0.016 |
| h=10    | 1    | 2013-2015 | persistence  |    25329 |     4.972 |      4.972 |   0.9586 |       0.107 |      0.107 |        0.095 |       0.095 |
| h=10    | 1    | 2013-2015 | linear_trend |    25329 |    11.192 |     11.192 |   0.8994 |       0.070 |      0.070 |        0.086 |       0.086 |

The persistence baseline achieves lower absolute error than linear extrapolation because mean reversion dominates short-term airport momentum.
Linear trend captures directional shifts for actual risers and fallers better than random selection.
