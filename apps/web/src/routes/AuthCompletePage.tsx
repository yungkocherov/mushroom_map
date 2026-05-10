/**
 * /auth/complete — куда callback редиректит после установки refresh-cookie.
 * Наша задача:
 *   1. Вызвать authRefresh() ещё раз в контексте React (провайдер это
 *      уже делает при mount'е — пользуемся его состоянием).
 *   2. Когда `status=authenticated` — navigate('/cabinet') или на ?next=…
 *   3. Если после hydrate всё ещё `unauth` — показать fallback с ссылкой
 *      на /auth/error (что-то пошло не так на последнем шаге).
 */

import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Container } from "../components/layout/Container";
import { useAuth } from "../auth/useAuth";
import { safeNext } from "../auth/safeNext";
import { consumePostAuthRedirect } from "../lib/onboardingStorage";
import styles from "./Prose.module.css";


export function AuthCompletePage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ?next= is the conventional path; if absent, fall back to the
  // one-shot localStorage flag set by /onboarding step 4 «Войти», which
  // the backend OAuth chain doesn't get to preserve.
  const stored = useMemo(() => consumePostAuthRedirect(), []);
  const next = safeNext(searchParams.get("next") ?? stored, "/cabinet");

  useEffect(() => {
    if (status === "authenticated") {
      navigate(next, { replace: true });
    } else if (status === "unauth") {
      // hydrate после установки cookie должен был сработать. Если нет —
      // что-то сломалось (server down, Secure cookie в dev на http, ...).
      navigate("/auth/error?reason=hydrate_failed", { replace: true });
    }
  }, [status, next, navigate]);

  return (
    <Container as="article" size="narrow">
      <h1 className={styles.h1}>Входим…</h1>
      <p className={styles.lead} style={{ color: "var(--ink-dim)" }}>
        Завершаем установку сессии.
      </p>
    </Container>
  );
}
