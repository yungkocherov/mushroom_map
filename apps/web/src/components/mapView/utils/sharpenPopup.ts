/**
 * Chrome на Windows на любом элементе с CSS-`transform` принудительно
 * растеризует текст в композитном GPU-слое с grayscale AA (без ClearType).
 * MapLibre Popup позиционируется именно через `transform: translate(...)` —
 * отсюда видимый блёр текста против Yandex Browser, который рендерит
 * композитный слой с ClearType (subpixel AA).
 *
 * Решение: после каждого MapLibre-обновления попапа парсим его transform
 * (формат `translate(<anchor>) translate(Xpx,Ypx)`, где <anchor>
 * комбинирует %-доли и/или bare-нули в зависимости от стороны),
 * вычисляем итоговые top/left в integer-px и перезаписываем стиль:
 * `transform: none` + `top/left`. Без transform композитный слой не
 * создаётся → Chrome возвращает ClearType, текст становится чётким
 * как у Yandex.
 *
 * Слушаем style-атрибут MutationObserver'ом, чтобы реагировать на
 * MapLibre `_update` (срабатывает на каждый `move` карты + при setHTML).
 * Флаг `suppress` защищает от рекурсивного триггера на нашу же запись.
 */
import type { Popup } from "maplibre-gl";

// MapLibre выставляет popup-transform в виде:
//   translate(<num>%|<num>, <num>%|<num>) translate(<x>px,<y>px)
// Anchor-translate'ы из maplibre-gl/src/ui/popup.ts:
//   bottom        = (-50%, -100%)   bottom-left  = (0, -100%)
//   bottom-right  = (-100%,-100%)   top          = (-50%, 0)
//   top-left      = (0, 0)          top-right    = (-100%, 0)
//   left          = (0, -50%)       right        = (-100%, -50%)
//   center        = (-50%, -50%)
// `0` пишется БЕЗ процента, поэтому регулярка должна допускать как `%`,
// так и его отсутствие; иначе для не-bottom анкоров parse валится и
// наш inline `top/left` от прошлого apply остаётся вместе с новым
// MapLibre-transform — попап улетает на (X+old_left, Y+old_top).
export const TR_RE = /translate\(\s*(-?[\d.]+)(%?)\s*,\s*(-?[\d.]+)(%?)\s*\)\s*translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/;

export function sharpenPopup(popup: Popup): void {
  const el = popup.getElement();
  if (!el) return;

  let suppress = false;

  const clearOverrides = () => {
    if (!el.style.left && !el.style.top) return;
    suppress = true;
    el.style.left = "";
    el.style.top = "";
    suppress = false;
  };

  const apply = () => {
    if (suppress) return;
    const tr = el.style.transform;
    if (!tr || tr === "none") return;
    const m = tr.match(TR_RE);
    if (!m) {
      // Незнакомый формат — снимаем наш inline `top/left`, пусть
      // MapLibre позиционирует через transform как обычно (текст будет
      // менее crisp, но позиция корректная — это важнее).
      clearOverrides();
      return;
    }

    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w === 0 || h === 0) return;

    // Без `%` у MapLibre всегда стоит ноль (bare `0`), что эквивалентно
    // 0px смещения; трактуем именно так. С `%` — доля от размера попапа.
    const dx = m[2] === "%" ? (parseFloat(m[1]) / 100) * w : parseFloat(m[1]);
    const dy = m[4] === "%" ? (parseFloat(m[3]) / 100) * h : parseFloat(m[3]);
    const x = parseFloat(m[5]);
    const y = parseFloat(m[6]);

    const left = Math.round(x + dx);
    const top = Math.round(y + dy);

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
