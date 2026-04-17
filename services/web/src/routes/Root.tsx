/**
 * Root layout — обёртка для всех страниц.
 *
 * Хедер скрыт на /map (там карта владеет всем viewport'ом), виден
 * везде иначе. На /map тело — full-screen flex. На контент-страницах —
 * центрированная колонка с max-width.
 */
import { Outlet, useLocation } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";

export function Root() {
  const { pathname } = useLocation();
  const isMap = pathname === "/map" || pathname.startsWith("/map/");

  return (
    <div className={isMap ? "layout layout--map" : "layout layout--content"}>
      {!isMap && <SiteHeader />}
      <main className={isMap ? "main main--map" : "main main--content"}>
        <Outlet />
      </main>
    </div>
  );
}
