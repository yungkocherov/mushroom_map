import { NavLink, Link } from "react-router-dom";
import { ThemeToggle } from "../ui/ThemeToggle";
import { HeaderAuth } from "./HeaderAuth";
import styles from "./Header.module.css";

// 4 IA-раздела по spec'у redesign-2026-04. Прежние «Прогноз» / «Гайды»
// / «О проекте» теперь 301'ы → /, /methodology, /methodology/about.
const NAV_ITEMS = [
  { to: "/",            label: "Карта", end: true },
  { to: "/species",     label: "Виды" },
  { to: "/spots",       label: "Споты" },
  { to: "/methodology", label: "Методология" },
];

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand} aria-label="Geobiom — на главную">
          <Logo />
          <span className={styles.brandText}>
            <span className={styles.brandTitle}>Geobiom</span>
            <span className={styles.brandSub}>лес ленобласти</span>
          </span>
        </Link>
        <div className={styles.navWrap}>
          <nav className={styles.nav} aria-label="Основная навигация">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `${styles.link} ${isActive ? styles.linkActive : ""}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <HeaderAuth />
          <ThemeToggle />
        </div>
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
