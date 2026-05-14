import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { Spotlight } from "../Spotlight";
import { FeedbackButton } from "../FeedbackButton";
import styles from "./Layout.module.css";

/**
 * Корневой layout. После Phase W2 (redesign-2026-05) карта-shell —
 * это `/map` и `/map/:district`. `/` это Landing (обычный контент-shell
 * с footer'ом). Footer прячем только на map-shell страницах — карта
 * не должна скроллиться, footer мешал бы.
 *
 * Onboarding (2026-05-15): wizard /onboarding убран. Inline V6-V9
 * hints поверх карты (OnboardingHints) запускаются при первом заходе
 * на /map. Никаких redirect'ов больше нет.
 */
export function Layout() {
  const { pathname } = useLocation();
  const isMap = pathname === "/map" || pathname.startsWith("/map/");
  const isMapShell = isMap;

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
        {/* Map shell — поднимаем над NavigationControl (bottom-right). */}
        <FeedbackButton placement="aboveMapNav" />
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
