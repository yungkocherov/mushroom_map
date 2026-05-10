/**
 * MapHomePage — full-bleed карта с тремя floating-панелями.
 *
 * Phase W4 (redesign-2026-05): убрали grid `Sidebar | MapPane`, теперь
 * MapView занимает всё доступное пространство, а UI лежит поверх как
 * floating cards:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  [Wordmark] [search………………] [User]    ← MapTopBar (absolute)  │
 *   │  ┌──────────────┐                ┌──────────────┐             │
 *   │  │              │                │              │             │
 *   │  │ Layers panel │   MapView      │ Forecast      │            │
 *   │  │ (LayerGrid   │  (full bleed)  │  panel        │            │
 *   │  │  floating)   │                │ (right card)  │            │
 *   │  └──────────────┘                └──────────────┘             │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Layout.tsx скрывает Header на /map* — навигация уходит в MapTopBar.
 *
 * Source: docs/redesign-2026-05/claude-design/src/d1v2.jsx:353-457
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSpeciesDetail, listSpots } from "@mushroom-map/api-client";
import type { UserSpot } from "@mushroom-map/types";

import { MapView } from "../components/MapView";
import { SaveSpotModal } from "../components/SaveSpotModal";
import { MapTopBar } from "../components/mapView/MapTopBar";
import { MapForecastPanel } from "../components/mapView/MapForecastPanel";
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
        const next = encodeURIComponent("/map" + window.location.search);
        navigate(`/auth?next=${next}`);
      }
    };
    window.addEventListener("mm:save-spot", onSaveSpot as EventListener);
    return () => window.removeEventListener("mm:save-spot", onSaveSpot as EventListener);
  }, [status, navigate]);

  return (
    <div className={styles.shell}>
      <MapView userSpots={spots} />
      <MapTopBar />
      <MapForecastPanel />
      {speciesName && speciesSlug && (
        <div className={styles.contextChip} role="status" aria-live="polite">
          <span className={styles.contextChipLabel}>Контекст:</span>
          <span className={styles.contextChipName}>{speciesName}</span>
        </div>
      )}

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
