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
          <ThemeToggle />
          <HeaderAuth />
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
      <path d="M16 5 C8 5, 3 11, 3 15.5 C3 16.6, 3.8 17.5, 5 17.5 L27 17.5 C28.2 17.5, 29 16.6, 29 15.5 C29 11, 24 5, 16 5 Z" fill="var(--forest-deep)" />
      <path d="M9 13 C9.5 12, 10.5 11.5, 11.5 12 M14 10.5 C14.5 10, 15.5 9.8, 16.2 10.2 M19 11 C19.8 10.5, 20.7 10.5, 21.3 11" stroke="var(--paper-rise)" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55" />
      <path d="M11.5 17.5 L12.5 26 C12.5 27.1, 13.4 28, 14.5 28 L17.5 28 C18.6 28, 19.5 27.1, 19.5 26 L20.5 17.5 Z" fill="var(--paper)" stroke="var(--forest-deep)" strokeWidth="0.8" />
    </svg>
  );
}
