/**
 * ForestPopup — переработанный попап выдела леса.
 *
 * Source: docs/redesign-2026-05/claude-design/src/popup-spot.jsx
 *
 * Заменяет HTML-string buildPopupHtml. React-компонент монтируется в
 * контейнер MapLibre Popup через createRoot (см. useMapPopup). React
 * владеет click-handler'ами — `attachPopupHandlers` больше не нужен.
 *
 * Поведение:
 *  - При маунте играет open-анимацию (scale .04 → 1.02 → 1 + стаггер строк).
 *  - Toggle «в сезоне» ON по умолчанию — фильтрует top-3 по peak-месяцам;
 *    если результат пустой, fallback'имся на top-3 по affinity без фильтра.
 *  - «+ ещё N видов» разворачивает top-12 inline (API уже отдаёт 12).
 *  - Цвет 6×6 точки рядом с видом — по edibility.
 *  - «Сохранить спот» — emit'ит `mm:save-spot` (MapHomePage открывает
 *    SaveSpotModal). После save модалка emit'ит `mm:spot-saved` →
 *    попап переходит в done-state с тостом + claim-ring.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ForestAtResponse,
  SoilAtResponse,
  WaterDistanceResponse,
  TerrainAtResponse,
  Edibility,
} from "@mushroom-map/types";

const FOREST_NAMES: Record<string, string> = {
  pine: "Сосновый лес",
  spruce: "Ельник",
  larch: "Лиственничник",
  fir: "Пихтовый лес",
  cedar: "Кедровник",
  birch: "Берёзовый лес",
  aspen: "Осинник",
  alder: "Ольшаник",
  oak: "Дубрава",
  linden: "Липовый лес",
  maple: "Кленовый лес",
  mixed_coniferous: "Смешанный хвойный",
  mixed_broadleaved: "Смешанный лиственный",
  mixed: "Смешанный лес",
  unknown: "Лес",
};

const ROMAN = ["", "I", "II", "III", "IV", "V"];

// Палитра по edibility — несёт смысл (зелёный = безопасный, terra =
// акцент-warning, dark-red = токсично/смертельно).
const EDIBILITY_COLOR: Record<Edibility, string> = {
  edible:                "var(--moss)",
  conditionally_edible:  "var(--bark)",
  inedible:              "var(--ink-faint)",
  toxic:                 "var(--danger)",
  deadly:                "var(--danger)",
};

function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км`;
}

function speciesColor(edibility?: Edibility): string {
  if (!edibility) return "var(--ink-faint)";
  return EDIBILITY_COLOR[edibility];
}

function isInSeason(months: number[] | undefined, curMonth: number): boolean {
  return Array.isArray(months) && months.includes(curMonth);
}

// ─── Component ──────────────────────────────────────────────────────

export interface ForestPopupProps {
  forest: ForestAtResponse;
  soil: SoilAtResponse | null;
  water: WaterDistanceResponse | null;
  terrain: TerrainAtResponse | null;
  lat: number;
  lon: number;
  /** Уже сохранён в /spots? — стартуем сразу в done-state. */
  initiallySaved?: boolean;
  /** Подсветка save-кнопки контурным glow'ом — Hint V9. */
  saveHint?: boolean;
  onClose: () => void;
}

export function ForestPopup({
  forest,
  soil,
  water,
  terrain,
  lat,
  lon,
  initiallySaved = false,
  saveHint = false,
  onClose,
}: ForestPopupProps) {
  const [seasonFilter, setSeasonFilter] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "loading" | "done">(
    initiallySaved ? "done" : "idle",
  );
  const [toastVisible, setToastVisible] = useState(false);
  const [claimRingVisible, setClaimRingVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const ringTimerRef = useRef<number | null>(null);

  const curMonth = new Date().getMonth() + 1;
  const f = forest.forest;

  // ── Top-N видов: сортируем по affinity, потом по seasonFilter ─────
  const sortedSpecies = useMemo(() => {
    return [...forest.species_theoretical].sort(
      (a, b) => (b.affinity ?? 0) - (a.affinity ?? 0),
    );
  }, [forest.species_theoretical]);

  const visibleSpecies = useMemo(() => {
    const count = expanded ? 12 : 3;
    if (!seasonFilter) return sortedSpecies.slice(0, count);
    const inSeason = sortedSpecies.filter((s) =>
      isInSeason(s.season_months, curMonth),
    );
    // Если в сезоне меньше чем нужно — добавляем off-season по affinity.
    if (inSeason.length >= count) return inSeason.slice(0, count);
    const offSeason = sortedSpecies.filter(
      (s) => !isInSeason(s.season_months, curMonth),
    );
    return [...inSeason, ...offSeason].slice(0, count);
  }, [sortedSpecies, seasonFilter, expanded, curMonth]);

  const moreCount = Math.max(0, sortedSpecies.length - visibleSpecies.length);

  // ── Emit popup lifecycle events — OnboardingHints V8/V9 слушают ──
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("mm:popup-opened", { detail: { lat, lon } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("mm:popup-closed", { detail: { lat, lon } }),
      );
    };
  }, [lat, lon]);

  // ── Listen mm:spot-saved → done state + toast + claim-ring ─────────
  useEffect(() => {
    const onSaved = (e: Event) => {
      const ce = e as CustomEvent<{ lat: number; lon: number }>;
      if (!ce.detail) return;
      // Сравниваем приблизительно — небольшие float-погрешности между
      // popup-click и spot.lat/spot.lon из БД допустимы (round-trip).
      if (
        Math.abs(ce.detail.lat - lat) > 0.0001 ||
        Math.abs(ce.detail.lon - lon) > 0.0001
      ) return;
      setSaveState("done");
      setToastVisible(true);
      setClaimRingVisible(true);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(
        () => setToastVisible(false),
        2800,
      );
      if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current);
      ringTimerRef.current = window.setTimeout(
        () => setClaimRingVisible(false),
        3000,
      );
    };
    window.addEventListener("mm:spot-saved", onSaved as EventListener);
    return () => {
      window.removeEventListener("mm:spot-saved", onSaved as EventListener);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current);
    };
  }, [lat, lon]);

  const onSaveClick = () => {
    if (saveState === "done") return;
    window.dispatchEvent(
      new CustomEvent("mm:save-spot", { detail: { lat, lon } }),
    );
  };

  // ── Header values ─────────────────────────────────────────────────
  const forestName = f
    ? FOREST_NAMES[f.dominant_species] ?? f.dominant_species
    : "Вне выдела";
  // Area (ГА) убран из header по фидбеку юзера — не несёт смысла для грибника.
  const ageStr = f?.age_group ?? null;
  const bonitetStr =
    f?.bonitet != null && f.bonitet >= 1 && f.bonitet <= 5
      ? `бонитет ${ROMAN[f.bonitet]}`
      : null;

  // ── Coordinates string ────────────────────────────────────────────
  const coordStr = `${lat.toFixed(3)}° N · ${lon.toFixed(3)}° E`;

  return (
    <div className="psp-root" style={ROOT_STYLE}>
      {/* Open-animation: чистый opacity fade-in без transform.
       *  Раньше было `scale(.04→1)` overshoot — красиво, но GPU
       *  compositor-layer с grayscale AA держался и после анимации
       *  → блюр latin-names. Убрали transform совсем — текст чёткий. */}
      <div className="psp-anim" style={ANIM_STYLE}>
        {/* HEADER */}
        <div style={HEADER_STYLE}>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            style={CLOSE_BTN_STYLE}
          >
            ×
          </button>

          <div style={TITLE_STYLE}>{forestName}</div>

          <div style={META_ROW_STYLE}>
            {ageStr && <span>{ageStr}</span>}
            {bonitetStr && ageStr && <span style={SEPARATOR_STYLE}>·</span>}
            {bonitetStr && <span>{bonitetStr}</span>}
          </div>
        </div>

        {/* SPECIES */}
        {visibleSpecies.length > 0 && (
          <div style={SECTION_STYLE}>
            <div style={SECTION_HEADER_STYLE}>
              <span style={{ ...EYEBROW_STYLE, marginBottom: 0 }}>
                что растёт
              </span>
              <button
                type="button"
                onClick={() => setSeasonFilter((v) => !v)}
                style={SEASON_TOGGLE_STYLE}
                aria-pressed={seasonFilter}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    border: "1.2px solid var(--chanterelle)",
                    background: seasonFilter ? "var(--chanterelle)" : "transparent",
                    boxSizing: "border-box",
                  }}
                />
                <span>в&nbsp;сезоне</span>
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {visibleSpecies.map((s, i) => {
                const color = speciesColor(s.edibility);
                const aff = s.affinity != null ? Math.round(s.affinity * 100) : 0;
                return (
                  <div
                    key={s.slug}
                    className="psp-row"
                    style={{
                      ...SPECIES_ROW_STYLE,
                      animationDelay: `${0.18 + i * 0.09}s`,
                    }}
                  >
                    <div style={SPECIES_NAME_CELL_STYLE}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: color,
                          flexShrink: 0,
                          transform: "translateY(-2px)",
                        }}
                      />
                      {s.slug ? (
                        <a
                          href={`/species/${encodeURIComponent(s.slug)}`}
                          style={SPECIES_NAME_LINK_STYLE}
                        >
                          {s.name_ru}
                        </a>
                      ) : (
                        <span style={SPECIES_NAME_LINK_STYLE}>{s.name_ru}</span>
                      )}
                    </div>
                    <span style={SPECIES_AFF_STYLE}>{aff}%</span>

                    <div style={SPECIES_LATIN_STYLE}>{s.name_lat ?? ""}</div>
                    <SeasonStrip
                      months={s.season_months ?? []}
                      color={color}
                      curMonth={curMonth}
                    />
                  </div>
                );
              })}
            </div>

            {(moreCount > 0 || expanded) && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={MORE_LINK_STYLE}
              >
                {expanded ? "↑ свернуть" : `+ ещё ${moreCount} ${plural(moreCount, ["вид", "вида", "видов"])} →`}
              </button>
            )}
          </div>
        )}

        {/* NEARBY / SOIL */}
        {(water?.nearest || soil?.polygon || terrain?.elevation_m != null) && (
          <div style={NEARBY_SECTION_STYLE}>
            <div style={{ ...EYEBROW_STYLE, marginBottom: 10 }}>рядом · почва</div>
            <div style={NEARBY_GRID_STYLE}>
              {water?.by_source.waterway && (
                <NearbyRow
                  icon={<IconDrop />}
                  label={
                    <>
                      ручей
                      {water.by_source.waterway.name && (
                        <>
                          {" "}
                          <em style={EM_STYLE}>
                            «{water.by_source.waterway.name}»
                          </em>
                        </>
                      )}
                    </>
                  }
                  value={fmtDistance(water.by_source.waterway.distance_m)}
                />
              )}
              {water?.by_source.wetland && (
                <NearbyRow
                  icon={<IconBog />}
                  label="болото"
                  value={fmtDistance(water.by_source.wetland.distance_m)}
                />
              )}
              {soil?.polygon && (
                <NearbyRow
                  icon={<IconSoil />}
                  label={soil.polygon.soil0.descript}
                  value=""
                />
              )}
              {terrain?.elevation_m != null && (
                <NearbyRow
                  icon={<IconElevation />}
                  label="высота"
                  value={`${Math.round(terrain.elevation_m)} м`}
                />
              )}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div style={FOOTER_STYLE}>
          <div style={COORDS_STYLE}>{coordStr}</div>
          <SaveButton state={saveState} highlight={saveHint} onClick={onSaveClick} />
        </div>
      </div>

      {/* Toast — pill под попапом, появляется после save-success */}
      {toastVisible && (
        <div className="psp-toast-anim" style={TOAST_STYLE}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--chanterelle)",
            }}
          />
          Добавлено в&nbsp;<em style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>Мои&nbsp;места</em>
        </div>
      )}

      {/* Claim-ring — terra-кольцо у пина, expand'ится 3 сек one-shot */}
      {claimRingVisible && (
        <div style={CLAIM_RING_WRAPPER_STYLE} aria-hidden="true">
          <div className="psp-pin-ring" style={CLAIM_RING_STYLE} />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function SeasonStrip({
  months,
  color,
  curMonth,
}: {
  months: number[];
  color: string;
  curMonth: number;
}) {
  return (
    <div style={SEASON_STRIP_STYLE}>
      {Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const on = months.includes(m);
        const isCur = on && m === curMonth;
        return (
          <div
            key={m}
            style={{
              height: on ? 8 : 2,
              background: on ? color : "rgba(0,0,0,.12)",
              borderRadius: 1,
              boxShadow: isCur ? `0 0 0 1px ${color}66` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function NearbyRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "center" }}>{icon}</div>
      <div>{label}</div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink)",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </>
  );
}

function SaveButton({
  state,
  highlight,
  onClick,
}: {
  state: "idle" | "loading" | "done";
  highlight: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-popup-save
      onClick={onClick}
      disabled={state === "loading"}
      style={{
        position: "relative",
        padding: "9px 16px",
        minWidth: 148,
        height: 36,
        boxSizing: "border-box",
        background: state === "done" ? "var(--moss)" : "var(--forest)",
        color: "var(--cream)",
        border: 0,
        borderRadius: 10,
        fontFamily: "var(--font-body)",
        fontWeight: 500,
        fontSize: 13,
        cursor: state === "loading" ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        boxShadow: "0 6px 16px rgba(62,72,39,.24)",
        transition: "background .4s ease",
        animation: highlight ? "psp-save-pulse 2.2s ease-in-out infinite" : "none",
      }}
    >
      {state === "idle" && <span>Сохранить спот</span>}
      {state === "loading" && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            style={{
              animation: "psp-save-spinner 1.1s linear infinite",
              transformOrigin: "center",
            }}
          >
            <circle
              cx="7"
              cy="7"
              r="5.2"
              fill="none"
              stroke="var(--cream)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeDasharray="32"
              strokeDashoffset="14"
              opacity=".9"
            />
          </svg>
          <span>сохраняем…</span>
        </span>
      )}
      {state === "done" && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path
              d="M2.5 7.5 L6 11 L11.5 4"
              fill="none"
              stroke="var(--cream)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="36"
              strokeDashoffset="36"
              style={{
                animation:
                  "psp-save-check .55s .05s cubic-bezier(.2,.7,.2,1) forwards",
              }}
            />
          </svg>
          <span>в&nbsp;«Мои&nbsp;места»</span>
        </span>
      )}
    </button>
  );
}

// ─── Tiny inline SVG icons ──────────────────────────────────────────

function IconDrop() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 2 C 5 6, 3.5 8, 3.5 10.5 a 4.5 4.5 0 0 0 9 0 C 12.5 8, 11 6, 8 2 Z"
        fill="none"
        stroke="var(--moss)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBog() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M1 11 q 2 -3, 4 0 q 2 -3, 4 0 q 2 -3, 4 0"
        fill="none"
        stroke="var(--moss)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M3 8 q 1.5 -2, 3 0  M8 8 q 1.5 -2, 3 0"
        fill="none"
        stroke="var(--moss)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity=".5"
      />
    </svg>
  );
}

function IconSoil() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M2 11 L7 4 L12 11 Z"
        fill="none"
        stroke="var(--bark)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="5.5" cy="9" r=".6" fill="var(--bark)" />
      <circle cx="8.5" cy="8" r=".6" fill="var(--bark)" />
    </svg>
  );
}

function IconElevation() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M1 11 L4.5 6 L7 8 L9.5 4 L13 11 Z"
        fill="none"
        stroke="var(--ink-faint)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

// ─── Styles ─────────────────────────────────────────────────────────

// Только opacity-анимация — БЕЗ transform, чтобы Chrome не промоутил
// карточку в GPU compositor-layer (с grayscale AA, ломающим ClearType
// на latin-name строчках в блоке «что растёт»).
const ANIM_STYLE: React.CSSProperties = {
  background: "var(--cream)",
  borderRadius: 14,
  boxShadow:
    "0 22px 60px rgba(40,30,15,.28), 0 0 0 1px rgba(0,0,0,.06)",
  fontFamily: "var(--font-body)",
  color: "var(--ink)",
  overflow: "hidden",
  boxSizing: "border-box",
  animation: "psp-open .35s ease-out both",
};

const ROOT_STYLE: React.CSSProperties = {
  width: 320,
  position: "relative",
};

const HEADER_STYLE: React.CSSProperties = {
  padding: "18px 20px 14px",
  position: "relative",
  borderBottom: "1px solid rgba(0,0,0,.06)",
};

const CLOSE_BTN_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: 0,
  background: "transparent",
  color: "var(--ink-faint)",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const EYEBROW_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: ".16em",
  color: "var(--ink-dim)",
  textTransform: "uppercase",
  marginBottom: 6,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const TITLE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 26,
  fontWeight: 600,
  letterSpacing: "-0.018em",
  lineHeight: 1.05,
  marginBottom: 6,
};

const META_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: ".08em",
  color: "var(--ink-dim)",
  textTransform: "uppercase",
};

const SEPARATOR_STYLE: React.CSSProperties = { opacity: 0.4 };

const SECTION_STYLE: React.CSSProperties = {
  padding: "14px 20px 12px",
};

const SECTION_HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 10,
};

const SEASON_TOGGLE_STYLE: React.CSSProperties = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  padding: 0,
  fontSize: 10.5,
  color: "var(--ink-dim)",
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontFamily: "var(--font-body)",
};

const SPECIES_ROW_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  columnGap: 10,
  rowGap: 2,
  alignItems: "baseline",
  opacity: 0,
  animation: "psp-row-in .55s cubic-bezier(.2,.7,.2,1) forwards",
};

const SPECIES_NAME_CELL_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  minWidth: 0,
};

const SPECIES_NAME_LINK_STYLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: "-0.005em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  color: "var(--ink)",
  textDecoration: "none",
  borderBottom: "1px dotted rgba(42,38,32,.3)",
};

const SPECIES_AFF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--ink-dim)",
  letterSpacing: ".04em",
};

const SPECIES_LATIN_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 12,
  fontStyle: "italic",
  color: "var(--ink-dim)",
  paddingLeft: 14,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const SEASON_STRIP_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, 4px)",
  columnGap: 1,
  alignItems: "center",
};

const MORE_LINK_STYLE: React.CSSProperties = {
  marginTop: 12,
  padding: "6px 0",
  background: "transparent",
  border: 0,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--chanterelle)",
  cursor: "pointer",
  textAlign: "left",
};

const NEARBY_SECTION_STYLE: React.CSSProperties = {
  padding: "12px 20px 14px",
  borderTop: "1px solid rgba(0,0,0,.06)",
  background: "rgba(93,106,58,.045)",
};

const NEARBY_GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px 1fr auto",
  columnGap: 10,
  rowGap: 8,
  alignItems: "center",
  fontSize: 13,
};

const EM_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontStyle: "italic",
  color: "var(--ink)",
};

const FOOTER_STYLE: React.CSSProperties = {
  padding: "14px 20px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const COORDS_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--ink-dim)",
  letterSpacing: ".06em",
};

const TOAST_STYLE: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: -52,
  padding: "10px 16px 10px 14px",
  background: "var(--ink)",
  color: "var(--cream)",
  borderRadius: 999,
  fontSize: 12.5,
  fontFamily: "var(--font-body)",
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  boxShadow: "0 14px 30px rgba(20,15,10,.32)",
  whiteSpace: "nowrap",
  animation: "psp-toast 3s ease-in-out forwards",
  zIndex: 1,
  pointerEvents: "none",
};

const CLAIM_RING_WRAPPER_STYLE: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: -14,
  width: 0,
  height: 0,
  pointerEvents: "none",
  zIndex: 2,
};

const CLAIM_RING_STYLE: React.CSSProperties = {
  position: "absolute",
  left: -14,
  top: -14,
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "2px solid var(--chanterelle)",
  animation: "psp-pin-ring 3s ease-out forwards",
};
