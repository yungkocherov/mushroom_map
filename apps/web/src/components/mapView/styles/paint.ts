/**
 * D1V paint-patch для Versatiles Colorful — перекрашивает базовую карту
 * «Карта» (scheme) в палитру бренда Geobiom: бумажно-кремовая земля,
 * мшисто-зелёный лес, землистые дороги, приглушённые подписи.
 *
 * Используется только для basemap mode "scheme". Hybrid намеренно
 * оставлен с дефолтными цветами Versatiles (там нужны яркие labels
 * поверх satellite, не приглушённые).
 *
 * Resolve cssvar через `getComputedStyle(document.documentElement)` —
 * один раз при сборке style. Re-apply при смене темы потребует
 * re-fetch базового style; пока dark-mode полноценно не работает,
 * не оптимизируем.
 */
export interface D1VColors {
  paper: string;
  paperRise: string;
  moss: string;
  mossLight: string;
  forest: string;
  bark: string;
  ink: string;
  inkDim: string;
  water: string;
  waterLine: string;
}

const FALLBACK: D1VColors = {
  paper:     "#f4ede0",
  paperRise: "#ede4d2",
  moss:      "#5d6a3a",
  mossLight: "#9bb47a",
  forest:    "#3e4827",
  bark:      "#7a5a3a",
  ink:       "#2a2620",
  inkDim:    "#5b5346",
  water:     "#c5d4d0",   // нет cssvar — мшисто-серо-голубой
  waterLine: "#6f8a85",   // тень для рек/контура водоёмов
};

export function resolveD1VColors(): D1VColors {
  if (typeof document === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const get = (key: keyof D1VColors, cssvar: string): string => {
    const v = cs.getPropertyValue(cssvar).trim();
    return v || FALLBACK[key];
  };
  return {
    paper:     get("paper", "--paper"),
    paperRise: get("paperRise", "--paper-rise"),
    moss:      get("moss", "--moss"),
    mossLight: get("mossLight", "--idx-2"),
    forest:    get("forest", "--forest"),
    bark:      get("bark", "--bark"),
    ink:       get("ink", "--ink"),
    inkDim:    get("inkDim", "--ink-dim"),
    water:     FALLBACK.water,
    waterLine: FALLBACK.waterLine,
  };
}

type StyleLayer = {
  id?: string;
  type?: string;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  [k: string]: unknown;
};

interface PatchableStyle {
  layers: StyleLayer[];
}

function setPaint(layer: StyleLayer, key: string, value: unknown): void {
  if (!layer.paint) layer.paint = {};
  layer.paint[key] = value;
}

// Versatiles Colorful naming (verified против live style.json, 309 слоёв):
//   background, water-*, land-*, site-*, airport-*, building[:outline],
//   street-*, tunnel-*-{street|way}-*, bridge-*-{street|way}-*,
//   boundary-* (с :outline вариантом casing), label-*, poi-*.
// :outline-суффикс используется как casing (вместо -bg/-fg как у MapTiler).
export function applyD1VPaint(style: PatchableStyle, c: D1VColors = resolveD1VColors()): void {
  for (const layer of style.layers) {
    const id = layer.id ?? "";
    const t = layer.type;

    if (t === "background") {
      setPaint(layer, "background-color", c.paper);
      continue;
    }

    // Water — fills для water-area*/water-ocean/water-dam-area/water-pier-area;
    // lines для water-river/water-canal/water-stream/water-ditch/water-dam/water-pier.
    if (t === "fill" && id.startsWith("water")) {
      setPaint(layer, "fill-color", c.water);
      setPaint(layer, "fill-opacity", 1);
      continue;
    }
    if (t === "line" && id.startsWith("water")) {
      setPaint(layer, "line-color", c.waterLine);
      continue;
    }

    // Land categories
    if (t === "fill") {
      // Леса / vegetation — насыщенный мох
      if (/^land-(forest|vegetation)/.test(id)) {
        setPaint(layer, "fill-color", c.moss);
        setPaint(layer, "fill-opacity", 0.6);
        continue;
      }
      // Травы / парки / wetland / leisure — светлый мох
      if (/^land-(grass|park|garden|leisure|wetland)/.test(id)) {
        setPaint(layer, "fill-color", c.mossLight);
        setPaint(layer, "fill-opacity", 0.45);
        continue;
      }
      // Застроенное / агро / прочее — paper-rise
      if (/^land-(commercial|industrial|residential|agriculture|waste|burial|sand|rock|glacier)/.test(id)) {
        setPaint(layer, "fill-color", c.paperRise);
        setPaint(layer, "fill-opacity", 0.7);
        continue;
      }
      // Sites (university, hospital, parking, school, ...) — нейтральные
      if (/^site-/.test(id)) {
        setPaint(layer, "fill-color", c.paperRise);
        setPaint(layer, "fill-opacity", 0.5);
        continue;
      }
      // Airport runway/taxiway зоны — тёмный bark
      if (/^airport-(area|runway|taxiway)/.test(id)) {
        setPaint(layer, "fill-color", c.bark);
        setPaint(layer, "fill-opacity", 0.55);
        continue;
      }
      // Pedestrian zones (street-pedestrian-zone fill) — paper-rise
      if (/^(street-|tunnel-street-|bridge-street-)/.test(id)) {
        setPaint(layer, "fill-color", c.paperRise);
        setPaint(layer, "fill-opacity", 0.6);
        continue;
      }
      // Tunnel/bridge solo fills (палубы)
      if (id === "tunnel" || id === "bridge") {
        setPaint(layer, "fill-color", c.paperRise);
        setPaint(layer, "fill-opacity", 0.5);
        continue;
      }
    }

    // Здания (building + building:outline)
    if (id.startsWith("building")) {
      if (t === "fill") {
        setPaint(layer, "fill-color", c.paperRise);
        setPaint(layer, "fill-opacity", 0.85);
        continue;
      }
      if (t === "line") {
        setPaint(layer, "line-color", c.inkDim);
        setPaint(layer, "line-opacity", 0.4);
        continue;
      }
    }

    // Дороги — street-*, tunnel-{street|way}-*, bridge-{street|way}-*.
    // :outline = casing → светлый paper-rise; основная линия → bark.
    if (t === "line" && /^(street-|tunnel-street-|tunnel-way-|bridge-street-|bridge-way-)/.test(id)) {
      const isOutline = id.endsWith(":outline");
      setPaint(layer, "line-color", isOutline ? c.paperRise : c.bark);
      continue;
    }
    // Airport runway/taxiway lines
    if (t === "line" && /^airport-(runway|taxiway)/.test(id)) {
      setPaint(layer, "line-color", c.bark);
      continue;
    }

    // Административные границы (boundary-country/state, +:outline casing)
    if (t === "line" && id.startsWith("boundary-")) {
      setPaint(layer, "line-color", c.inkDim);
      setPaint(layer, "line-opacity", 0.45);
      continue;
    }

    // Подписи (любой symbol с text-field) — ink на paper-halo.
    // Размер не трогаем (он уже масштабируется в buildSchemeStyle).
    if (t === "symbol" && layer.layout?.["text-field"]) {
      setPaint(layer, "text-color", c.ink);
      setPaint(layer, "text-halo-color", c.paper);
      setPaint(layer, "text-halo-width", 1.5);
      continue;
    }
  }
}
