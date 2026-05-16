/** Tab-shell раздела «Статистика». Активная вкладка в ?tab=. Обзор
 *  пустой (собирается из остальных вкладок позже — по решению юзера). */
import { useSearchParams } from "react-router-dom";
import { SeasonalityTab } from "./SeasonalityTab";
import styles from "./StatsTabs.module.css";

const TABS = [
  { key: "obzor", label: "Обзор" },
  { key: "seasonality", label: "Сезонность" },
  { key: "forest", label: "Лес" },
  { key: "weather", label: "Погода" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function StatsTabs() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("tab");
  const active: TabKey = (TABS.some((t) => t.key === raw) ? raw : "obzor") as TabKey;

  return (
    <div>
      <div className={styles.bar} role="tablist" aria-label="Разделы статистики">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            type="button"
            className={`${styles.tab} ${active === t.key ? styles.tabActive : ""}`}
            onClick={() => setSp((p) => { p.set("tab", t.key); return p; }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === "seasonality" ? (
        <SeasonalityTab />
      ) : active === "obzor" ? (
        <p className={styles.placeholder}>
          Обзор соберём из ключевых графиков остальных вкладок — появится последним.
        </p>
      ) : (
        <p className={styles.placeholder}>Вкладка в работе.</p>
      )}
    </div>
  );
}
