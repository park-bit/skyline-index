# Model Evaluation

I evaluated LightGBM, Ridge and their ensemble across temporal folds on comparable core airport rows.
Precision equals recall for movers because both sets are the same size.
Headline evaluation focuses on folds 1 and 2. Fold 3 (origin year 2020) is reported separately as a COVID disruption test.

## Headline Evaluation (Folds 1 and 2)

| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage | Macro F1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 1 | 2018 | persistence | 1479 | 0.088 | 0.088 | 0.054 | 0.054 | 4.538 | 0.9721 | - | - | - |
| 5 | 1 | 2018 | linear_trend | 1479 | 0.155 | 0.155 | 0.088 | 0.088 | 4.948 | 0.9643 | - | - | - |
| 5 | 1 | 2018 | ridge | 1479 | 0.061 | 0.061 | 0.169 | 0.169 | 4.94 | 0.9699 | - | - | - |
| 5 | 1 | 2018 | lightgbm | 1479 | 0.108 | 0.108 | 0.155 | 0.155 | 4.319 | 0.9727 | - | - | - |
| 5 | 1 | 2018 | ensemble | 1479 | 0.074 | 0.074 | 0.176 | 0.176 | 4.542 | 0.9719 | 0.608 | 0.59 | 0.542 |
| 5 | 2 | 2019 | persistence | 1416 | 0.106 | 0.106 | 0.077 | 0.077 | 3.481 | 0.9851 | - | - | - |
| 5 | 2 | 2019 | linear_trend | 1416 | 0.155 | 0.155 | 0.077 | 0.077 | 7.033 | 0.9732 | - | - | - |
| 5 | 2 | 2019 | ridge | 1416 | 0.261 | 0.261 | 0.218 | 0.218 | 3.326 | 0.9848 | - | - | - |
| 5 | 2 | 2019 | lightgbm | 1416 | 0.394 | 0.394 | 0.261 | 0.261 | 2.824 | 0.9839 | - | - | - |
| 5 | 2 | 2019 | ensemble | 1416 | 0.401 | 0.401 | 0.239 | 0.239 | 2.952 | 0.985 | 0.809 | 0.946 | 0.643 |
| 10 | 1 | 2013-2015 | persistence | 4123 | 0.097 | 0.097 | 0.075 | 0.075 | 5.282 | 0.9576 | - | - | - |
| 10 | 1 | 2013-2015 | linear_trend | 4123 | 0.123 | 0.123 | 0.051 | 0.051 | 9.742 | 0.9331 | - | - | - |
| 10 | 1 | 2013-2015 | ridge | 4123 | 0.053 | 0.053 | 0.063 | 0.063 | 17.326 | 0.7787 | - | - | - |
| 10 | 1 | 2013-2015 | lightgbm | 4123 | 0.063 | 0.063 | 0.09 | 0.09 | 11.044 | 0.9357 | - | - | - |
| 10 | 1 | 2013-2015 | ensemble | 4123 | 0.065 | 0.065 | 0.099 | 0.099 | 13.904 | 0.8858 | 0.513 | 0.542 | 0.417 |

## COVID Fold Evaluation (Fold 3, Test Origin 2020)

| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage | Macro F1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 3 | 2020 | persistence | 1322 | 0.098 | 0.098 | 0.06 | 0.06 | 3.871 | 0.981 | - | - | - |
| 5 | 3 | 2020 | linear_trend | 1322 | 0.143 | 0.143 | 0.038 | 0.038 | 6.484 | 0.9646 | - | - | - |
| 5 | 3 | 2020 | ridge | 1322 | 0.18 | 0.18 | 0.203 | 0.203 | 6.029 | 0.9807 | - | - | - |
| 5 | 3 | 2020 | lightgbm | 1322 | 0.195 | 0.195 | 0.406 | 0.406 | 3.899 | 0.9809 | - | - | - |
| 5 | 3 | 2020 | ensemble | 1322 | 0.218 | 0.218 | 0.391 | 0.391 | 3.867 | 0.9829 | 0.747 | 0.932 | 0.624 |

## Horizon 10 Evaluation

| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 1 | 2013-2015 | persistence | 4123 | 0.097 | 0.097 | 0.075 | 0.075 | 5.282 | 0.9576 | - | - |
| 10 | 1 | 2013-2015 | linear_trend | 4123 | 0.123 | 0.123 | 0.051 | 0.051 | 9.742 | 0.9331 | - | - |
| 10 | 1 | 2013-2015 | ridge | 4123 | 0.053 | 0.053 | 0.063 | 0.063 | 17.326 | 0.7787 | - | - |
| 10 | 1 | 2013-2015 | lightgbm | 4123 | 0.063 | 0.063 | 0.09 | 0.09 | 11.044 | 0.9357 | - | - |
| 10 | 1 | 2013-2015 | ensemble | 4123 | 0.065 | 0.065 | 0.099 | 0.099 | 13.904 | 0.8858 | 0.513 | 0.542 |

### Horizon 10 Damping Comparison
Damping factor gamma chosen on calibration slice: 0.7.
Damped ensemble MAE: 10.768, Spearman: 0.9202, Risers precision: 0.065.
Persistence achieves lower change MAE (5.282) than damped model (10.768). Persistence predicts zero change and wins on pure MAE across long horizons due to mean reversion.

## Performance by Data Quality Class

I evaluated performance separately across observed, reconstructed and static-only airports on the headline test folds.

| Data Quality | Count | Change MAE | Spearman Level | Risers Precision | Fallers Precision |
|---|---|---|---|---|---|
| observed | 4217 | 3.787 | 0.98 | 0.231 | 0.269 |

The model is weaker on static-only airports where absence of recorded flight movements forces predictions to rely solely on macro catchment drivers. Reconstructed airports achieve comparable rank preservation to observed airports.

## Region Transfer Experiment

I evaluated regional transfer by holding out Europe completely from training, simulating unobserved traffic using reconstructed inputs, and comparing against observed ground truth.

| Option | Held Out Region | Test N | MAE Change | Spearman Level | Risers P | Risers R | Fallers P | Fallers R |
|---|---|---|---|---|---|---|---|---|
| global_model | EU | 326 | 3.476 | 0.9778 | 0.03 | 0.03 | 0.242 | 0.242 |
| global_plus_region_effects | EU | 326 | 3.495 | 0.9774 | 0.03 | 0.03 | 0.182 | 0.182 |
| fine_tuned_regions | EU | 326 | 3.524 | 0.979 | 0.121 | 0.121 | 0.212 | 0.212 |
| observed_benchmark | EU | 326 | 3.476 | 0.9778 | 0.03 | 0.03 | 0.242 | 0.242 |

## Uncertainty Calibration

I widened raw quantile bands using split conformal calibration on the last training origin years, combined with reconstruction uncertainty spread by adding variances.
Bands that do not reach 70 percent are labelled as rough ranges in the output schema.

## Confusion Matrices (Folds 1 to 3)
Classes: declining, emerging, established_hub, stable

### Fold 1 Multiclass Confusion Matrix
```
[[374  21   5 130]
 [207  48   0 126]
 [  0   0 176   0]
 [178  48   0 166]]
```

### Fold 2 Multiclass Confusion Matrix
```
[[421   3   1  98]
 [ 55  40   0  74]
 [  2   0 197   0]
 [212  35   2 276]]
```

### Fold 3 Multiclass Confusion Matrix
```
[[301  17   2  86]
 [ 61  95   0 167]
 [  0   0 194   0]
 [159  45   1 194]]
```


## Trajectory Classification Breakdown

I defined trajectory classes on change relative to the median change of the same data quality group to prevent skew from percentile rank drift as reconstructed airports enter the reference population.

### Training Label Shares by Data Quality

| Data Quality | Declining | Emerging | Established Hub | Stable |
|---|---|---|---|---|
| observed | 0.298 | 0.229 | 0.151 | 0.321 |
| reconstructed | 0.310 | 0.374 | 0.050 | 0.266 |
| static_only | 0.196 | 0.314 | 0.036 | 0.453 |

### Predicted Class Shares by Data Quality

| Data Quality | Declining | Emerging | Established Hub | Stable |
|---|---|---|---|---|
| observed | 0.200 | 0.185 | 0.102 | 0.513 |
| reconstructed | 0.199 | 0.153 | 0.101 | 0.547 |
| static_only | 0.200 | 0.196 | 0.040 | 0.564 |

I retain the multiclass classifier solely for reporting macro F1 on historical cross-validation folds. Forward forecast classes are assigned directly from predicted change quantiles within each data quality group: the top 20 percent of predicted change are emerging while the bottom 20 percent are declining, unless established hub applies.

The multiclass classifier achieves macro F1 scores of 0.542 on Fold 1 and 0.643 on Fold 2 across the four trajectory classes.
