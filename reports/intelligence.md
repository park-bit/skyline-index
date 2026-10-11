# Intelligence layer: headline findings

Built by `scripts/05_horizon10_shrinkage.py` and `scripts/04_build_intelligence.py` (run `make intelligence`).
Outputs: `web/intelligence.json` (1.35 MB, mirrored to `data/outputs/`), `web/vendor/world-110m.geojson`
(187 KB, 177 countries), and the post-processed `web/forecasts.json` (5.50 MB; new per-airport fields
`rank_present`, `rank_h5`, `rank_h10`, `continent`, `forecast_h10.change_damped`, `forecast_h10.level_damped`).
All figures below are as of 2025 across the 4,079 forecast airports.

## 1. Horizon-10 shrinkage: persistence wins, alpha = 0.04 is shipped

The notebook's 10-year ensemble (LightGBM + Ridge) was re-trained on the horizon-10 fold from
`data/outputs/folds.json` (train origins 2000-2004, test origins 2013-2015, n_test = 4,123) and on a
pseudo-fold with earlier origins (train 2000-2001, test 2006-2009, n_test = 5,452). The MAE of
`alpha x predicted change` was measured for alpha in {0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.2, ..., 1.0}:

| alpha | 0 (persistence) | 0.04 | 0.1 | 0.3 | 0.5 | 0.7 | 1.0 |
|---|---|---|---|---|---|---|---|
| mean MAE (pts) | **5.317** | 5.396 | 5.597 | 6.650 | 8.012 | 9.528 | 11.986 |
| mean Spearman (levels) | 0.9587 | 0.9585 | 0.9579 | 0.9545 | 0.9492 | 0.9410 | 0.9238 |

Fold 1 reproduces the README numbers exactly (persistence 5.282, full ensemble 13.904, gamma = 0.7 gives
10.768). MAE rises monotonically with alpha on both folds and Spearman falls on fold 1: the ensemble adds no
10-year ranking information, and its raw changes (mean |pred| 12.7 pts) are 2.4x larger than realised changes
(5.3 pts). Persistence therefore wins outright. Per the documented rule, the shipped `best_alpha` is the
largest alpha whose MAE stays within 2 % of persistence: **0.04** (+1.5 % MAE), so `change_damped` keeps the
sign of the ensemble's view while barely moving levels. This is a presentation choice, not a validated gain;
the frontend labels the +10 horizon as damped (alpha = 0.04). Full table: `reports/horizon10_shrinkage.md`.

## 2. Network resilience

Route graph: 3,388 airports with at least one route, 18,809 undirected edges (union of the truncated
`routes` lists in forecasts.json and the full OpenFlights snapshot restricted to the forecast airports),
8 components, giant component 99.2 %, mean degree 11.1, clustering 0.486. 357 airports are articulation
points (their removal disconnects someone).

**Critical hubs** (top 5 by `removal_reach_loss_pct` = share of connected airport pairs that are severed or
lengthened by >= 2 hops when the airport is removed):

| airport | reach loss | airports cut off |
|---|---|---|
| ANC Anchorage (US) | 2.19 % | 37 |
| PPT Papeete (PF) | 1.72 % | 29 |
| BOG Bogotá (CO) | 1.60 % | 27 |
| BET Bethel, Alaska (US) | 1.60 % | 27 |
| SJO San José (CR) | 1.42 % | 24 |

followed by FAI, DEN, JAV (Ilulissat), YZF (Yellowknife) and HIR (Honiara). The pattern is clear: the
airports whose loss hurts global reach most are not the mega-hubs (LAX 0.38 %, DXB 0.27 %, CDG 0.06 %, FRA
0.00 %: their partners have many alternatives) but the regional gateways that are the only link for Alaska,
French Polynesia, the Colombian interior, Greenland, the Canadian north and the Solomon Islands.

**Fragile spokes** (degree <= 3, highest dependency HHI): 847 airports are classed `fragile`, 1,186 `watch`,
1,355 `robust`. The 50 listed fragile spokes all have HHI = 1.0, i.e. a single partner. Top 5 by present
importance: HVN New Haven (sole link PHL, importance 83.9), ANR Antwerp (LCY, 75.8), BRQ Brno (STN, 75.6),
PSM Portsmouth NH (SFB, 73.4), SCK Stockton (LAS, 70.2). These are relatively high-scoring airports whose
network position depends entirely on one route; losing it isolates them.

Brokerage shift (betweenness with path length 1/(score_u x score_v), identical sampling at every horizon):
LAX dominates today (0.259) ahead of PEK 0.101, JFK 0.091, LHR 0.090, CDG 0.086. Under the +5 forecast levels
the brokerage spreads out: AMS 0.093, LAX 0.088, ANC 0.071, IST 0.068, LHR 0.066, SYD 0.065. The damped +10
picture is essentially the present one (LAX 0.258, PEK 0.107, LHR 0.091) because alpha = 0.04 barely moves
levels. Topology is held constant; only node scores change.

## 3. Country and region momentum

Traffic-weighted (importance-weighted) mean forecast change, +5 horizon, countries with >= 10 airports:
Nepal +5.35 (9 of 10 airports emerging), Uzbekistan +4.91, **India +4.79 (60 of 72 airports emerging, 0
declining)**, Nigeria +4.42, Morocco +4.28, DR Congo +4.25, Pakistan +4.21, Kenya +3.99. By region: Africa
+3.66 (179 emerging / 0 declining of 311), Asia +2.44, Oceania +1.10, South America +0.84, Europe +0.11,
North America -0.38 (39 declining of 1,705: the only region with net decline).

`momentum_rank_h10` (countries with >= 3 airports, damped +10 change): 1 Sudan +0.50, 2 Nepal +0.41,
3 Ghana +0.39, 4 Zimbabwe +0.39, 5 Madagascar +0.37, then Mozambique, Namibia, Nigeria. Bottom: UAE -0.20
(the only Gulf market forecast to give back share as it saturates at the top of the index), Georgia -0.20,
French Polynesia -0.15. Because of the 0.04 damping the +10 magnitudes are small by construction; the +5
ordering is the one to read for magnitude.

Biggest individual +5 risers: OGL Ogle/Georgetown GY +14.9 pts, JUB Juba SS +13.8 (to 80.6), GEO Georgetown
GY +13.0, SEZ Seychelles +9.7, PRI Praslin +9.4. Biggest fallers: GLS Galveston -8.7, SBD San Bernardino -8.6,
BJC Denver-Rocky Mountain -7.1, BIH Bishop -6.5, LAL Lakeland -5.5 (all US secondary fields). The largest
+10 rank climbs are JUB (1310 -> 1284), EGN Geneina (3267 -> 3242) and KEP Nepalgunj (2409 -> 2384).

## 4. Scenario sensitivities (standardised Ridge surrogate)

Fitted on the production training slices (n = 19,923 rows for h5, 12,196 for h10; comparable, non-COVID,
high-confidence). Values are d(importance change, points) per unit, holding the other 45 features fixed:

| driver | +5 | +10 | unit |
|---|---|---|---|
| of_top50_hub_links | +0.184 | +0.103 | per direct link to a top-50 hub |
| of_routes_total | +0.015 | +0.016 | per route |
| imf_gdp_growth_pct | +0.719 | +0.575 | per pp of projected GDP growth |
| gdp_growth_1y | -0.797 | -0.356 | per pp of last-year GDP growth |
| gdp_growth_sustained (1y+3y+5y+IMF) | -0.021 | +0.021 | per pp applied to all four |
| tourism_growth_1y | +0.032 | +0.048 | per pp |
| pop_growth_1y | -0.314 | -3.081 | per pp |
| traffic_growth_1y | -0.003 | -0.003 | per pp |
| dist_to_nearest_larger_hub_km | +0.069 | +0.188 | per +100 km |
| un_median_age | -0.215 | -0.085 | per year |

Reading: network position (hub links, route count, isolation from larger competitors) carries a clean
positive signal; young populations help. The macro growth terms are collinear across horizons and the
surrogate splits them with opposite signs (forward-looking IMF growth positive, last-year realised growth
negative), so individual growth coefficients should be read through the `*_sustained` composites, which are
close to zero. The non-linear production model is more responsive: a +2 pp GDP-growth shock applied to every
airport of a country raises the predicted 5-year change by +0.11 pts in India, Indonesia and Nigeria,
+0.14 in Brazil and +0.26 in Germany (`country_shock_examples`). In short, the forecasts are driven far more
by network structure and momentum than by macro growth, which is consistent with the ablation in the README
(removing macro features lowers MAE).

## 5. Method notes

- Ranks (`ranks`, `rank_*`) are 1 = highest level; ties broken by IATA code. `rank_h10` uses `level_damped`.
- Dependency HHI = Herfindahl of a node's edge shares, share_j = importance_present(partner j) / sum.
  Redundancy score = 100 x [0.5 x min(alt, 6)/6 + 0.5 x percentile of 2-hop reach], alt = neighbours that
  stay attached to the largest surviving component when the node is removed. Classes: fragile if HHI >= 75th
  percentile and degree <= 3, robust if redundancy >= 60th percentile, else watch (thresholds in `method`).
- Reach loss includes the >= 2-hop lengthening term exactly for the top 40 airports by degree; for all
  others only the (exact) disconnection term is used.
- Runtime: `05` about 1 s; `04` about 2-3 min on 2 cores (betweenness x3 and 40 node-removal all-pairs BFS
  runs dominate). Both are idempotent: re-running reproduces byte-identical JSON.
