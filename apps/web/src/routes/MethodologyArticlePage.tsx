import { useParams, Link, Navigate } from "react-router-dom";
import { ArrowLeft, Clock } from "lucide-react";
import { Container } from "../components/layout/Container";
import { findArticle } from "../content/methodology";
import styles from "./MethodologyArticlePage.module.css";

export function MethodologyArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? findArticle(slug) : undefined;

  if (!article) {
    return <Navigate to="/methodology" replace />;
  }

  const Body = article.Component;

  return (
    <Container as="article" size="narrow">
      <Link to="/methodology" className={styles.back}>
        <ArrowLeft size={14} aria-hidden />
        Все статьи методологии
      </Link>

      <header className={styles.header}>
        <div className={styles.meta}>
          {article.reading_minutes !== undefined && (
            <span className={styles.metaItem}>
              <Clock size={12} aria-hidden />
              {article.reading_minutes} мин
            </span>
          )}
          {article.updated && (
            <span className={styles.metaItem}>обновлено {article.updated}</span>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <Body />
      </div>
    </Container>
  );
}
