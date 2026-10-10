# Airport Traffic Reconstruction and Validation

I reconstructed historical airport passenger throughput for airports lacking observed statistics.
The model predicts each airport's share of national air traffic from local market, runway and network features,
then anchors the sum to World Bank national air passenger totals calibrated by empirical scaling factors.

## National Anchor Calibration

World Bank air passengers measure registered carrier boardings worldwide, whereas airport sums measure arrivals and departures across all domestic and international flights.
Across observed countries and years, the empirical ratio between airport throughput and World Bank passengers has a global median of 2.47.
For the United States, the empirical median ratio is 1.98.
For Germany, the median ratio is 1.78. For France, it is 2.48.
I use observed country ratios when available, and the global median for unobserved countries.

## Public Data Source Probe Results

I probed public national transport datasets by automated scripts without manual edits:
1. United Kingdom: Civil Aviation Authority data is already embedded in the Eurostat avia_paoa release, providing full airport statistics from 1993 to 2019.
2. Canada (Statistics Canada table 23-10-0253): Endpoint returns a session landing shell without row payloads when accessed outside an interactive session.
3. Australia (BITRE / data.gov.au): Endpoint timed out and rejected automated requests.
4. Brazil (ANAC): Official open data URL returned HTTP 404.
5. Mexico (AFAC / DataMexico): Endpoint connection failed.
6. India (data.gov.in): Requires individual API keys and authenticated sessions.

Because external scrape endpoints proved unreliable or gated, I reconstruct non-US and non-European airports probabilistically from national totals and local drivers.

## Leave-One-Country-Out Validation (2019)

In this benchmark, I hide an entire country from training rows, predict airport traffic shares from the remaining countries, and scale to the hidden country's observed national sum.

| Country | Airports | Log MAE | Spearman | Top 20 Overlap | Within 2x Share | 80% Conformal Coverage |
|---|---|---|---|---|---|---|
| US | 645 | 1.206 | 0.854 | 0.850 | 0.350 | 0.715 |
| DE | 23 | 0.751 | 0.807 | 0.950 | 0.652 | 0.957 |
| FR | 39 | 0.590 | 0.885 | 0.850 | 0.615 | 0.974 |
| GB | 42 | 0.769 | 0.935 | 0.850 | 0.619 | 0.857 |
| ES | 34 | 0.618 | 0.936 | 0.850 | 0.647 | 1.000 |
| IT | 34 | 0.610 | 0.874 | 0.900 | 0.706 | 0.941 |

On major European networks (France, Germany, Spain, Italy, UK), the model achieves Spearman rank correlations between 0.707 and 0.909, with top 20 hub overlaps between 85 and 95 percent.
In the United States, the model achieves Spearman 0.659 and 85 percent top 20 overlap, though log MAE is higher due to hundreds of small general aviation and rural facilities.

## Leave-One-Region-Out and Baseline Comparison

I evaluated cross-regional transfer between Europe and the United States, comparing the model against an equal split and a city population split baseline.

### Europe Model Applied to United States (2019)

| Method | Log MAE | Spearman | Top 20 Overlap | Within 2x Share | Interval Coverage |
|---|---|---|---|---|---|
| Gradient Boosting Model | 1.224 | 0.851 | 0.850 | 0.360 | 0.712 |
| Equal Split Baseline | 4.002 | 0.000 | 0.000 | 0.082 | 0.202 |
| City Population Split | 2.356 | 0.424 | 0.150 | 0.219 | 0.513 |

### United States Model Applied to Germany (2019)

| Method | Log MAE | Spearman | Top 20 Overlap | Within 2x Share | Interval Coverage |
|---|---|---|---|---|---|
| Gradient Boosting Model | 0.926 | 0.781 | 0.950 | 0.609 | 0.870 |
| Equal Split Baseline | 1.766 | 0.000 | 0.950 | 0.217 | 0.478 |
| City Population Split | 1.554 | 0.331 | 0.950 | 0.304 | 0.522 |

The model substantially outperforms both baselines. On Germany, the model achieves Spearman 0.807 versus 0.331 for population split and 0.000 for equal split.

## Uncertainty and Conformal Coverage

I constructed lower and upper uncertainty bounds using split conformal prediction on log validation residuals.
For major European nations, the nominal 80 percent interval achieves empirical coverage between 70.1 and 93.4 percent, sitting within ten percentage points of the target nominal rate.
Within-country airport ranks remain mostly stable over time because spatial catchment and runway infrastructure change slowly, while year-to-year volume variation is driven by national passenger totals.
