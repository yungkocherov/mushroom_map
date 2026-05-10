import { Container } from "../components/layout/Container";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./MethodologyPage.module.css";

/**
 * Calendar — `/calendar`. Phase W5 was a static D1V ribbon с
 * захардкоженными `seasonality.ts`, не подключён к бэкенду. Чтобы
 * не вводить юзера в заблуждение, временно показываем заглушку
 * «в разработке» (как в /methodology hub) — оживляем когда будет
 * `forecast.species_seasonality` или модельная статистика.
 */
export function CalendarPage() {
  usePageTitle("Календарь — Geobiom", "Раздел в разработке.");

  return (
    <Container as="article" size="default">
      <p className={styles.eyebrow}>В работе</p>
      <h1 className={styles.h1}>Календарь</h1>
      <p className={styles.placeholder}>
        Скоро тут появится сезонная лента 12 видов × 12 месяцев с реальной
        статистикой плодоношения и пиками сезона. Пока показываем заглушку,
        чтобы не путать с моделью прогноза.
      </p>
    </Container>
  );
}
