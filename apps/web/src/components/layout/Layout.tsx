import { Outlet, useLocation, Navigate } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { Spotlight } from "../Spotlight";
import { FeedbackButton } from "../FeedbackButton";
import { isOnboarded } from "../../lib/onboardingStorage";
import styles from "./Layout.module.css";

/**
 * Корневой layout. После Phase W2 (redesign-2026-05) карта-shell —
 * это `/map` и `/map/:district`. `/` это Landing (обычный контент-shell
 * с footer'ом). Footer прячем только на map-shell страницах — карта
 * не должна скроллиться, footer мешал бы.
 *
 * First-visit redirect: новые посетители на `/` отправляются на
 * `/onboarding`. Залогиненные / уже onboarded — пропускают.
 */
export function Layout() {
  const { pathname } = useLocation();
  const isMap = pathname === "/map" || pathname.startsWith("/map/");
  const isOnboarding = pathname === "/onboarding";
  // Onboarding имеет свой top-bar (Wordmark + stepper) — глобальный
  // Header дал бы двойной лого. Сворачиваем shell к bare main.
  const isMapShell = isMap || isOnboarding;

  // First-visit redirect — только на `/`. Deep-link'и (например
  // `/species`) видим как есть. localStorage-флаг ставится после
  // прохождения onboarding (см. lib/onboardingStorage.ts).
  if (pathname === "/" && !isOnboarded()) {
    return <Navigate to="/onboarding" replace />;
  }

  if (isMapShell) {
    // Phase W4 (redesign-2026-05): на /map* Header не нужен — навигация
    // переезжает в floating MapTopBar (Wordmark + InlineSearch + user)
    // внутри MapHomePage. Footer тоже скрыт — карта не скроллится.
    // V4.2: Spotlight modal убран — поиск теперь inline в MapTopBar.
    return (
      <div className={styles.mapShell}>
        <main className={styles.mapMain}>
          <Outlet />
        </main>
        {/* Onboarding — собственный step-flow, без feedback'а.
            Map shell — поднимаем над NavigationControl (bottom-right). */}
        {!isOnboarding && <FeedbackButton placement="aboveMapNav" />}
      </div>
    );
  }

  return (
    <div className={styles.contentShell}>
      <Header />
      <main className={styles.contentMain}>
        <Outlet />
      </main>
      <Footer />
      {/* На не-map страницах нет MapTopBar — Spotlight остаётся как
          ⌘K modal-fallback. На /map поиск живёт inline в MapTopBar. */}
      <Spotlight />
      <FeedbackButton />
    </div>
  );
}
