/**
 * Плавающая панель контролов карты.
 *
 * На мобильном (useIsMobile) — крупнее touch-target'ы (минимум 40px высота
 * по гайдлайнам Apple/Google), уменьшенный font-size чтобы влезало в
 * узкий экран. Тултипы (title=) скрыты — их всё равно нельзя посмотреть на тач.
 */
import { useState } from "react";
import { ForestColorMode, FOREST_COLOR_MODE_LABELS } from "../lib/forestStyle";
import { useIsMobile } from "../lib/useIsMobile";

export type BaseMapMode = "osm" | "scheme" | "satellite" | "hybrid";

interface Props {
  baseMap: BaseMapMode;
  onBaseMapChange: (mode: BaseMapMode) => void;
  forestVisible: boolean;
  forestLoaded: boolean;
  onForestToggle: () => void;
  forestColorMode: ForestColorMode;
  onForestColorMode: (mode: ForestColorMode) => void;
  waterVisible: boolean;
  waterLoaded: boolean;
  onWaterToggle: () => void;
  ooptVisible: boolean;
  ooptLoaded: boolean;
  onOoptToggle: () => void;
  roadsVisible: boolean;
  roadsLoaded: boolean;
  onRoadsToggle: () => void;
  wetlandVisible: boolean;
  wetlandLoaded: boolean;
  onWetlandToggle: () => void;
  fellingVisible: boolean;
  fellingLoaded: boolean;
  onFellingToggle: () => void;
  protectiveVisible: boolean;
  protectiveLoaded: boolean;
  onProtectiveToggle: () => void;
  soilVisible: boolean;
  soilLoaded: boolean;
  onSoilToggle: () => void;
  waterwayVisible: boolean;
  waterwayLoaded: boolean;
  onWaterwayToggle: () => void;
  onShare: () => void;
}

const wrapStyle = (mobile: boolean): React.CSSProperties => ({
  position: "absolute",
  // Отступаем от «На главную»-пилюли (top: 12, height ~30px) и от
  // поисковой строки на мобильном (которая занимает top).
  top: mobile ? 108 : 52,
  left: mobile ? 8 : 12,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  gap: mobile ? 6 : 4,
  fontFamily: "system-ui, sans-serif",
  fontSize: mobile ? 13 : 12,
  maxWidth: mobile ? "calc(50vw - 16px)" : undefined,
});

const cardStyle = (mobile: boolean): React.CSSProperties => ({
  background: "rgba(255, 255, 255, 0.95)",
  backdropFilter: "blur(6px)",
  borderRadius: 7,
  padding: mobile ? "8px 10px" : "6px 8px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
  border: "1px solid rgba(0, 0, 0, 0.08)",
});

const PILL_WRAP_STYLE: React.CSSProperties = {
  display: "inline-flex",
  background: "rgba(0, 0, 0, 0.05)",
  borderRadius: 5,
  padding: 2,
  gap: 2,
};

const pillBtn = (active: boolean, mobile: boolean): React.CSSProperties => ({
  border: "none",
  background: active ? "white" : "transparent",
  color: active ? "#222" : "#666",
  padding: mobile ? "8px 10px" : "3px 8px",
  fontSize: mobile ? 12 : 11,
  fontWeight: active ? 600 : 500,
  borderRadius: 4,
  cursor: "pointer",
  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
  transition: "all 0.15s ease",
  minHeight: mobile ? 36 : undefined,
});

const layerBtn = (loaded: boolean, visible: boolean, color: string, mobile: boolean): React.CSSProperties => ({
  border: loaded && visible ? "none" : `1.5px solid ${color}`,
  background: loaded && visible ? color : "transparent",
  color: loaded && visible ? "white" : color,
  padding: mobile ? "10px 12px" : "4px 10px",
  fontSize: mobile ? 12 : 11,
  fontWeight: 600,
  borderRadius: 5,
  cursor: "pointer",
  width: "100%",
  transition: "all 0.15s ease",
  minHeight: mobile ? 40 : undefined,
});

const expandBtnStyle = (mobile: boolean): React.CSSProperties => ({
  background: "rgba(255,255,255,0.95)",
  backdropFilter: "blur(6px)",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 7,
  padding: mobile ? "10px 12px" : "4px 10px",
  fontSize: mobile ? 12 : 11,
  fontWeight: 600,
  color: "#555",
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
  boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: mobile ? 40 : undefined,
});

export function MapControls(props: Props) {
  const mobile = useIsMobile();
  const [layersOpen, setLayersOpen] = useState(false);

  return (
    <div style={wrapStyle(mobile)}>
      {/* Подложка */}
      <div style={cardStyle(mobile)}>
        <div style={{ fontSize: 10, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Подложка
        </div>
        <div style={PILL_WRAP_STYLE}>
          <button style={pillBtn(props.baseMap === "osm", mobile)}       onClick={() => props.onBaseMapChange("osm")}>OSM</button>
          <button style={pillBtn(props.baseMap === "scheme", mobile)}    onClick={() => props.onBaseMapChange("scheme")}>Схема</button>
          <button style={pillBtn(props.baseMap === "satellite", mobile)} onClick={() => props.onBaseMapChange("satellite")}>Спутник</button>
          <button style={pillBtn(props.baseMap === "hybrid", mobile)}    onClick={() => props.onBaseMapChange("hybrid")}>Гибрид</button>
        </div>
      </div>

      {/* Лесной слой + режим раскраски */}
      <div style={cardStyle(mobile)}>
        <button
          onClick={props.onForestToggle}
          style={layerBtn(props.forestLoaded, props.forestVisible, "#2e7d32", mobile)}
          title={mobile ? undefined : "Лесные выделы ФГИС ЛК. Цвет — доминирующая порода, бонитет или возраст. Клик по полигону — детальная информация."}
        >
          {!props.forestLoaded ? "Загрузить леса" : props.forestVisible ? "Леса: вкл" : "Леса: выкл"}
        </button>
        {props.forestLoaded && (
          <div style={{ ...PILL_WRAP_STYLE, marginTop: 5 }}>
            {(["species", "bonitet", "age_group"] as ForestColorMode[]).map(mode => (
              <button
                key={mode}
                style={pillBtn(props.forestColorMode === mode, mobile)}
                onClick={() => props.onForestColorMode(mode)}
                title={mobile ? undefined : (
                  mode === "species"   ? "Цвет по доминирующей породе: ель, сосна, берёза и т.д." :
                  mode === "bonitet"   ? "Бонитет I–V — продуктивность леса. I = самый продуктивный." :
                                        "Возрастная группа: молодняки, средневозрастные, спелые."
                )}
              >
                {FOREST_COLOR_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Кнопка «Доп. слои» */}
      <button style={expandBtnStyle(mobile)} onClick={() => setLayersOpen(o => !o)}>
        <span>Доп. слои</span>
        <span style={{ fontSize: 10, marginLeft: 6 }}>{layersOpen ? "▲" : "▼"}</span>
      </button>

      {/* Дополнительные слои — раскрываются */}
      {layersOpen && (
        <>
          <div style={cardStyle(mobile)}>
            <button
              onClick={props.onWaterToggle}
              style={layerBtn(props.waterLoaded, props.waterVisible, "#1565C0", mobile)}
              title={mobile ? undefined : "Водоохранные зоны рек и озёр. Ограничения на лесозаготовку и проезд."}
            >
              {!props.waterLoaded ? "Водоохранные зоны" : props.waterVisible ? "Водоохрана: вкл" : "Водоохрана: выкл"}
            </button>
          </div>

          <div style={cardStyle(mobile)}>
            <button
              onClick={props.onOoptToggle}
              style={layerBtn(props.ooptLoaded, props.ooptVisible, "#b71c1c", mobile)}
              title={mobile ? undefined : "Особо охраняемые природные территории: заповедники, нацпарки, заказники. В большинстве ограничен сбор грибов."}
            >
              {!props.ooptLoaded ? "ООПТ" : props.ooptVisible ? "ООПТ: вкл" : "ООПТ: выкл"}
            </button>
          </div>

          <div style={cardStyle(mobile)}>
            <button
              onClick={props.onRoadsToggle}
              style={layerBtn(props.roadsLoaded, props.roadsVisible, "#5d4037", mobile)}
              title={mobile ? undefined : "Лесные дороги, просеки, тропы и грунтовки (OSM). Полезно при планировании маршрута."}
            >
              {!props.roadsLoaded ? "Лесные дороги" : props.roadsVisible ? "Дороги: вкл" : "Дороги: выкл"}
            </button>
          </div>

          <div style={cardStyle(mobile)}>
            <button
              onClick={props.onWetlandToggle}
              style={layerBtn(props.wetlandLoaded, props.wetlandVisible, "#795548", mobile)}
              title={mobile ? undefined : "Болотные массивы (OSM). Часто непроходимы. Зоны клюквы, морошки, моховиков."}
            >
              {!props.wetlandLoaded ? "Болота" : props.wetlandVisible ? "Болота: вкл" : "Болота: выкл"}
            </button>
          </div>

          <div style={cardStyle(mobile)}>
            <button
              onClick={props.onFellingToggle}
              style={layerBtn(props.fellingLoaded, props.fellingVisible, "#bf360c", mobile)}
              title={mobile ? undefined : "Вырубки, гари и погибшие насаждения (ФГИС ЛК). На 3–7-летних вырубках — подосиновики, маслята, опята."}
            >
              {!props.fellingLoaded ? "Вырубки и гари" : props.fellingVisible ? "Вырубки: вкл" : "Вырубки: выкл"}
            </button>
          </div>

          <div style={cardStyle(mobile)}>
            <button
              onClick={props.onProtectiveToggle}
              style={layerBtn(props.protectiveLoaded, props.protectiveVisible, "#6a1b9a", mobile)}
              title={mobile ? undefined : "Защитные леса (ФГИС ЛК): запретные полосы, городские леса. Возможны ограничения на посещение."}
            >
              {!props.protectiveLoaded ? "Защитные леса" : props.protectiveVisible ? "Защитные: вкл" : "Защитные: выкл"}
            </button>
          </div>

          <div style={cardStyle(mobile)}>
            <button
              onClick={props.onSoilToggle}
              style={layerBtn(props.soilLoaded, props.soilVisible, "#c9a96e", mobile)}
              title={mobile ? undefined : "Почвы (Докучаевский ин-т, 1:2.5М). Тип почвы — сильный предиктор для грибников: подзолы (лисички/моховики), дерново-карбонатные (белые/грузди), болотные (клюква/морошка)."}
            >
              {!props.soilLoaded ? "Почвы" : props.soilVisible ? "Почвы: вкл" : "Почвы: выкл"}
            </button>
          </div>

          <div style={cardStyle(mobile)}>
            <button
              onClick={props.onWaterwayToggle}
              style={layerBtn(props.waterwayLoaded, props.waterwayVisible, "#1976d2", mobile)}
              title={mobile ? undefined : "Водотоки (OSM): реки, ручьи, каналы. Близость к воде = влажность = плодоношение. ~204k объектов в ЛО, виден с zoom 9."}
            >
              {!props.waterwayLoaded ? "Ручьи и реки" : props.waterwayVisible ? "Водотоки: вкл" : "Водотоки: выкл"}
            </button>
          </div>

          <div style={cardStyle(mobile)}>
            <button
              onClick={props.onShare}
              style={{ ...layerBtn(false, false, "#455a64", mobile), border: "1.5px solid #455a64" }}
              title={mobile ? undefined : "Скопировать ссылку на текущий вид карты"}
            >
              Поделиться
            </button>
          </div>
        </>
      )}
    </div>
  );
}
