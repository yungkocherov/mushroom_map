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
import { SidebarOverview } from "../components/sidebar/SidebarOverview";
import { useAuth } from "../auth/useAuth";
import { useLayerVisibility } from "../store/useLayerVisibility";
import styles from "./MapHomePage.module.css";


export function MapHomePage() {
  // ── Forecast choropleth visible by default on the home overview ──
  // Default in store is `false` (так договорено в useLayerVisibility);
  // home — единственное место в Phase 2, где он включён сам собой. На
  // /map (legacy) и /map/:district решает sidebar/layer-grid.
  const setLayerVisible = useLayerVisibility((s) => s.setVisible);
  useEffect(() => {
    setLayerVisible("forecastChoropleth", true);
    return () => {
      // Не восстанавливаем явно — пользователь мог сам выключить через
      // LayerGrid; покинул главную → state остаётся как был. Phase 3
      // может добавить «session-scoped layer state» если станет нужно.
    };
  }, [setLayerVisible]);

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

  return (
    <div className={styles.shell}>
      <SidebarOverview className={styles.sidebar} />

      <div className={styles.mapPane}>
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
