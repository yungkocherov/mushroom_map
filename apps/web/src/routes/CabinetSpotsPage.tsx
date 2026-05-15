/**
 * /spots — список сохранённых юзером мест.
 *
 * V5 (redesign-2026-05-15, Geobiom (3).zip → d1v2-pages.jsx → D1VSavedSpots):
 *   - hero «Сохранённых мест: N» Fraunces 48px, italic terra-цифра
 *   - один компактный filter-card с 4 inline-рядами (оценка/грибы/деревья/ягоды)
 *   - cream-cards для spots с категорными чипами (mush=terra, tree=moss, berry=blue)
 *   - две колонки 1.2fr | 1fr, sticky-карта справа с footer'ом «N точек · ЛО»
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  deleteSpot,
  listSpots,
} from "@mushroom-map/api-client";
import type { SpotRating, UserSpot } from "@mushroom-map/types";
import { Container } from "../components/layout/Container";
import { SpotsMiniMap, type SpotsMiniMapHandle } from "../components/SpotsMiniMap";
import { useAuth } from "../auth/useAuth";
import { RATING_OPTIONS, RATING_HEX, RATING_LABEL } from "../lib/spotRating";
import {
  MUSHROOM_TAGS,
  TREE_TAGS,
  BERRY_TAGS,
  tagLabel,
} from "../lib/spotTags";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./CabinetSpotsPage.module.css";

type CatKind = "mushroom" | "tree" | "berry";

function categoryOf(slug: string): CatKind {
  if (MUSHROOM_TAGS.some((t) => t.slug === slug)) return "mushroom";
  if (TREE_TAGS.some((t) => t.slug === slug)) return "tree";
  return "berry"; // BERRY_TAGS — последняя группа; fallback тоже сюда.
}

export function CabinetSpotsPage() {
  usePageTitle(
    "Мои места — Geobiom",
    "Приватный список грибных мест. Видишь только ты, ничего не публикуется.",
  );

  const { user, getAccessToken } = useAuth();
  const [spots, setSpots] = useState<UserSpot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Фильтр по rating + tag-slug. Пустой Set = «всё включено».
  const [ratingFilter, setRatingFilter] = useState<Set<SpotRating>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const mapHandleRef = useRef<SpotsMiniMapHandle>(null);

  const visibleSpots = useMemo<UserSpot[]>(() => {
    if (!spots) return [];
    return spots.filter((s) => {
      if (ratingFilter.size > 0 && !ratingFilter.has(s.rating)) return false;
      if (tagFilter.size > 0) {
        const tags = s.tags ?? [];
        if (!tags.some((t) => tagFilter.has(t))) return false;
      }
      return true;
    });
  }, [spots, ratingFilter, tagFilter]);

  const toggleRatingFilter = (r: SpotRating) => {
    setRatingFilter((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const toggleTagFilter = (slug: string) => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const refresh = async () => {
    const tok = getAccessToken();
    if (!tok) return;
    try {
      const data = await listSpots(tok);
      setSpots(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  const handleDelete = async (id: string) => {
    const tok = getAccessToken();
    if (!tok) return;
    if (!confirm("Удалить это место?")) return;
    try {
      await deleteSpot(tok, id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Tag-набор, который реально встречается у юзерских spot'ов.
  const usedTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of spots ?? []) for (const t of s.tags ?? []) set.add(t);
    return set;
  }, [spots]);

  const visibleMushroomTags = MUSHROOM_TAGS.filter((t) => usedTags.has(t.slug));
  const visibleTreeTags     = TREE_TAGS.filter((t) => usedTags.has(t.slug));
  const visibleBerryTags    = BERRY_TAGS.filter((t) => usedTags.has(t.slug));

  return (
    <Container as="article" size="default">
      <p className={styles.eyebrow}>Мои места</p>
      <h1 className={styles.hero}>
        {spots && spots.length > 0 ? (
          <>
            Сохранённых мест:{" "}
            <span className={styles.heroNum}>{spots.length}</span>
          </>
        ) : (
          "Мои места"
        )}
      </h1>
      <p className={styles.lead}>
        Видишь только ты. Никаких агрегаций, ничего не публикуется. Чтобы
        добавить место — кликни в нужную точку на карте.
      </p>

      {error && <p className={styles.error}>{error}</p>}

      {spots === null && !error && (
        <p style={{ color: "var(--ink-dim)" }}>Загрузка…</p>
      )}

      {spots && spots.length === 0 && (
        <p style={{ color: "var(--ink-dim)" }}>
          Пока пусто. Открой карту, кликни в нужное место и сохрани его.
        </p>
      )}

      {spots && spots.length > 0 && (
        <div className={styles.filterCard}>
          <FilterGroup label="оценка">
            {RATING_OPTIONS.map((r) => {
              const on = ratingFilter.has(r.value);
              return (
                <button
                  key={r.value}
                  type="button"
                  className={styles.tinyChip}
                  data-on={on}
                  onClick={() => toggleRatingFilter(r.value)}
                  aria-pressed={on}
                  title={r.label}
                >
                  <span className={styles.tinyChipDot} style={{ background: r.hex }} />
                  <span>{r.value} · {r.label}</span>
                </button>
              );
            })}
          </FilterGroup>

          {visibleMushroomTags.length > 0 && (
            <FilterGroup label="грибы">
              {visibleMushroomTags.map((t) => (
                <FilterTinyChip
                  key={t.slug}
                  on={tagFilter.has(t.slug)}
                  onClick={() => toggleTagFilter(t.slug)}
                  label={t.label}
                />
              ))}
            </FilterGroup>
          )}

          {visibleTreeTags.length > 0 && (
            <FilterGroup label="деревья">
              {visibleTreeTags.map((t) => (
                <FilterTinyChip
                  key={t.slug}
                  on={tagFilter.has(t.slug)}
                  onClick={() => toggleTagFilter(t.slug)}
                  label={t.label}
                />
              ))}
            </FilterGroup>
          )}

          {visibleBerryTags.length > 0 && (
            <FilterGroup label="ягоды">
              {visibleBerryTags.map((t) => (
                <FilterTinyChip
                  key={t.slug}
                  on={tagFilter.has(t.slug)}
                  onClick={() => toggleTagFilter(t.slug)}
                  label={t.label}
                />
              ))}
            </FilterGroup>
          )}
        </div>
      )}

      {spots && spots.length > 0 && (
        <div className={styles.pane}>
          <ul className={styles.list}>
            {visibleSpots.length === 0 && (
              <li className={styles.emptyHint}>
                Под этот фильтр ничего не подходит.
              </li>
            )}
            {visibleSpots.map((s) => {
              const dotColor = RATING_HEX[s.rating] ?? RATING_HEX[3];
              return (
                <li
                  key={s.id}
                  className={styles.card}
                  data-highlighted={highlightedId === s.id}
                  onMouseEnter={() => setHighlightedId(s.id)}
                  onMouseLeave={() => setHighlightedId((h) => (h === s.id ? null : h))}
                  onClick={() => {
                    mapHandleRef.current?.flyTo(s.lat, s.lon, 13);
                  }}
                >
                  <span
                    className={styles.ratingDot}
                    style={{ background: dotColor }}
                    aria-label={`Оценка ${s.rating} (${RATING_LABEL[s.rating]})`}
                    title={`${s.rating} — ${RATING_LABEL[s.rating]}`}
                  />
                  <div className={styles.cardTitleRow}>
                    <span className={styles.cardTitle}>{s.name}</span>
                    {s.note && (
                      <span className={styles.cardNote}>· {s.note}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(s.id);
                    }}
                    aria-label="Удалить"
                    title="Удалить"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                  {s.tags && s.tags.length > 0 && (
                    <div className={styles.chipsRow}>
                      {s.tags.map((slug) => {
                        const cat = categoryOf(slug);
                        const catClass =
                          cat === "mushroom" ? styles.catChipMushroom
                          : cat === "tree"   ? styles.catChipTree
                          : styles.catChipBerry;
                        return (
                          <span key={slug} className={`${styles.catChip} ${catClass}`}>
                            {tagLabel(slug)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className={styles.cardMeta}>
                    <span>{s.lat.toFixed(5)}, {s.lon.toFixed(5)}</span>
                    <span className={styles.cardMetaSep}>·</span>
                    <span>{new Date(s.created_at).toLocaleDateString("ru-RU", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className={styles.mapPaneWrap}>
            <aside className={styles.mapPane} aria-label="Превью на карте">
              <SpotsMiniMap
                ref={mapHandleRef}
                spots={visibleSpots}
                highlightedId={highlightedId}
              />
            </aside>
            <div className={styles.mapFooter}>
              <span>{visibleSpots.length} {pluralPoints(visibleSpots.length)} · ЛО</span>
              <span className={styles.mapFooterHand}>клик на карте — добавить →</span>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.filterGroup}>
      <span className={styles.filterGroupLabel}>{label}</span>
      <div className={styles.filterGroupChips}>{children}</div>
    </div>
  );
}

function FilterTinyChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={styles.tinyChip}
      data-on={on}
      onClick={onClick}
      aria-pressed={on}
    >
      {label}
    </button>
  );
}

function pluralPoints(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "точек";
  if (mod10 === 1) return "точка";
  if (mod10 >= 2 && mod10 <= 4) return "точки";
  return "точек";
}
