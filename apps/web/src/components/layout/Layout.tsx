import { Outlet, useLocation, Navigate } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { Spotlight } from "../Spotlight";
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
  const isMapShell = isMap;

  // First-visit redirect — только на `/`. Deep-link'и (например
  // `/species`) видим как есть. localStorage-флаг ставится после
  // прохождения onboarding (см. lib/onboardingStorage.ts).
  if (pathname === "/" && !isOnboarded()) {
    return <Navigate to="/onboarding" replace />;
  }

  if (isMapShell) {
    return (
      <div className={styles.mapShell}>
        <Header />
        <main className={styles.mapMain}>
          <Outlet />
        </main>
        <Spotlight />
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
      <Spotlight />
    </div>
  );
}
