/**
 * InlineSearch — поисковая строка в MapTopBar с outline'овым dropdown'ом
 * под собой. V4.2 (redesign-2026-05-11): заменила modal-Spotlight, чтобы
 * не открывалось отдельное окно при каждом клике. Та же API
 * (`/api/species/search` + `/api/places/search`), но рендер inline.
 *
 * Раскладка:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ [🔍] [input............................] [⌘K]       │
 *   └──────────────────────────────────────────────────────┘
 *           ↓ dropdown появляется при q.length >= 2 ↓
 *   ┌──────────────────────────────────────────────────────┐
 *   │ ВИДЫ                                                  │
 *   │   вид  Берёза                                         │
 *   │ МЕСТА                                                 │
 *   │   город  Кириловское · Выборгский р-н, Лен. область  │
 *   └──────────────────────────────────────────────────────┘
 *
 * Hotkey ⌘K/Ctrl+K → focus input + select all. Click outside / Esc →
 * закрыть dropdown (input остаётся, чтобы юзер мог вернуться).
 *
 * Width лимит — fix'нут в CSS чтобы не перекрывал floating LayerGrid
 * card слева на /map (юзерская правка 4).
 */

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  searchGazetteer,
  searchSpecies,
  type GazetteerSearchResult,
} from "@mushroom-map/api-client";
import type { SpeciesSearchResult } from "@mushroom-map/types";
import { track } from "../../lib/track";
import styles from "./InlineSearch.module.css";

const KIND_LABEL: Record<string, string> = {
  settlement: "город",
  lake: "озеро",
  river: "река",
  tract: "урочище",
  station: "станция",
  poi: "место",
  district: "район",
};

function flyToPlace(p: GazetteerSearchResult): void {
  window.dispatchEvent(
    new CustomEvent("mm:fly-to", {
      detail: { lat: p.lat, lon: p.lon, zoom: 11 },
    }),
  );
}

export function InlineSearch() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [species, setSpecies] = useState<SpeciesSearchResult[]>([]);
  const [places, setPlaces] = useState<GazetteerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Hotkey ⌘K / Ctrl+K — focus input, выделить весь текст.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyK" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside → close dropdown (input не теряет value).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounce 200ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (debouncedQ.trim().length < 2) {
      setSpecies([]);
      setPlaces([]);
      return;
    }
    track("spotlight.search", { query_length: debouncedQ.length });
    let cancelled = false;
    setLoading(true);
    Promise.all([searchSpecies(debouncedQ, 6), searchGazetteer(debouncedQ, 8)])
      .then(([sp, pl]) => {
        if (cancelled) return;
        setSpecies(sp);
        setPlaces(pl);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ]);

  const flatResults = useMemo(() => {
    const out: Array<{
      key: string;
      href: string;
      place?: GazetteerSearchResult;
    }> = [];
    for (const s of species) out.push({ key: `s:${s.slug}`, href: `/species/${s.slug}` });
    for (const p of places) {
      out.push({
        key: `p:${p.id}`,
        href: `/map?lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}&z=11`,
        place: p,
      });
    }
    return out;
  }, [species, places]);

  useEffect(() => {
    setActiveIdx(0);
  }, [debouncedQ, species.length, places.length]);

  const handleSelect = (r: { href: string; place?: GazetteerSearchResult }) => {
    setOpen(false);
    if (r.place) {
      flyToPlace(r.place);
      navigate(r.href, { replace: true });
    } else {
      navigate(r.href);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (flatResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % flatResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flatResults[activeIdx];
      if (r) handleSelect(r);
    }
  };

  const showDropdown = open && (loading || debouncedQ.trim().length >= 2);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.bar}>
        <Search size={16} className={styles.icon} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder="Найти гриб, район или место…"
          aria-label="Поиск"
          autoComplete="off"
        />
        <span className={styles.kbd}>⌘ K</span>
      </div>

      {showDropdown && (
        <div className={styles.dropdown} role="listbox">
          {loading && <p className={styles.empty}>Ищем…</p>}

          {!loading && flatResults.length === 0 && (
            <p className={styles.empty}>Ничего не нашлось.</p>
          )}

          {species.length > 0 && (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>Виды</p>
              <ul className={styles.list}>
                {species.map((s, i) => {
                  const isActive = i === activeIdx;
                  return (
                    <li key={s.slug}>
                      <button
                        type="button"
                        className={`${styles.row}${isActive ? ` ${styles.rowActive}` : ""}`}
                        onClick={() => handleSelect({ href: `/species/${s.slug}` })}
                        onMouseEnter={() => setActiveIdx(i)}
                      >
                        <span className={styles.kind}>вид</span>
                        <span className={styles.name}>{s.name_ru}</span>
                        <span className={styles.coords}>{s.name_lat ?? ""}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {places.length > 0 && (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>Места</p>
              <ul className={styles.list}>
                {places.map((p, i) => {
                  const flatIdx = species.length + i;
                  const isActive = flatIdx === activeIdx;
                  const href = `/map?lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}&z=11`;
                  const context = p.district_name
                    ? `${p.district_name} р-н, ${p.region_name}`
                    : p.region_name;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`${styles.row}${isActive ? ` ${styles.rowActive}` : ""}`}
                        onClick={() => handleSelect({ href, place: p })}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                      >
                        <span className={styles.kind}>
                          {KIND_LABEL[p.kind] ?? p.kind}
                        </span>
                        <span className={styles.placeBody}>
                          <span className={styles.name}>{p.name}</span>
                          <span className={styles.placeContext}>{context}</span>
                        </span>
                        <span className={styles.coords}>
                          {p.lat.toFixed(2)}, {p.lon.toFixed(2)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
