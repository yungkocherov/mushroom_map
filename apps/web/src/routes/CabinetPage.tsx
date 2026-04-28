/**
 * /cabinet — placeholder за ProtectedRoute. В Phase 1 достаточно чтобы
 * доказать: авторизация проходит, guard работает, /me отдаёт профиль.
 * Реальное наполнение (spots / trips / settings) — следующие фазы.
 */

import { Link } from "react-router-dom";
import { Container } from "../components/layout/Container";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useAuth } from "../auth/useAuth";
import styles from "./Prose.module.css";


export function CabinetPage() {
  const { user, logout } = useAuth();
  if (!user) return null; // ProtectedRoute уже отфильтровал, but defensively.

  return (
    <Container as="article" size="narrow">
      <h1 className={styles.h1}>Кабинет</h1>
      <p className={styles.lead}>
        Вы вошли как <strong>{user.display_name ?? user.email ?? "без имени"}</strong>.
      </p>

      <Card>
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {user.avatar_url && (
            <img
              src={user.avatar_url}
              alt=""
              width={72}
              height={72}
              style={{ borderRadius: "50%", border: "1px solid var(--rule)" }}
            />
          )}
          <dl
            style={{
              margin: 0,
              display: "grid",
              gridTemplateColumns: "max-content 1fr",
              gap: "var(--space-2) var(--space-4)",
              fontSize: "var(--fs-sm)",
            }}
          >
            <dt style={{ color: "var(--ink-dim)" }}>Провайдер</dt>
            <dd style={{ margin: 0 }}>{user.auth_provider}</dd>
            <dt style={{ color: "var(--ink-dim)" }}>Email</dt>
            <dd style={{ margin: 0 }}>
              {user.email ?? <em style={{ color: "var(--ink-dim)" }}>не получен от провайдера</em>}
            </dd>
          </dl>
          <Button variant="ghost" onClick={() => void logout()}>
            Выйти
          </Button>
        </div>
      </Card>

      <h2 className={styles.h2}>Разделы</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-3)" }}>
        <li>
          <Link to="/spots" style={{ color: "var(--forest)", textDecoration: "none" }}>
            Сохранённые места
          </Link>
          <span style={{ color: "var(--ink-dim)", marginLeft: "var(--space-2)" }}>
            — приватные точки на карте с заметками
          </span>
        </li>
      </ul>

      <p className={styles.p} style={{ color: "var(--ink-dim)", marginTop: "var(--space-5)" }}>
        Журнал поездок и настройки появятся в следующих фазах.
      </p>
    </Container>
  );
}
