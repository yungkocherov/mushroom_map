import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fetchSpeciesDetail, listSpots } from "@mushroom-map/api-client";
import type { UserSpot } from "@mushroom-map/types";
import { MapView } from "../components/MapView";
import { SaveSpotModal } from "../components/SaveSpotModal";
import { useAuth } from "../auth/useAuth";


export function MapPage() {
  const [params] = useSearchParams();
  const speciesSlug = params.get("species");
  const [speciesName, setSpeciesName] = useState<string | null>(null);

  // Подтягиваем человекочитаемое имя при наличии ?species=<slug>. Если
  // slug не резолвится — банер не показываем (graceful, не мигаем).
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

  // ── Auth + spots layer ──────────────────────────────────────────────
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
      // Не падаем визуально — без spots слоя карта всё равно работает.
      setSpots([]);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (status === "authenticated") {
      void refreshSpots();
    } else if (status === "unauth") {
      setSpots(null);
    }
    // status === "loading" — ждём, ничего не делаем
  }, [status, refreshSpots]);

  // ── Save-spot flow ──────────────────────────────────────────────────
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
      // status === "loading" — игнорируем; редко и без последствий.
    };
    window.addEventListener("mm:save-spot", onSaveSpot as EventListener);
    return () => window.removeEventListener("mm:save-spot", onSaveSpot as EventListener);
  }, [status, navigate]);

  return (
    <>
      <MapView userSpots={spots} />
      {speciesName && speciesSlug && (
        <SpeciesContextChip slug={speciesSlug} name={speciesName} />
      )}
      {saveTarget && (
        <SaveSpotModal
          lat={saveTarget.lat}
          lon={saveTarget.lon}
          onClose={() => setSaveTarget(null)}
          onSaved={() => void refreshSpots()}
        />
      )}
    </>
  );
}


/**
 * Плавающий чип-банер «Контекст: <вид>» появляется когда юзер пришёл
 * на /map?species=slug со страницы вида. Помогает не потеряться: «я
 * смотрю карту в контексте этого гриба». Снять контекст — клик в
 * крестик или переход в карту обычным образом.
 *
 * Реальный фильтр карты (подсветка лесов с высоким affinity для вида)
 * — будущая работа; пока чип чисто навигационный.
 */
function SpeciesContextChip({ slug, name }: { slug: string; name: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position:      "fixed",
        top:           "calc(64px + var(--space-3))",
        left:          "50%",
        transform:     "translateX(-50%)",
        zIndex:        500,
        background:    "var(--paper-rise)",
        border:        "1px solid var(--rule)",
        borderRadius:  "999px",
        padding:       "6px 10px 6px 14px",
        boxShadow:     "0 2px 8px rgba(0,0,0,0.08)",
        display:       "inline-flex",
        gap:           "var(--space-3)",
        alignItems:    "center",
        fontSize:      "var(--fs-sm)",
        color:         "var(--ink)",
        maxWidth:      "calc(100vw - 32px)",
      }}
    >
      <span style={{ color: "var(--ink-dim)" }}>Контекст:</span>
      <Link
        to={`/species/${slug}`}
        style={{
          color: "var(--forest)",
          textDecoration: "none",
          fontWeight: 500,
        }}
      >
        {name}
      </Link>
      <Link
        to="/map"
        aria-label="Снять контекст"
        title="Снять контекст"
        style={{
          color: "var(--ink-faint)",
          textDecoration: "none",
          fontSize: "1.05rem",
          lineHeight: 1,
          padding: "2px 4px",
          borderRadius: "999px",
        }}
      >
        ×
      </Link>
    </div>
  );
}
