/**
 * LAYER_REGISTRY — декларативное описание всех слоёв карты (кроме userSpots,
 * который data-driven — управляется отдельным `useUserSpotsSync` хуком).
 *
 * Контракт каждой записи:
 *   - `id`: ключ из useLayerVisibility.LayerKey
 *   - `pmtiles`: имя файла в TILES_BASE; null = слой через GeoJSON API (districts)
 *   - `missingMsg`: показывается через store.setErrorMsg, если HEAD на pmtiles упал
 *   - `add(map)`: добавить source + layer в инстанс карты
 *   - `setVisibility(map, visible)`: переключить layout.visibility
 *   - `sources`, `layers`: ID's, которые `add` создаёт. Используются `useMapLayers`
 *      для cleanup'а при basemap-switch'е (setStyle убивает layers, иногда оставляя
 *      sources в зомби-состоянии).
 */
import type { Map } from "maplibre-gl";
import type { LayerKey } from "../../store/useLayerVisibility";

import { addForestLayer, setForestVisibility } from "./layers/forest";
import { addWaterLayer, setWaterVisibility } from "./layers/water";
import { addWaterwayLayer, setWaterwayVisibility } from "./layers/waterway";
import { addWetlandLayer, setWetlandVisibility } from "./layers/wetland";
import { addOoptLayer, setOoptVisibility } from "./layers/oopt";
import { addRoadsLayer, setRoadsVisibility } from "./layers/roads";
import { addFellingLayer, setFellingVisibility } from "./layers/felling";
import { addProtectiveLayer, setProtectiveVisibility } from "./layers/protective";
import { addSoilLayer, setSoilVisibility } from "./layers/soil";
import { addHillshadeLayer, setHillshadeVisibility } from "./layers/hillshade";
import { addDistrictsLayer, setDistrictsVisibility } from "./layers/districts";
import {
  addForecastChoroplethLayer,
  setForecastChoroplethVisibility,
} from "./layers/forecastChoropleth";

export type RegistryLayerKey = Exclude<LayerKey, "userSpots">;

export interface LayerEntry {
  id: RegistryLayerKey;
  pmtiles: string | null;
  missingMsg: string | null;
  add: (map: Map) => void;
  setVisibility: (map: Map, visible: boolean) => void;
  sources: string[];
  layers: string[];
}

export const LAYER_REGISTRY: ReadonlyArray<LayerEntry> = [
  {
    id: "forest",
    pmtiles: "forest.pmtiles",
    missingMsg: "Леса не собраны — запустите ingest_forest.py + build_tiles.py",
    add: addForestLayer,
    setVisibility: setForestVisibility,
    // Forest состоит из двух pmtiles: forest_lo (z=5-7, упрощённый) +
    // forest (z=8-13, полная детализация). HEAD-check выше делается на
    // forest.pmtiles; forest_lo.pmtiles предполагается рядом.
    sources: ["forest", "forest_lo"],
    layers: ["forest-lo-fill", "forest-fill"],
  },
  {
    id: "water",
    pmtiles: "water.pmtiles",
    missingMsg: "Водоохранные зоны не собраны — запустите ingest_water.py и build_water_tiles.py",
    add: addWaterLayer,
    setVisibility: setWaterVisibility,
    sources: ["water"],
    layers: ["water-fill"],
  },
  {
    id: "waterway",
    pmtiles: "waterway.pmtiles",
    missingMsg: "Данные водотоков не загружены — запустите ingest_waterway.py и build_waterway_tiles.py",
    add: addWaterwayLayer,
    setVisibility: setWaterwayVisibility,
    sources: ["waterway"],
    layers: ["waterway-line"],
  },
  {
    id: "wetland",
    pmtiles: "wetlands.pmtiles",
    missingMsg: "Данные болот не загружены — запустите ingest_wetlands.py и build_wetlands_tiles.py",
    add: addWetlandLayer,
    setVisibility: setWetlandVisibility,
    sources: ["wetland"],
    layers: ["wetland-fill"],
  },
  {
    id: "oopt",
    pmtiles: "oopt.pmtiles",
    missingMsg: "Данные ООПТ не загружены — запустите ingest_oopt.py и build_oopt_tiles.py",
    add: addOoptLayer,
    setVisibility: setOoptVisibility,
    sources: ["oopt"],
    layers: ["oopt-fill"],
  },
  {
    id: "roads",
    pmtiles: "roads.pmtiles",
    missingMsg: "Данные дорог не загружены — запустите ingest_osm_roads.py и build_roads_tiles.py",
    add: addRoadsLayer,
    setVisibility: setRoadsVisibility,
    sources: ["roads"],
    layers: ["roads-line", "roads-casing"],
  },
  {
    id: "felling",
    pmtiles: "felling.pmtiles",
    missingMsg: "Данные вырубок не загружены — запустите ingest_felling.py и build_felling_tiles.py",
    add: addFellingLayer,
    setVisibility: setFellingVisibility,
    sources: ["felling"],
    layers: ["felling-fill"],
  },
  {
    id: "protective",
    pmtiles: "protective.pmtiles",
    missingMsg: "Данные защитных лесов не загружены — запустите ingest_protective.py и build_protective_tiles.py",
    add: addProtectiveLayer,
    setVisibility: setProtectiveVisibility,
    sources: ["protective"],
    layers: ["protective-fill"],
  },
  {
    id: "soil",
    pmtiles: "soil.pmtiles",
    missingMsg: "Данные почв не загружены — запустите ingest_soil.py и build_soil_tiles.py",
    add: addSoilLayer,
    setVisibility: setSoilVisibility,
    sources: ["soil"],
    layers: ["soil-fill"],
  },
  {
    id: "hillshade",
    pmtiles: "hillshade.pmtiles",
    missingMsg: "Hillshade не собран — запустите scripts/download_copernicus_dem.py, build_terrain.py и build_hillshade_tiles.py",
    add: addHillshadeLayer,
    setVisibility: setHillshadeVisibility,
    sources: ["hillshade"],
    layers: ["hillshade-raster"],
  },
  // Внимание: districts и forecastChoropleth используют ОДИН source "districts"
  // (forecastChoropleth-модуль защищается `if (!m.getSource("districts"))`).
  // useMapLayers.reapplyAll() удаляет source у одного entry, у второго получает
  // no-op через `if (m.getSource(s))` guard — это работает, но абстракция «source
  // owns by entry» здесь leaky. При добавлении третьего слоя на тот же source —
  // придётся явно ввести "shared sources" концепт.
  {
    id: "districts",
    pmtiles: null,
    missingMsg: null,
    add: addDistrictsLayer,
    setVisibility: setDistrictsVisibility,
    sources: ["districts"],
    layers: ["districts-line"],
  },
  {
    id: "forecastChoropleth",
    pmtiles: null,
    missingMsg: null,
    add: addForecastChoroplethLayer,
    setVisibility: setForecastChoroplethVisibility,
    sources: ["districts"],
    layers: ["forecast-choropleth-fill"],
  },
];

export function getLayerEntry(id: RegistryLayerKey): LayerEntry {
  const entry = LAYER_REGISTRY.find((e) => e.id === id);
  if (!entry) throw new Error(`LAYER_REGISTRY: no entry for "${id}"`);
  return entry;
}
