import { NavLink, Link } from "react-router-dom";
import styles from "./Header.module.css";

const NAV_ITEMS = [
  { to: "/map",         label: "Карта" },
  { to: "/forecast",    label: "Прогноз" },
  { to: "/species",     label: "Виды" },
  { to: "/methodology", label: "Методология" },
  { to: "/guide",       label: "Гайды" },
  { to: "/about",       label: "О проекте" },
];

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand} aria-label="Грибная карта — на главную">
          <Logo />
          <span className={styles.brandText}>
            <span className={styles.brandTitle}>Грибная карта</span>
            <span className={styles.brandSub}>Ленинградская область</span>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Основная навигация">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.linkActive : ""}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg
      className={styles.logo}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden="true"
    >
      <path d="M16 6 C9 6, 4 12, 4 16.5 L28 16.5 C28 12, 23 6, 16 6 Z" fill="var(--forest)" />
      <rect x="12" y="16.5" width="8" height="9" rx="2" fill="var(--paper-rise)" stroke="var(--rule)" strokeWidth="0.5" />
    </svg>
  );
}
