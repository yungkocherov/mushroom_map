/**
 * AuthProvider — источник правды о текущем пользователе.
 *
 * Жизненный цикл:
 *   1. При монтировании вызываем authRefresh(). Если есть валидная
 *      HttpOnly cookie — получаем свежий access_token и дёргаем /me.
 *      Если нет — status="unauth".
 *   2. Access-token хранится только в React-state (не в localStorage —
 *      XSS-риск). Истекает через 15 мин; фоновый таймер вызывает
 *      authRefresh() за 60 сек до истечения.
 *   3. login() просто редиректит на /api/auth/yandex/login (top-level
 *      навигация нужна для 302 на oauth.yandex.ru).
 *   4. logout() чистит server-side revoke + локальный state; редиректит
 *      на главную, чтобы protected-route сразу отправил куда надо.
 *
 * Почему не react-query / SWR: у нас один «запрос» — /me, редко меняется.
 * Ручной state + useEffect проще и не тянет 10 кБ зависимости.
 */

import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthUser } from "@mushroom-map/types";
import {
  authLogout,
  authRefresh,
  authYandexLoginUrl,
  fetchMe,
} from "@mushroom-map/api-client";


export type AuthStatus = "loading" | "unauth" | "authenticated";

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  /** Навигация браузера на OAuth-endpoint провайдера. */
  login: () => void;
  /** Отзыв refresh на сервере + очистка локального state. */
  logout: () => Promise<void>;
  /** Для интеграции с authFetch / будущими кабинет-запросами. */
  getAccessToken: () => string | null;
}


export const AuthContext = createContext<AuthState | null>(null);


/** Планируем refresh за RENEW_MARGIN до exp, с полом в 10 сек чтобы не биться
 *  об нулевой expires_in (возвращается с сервера; пока всегда 900s). */
const RENEW_MARGIN_SECONDS = 60;
const MIN_RENEW_DELAY_MS = 10_000;

/** Backoff на сетевые ошибки в hydrate. 401 от authRefresh — definitive
 *  unauth, сюда не попадает. */
const HYDRATE_RETRY_DELAYS_MS = [1_000, 5_000, 30_000];


export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Ref, чтобы getAccessToken возвращал актуальное значение без
  // перерендер-зависимости (для authFetch / timeout-коллбэков).
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = accessToken;

  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Generation counter: каждый logout/unmount инкрементирует. Любой
  // pending hydrate сверяет свою захваченную generation перед setState
  // и тихо выходит, если устарел. Ловит race: logout → in-flight refresh
  // resolves → setState возвращает старого юзера.
  const generationRef = useRef(0);

  const scheduleRenew = useCallback((expiresInSeconds: number) => {
    if (renewTimer.current) clearTimeout(renewTimer.current);
    const delay = Math.max(
      (expiresInSeconds - RENEW_MARGIN_SECONDS) * 1000,
      MIN_RENEW_DELAY_MS,
    );
    renewTimer.current = setTimeout(() => {
      // Игнорируем возвращаемое значение: если refresh не удастся,
      // hydrate() в перехвате unauth логики уже сделает своё.
      void hydrateRef.current?.();
    }, delay);
  }, []);

  // hydrate вызывается из useEffect и из таймера. Держим в ref, чтобы не
  // собирать замыкание с устаревшим scheduleRenew.
  const hydrateRef = useRef<((retryIdx?: number) => Promise<void>) | null>(null);

  const hydrate = useCallback(async (retryIdx = 0): Promise<void> => {
    const myGen = generationRef.current;
    try {
      const refreshed = await authRefresh();
      if (generationRef.current !== myGen) return;
      if (!refreshed) {
        // 401 от сервера — пользователь просто не залогинен. Не ретраим.
        setStatus("unauth");
        setUser(null);
        setAccessToken(null);
        return;
      }
      const me = await fetchMe(refreshed.access_token);
      if (generationRef.current !== myGen) return;
      setAccessToken(refreshed.access_token);
      setUser(me);
      setStatus("authenticated");
      scheduleRenew(refreshed.expires_in);
    } catch {
      if (generationRef.current !== myGen) return;
      // Сетевая ошибка / 5xx. Не дёргаем unauth сразу — на flaky-сети
      // это привело бы к тихому logout'у через 15 мин. Backoff-ретраи;
      // до первой удачи или истечения списка задержек оставляем
      // текущий status как есть (loading при первом вызове).
      const nextDelay = HYDRATE_RETRY_DELAYS_MS[retryIdx];
      if (nextDelay !== undefined) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => {
          void hydrateRef.current?.(retryIdx + 1);
        }, nextDelay);
        return;
      }
      // Все ретраи исчерпаны — мягко уходим в unauth.
      setStatus("unauth");
      setUser(null);
      setAccessToken(null);
    }
  }, [scheduleRenew]);

  hydrateRef.current = hydrate;

  useEffect(() => {
    void hydrate();
    return () => {
      // Снимаем pending hydrate / renew, если AuthProvider размонтировался
      // (HMR / маршрут-смена в крайнем случае).
      generationRef.current += 1;
      if (renewTimer.current) clearTimeout(renewTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [hydrate]);

  const login = useCallback(() => {
    window.location.href = authYandexLoginUrl();
  }, []);

  const logout = useCallback(async () => {
    // Инвалидируем все pending hydrate'ы и таймеры ДО network-запроса —
    // если authLogout() висит на медленной сети, юзер уже не должен
    // увидеть «свои» данные при resolved'ом старом hydrate'е.
    generationRef.current += 1;
    if (renewTimer.current) clearTimeout(renewTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    try {
      await authLogout();
    } finally {
      // Очистить SW-кэш приватных API-ответов. Иначе следующий юзер на
      // том же устройстве получит из кеша споты предыдущего.
      if (typeof window !== "undefined" && "caches" in window) {
        try {
          await caches.delete("mushroom-api");
        } catch {
          // best-effort; private-mode и другие edge'ы не падают.
        }
      }
      setStatus("unauth");
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  const getAccessToken = useCallback(() => tokenRef.current, []);

  const value: AuthState = {
    status,
    user,
    accessToken,
    login,
    logout,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
