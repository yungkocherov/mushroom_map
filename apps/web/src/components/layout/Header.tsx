import { NavLink, Link } from "react-router-dom";
import { HeaderAuth } from "./HeaderAuth";
import { Wordmark } from "../Wordmark";
import styles from "./Header.module.css";

// 5 IA-разделов после Phase W2 (redesign-2026-05). Лендинг — на `/`,
// карта переехала на `/map`. Добавлен «Календарь».
//
// V4 feedback: «Споты»→«Точки»→«Мои места».
// V4.5: «Карта» получила флаг `primary=true` — это main entry-point,
// она выделена pill-стилем (forest border + чуть-чуть прозрачный fill)
// даже когда не active. Когда active — full filled.
const NAV_ITEMS: Array<{ to: string; label: string; primary?: boolean }> = [
  { to: "/map",         label: "Карта", primary: true },
  { to: "/species",     label: "Виды" },
  { to: "/spots",       label: "Мои места" },
  { to: "/calendar",    label: "Календарь" },
  { to: "/methodology", label: "Методология" },
  { to: "/stats",       label: "Статистика" },
];

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand} aria-label="Geobiom — на главную">
          <Wordmark size="md" />
        </Link>
        <div className={styles.spacer} />
        <nav className={styles.nav} aria-label="Основная навигация">
          {NAV_ITEMS.map(({ to, label, primary }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${styles.link}${primary ? ` ${styles.linkPrimary}` : ""}${isActive ? ` ${styles.linkActive}` : ""}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.spacer} />
        <div className={styles.right}>
          <HeaderAuth />
        </div>
      </div>
    </header>
  );
}
