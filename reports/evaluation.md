# Model Evaluation

I evaluated LightGBM, Ridge and their ensemble across temporal folds on comparable core airport rows.
Precision equals recall for movers because both sets are the same size.
Headline evaluation focuses on folds 1 and 2. Fold 3 (origin year 2020) is reported separately as a COVID disruption test.

## Headline Evaluation (Folds 1 and 2)

| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage | Macro F1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 1 | 2018 | persistence | 4893 | 0.094 | 0.094 | 0.094 | 0.094 | 4.175 | 0.978 | - | - | - |
| 5 | 1 | 2018 | linear_trend | 4893 | 0.169 | 0.169 | 0.098 | 0.098 | 4.299 | 0.9764 | - | - | - |
| 5 | 1 | 2018 | ridge | 4893 | 0.118 | 0.118 | 0.098 | 0.098 | 5.314 | 0.9727 | - | - | - |
| 5 | 1 | 2018 | lightgbm | 4893 | 0.102 | 0.102 | 0.169 | 0.169 | 4.078 | 0.9755 | - | - | - |
| 5 | 1 | 2018 | ensemble | 4893 | 0.12 | 0.12 | 0.131 | 0.131 | 4.527 | 0.9752 | 0.631 | 0.697 | 0.499 |
| 5 | 2 | 2019 | persistence | 4753 | 0.109 | 0.109 | 0.088 | 0.088 | 3.893 | 0.9862 | - | - | - |
| 5 | 2 | 2019 | linear_trend | 4753 | 0.109 | 0.109 | 0.111 | 0.111 | 4.95 | 0.9819 | - | - | - |
| 5 | 2 | 2019 | ridge | 4753 | 0.158 | 0.158 | 0.149 | 0.149 | 4.947 | 0.9829 | - | - | - |
| 5 | 2 | 2019 | lightgbm | 4753 | 0.143 | 0.143 | 0.248 | 0.248 | 3.537 | 0.9841 | - | - | - |
| 5 | 2 | 2019 | ensemble | 4753 | 0.147 | 0.147 | 0.21 | 0.21 | 4.034 | 0.9847 | 0.671 | 0.84 | 0.511 |
| 10 | 1 | 2013-2015 | persistence | 14384 | 0.104 | 0.104 | 0.089 | 0.089 | 4.608 | 0.9645 | - | - | - |
| 10 | 1 | 2013-2015 | linear_trend | 14384 | 0.132 | 0.132 | 0.079 | 0.079 | 5.886 | 0.9566 | - | - | - |
| 10 | 1 | 2013-2015 | ridge | 14384 | 0.204 | 0.204 | 0.131 | 0.131 | 8.542 | 0.94 | - | - | - |
| 10 | 1 | 2013-2015 | lightgbm | 14384 | 0.242 | 0.242 | 0.133 | 0.133 | 8.056 | 0.9548 | - | - | - |
| 10 | 1 | 2013-2015 | ensemble | 14384 | 0.221 | 0.221 | 0.155 | 0.155 | 8.125 | 0.9541 | 0.442 | 0.462 | 0.38 |

## COVID Fold Evaluation (Fold 3, Test Origin 2020)

| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage | Macro F1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 3 | 2020 | persistence | 4754 | 0.107 | 0.107 | 0.097 | 0.097 | 4.329 | 0.9795 | - | - | - |
| 5 | 3 | 2020 | linear_trend | 4754 | 0.143 | 0.143 | 0.032 | 0.032 | 5.156 | 0.9724 | - | - | - |
| 5 | 3 | 2020 | ridge | 4754 | 0.13 | 0.13 | 0.147 | 0.147 | 4.947 | 0.9752 | - | - | - |
| 5 | 3 | 2020 | lightgbm | 4754 | 0.254 | 0.254 | 0.256 | 0.256 | 3.875 | 0.979 | - | - | - |
| 5 | 3 | 2020 | ensemble | 4754 | 0.164 | 0.164 | 0.197 | 0.197 | 4.234 | 0.9785 | 0.736 | 0.86 | 0.547 |

## Horizon 10 Evaluation

| Horizon | Fold | Test Year | Model | Test N | Risers P | Risers R | Fallers P | Fallers R | MAE Change | Spearman Level | Raw Coverage | Calibrated Coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 1 | 2013-2015 | persistence | 14384 | 0.104 | 0.104 | 0.089 | 0.089 | 4.608 | 0.9645 | - | - |
| 10 | 1 | 2013-2015 | linear_trend | 14384 | 0.132 | 0.132 | 0.079 | 0.079 | 5.886 | 0.9566 | - | - |
| 10 | 1 | 2013-2015 | ridge | 14384 | 0.204 | 0.204 | 0.131 | 0.131 | 8.542 | 0.94 | - | - |
| 10 | 1 | 2013-2015 | lightgbm | 14384 | 0.242 | 0.242 | 0.133 | 0.133 | 8.056 | 0.9548 | - | - |
| 10 | 1 | 2013-2015 | ensemble | 14384 | 0.221 | 0.221 | 0.155 | 0.155 | 8.125 | 0.9541 | 0.442 | 0.462 |

### Horizon 10 Damping Comparison
Damping factor gamma chosen on calibration slice: 0.9.
Damped ensemble MAE: 7.629, Spearman: 0.9568, Risers precision: 0.221.
Persistence achieves lower change MAE (4.608) than damped model (7.629084437814272). Persistence predicts zero change and wins on pure MAE across long horizons due to mean reversion.

## Performance by Data Quality Class

I evaluated performance separately across observed, reconstructed and static-only airports on the headline test folds.

| Data Quality | Count | Change MAE | Spearman Level | Risers Precision | Fallers Precision |
|---|---|---|---|---|---|
| observed | 4217 | 3.615 | 0.9789 | 0.155 | 0.231 |
| reconstructed | 8650 | 4.481 | 0.9789 | 0.179 | 0.22 |
| static_only | 1533 | 4.907 | 0.9824 | 0.311 | 0.075 |

The model is weaker on static-only airports where absence of recorded flight movements forces predictions to rely solely on macro catchment drivers. Reconstructed airports achieve comparable rank preservation to observed airports.

## Region Transfer Experiment

I evaluated regional transfer by holding out Europe completely from training, simulating unobserved traffic using reconstructed inputs, and comparing against observed ground truth.

| Option | Held Out Region | Test N | MAE Change | Spearman Level | Risers P | Risers R | Fallers P | Fallers R |
|---|---|---|---|---|---|---|---|---|
| global_model | EU | 590 | 4.556 | 0.9786 | 0.068 | 0.068 | 0.102 | 0.102 |
| global_plus_region_effects | EU | 590 | 4.963 | 0.9797 | 0.017 | 0.017 | 0.186 | 0.186 |
| fine_tuned_regions | EU | 590 | 4.6 | 0.9794 | 0.153 | 0.153 | 0.102 | 0.102 |
| observed_benchmark | EU | 590 | 4.913 | 0.9759 | 0.0 | 0.0 | 0.085 | 0.085 |

## Uncertainty Calibration

I widened raw quantile bands using split conformal calibration on the last training origin years, combined with reconstruction uncertainty spread by adding variances.
Bands that do not reach 70 percent are labelled as rough ranges in the output schema.

## Confusion Matrices (Folds 1 to 3)
Classes: declining, emerging, established_hub, stable

### Fold 1 Multiclass Confusion Matrix
```
[[1530  140   29  917]
 [ 462   47    0  177]
 [   0    0  438    5]
 [ 471   66   63  548]]
```

### Fold 2 Multiclass Confusion Matrix
```
[[1528  165   48 1080]
 [ 127   54    0   93]
 [   1    0  356   51]
 [ 485   98   36  631]]
```

### Fold 3 Multiclass Confusion Matrix
```
[[1396   36   44 1042]
 [ 266  158    0  212]
 [   0    0  395    0]
 [ 494   71   78  562]]
```
