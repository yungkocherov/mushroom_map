/**
 * WeatherTab — вкладка «Погода» в /stats.
 * 20 графиков по 5 секциям. Данные из fetchWeatherExplore (один fetch,
 * без селекторов: все карточки рендерятся сразу). Базовая линия —
 * среднее 2018–2025 (8 лет < 30-летней WMO-нормы, поэтому НЕ «норма»);
 * 2026 частичный и через fullYears() не попадает в бары/аномалии.
 */
import { useEffect, useReducer } from "react";
import {
  fetchWeatherExplore,
  type WeatherExploreResponse,
} from "@mushroom-map/api-client";
import { BarChart } from "../../components/stats/charts/BarChart";
import { LineChart } from "../../components/stats/charts/LineChart";
import { MultiLineChart } from "../../components/stats/charts/MultiLineChart";
import { RangeBars } from "../../components/stats/charts/RangeBars";
import { Heatmap } from "../../components/stats/charts/Heatmap";
import { DivergingBarChart } from "../../components/stats/charts/DivergingBarChart";
import {
  monthLabel,
  climSeries,
  fullYears,
  ymMatrix,
  gddSeries,
  precipHistBars,
  districtRankWeather,
  districtMonthMatrix,
  frostWindowItems,
  shortDistrict,
} from "../../components/stats/weather/transforms";
import css from "../../components/stats/weather/WeatherCharts.module.css";

// ─── color palette (token-based, no hex) ──────────────────────────────
// Categorical-distinct palette for the GDD MultiLineChart (one line per
// year). The sequential idx-0..idx-4 ramp makes adjacent series
// near-identical (idx-0 vs idx-1 are both dark green); a many-series
// overlay needs maximally separated *adjacent* hues. Tokens interleaved
// by hue/lightness so every consecutive pair contrasts. Tokens only —
// the Claude Design pass re-skins them.
const SERIES_PALETTE: string[] = [
  "var(--idx-4)", // terracotta
  "var(--forest)", // very-dark olive
  "var(--idx-2)", // light green
  "var(--chanterelle)", // terracotta (far from idx-4 position)
  "var(--idx-0)", // dark green
  "var(--moss)", // dark olive
  "var(--idx-3)", // pale yellow-green
  "var(--idx-1)", // medium green
];

// ─── rounding helpers ─────────────────────────────────────────────────
// Raw transform floats carry full f64 precision; Recharts tooltips/
// labels would render e.g. 0.3142219 м³/м³. Round at the compose site,
// precision per magnitude — same discipline as ForestTab. Do NOT round
// values handed to a chart that formats them itself.

const r1 = (x: number) => Math.round(x * 10) / 10; // 1 dp: °C, precip mm, anom
const r2 = (x: number) => Math.round(x * 100) / 100; // 2 dp: soil moist м³/м³
const r0 = (x: number) => Math.round(x); // 0 dp: GDD, days, DOY

// ─── helpers ──────────────────────────────────────────────────────────

type RangeItem = { label: string; start: number; end: number; mark: number };

/**
 * Computes axis bounds + 4 evenly-spaced rounded ticks across [min, max]
 * for the frost-free-window RangeBars card. Identical discipline to the
 * ForestTab helper (degenerate-span guard included).
 */
function rangeAxis(items: RangeItem[]): {
  min: number;
  max: number;
  ticks: { at: number; label: string }[];
} {
  if (items.length === 0) return { min: 0, max: 1, ticks: [] };
  const min = Math.floor(Math.min(...items.map((i) => i.start)));
  const max = Math.ceil(Math.max(...items.map((i) => i.end)));
  const span = max - min;
  if (span === 0) {
    return { min, max, ticks: [{ at: min, label: String(min) }] };
  }
  const ticks = [0, 1, 2, 3].map((k) => {
    const at = Math.round(min + (span * k) / 3);
    return { at, label: String(at) };
  });
  return { min, max, ticks };
}

// ─── data state ───────────────────────────────────────────────────────

type DataState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "done"; resp: WeatherExploreResponse };

function initState(): DataState {
  return { phase: "loading" };
}

// ─── WeatherTab ───────────────────────────────────────────────────────

export function WeatherTab() {
  const [state, setState] = useReducer(
    (_prev: DataState, next: DataState) => next,
    undefined,
    initState,
  );

  useEffect(() => {
    setState({ phase: "loading" });
    fetchWeatherExplore()
      .then((resp) => setState({ phase: "done", resp }))
      .catch((err) => setState({ phase: "error", message: String(err) }));
  }, []);

  if (state.phase === "loading") {
    return <p className={css.empty}>Загрузка…</p>;
  }
  if (state.phase === "error") {
    return <p className={css.empty}>Ошибка: {state.message}</p>;
  }
  if (state.resp.clim.length === 0) {
    return <p className={css.empty}>Нет данных.</p>;
  }

  return <WeatherTabInner resp={state.resp} />;
}

// ─── Inner (data available) ───────────────────────────────────────────

function WeatherTabInner({ resp }: { resp: WeatherExploreResponse }) {
  const districtName: Record<string, string> = Object.fromEntries(
    resp.district.map((d) => [
      String(d.district_id),
      shortDistrict(d.district_name),
    ]),
  );

  // Month labels as strings for the heatmap column axis.
  const monthCols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(monthLabel);

  // ─── Section 1 — Климатический цикл (climatology 2018-2025) ─────

  const clim = climSeries(resp.clim);

  // 1. Годовой ход температуры — t_mean + band[t_min, t_max]
  const c1 = clim.map((d) => ({
    label: d.label,
    t_mean: r1(d.t_mean),
    t_min: r1(d.t_min),
    t_max: r1(d.t_max),
  }));

  // 2. Годовой ход осадков
  const c2 = clim.map((d) => ({ label: d.label, precip: r1(d.precip) }));

  // 3. Влажность почвы по месяцам
  const c3 = clim.map((d) => ({
    label: d.label,
    soil_moist: r2(d.soil_moist),
  }));

  // 4. Баланс осадков и испарения (P − ET0)
  const c4 = clim.map((d) => ({
    label: d.label,
    p_minus_et0: r1(d.p_minus_et0),
  }));

  // ─── Section 2 — Межгодовая изменчивость ────────────────────────

  const years = fullYears(resp.year);

  // 5. Аномалия среднегодовой T° (vs среднее 2018–2025)
  const c5 = years
    .filter((y) => y.t_anom !== null)
    .map((y) => ({ year: String(y.year), t_anom: r1(y.t_anom as number) }));

  // 6. Аномалия годовых осадков (vs среднее 2018–2025)
  const c6 = years
    .filter((y) => y.precip_anom !== null)
    .map((y) => ({
      year: String(y.year),
      precip_anom: r1(y.precip_anom as number),
    }));

  // 7. Год × месяц: температура
  const m7 = ymMatrix(resp.ym, "t_mean");
  const m7Values = m7.values.map((row) => row.map(r1));

  // 8. Год × месяц: осадки
  const m8 = ymMatrix(resp.ym, "precip_total");
  const m8Values = m8.values.map((row) => row.map(r1));

  // ─── Section 3 — Сезон и тренды (descriptive bars, no regression) ─

  // 9. Длина тёплого сезона (T_сут ≥ 10 °C)
  const c9 = years
    .filter((y) => y.warm_days !== null)
    .map((y) => ({ year: String(y.year), warm_days: r0(y.warm_days as number) }));

  // 10. Влажность почвы тёплого сезона (июн–сен)
  const c10 = years
    .filter((y) => y.warm_soil_moist !== null)
    .map((y) => ({
      year: String(y.year),
      warm_soil_moist: r2(y.warm_soil_moist as number),
    }));

  // 11. Дождливых дней за тёплый сезон
  const c11 = years
    .filter((y) => y.rainy_days_warm !== null)
    .map((y) => ({
      year: String(y.year),
      rainy_days_warm: r0(y.rainy_days_warm as number),
    }));

  // 12. Снежный покров, дней/год
  const c12 = years
    .filter((y) => y.snow_days !== null)
    .map((y) => ({ year: String(y.year), snow_days: r0(y.snow_days as number) }));

  // 13. Накопленные GDD (база 5 °C) — one line per year over months
  const gdd = gddSeries(resp.gdd);
  const c13Data = gdd.data.map((p) => {
    const out: Record<string, number | string> = {
      month: p.month,
      label: p.label as string,
    };
    for (const yk of gdd.years) out[yk] = r0(p[yk] as number);
    return out;
  });
  const c13Series = gdd.years.map((yk, i) => ({
    key: yk,
    label: yk,
    color: SERIES_PALETTE[i % SERIES_PALETTE.length],
  }));

  // 14. Безморозное окно
  const c14Items = frostWindowItems(resp.year).map((it) => ({
    label: it.label,
    start: r0(it.start),
    end: r0(it.end),
    mark: r0(it.mark),
  }));
  const c14Axis = rangeAxis(c14Items);

  // ─── Section 4 — Распределение ──────────────────────────────────

  // 15. Распределение суточных летних осадков
  const c15 = precipHistBars(resp.precip_hist).map((b) => ({
    label: b.label,
    days: r0(b.days),
  }));

  // ─── Section 5 — География (per-district climatology) ───────────

  // 16. Осадки тёплого сезона по районам
  const c16 = districtRankWeather(resp.district, "warm_precip").map((d) => ({
    name: d.name,
    value: r1(d.value),
  }));

  // 17. Влажность почвы тёплого сезона по районам
  const c17 = districtRankWeather(resp.district, "warm_soil_moist").map((d) => ({
    name: d.name,
    value: r2(d.value),
  }));

  // 18. «Грибные дни» района
  const c18 = districtRankWeather(resp.district, "mushroom_days").map((d) => ({
    name: d.name,
    value: r0(d.value),
  }));

  // 19. Район × месяц: влажность почвы (18×12)
  const m19 = districtMonthMatrix(resp.district_month, "soil_moist", districtName);
  const m19Values = m19.values.map((row) => row.map(r2));

  // 20. Район × месяц: температура почвы (18×12)
  const m20 = districtMonthMatrix(resp.district_month, "soil_temp", districtName);
  const m20Values = m20.values.map((row) => row.map(r1));

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
        Погода Ленинградской области по районам, 2018–2025 (среднее по 18
        районам). Базовая линия — среднее 2018–2025, не климат-норма
        (8 лет короче 30-летней нормы ВМО). Структурный контекст грибного
        сезона — не наблюдённый сбор.
      </p>

      {/* ═══ Климатический цикл ════════════════════════════════════ */}
      <section className={css.section}>
        <h2 className={css.h}>Климатический цикл</h2>
        <div className={css.grid}>

          {/* 1 */}
          <div className={css.card}>
            <h3 className={css.ct}>Годовой ход температуры</h3>
            <p className={css.ci}>
              Средняя суточная T° по месяцам (°C), среднее 2018–2025; полоса
              — диапазон суточных мин/макс.
            </p>
            {c1.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <MultiLineChart
                data={c1}
                xKey="label"
                series={[
                  { key: "t_mean", label: "средняя", color: "var(--forest)" },
                ]}
                band={{
                  lowerKey: "t_min",
                  upperKey: "t_max",
                  color: "var(--idx-2)",
                }}
              />
            )}
          </div>

          {/* 2 */}
          <div className={css.card}>
            <h3 className={css.ct}>Годовой ход осадков</h3>
            <p className={css.ci}>
              Сумма осадков по месяцам (мм), среднее 2018–2025.
            </p>
            {c2.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <BarChart data={c2} categoryKey="label" valueKey="precip" />
            )}
          </div>

          {/* 3 */}
          <div className={css.card}>
            <h3 className={css.ct}>Влажность почвы по месяцам</h3>
            <p className={css.ci}>
              Объёмная влажность почвы 1–3 см (м³/м³) по месяцам, среднее
              2018–2025.
            </p>
            {c3.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <LineChart data={c3} xKey="label" yKey="soil_moist" />
            )}
          </div>

          {/* 4 */}
          <div className={css.card}>
            <h3 className={css.ct}>Баланс осадков и испарения (P − ET0)</h3>
            <p className={css.ci}>
              Осадки минус эталонная эвапотранспирация по месяцам (мм),
              среднее 2018–2025; ниже нуля — расход влаги.
            </p>
            {c4.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <LineChart data={c4} xKey="label" yKey="p_minus_et0" />
            )}
          </div>

        </div>
      </section>

      {/* ═══ Межгодовая изменчивость ═══════════════════════════════ */}
      <section className={css.section}>
        <h2 className={css.h}>Межгодовая изменчивость</h2>
        <div className={css.grid}>

          {/* 5 */}
          <div className={css.card}>
            <h3 className={css.ct}>Аномалия среднегодовой T°</h3>
            <p className={css.ci}>
              Отклонение среднегодовой T° от среднего 2018–2025 (°C), полные
              годы.
            </p>
            {c5.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <DivergingBarChart
                data={c5}
                categoryKey="year"
                valueKey="t_anom"
                colorPos="var(--idx-4)"
                colorNeg="var(--idx-1)"
              />
            )}
          </div>

          {/* 6 */}
          <div className={css.card}>
            <h3 className={css.ct}>Аномалия годовых осадков</h3>
            <p className={css.ci}>
              Отклонение суммы годовых осадков от среднего 2018–2025 (мм),
              полные годы.
            </p>
            {c6.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <DivergingBarChart
                data={c6}
                categoryKey="year"
                valueKey="precip_anom"
                colorPos="var(--idx-1)"
                colorNeg="var(--chanterelle)"
              />
            )}
          </div>

          {/* 7 */}
          <div className={css.card}>
            <h3 className={css.ct}>Год × месяц: температура</h3>
            <p className={css.ci}>
              Средняя суточная T° (°C) по году и месяцу, полные годы.
            </p>
            {m7.rows.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <Heatmap rows={m7.rows} cols={monthCols} values={m7Values} />
            )}
          </div>

          {/* 8 */}
          <div className={css.card}>
            <h3 className={css.ct}>Год × месяц: осадки</h3>
            <p className={css.ci}>
              Сумма осадков (мм) по году и месяцу, полные годы.
            </p>
            {m8.rows.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <Heatmap rows={m8.rows} cols={monthCols} values={m8Values} />
            )}
          </div>

        </div>
      </section>

      {/* ═══ Сезон и тренды ════════════════════════════════════════ */}
      <section className={css.section}>
        <h2 className={css.h}>Сезон и тренды</h2>
        <div className={css.grid}>

          {/* 9 */}
          <div className={css.card}>
            <h3 className={css.ct}>Длина тёплого сезона</h3>
            <p className={css.ci}>
              Число дней в году со средней суточной T° ≥ 10 °C, полные годы.
            </p>
            {c9.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <BarChart data={c9} categoryKey="year" valueKey="warm_days" />
            )}
          </div>

          {/* 10 */}
          <div className={css.card}>
            <h3 className={css.ct}>Влажность почвы тёплого сезона</h3>
            <p className={css.ci}>
              Средняя объёмная влажность почвы за июн–сен (м³/м³), полные
              годы.
            </p>
            {c10.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <BarChart
                data={c10}
                categoryKey="year"
                valueKey="warm_soil_moist"
              />
            )}
          </div>

          {/* 11 */}
          <div className={css.card}>
            <h3 className={css.ct}>Дождливых дней за тёплый сезон</h3>
            <p className={css.ci}>
              Число дней июн–сен с осадками ≥ 1 мм, полные годы.
            </p>
            {c11.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <BarChart
                data={c11}
                categoryKey="year"
                valueKey="rainy_days_warm"
              />
            )}
          </div>

          {/* 12 */}
          <div className={css.card}>
            <h3 className={css.ct}>Снежный покров, дней/год</h3>
            <p className={css.ci}>
              Число дней в году с ненулевой высотой снежного покрова, полные
              годы.
            </p>
            {c12.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <BarChart data={c12} categoryKey="year" valueKey="snow_days" />
            )}
          </div>

          {/* 13 */}
          <div className={css.card}>
            <h3 className={css.ct}>Накопленные GDD (база 5 °C)</h3>
            <p className={css.ci}>
              Кумулятивная сумма эффективных температур (база 5 °C) по
              месяцам, отдельная линия на каждый полный год.
            </p>
            {c13Data.length === 0 || c13Series.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <MultiLineChart
                data={c13Data}
                xKey="label"
                series={c13Series}
              />
            )}
          </div>

          {/* 14 */}
          <div className={css.card}>
            <h3 className={css.ct}>Безморозное окно</h3>
            <p className={css.ci}>
              От последнего весеннего до первого осеннего заморозка (день
              года), полные годы; чёрта — последний весенний заморозок.
            </p>
            {c14Items.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <RangeBars
                items={c14Items}
                min={c14Axis.min}
                max={c14Axis.max}
                ticks={c14Axis.ticks}
              />
            )}
          </div>

        </div>
      </section>

      {/* ═══ Распределение ═════════════════════════════════════════ */}
      <section className={css.section}>
        <h2 className={css.h}>Распределение</h2>
        <div className={css.grid}>

          {/* 15 */}
          <div className={css.card}>
            <h3 className={css.ct}>Распределение суточных летних осадков</h3>
            <p className={css.ci}>
              Число дней июн–сен по классам суточных осадков (мм/сут),
              среднее 2018–2025; верхний класс «30+» — все дни ≥ 30 мм.
            </p>
            {c15.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <BarChart data={c15} categoryKey="label" valueKey="days" />
            )}
          </div>

        </div>
      </section>

      {/* ═══ География ═════════════════════════════════════════════ */}
      <section className={css.section}>
        <h2 className={css.h}>География</h2>
        <div className={css.grid}>

          {/* 16 */}
          <div className={css.card}>
            <h3 className={css.ct}>Осадки тёплого сезона по районам</h3>
            <p className={css.ci}>
              Средняя сумма осадков за июн–сен по районам (мм), среднее
              2018–2025.
            </p>
            {c16.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <BarChart
                data={c16}
                categoryKey="name"
                valueKey="value"
                height={520}
              />
            )}
          </div>

          {/* 17 */}
          <div className={css.card}>
            <h3 className={css.ct}>Влажность почвы тёплого сезона по районам</h3>
            <p className={css.ci}>
              Средняя объёмная влажность почвы за июн–сен по районам
              (м³/м³), среднее 2018–2025.
            </p>
            {c17.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <BarChart
                data={c17}
                categoryKey="name"
                valueKey="value"
                height={520}
              />
            )}
          </div>

          {/* 18 */}
          <div className={css.card}>
            <h3 className={css.ct}>«Грибные дни» района</h3>
            <p className={css.ci}>
              Структурный прокси (влажность+темп. почвы авг–сен), не
              наблюдённый сбор: среднее за год число дней авг–сен с
              влажностью почвы &gt; 0.30 м³/м³ и T° почвы 8–18 °C.
            </p>
            {c18.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <BarChart
                data={c18}
                categoryKey="name"
                valueKey="value"
                height={520}
              />
            )}
          </div>

          {/* 19 */}
          <div className={css.card}>
            <h3 className={css.ct}>Район × месяц: влажность почвы</h3>
            <p className={css.ci}>
              Объёмная влажность почвы 1–3 см (м³/м³) по району и месяцу,
              среднее 2018–2025.
            </p>
            {m19.rows.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <Heatmap
                rows={m19.rows}
                cols={monthCols}
                values={m19Values}
                height={560}
              />
            )}
          </div>

          {/* 20 */}
          <div className={css.card}>
            <h3 className={css.ct}>Район × месяц: температура почвы</h3>
            <p className={css.ci}>
              Температура почвы 6 см (°C) по району и месяцу, среднее
              2018–2025.
            </p>
            {m20.rows.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <Heatmap
                rows={m20.rows}
                cols={monthCols}
                values={m20Values}
                height={560}
              />
            )}
          </div>

        </div>
      </section>
    </div>
  );
}
