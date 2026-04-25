/**
 * Auth-виджет для Header'а. Три визуальных состояния:
 *
 *   loading        → placeholder (не показываем «Войти», чтобы не мигать)
 *   unauth         → ссылка «Войти»
 *   authenticated  → аватар + display_name, клик → /cabinet; отдельная
 *                    кнопка «Выйти».
 *
 * Namespace'ится через Header.module.css авторского header'а — чтобы
 * не тянуть ещё один css-file для трёх правил, встраиваем inline.
 */

import { Link } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";


export function HeaderAuth() {
  const { status, user, logout } = useAuth();

  if (status === "loading") {
    // Держим место, но не показываем «Войти» — чтобы не было flash
    // unauth-состояния для уже-залогиненного юзера.
    return <span aria-hidden="true" style={{ width: 64 }} />;
  }

  if (status === "unauth") {
    return (
      <Link
        to="/auth"
        style={{
          color: "var(--ink-dim)",
          textDecoration: "none",
          padding: "var(--space-2) var(--space-3)",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--fs-sm)",
          fontWeight: 500,
        }}
      >
        Войти
      </Link>
    );
  }

  // authenticated
  const name = user?.display_name ?? user?.email ?? "Кабинет";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
      <Link
        to="/cabinet"
        aria-label={`Кабинет: ${name}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          textDecoration: "none",
          color: "var(--ink)",
          fontSize: "var(--fs-sm)",
        }}
      >
        {user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            width={24}
            height={24}
            style={{ borderRadius: "50%", border: "1px solid var(--rule)" }}
          />
        ) : (
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "var(--birch)",
            }}
          />
        )}
        <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </Link>
      <button
        type="button"
        onClick={() => void logout()}
        aria-label="Выйти"
        title="Выйти"
        style={{
          background: "transparent",
          border: "none",
          padding: "var(--space-1) var(--space-2)",
          cursor: "pointer",
          color: "var(--ink-dim)",
          fontSize: "var(--fs-xs)",
        }}
      >
        Выйти
      </button>
    </div>
  );
}
