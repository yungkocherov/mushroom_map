import { Container } from "../components/layout/Container";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./MethodologyPage.module.css";

export function MethodologyPage() {
  usePageTitle("Методология — Geobiom", "Раздел в разработке.");

  return (
    <Container as="article" size="default">
      <p className={styles.eyebrow}>В работе</p>
      <h1 className={styles.h1}>Методология</h1>
      <p className={styles.placeholder}>
        Раздел временно убран. Скоро тут появится новое описание данных и
        моделей, на которых построена карта.
      </p>
    </Container>
  );
}
