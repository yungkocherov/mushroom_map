/**
 * MapTopBar — floating top bar для full-bleed карты.
 *
 * V4.2 (redesign-2026-05-11): кнопка-trigger Spotlight'а заменена на
 * InlineSearch — input напрямую в баре + dropdown под ним. Юзер
 * перестаёт видеть отдельный modal окно при каждом клике.
 *
 * 3 секции в ряд: Wordmark (clickable → /), InlineSearch (с ⌘K hotkey),
 * user chip (HeaderAuth re-styled).
 */

import { Link } from "react-router-dom";
import { Wordmark } from "../Wordmark";
import { HeaderAuth } from "../layout/HeaderAuth";
import { useAuth } from "../../auth/useAuth";
import { InlineSearch } from "./InlineSearch";
import styles from "./MapTopBar.module.css";

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

      <InlineSearch />

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
          <span className={styles.spotsLabel}>Мои места</span>
        </Link>
      )}

      <div className={`${styles.user} card-interactive`}>
        <HeaderAuth />
      </div>
    </div>
  );
}
