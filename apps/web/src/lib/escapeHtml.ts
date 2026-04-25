/**
 * Минимальный escape для подстановки user-string'ов в raw HTML.
 * Используется обработчиками MapLibre-popup'ов, где react не работает
 * (popup строится HTML-строкой через `popup.setHTML`).
 *
 * Никогда не вызывайте на trusted-static-content — лишний оверхед.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
