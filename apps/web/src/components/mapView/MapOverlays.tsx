/**
 * MapOverlays — все floating-тосты карты:
 *   - shareToast: «Ссылка скопирована» (2-сек pulse, тёмный)
 *   - errorMsg: красный, 5 сек
 *   - vpnToast: «спутник может не загружаться при VPN», 3.5 сек + 0.8 fade
 *   - forestHint: «нажмите на карту для информации», 4 сек + 0.8 fade
 *
 * Подписан на store, рендерит то что активно. Lifecycle тостов остался
 * в хуках/MapView, которые их триггерят — здесь только presentation.
 */
import { useLayerVisibility } from "../../store/useLayerVisibility";
import styles from "./MapOverlays.module.css";

export function MapOverlays() {
  const errorMsg = useLayerVisibility((s) => s.errorMsg);
  const vpnToast = useLayerVisibility((s) => s.vpnToast);
  const forestHint = useLayerVisibility((s) => s.forestHint);
  const shareToast = useLayerVisibility((s) => s.shareToast);

  return (
    <>
      {shareToast && (
        <div className={`${styles.toast} ${styles.toastShare}`}>
          Ссылка скопирована
        </div>
      )}
      {errorMsg && (
        <div className={`${styles.toast} ${styles.toastError}`}>{errorMsg}</div>
      )}
      {vpnToast !== "hidden" && (
        <div className={`${styles.vpnToast}${vpnToast === "fading" ? ` ${styles.fading}` : ""}`}>
          ℹ️ Спутниковые снимки могут не загружаться при активном VPN-соединении
        </div>
      )}
      {forestHint !== "hidden" && (
        <div className={`${styles.forestHint}${forestHint === "fading" ? ` ${styles.fading}` : ""}`}>
          Нажмите на любую точку карты, чтобы увидеть подробную информацию
        </div>
      )}
    </>
  );
}
