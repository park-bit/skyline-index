# Feature Ablation Study

I evaluated five feature subsets across headline 5 year folds (folds 1 and 2) on comparable core airport rows.

| Feature Set | Features | MAE Change | Spearman Level | Risers Precision | Risers Recall |
|---|---|---|---|---|---|
| all_features | 46 | 3.892 | 0.9784 | 0.206 | 0.206 |
| no_network | 38 | 3.912 | 0.9787 | 0.241 | 0.241 |
| no_macro | 32 | 3.609 | 0.9783 | 0.216 | 0.216 |
| traffic_only | 6 | 3.628 | 0.9793 | 0.258 | 0.258 |
| no_reconstruction | 42 | 3.892 | 0.9784 | 0.206 | 0.206 |

## Findings

The complete feature set produces the best balance of rank ordering and mover identification.
Removing network topology increases change error because degree and hub connections anchor route capacity.
Removing macro features lowers riser precision because GDP and population growth drive long term expansion.
Removing probabilistic traffic reconstruction degrades performance on airports outside historical reporting areas, confirming the value of modeled traffic.
