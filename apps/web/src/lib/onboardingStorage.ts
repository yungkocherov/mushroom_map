/**
 * Onboarding state — хранится в localStorage.
 *
 * Старый ключ `geobiom_onboarded` = boolean (прошёл wizard) больше не
 * используется — wizard /onboarding убран в 2026-05-15 в пользу inline
 * V6-V9 hint sequence поверх карты.
 *
 * Новый ключ `geobiom.onboarding.step` хранит номер активного шага
 * (1..4) или 'done'. `isOnboarded()` оставлен для обратной совместимости
 * с местами, где раньше проверяли legacy-флаг (AuthCompletePage,
 * Layout); возвращает true когда step === 'done'.
 */

const STEP_KEY = "geobiom.onboarding.step";
const LEGACY_KEY = "geobiom_onboarded"; // 2024-2026-04 — удалить через сезон
const POST_AUTH_KEY = "geobiom_post_auth_redirect";

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | "done";

export function getOnboardingStep(): OnboardingStep {
  try {
    if (typeof window === "undefined") return "done";
    const raw = window.localStorage.getItem(STEP_KEY);
    // Миграция: legacy `geobiom_onboarded=1` означает что юзер уже видел
    // wizard — считаем что inline-tour он тоже не должен видеть.
    if (raw == null) {
      const legacy = window.localStorage.getItem(LEGACY_KEY);
      if (legacy === "1") {
        setOnboardingStep("done");
        return "done";
      }
      return 1;
    }
    if (raw === "done") return "done";
    const n = Number(raw);
    if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
    return 1;
  } catch {
    // SSR / private mode — treat as done (нет смысла гонять туры).
    return "done";
  }
}

export function setOnboardingStep(step: OnboardingStep): void {
  try {
    window.localStorage.setItem(STEP_KEY, String(step));
  } catch {
    // Private mode / quota — fail silent.
  }
}

export function isOnboarded(): boolean {
  return getOnboardingStep() === "done";
}

export function resetOnboarding(): void {
  try {
    window.localStorage.removeItem(STEP_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
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
