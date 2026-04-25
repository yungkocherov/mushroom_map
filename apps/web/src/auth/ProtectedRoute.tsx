/**
 * Guard для защищённых маршрутов:
 *
 *     <ProtectedRoute><CabinetPage /></ProtectedRoute>
 *
 * Поведение по статусу:
 *   - loading       — короткий skeleton (auth hydrate обычно < 300 мс)
 *   - unauth        — Navigate на /auth?next=<current-path>
 *   - authenticated — рендерим children
 *
 * Не HOC в классическом (hoc(Component)) смысле — wrapping-компонент,
 * это работает лучше с react-router v6, где элемент декларируется в
 * конфиге маршрута. HOC-обёртка легко добавится сверху если понадобится.
 */

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";


interface Props {
  children: ReactNode;
  /** Куда редиректить неавторизованного юзера. По умолчанию /auth. */
  loginPath?: string;
}


export function ProtectedRoute({ children, loginPath = "/auth" }: Props) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <AuthLoadingStub />;
  }
  if (status === "unauth") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${loginPath}?next=${next}`} replace />;
  }
  return <>{children}</>;
}


function AuthLoadingStub() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "40vh",
        display: "grid",
        placeItems: "center",
        color: "var(--ink-dim)",
        fontSize: "var(--fs-sm)",
      }}
    >
      Проверяем сессию…
    </div>
  );
}
