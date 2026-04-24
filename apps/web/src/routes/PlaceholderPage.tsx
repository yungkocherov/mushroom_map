import { Link } from "react-router-dom";
import { Container } from "../components/layout/Container";
import { Card } from "../components/ui/Card";
import styles from "./Prose.module.css";

interface Props {
  title: string;
  description: string;
}

/**
 * Заглушка для разделов, которые ещё не наполнены. Один общий
 * компонент вместо копипасты — наполняется по мере появления контента
 * в Phase 1+.
 */
export function PlaceholderPage({ title, description }: Props) {
  return (
    <Container as="article" size="narrow">
      <h1 className={styles.h1}>{title}</h1>
      <p className={styles.lead}>{description}</p>
      <Card>
        <p className={styles.p} style={{ margin: 0, color: "var(--ink-dim)" }}>
          Раздел в работе. Пока что — пользуйтесь{" "}
          <Link to="/map">картой</Link>, она уже содержит все лесные
          данные Ленобласти.
        </p>
      </Card>
    </Container>
  );
}
