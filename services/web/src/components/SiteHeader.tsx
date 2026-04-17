/**
 * Шапка сайта — видна на всех страницах кроме /map.
 *
 * Специально без лишних декораций: логотип + минимальная навигация.
 * Дизайн-система с Fraunces/Inter/бумажной текстурой придёт в Фазе 2;
 * сейчас — простой, функциональный, читаемый.
 */
import { NavLink, Link } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/map",           label: "Карта" },
  { to: "/species",       label: "Виды" },
  { to: "/guide",         label: "Гайды" },
  { to: "/methodology",   label: "Методология" },
  { to: "/about",         label: "Об авторе" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__logo">
          <span className="site-header__logo-mark" aria-hidden>🍄</span>
          <span>mushroom-map</span>
        </Link>
        <nav className="site-header__nav" aria-label="Основная навигация">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                "site-header__link" + (isActive ? " site-header__link--active" : "")
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
