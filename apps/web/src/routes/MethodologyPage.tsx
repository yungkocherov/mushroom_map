import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { Container } from "../components/layout/Container";
import { Stats } from "../components/mdx";
import {
  articles,
  METHODOLOGY_CATEGORIES,
  type MethodologyArticle,
  type MethodologyCategory,
} from "../content/methodology";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./MethodologyPage.module.css";

/**
 * /methodology hub: 4 рубрики на 2-колоночной сетке (по spec'у
 * redesign-2026-04, секция «/methodology хаб»). Категории — фиксированные
 * и закодированы в `METHODOLOGY_CATEGORIES`. Если в рубрике пока нет ни
 * одной статьи — рендерим placeholder «скоро» вместо пустого списка.
 *
 * «Юридическое» сейчас живёт по url'ам /legal/{privacy,terms} — не MDX
 * статьи. Phase 2.5 переедет на /methodology/{privacy,terms}; для
 * хаба добавляем их вручную как fallback'ы.
 */

interface ManualLink {
  href: string;
  title: string;
  abstract?: string;
}

const LEGAL_FALLBACKS: ManualLink[] = [
  {
    href: "/legal/privacy",
    title: "Политика конфиденциальности",
    abstract: "Какие данные собираются, как хранятся и кто к ним имеет доступ.",
  },
  {
    href: "/legal/terms",
    title: "Условия использования",
    abstract: "Правила пользования сайтом и ответственность сторон.",
  },
];

const CATEGORY_INTRO: Record<MethodologyCategory, string> = {
  "Источники данных":
    "Откуда полигоны, рельеф, почвы и VK-наблюдения, и где у каждого источника границы применимости.",
  "Модель прогноза":
    "Как считается индекс грибности и что модель принципиально не учитывает.",
  "О проекте": "Зачем проект существует, кто его делает и как он эволюционирует.",
  "Юридическое": "Согласия, лицензии, ответственность.",
};

export function MethodologyPage() {
  usePageTitle(
    "Методология — Geobiom",
    "Откуда берутся данные карты Geobiom: лесные выделы Рослесхоза, рельеф Copernicus, почвы Докучаевского, VK-наблюдения.",
  );

  const grouped: Record<MethodologyCategory, MethodologyArticle[]> = {
    "Источники данных": [],
    "Модель прогноза": [],
    "О проекте": [],
    "Юридическое": [],
  };
  for (const a of articles) grouped[a.category].push(a);

  return (
    <Container as="article" size="default">
      <p className={styles.eyebrow}>Откуда мы это знаем</p>
      <h1 className={styles.h1}>Методология проекта</h1>
      <p className={styles.lead}>
        Каждый слой карты собирается из открытых источников, проходит через
        документированный пайплайн и хранится с указанием версии и времени
        обновления. Ниже — четыре рубрики: источники данных, модель прогноза,
        о проекте, юридическое.
      </p>

      <Stats
        stats={[
          { number: "4", label: "источника данных", hint: "ФГИС ЛК · OSM · Copernicus · Докучаевский" },
          { number: "2,17M", label: "лесных полигонов", hint: "вся ЛО" },
          { number: "18", label: "видов в реестре", hint: "+ 3 ягоды" },
          { number: "69k", label: "VK-постов", hint: "проанализировано" },
        ]}
      />

      <div className={styles.sections}>
        {METHODOLOGY_CATEGORIES.map((cat) => (
          <CategorySection
            key={cat}
            category={cat}
            articles={grouped[cat]}
            intro={CATEGORY_INTRO[cat]}
            fallbacks={cat === "Юридическое" ? LEGAL_FALLBACKS : undefined}
            workInProgress={cat === "Модель прогноза"}
          />
        ))}
      </div>
    </Container>
  );
}

function CategorySection({
  category,
  articles,
  intro,
  fallbacks,
  workInProgress,
}: {
  category: MethodologyCategory;
  articles: MethodologyArticle[];
  intro: string;
  fallbacks?: ManualLink[];
  workInProgress?: boolean;
}) {
  const hasContent = articles.length > 0 || (fallbacks && fallbacks.length > 0);

  return (
    <section className={styles.section} aria-labelledby={`cat-${category}`}>
      <h2 className={styles.sectionTitle} id={`cat-${category}`}>
        {category}
        {workInProgress ? <span className={styles.workInProgress}>в работе</span> : null}
      </h2>
      <p className={styles.abstract}>{intro}</p>

      {hasContent ? (
        <ul className={styles.list}>
          {articles.map((a) => (
            <li key={a.slug} className={styles.item}>
              <Link to={`/methodology/${a.slug}`} className={styles.link}>
                <h3 className={styles.title}>{a.title}</h3>
                {a.abstract ? <p className={styles.abstract}>{a.abstract}</p> : null}
                <div className={styles.meta}>
                  {a.reading_minutes !== undefined && (
                    <span className={styles.metaItem}>
                      <Clock size={11} aria-hidden />
                      {a.reading_minutes} мин
                    </span>
                  )}
                  {a.updated && (
                    <span className={styles.metaItem}>обновлено {a.updated}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
          {fallbacks?.map((f) => (
            <li key={f.href} className={styles.item}>
              <Link to={f.href} className={styles.link}>
                <h3 className={styles.title}>{f.title}</h3>
                {f.abstract ? <p className={styles.abstract}>{f.abstract}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.placeholder}>скоро</p>
      )}
    </section>
  );
}
