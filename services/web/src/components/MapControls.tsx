/**
 * Плавающая панель контролов карты.
 */
import { ForestColorMode, FOREST_COLOR_MODE_LABELS } from "../lib/forestStyle";

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
  onShare: () => void;
}

const WRAP_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontFamily: "system-ui, sans-serif",
  fontSize: 13,
};

const CARD_STYLE: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.95)",
  backdropFilter: "blur(6px)",
  borderRadius: 8,
  padding: "8px 10px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
  border: "1px solid rgba(0, 0, 0, 0.08)",
};

const PILL_WRAP_STYLE: React.CSSProperties = {
  display: "inline-flex",
  background: "rgba(0, 0, 0, 0.05)",
  borderRadius: 6,
  padding: 2,
  gap: 2,
};

const pillBtn = (active: boolean): React.CSSProperties => ({
  border: "none",
  background: active ? "white" : "transparent",
  color: active ? "#222" : "#666",
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: active ? 600 : 500,
  borderRadius: 5,
  cursor: "pointer",
  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
  transition: "all 0.15s ease",
});

const layerBtn = (loaded: boolean, visible: boolean, color: string): React.CSSProperties => ({
  border: loaded && visible ? "none" : `1.5px solid ${color}`,
  background: loaded && visible ? color : "transparent",
  color: loaded && visible ? "white" : color,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  cursor: "pointer",
  width: "100%",
  transition: "all 0.15s ease",
});

export function MapControls(props: Props) {
  return (
    <div style={WRAP_STYLE}>
      {/* Подложка */}
      <div style={CARD_STYLE}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Подложка
        </div>
        <div style={PILL_WRAP_STYLE}>
          <button style={pillBtn(props.baseMap === "osm")}       onClick={() => props.onBaseMapChange("osm")}>OSM</button>
          <button style={pillBtn(props.baseMap === "scheme")}    onClick={() => props.onBaseMapChange("scheme")}>Схема</button>
          <button style={pillBtn(props.baseMap === "satellite")} onClick={() => props.onBaseMapChange("satellite")}>Спутник</button>
          <button style={pillBtn(props.baseMap === "hybrid")}    onClick={() => props.onBaseMapChange("hybrid")}>Гибрид</button>
        </div>
      </div>

      {/* Лесной слой + режим раскраски */}
      <div style={CARD_STYLE}>
        <button onClick={props.onForestToggle} style={layerBtn(props.forestLoaded, props.forestVisible, "#2e7d32")}>
          {!props.forestLoaded ? "Загрузить леса" : props.forestVisible ? "Леса: вкл" : "Леса: выкл"}
        </button>
        {props.forestLoaded && (
          <div style={{ ...PILL_WRAP_STYLE, marginTop: 6 }}>
            {(["species", "bonitet", "age_group"] as ForestColorMode[]).map(mode => (
              <button
                key={mode}
                style={pillBtn(props.forestColorMode === mode)}
                onClick={() => props.onForestColorMode(mode)}
              >
                {FOREST_COLOR_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Водоохрана */}
      <div style={CARD_STYLE}>
        <button onClick={props.onWaterToggle} style={layerBtn(props.waterLoaded, props.waterVisible, "#1565C0")}>
          {!props.waterLoaded ? "Водоохранные зоны" : props.waterVisible ? "Водоохрана: вкл" : "Водоохрана: выкл"}
        </button>
      </div>

      {/* ООПТ */}
      <div style={CARD_STYLE}>
        <button onClick={props.onOoptToggle} style={layerBtn(props.ooptLoaded, props.ooptVisible, "#b71c1c")}>
          {!props.ooptLoaded ? "ООПТ" : props.ooptVisible ? "ООПТ: вкл" : "ООПТ: выкл"}
        </button>
      </div>

      {/* Лесные дороги */}
      <div style={CARD_STYLE}>
        <button onClick={props.onRoadsToggle} style={layerBtn(props.roadsLoaded, props.roadsVisible, "#5d4037")}>
          {!props.roadsLoaded ? "Лесные дороги" : props.roadsVisible ? "Дороги: вкл" : "Дороги: выкл"}
        </button>
      </div>

      {/* Болота */}
      <div style={CARD_STYLE}>
        <button onClick={props.onWetlandToggle} style={layerBtn(props.wetlandLoaded, props.wetlandVisible, "#795548")}>
          {!props.wetlandLoaded ? "Болота" : props.wetlandVisible ? "Болота: вкл" : "Болота: выкл"}
        </button>
      </div>

      {/* Вырубки / гари */}
      <div style={CARD_STYLE}>
        <button onClick={props.onFellingToggle} style={layerBtn(props.fellingLoaded, props.fellingVisible, "#bf360c")}>
          {!props.fellingLoaded ? "Вырубки и гари" : props.fellingVisible ? "Вырубки: вкл" : "Вырубки: выкл"}
        </button>
      </div>

      {/* Защитные леса */}
      <div style={CARD_STYLE}>
        <button onClick={props.onProtectiveToggle} style={layerBtn(props.protectiveLoaded, props.protectiveVisible, "#6a1b9a")}>
          {!props.protectiveLoaded ? "Защитные леса" : props.protectiveVisible ? "Защитные: вкл" : "Защитные: выкл"}
        </button>
      </div>

      {/* Поделиться */}
      <div style={CARD_STYLE}>
        <button
          onClick={props.onShare}
          style={{ ...layerBtn(false, false, "#455a64"), border: "1.5px solid #455a64" }}
        >
          Скопировать ссылку
        </button>
      </div>
    </div>
  );
}
