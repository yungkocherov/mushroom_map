/**
 * Onboarding-flag хранение в localStorage.
 *
 * Контракт: ключ `geobiom_onboarded` со значением `"1"` означает что
 * юзер прошёл (или явно скипнул) onboarding и не должен видеть
 * редирект с `/`.
 *
 * Phase W2 первой версией ставит флаг только когда юзер дойдёт до
 * Step 3 в OnboardingPage. Phase W3 расширит — также при auth-cookie
 * presence (залогиненный = уже знаком), и по migration-snippet'у при
 * deploy для existing visitors.
 */

const KEY = "geobiom_onboarded";
const POST_AUTH_KEY = "geobiom_post_auth_redirect";

export function isOnboarded(): boolean {
  try {
    return typeof window !== "undefined" &&
      window.localStorage.getItem(KEY) === "1";
  } catch {
    // SSR / private mode — treat as onboarded (skip redirect).
    return true;
  }
}

export function setOnboarded(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Private mode / quota — fail silent. They'll see onboarding next visit.
  }
}

export function resetOnboarded(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Set a one-shot redirect target read by AuthCompletePage after a
 * successful Yandex OAuth round-trip. We need this because the backend
 * OAuth flow does not preserve `?next=` from the frontend `/auth` page
 * across the Yandex redirect chain — by the time the user lands on
 * `/auth/complete`, the original target is gone from the URL.
 *
 * The value is consumed (cleared) on the first read.
 *
 * Validation: same `safeNext` rules as `?next=` URL param — only
 * relative same-origin paths (starting with `/` and not `//evil.com`).
 */
export function setPostAuthRedirect(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//")) return;
  try {
    window.localStorage.setItem(POST_AUTH_KEY, path);
  } catch {
    // ignore
  }
}

export function consumePostAuthRedirect(): string | null {
  try {
    const raw = window.localStorage.getItem(POST_AUTH_KEY);
    if (raw) {
      window.localStorage.removeItem(POST_AUTH_KEY);
      // safety re-check at read time too
      if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
    }
    return null;
  } catch {
    return null;
  }
}
