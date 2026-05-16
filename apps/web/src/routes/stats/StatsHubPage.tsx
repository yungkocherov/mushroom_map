/**
 * /stats — хаб раздела «Статистика». Phase 1: скелет на page-shell,
 * тянет /api/stats/meta чтобы подтвердить, что backbone подключён.
 * Виджеты (KPI, сезонный пульс, лес в цифрах) — Phase 2.
 */
import { useEffect, useState } from "react";
import { fetchStatsMeta, type StatsMeta } from "@mushroom-map/api-client";
import { Container } from "../../components/layout/Container";
import { usePageTitle } from "../../lib/usePageTitle";
import styles from "./StatsHubPage.module.css";
import prose from "../Prose.module.css";

export function StatsHubPage() {
  usePageTitle(
    "Статистика — Geobiom",
    "Интерактивная статистика по лесам, грибным находкам и данным проекта Geobiom.",
  );

  const [meta, setMeta] = useState<StatsMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStatsMeta()
      .then((m) => !cancelled && setMeta(m))
      .catch((e) => !cancelled && setError(e.message ?? "Ошибка загрузки"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Container as="section" size="wide">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Данные проекта</p>
        <h1 className={prose.h1}>Статистика</h1>
        <p className={prose.lead}>
          Лес, грибные находки, погода и AI-классификация Ленобласти —
          интерактивно. Раздел наполняется; виджеты и профили районов и
          видов появятся в следующих итерациях.
        </p>
        {error && (
          <p className={prose.p} style={{ color: "var(--danger)" }}>
            Не удалось загрузить метаданные: {error}
          </p>
        )}
        {meta && (
          <p className={styles.freshness}>
            {meta.generated_at
              ? `данные на ${new Date(meta.generated_at).toLocaleDateString("ru-RU")}`
              : "snapshot ещё не сформирован"}
          </p>
        )}
      </header>
    </Container>
  );
}
