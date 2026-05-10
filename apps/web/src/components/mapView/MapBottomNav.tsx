/**
 * MapBottomNav — floating bottom-center навигация для full-bleed
 * карты. Дублирует Header'овые ссылки (Карта/Виды/Споты/Календарь/
 * Методология) поскольку Header на /map* скрыт.
 */

import { NavLink } from "react-router-dom";
import styles from "./MapBottomNav.module.css";

const NAV_ITEMS = [
  { to: "/map",         label: "Карта" },
  { to: "/species",     label: "Виды" },
  { to: "/spots",       label: "Споты" },
  { to: "/calendar",    label: "Календарь" },
  { to: "/methodology", label: "Методология" },
] as const;

export function MapBottomNav() {
  return (
    <nav
      className={`${styles.nav} card-interactive`}
      aria-label="Основная навигация"
    >
      {NAV_ITEMS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/map"}
          className={({ isActive }) =>
            `${styles.link} link-underline${isActive ? ` ${styles.linkActive}` : ""}`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
