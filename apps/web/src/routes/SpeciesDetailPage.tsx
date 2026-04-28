/**
 * /species/:slug — детальная карточка вида.
 *
 * Layout (по spec'у redesign-2026-04, секция «/species/:slug карточка»):
 *  - Hero ~220px: photo background + gradient veil; eyebrow «Гриб ·
 *    съедобный» + Title (Fraunces) + латинское (Inter italic) +
 *    breadcrumb «← все виды» поверх.
 *  - Двухколоночное тело:
 *      Слева: «Где растёт» (intro + сезон 12-month bar)
 *      Справа: «Похожие виды» (с предупреждением для двойников),
 *              «Сродство к лесу» (mono-bar чарт), CTA «Открыть на карте»
 *
 * Phase 3: реальные фотографии в hero подгружаются через `data.photo_url`
 * (когда содержимое наполнят). Сейчас 99% видов идут с placeholder'ом —
 * рисуем диагональный паттерн в тон `birch`.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchSpeciesDetail } from "@mushroom-map/api-client";
import type { SpeciesDetail } from "@mushroom-map/types";
import { Container } from "../components/layout/Container";
import { SeasonBar } from "../components/species/SeasonBar";
import {
  EDIBILITY_LABEL,
  EDIBILITY_TONE,
  FOREST_LABEL,
} from "../components/species/labels";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./SpeciesDetailPage.module.css";
import prose from "./Prose.module.css";

export function SpeciesDetailPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [data, setData] = useState<SpeciesDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetchSpeciesDetail(slug)
      .then((d) => {
        if (cancelled) return;
        if (d === null) {
          setState("not_found");
        } else {
          setData(d);
          setState("ready");
        }
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === "loading") {
    return (
      <Container as="article" size="wide">
        <p className={prose.p} style={{ color: "var(--ink-dim)" }}>Загрузка…</p>
      </Container>
    );
  }

  if (state === "not_found") {
    return (
      <Container as="article" size="narrow">
        <h1 className={prose.h1}>Вид не найден</h1>
        <p className={prose.lead}>
          В справочнике нет вида с идентификатором <code>{slug}</code>.
        </p>
        <p className={prose.p}>
          <Link to="/species">← Назад в справочник</Link>
        </p>
      </Container>
    );
  }

  if (state === "error" || !data) {
    return (
      <Container as="article" size="narrow">
        <h1 className={prose.h1}>Ошибка загрузки</h1>
        <p className={prose.p}>
          Попробуйте обновить страницу позже.{" "}
          <Link to="/species">Вернуться к справочнику</Link>.
        </p>
      </Container>
    );
  }

  return <SpeciesDetailView data={data} />;
}

const KIND_LABEL = "Гриб";

function SpeciesDetailView({ data }: { data: SpeciesDetail }) {
  usePageTitle(
    `${data.name_ru} — Geobiom`,
    data.description ??
      `${data.name_ru} (${data.name_lat ?? ""}): ${EDIBILITY_LABEL[data.edibility].toLowerCase()}, сезон, типы леса.`,
  );

  const forestsSorted = useMemo(
    () => [...data.forests].sort((a, b) => b.affinity - a.affinity),
    [data.forests],
  );

  const tone = EDIBILITY_TONE[data.edibility];
  const eyebrowLabel = EDIBILITY_LABEL[data.edibility].toLowerCase();

  return (
    <Container as="article" size="default">
      <header className={styles.hero}>
        {data.photo_url ? (
          <div
            className={styles.heroBg}
            style={{ backgroundImage: `url(${data.photo_url})` }}
            aria-hidden="true"
          />
        ) : (
          <div className={styles.heroBgPlaceholder} aria-hidden="true" />
        )}
        <div className={styles.heroVeil} aria-hidden="true" />
        {data.red_book && (
          <span
            className={styles.redBookBadge}
            title="Включён в Красную книгу"
          >
            Красная книга
          </span>
        )}
        <div className={styles.heroContent}>
          <nav className={styles.breadcrumbs} aria-label="Хлебные крошки">
            <Link to="/species">← все виды</Link>
          </nav>
          <div className={styles.heroTitleRow}>
            <p className={styles.eyebrow}>
              {KIND_LABEL}
              <span
                className={styles.eyebrowDot}
                style={{ background: tone?.bg ?? "var(--moss)" }}
                aria-hidden="true"
              />
              {eyebrowLabel}
            </p>
            <h1 className={styles.title}>{data.name_ru}</h1>
            {data.name_lat ? (
              <p className={styles.latin}>{data.name_lat}</p>
            ) : null}
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.col}>
          <section className={styles.section} aria-labelledby="sec-where">
            <p className={styles.sectionLabel}>Где растёт</p>
            <h2 className={styles.sectionTitle} id="sec-where">
              Лес и сезон
            </h2>
            {data.description ? (
              <p className={styles.intro}>{data.description}</p>
            ) : (
              <p className={styles.descriptionDim}>
                Подробное описание появится в следующей фазе наполнения
                справочника. Пока доступны только структурные данные.
              </p>
            )}
            <SeasonBar months={data.season_months} />
          </section>

          <section className={styles.section} aria-labelledby="sec-facts">
            <p className={styles.sectionLabel}>Карточка</p>
            <h2 className={styles.sectionTitle} id="sec-facts">
              Быстрые факты
            </h2>
            <dl className={styles.facts}>
              <dt>Съедобность</dt>
              <dd>{EDIBILITY_LABEL[data.edibility]}</dd>

              {data.name_lat ? (
                <>
                  <dt>Латинское</dt>
                  <dd className={styles.factsLatin}>{data.name_lat}</dd>
                </>
              ) : null}

              {data.genus || data.family ? (
                <>
                  <dt>Таксономия</dt>
                  <dd>
                    {[data.genus, data.family].filter(Boolean).join(" / ")}
                  </dd>
                </>
              ) : null}

              {data.synonyms.length > 0 ? (
                <>
                  <dt>Синонимы</dt>
                  <dd>{data.synonyms.join(", ")}</dd>
                </>
              ) : null}

              {data.wiki_url ? (
                <>
                  <dt>Подробнее</dt>
                  <dd>
                    <a href={data.wiki_url} target="_blank" rel="noreferrer">
                      Википедия
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>
          </section>
        </div>

        <div className={styles.col}>
          {forestsSorted.length > 0 && (
            <section className={styles.section} aria-labelledby="sec-affinity">
              <p className={styles.sectionLabel}>Сродство к лесу</p>
              <h2 className={styles.sectionTitle} id="sec-affinity">
                Где встречается чаще всего
              </h2>
              <p className={styles.descriptionDim}>
                Экспертная оценка ассоциации с типом леса (0–1), не статистика
                находок.
              </p>
              <ul className={styles.forestList}>
                {forestsSorted.map((f) => (
                  <li key={f.forest_type} className={styles.forestRow}>
                    <span className={styles.forestName}>
                      {FOREST_LABEL[f.forest_type] ?? f.forest_type}
                    </span>
                    <span className={styles.affinityBar} aria-hidden="true">
                      <span
                        className={styles.affinityFill}
                        style={{ width: `${Math.round(f.affinity * 100)}%` }}
                      />
                    </span>
                    <span className={styles.affinityNum}>
                      {f.affinity.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.similars.length > 0 && (
            <section className={styles.section} aria-labelledby="sec-similars">
              <p className={styles.sectionLabel}>Похожие виды</p>
              <h2 className={styles.sectionTitle} id="sec-similars">
                Двойники и соседи
              </h2>
              <div className={styles.warningCard}>
                <p>
                  <strong>Безопасность прежде всего:</strong> если не уверены
                  в определении — не собирайте. Многие двойники опасны, а
                  некоторые смертельно ядовиты.
                </p>
              </div>
              <ul className={styles.similarsList}>
                {data.similars.map((s) => (
                  <li key={s.slug}>
                    <Link to={`/species/${s.slug}`} className={styles.similarLink}>
                      {s.slug}
                    </Link>
                    {s.note ? (
                      <span className={styles.similarNote}>— {s.note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.cooking ? (
            <section className={styles.section} aria-labelledby="sec-cooking">
              <p className={styles.sectionLabel}>Кулинария</p>
              <h2 className={styles.sectionTitle} id="sec-cooking">
                Как готовят
              </h2>
              <p className={styles.intro}>{data.cooking}</p>
            </section>
          ) : null}

          <div className={styles.ctaWrap}>
            <Link
              to={`/?species=${encodeURIComponent(data.slug)}`}
              className={styles.cta}
            >
              Открыть на карте →
            </Link>
          </div>
        </div>
      </div>
    </Container>
  );
}
