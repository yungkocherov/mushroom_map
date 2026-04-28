/**
 * ShareButton — кнопка «копировать ссылку с координатами».
 * Берёт map ref как prop (MapView держит ref локально, контекст здесь не нужен).
 */
import type { Map } from "maplibre-gl";

import { useMapShare } from "./hooks/useMapShare";
import styles from "./ShareButton.module.css";

interface Props {
  mapRef: React.MutableRefObject<Map | null>;
}

export function ShareButton({ mapRef }: Props) {
  const onShare = useMapShare(mapRef);
  return (
    <button
      type="button"
      className={styles.btn}
      onClick={onShare}
      title="Скопировать ссылку на текущий вид карты"
    >
      Поделиться
    </button>
  );
}
