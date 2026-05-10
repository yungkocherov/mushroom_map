import { NavLink, Link } from "react-router-dom";
import { HeaderAuth } from "./HeaderAuth";
import { Wordmark } from "../Wordmark";
import styles from "./Header.module.css";

// 5 IA-разделов после Phase W2 (redesign-2026-05). Лендинг — на `/`,
// карта переехала на `/map`. Добавлен «Календарь».
const NAV_ITEMS = [
  { to: "/map",         label: "Карта" },
  { to: "/species",     label: "Виды" },
  { to: "/spots",       label: "Точки" },
  { to: "/calendar",    label: "Календарь" },
  { to: "/methodology", label: "Методология" },
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
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${styles.link} link-underline${isActive ? ` ${styles.linkActive}` : ""}`
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
