/**
 * Singleton-ref на активную MapLibre-инстанцию.
 *
 * Нужен для onboarding-хинтов (V8): они должны вызывать map.flyTo и
 * map.project(lat, lon) для якоря рукописной стрелки на конкретный
 * выдел. Прокидывать map prop через 5 уровней React-дерева неудобно
 * и не reactive (Zustand-store был бы overkill для read-only ссылки).
 *
 * Жизненный цикл:
 *   - MapView setMapInstance(m) в useMapInstance.onReady
 *   - MapView setMapInstance(null) на unmount
 *
 * Subscribers (`subscribeMap`) получают вызов при каждом set'е, что
 * полезно если хинт смонтировался ДО готовности карты — он подпишется
 * и среагирует когда инстанция появится.
 */
import type { Map } from "maplibre-gl";

let instance: Map | null = null;
const listeners = new Set<(m: Map | null) => void>();

export function setMapInstance(m: Map | null): void {
  instance = m;
  // Debug-hook: чтобы можно было проверить наличие в console.
  if (typeof window !== "undefined") {
    (window as unknown as { __geobiomMap: Map | null }).__geobiomMap = m;
  }
  listeners.forEach((cb) => cb(m));
}

export function getMapInstance(): Map | null {
  return instance;
}

export function subscribeMap(cb: (m: Map | null) => void): () => void {
  listeners.add(cb);
  // Сразу передаём текущее состояние подписчику.
  cb(instance);
  return () => {
    listeners.delete(cb);
  };
}
