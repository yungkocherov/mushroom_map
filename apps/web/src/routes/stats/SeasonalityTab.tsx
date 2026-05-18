/**
 * SeasonalityTab — вкладка «Сезонность» в /stats.
 * 20+ графиков по 4 секциям. Данные из fetchSeasonCurves + fetchSeasonSpecies.
 */
import { useEffect, useReducer, useState } from "react";
import {
  fetchSeasonCurves,
  fetchSeasonSpecies,
  type SeasonCurvesResponse,
  type SeasonSpeciesResponse,
} from "@mushroom-map/api-client";
import { LineChart } from "../../components/stats/charts/LineChart";
import { BarChart } from "../../components/stats/charts/BarChart";
import { AreaChart } from "../../components/stats/charts/AreaChart";
import { Heatmap } from "../../components/stats/charts/Heatmap";
import { RangeBars } from "../../components/stats/charts/RangeBars";
import { RidgeLines } from "../../components/stats/charts/RidgeLines";
import { MultiLineChart } from "../../components/stats/charts/MultiLineChart";
import { DivergingBarChart } from "../../components/stats/charts/DivergingBarChart";
import {
  MONTHS_RU,
  MONTH_START_WEEKS,
  SEASON_GROUP_KEYS,
  GROUP_LABELS_RU,
  yearCurves,
  weekYearMatrix,
  cumulativeShare,
  compositionByWeek,
  peakBoxData,
  seasonBands,
  ridgeDensity,
  yearRanking,
  currentVsNorm,
  weeklyAnomaly,
  overlapMatrix,
  monthSpeciesShare,
  latestCompleteYear,
  weekMonthLabel,
} from "../../components/stats/season/transforms";
import { speciesColor } from "../../components/stats/season/speciesColors";
import { SelectControl } from "../../components/stats/season/SelectControl";
import css from "../../components/stats/season/SeasonCharts.module.css";

// ─── color helpers ────────────────────────────────────────────────────

/**
 * Fixed palette for year-series: each year gets a DISTINCT color so
 * multi-year line charts and their legends are readable.
 */
const YEAR_PALETTE = [
  "var(--forest)",
  "var(--chanterelle)",
  "var(--moss)",
  "var(--idx-0)",
  "var(--idx-2)",
  "var(--idx-4)",
  "var(--bark)",
  "var(--ink-faint)",
  "var(--danger)",
  "var(--caution)",
];

function yearColor(yearIndex: number, _totalYears: number): string {
  return YEAR_PALETTE[yearIndex % YEAR_PALETTE.length] ?? "var(--forest)";
}

// ─── data state ───────────────────────────────────────────────────────

type DataState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "done"; curves: SeasonCurvesResponse; species: SeasonSpeciesResponse };

function initState(): DataState {
  return { phase: "loading" };
}

// ─── SeasonalityTab ────────────────────────────────────────────────────

export function SeasonalityTab() {
  const [state, setState] = useReducer(
    (_prev: DataState, next: DataState) => next,
    undefined,
    initState,
  );

  useEffect(() => {
    setState({ phase: "loading" });
    Promise.allSettled([fetchSeasonCurves("all"), fetchSeasonSpecies()]).then(
      ([curvesResult, speciesResult]) => {
        if (
          curvesResult.status === "rejected" ||
          speciesResult.status === "rejected"
        ) {
          const msg =
            curvesResult.status === "rejected"
              ? String(curvesResult.reason)
              : String((speciesResult as PromiseRejectedResult).reason);
          setState({ phase: "error", message: msg });
          return;
        }
        setState({
          phase: "done",
          curves: curvesResult.value,
          species: speciesResult.value,
        });
      },
    );
  }, []);

  if (state.phase === "loading") {
    return (
      <p style={{ color: "var(--ink-dim)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)" }}>
        Загружаем данные сезонности…
      </p>
    );
  }
  if (state.phase === "error") {
    return (
      <p style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)" }}>
        Не удалось загрузить данные: {state.message}
      </p>
    );
  }

  return <SeasonalityTabInner curves={state.curves} species={state.species} />;
}

// ─── Inner (data available) ─────────────────────────────────────────────

function SeasonalityTabInner({
  curves,
  species,
}: {
  curves: SeasonCurvesResponse;
  species: SeasonSpeciesResponse;
}) {
  const qualifyingItems = species.items.filter((i) => i.qualifies);
  const defaultSpecies =
    qualifyingItems.length > 0 ? qualifyingItems[0].species_key : "porcini";

  // Derive available years from curves.weeks
  const allYears = [...new Set(curves.weeks.map((w) => w.year))].sort(
    (a, b) => b - a,
  );
  const yearOptions = allYears.slice(0, 10);

  // Build max-week per year to identify partial years for pill labels
  const maxWeekByYear = new Map<number, number>();
  for (const w of curves.weeks) {
    const prev = maxWeekByYear.get(w.year) ?? 0;
    if (w.week > prev) maxWeekByYear.set(w.year, w.week);
  }

  const completeSeason = latestCompleteYear(curves);

  const [spProfile, setSpProfile] = useState(defaultSpecies);   // card 2
  const [spHeat, setSpHeat] = useState<string>(defaultSpecies);  // card 3 (+ "all")
  const [spCum, setSpCum] = useState(defaultSpecies);            // card 5
  const [yrCum, setYrCum] = useState(completeSeason);
  const [spVsN, setSpVsN] = useState(defaultSpecies);            // card 15
  const [yrVsN, setYrVsN] = useState(completeSeason);
  const [spAnom, setSpAnom] = useState(defaultSpecies);          // card 16
  const [yrAnom, setYrAnom] = useState(completeSeason);

  const speciesPillOpts = qualifyingItems.map((i) => ({
    value: i.species_key,
    label: i.label,
  }));
  const speciesPillOptsWithAll = [
    { value: "all" as string, label: "Все" },
    ...speciesPillOpts,
  ];
  const yearPillOpts = yearOptions.map((y) => {
    const maxWk = maxWeekByYear.get(y) ?? 0;
    const isPartial = maxWk < 40;
    return {
      value: String(y),
      label: isPartial ? `${y} (неполн.)` : String(y),
    };
  });

  const isQualProfile = qualifyingItems.some((i) => i.species_key === spProfile);
  const isQualCum = qualifyingItems.some((i) => i.species_key === spCum);
  const isQualVsN = qualifyingItems.some((i) => i.species_key === spVsN);
  const isQualAnom = qualifyingItems.some((i) => i.species_key === spAnom);
  const notQualifyingNote = (
    <p className={css.note}>Мало данных по этому виду для анализа.</p>
  );

  // ─── Precomputed transforms ─────────────────────────────────────

  // 1. yearCurves all
  const allCurves = yearCurves(curves, "all");
  const allCurvesWeekSet = [
    ...new Set(allCurves.flatMap((c) => c.points.map((p) => p.week))),
  ].sort((a, b) => a - b);
  const allCurvesData = allCurvesWeekSet.map((week) => {
    const row: Record<string, number | string | null> = { week };
    for (const c of allCurves) {
      const pt = c.points.find((p) => p.week === week);
      row[String(c.year)] = pt ? pt.finds : null;
    }
    return row;
  });
  const allCurvesSeries = allCurves.map((c, idx) => ({
    key: String(c.year),
    label: String(c.year),
    color: yearColor(idx, allCurves.length),
    dashed: false,
  }));

  // 2. yearCurves per species
  const speciesCurves = isQualProfile ? yearCurves(curves, spProfile) : [];
  const speciesCurvesWeekSet = [
    ...new Set(speciesCurves.flatMap((c) => c.points.map((p) => p.week))),
  ].sort((a, b) => a - b);
  const speciesCurvesData = speciesCurvesWeekSet.map((week) => {
    const row: Record<string, number | string | null> = { week };
    for (const c of speciesCurves) {
      const pt = c.points.find((p) => p.week === week);
      row[String(c.year)] = pt ? pt.finds : null;
    }
    return row;
  });
  const speciesCurvesSeries = speciesCurves.map((c, idx) => ({
    key: String(c.year),
    label: String(c.year),
    color: yearColor(idx, speciesCurves.length),
  }));

  // 3. weekYearMatrix
  const matrixSpecies = spHeat === "all" ? "all" : spHeat;
  const matrix = weekYearMatrix(curves, matrixSpecies);
  const matrixRowLabels = matrix.years.map(String);
  const matrixColLabels = matrix.weeks.map(String);

  // 4. seasonBands
  const bands = seasonBands(curves, species);
  const bandMin = bands.length > 0 ? Math.min(...bands.map((b) => b.start)) : 1;
  const bandMax = bands.length > 0 ? Math.max(...bands.map((b) => b.end)) : 52;
  // month ticks at approximate week of month start
  const monthTicks = MONTHS_RU.map((m, i) => ({
    at: Math.round(1 + i * 4.333),
    label: m,
  }));

  // 5. cumulativeShare — build over full week range 1..52, gaps -> 0
  const cumRaw = isQualCum ? cumulativeShare(curves, spCum, yrCum) : [];
  const cumByWeek = new Map(cumRaw.map((p) => [p.week, p.share]));
  const cumData: { week: number; share: number }[] = isQualCum
    ? Array.from({ length: 52 }, (_, i) => {
        const w = i + 1;
        return { week: w, share: Math.round((cumByWeek.get(w) ?? (w > 1 ? (cumByWeek.get(w - 1) ?? 0) : 0)) * 100) / 100 };
      })
    : [];
  // Carry forward last cumulative value for gap weeks so S-curve is smooth
  {
    let lastShare = 0;
    for (const pt of cumData) {
      if (cumByWeek.has(pt.week)) {
        lastShare = cumByWeek.get(pt.week)!;
      }
      pt.share = Math.round(lastShare * 100) / 100;
    }
  }

  // 6. compositionByWeek (stacked area 100%)
  const compositionData = compositionByWeek(curves);
  // Fixed seasonal stack order (spring → autumn, "other" last) so the
  // stack, legend and tooltip all read in the same consistent order.
  const COMPOSITION_ORDER = [
    "spring_mushroom", "pine_bolete", "chanterelle", "porcini",
    "aspen_bolete", "fly_agaric", "honey_fungus", "other",
  ];
  const groupKeys = COMPOSITION_ORDER.filter((k) =>
    [...SEASON_GROUP_KEYS, "other"].includes(k),
  );
  const compositionChartData = compositionData.map((row) => {
    const out: Record<string, number | string | null> = { week: row.week };
    for (const k of groupKeys) {
      out[k] = Math.round((row.shares[k] ?? 0) * 100) / 100;
    }
    return out;
  });
  const compositionSeries = groupKeys.map((k) => ({
    key: k,
    label: GROUP_LABELS_RU[k] ?? k,
    color: speciesColor(k),
  }));

  // 7. peakBoxData
  const peakData = peakBoxData(species);
  const peakQualifying = peakData.filter((d) => d.qualifies && d.peak !== null);
  const peakRangeItems = peakQualifying.map((d) => ({
    label: d.label,
    start: d.peak! - (d.iqr ?? 0),
    end: d.peak! + (d.iqr ?? 0),
    mark: d.peak!,
  }));
  const peakRangeMin = peakRangeItems.length
    ? Math.floor(Math.min(...peakRangeItems.map((i) => i.start)) - 1)
    : 1;
  const peakRangeMax = peakRangeItems.length
    ? Math.ceil(Math.max(...peakRangeItems.map((i) => i.end)) + 1)
    : 52;

  // 8. season length
  const seasonLenData = qualifyingItems
    .filter((i) => i.season_len_median !== null)
    .map((i) => ({ label: i.label, len: i.season_len_median! }))
    .sort((a, b) => b.len - a.len);

  // 9. peak trend slope
  const trendData = qualifyingItems
    .filter((i) => i.peak_trend_slope !== null)
    .map((i) => ({ label: i.label, slope: i.peak_trend_slope! }));

  // 10. overlapMatrix
  const overlapMx = overlapMatrix(curves, species);
  const overlapLabels = overlapMx.species.map((s) => s.label);

  // 11. monthSpeciesShare
  const monthShare = monthSpeciesShare(curves);
  // heatmap: rows = groups, cols = months, values[groupIdx][monthIdx]
  const monthShareValues = monthShare.species.map((_, gi) =>
    monthShare.months.map((_, mi) => monthShare.values[mi][gi]),
  );
  const monthShareRowLabels = monthShare.species.map((k) =>
    GROUP_LABELS_RU[k] ?? k,
  );

  // 12. ridgeDensity
  const ridge = ridgeDensity(curves, species);

  // 13. yearRanking
  const ranking = yearRanking(curves);
  const rankingData = ranking.map((r) => ({
    year: String(r.year),
    weightedMeanWeek: Math.round(r.weightedMeanWeek * 10) / 10,
  }));
  const wmwMax = rankingData.length
    ? Math.ceil(Math.max(...rankingData.map((r) => r.weightedMeanWeek))) + 1
    : 40;

  // 14. season volume normalised by corpus size (finds per post)
  const maxFpp = Math.max(...ranking.map((r) => r.findsPerPost), 1e-9);
  const volumeData = ranking.map((r) => ({
    year: String(r.year),
    fpp: Math.round((r.findsPerPost / maxFpp) * 100) / 100,
  }));

  // 15. currentVsNorm — build over full week range 1..52 for uniform axis
  const vsNormRaw = isQualVsN
    ? currentVsNorm(curves, spVsN, yrVsN)
    : [];
  const vsNormByWeek = new Map(vsNormRaw.map((p) => [p.week, p]));
  const vsNormData = vsNormRaw.length > 0
    ? Array.from({ length: 52 }, (_, i) => {
        const w = i + 1;
        const p = vsNormByWeek.get(w);
        return {
          week: w,
          value: p ? Math.round(p.value * 10) / 10 : null,
          mean: p ? Math.round(p.mean * 10) / 10 : null,
          p25: p ? Math.round(p.p25 * 10) / 10 : null,
          p75: p ? Math.round(p.p75 * 10) / 10 : null,
        };
      })
    : [];

  const vsNormYMax = Math.max(
    1,
    ...vsNormData.flatMap((d) => [d.p75 ?? 0, d.mean ?? 0, d.value ?? 0]),
  );

  // 16. weeklyAnomaly
  const anomalyRaw = isQualAnom
    ? weeklyAnomaly(curves, spAnom, yrAnom)
    : [];
  const anomalyData = anomalyRaw.map((p) => ({
    week: String(p.week),
    delta: Math.round(p.delta * 10) / 10,
  }));

  const isEmpty = curves.weeks.length === 0;

  return (
    <div>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-xs)",
          color: "var(--ink-dim)",
          marginBottom: "var(--space-4)",
        }}
      >
        Анализ сезонной динамики: когда, как долго и в каком порядке
        появляются виды. Данные — корпус фото-классифицированных постов
        сообщества{" "}
        <a href="https://vk.com/grib_spb" target="_blank" rel="noopener noreferrer"
           style={{ color: "var(--chanterelle)" }}>
          «Грибы и Грибники СПб»
        </a>.
      </p>

      {isEmpty ? (
        <p className={css.empty}>Нет данных по сезонности.</p>
      ) : (
        <div className={css.layout}>
          <nav className={css.toc} aria-label="Разделы">
            <a className={css.tocLink} href="#s-shape">Форма сезона</a>
            <a className={css.tocLink} href="#s-peak">Пик и стабильность</a>
            <a className={css.tocLink} href="#s-compare">Сравнение</a>
            <a className={css.tocLink} href="#s-year">Год к году</a>
          </nav>
          <div>
          {/* ═══ Форма сезона ══════════════════════════════════════════ */}
          <section id="s-shape" className={css.section}>
            <h2 className={css.h}>Форма сезона</h2>
            <div className={css.grid}>

              {/* 1. Годовой профиль — все виды */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Годовой профиль (все виды)</h3>
                <p className={css.ci}>
                  Сравните горбы разных лет: в какой год корзина была полнее всего.
                </p>
                {allCurves.length === 0 ? (
                  <p className={css.empty}>Нет данных.</p>
                ) : (
                  <MultiLineChart
                    data={allCurvesData}
                    xKey="week"
                    series={allCurvesSeries}
                    height={280}
                    connectNulls
                    xType="number"
                    xDomain={[1, 52]}
                    xTicks={MONTH_START_WEEKS}
                    xTickFormatter={(w) => weekMonthLabel(Number(w))}
                    tooltipDecimals={2}
                  />
                )}
              </div>

              {/* 2. Профиль вида */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Профиль вида по годам</h3>
                <p className={css.ci}>
                  У каждого вида своя форма года: взрывной пик или растянутый сезон.
                </p>
                {speciesPillOpts.length > 0 && (
                  <SelectControl
                    options={speciesPillOpts}
                    value={spProfile}
                    onChange={setSpProfile}
                    label="Вид"
                  />
                )}
                {!isQualProfile ? (
                  notQualifyingNote
                ) : speciesCurvesData.length === 0 ? (
                  <p className={css.empty}>Нет данных.</p>
                ) : (
                  <MultiLineChart
                    data={speciesCurvesData}
                    xKey="week"
                    series={speciesCurvesSeries}
                    height={260}
                    connectNulls
                    xType="number"
                    xDomain={[1, 52]}
                    xTicks={MONTH_START_WEEKS}
                    xTickFormatter={(w) => weekMonthLabel(Number(w))}
                    tooltipDecimals={2}
                  />
                )}
              </div>

              {/* 3. Тепловая карта неделя×год */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Тепловая карта неделя × год</h3>
                <p className={css.ci}>
                  Тёплые полосы — удачные недели; горизонтальная структура показывает сдвиги и аномальные годы.
                </p>
                <SelectControl
                  options={speciesPillOptsWithAll}
                  value={spHeat === "all" ? "all" : spHeat}
                  onChange={setSpHeat}
                  label="Вид"
                />
                {matrix.years.length === 0 ? (
                  <p className={css.empty}>Нет данных.</p>
                ) : (
                  <Heatmap
                    rows={matrixRowLabels}
                    cols={matrixColLabels}
                    values={matrix.values}
                    height={Math.max(200, matrix.years.length * 28 + 40)}
                    valueDecimals={0}
                  />
                )}
              </div>

              {/* 4. Полосы сезона */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Полосы сезона по видам</h3>
                <p className={css.ci}>
                  Кто когда и как долго; вертикальная метка — медианный пик. Только квалифицирующие виды.
                </p>
                {bands.length === 0 ? (
                  <p className={css.empty}>Недостаточно данных.</p>
                ) : (
                  <RangeBars
                    items={bands.map((b) => ({ ...b, mark: b.mark ?? undefined }))}
                    min={bandMin}
                    max={bandMax}
                    ticks={monthTicks}
                    height={bands.length * 44 + 64}
                  />
                )}
              </div>

              {/* 5. Накопленная доля */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Накопленная доля сезона</h3>
                <p className={css.ci}>
                  Крутая кривая — взрывной сезон, пологая — растянутый.
                </p>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
                  {speciesPillOpts.length > 0 && (
                    <SelectControl
                      options={speciesPillOpts}
                      value={spCum}
                      onChange={setSpCum}
                      label="Вид"
                    />
                  )}
                  {yearPillOpts.length > 0 && (
                    <SelectControl
                      options={yearPillOpts}
                      value={String(yrCum)}
                      onChange={(v) => setYrCum(Number(v))}
                      label="Год"
                    />
                  )}
                </div>
                {!isQualCum ? (
                  notQualifyingNote
                ) : cumData.length === 0 ? (
                  <p className={css.empty}>Нет данных за выбранный год.</p>
                ) : (
                  <LineChart
                    data={cumData}
                    xKey="week"
                    yKey="share"
                    height={240}
                    xType="number"
                    xDomain={[1, 52]}
                    xTicks={MONTH_START_WEEKS}
                    xTickFormatter={(w) => weekMonthLabel(Number(w))}
                  />
                )}
              </div>

              {/* 6. Состав корзины по неделям (стек 100%) */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Состав корзины по неделям</h3>
                <p className={css.ci}>
                  Весной строчки, летом белые, осенью опята — смена состава по сезону.
                </p>
                {compositionChartData.length === 0 ? (
                  <p className={css.empty}>Нет данных.</p>
                ) : (
                  <AreaChart
                    data={compositionChartData}
                    xKey="week"
                    series={compositionSeries}
                    height={300}
                    yDomain={[0, 1]}
                    yTickFormat="percent"
                    tooltipPercent
                    xTickFormatter={(w) => weekMonthLabel(Number(w))}
                  />
                )}
              </div>

            </div>
          </section>

          {/* ═══ Пик и стабильность ══════════════════════════════════ */}
          <section id="s-peak" className={css.section}>
            <h2 className={css.h}>Пик и стабильность</h2>
            <div className={css.grid}>

              {/* 7. Медиана пика ± разброс */}
              <div className={css.card}>
                <h3 className={css.ct}>Медиана пика (неделя) по видам</h3>
                <p className={css.ci}>
                  Медиана недели пика (метка) и межквартильный разброс (полоса
                  ±IQR) — чем уже полоса, тем стабильнее вид от года к году.
                </p>
                {peakRangeItems.length === 0 ? (
                  <p className={css.empty}>Недостаточно данных.</p>
                ) : (
                  <RangeBars
                    items={peakRangeItems}
                    min={peakRangeMin}
                    max={peakRangeMax}
                    ticks={MONTH_START_WEEKS.map((w, i) => ({
                      at: w,
                      label: ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"][i],
                    }))}
                    height={peakRangeItems.length * 44 + 64}
                  />
                )}
              </div>

              {/* 8. Длина сезона */}
              <div className={css.card}>
                <h3 className={css.ct}>Длина сезона (медиана, недель)</h3>
                <p className={css.ci}>
                  Короткий взрыв или весь сезон понемногу — разные стратегии сбора.
                </p>
                {seasonLenData.length === 0 ? (
                  <p className={css.empty}>Недостаточно данных.</p>
                ) : (
                  <BarChart
                    data={seasonLenData}
                    categoryKey="label"
                    valueKey="len"
                    height={seasonLenData.length * 36 + 40}
                  />
                )}
              </div>

              {/* 9. Фенологический тренд */}
              <div className={css.card}>
                <h3 className={css.ct}>Сдвиг пика во времени (недель за год)</h3>
                <p className={css.ci}>
                  Линейный тренд медианной недели пика по годам. Отрицательное
                  значение — пик из года в год смещается раньше (на N недель в
                  год); положительное — позже. Это разведочная оценка по
                  короткому ряду (&le;8 лет), не прогноз.
                </p>
                {trendData.length === 0 ? (
                  <p className={css.empty}>Недостаточно данных для тренда.</p>
                ) : (
                  <DivergingBarChart
                    data={trendData}
                    categoryKey="label"
                    valueKey="slope"
                    colorPos="var(--idx-1)"
                    colorNeg="var(--chanterelle)"
                    height={trendData.length * 36 + 40}
                    categoryWidth={150}
                  />
                )}
                <p className={css.note}>
                  Exploratory — короткий временной ряд (&le;8 лет). Интерпретировать осторожно.
                </p>
              </div>

            </div>
          </section>

          {/* ═══ Сравнение ═══════════════════════════════════════════ */}
          <section id="s-compare" className={css.section}>
            <h2 className={css.h}>Сравнение</h2>
            <div className={css.grid}>

              {/* 10. Перекрытие сезонов */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Перекрытие сезонов (матрица)</h3>
                <p className={css.ci}>
                  Что реально собрать в одну поездку — чем теплее клетка, тем выше совпадение сезонов.
                </p>
                {overlapLabels.length === 0 ? (
                  <p className={css.empty}>Недостаточно данных.</p>
                ) : (
                  <Heatmap
                    rows={overlapLabels}
                    cols={overlapLabels}
                    values={overlapMx.values}
                    height={Math.max(240, overlapLabels.length * 32 + 40)}
                    vmax={1}
                    valueDecimals={2}
                  />
                )}
              </div>

              {/* 11. Что собирают в каждом месяце */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Состав по месяцам</h3>
                <p className={css.ci}>
                  Характерные виды месяца — доля каждой группы в общем объёме находок.
                </p>
                {monthShare.months.length === 0 ? (
                  <p className={css.empty}>Нет данных.</p>
                ) : (
                  <Heatmap
                    rows={monthShareRowLabels}
                    cols={monthShare.months}
                    values={monthShareValues}
                    height={Math.max(240, monthShareRowLabels.length * 28 + 40)}
                    valueDecimals={2}
                  />
                )}
              </div>

              {/* 12. Лента года (ridgeline) */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Лента года (ridge)</h3>
                <p className={css.ci}>
                  Календарь природы (ridgeline): каждая полоса — сезонная
                  плотность одного вида, нормированная к своему пику. Читать
                  сверху вниз: кто кого сменяет за сезон. Высота — не
                  абсолютная численность, а форма сезона.
                </p>
                {ridge.series.length === 0 ? (
                  <p className={css.empty}>Недостаточно данных.</p>
                ) : (
                  <RidgeLines
                    series={ridge.series}
                    xLabels={ridge.xLabels}
                    colors={ridge.series.map((s) => speciesColor(s.key))}
                    height={ridge.series.length * 58 + 44}
                  />
                )}
              </div>

            </div>
          </section>

          {/* ═══ Год к году ══════════════════════════════════════════ */}
          <section id="s-year" className={css.section}>
            <h2 className={css.h}>Год к году</h2>
            <div className={css.grid}>

              {/* 13. Ранний / поздний год */}
              <div className={css.card}>
                <h3 className={css.ct}>Ранний / поздний грибной год</h3>
                <p className={css.ci}>
                  Средневзвешенная неделя всех находок года (сезон, недели
                  &ge;20). Меньше — год в целом «пошёл» раньше. Это агрегат по
                  всем видам сразу; для конкретного гриба смотрите его «Профиль
                  вида» и «Полосы сезона».
                </p>
                {rankingData.length === 0 ? (
                  <p className={css.empty}>Нет данных.</p>
                ) : (
                  <BarChart
                    data={rankingData}
                    categoryKey="year"
                    valueKey="weightedMeanWeek"
                    xDomain={[20, wmwMax]}
                    height={rankingData.length * 36 + 40}
                  />
                )}
              </div>

              {/* 14. Объём сезона по годам */}
              <div className={css.card}>
                <h3 className={css.ct}>Объём сезона по годам (норм.)</h3>
                <p className={css.ci}>
                  Находок на один пост (нормировано к лучшему году). Делёж на
                  объём постов убирает рост самого сообщества — остаётся
                  «насколько богат был сезон», а не «сколько народу в ВК».
                </p>
                {volumeData.length === 0 ? (
                  <p className={css.empty}>Нет данных.</p>
                ) : (
                  <BarChart
                    data={volumeData}
                    categoryKey="year"
                    valueKey="fpp"
                    height={volumeData.length * 36 + 40}
                  />
                )}
                <p className={css.note}>
                  Прокси по ВК-корпусу, не полевой учёт; короткий ряд —
                  интерпретировать осторожно.
                </p>
              </div>

              {/* 15. Этот год vs норма */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Год vs норма (вид)</h3>
                <p className={css.ci}>
                  Где сезон относительно типичного — полоса = межквартильный диапазон нормы.
                </p>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
                  {speciesPillOpts.length > 0 && (
                    <SelectControl
                      options={speciesPillOpts}
                      value={spVsN}
                      onChange={setSpVsN}
                      label="Вид"
                    />
                  )}
                  {yearPillOpts.length > 0 && (
                    <SelectControl
                      options={yearPillOpts}
                      value={String(yrVsN)}
                      onChange={(v) => setYrVsN(Number(v))}
                      label="Год"
                    />
                  )}
                </div>
                {!isQualVsN ? (
                  notQualifyingNote
                ) : vsNormData.length === 0 ? (
                  <p className={css.empty}>Нет данных за выбранный год.</p>
                ) : (
                  <MultiLineChart
                    data={vsNormData}
                    xKey="week"
                    series={[
                      { key: "value", label: String(yrVsN), color: "var(--forest)" },
                      { key: "mean", label: "норма", color: "var(--chanterelle)", dashed: true },
                    ]}
                    band={{ lowerKey: "p25", upperKey: "p75", color: "var(--chanterelle)" }}
                    height={260}
                    xType="number"
                    xDomain={[1, 52]}
                    yDomain={[0, Math.ceil(vsNormYMax * 1.1)]}
                    xTicks={MONTH_START_WEEKS}
                    connectNulls
                    xTickFormatter={(w) => weekMonthLabel(Number(w))}
                    tooltipLabelFormatter={(w) => `неделя ${w}`}
                    tooltipDecimals={2}
                  />
                )}
                {(maxWeekByYear.get(yrVsN) ?? 0) < 40 && (
                  <p className={css.note}>{yrVsN} — неполный год.</p>
                )}
              </div>

              {/* 16. Аномалия недели vs норма */}
              <div className={`${css.card} ${css.cardWide}`}>
                <h3 className={css.ct}>Аномалия по неделям (вид, год)</h3>
                <p className={css.ci}>
                  Недели сильно лучше или хуже обычного — отклонение от средней нормы.
                </p>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
                  {speciesPillOpts.length > 0 && (
                    <SelectControl
                      options={speciesPillOpts}
                      value={spAnom}
                      onChange={setSpAnom}
                      label="Вид"
                    />
                  )}
                  {yearPillOpts.length > 0 && (
                    <SelectControl
                      options={yearPillOpts}
                      value={String(yrAnom)}
                      onChange={(v) => setYrAnom(Number(v))}
                      label="Год"
                    />
                  )}
                </div>
                {!isQualAnom ? (
                  notQualifyingNote
                ) : anomalyData.length === 0 ? (
                  <p className={css.empty}>Нет данных за выбранный год.</p>
                ) : (
                  <>
                    <DivergingBarChart
                      data={anomalyData}
                      categoryKey="week"
                      valueKey="delta"
                      colorPos="var(--idx-1)"
                      colorNeg="var(--chanterelle)"
                      categoryOnX
                      height={320}
                    />
                    <p className={css.note}>
                      Зелёные недели — выше нормы, терракотовые — ниже.
                    </p>
                  </>
                )}
              </div>

            </div>
          </section>
          </div>
        </div>
      )}
    </div>
  );
}
