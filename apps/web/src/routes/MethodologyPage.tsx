import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { Container } from "../components/layout/Container";
import { articles } from "../content/methodology";
import styles from "./MethodologyPage.module.css";

/**
 * Methodology hub. Lists every MDX article in content/methodology with
 * abstract + reading time. Future addition: annotated SVG data-flow
 * diagram (sources -> pipelines -> site). Deferred until we have 5+
 * articles and the diagram has enough to say.
 */
export function MethodologyPage() {
  return (
    <Container as="article" size="narrow">
      <h1 className={styles.h1}>Методология</h1>
      <p className={styles.lead}>
        Каждый слой карты собирается из открытых источников, проходит
        через документированный пайплайн и хранится с указанием версии и
        времени обновления. Ниже — по одной статье на каждый слой, чтобы
        можно было сверить ожидания от данных с их фактическими
        ограничениями.
      </p>

      <ul className={styles.list}>
        {articles.map((article) => (
          <li key={article.slug} className={styles.item}>
            <Link to={`/methodology/${article.slug}`} className={styles.link}>
              <h2 className={styles.title}>{article.title}</h2>
              {article.abstract && (
                <p className={styles.abstract}>{article.abstract}</p>
              )}
              <div className={styles.meta}>
                {article.reading_minutes !== undefined && (
                  <span className={styles.metaItem}>
                    <Clock size={12} aria-hidden />
                    {article.reading_minutes} мин
                  </span>
                )}
                {article.updated && (
                  <span className={styles.metaItem}>
                    обновлено {article.updated}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
