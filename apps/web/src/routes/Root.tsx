/**
 * Root layout — обёртка для всех страниц.
 *
 * Хедер скрыт на /map (там карта владеет всем viewport'ом), виден
 * везде иначе. На /map — маленькая оверлей-ссылка в левом верхнем
 * углу чтобы вернуться в сайт. Иначе пользователь заперт на карте.
 * На контент-страницах — центрированная колонка с max-width.
 */
import { Link, Outlet, useLocation } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";

export function Root() {
  const { pathname } = useLocation();
  const isMap = pathname === "/map" || pathname.startsWith("/map/");

  return (
    <div className={isMap ? "layout layout--map" : "layout layout--content"}>
      {!isMap && <SiteHeader />}
      {isMap && (
        <Link to="/" className="map-home-link" title="На главную">
          <span aria-hidden>←</span>
          <span>На главную</span>
        </Link>
      )}
      <main className={isMap ? "main main--map" : "main main--content"}>
        <Outlet />
      </main>
    </div>
  );
}
