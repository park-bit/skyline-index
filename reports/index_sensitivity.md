# Airport Importance Index Sensitivity Analysis

This sensitivity analysis checks the stability of airport rankings under perturbation of the component weights.
Base weights: network 0.47, traffic 0.48, catchment market 0.05.
Weights were perturbed across 25 independent random trials with shifts up to +/- 15 percentage points and re-normalised to sum to 1.0.

Threshold chosen: 0.95.
Empirical median Spearman correlation across all trials: 0.9992.
Empirical minimum Spearman correlation across all trials and years: 0.9925.

## Perturbation Trials

| Trial | Network Weight | Traffic Weight | Market Weight | Mean Spearman | Min Spearman |
|-------|----------------|----------------|---------------|---------------|--------------|
|  1    |          0.370 |          0.527 |         0.102 |        0.9979 |       0.9972 |
|  2    |          0.557 |          0.420 |         0.022 |        0.9977 |       0.9970 |
|  3    |          0.335 |          0.585 |         0.080 |        0.9951 |       0.9934 |
|  4    |          0.502 |          0.317 |         0.180 |        0.9941 |       0.9925 |
|  5    |          0.579 |          0.400 |         0.020 |        0.9961 |       0.9951 |
|  6    |          0.439 |          0.493 |         0.067 |        0.9998 |       0.9997 |
|  7    |          0.473 |          0.439 |         0.088 |        0.9998 |       0.9997 |
|  8    |          0.453 |          0.522 |         0.025 |        0.9996 |       0.9995 |
|  9    |          0.438 |          0.543 |         0.019 |        0.9992 |       0.9989 |
| 10    |          0.473 |          0.507 |         0.020 |        0.9999 |       0.9999 |
| 11    |          0.556 |          0.422 |         0.022 |        0.9978 |       0.9971 |
| 12    |          0.442 |          0.453 |         0.104 |        1.0000 |       1.0000 |
| 13    |          0.470 |          0.410 |         0.120 |        0.9994 |       0.9992 |
| 14    |          0.521 |          0.423 |         0.056 |        0.9987 |       0.9983 |
| 15    |          0.347 |          0.632 |         0.021 |        0.9944 |       0.9926 |
| 16    |          0.520 |          0.424 |         0.056 |        0.9987 |       0.9984 |
| 17    |          0.456 |          0.364 |         0.180 |        0.9984 |       0.9980 |
| 18    |          0.415 |          0.459 |         0.126 |        0.9998 |       0.9998 |
| 19    |          0.444 |          0.539 |         0.018 |        0.9993 |       0.9991 |
| 20    |          0.510 |          0.463 |         0.027 |        0.9996 |       0.9995 |
| 21    |          0.438 |          0.413 |         0.149 |        0.9998 |       0.9998 |
| 22    |          0.472 |          0.458 |         0.069 |        0.9999 |       0.9999 |
| 23    |          0.380 |          0.599 |         0.021 |        0.9966 |       0.9954 |
| 24    |          0.514 |          0.469 |         0.017 |        0.9997 |       0.9996 |
| 25    |          0.319 |          0.570 |         0.111 |        0.9948 |       0.9930 |

Conclusion: The airport importance index ranking is highly stable to weight perturbations.
The Spearman rank correlation consistently exceeds the 0.95 stability threshold across all trials.
