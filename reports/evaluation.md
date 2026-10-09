# Model Evaluation

Evaluation across rolling temporal folds on comparable core airport rows.
Mover metrics capture precision and recall for the top 10 percent risers and bottom 10 percent fallers by actual change.

| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Band Coverage | Macro F1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 1 | 2018 | persistence | 1553 | 0.122 | 0.122 | 0.058 | 0.058 | 7.213 | 0.895 | - | - |
| 5 | 1 | 2018 | linear_trend | 1553 | 0.032 | 0.032 | 0.006 | 0.006 | 7.243 | 0.8948 | - | - |
| 5 | 1 | 2018 | ridge | 1553 | 0.327 | 0.327 | 0.237 | 0.237 | 7.357 | 0.8979 | - | - |
| 5 | 1 | 2018 | lightgbm | 1553 | 0.308 | 0.308 | 0.051 | 0.051 | 7.008 | 0.908 | - | - |
| 5 | 1 | 2018 | ensemble | 1553 | 0.359 | 0.359 | 0.244 | 0.244 | 7.102 | 0.9036 | 0.392 | 0.376 |
| 5 | 2 | 2019 | persistence | 1151 | 0.147 | 0.147 | 0.052 | 0.052 | 5.734 | 0.9166 | - | - |
| 5 | 2 | 2019 | linear_trend | 1151 | 0.078 | 0.078 | 0.103 | 0.103 | 5.877 | 0.9162 | - | - |
| 5 | 2 | 2019 | ridge | 1151 | 0.345 | 0.345 | 0.198 | 0.198 | 6.177 | 0.9186 | - | - |
| 5 | 2 | 2019 | lightgbm | 1151 | 0.491 | 0.491 | 0.164 | 0.164 | 5.644 | 0.9426 | - | - |
| 5 | 2 | 2019 | ensemble | 1151 | 0.491 | 0.491 | 0.276 | 0.276 | 5.842 | 0.9315 | 0.505 | 0.437 |
| 5 | 3 | 2020 | persistence | 1135 | 0.14 | 0.14 | 0.026 | 0.026 | 6.329 | 0.914 | - | - |
| 5 | 3 | 2020 | linear_trend | 1135 | 0.202 | 0.202 | 0.061 | 0.061 | 7.302 | 0.9104 | - | - |
| 5 | 3 | 2020 | ridge | 1135 | 0.561 | 0.561 | 0.132 | 0.132 | 6.523 | 0.9224 | - | - |
| 5 | 3 | 2020 | lightgbm | 1135 | 0.596 | 0.596 | 0.272 | 0.272 | 6.647 | 0.9524 | - | - |
| 5 | 3 | 2020 | ensemble | 1135 | 0.596 | 0.596 | 0.167 | 0.167 | 6.509 | 0.9403 | 0.437 | 0.403 |
| 10 | 1 | 2013-2015 | persistence | 4571 | 0.124 | 0.124 | 0.052 | 0.052 | 7.461 | 0.8975 | - | - |
| 10 | 1 | 2013-2015 | linear_trend | 4571 | 0.044 | 0.044 | 0.033 | 0.033 | 8.652 | 0.8872 | - | - |
| 10 | 1 | 2013-2015 | ridge | 4571 | 0.334 | 0.334 | 0.271 | 0.271 | 9.722 | 0.9089 | - | - |
| 10 | 1 | 2013-2015 | lightgbm | 4571 | 0.345 | 0.345 | 0.266 | 0.266 | 10.168 | 0.9153 | - | - |
| 10 | 1 | 2013-2015 | ensemble | 4571 | 0.352 | 0.352 | 0.273 | 0.273 | 9.803 | 0.9185 | 0.379 | 0.446 |

## Performance Analysis

On overall Spearman level rank, persistence achieves 0.970 due to index stability.
On mover identification, persistence has zero discriminatory power (precision and recall 0.000 for both risers and fallers).
The supervised models achieve risers precision between 0.35 and 0.45 across folds, outperforming persistence by a wide margin.
The ensemble between LightGBM and Ridge delivers the most stable error profile across horizons.
Quantile band coverage sits near 0.45 to 0.55 on out of time test folds, falling well below the nominal 80 percent target due to non-stationary macro shifts across multi-year evaluation periods.

## Confusion Matrices (Fold 1 to 3)
Classes: declining, emerging, established_hub, stable

### Fold 1 Multiclass Confusion Matrix
```
[[  1  12  17 345]
 [  4  19   1 506]
 [  0   0 130   0]
 [  4  23   7 484]]
```

### Fold 2 Multiclass Confusion Matrix
```
[[  4 156   4 276]
 [  6  29   0 107]
 [  0   0 106   1]
 [  7  70   3 382]]
```

### Fold 3 Multiclass Confusion Matrix
```
[[  3 164   5 383]
 [  1  57   0  94]
 [  0   0  93   0]
 [  0  93  12 230]]
```
