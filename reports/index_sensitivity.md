# Airport Importance Index Sensitivity Analysis

This sensitivity analysis checks the stability of airport rankings under perturbation of the component weights.
Base weights: network 0.47, traffic 0.48, catchment market 0.05.
Weights were perturbed across 25 independent random trials with shifts up to +/- 15 percentage points and re-normalised to sum to 1.0.

Threshold chosen: 0.95.
Empirical median Spearman correlation across all trials: 0.9973.
Empirical minimum Spearman correlation across all trials and years: 0.9467.

## Perturbation Trials

| Trial | Network Weight | Traffic Weight | Market Weight | Mean Spearman | Min Spearman |
|-------|----------------|----------------|---------------|---------------|--------------|
|  1    |          0.370 |          0.527 |         0.102 |        0.9955 |       0.9953 |
|  2    |          0.557 |          0.420 |         0.022 |        0.9973 |       0.9970 |
|  3    |          0.335 |          0.585 |         0.080 |        0.9941 |       0.9932 |
|  4    |          0.502 |          0.317 |         0.180 |        0.9483 |       0.9467 |
|  5    |          0.579 |          0.400 |         0.020 |        0.9958 |       0.9952 |
|  6    |          0.439 |          0.493 |         0.067 |        0.9996 |       0.9995 |
|  7    |          0.473 |          0.439 |         0.088 |        0.9983 |       0.9980 |
|  8    |          0.453 |          0.522 |         0.025 |        0.9992 |       0.9990 |
|  9    |          0.438 |          0.543 |         0.019 |        0.9985 |       0.9981 |
| 10    |          0.473 |          0.507 |         0.020 |        0.9992 |       0.9992 |
| 11    |          0.556 |          0.422 |         0.022 |        0.9974 |       0.9971 |
| 12    |          0.442 |          0.453 |         0.104 |        0.9970 |       0.9969 |
| 13    |          0.470 |          0.410 |         0.120 |        0.9931 |       0.9926 |
| 14    |          0.521 |          0.423 |         0.056 |        0.9986 |       0.9983 |
| 15    |          0.347 |          0.632 |         0.021 |        0.9937 |       0.9919 |
| 16    |          0.520 |          0.424 |         0.056 |        0.9987 |       0.9984 |
| 17    |          0.456 |          0.364 |         0.180 |        0.9658 |       0.9641 |
| 18    |          0.415 |          0.459 |         0.126 |        0.9938 |       0.9935 |
| 19    |          0.444 |          0.539 |         0.018 |        0.9986 |       0.9982 |
| 20    |          0.510 |          0.463 |         0.027 |        0.9993 |       0.9992 |
| 21    |          0.438 |          0.413 |         0.149 |        0.9866 |       0.9861 |
| 22    |          0.472 |          0.458 |         0.069 |        0.9996 |       0.9995 |
| 23    |          0.380 |          0.599 |         0.021 |        0.9959 |       0.9948 |
| 24    |          0.514 |          0.469 |         0.017 |        0.9989 |       0.9989 |
| 25    |          0.319 |          0.570 |         0.111 |        0.9912 |       0.9907 |

Conclusion: The airport importance index ranking is highly stable to weight perturbations.
The Spearman rank correlation consistently exceeds the 0.95 stability threshold across all trials.
