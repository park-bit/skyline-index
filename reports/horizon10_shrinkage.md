# Horizon-10 shrinkage evaluation

Generated 2026-10-11 by `scripts/05_horizon10_shrinkage.py`.

## Why this exists

At the 10-year horizon the shipped ensemble (LightGBM + Ridge) loses to persistence on change MAE (README: 5.282 for persistence vs 10.768 for the damped ensemble). Rather than hard-coding a damping factor, this script asks: what multiplier alpha on the ensemble's predicted change minimises out-of-sample MAE, with alpha = 0 being persistence?

## Folds

- **fold1** (data/outputs/folds.json): train origins 2000-2004 (n=917), test origins 2013-2015 (n=4,123). Mean |raw ensemble change| = 12.69 pts vs mean |actual change| = 5.28 pts. Blocked split from the notebook. Train targets 2010-2014 overlap in calendar time with test origins 2013-2015 (documented limitation of a 26-year panel).
- **pseudo_fold_early** (constructed in 05_horizon10_shrinkage.py): train origins 2000-2001 (n=195), test origins 2006-2009 (n=5,452). Mean |raw ensemble change| = 7.02 pts vs mean |actual change| = 5.35 pts. Pseudo-fold with earlier origins: train origins 2000-2001 (targets 2010-2011), test origins 2006-2009 (targets 2016-2019). No test outcome is visible to the model, but train targets post-date the test origins, so treat as supporting evidence only.

## MAE of alpha x ensemble change (lower is better)

| alpha | MAE fold1 | MAE pseudo_fold_early | mean MAE | Spearman fold1 | Spearman pseudo_fold_early |
|---|---|---|---|---|---|
| 0.00 (persistence) | 5.282 | 5.351 | 5.317 | 0.9576 | 0.9598 |
| 0.02 | 5.315 | 5.384 | 5.349 | 0.9573 | 0.9599 |
| 0.04 | 5.371 | 5.420 | **5.396** | 0.9569 | 0.9600 |
| 0.06 | 5.448 | 5.461 | 5.454 | 0.9565 | 0.9601 |
| 0.08 | 5.537 | 5.506 | 5.521 | 0.9561 | 0.9602 |
| 0.10 | 5.639 | 5.555 | 5.597 | 0.9555 | 0.9602 |
| 0.20 | 6.287 | 5.859 | 6.073 | 0.9522 | 0.9606 |
| 0.30 | 7.060 | 6.241 | 6.650 | 0.9481 | 0.9609 |
| 0.40 | 7.917 | 6.693 | 7.305 | 0.9431 | 0.9612 |
| 0.50 | 8.833 | 7.191 | 8.012 | 0.9369 | 0.9614 |
| 0.60 | 9.784 | 7.725 | 8.755 | 0.9293 | 0.9616 |
| 0.70 | 10.768 | 8.288 | 9.528 | 0.9202 | 0.9618 |
| 0.80 | 11.785 | 8.867 | 10.326 | 0.9097 | 0.9619 |
| 0.90 | 12.830 | 9.462 | 11.146 | 0.8984 | 0.9619 |
| 1.00 | 13.904 | 10.068 | 11.986 | 0.8858 | 0.9619 |

## Conclusion

- Persistence MAE (mean across folds): **5.317**. Full ensemble (alpha = 1): **11.986**.
- Chosen **best_alpha = 0.04**, mean MAE **5.396** (+1.5% vs persistence).
- Selection rule: Persistence (alpha=0) had the lowest MAE; no shrunk ensemble beats it. By the documented rule, best_alpha is the largest alpha whose mean MAE stays within 2% of the persistence MAE (5.317); alpha=0.04 costs +1.5% MAE and keeps the sign of the ensemble change so the +10 map still shows direction. This is a presentation choice, not a validated accuracy gain. MAE averaged over 2 folds (fold1, pseudo_fold_early).
- Rank preservation: Spearman of implied levels vs realised levels is 0.9587 at alpha = 0 and 0.9238 at alpha = 1 (mean across folds); on fold 1 it falls monotonically with alpha, i.e. the ensemble adds no ranking information at 10 years.

The ensemble's raw 10-year changes are several times larger than realised changes on average (see mean |raw| vs mean |actual| above): over a decade, airport importance percentiles mean-revert and the model trained on 2000-2004 origins extrapolates trends that did not persist. Shrinking toward zero is therefore the honest fix. `04_build_intelligence.py` applies best_alpha to every airport's `forecast_h10.change` to produce `change_damped` / `level_damped`; the frontend labels this as damped.

Caveats: the horizon-10 fold has calendar overlap between train targets and test origins (documented in reports/folds.md); the pseudo-fold uses only two training origins, so its absolute MAE level is not comparable to fold 1 and only the alpha ranking is used. Test rows are the high-confidence core population (same filter as the production training slice).
