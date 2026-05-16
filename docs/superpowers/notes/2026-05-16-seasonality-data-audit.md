# Сезонность — data-feasibility audit (2026-05-16)

Read-only audit via `scripts/_season_audit.py` against dev DB
(`vk_post`, `photo_species`, `COALESCE(foray_date, date_ts MSK)`).
This note fixes the **gating parameters** referenced by the build plan
`docs/superpowers/plans/2026-05-16-stats-tab-seasonality.md` (Tasks 2–4).

## Raw findings

- `total` vk_post = 69448; with non-empty `photo_species` = **38915**
  (the spine uses non-empty arrays only).
- `foray_date` present on **61.6%** of classified posts; rest fall back
  to `date_ts` MSK via COALESCE. Acceptable — "when" is majority real
  foray dates; no methodological widget (user dropped it).
- Date span 2010-03-02 → 2026-08-27.
- Posts per year (classified):
  2010–2017: 8,8,5,7,16,11,11,31 — **negligible noise**.
  2018: 2476 · 2019: 6855 · 2020: 11699 · 2021: 9073 · 2022: 10041
  · 2023: 10339 · 2024: 10616 · 2025: 7473 · 2026: 779 (**partial**,
  data ends Aug 2026).
- Per-species (posts / years / years≥20 / years≥50):
  porcini 25080/15/8/8 · aspen_bolete 20368/14/9/8 ·
  pine_bolete 17363/15/8/8 · chanterelle 7704/14/8/8 ·
  fly_agaric 1889/10/8/8 · spring_mushroom 1484/9/8/8 ·
  honey_fungus 1446/9/8/8 · birch_bolete 952/10/8/8 ·
  blueberry 926/10/8/7 · cranberry 648/9/8/7 · oyster 526/9/7/6 ·
  russula 368/8/7/4 · mokhovik 27/7/0/0 · cloudberry 24/8/0/0 ·
  white_milkcap 14/7/0/0 · woolly_milkcap 9/4/0/0 ·
  saffron_milkcap 6/5/0/0.

## Resolved parameters (substitute in the plan's `<...>` literals)

| Param | Value | Rationale |
|---|---|---|
| `YEAR_MIN` | **2018** | 2010–2017 ≈ 99 posts / 8 yrs — noise; would stripe heatmaps. Spine `stats_season_week` filters `year >= 2018`. |
| `SUMMARY_YEAR_MAX` | **2025** | 2026 ends Aug (partial) → biases season end/length/peak-shift. Per-species summary medians/slope use years **2018..2025** only. Raw curves/heatmap still show 2018..2026 (2026 annotated "неполный год" in UI). |
| per-year "counts" threshold | **`yr_posts >= 20`** | matches the `yrs>=20` audit column; defines `n_years_qual`. |
| `PEAK_MIN_POSTS` | **300** | clean cut: keeps russula(368)/oyster(526) up to porcini(25080); drops mokhovik(27)/cloudberry(24)/milkcaps(≤14). |
| `PEAK_MIN_YEARS` | **6** | qualify needs ≥6 years with ≥20 posts. The 12 kept species have ≥7; the 5 junk have 0 → excluded cleanly. |
| `TREND_MIN_YEARS` | **6** | show peak/length **trend slope** only with ≥6 qualifying years (OLS over ≤8 complete years 2018–2025 → label "exploratory" + CI per skill-validation). |
| `qualifies` | `total_posts >= 300 AND n_years_qual >= 6` | → **12 qualify**: porcini, aspen_bolete, pine_bolete, chanterelle, fly_agaric, spring_mushroom, honey_fungus, birch_bolete, blueberry, cranberry, oyster, russula. **5 excluded** (greyed «мало данных»): mokhovik, cloudberry, white_milkcap, woolly_milkcap, saffron_milkcap. |
| `SEASON_GROUP_KEYS` | `porcini, aspen_bolete, pine_bolete, chanterelle, fly_agaric, spring_mushroom, honey_fungus` + fold rest → `other` | top-7 by posts + «прочие» = ≤8 bands for the 100%-composition (idea 6). |

## Idea feasibility verdict

All 23 skill-vetted ideas are feasible with the gates above. No idea
pruned. Caveats already baked into the plan:
- Per-species deep analytics (ideas 7,8,10,18,23,24) restricted to the
  12 `qualifies=true` species; the 5 junk species shown only in
  all-species aggregates, greyed in per-species charts.
- Cross-year volume (16,25) normalized (share-of-year); absolute volume
  annotated "зависит от роста корпуса, не обилия".
- 2026 marked partial wherever a full season is implied.
