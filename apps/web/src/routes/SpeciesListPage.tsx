/**
 * /species — каталог видов. Грид карточек + простой edibility-фильтр.
 *
 * Данные грузим один раз при mount'е (всего ~25 видов, нет смысла
 * в пагинации / бесконечной загрузке). Фильтр — клиентский,
 * категории соответствуют значениям edibility из species.edibility
 * CHECK-constraint.
 */

import { useEffect, useMemo, useState } from "react";
import { listSpecies } from "@mushroom-map/api-client";
import type { Edibility, SpeciesListItem } from "@mushroom-map/types";
import { Container } from "../components/layout/Container";
import { SpeciesCard } from "../components/species/SpeciesCard";
import { EDIBILITY_LABEL } from "../components/species/labels";
import styles from "./SpeciesListPage.module.css";
import prose from "./Prose.module.css";


type FilterValue = "all" | Edibility;

const FILTER_ORDER: FilterValue[] = [
  "all",
  "edible",
  "conditionally_edible",
  "inedible",
  "toxic",
  "deadly",
];


export function SpeciesListPage() {
  const [items, setItems] = useState<SpeciesListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");

  useEffect(() => {
    let cancelled = false;
    listSpecies()
      .then((data) => !cancelled && setItems(data))
      .catch((err) => !cancelled && setError(err.message ?? "Ошибка загрузки"));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (filter === "all") return items;
    return items.filter((i) => i.edibility === filter);
  }, [items, filter]);

  // Счётчики по категориям — для подписей в фильтре («Съедобные 12»).
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 };
    for (const it of items ?? []) c[it.edibility] = (c[it.edibility] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <Container as="section" size="wide">
      <header className={styles.header}>
        <h1 className={prose.h1}>Справочник видов</h1>
        <p className={prose.lead}>
          Грибы, которые встречаются в Ленинградской области. Данные
          справочные; распознавание собранных грибов и проверка
          съедобности — полностью на сборщике (см.{" "}
          <a href="/legal/terms">условия</a>).
        </p>
      </header>

      {items && (
        <nav className={styles.filters} aria-label="Фильтр по съедобности">
          {FILTER_ORDER.map((key) => {
            const count = counts[key] ?? 0;
            const label = key === "all" ? "Все" : EDIBILITY_LABEL[key];
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                disabled={count === 0}
                className={`${styles.filterBtn} ${active ? styles.filterBtnActive : ""}`}
                aria-pressed={active}
              >
                {label}
                <span className={styles.filterCount}>{count}</span>
              </button>
            );
          })}
        </nav>
      )}

      {error && (
        <p className={prose.p} style={{ color: "var(--danger)" }}>
          Не удалось загрузить справочник: {error}
        </p>
      )}

      {!items && !error && (
        <p className={prose.p} style={{ color: "var(--ink-dim)" }}>
          Загрузка…
        </p>
      )}

      {filtered && filtered.length === 0 && (
        <p className={prose.p} style={{ color: "var(--ink-dim)" }}>
          В этой категории видов пока нет.
        </p>
      )}

      {filtered && filtered.length > 0 && (
        <ul className={styles.grid}>
          {filtered.map((item) => (
            <li key={item.slug}>
              <SpeciesCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
