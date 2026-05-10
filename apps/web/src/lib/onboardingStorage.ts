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
