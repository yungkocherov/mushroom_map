/**
 * LayerInfoPanel — описания включённых слоёв для левого сайдбара.
 * Показывает только активные (visible[key] === true). Если ничего не
 * включено — компонент возвращает null и не занимает место.
 *
 * Лес — особый случай: текст зависит от forestColorMode (Породы/Бонитет/
 * Возраст), для каждого режима свой title+body. См. getForestDescription.
 */
import { useLayerVisibility, type LayerKey } from "../../store/useLayerVisibility";
import { LAYER_DESCRIPTIONS, getForestDescription } from "../mapView/layerDescriptions";
import styles from "./LayerInfoPanel.module.css";

export function LayerInfoPanel() {
  const visible = useLayerVisibility((s) => s.visible);
  const forestColorMode = useLayerVisibility((s) => s.forestColorMode);

  const active = (Object.keys(visible) as LayerKey[])
    .filter((k) => visible[k])
    .map((k) => {
      if (k === "forest") {
        return { key: k, ...getForestDescription(forestColorMode) };
      }
      return { key: k, ...LAYER_DESCRIPTIONS[k] };
    });

  if (active.length === 0) return null;

  return (
    <section className={styles.panel} aria-label="Что показано на карте">
      <p className={styles.heading}>На карте сейчас</p>
      <ul className={styles.list}>
        {active.map(({ key, title, body }) => (
          <li key={key} className={styles.item}>
            <span className={styles.title}>{title}</span>
            <p className={styles.body}>{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
