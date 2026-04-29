/**
 * MapHomePage — новая главная: разворот атласа с sidebar слева и
 * MapView справа. Заменяет HomePage по решению редизайна (variant C
 * «карта + читальный угол», см. docs/redesign-2026-04.md).
 *
 * Композиция:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │   SidebarOverview     │       MapView (full bleed)       │
 *   │   (~380px width)      │       choropleth + outlines      │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Phase 2 partial: пока используем тот же auth/spots/save поток что и
 * /map (MapPage). Когда `useMapMode` подцепится к URL (фаза 2.5),
 * клик по району из choropleth будет переключать sidebar в режим
 * SidebarDistrict вместо текущего SidebarOverview.
 *
 * Старый MapPage на /map остаётся как legacy alias — phase 2.5/3 уберёт
 * его (см. checklist в docs/redesign-2026-04.md).
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSpeciesDetail, listSpots } from "@mushroom-map/api-client";
import type { UserSpot } from "@mushroom-map/types";

import { MapView } from "../components/MapView";
import { SaveSpotModal } from "../components/SaveSpotModal";
import { Sidebar } from "../components/sidebar/Sidebar";
import { useAuth } from "../auth/useAuth";
import styles from "./MapHomePage.module.css";


export function MapHomePage() {
  // ── Optional ?species=<slug> context (carried over from old /map) ──
  const [speciesName, setSpeciesName] = useState<string | null>(null);
  const speciesSlug =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("species")
      : null;

  useEffect(() => {
    if (!speciesSlug) {
      setSpeciesName(null);
      return;
    }
    let cancelled = false;
    fetchSpeciesDetail(speciesSlug)
      .then((d) => !cancelled && setSpeciesName(d?.name_ru ?? null))
      .catch(() => !cancelled && setSpeciesName(null));
    return () => {
      cancelled = true;
    };
  }, [speciesSlug]);

  // ── Auth + spots layer ─────────────────────────────────────────────
  const { status, getAccessToken } = useAuth();
  const [spots, setSpots] = useState<UserSpot[] | null>(null);

  const refreshSpots = useCallback(async () => {
    const tok = getAccessToken();
    if (!tok) {
      setSpots(null);
      return;
    }
    try {
      const data = await listSpots(tok);
      setSpots(data);
    } catch {
      setSpots([]);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (status === "authenticated") {
      void refreshSpots();
    } else if (status === "unauth") {
      setSpots(null);
    }
  }, [status, refreshSpots]);

  // ── Save-spot flow (mm:save-spot custom event) ────────────────────
  // NB: оставляем event-bus, не переходим на прямой вызов хука: popup
  // MapLibre рендерится вне React-tree, хуки оттуда не работают.
  // См. adversarial-review fix C2 в docs/redesign-2026-04.md.
  const navigate = useNavigate();
  const [saveTarget, setSaveTarget] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    const onSaveSpot = (e: Event) => {
      const ce = e as CustomEvent<{ lat: number; lon: number }>;
      const detail = ce.detail;
      if (!detail || typeof detail.lat !== "number" || typeof detail.lon !== "number") return;

      if (status === "authenticated") {
        setSaveTarget({ lat: detail.lat, lon: detail.lon });
      } else if (status === "unauth") {
        const next = encodeURIComponent("/" + window.location.search);
        navigate(`/auth?next=${next}`);
      }
    };
    window.addEventListener("mm:save-spot", onSaveSpot as EventListener);
    return () => window.removeEventListener("mm:save-spot", onSaveSpot as EventListener);
  }, [status, navigate]);

  // ── Collapsible sidebar ────────────────────────────────────────────
  // Persisted, default expanded. Toggle висит как полоска-ручка на границе
  // sidebar↔map; в свёрнутом состоянии пилюля «Показать панель» лежит на
  // карте сверху-слева.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    // 2026-04-29: bumped key to v2 to reset users who had it collapsed
    // from previous sessions. Default = expanded.
    try { window.localStorage.removeItem("mm.sidebarCollapsed"); } catch { /* */ }
    return window.localStorage.getItem("mm.sidebarCollapsed.v2") === "1";
  });
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("mm.sidebarCollapsed.v2", next ? "1" : "0");
      } catch { /* private mode */ }
      return next;
    });
  }, []);
  // MapLibre canvas рендерит в фиксированный pixel-buffer по последнему
  // размеру контейнера. При свёртывании sidebar grid-template-columns
  // меняется → div ширже, но canvas прежнего размера → пустые полосы /
  // «карта сломана». Стрельнуть window resize заставит MapLibre сделать
  // resize() сам (он подписан на это событие). Дёргаем 2 раза: сразу и
  // после анимации (если будет) — на случай transition'а.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("resize"));
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
    return () => clearTimeout(t);
  }, [sidebarCollapsed]);

  return (
    <div
      className={`${styles.shell}${sidebarCollapsed ? ` ${styles.shellCollapsed}` : ""}`}
    >
      {/* Sidebar остаётся в DOM всегда, иначе при collapse mapPane попадает
          в первую (0-width) колонку grid'а и карта схлопывается. Скрытие
          делаем через CSS-класс. */}
      <div className={`${styles.sidebar}${sidebarCollapsed ? ` ${styles.sidebarHidden}` : ""}`}>
        <Sidebar />
      </div>

      <div className={styles.mapPane}>
        <button
          type="button"
          className={styles.sidebarToggle}
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? "Показать боковую панель" : "Скрыть боковую панель"}
          title={sidebarCollapsed ? "Показать панель" : "Скрыть панель"}
        >
          {sidebarCollapsed ? "›" : "‹"}
        </button>
        <MapView userSpots={spots} />
        {speciesName && speciesSlug && (
          <div className={styles.contextChip} role="status" aria-live="polite">
            <span className={styles.contextChipLabel}>Контекст:</span>
            <span className={styles.contextChipName}>{speciesName}</span>
          </div>
        )}
      </div>

      {saveTarget && (
        <SaveSpotModal
          lat={saveTarget.lat}
          lon={saveTarget.lon}
          onClose={() => setSaveTarget(null)}
          onSaved={() => void refreshSpots()}
        />
      )}
    </div>
  );
}
