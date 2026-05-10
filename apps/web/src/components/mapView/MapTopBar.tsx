/**
 * MapTopBar — floating top bar для full-bleed карты.
 * Source: docs/redesign-2026-05/claude-design/src/d1v2.jsx:365-378
 *
 * 3 секции в ряд: Wordmark (clickable → /), search trigger
 * (открывает Spotlight через synthetic ⌘K event), user chip
 * (HeaderAuth re-styled).
 */

import { Link } from "react-router-dom";
import { Wordmark } from "../Wordmark";
import { HeaderAuth } from "../layout/HeaderAuth";
import { useAuth } from "../../auth/useAuth";
import styles from "./MapTopBar.module.css";

function dispatchSpotlightOpen() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      metaKey: true,
      ctrlKey: true,
    }),
  );
}

export function MapTopBar() {
  const { status } = useAuth();

  return (
    <div className={styles.bar}>
      <Link
        to="/"
        className={`${styles.brand} card-interactive`}
        aria-label="Geobiom — на главную"
      >
        <Wordmark size="sm" />
      </Link>

      <button
        type="button"
        onClick={dispatchSpotlightOpen}
        className={`${styles.search} card-interactive`}
        aria-label="Открыть поиск (⌘K)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.searchIcon}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className={styles.searchPlaceholder}>
          Найти гриб, район или место…
        </span>
        <span className={styles.searchKbd}>⌘ K</span>
      </button>

      {status === "authenticated" && (
        <Link
          to="/spots"
          className={`${styles.spots} card-interactive`}
          aria-label="Сохранённые точки"
          title="Сохранённые точки"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={styles.spotsIcon}
            aria-hidden="true"
          >
            <path d="m12 2 3 7 7 .7-5.3 4.6 1.6 7L12 17.7 5.7 21.3 7.3 14.3 2 9.7 9 9z" />
          </svg>
          <span className={styles.spotsLabel}>Точки</span>
        </Link>
      )}

      <div className={`${styles.user} card-interactive`}>
        <HeaderAuth />
      </div>
    </div>
  );
}
