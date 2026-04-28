/**
 * SpeciesFilterBadge — пилюля «Показаны леса для: <вид>» в верху карты.
 * Активна когда useLayerVisibility.speciesFilterLabel != null.
 */
import { useLayerVisibility } from "../../store/useLayerVisibility";
import styles from "./SpeciesFilterBadge.module.css";

export function SpeciesFilterBadge() {
  const label = useLayerVisibility((s) => s.speciesFilterLabel);
  if (!label) return null;
  return (
    <div className={styles.badge}>
      Показаны леса для: <strong>{label}</strong>
    </div>
  );
}
