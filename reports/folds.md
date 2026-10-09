# Temporal Validation Split Design

This document specifies the exact temporal folds used for evaluating airport importance forecasts.
Splits are strictly origin-year based to prevent lookahead bias.

## Horizon 5 Rolling Folds

For horizon 5, rolling origin folds guarantee that all training target years occur at or before the test origin year.
COVID target years 2020 to 2022 are completely excluded from both training and evaluation.

| Fold | Train Origin Years | Train Target Years | Gap Years | Test Origin Year | Test Target Year |
|------|--------------------|--------------------|-----------|------------------|------------------|
|    1 | 2000 to 2013       | 2005 to 2018       | 2014 to 2017 | 2018             | 2023             |
|    2 | 2000 to 2014       | 2005 to 2019       | 2015 to 2018 | 2019             | 2024             |
|    3 | 2000 to 2014       | 2005 to 2019       | 2015 to 2019 | 2020             | 2025             |

Verification for Horizon 5: in every fold, the maximum training target year never exceeds the test origin year.

## Horizon 10 Blocked Split

Because the historical panel begins in 2000, a strict rolling fold without calendar overlap is not possible for a 10 year horizon.
We use a blocked split by origin year with a multi-year gap.

| Fold | Train Origin Years | Train Target Years | Gap Years | Test Origin Years | Test Target Years | Calendar Overlap Years |
|------|--------------------|--------------------|-----------|-------------------|-------------------|------------------------|
|    1 | 2000 to 2004       | 2010 to 2014       | 2005 to 2012 | 2013 to 2015      | 2023 to 2025      | 2013 to 2014           |

Note on Calendar Overlap: Training target years (2010 to 2014) and test origin years (2013 to 2015) overlap in calendar time for 2013 and 2014.
This is documented as a known structural limitation of 10 year horizon evaluation on a 26 year panel.
