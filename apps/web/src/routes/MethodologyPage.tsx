import { Link } from "react-router-dom";
import { Container } from "../components/layout/Container";
import { Stats } from "../components/mdx";
import {
  articles,
  type MethodologyCategory,
} from "../content/methodology";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./MethodologyPage.module.css";

/**
 * /methodology хаб — single flat grid из всех статей с category-badge.
 * Намеренно минимум текста: заголовок + Stats-strip + сетка карточек
 * (badge + title). Подробности — внутри статьи. Категория «Юридическое»
 * пока не MDX, поэтому добавляется вручную как fallback'и.
 */

interface ManualLink {
  href: string;
  title: string;
  category: MethodologyCategory;
}

const LEGAL_FALLBACKS: ManualLink[] = [
  { href: "/legal/privacy", title: "Политика конфиденциальности", category: "Юридическое" },
  { href: "/legal/terms", title: "Условия использования", category: "Юридическое" },
];

const CATEGORY_ORDER: MethodologyCategory[] = [
  "Источники данных",
  "Модель прогноза",
  "О проекте",
  "Юридическое",
];

export function MethodologyPage() {
  usePageTitle(
    "Методология — Geobiom",
    "Откуда берутся данные карты Geobiom: лесные выделы Рослесхоза, рельеф Copernicus, почвы Докучаевского, VK-наблюдения.",
  );

  const items: Array<{ href: string; title: string; category: MethodologyCategory }> = [
    ...articles.map((a) => ({
      href: `/methodology/${a.slug}`,
      title: a.title,
      category: a.category,
    })),
    ...LEGAL_FALLBACKS,
  ];
  items.sort((a, b) => {
    const aIdx = CATEGORY_ORDER.indexOf(a.category);
    const bIdx = CATEGORY_ORDER.indexOf(b.category);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return 0;
  });

  return (
    <Container as="article" size="default">
      <p className={styles.eyebrow}>Откуда мы это знаем</p>
      <h1 className={styles.h1}>Методология</h1>

      <Stats
        stats={[
          { number: "3", label: "источника данных", hint: "ФГИС ЛК · OSM · Copernicus" },
          { number: "2,17M", label: "лесных полигонов", hint: "вся ЛО" },
          { number: "24", label: "вида грибов", hint: "справочник" },
          { number: "69k", label: "VK-постов проанализировано" },
        ]}
      />

      <ul className={styles.cards}>
        {items.map((item) => (
          <li key={item.href} className={styles.cardItem}>
            <Link to={item.href} className={styles.card}>
              <span className={styles.badge}>{item.category}</span>
              <h2 className={styles.cardTitle}>{item.title}</h2>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
