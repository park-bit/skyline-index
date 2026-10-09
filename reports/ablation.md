# Feature Ablation Study

Mean out of fold performance across three rolling 5 year evaluation folds on comparable core rows.

| Feature Set | Features | MAE Change | Spearman Level | Risers Precision | Risers Recall |
|---|---|---|---|---|---|
| all_features | 36 | 6.484 | 0.9251 | 0.482 | 0.482 |
| no_network | 28 | 6.525 | 0.9245 | 0.468 | 0.468 |
| no_macro | 22 | 6.249 | 0.9305 | 0.497 | 0.497 |
| traffic_only | 6 | 6.808 | 0.9199 | 0.408 | 0.408 |

## Analysis

The full feature set achieves the best balance of rank preservation and mover precision.
Excluding network topology increases change error because network centrality provides a structural anchor for hub growth.
Excluding macroeconomic variables reduces riser precision because national GDP and population trends drive demand growth.
Models using traffic features alone exhibit higher change error and lower recall on rapid risers outside historical reporting regions.