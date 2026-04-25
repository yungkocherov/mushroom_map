/**
 * /auth/error — landing для всех провалов OAuth-flow.
 * Reason пробрасывается через query ?reason=<code> из callback'а или
 * из AuthCompletePage. Список reason'ов — контракт с backend:
 *
 *   provider_error  — Yandex вернул ошибку при обмене кода или userinfo
 *   missing_params  — callback пришёл без code/state
 *   bad_state       — state подписан не нашим секретом или просрочен
 *   access_denied   — юзер нажал «отказать» на странице Yandex
 *   hydrate_failed  — cookie выставлена, но /refresh не сработал
 *
 * Неизвестные коды просто показываются как есть, без паники.
 */

import { Link, useSearchParams } from "react-router-dom";
import { Container } from "../components/layout/Container";
import { Card } from "../components/ui/Card";
import styles from "./Prose.module.css";


const REASON_LABEL: Record<string, string> = {
  provider_error: "Яндекс не смог подтвердить вход. Попробуйте ещё раз.",
  missing_params: "Вход вернулся без нужных параметров. Попробуйте ещё раз.",
  bad_state:      "Сессия входа устарела (обычно — больше 10 минут простоя). Начните заново.",
  access_denied:  "Вход отменён на стороне Яндекса.",
  hydrate_failed: "Не удалось подтянуть сессию после входа. Возможно, cookie заблокированы.",
};


export function AuthErrorPage() {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get("reason") ?? "unknown";
  const label = REASON_LABEL[reason] ?? `Произошла ошибка входа (${reason}).`;

  return (
    <Container as="article" size="narrow">
      <h1 className={styles.h1}>Не вошли</h1>
      <p className={styles.lead}>{label}</p>
      <Card>
        <p className={styles.p} style={{ margin: 0 }}>
          <Link to="/auth">← Вернуться к входу</Link>
        </p>
      </Card>
    </Container>
  );
}
