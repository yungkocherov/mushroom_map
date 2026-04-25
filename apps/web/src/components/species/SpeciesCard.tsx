import { Link } from "react-router-dom";
import type { SpeciesListItem } from "@mushroom-map/types";
import { EdibilityChip } from "./EdibilityChip";
import { SeasonBar } from "./SeasonBar";
import { FOREST_LABEL } from "./labels";
import styles from "./SpeciesCard.module.css";


interface Props {
  item: SpeciesListItem;
}


export function SpeciesCard({ item }: Props) {
  return (
    <Link to={`/species/${item.slug}`} className={styles.card}>
      <div className={styles.photoWrap}>
        {item.photo_url ? (
          <img
            src={item.photo_url}
            alt=""
            loading="lazy"
            className={styles.photo}
          />
        ) : (
          <PhotoPlaceholder />
        )}
        {item.red_book && (
          <span className={styles.redBookBadge} title="Включён в Красную книгу">
            КК
          </span>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h3 className={styles.name}>{item.name_ru}</h3>
          <EdibilityChip edibility={item.edibility} compact />
        </div>

        {item.name_lat && <p className={styles.nameLat}>{item.name_lat}</p>}

        <SeasonBar months={item.season_months} compact />

        {item.forest_types.length > 0 && (
          <ul className={styles.forestChips} aria-label="Тип леса">
            {item.forest_types.map((slug) => (
              <li key={slug} className={styles.forestChip}>
                {FOREST_LABEL[slug] ?? slug}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}


function PhotoPlaceholder() {
  // Пока photo_url'ы пустые, рисуем мягкий плейсхолдер вместо пустого
  // квадрата. Стилизация под «бумажная текстура»: иконка гриба SVG.
  return (
    <div className={styles.photoPlaceholder} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={36} height={36} fill="var(--ink-faint)">
        <path d="M32 8 C18 8, 8 20, 8 30 L56 30 C56 20, 46 8, 32 8 Z" />
        <rect x="24" y="30" width="16" height="22" rx="4" fill="var(--ink-faint)" />
      </svg>
    </div>
  );
}
