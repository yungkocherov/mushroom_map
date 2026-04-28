import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { Spotlight } from "../Spotlight";
import styles from "./Layout.module.css";

/**
 * Корневой layout. На / и /map/:district карта тянется на полный
 * вьюпорт, но Header остаётся сверху (по brainstorm-мокапу
 * hero-c-fullsize.html). Footer прячем на map-shell страницах —
 * карта-главная не должна скроллиться, footer мешал бы.
 */
export function Layout() {
  const { pathname } = useLocation();
  const isMap = pathname === "/map" || pathname.startsWith("/map/");
  const isHome = pathname === "/";
  const isMapShell = isHome || isMap;

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
