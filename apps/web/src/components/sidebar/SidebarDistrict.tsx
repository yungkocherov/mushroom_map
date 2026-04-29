/**
 * SidebarDistrict — рендерится при `useMapMode().mode === 'district'`.
 *
 * Композиция (по docs/redesign-2026-04.md, секция «Детальный режим»):
 *   ← вся область
 *   ● Лужский                           ← accent dot + H1
 *   Сосновые и смешанные леса юга ЛО.   ← lead description (placeholder)
 *   4.2 / 5                             ← index large
 *   DateScrubber
 *   В районе сейчас                     ← top species for this district
 *   Источники + методология
 *
 * Phase 2.X partial: lead description пока статичная заглушка
 * («Район Ленинградской области») — будущая phase 2.5 либо вытянет её
 * из admin_area.meta, либо хранит в JSON-словаре по osm_rel_id.
 */
import {
  DISTRICT_ACCENTS,
  DISTRICT_NAMES,
  DEFAULT_ACCENT,
} from "@mushroom-map/tokens/district-accents";

import { LayerGrid } from "../mapView/LayerGrid";
import { useForecastDate } from "../../store/useForecastDate";
import { useForecastDistricts } from "../../store/useForecastDistricts";
import { useMapMode } from "../../store/useMapMode";

import { DateScrubber } from "./DateScrubber";
import { LayerInfoPanel } from "./LayerInfoPanel";
import styles from "./SidebarOverview.module.css";

export interface SidebarDistrictProps {
  className?: string;
}

const TOP_N = 3;

export function SidebarDistrict({ className }: SidebarDistrictProps) {
  const districtId = useMapMode((s) => s.districtId);
  const setOverview = useMapMode((s) => s.setOverview);
  const date = useForecastDate((s) => s.selected);
  const { rows, error } = useForecastDistricts(date);

  const row = rows?.find((r) => r.admin_area_id === districtId) ?? null;
  const name =
    row?.district_name ??
    (districtId != null ? DISTRICT_NAMES[districtId] : "") ??
    "";
  const accent =
    districtId != null
      ? DISTRICT_ACCENTS[districtId] ?? DEFAULT_ACCENT
      : DEFAULT_ACCENT;

  const top = row?.top_species?.slice(0, TOP_N) ?? [];

  return (
    <aside className={`${styles.root}${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        onClick={setOverview}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          color: "var(--ink-dim)",
          font: "inherit",
          fontSize: "var(--fs-sm)",
          cursor: "pointer",
          textAlign: "left",
          alignSelf: "flex-start",
        }}
        aria-label="Вернуться к обзору всей области"
      >
        ← вся область
      </button>

      <p className={styles.eyebrow}>
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: accent,
            marginRight: "8px",
            verticalAlign: "middle",
          }}
        />
        Район
      </p>
      <h1 className={styles.title}>{name || "Район"}</h1>
      <p className={styles.lead}>
        {row
          ? `Прогноз индекса плодоношения на ${date} — ${row.index.toFixed(1)} из 5.`
          : "Загрузка прогноза…"}
      </p>

      {row ? (
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "calc(var(--fs-display) * 1.2)",
            lineHeight: 1,
            margin: 0,
            color: "var(--ink)",
            fontWeight: 500,
          }}
        >
          {row.index.toFixed(1)}
          <span
            style={{
              fontSize: "var(--fs-sm)",
              color: "var(--ink-faint)",
              fontFamily: "var(--font-mono)",
              marginLeft: "var(--space-3)",
            }}
          >
            / 5
          </span>
        </p>
      ) : null}

      <DateScrubber />

      <section className={styles.section} aria-label="Слои карты">
        <p className={styles.sectionLabel}>Слой</p>
        <LayerGrid />
      </section>

      <LayerInfoPanel />

      <section className={styles.section} aria-label="Что можно собирать в районе">
        <p className={styles.sectionLabel}>В районе сейчас</p>
        {error ? (
          <p className={styles.errorMsg}>не удалось загрузить прогноз: {error}</p>
        ) : top.length > 0 ? (
          <ul className={styles.topList}>
            {top.map((s) => (
              <li key={s.slug} className={styles.topRow}>
                <span
                  className={styles.topAccent}
                  style={{ background: "var(--moss)" }}
                  aria-hidden="true"
                />
                <span className={styles.topName}>{s.slug}</span>
                <span className={styles.topIndex}>
                  {(s.score * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.lead}>Нет данных на эту дату для района.</p>
        )}
      </section>

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Источники</p>
        <p className={styles.sources}>
          Лесхозданные — Рослесхоз / ФГИС ЛК. Гидрография — OpenStreetMap.
          Рельеф — Copernicus GLO-30 DEM. Прогноз — внутренняя модель
          mushroom-forecast (preview).
        </p>
      </section>
    </aside>
  );
}
