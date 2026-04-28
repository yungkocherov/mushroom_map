import { Container } from "../components/layout/Container";
import { Button } from "../components/ui/Button";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  usePageTitle(
    "Страница не найдена — Geobiom",
    "Запрошенная страница не существует. Карта и остальные разделы Geobiom доступны.",
  );
  return (
    <Container as="article" size="narrow">
      <div className={styles.wrap}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>Страница не найдена</h1>
        <p className={styles.lead}>
          Возможно, ссылка устарела или вы ошиблись в адресе. Ничего
          страшного — карта и остальные разделы на месте.
        </p>
        <div className={styles.cta}>
          <Button as="link" to="/" variant="primary">
            На главную
          </Button>
          <Button as="link" to="/map" variant="ghost">
            Открыть карту
          </Button>
        </div>
      </div>
    </Container>
  );
}
