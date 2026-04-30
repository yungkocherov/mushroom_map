/**
 * Spotlight (⌘K) — глобальный модальный поиск по видам и топонимам.
 *
 * Реализован на Radix Dialog (уже стоит в зависимостях) — без cmdk,
 * чтобы не раздувать bundle ради одного экрана.
 *
 * Хоткей: Cmd+K (mac) / Ctrl+K (Windows/Linux). Esc — закрытие.
 *
 * Источники:
 *   /api/species/search — searchSpecies()
 *   /api/places/search  — searchGazetteer() (gazetteer_entry, kind in
 *     'settlement' | 'lake' | 'river' | 'tract' | 'station' | 'poi' |
 *     'district')
 *
 * Селект ведёт:
 *   - вид → /species/<slug>
 *   - район (kind=district) → / + selectDistrict(...)
 *   - топоним → / + center на lat/lon (через ?lat=&lon=)
 */
import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  searchGazetteer,
  searchSpecies,
  type GazetteerSearchResult,
} from "@mushroom-map/api-client";
import type { SpeciesSearchResult } from "@mushroom-map/types";
import { track } from "../lib/track";
import styles from "./Spotlight.module.css";

const KIND_LABEL: Record<string, string> = {
  settlement: "город",
  lake: "озеро",
  river: "река",
  tract: "урочище",
  station: "станция",
  poi: "место",
  district: "район",
};

export interface SpotlightProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Spotlight({ open: controlled, onOpenChange }: SpotlightProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlled !== undefined;
  const open = isControlled ? controlled : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  // Глобальный hotkey ⌘K / Ctrl+K. Используем `e.code === "KeyK"` —
  // не зависит от регистра (Shift+K не сменит code, в отличие от
  // e.key, который дал бы "K" вместо "k").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyK" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [species, setSpecies] = useState<SpeciesSearchResult[]>([]);
  const [places, setPlaces] = useState<GazetteerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce 200ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setQ("");
      setDebouncedQ("");
      setSpecies([]);
      setPlaces([]);
    }
  }, [open]);

  // Fetch on debounced change. Параллельно дёргаем оба источника.
  useEffect(() => {
    if (debouncedQ.trim().length < 2) {
      setSpecies([]);
      setPlaces([]);
      return;
    }
    // Аналитика — трекаем длину запроса (содержание текста — PII).
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

  const navigate = useNavigate();

  // Плоский список href'ов в том же порядке, в каком отрисованы строки —
  // нужен handleKey'ю для Enter-навигации. Метку строки рендерим в JSX
  // ниже отдельно по типу источника.
  const flatResults = useMemo(() => {
    const out: Array<{ key: string; href: string }> = [];
    for (const s of species) out.push({ key: `s:${s.slug}`, href: `/species/${s.slug}` });
    for (const p of places) {
      out.push({
        key: `p:${p.id}`,
        href: `/?lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}&z=11`,
      });
    }
    return out;
  }, [species, places]);

  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    setActiveIdx(0);
  }, [debouncedQ, species.length, places.length]);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleKey = (e: React.KeyboardEvent) => {
    if (flatResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % flatResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(
        (i) => (i - 1 + flatResults.length) % flatResults.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flatResults[activeIdx];
      if (r) {
        setOpen(false);
        navigate(r.href);
      }
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          onOpenAutoFocus={(e: Event) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          aria-label="Поиск"
        >
          <Dialog.Title className="sr-only" asChild>
            <span>Поиск по видам и местам</span>
          </Dialog.Title>
          <div className={styles.inputRow}>
            <Search size={16} className={styles.icon} aria-hidden />
            <input
              ref={inputRef}
              type="search"
              className={styles.input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Вид, район, озеро, посёлок…"
              aria-label="Поиск"
              autoComplete="off"
            />
            <span className={styles.kbd}>esc</span>
          </div>

          <div className={styles.results}>
            {loading && (
              <p className={styles.loading}>Ищем…</p>
            )}

            {!loading && debouncedQ.trim().length < 2 && (
              <p className={styles.empty}>
                Введите запрос — ищем виды грибов, районы и топонимы.
              </p>
            )}

            {!loading &&
              debouncedQ.trim().length >= 2 &&
              flatResults.length === 0 && (
                <p className={styles.empty}>Ничего не нашлось.</p>
              )}

            {species.length > 0 && (
              <section className={styles.section}>
                <p className={styles.sectionTitle}>Виды</p>
                <ul className={styles.list}>
                  {species.map((s, i) => {
                    const idx = i;
                    const flatIdx = idx;
                    const isActive = flatIdx === activeIdx;
                    return (
                      <li key={s.slug}>
                        <a
                          href={`/species/${s.slug}`}
                          className={`${styles.row}${isActive ? ` ${styles.rowActive}` : ""}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setOpen(false);
                            navigate(`/species/${s.slug}`);
                          }}
                          onMouseEnter={() => setActiveIdx(flatIdx)}
                        >
                          <span className={styles.kind}>вид</span>
                          <span className={styles.name}>{s.name_ru}</span>
                          <span className={styles.coords}>{s.name_lat ?? ""}</span>
                        </a>
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
                    const href = `/?lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}&z=11`;
                    return (
                      <li key={p.id}>
                        <a
                          href={href}
                          className={`${styles.row}${isActive ? ` ${styles.rowActive}` : ""}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setOpen(false);
                            navigate(href);
                          }}
                          onMouseEnter={() => setActiveIdx(flatIdx)}
                        >
                          <span className={styles.kind}>
                            {KIND_LABEL[p.kind] ?? p.kind}
                          </span>
                          <span className={styles.name}>{p.name_ru}</span>
                          <span className={styles.coords}>
                            {p.lat.toFixed(2)}, {p.lon.toFixed(2)}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
