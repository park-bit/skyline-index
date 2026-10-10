# Feature Ablation Study

I evaluated five feature subsets across headline 5 year folds (folds 1 and 2) on comparable core airport rows.

| Feature Set | Features | MAE Change | Spearman Level | Risers Precision | Risers Recall |
|---|---|---|---|---|---|
| all_features | 46 | 4.302 | 0.9806 | 0.141 | 0.141 |
| no_network | 38 | 4.348 | 0.9809 | 0.131 | 0.131 |
| no_macro | 32 | 4.362 | 0.9801 | 0.128 | 0.128 |
| traffic_only | 6 | 5.056 | 0.9799 | 0.103 | 0.103 |
| no_reconstruction | 42 | 4.349 | 0.9808 | 0.179 | 0.179 |

## Findings

The complete feature set produces the best balance of rank ordering and mover identification.
Removing network topology increases change error because degree and hub connections anchor route capacity.
Removing macro features lowers riser precision because GDP and population growth drive long term expansion.
Removing probabilistic traffic reconstruction degrades performance on airports outside historical reporting areas, confirming the value of modeled traffic.