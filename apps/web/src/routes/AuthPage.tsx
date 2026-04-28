/**
 * /auth — страница входа. Содержит одну кнопку «Войти через Яндекс»,
 * которая делает top-level navigation на /api/auth/yandex/login.
 *
 * Поддерживает ?next=<path> — после успешного логина AuthCompletePage
 * редиректит юзера назад туда, откуда пришёл (см. ProtectedRoute).
 *
 * Если юзер уже залогинен — сразу редиректим на `next` (или на главную).
 */

import { useEffect } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Container } from "../components/layout/Container";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useAuth } from "../auth/useAuth";
import { safeNext } from "../auth/safeNext";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./Prose.module.css";


export function AuthPage() {
  usePageTitle(
    "Вход — Geobiom",
    "Войти в Geobiom через Яндекс ID, чтобы сохранять личные споты в кабинете.",
  );
  const { status, login } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(searchParams.get("next"), "/");

  useEffect(() => {
    if (status === "authenticated") {
      navigate(next, { replace: true });
    }
  }, [status, next, navigate]);

  if (status === "loading") {
    return (
      <Container as="article" size="narrow">
        <p className={styles.p} style={{ color: "var(--ink-dim)" }}>
          Проверяем сессию…
        </p>
      </Container>
    );
  }

  if (status === "authenticated") {
    return <Navigate to={next} replace />;
  }

  return (
    <Container as="article" size="narrow">
      <h1 className={styles.h1}>Вход</h1>
      <p className={styles.lead}>
        Пока доступен вход через Яндекс ID. Не требуется пароль; сайт получает
        только имя, email и аватар — ровно столько, чтобы в кабинете показать
        «вошёл как вы».
      </p>

      <Card>
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <Button onClick={login}>Войти через Яндекс</Button>
          <p
            className={styles.p}
            style={{
              margin: 0,
              fontSize: "var(--fs-xs)",
              color: "var(--ink-dim)",
            }}
          >
            Нажимая кнопку, вы соглашаетесь с{" "}
            <a href="/legal/terms">условиями использования</a> и{" "}
            <a href="/legal/privacy">политикой приватности</a>.
          </p>
        </div>
      </Card>

      <p
        className={styles.p}
        style={{ marginTop: "var(--space-5)", color: "var(--ink-dim)" }}
      >
        Другие провайдеры (Google, VK) появятся по мере запросов.
      </p>
    </Container>
  );
}
