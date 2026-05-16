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
import {
  MONTHS_RU,
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
} from "../../components/stats/season/transforms";
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

const COMPOSITION_COLORS: string[] = [
  "var(--idx-4)",
  "var(--idx-3)",
  "var(--idx-2)",
  "var(--idx-1)",
  "var(--idx-0)",
  "var(--forest)",
  "var(--chanterelle)",
  "var(--moss)",
];

// ─── data state ───────────────────────────────────────────────────────

type DataState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "done"; curves: SeasonCurvesResponse; species: SeasonSpeciesResponse };

function initState(): DataState {
  return { phase: "loading" };
}

// ─── Pill control ──────────────────────────────────────────────────────

function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className={css.controls} aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${css.pill} ${value === o.value ? css.pillOn : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
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

  const [selSpecies, setSelSpecies] = useState<string>(defaultSpecies);
  const [selYear, setSelYear] = useState<number>(completeSeason);

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

  const isQualifying = qualifyingItems.some((i) => i.species_key === selSpecies);
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
  const speciesCurves = isQualifying ? yearCurves(curves, selSpecies) : [];
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
  const matrixSpecies = selSpecies === "all" ? "all" : selSpecies;
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
  const cumRaw = isQualifying ? cumulativeShare(curves, selSpecies, selYear) : [];
  const cumByWeek = new Map(cumRaw.map((p) => [p.week, p.share]));
  const cumData: { week: number; share: number }[] = isQualifying
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
  const groupKeys = [...SEASON_GROUP_KEYS, "other"] as string[];
  const compositionChartData = compositionData.map((row) => {
    const out: Record<string, number | string | null> = { week: row.week };
    for (const k of groupKeys) {
      out[k] = Math.round((row.shares[k] ?? 0) * 100) / 100;
    }
    return out;
  });
  const compositionSeries = groupKeys.map((k, i) => ({
    key: k,
    label: GROUP_LABELS_RU[k] ?? k,
    color: COMPOSITION_COLORS[i % COMPOSITION_COLORS.length],
  }));

  // 7. peakBoxData
  const peakData = peakBoxData(species);
  const peakQualifying = peakData.filter((d) => d.qualifies && d.peak !== null);
  const peakNonQualifying = peakData.filter((d) => !d.qualifies);
  const peakChartData = peakQualifying.map((d) => ({
    label: d.label,
    peak: d.peak!,
    iqr: d.iqr ?? 0,
  }));

  // 8. season length
  const seasonLenData = qualifyingItems
    .filter((i) => i.season_len_median !== null)
    .map((i) => ({ label: i.label, len: i.season_len_median! }));

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

  // 14. year volume normalized
  const maxTotal = Math.max(...ranking.map((r) => r.total), 1);
  const volumeData = ranking.map((r) => ({
    year: String(r.year),
    share: Math.round((r.total / maxTotal) * 100) / 100,
  }));

  // 15. currentVsNorm — build over full week range 1..52 for uniform axis
  const vsNormRaw = isQualifying
    ? currentVsNorm(curves, selSpecies, selYear)
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

  // 16. weeklyAnomaly
  const anomalyRaw = isQualifying
    ? weeklyAnomaly(curves, selSpecies, selYear)
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
        Анализ сезонной динамики: когда, как долго и в каком порядке появляются
        виды. Данные: корпус VK-постов с фото-классификацией.
      </p>

      {isEmpty ? (
        <p className={css.empty}>Нет данных по сезонности.</p>
      ) : (
        <>
          {/* ═══ Форма сезона ══════════════════════════════════════════ */}
          <section className={css.section}>
            <h2 className={css.h}>Форма сезона</h2>
            <div className={css.grid}>

              {/* 1. Годовой профиль — все виды */}
              <div className={css.card}>
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
                  />
                )}
              </div>

              {/* 2. Профиль вида */}
              <div className={css.card}>
                <h3 className={css.ct}>Профиль вида по годам</h3>
                <p className={css.ci}>
                  У каждого вида своя форма года: взрывной пик или растянутый сезон.
                </p>
                {speciesPillOpts.length > 0 && (
                  <Pills
                    options={speciesPillOpts}
                    value={selSpecies}
                    onChange={setSelSpecies}
                    label="Вид"
                  />
                )}
                {!isQualifying ? (
                  notQualifyingNote
                ) : speciesCurvesData.length === 0 ? (
                  <p className={css.empty}>Нет данных.</p>
                ) : (
                  <MultiLineChart
                    data={speciesCurvesData}
                    xKey="week"
                    series={speciesCurvesSeries}
                    height={260}
                  />
                )}
              </div>

              {/* 3. Тепловая карта неделя×год */}
              <div className={css.card}>
                <h3 className={css.ct}>Тепловая карта неделя × год</h3>
                <p className={css.ci}>
                  Тёплые полосы — удачные недели; горизонтальная структура показывает сдвиги и аномальные годы.
                </p>
                <Pills
                  options={speciesPillOptsWithAll}
                  value={selSpecies === "all" ? "all" : selSpecies}
                  onChange={(v) => setSelSpecies(v)}
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
                  />
                )}
              </div>

              {/* 4. Полосы сезона */}
              <div className={css.card}>
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
                    height={bands.length * 28 + 44}
                  />
                )}
              </div>

              {/* 5. Накопленная доля */}
              <div className={css.card}>
                <h3 className={css.ct}>Накопленная доля сезона</h3>
                <p className={css.ci}>
                  Крутая кривая — взрывной сезон, пологая — растянутый.
                </p>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
                  {speciesPillOpts.length > 0 && (
                    <Pills
                      options={speciesPillOpts}
                      value={selSpecies}
                      onChange={setSelSpecies}
                      label="Вид"
                    />
                  )}
                  {yearPillOpts.length > 0 && (
                    <Pills
                      options={yearPillOpts}
                      value={String(selYear)}
                      onChange={(v) => setSelYear(Number(v))}
                      label="Год"
                    />
                  )}
                </div>
                {!isQualifying ? (
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
                    xTicks={[1, 9, 17, 25, 33, 41, 49]}
                  />
                )}
              </div>

              {/* 6. Состав корзины по неделям (стек 100%) */}
              <div className={css.card}>
                <h3 className={css.ct}>Состав корзины по неделям (100%)</h3>
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
                  />
                )}
              </div>

            </div>
          </section>

          {/* ═══ Пик и стабильность ══════════════════════════════════ */}
          <section className={css.section}>
            <h2 className={css.h}>Пик и стабильность</h2>
            <div className={css.grid}>

              {/* 7. Медиана пика ± разброс */}
              <div className={css.card}>
                <h3 className={css.ct}>Медиана пика (неделя) по видам</h3>
                <p className={css.ci}>
                  Насколько стабилен пик от года к году — чем меньше IQR, тем предсказуемее.
                </p>
                {peakQualifying.length === 0 ? (
                  <p className={css.empty}>Недостаточно данных.</p>
                ) : (
                  <>
                    <BarChart
                      data={peakChartData}
                      categoryKey="label"
                      valueKey="peak"
                      height={peakQualifying.length * 36 + 40}
                    />
                    <p className={css.note}>
                      IQR (межквартильный диапазон неделей):{" "}
                      {peakQualifying
                        .map((d) => `${d.label}: ±${d.iqr ?? "—"}`)
                        .join(", ")}
                    </p>
                  </>
                )}
                {peakNonQualifying.length > 0 && (
                  <ul className={css.greyList}>
                    {peakNonQualifying.map((d) => (
                      <li key={d.species_key}>{d.label} — мало данных</li>
                    ))}
                  </ul>
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
                <h3 className={css.ct}>Фенологический тренд (сдвиг пика, нед/год)</h3>
                <p className={css.ci}>
                  Отрицательное значение — пик сдвигается раньше. Exploratory: данных &le;8 лет.
                </p>
                {trendData.length === 0 ? (
                  <p className={css.empty}>Недостаточно данных для тренда.</p>
                ) : (
                  <BarChart
                    data={trendData}
                    categoryKey="label"
                    valueKey="slope"
                    height={trendData.length * 36 + 40}
                  />
                )}
                <p className={css.note}>
                  Exploratory — короткий временной ряд (&le;8 лет). Интерпретировать осторожно.
                </p>
              </div>

            </div>
          </section>

          {/* ═══ Сравнение ═══════════════════════════════════════════ */}
          <section className={css.section}>
            <h2 className={css.h}>Сравнение</h2>
            <div className={css.grid}>

              {/* 10. Перекрытие сезонов */}
              <div className={css.card}>
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
                  />
                )}
              </div>

              {/* 11. Что собирают в каждом месяце */}
              <div className={css.card}>
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
                  />
                )}
              </div>

              {/* 12. Лента года (ridgeline) */}
              <div className={css.card}>
                <h3 className={css.ct}>Лента года (ridge)</h3>
                <p className={css.ci}>
                  Календарь природы: кто кого сменяет — кривые нормированы к своему максимуму.
                </p>
                {ridge.series.length === 0 ? (
                  <p className={css.empty}>Недостаточно данных.</p>
                ) : (
                  <RidgeLines
                    series={ridge.series}
                    xLabels={ridge.xLabels}
                    height={ridge.series.length * 46 + 36}
                  />
                )}
              </div>

            </div>
          </section>

          {/* ═══ Год к году ══════════════════════════════════════════ */}
          <section className={css.section}>
            <h2 className={css.h}>Год к году</h2>
            <div className={css.grid}>

              {/* 13. Ранний / поздний год */}
              <div className={css.card}>
                <h3 className={css.ct}>Ранний / поздний грибной год</h3>
                <p className={css.ci}>
                  Меньше = более ранний год (взвешенная средняя неделя по всем находкам).
                </p>
                {rankingData.length === 0 ? (
                  <p className={css.empty}>Нет данных.</p>
                ) : (
                  <BarChart
                    data={rankingData}
                    categoryKey="year"
                    valueKey="weightedMeanWeek"
                    height={rankingData.length * 36 + 40}
                  />
                )}
              </div>

              {/* 14. Объём сезона по годам */}
              <div className={css.card}>
                <h3 className={css.ct}>Объём сезона по годам (норм.)</h3>
                <p className={css.ci}>
                  Доля от максимального года. Зависит от роста корпуса, а не только от обилия грибов.
                </p>
                {volumeData.length === 0 ? (
                  <p className={css.empty}>Нет данных.</p>
                ) : (
                  <BarChart
                    data={volumeData}
                    categoryKey="year"
                    valueKey="share"
                    height={volumeData.length * 36 + 40}
                  />
                )}
                <p className={css.note}>
                  Объём растёт вместе с корпусом VK-постов — не интерпретировать как реальное обилие.
                </p>
              </div>

              {/* 15. Этот год vs норма */}
              <div className={css.card}>
                <h3 className={css.ct}>Год vs норма (вид)</h3>
                <p className={css.ci}>
                  Где сезон относительно типичного — полоса = межквартильный диапазон нормы.
                </p>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
                  {speciesPillOpts.length > 0 && (
                    <Pills
                      options={speciesPillOpts}
                      value={selSpecies}
                      onChange={setSelSpecies}
                      label="Вид"
                    />
                  )}
                  {yearPillOpts.length > 0 && (
                    <Pills
                      options={yearPillOpts}
                      value={String(selYear)}
                      onChange={(v) => setSelYear(Number(v))}
                      label="Год"
                    />
                  )}
                </div>
                {!isQualifying ? (
                  notQualifyingNote
                ) : vsNormData.length === 0 ? (
                  <p className={css.empty}>Нет данных за выбранный год.</p>
                ) : (
                  <MultiLineChart
                    data={vsNormData}
                    xKey="week"
                    series={[
                      { key: "value", label: String(selYear), color: "var(--forest)" },
                      { key: "mean", label: "норма", color: "var(--chanterelle)", dashed: true },
                    ]}
                    band={{ lowerKey: "p25", upperKey: "p75", color: "var(--chanterelle)" }}
                    height={260}
                    xType="number"
                    xDomain={[1, 52]}
                    xTicks={[1, 9, 17, 25, 33, 41, 49]}
                  />
                )}
                {(maxWeekByYear.get(selYear) ?? 0) < 40 && (
                  <p className={css.note}>{selYear} — неполный год.</p>
                )}
              </div>

              {/* 16. Аномалия недели vs норма */}
              <div className={css.card}>
                <h3 className={css.ct}>Аномалия по неделям (вид, год)</h3>
                <p className={css.ci}>
                  Недели сильно лучше или хуже обычного — отклонение от средней нормы.
                </p>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
                  {speciesPillOpts.length > 0 && (
                    <Pills
                      options={speciesPillOpts}
                      value={selSpecies}
                      onChange={setSelSpecies}
                      label="Вид"
                    />
                  )}
                  {yearPillOpts.length > 0 && (
                    <Pills
                      options={yearPillOpts}
                      value={String(selYear)}
                      onChange={(v) => setSelYear(Number(v))}
                      label="Год"
                    />
                  )}
                </div>
                {!isQualifying ? (
                  notQualifyingNote
                ) : anomalyData.length === 0 ? (
                  <p className={css.empty}>Нет данных за выбранный год.</p>
                ) : (
                  <>
                    <BarChart
                      data={anomalyData}
                      categoryKey="week"
                      valueKey="delta"
                      height={260}
                    />
                    <p className={css.note}>
                      Положительные значения — лучше нормы; отрицательные — хуже.
                      Цвет не меняется по знаку (ограничение BarChart).
                    </p>
                  </>
                )}
              </div>

            </div>
          </section>
        </>
      )}
    </div>
  );
}
