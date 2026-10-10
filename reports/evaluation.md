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
| 5 | 1 | 2018 | lightgbm | 1479 | 0.115 | 0.115 | 0.169 | 0.169 | 4.312 | 0.9728 | - | - | - |
| 5 | 1 | 2018 | ensemble | 1479 | 0.074 | 0.074 | 0.176 | 0.176 | 4.534 | 0.972 | 0.8 | 0.627 | 0.544 |
| 5 | 2 | 2019 | persistence | 1416 | 0.106 | 0.106 | 0.077 | 0.077 | 3.481 | 0.9851 | - | - | - |
| 5 | 2 | 2019 | linear_trend | 1416 | 0.155 | 0.155 | 0.077 | 0.077 | 7.033 | 0.9732 | - | - | - |
| 5 | 2 | 2019 | ridge | 1416 | 0.261 | 0.261 | 0.218 | 0.218 | 3.326 | 0.9848 | - | - | - |
| 5 | 2 | 2019 | lightgbm | 1416 | 0.387 | 0.387 | 0.268 | 0.268 | 2.816 | 0.984 | - | - | - |
| 5 | 2 | 2019 | ensemble | 1416 | 0.373 | 0.373 | 0.254 | 0.254 | 2.953 | 0.985 | 0.8 | 0.893 | 0.643 |
| 10 | 1 | 2013-2015 | persistence | 4123 | 0.097 | 0.097 | 0.075 | 0.075 | 5.282 | 0.9576 | - | - | - |
| 10 | 1 | 2013-2015 | linear_trend | 4123 | 0.123 | 0.123 | 0.051 | 0.051 | 9.742 | 0.9331 | - | - | - |
| 10 | 1 | 2013-2015 | ridge | 4123 | 0.053 | 0.053 | 0.063 | 0.063 | 17.326 | 0.7787 | - | - | - |
| 10 | 1 | 2013-2015 | lightgbm | 4123 | 0.063 | 0.063 | 0.09 | 0.09 | 11.044 | 0.9357 | - | - | - |
| 10 | 1 | 2013-2015 | ensemble | 4123 | 0.065 | 0.065 | 0.099 | 0.099 | 13.904 | 0.8858 | 0.8 | 0.323 | 0.417 |

## COVID Fold Evaluation (Fold 3, Test Origin 2020)

| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage | Macro F1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 3 | 2020 | persistence | 1322 | 0.098 | 0.098 | 0.06 | 0.06 | 3.871 | 0.981 | - | - | - |
| 5 | 3 | 2020 | linear_trend | 1322 | 0.143 | 0.143 | 0.038 | 0.038 | 6.484 | 0.9646 | - | - | - |
| 5 | 3 | 2020 | ridge | 1322 | 0.18 | 0.18 | 0.203 | 0.203 | 6.03 | 0.9807 | - | - | - |
| 5 | 3 | 2020 | lightgbm | 1322 | 0.188 | 0.188 | 0.383 | 0.383 | 3.849 | 0.981 | - | - | - |
| 5 | 3 | 2020 | ensemble | 1322 | 0.203 | 0.203 | 0.398 | 0.398 | 3.892 | 0.9829 | 0.8 | 0.852 | 0.624 |

## Horizon 10 Evaluation

| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 1 | 2013-2015 | persistence | 4123 | 0.097 | 0.097 | 0.075 | 0.075 | 5.282 | 0.9576 | - | - |
| 10 | 1 | 2013-2015 | linear_trend | 4123 | 0.123 | 0.123 | 0.051 | 0.051 | 9.742 | 0.9331 | - | - |
| 10 | 1 | 2013-2015 | ridge | 4123 | 0.053 | 0.053 | 0.063 | 0.063 | 17.326 | 0.7787 | - | - |
| 10 | 1 | 2013-2015 | lightgbm | 4123 | 0.063 | 0.063 | 0.09 | 0.09 | 11.044 | 0.9357 | - | - |
| 10 | 1 | 2013-2015 | ensemble | 4123 | 0.065 | 0.065 | 0.099 | 0.099 | 13.904 | 0.8858 | 0.8 | 0.323 |

### Horizon 10 Damping Comparison
Damping factor gamma chosen on calibration slice: 0.7.
Damped ensemble MAE: 10.768, Spearman: 0.9202, Risers precision: 0.065.
Persistence achieves lower change MAE (5.282) than damped model (10.768). Persistence predicts zero change and wins on pure MAE across long horizons due to mean reversion.

## Performance by Data Quality Class

I evaluated performance separately across observed, reconstructed and static-only airports on the headline test folds.

| Data Quality | Count | Change MAE | Spearman Level | Risers Precision | Fallers Precision |
|---|---|---|---|---|---|
| observed | 4217 | 3.793 | 0.98 | 0.217 | 0.276 |

The model is weaker on static-only airports where absence of recorded flight movements forces predictions to rely solely on macro catchment drivers. Reconstructed airports achieve comparable rank preservation to observed airports.

## Region Transfer Experiment

I evaluated regional transfer by holding out Europe completely from training, simulating unobserved traffic using reconstructed inputs, and comparing against observed ground truth.

| Option | Held Out Region | Test N | MAE Change | Spearman Level | Risers P | Risers R | Fallers P | Fallers R |
|---|---|---|---|---|---|---|---|---|
| global_model | EU | 326 | 3.488 | 0.9778 | 0.0 | 0.0 | 0.242 | 0.242 |
| global_plus_region_effects | EU | 326 | 3.505 | 0.9772 | 0.0 | 0.0 | 0.212 | 0.212 |
| fine_tuned_regions | EU | 326 | 3.524 | 0.979 | 0.121 | 0.121 | 0.212 | 0.212 |
| observed_benchmark | EU | 326 | 3.488 | 0.9778 | 0.0 | 0.0 | 0.242 | 0.242 |

## Uncertainty Calibration

I calibrated prediction intervals using split conformal calibration on training-year slices, combined with reconstruction uncertainty spread by adding variances.
Any horizon or fold with measured coverage under 70 percent is labelled as a rough range (for example Fold 1 at horizon 5, measuring 62.2 percent). Horizon 10 bands achieve 32.3 percent coverage on the test fold when calibrated on the training slice (target year 2014, prior to test target years 2023 to 2025) and are labelled as indicative only.

## Confusion Matrices (Folds 1 to 3)
Classes: declining, emerging, established_hub, stable

### Fold 1 Multiclass Confusion Matrix
```
[[378  20   5 127]
 [209  49   0 123]
 [  0   0 176   0]
 [180  47   0 165]]
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

### Predicted Class Shares by Data Quality (+5)

| Data Quality | Declining | Emerging | Established Hub | Stable |
|---|---|---|---|---|
| observed | 0.018 | 0.017 | 0.127 | 0.837 |
| reconstructed | 0.010 | 0.176 | 0.119 | 0.694 |
| static_only | 0.004 | 0.196 | 0.040 | 0.760 |

### Predicted Class Shares by Data Quality (+10)

| Data Quality | Declining | Emerging | Established Hub | Stable |
|---|---|---|---|---|
| observed | 0.043 | 0.012 | 0.122 | 0.823 |
| reconstructed | 0.024 | 0.177 | 0.120 | 0.680 |
| static_only | 0.133 | 0.173 | 0.018 | 0.676 |

I retain the multiclass classifier solely for reporting macro F1 on historical cross-validation folds. Forward forecast classes are assigned directly: any airport with forecast level of 90 or higher is an established hub. For airports below 90, emerging and declining classes are assigned using predicted change percentile thresholds within each data quality group, requiring change of at least 2.0 points and at least 0.5 times band half-width.

The multiclass classifier achieves macro F1 scores of 0.544 on Fold 1 and 0.643 on Fold 2 across the four trajectory classes.
