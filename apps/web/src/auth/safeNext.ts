/**
 * Безопасная нормализация `?next=…` параметра. Принимает только
 * относительные пути на собственный origin — иначе возвращает fallback.
 *
 * Защищает от open-redirect: если злоумышленник заманит юзера на
 * `/auth?next=https://evil.com`, после успешного логина мы НЕ редиректим
 * на evil.com.
 */

const SENTINEL_BASE = "http://x";


export function safeNext(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  try {
    const u = new URL(raw, SENTINEL_BASE);
    // origin поменялся — значит raw содержал absolute URL или
    // protocol-relative `//evil.com/...`. Отвергаем.
    if (u.origin !== SENTINEL_BASE) return fallback;
    const path = u.pathname + u.search;
    return path.startsWith("/") ? path : fallback;
  } catch {
    return fallback;
  }
}
