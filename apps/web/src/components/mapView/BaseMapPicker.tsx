/**
 * BaseMapPicker — переключатель базовой подложки. Floating top-left.
 * Подписан на useLayerVisibility.baseMap; setBaseMap триггерит useBaseMap.
 */
import {
  useLayerVisibility,
  type BaseMapMode,
} from "../../store/useLayerVisibility";
import styles from "./BaseMapPicker.module.css";

const OPTIONS: Array<{ id: BaseMapMode; label: string }> = [
  { id: "scheme", label: "Схема" },
  { id: "satellite", label: "Спутник" },
  { id: "hybrid", label: "Гибрид" },
  { id: "osm", label: "OSM" },
];

interface Props {
  /**
   * 'floating' (default) — самостоятельный позиционированный блок (legacy).
   * 'inline' — встраивается внутрь LayerGrid'а, без position/border/shadow.
   */
  variant?: "floating" | "inline";
}

export function BaseMapPicker({ variant = "floating" }: Props = {}) {
  const baseMap = useLayerVisibility((s) => s.baseMap);
  const setBaseMap = useLayerVisibility((s) => s.setBaseMap);

  const wrapClass = variant === "inline" ? styles.inline : styles.wrap;

  return (
    <div className={wrapClass}>
      <div className={styles.label}>Подложка</div>
      <div className={styles.pillWrap} role="group" aria-label="Базовая карта">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`${styles.pill}${baseMap === o.id ? ` ${styles.pillActive}` : ""}`}
            onClick={() => setBaseMap(o.id)}
            aria-pressed={baseMap === o.id}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
