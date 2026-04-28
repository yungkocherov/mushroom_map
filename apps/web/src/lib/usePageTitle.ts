/**
 * Простой hook для per-page document.title и meta-description без
 * react-helmet (та +6 КБ gzip — не оправдывают ради трёх роутов).
 * При unmount возвращает дефолты из index.html.
 */
import { useEffect } from "react";

const DEFAULT_TITLE = "Geobiom — лес ленобласти";
const DEFAULT_DESC =
  "Грибная погода Ленобласти: индекс плодоношения по 18 районам, тип леса и микориза для каждого выдела, сохранённые места в кабинете.";

export function usePageTitle(title: string, description?: string): void {
  useEffect(() => {
    const prevTitle = document.title;
    const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = metaDesc?.content ?? DEFAULT_DESC;

    document.title = title;
    if (description && metaDesc) {
      metaDesc.content = description;
    }

    return () => {
      document.title = prevTitle || DEFAULT_TITLE;
      if (metaDesc) metaDesc.content = prevDesc;
    };
  }, [title, description]);
}
