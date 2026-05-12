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

// Versatiles Colorful использует стабильные prefix'ы id'ов слоёв:
//   background, water-*, landcover-*, landuse-*, building*,
//   road-*, tunnel-*, bridge-*, boundary-*, label-*, poi-*.
// Walk по типу + regex по id; unmatched оставляем как было.
export function applyD1VPaint(style: PatchableStyle, c: D1VColors = resolveD1VColors()): void {
  for (const layer of style.layers) {
    const id = layer.id ?? "";
    const t = layer.type;

    if (t === "background") {
      setPaint(layer, "background-color", c.paper);
      continue;
    }

    // Water polygons (озёра, моря, заливы) — мутно-голубой
    if (t === "fill" && /^water(-area)?(-|$)/.test(id)) {
      setPaint(layer, "fill-color", c.water);
      setPaint(layer, "fill-opacity", 1);
      continue;
    }
    // Waterway lines (реки, ручьи)
    if (t === "line" && /^water/.test(id)) {
      setPaint(layer, "line-color", c.waterLine);
      continue;
    }

    // Леса — насыщенный мох
    if (t === "fill" && /landcover-(wood|forest)/.test(id)) {
      setPaint(layer, "fill-color", c.moss);
      setPaint(layer, "fill-opacity", 0.6);
      continue;
    }
    // Травы/парки/кустарник — светлый мох
    if (t === "fill" && /landcover-(grass|meadow|heath|scrub|park|wetland)/.test(id)) {
      setPaint(layer, "fill-color", c.mossLight);
      setPaint(layer, "fill-opacity", 0.45);
      continue;
    }
    // Пашня/сельхоз — бумажный rise
    if (t === "fill" && /(landcover-(farmland|crop)|landuse-(farmland|crop|residential|industrial|commercial))/.test(id)) {
      setPaint(layer, "fill-color", c.paperRise);
      setPaint(layer, "fill-opacity", 0.7);
      continue;
    }

    // Здания — нейтральный bark на низкой непрозрачности
    if (t === "fill" && /^building/.test(id)) {
      setPaint(layer, "fill-color", c.paperRise);
      setPaint(layer, "fill-opacity", 0.85);
      setPaint(layer, "fill-outline-color", c.inkDim);
      continue;
    }
    if (t === "line" && /^building/.test(id)) {
      setPaint(layer, "line-color", c.inkDim);
      setPaint(layer, "line-opacity", 0.4);
      continue;
    }

    // Дороги/мосты/тоннели. *-bg (casing) → светлый, *-fg (основа) → bark.
    // Слои без -bg/-fg суффикса трактуем как основу.
    if (t === "line" && /^(road|tunnel|bridge)-/.test(id)) {
      const isBg = id.includes("-bg") || id.endsWith("-casing");
      setPaint(layer, "line-color", isBg ? c.paperRise : c.bark);
      continue;
    }

    // Административные границы — тонкие приглушённые
    if (t === "line" && /^boundary-/.test(id)) {
      setPaint(layer, "line-color", c.inkDim);
      setPaint(layer, "line-opacity", 0.45);
      continue;
    }

    // Подписи (всё symbol с text-field) — ink на paper-halo.
    // Размер не трогаем (он уже масштабируется в buildSchemeStyle).
    if (t === "symbol" && layer.layout?.["text-field"]) {
      setPaint(layer, "text-color", c.ink);
      setPaint(layer, "text-halo-color", c.paper);
      setPaint(layer, "text-halo-width", 1.5);
      continue;
    }
  }
}
