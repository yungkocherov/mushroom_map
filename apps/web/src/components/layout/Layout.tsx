import { Link, Outlet, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import styles from "./Layout.module.css";

/**
 * Корневой layout. Шапка и подвал спрятаны на /map (карта владеет
 * всем viewport'ом), вместо них — компактная overlay-ссылка обратно
 * на главную в левом верхнем углу. Иначе пользователь оказывается
 * заперт на карте без обратного пути.
 */
export function Layout() {
  const { pathname } = useLocation();
  const isMap = pathname === "/map" || pathname.startsWith("/map/");
  // Главная теперь сама — карта (variant C редизайна). Без back-link
  // overlay (некуда «возвращаться»), без хедера/футера (карта владеет
  // экраном); вся навигация внутри SidebarOverview.
  const isHome = pathname === "/";

  if (isHome) {
    return (
      <div className={styles.mapShell}>
        <main className={styles.mapMain}>
          <Outlet />
        </main>
      </div>
    );
  }

  if (isMap) {
    return (
      <div className={styles.mapShell}>
        <Link to="/" className={styles.backLink} title="На главную">
          <ArrowLeft size={14} aria-hidden />
          <span>На главную</span>
        </Link>
        <main className={styles.mapMain}>
          <Outlet />
        </main>
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
    </div>
  );
}
