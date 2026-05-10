/**
 * /spots — список сохранённых юзером мест.
 *
 * V4 (redesign-2026-05-10):
 *   - убрали хлебные крошки «Кабинет / Сохранённые места» — `/spots` стал
 *     самостоятельной страницей в нав-уровне «Мои места»
 *   - убрали форму ручного создания (имя/заметка/координаты): добавлять
 *     место теперь можно только через клик по карте → SaveSpotModal
 *   - mini-map теперь использует scheme-подложку (Versatiles), как /map
 *   - клик по строке списка делает flyTo на координаты spot'а (zoom 13)
 *   - кнопка удаления — иконка корзины (lucide Trash2) красным
 *   - добавили вторую группу фильтров: по тэгам (грибы / деревья / ягоды)
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
import prose from "./Prose.module.css";

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
  // Подсветка точки на мини-карте при hover'е по строке списка.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const mapHandleRef = useRef<SpotsMiniMapHandle>(null);

  const visibleSpots = useMemo<UserSpot[]>(() => {
    if (!spots) return [];
    return spots.filter((s) => {
      if (ratingFilter.size > 0 && !ratingFilter.has(s.rating)) return false;
      if (tagFilter.size > 0) {
        const tags = s.tags ?? [];
        // OR-семантика: spot подходит если у него есть хоть один из выбранных тэгов.
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

  if (!user) return null; // ProtectedRoute уже отфильтровал.

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

  // Tag-набор, который реально встречается у юзерских spot'ов — иначе
  // показывать все 29 тэгов с нулевым counter'ом нет смысла.
  const usedTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of spots ?? []) for (const t of s.tags ?? []) set.add(t);
    return set;
  }, [spots]);

  const tagGroups: Array<{ title: string; tags: { slug: string; label: string }[] }> = [
    { title: "Грибы",   tags: MUSHROOM_TAGS.filter((t) => usedTags.has(t.slug)) },
    { title: "Деревья", tags: TREE_TAGS.filter((t) => usedTags.has(t.slug)) },
    { title: "Ягоды",   tags: BERRY_TAGS.filter((t) => usedTags.has(t.slug)) },
  ].filter((g) => g.tags.length > 0);

  return (
    <Container as="article" size="default">
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-xs)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--moss)",
          margin: "0 0 var(--space-2)",
        }}
      >
        Мои места
      </p>
      <h1 className={prose.h1}>
        {spots && spots.length > 0
          ? `${spots.length} сохранённых мест`
          : "Мои места"}
      </h1>
      <p className={prose.lead}>
        Видишь только ты. Никаких агрегаций, ничего не публикуется. Чтобы
        добавить место — кликни в нужную точку на карте.
      </p>

      {error && (
        <p className={prose.p} style={{ color: "var(--danger)" }}>{error}</p>
      )}

      {spots === null && !error && (
        <p className={prose.p} style={{ color: "var(--ink-dim)" }}>Загрузка…</p>
      )}

      {spots && spots.length === 0 && (
        <p className={prose.p} style={{ color: "var(--ink-dim)" }}>
          Пока пусто. Открой карту, кликни в нужное место и сохрани его.
        </p>
      )}

      {spots && spots.length > 0 && (
        <>
          <div className={styles.filterRow} role="group" aria-label="Фильтр по оценке">
            <span className={styles.filterLabel}>Оценка:</span>
            {RATING_OPTIONS.map((r) => {
              const active = ratingFilter.size === 0 || ratingFilter.has(r.value);
              return (
                <button
                  key={r.value}
                  type="button"
                  className={styles.filterChip}
                  data-active={active}
                  onClick={() => toggleRatingFilter(r.value)}
                  aria-pressed={ratingFilter.has(r.value)}
                  title={r.label}
                >
                  <span className={styles.filterDot} style={{ background: r.hex }} />
                  <span>{r.value} · {r.label}</span>
                </button>
              );
            })}
            {ratingFilter.size > 0 && (
              <button
                type="button"
                className={styles.filterReset}
                onClick={() => setRatingFilter(new Set())}
              >
                Сбросить
              </button>
            )}
          </div>

          {tagGroups.map((g) => (
            <div
              key={g.title}
              className={styles.filterRow}
              role="group"
              aria-label={`Фильтр по тэгам: ${g.title}`}
            >
              <span className={styles.filterLabel}>{g.title}:</span>
              {g.tags.map((t) => {
                const active = tagFilter.has(t.slug);
                return (
                  <button
                    key={t.slug}
                    type="button"
                    className={styles.filterChip}
                    data-active={tagFilter.size === 0 || active}
                    onClick={() => toggleTagFilter(t.slug)}
                    aria-pressed={active}
                    title={t.label}
                  >
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </>
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
                  className={styles.row}
                  data-highlighted={highlightedId === s.id}
                  onMouseEnter={() => setHighlightedId(s.id)}
                  onMouseLeave={() => setHighlightedId((h) => (h === s.id ? null : h))}
                  onClick={() => {
                    // flyTo на mini-map'е без перехода на /spots/<id> — юзер
                    // хочет видеть место на превью без ухода со страницы.
                    mapHandleRef.current?.flyTo(s.lat, s.lon, 13);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <span
                    className={styles.markerDot}
                    style={{ background: dotColor }}
                    aria-label={`Оценка ${s.rating} (${RATING_LABEL[s.rating]})`}
                    title={`${s.rating} — ${RATING_LABEL[s.rating]}`}
                  />
                  <div className={styles.rowBody}>
                    <div className={styles.rowTitle}>
                      <span className={styles.rowTitleText}>{s.name}</span>
                    </div>
                    {s.note && <div className={styles.rowNote}>{s.note}</div>}
                    {s.tags && s.tags.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                        {s.tags.map((slug) => (
                          <span
                            key={slug}
                            style={{
                              padding: "1px 8px",
                              border: "1px solid var(--rule)",
                              borderRadius: 999,
                              fontSize: "var(--fs-xs)",
                              color: "var(--ink-dim)",
                              background: "var(--paper)",
                            }}
                          >
                            {tagLabel(slug)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.rowMeta}>
                      <span>
                        {s.lat.toFixed(5)}, {s.lon.toFixed(5)}
                      </span>
                      {" · "}
                      <span>{new Date(s.created_at).toLocaleDateString("ru-RU")}</span>
                    </div>
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
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          <aside className={styles.mapPane} aria-label="Превью на карте">
            <SpotsMiniMap
              ref={mapHandleRef}
              spots={visibleSpots}
              highlightedId={highlightedId}
            />
          </aside>
        </div>
      )}
    </Container>
  );
}
