/**
 * /stats — страница «Статистика» с вкладочной структурой (Phase 3+).
 * Заголовок страницы + freshness из fetchStatsMeta + StatsTabs.
 */
import { useEffect, useState } from "react";
import {
  fetchStatsMeta,
  type StatsMeta,
} from "@mushroom-map/api-client";
import { Container } from "../../components/layout/Container";
import { usePageTitle } from "../../lib/usePageTitle";
import { StatsTabs } from "./StatsTabs";
import styles from "./StatsHubPage.module.css";
import prose from "../Prose.module.css";

export function StatsHubPage() {
  usePageTitle("Статистика — Geobiom", "Интерактивная статистика по лесам, грибным находкам, погоде и AI-классификации Ленобласти.");

  const [meta, setMeta] = useState<StatsMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStatsMeta()
      .then((m) => { if (!cancelled) setMeta(m); })
      .catch(() => { if (!cancelled) setError("Не удалось загрузить статистику"); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Container as="section" size="wide">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Данные проекта</p>
        <h1 className={prose.h1}>Статистика</h1>
        <p className={prose.lead}>
          Лес, грибные находки, погода и AI-классификация Ленобласти — по цифрам.
        </p>
        {error && <p className={prose.p} style={{ color: "var(--danger)" }}>{error}</p>}
        {meta && (
          <p className={styles.freshness}>
            {meta.generated_at
              ? `данные на ${new Date(meta.generated_at).toLocaleDateString("ru-RU")}`
              : "snapshot ещё не сформирован"}
          </p>
        )}
      </header>

      <StatsTabs />
    </Container>
  );
}
