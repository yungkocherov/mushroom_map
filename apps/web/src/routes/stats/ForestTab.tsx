/**
 * ForestTab — вкладка «Лес» в /stats.
 * 17 графиков по 4 секциям. Данные из fetchForestExplore (один fetch,
 * без селекторов: все карточки рендерятся сразу).
 */
import { useEffect, useReducer } from "react";
import {
  fetchForestExplore,
  type ForestExploreResponse,
} from "@mushroom-map/api-client";
import { BarChart } from "../../components/stats/charts/BarChart";
import { RangeBars } from "../../components/stats/charts/RangeBars";
import { Heatmap } from "../../components/stats/charts/Heatmap";
import { StackedBarChart } from "../../components/stats/charts/StackedBarChart";
import {
  SPECIES_MAIN,
  SPECIES_LABELS_RU,
  AGE_ORDER,
  speciesAreaRanking,
  meanStandSize,
  quantToRangeItems,
  bonitetRanking,
  histBars,
  crossMatrix,
  ageStructure,
  crossStacked100,
  matureSharePerSpecies,
  districtRanking,
} from "../../components/stats/forest/transforms";
import css from "../../components/stats/forest/ForestCharts.module.css";

// ─── color palette (token-based, no hex) ──────────────────────────────

// Categorical-distinct palette for STACKED series (species/age). The
// sequential idx-0..idx-4 ramp makes adjacent categories near-identical
// (idx-0 vs idx-1 are both dark green); a stacked composition needs
// maximally separated *adjacent* hues. Tokens interleaved by hue/
// lightness so every consecutive pair contrasts (orange↔dark-green↔
// pale↔olive↔light-green↔very-dark). Tokens only — Claude Design pass
// re-skins them. Token hues (from packages/tokens): idx-4/chanterelle
// terracotta, idx-0/idx-1 dark green, idx-2 light green, idx-3 pale
// yellow-green, forest very-dark olive, moss dark olive.
const STACK_PALETTE: string[] = [
  "var(--idx-4)",     // terracotta
  "var(--idx-0)",     // dark green
  "var(--idx-3)",     // pale yellow-green
  "var(--moss)",      // dark olive
  "var(--idx-2)",     // light green
  "var(--forest)",    // very-dark olive
  "var(--chanterelle)", // terracotta (far from idx-4 position)
  "var(--idx-1)",     // medium green
];

// ─── rounding helpers ─────────────────────────────────────────────────
// Raw transform floats (km², %, ha, m³/ha) carry full f64 precision;
// Recharts tooltips/labels would render e.g. 14947.221200891 km². Round
// at the compose site, precision per magnitude — same discipline as the
// sibling SeasonalityTab (Math.round(x*N)/N).

const r1 = (x: number) => Math.round(x * 10) / 10; // 1 dp: km², %, big ha
const r2 = (x: number) => Math.round(x * 100) / 100; // 2 dp: stand size ha
const r0 = (x: number) => Math.round(x); // 0 dp: stock m³/ha

// ─── helpers ──────────────────────────────────────────────────────────

/**
 * Shortens a district name so it fits a single chart-axis line. Strips
 * trailing « район»; special-cases the two non-«район» units. Plain
 * presentation helper (not a transform — stays out of transforms.ts).
 */
function shortDistrict(name: string): string {
  if (name === "Гатчинский муниципальный округ") return "Гатчинский";
  if (name === "Сосновоборский городской округ") return "Сосновоборск";
  return name.replace(/ район$/, "");
}

type RangeItem = { label: string; start: number; end: number; mark: number };

/**
 * Computes axis bounds + 4 evenly-spaced rounded ticks across [min, max]
 * for a RangeBars card. min = floor of smallest start, max = ceil of
 * largest end. Empty input -> a benign [0, 1] domain (card guards on
 * items.length anyway).
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
  // Degenerate slice (single row / all-equal values) -> span 0 would make
  // all 4 evenly-spaced ticks share the same `at`, and RangeBars keys ticks
  // by `at` (duplicate-key warning + 4 overdrawn lines). Emit one tick.
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
  | { phase: "done"; resp: ForestExploreResponse };

function initState(): DataState {
  return { phase: "loading" };
}

// ─── ForestTab ────────────────────────────────────────────────────────

export function ForestTab() {
  const [state, setState] = useReducer(
    (_prev: DataState, next: DataState) => next,
    undefined,
    initState,
  );

  useEffect(() => {
    setState({ phase: "loading" });
    fetchForestExplore()
      .then((resp) => setState({ phase: "done", resp }))
      .catch((err) => setState({ phase: "error", message: String(err) }));
  }, []);

  if (state.phase === "loading") {
    return <p className={css.empty}>Загрузка…</p>;
  }
  if (state.phase === "error") {
    return <p className={css.empty}>Ошибка: {state.message}</p>;
  }
  if (state.resp.dim.length === 0) {
    return <p className={css.empty}>Нет данных.</p>;
  }

  return <ForestTabInner resp={state.resp} />;
}

// ─── Inner (data available) ───────────────────────────────────────────

function ForestTabInner({ resp }: { resp: ForestExploreResponse }) {
  const districtName: Record<string, string> = Object.fromEntries(
    resp.district.map((d) => [String(d.district_id), shortDistrict(d.district_name)]),
  );

  const speciesMain = [...SPECIES_MAIN] as string[];
  const ageOrder = [...AGE_ORDER] as string[];

  // ─── Section 1 — Состав леса ────────────────────────────────────

  // 1. Породный состав ЛО
  const c1 = speciesAreaRanking(resp.dim).map((d) => ({
    ...d,
    area_km2: r1(d.area_km2),
  }));

  // 2. Средний размер выдела
  const c2 = meanStandSize(resp.dim).map((d) => ({ ...d, ha: r2(d.ha) }));

  // 3. Размер выдела по породам — main species only
  const c3Items = quantToRangeItems(
    resp.quant.filter(
      (q) => q.group_kind !== "species" || speciesMain.includes(q.group_key),
    ),
    "species",
    "area_ha",
    (k) => SPECIES_LABELS_RU[k] ?? k,
  ).map((it) => ({
    ...it,
    start: r2(it.start),
    end: r2(it.end),
    mark: r2(it.mark),
  }));
  const c3Axis = rangeAxis(c3Items);

  // ─── Section 2 — Качество и продуктивность ──────────────────────

  // 4. Распределение по бонитету
  const c4 = bonitetRanking(resp.dim).map((d) => ({
    ...d,
    area_km2: r1(d.area_km2),
  }));

  // 5. Запас древесины (м³/га)
  const c5 = histBars(resp.hist, "stock").map((b) => ({
    ...b,
    area_km2: r1(b.area_km2),
  }));

  // 6. Бонитет × порода
  const m6 = crossMatrix(
    resp.cross,
    "species",
    "bonitet",
    speciesMain,
    ["1", "2", "3", "4", "5"],
  );
  const m6Rows = m6.rows.map((k) => SPECIES_LABELS_RU[k] ?? k);
  const m6Values = m6.values.map((row) => row.map(r1));

  // 7. Запас по породам — main species only
  const c7Items = quantToRangeItems(
    resp.quant.filter(
      (q) => q.group_kind !== "species" || speciesMain.includes(q.group_key),
    ),
    "species",
    "stock",
    (k) => SPECIES_LABELS_RU[k] ?? k,
  ).map((it) => ({
    ...it,
    start: r0(it.start),
    end: r0(it.end),
    mark: r0(it.mark),
  }));
  const c7Axis = rangeAxis(c7Items);

  // 8. Бонитет → запас (rows pre-sorted by bonitet key ascending so the
  // order survives quantToRangeItems, which preserves input row order)
  const c8Quant = resp.quant
    .filter((q) => q.group_kind === "bonitet" && q.metric === "stock")
    .slice()
    .sort((a, b) => Number(a.group_key) - Number(b.group_key));
  const c8Items = quantToRangeItems(
    c8Quant,
    "bonitet",
    "stock",
    (k) => `Бонитет ${k}`,
  ).map((it) => ({
    ...it,
    start: r0(it.start),
    end: r0(it.end),
    mark: r0(it.mark),
  }));
  const c8Axis = rangeAxis(c8Items);

  // 9. Возрастная структура ЛО
  const c9 = ageStructure(resp.dim).map((d) => ({
    ...d,
    area_km2: r1(d.area_km2),
  }));

  // ─── Section 3 — Возрастная структура ───────────────────────────

  // 10. Возраст × порода (100% stacked)
  const s10 = crossStacked100(
    resp.cross.filter(
      (r) => r.dim_a !== "species" || speciesMain.includes(r.key_a),
    ),
    "species",
    "age",
    ageOrder,
    (k) => SPECIES_LABELS_RU[k] ?? k,
    (a) => a,
  );
  const s10Data = s10.rows.map((r) => ({ name: r.name, ...r.shares }));
  const s10Series = s10.series.map((k, i) => ({
    key: k,
    label: k,
    color: STACK_PALETTE[i % STACK_PALETTE.length],
  }));

  // 11. Доля спелых и перестойных — main species only
  const c11 = matureSharePerSpecies(resp.cross)
    .filter((x) => speciesMain.includes(x.key))
    .map((x) => ({ ...x, pct: r1(x.pct) }));

  // 12. Возраст × бонитет
  const m12 = crossMatrix(
    resp.cross,
    "age",
    "bonitet",
    ageOrder,
    ["1", "2", "3", "4", "5"],
  );
  const m12Values = m12.values.map((row) => row.map(r1));

  // ─── Section 4 — География ──────────────────────────────────────

  // 13. Породный состав по районам (100% stacked)
  const s13 = crossStacked100(
    resp.cross,
    "district",
    "species",
    speciesMain,
    (k) => districtName[k] ?? k,
    (k) => SPECIES_LABELS_RU[k] ?? k,
  );
  const s13Data = s13.rows.map((r) => ({ name: r.name, ...r.shares }));
  const s13Series = s13.series.map((k, i) => ({
    key: k,
    label: SPECIES_LABELS_RU[k] ?? k,
    color: STACK_PALETTE[i % STACK_PALETTE.length],
  }));

  // 14. Лесистость районов
  const c14 = districtRanking(resp.district, "forest_pct").map((d) => ({
    ...d,
    name: shortDistrict(d.name),
    value: r1(d.value),
  }));

  // 15. Запас по районам
  const c15 = districtRanking(resp.district, "mean_stock").map((d) => ({
    ...d,
    name: shortDistrict(d.name),
    value: r1(d.value),
  }));

  // 16. «Грибной» профиль района
  const c16 = districtRanking(resp.district, "mature_host_pct").map((d) => ({
    ...d,
    name: shortDistrict(d.name),
    value: r1(d.value),
  }));

  // 17. Возрастная структура по районам (100% stacked)
  const s17 = crossStacked100(
    resp.cross,
    "district",
    "age",
    ageOrder,
    (k) => districtName[k] ?? k,
    (a) => a,
  );
  const s17Data = s17.rows.map((r) => ({ name: r.name, ...r.shares }));
  const s17Series = s17.series.map((k, i) => ({
    key: k,
    label: k,
    color: STACK_PALETTE[i % STACK_PALETTE.length],
  }));

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
        Структура леса Ленинградской области по данным ФГИСЛК: породный
        состав, продуктивность, возраст и география. Структурный прокси
        грибного потенциала — не наблюдённый сбор.
      </p>

      {/* ═══ Состав леса ═══════════════════════════════════════════ */}
      <section className={css.section}>
        <h2 className={css.h}>Состав леса</h2>
        <div className={css.grid}>

          {/* 1 */}
          <div className={css.card}>
            <h3 className={css.ct}>Породный состав ЛО</h3>
            <p className={css.ci}>
              Доля площади по господствующей породе (ФГИСЛК).
            </p>
            <BarChart data={c1} categoryKey="label" valueKey="area_km2" />
          </div>

          {/* 2 */}
          <div className={css.card}>
            <h3 className={css.ct}>Средний размер выдела</h3>
            <p className={css.ci}>
              Средняя площадь выдела по господствующей породе (га).
            </p>
            <BarChart data={c2} categoryKey="label" valueKey="ha" />
          </div>

          {/* 3 */}
          <div className={css.card}>
            <h3 className={css.ct}>Размер выдела по породам</h3>
            <p className={css.ci}>
              Межквартильный размах площади выдела (га); чёрта — медиана.
            </p>
            {c3Items.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <RangeBars
                items={c3Items}
                min={c3Axis.min}
                max={c3Axis.max}
                ticks={c3Axis.ticks}
              />
            )}
          </div>

        </div>
      </section>

      {/* ═══ Качество и продуктивность ═════════════════════════════ */}
      <section className={css.section}>
        <h2 className={css.h}>Качество и продуктивность</h2>
        <div className={css.grid}>

          {/* 4 */}
          <div className={css.card}>
            <h3 className={css.ct}>Распределение по бонитету</h3>
            <p className={css.ci}>
              Класс бонитета: 1 — самый продуктивный лес, 5 —
              низкобонитетный.
            </p>
            <BarChart data={c4} categoryKey="label" valueKey="area_km2" />
          </div>

          {/* 5 */}
          <div className={css.card}>
            <h3 className={css.ct}>Запас древесины (м³/га)</h3>
            <p className={css.ci}>
              Гистограмма площади по классам запаса; медиана корпуса ≈ 195
              м³/га.
            </p>
            <BarChart data={c5} categoryKey="bin" valueKey="area_km2" />
          </div>

          {/* 6 */}
          <div className={css.card}>
            <h3 className={css.ct}>Бонитет × порода</h3>
            <p className={css.ci}>
              Площадь (км²) по породе и классу бонитета — где сосредоточен
              продуктивный лес.
            </p>
            <Heatmap rows={m6Rows} cols={m6.cols} values={m6Values} />
          </div>

          {/* 7 */}
          <div className={css.card}>
            <h3 className={css.ct}>Запас по породам</h3>
            <p className={css.ci}>
              Межквартильный запас (м³/га) по породам; чёрта — медиана.
            </p>
            {c7Items.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <RangeBars
                items={c7Items}
                min={c7Axis.min}
                max={c7Axis.max}
                ticks={c7Axis.ticks}
              />
            )}
          </div>

          {/* 8 */}
          <div className={css.card}>
            <h3 className={css.ct}>Бонитет → запас</h3>
            <p className={css.ci}>
              Запас растёт с улучшением бонитета — валидация классификации
              ФГИСЛК.
            </p>
            {c8Items.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <RangeBars
                items={c8Items}
                min={c8Axis.min}
                max={c8Axis.max}
                ticks={c8Axis.ticks}
              />
            )}
          </div>

          {/* 9 */}
          <div className={css.card}>
            <h3 className={css.ct}>Возрастная структура ЛО</h3>
            <p className={css.ci}>Площадь по группам возраста.</p>
            <BarChart data={c9} categoryKey="label" valueKey="area_km2" />
          </div>

        </div>
      </section>

      {/* ═══ Возрастная структура ═════════════════════════════════ */}
      <section className={css.section}>
        <h2 className={css.h}>Возрастная структура</h2>
        <div className={css.grid}>

          {/* 10 */}
          <div className={css.card}>
            <h3 className={css.ct}>Возраст × порода</h3>
            <p className={css.ci}>
              Доля групп возраста внутри породы (100%).
            </p>
            {s10Data.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <StackedBarChart
                data={s10Data}
                categoryKey="name"
                series={s10Series}
              />
            )}
          </div>

          {/* 11 */}
          <div className={css.card}>
            <h3 className={css.ct}>Доля спелых и перестойных</h3>
            <p className={css.ci}>
              Старовозрастная доля по породам — больше микоризы, выше
              грибной потенциал.
            </p>
            <BarChart data={c11} categoryKey="label" valueKey="pct" />
          </div>

          {/* 12 */}
          <div className={css.card}>
            <h3 className={css.ct}>Возраст × бонитет</h3>
            <p className={css.ci}>
              Площадь (км²) по группе возраста и классу бонитета.
            </p>
            <Heatmap rows={m12.rows} cols={m12.cols} values={m12Values} />
          </div>

        </div>
      </section>

      {/* ═══ География ════════════════════════════════════════════ */}
      <section className={css.section}>
        <h2 className={css.h}>География</h2>
        <div className={css.grid}>

          {/* 13 */}
          <div className={css.card}>
            <h3 className={css.ct}>Породный состав по районам</h3>
            <p className={css.ci}>
              Доля площади пород внутри района (100%).
            </p>
            {s13Data.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <StackedBarChart
                data={s13Data}
                categoryKey="name"
                series={s13Series}
                height={520}
              />
            )}
          </div>

          {/* 14 */}
          <div className={css.card}>
            <h3 className={css.ct}>Лесистость районов</h3>
            <p className={css.ci}>
              Доля площади района под лесом (ФГИСЛК), %.
            </p>
            <BarChart data={c14} categoryKey="name" valueKey="value" height={520} />
          </div>

          {/* 15 */}
          <div className={css.card}>
            <h3 className={css.ct}>Запас по районам</h3>
            <p className={css.ci}>
              Средневзвешенный запас древесины (м³/га) по районам.
            </p>
            <BarChart data={c15} categoryKey="name" valueKey="value" height={520} />
          </div>

          {/* 16 */}
          <div className={css.card}>
            <h3 className={css.ct}>«Грибной» профиль района</h3>
            <p className={css.ci}>
              Доля спелых/перестойных сосны+ели+берёзы — структурный
              прокси потенциала, не наблюдённый сбор.
            </p>
            <BarChart data={c16} categoryKey="name" valueKey="value" height={520} />
          </div>

          {/* 17 */}
          <div className={css.card}>
            <h3 className={css.ct}>Возрастная структура по районам</h3>
            <p className={css.ci}>
              Доля групп возраста внутри района (100%).
            </p>
            {s17Data.length === 0 ? (
              <p className={css.empty}>Нет данных.</p>
            ) : (
              <StackedBarChart
                data={s17Data}
                categoryKey="name"
                series={s17Series}
                height={520}
              />
            )}
          </div>

        </div>
      </section>
    </div>
  );
}
