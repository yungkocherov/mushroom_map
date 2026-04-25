/**
 * /species/:slug — детальная страница вида.
 *
 * Layout: две колонки на десктопе (>= 960 px) — слева sticky
 * «паспорт» (фото + быстрые факты), справа текст (описание, леса,
 * двойники, кулинария). На мобильном — одна колонка, паспорт
 * сверху.
 *
 * Секции пропускаются gracefully: поля description / similars /
 * cooking пока пустые для всех видов (контент-проход будет позже),
 * но endpoint отдаёт их структурированно — добавление ничего
 * здесь не сломает.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchSpeciesDetail } from "@mushroom-map/api-client";
import type { SpeciesDetail } from "@mushroom-map/types";
import { Container } from "../components/layout/Container";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { EdibilityChip } from "../components/species/EdibilityChip";
import { SeasonBar } from "../components/species/SeasonBar";
import { FOREST_LABEL, EDIBILITY_LABEL } from "../components/species/labels";
import styles from "./SpeciesDetailPage.module.css";
import prose from "./Prose.module.css";


export function SpeciesDetailPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [data, setData] = useState<SpeciesDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "error">("loading");

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

  return <SpeciesDetail data={data} />;
}


function SpeciesDetail({ data }: { data: SpeciesDetail }) {
  const forestsSorted = useMemo(
    () => [...data.forests].sort((a, b) => b.affinity - a.affinity),
    [data.forests],
  );

  return (
    <Container as="article" size="wide">
      <nav className={styles.breadcrumbs} aria-label="Хлебные крошки">
        <Link to="/species">Справочник видов</Link>
        <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
        <span>{data.name_ru}</span>
      </nav>

      <div className={styles.layout}>
        <aside className={styles.side}>
          <div className={styles.photoWrap}>
            {data.photo_url ? (
              <img src={data.photo_url} alt="" className={styles.photo} />
            ) : (
              <div className={styles.photoPlaceholder} aria-hidden="true">
                <svg viewBox="0 0 64 64" width={72} height={72} fill="var(--ink-faint)">
                  <path d="M32 8 C18 8, 8 20, 8 30 L56 30 C56 20, 46 8, 32 8 Z" />
                  <rect x="24" y="30" width="16" height="22" rx="4" fill="var(--ink-faint)" />
                </svg>
              </div>
            )}
            {data.red_book && (
              <span className={styles.redBookBadge} title="Включён в Красную книгу">
                Красная книга
              </span>
            )}
          </div>

          <Card>
            <dl className={styles.facts}>
              <dt>Съедобность</dt>
              <dd><EdibilityChip edibility={data.edibility} /></dd>

              {data.name_lat && (
                <>
                  <dt>Латинское</dt>
                  <dd className={styles.latin}>{data.name_lat}</dd>
                </>
              )}

              {(data.genus || data.family) && (
                <>
                  <dt>Таксономия</dt>
                  <dd>
                    {[data.genus, data.family].filter(Boolean).join(" / ")}
                  </dd>
                </>
              )}

              {data.synonyms.length > 0 && (
                <>
                  <dt>Синонимы</dt>
                  <dd>{data.synonyms.join(", ")}</dd>
                </>
              )}

              <dt>Сезон</dt>
              <dd>
                <SeasonBar months={data.season_months} />
              </dd>

              {data.wiki_url && (
                <>
                  <dt>Подробнее</dt>
                  <dd>
                    <a href={data.wiki_url} target="_blank" rel="noreferrer">
                      Википедия
                    </a>
                  </dd>
                </>
              )}
            </dl>

            {/* Кнопка «Показать на карте» — связка с Phase 3 D. */}
            <div className={styles.mapBtnWrap}>
              <Button as="link" to={`/map?species=${encodeURIComponent(data.slug)}`} variant="primary">
                Показать на карте
              </Button>
            </div>
          </Card>
        </aside>

        <div className={styles.main}>
          <h1 className={prose.h1}>{data.name_ru}</h1>

          {data.description && (
            <p className={prose.lead}>{data.description}</p>
          )}

          {forestsSorted.length > 0 && (
            <section>
              <h2 className={prose.h2}>Где растёт</h2>
              <p className={prose.p} style={{ color: "var(--ink-dim)", fontSize: "var(--fs-sm)" }}>
                Теоретическая ассоциация с типом леса. Значение affinity —
                экспертная оценка, не статистика находок.
              </p>
              <ul className={styles.forestList}>
                {forestsSorted.map((f) => (
                  <li key={f.forest_type} className={styles.forestRow}>
                    <span className={styles.forestName}>
                      {FOREST_LABEL[f.forest_type] ?? f.forest_type}
                    </span>
                    <span
                      className={styles.affinityBar}
                      aria-label={`affinity ${Math.round(f.affinity * 100)}%`}
                    >
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
            <section>
              <h2 className={prose.h2}>Сходные виды</h2>
              <Card>
                <p className={prose.p} style={{ margin: 0 }}>
                  <strong>Безопасность прежде всего:</strong> если не
                  уверены в определении — не собирайте. Многие из
                  двойников ниже опасны, а некоторые смертельно ядовиты.
                </p>
              </Card>
              <ul className={styles.similarsList}>
                {data.similars.map((s) => (
                  <li key={s.slug}>
                    <Link to={`/species/${s.slug}`} className={styles.similarLink}>
                      {s.slug}
                    </Link>
                    {s.note && <span className={styles.similarNote}>— {s.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.cooking && (
            <section>
              <h2 className={prose.h2}>Кулинария</h2>
              <p className={prose.p}>{data.cooking}</p>
            </section>
          )}

          {!data.description && !data.cooking && data.similars.length === 0 && (
            <Card>
              <p className={prose.p} style={{ margin: 0, color: "var(--ink-dim)" }}>
                Подробное описание ({EDIBILITY_LABEL[data.edibility].toLowerCase()},
                {" "}сезон {data.season_months.length > 0 ? data.season_months.join(", ") : "—"})
                {" "}будет добавлено в следующей фазе наполнения справочника.
                Пока доступны только структурные данные — где растёт и в каком сезоне.
              </p>
            </Card>
          )}
        </div>
      </div>
    </Container>
  );
}
