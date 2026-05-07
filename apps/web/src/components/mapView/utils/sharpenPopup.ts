/**
 * Chrome на Windows на любом элементе с CSS-`transform` принудительно
 * растеризует текст в композитном GPU-слое с grayscale AA (без ClearType).
 * MapLibre Popup позиционируется именно через `transform: translate(...)` —
 * отсюда видимый блёр текста против Yandex Browser, который рендерит
 * композитный слой с ClearType (subpixel AA).
 *
 * Решение: после каждого MapLibre-обновления попапа парсим его transform
 * (формат `translate(-50%,-100%) translate(Xpx,Ypx)`), вычисляем итоговые
 * top/left в integer-px и перезаписываем стиль: `transform: none` +
 * `top/left`. Без transform композитный слой не создаётся → Chrome
 * возвращает ClearType, текст становится чётким как у Yandex.
 *
 * Слушаем style-атрибут MutationObserver'ом, чтобы реагировать на
 * MapLibre `_update` (срабатывает на каждый `move` карты + при setHTML).
 * Флаг `suppress` защищает от рекурсивного триггера на нашу же запись.
 */
import type { Popup } from "maplibre-gl";

const TR_RE = /translate\(\s*(-?[\d.]+)%\s*,\s*(-?[\d.]+)%\s*\)\s*translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/;

export function sharpenPopup(popup: Popup): void {
  const el = popup.getElement();
  if (!el) return;

  let suppress = false;

  const apply = () => {
    if (suppress) return;
    const tr = el.style.transform;
    if (!tr || tr === "none") return;
    const m = tr.match(TR_RE);
    if (!m) return;

    const ax = parseFloat(m[1]) / 100;
    const ay = parseFloat(m[2]) / 100;
    const x = parseFloat(m[3]);
    const y = parseFloat(m[4]);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w === 0 || h === 0) return;

    const left = Math.round(x + ax * w);
    const top = Math.round(y + ay * h);

    suppress = true;
    el.style.transform = "none";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    suppress = false;
  };

  apply();

  const obs = new MutationObserver(apply);
  obs.observe(el, { attributes: true, attributeFilter: ["style"] });

  // MapLibre Popup поддерживает 'close' event — отключаем observer чтобы
  // не держать ссылку на disconnected DOM.
  popup.on("close", () => obs.disconnect());
}
