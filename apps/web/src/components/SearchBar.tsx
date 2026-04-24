import { useCallback, useEffect, useRef, useState } from "react";
import { searchSpecies, searchPlaces } from "@mushroom-map/api-client";
import type { SpeciesSearchResult, NominatimResult } from "@mushroom-map/types";
import { useIsMobile } from "../lib/useIsMobile";

interface Props {
  onFlyTo: (lat: number, lon: number, zoom?: number) => void;
  onSpeciesFilter: (forestTypes: string[] | null, label: string | null) => void;
}

type PlaceResult = { kind: "place"; item: NominatimResult };
type SpecResult  = { kind: "species"; item: SpeciesSearchResult };
type Result = PlaceResult | SpecResult;

const EDIBILITY_COLOR: Record<string, string> = {
  edible:               "#2e7d32",
  conditionally_edible: "#e65100",
  inedible:             "#757575",
  toxic:                "#c62828",
  deadly:               "#b71c1c",
};

const wrapStyle = (mobile: boolean): React.CSSProperties => ({
  position: "absolute",
  top: mobile ? 8 : 12,
  left: mobile ? 8 : "50%",
  right: mobile ? 8 : undefined,
  transform: mobile ? undefined : "translateX(-50%)",
  zIndex: 20,
  width: mobile ? "auto" : 320,
  fontFamily: "system-ui, sans-serif",
});

const INPUT_WRAP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "rgba(255,255,255,0.97)",
  borderRadius: 8,
  boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
  border: "1px solid rgba(0,0,0,0.1)",
  padding: "0 10px",
  gap: 6,
};

// font-size >= 16px на мобильном — иначе iOS Safari зумит при фокусе на input
const inputStyle = (mobile: boolean): React.CSSProperties => ({
  flex: 1,
  border: "none",
  outline: "none",
  fontSize: mobile ? 16 : 13,
  padding: mobile ? "11px 0" : "9px 0",
  background: "transparent",
  color: "#222",
  minWidth: 0,  // чтобы input не выпирал из flex-родителя на узких экранах
});

const DROPDOWN: React.CSSProperties = {
  marginTop: 4,
  background: "white",
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  maxHeight: 320,
  overflowY: "auto",
};

const SECTION_HEADER: React.CSSProperties = {
  fontSize: 10,
  color: "#999",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  padding: "6px 12px 3px",
  background: "#fafafa",
};

const ITEM = (highlighted: boolean): React.CSSProperties => ({
  padding: "7px 12px",
  cursor: "pointer",
  background: highlighted ? "#f0f4ff" : "white",
  fontSize: 13,
  color: "#222",
  display: "flex",
  alignItems: "center",
  gap: 8,
  transition: "background 0.1s",
});

export function SearchBar({ onFlyTo, onSpeciesFilter }: Props) {
  const mobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const [species, places] = await Promise.all([
      searchSpecies(q, 5),
      searchPlaces(q),
    ]);
    const combined: Result[] = [
      ...species.map(s => ({ kind: "species" as const, item: s })),
      ...places.map(p => ({ kind: "place" as const, item: p })),
    ];
    setResults(combined);
    setOpen(combined.length > 0);
    setHighlighted(-1);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectResult = (r: Result) => {
    setOpen(false);
    if (r.kind === "place") {
      const lat = parseFloat(r.item.lat);
      const lon = parseFloat(r.item.lon);
      onFlyTo(lat, lon, 12);
      setQuery(r.item.display_name.split(",")[0]);
    } else {
      const label = r.item.name_ru;
      setQuery(label);
      setActiveFilter(label);
      onSpeciesFilter(r.item.forest_types.length > 0 ? r.item.forest_types : null, label);
    }
  };

  const clearFilter = () => {
    setActiveFilter(null);
    onSpeciesFilter(null, null);
    setQuery("");
  };

  const speciesResults = results.filter(r => r.kind === "species");
  const placeResults  = results.filter(r => r.kind === "place");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(h => Math.min(h + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === "Enter" && highlighted >= 0) selectResult(results[highlighted]);
    if (e.key === "Escape") { setOpen(false); }
  };

  let resultIdx = -1;

  return (
    <div style={wrapStyle(mobile)} ref={wrapRef}>
      <div style={INPUT_WRAP}>
        <span style={{ color: "#aaa", fontSize: 14 }}>🔍</span>
        <input
          style={inputStyle(mobile)}
          placeholder="Поиск гриба или места…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
        />
        {loading && <span style={{ color: "#aaa", fontSize: 11 }}>…</span>}
        {activeFilter && (
          <button
            onClick={clearFilter}
            style={{ border: "none", background: "#e8f5e9", color: "#2e7d32", borderRadius: 4, padding: "2px 6px", fontSize: 11, cursor: "pointer" }}
          >
            ✕ {activeFilter}
          </button>
        )}
      </div>

      {open && (speciesResults.length > 0 || placeResults.length > 0) && (
        <div style={DROPDOWN}>
          {speciesResults.length > 0 && (
            <>
              <div style={SECTION_HEADER}>Грибы</div>
              {speciesResults.map(r => {
                resultIdx++;
                const idx = resultIdx;
                const s = (r as SpecResult).item;
                return (
                  <div key={s.slug} style={ITEM(highlighted === idx)} onMouseDown={() => selectResult(r)} onMouseEnter={() => setHighlighted(idx)}>
                    <span style={{ fontSize: 16 }}>🍄</span>
                    <div>
                      <div style={{ color: EDIBILITY_COLOR[s.edibility ?? ""] ?? "#222", fontWeight: 500 }}>{s.name_ru}</div>
                      {s.name_lat && <div style={{ fontSize: 10, color: "#aaa", fontStyle: "italic" }}>{s.name_lat}</div>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          {placeResults.length > 0 && (
            <>
              <div style={SECTION_HEADER}>Места</div>
              {placeResults.map(r => {
                resultIdx++;
                const idx = resultIdx;
                const p = (r as PlaceResult).item;
                const parts = p.display_name.split(",");
                return (
                  <div key={p.place_id} style={ITEM(highlighted === idx)} onMouseDown={() => selectResult(r)} onMouseEnter={() => setHighlighted(idx)}>
                    <span style={{ fontSize: 14 }}>📍</span>
                    <div>
                      <div style={{ fontWeight: 500 }}>{parts[0].trim()}</div>
                      {parts[1] && <div style={{ fontSize: 10, color: "#aaa" }}>{parts.slice(1, 3).join(",").trim()}</div>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
