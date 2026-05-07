import { NavLink, Link } from "react-router-dom";
import { HeaderAuth } from "./HeaderAuth";
import styles from "./Header.module.css";

// 4 IA-раздела по spec'у redesign-2026-04. Прежние «Прогноз» / «Гайды»
// / «О проекте» теперь 301'ы → /, /methodology, /methodology/about.
const NAV_ITEMS = [
  { to: "/",            label: "Карта", end: true },
  { to: "/species",     label: "Виды" },
  { to: "/spots",       label: "Сохранённые места" },
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
        <div className={styles.spacer} />
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
        <div className={styles.spacer} />
        <div className={styles.right}>
          <HeaderAuth />
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <img
      className={styles.logo}
      src="/icon-192.png"
      alt=""
      width={32}
      height={32}
      aria-hidden="true"
    />
  );
}
