# Переход с OSM на Copernicus HRL Tree Species

Документ описывает, как сервис `mushroom-map` без переписывания фронта и API переключается с грубых данных OpenStreetMap на точные спутниковые данные Copernicus.

Схема спроектирована так, что миграция = **запуск нового source-ingestor'а + один SQL update view'а**. Никакие контракты API и никакие компоненты фронта не затрагиваются.

---

## 1. Состояние на фазе MVP (OSM)

- `services/geodata/src/geodata/sources/osm.py` реализует интерфейс `ForestSource`
- скачивает `landuse=forest` через Overpass API
- мэппит тег `leaf_type` в `dominant_species`:
  - `needleleaved` → `mixed_coniferous` (без детализации сосна/ель)
  - `broadleaved`  → `mixed_broadleaved`
  - `mixed`        → `mixed`
  - отсутствует    → `unknown`
- пишет строки с `source='osm'`, `confidence=0.5`, `species_composition=NULL`
- PMTiles генерируются из `forest_unified` (см. [004_forest.sql](../db/migrations/004_forest.sql))

Ограничения OSM:
- нет разбивки на сосна/ель/кедр — только "хвойный"
- покрытие `leaf_type` неравномерное, местами все леса `unknown`
- геометрия не отражает реальные породные границы — это в основном контуры массивов

---

## 2. Цель: Copernicus HRL Tree Species

**Что это.** Продукт European Environment Agency (через Copernicus Land Monitoring Service). Растр 10 м с классификацией дерева по пикселю. Покрывает всю Европу, включая Ленобласть.

**Что даёт:**
- разрешение 10 м (в 100-1000 раз точнее OSM)
- конкретные породы: сосна, ель, берёза, дуб, бук, тополь и т.д.
- можно посчитать реальную **породную смесь** в произвольной области (не просто "мешанина")
- единообразное качество по всей территории

**Что стоит:**
- регистрация на [land.copernicus.eu](https://land.copernicus.eu), бесплатно для некоммерческого использования (для коммерции — проверить лицензию)
- данные в формате GeoTIFF, общий объём для Европы ~50 ГБ, для Ленобласти ~1-2 ГБ
- требует обработки растра: `rasterio`, `gdal`, `shapely`

---

## 3. Шаги миграции

### 3.1. Скачивание
```bash
make copernicus-download REGION=lenoblast
# внутри:
# - запрашивает bbox региона из таблицы region
# - качает tiles с Copernicus WEkEO/Dataspace по WCS/STAC API
# - складывает в data/copernicus/tree_species/{tile_id}.tif
```
Реализация: `services/geodata/src/geodata/sources/copernicus.py::CopernicusForestSource.fetch`

### 3.2. Векторизация
Растр → векторные полигоны по следующей стратегии:
1. Ресэмпл 10 м → 30 м (снизить шум)
2. Кластеризация смежных пикселей одного класса через `rasterio.features.shapes`
3. Отбросить кластеры < 0.25 га (слишком мелкие — шум)
4. Для каждого полигона посчитать **породную смесь**: считать окружающие пиксели в буфере 50 м, сохранить как `species_composition` JSON
5. Выбрать `dominant_species` по максимальной доле

Реализация: `services/geodata/src/geodata/sources/copernicus.py::CopernicusForestSource.normalize`

### 3.3. Загрузка в БД
```sql
-- Одной транзакцией:
INSERT INTO forest_polygon (region_id, source, source_feature_id, source_version,
                             geometry, area_m2, dominant_species,
                             species_composition, canopy_cover, confidence, meta)
VALUES (..., 'copernicus', ..., 'copernicus-hrl-tree-species-2018-v1',
        ..., ..., 'spruce',
        '{"spruce":0.72,"pine":0.18,"birch":0.10}'::jsonb, 0.85, 0.9, '{}');
```
`source_version` включает версию датасета, чтобы можно было хранить несколько версий и откатываться.

### 3.4. Переключение view
После наполнения Copernicus'ом обновляем `forest_unified`, чтобы он выбирал лучший источник **по пересечению геометрий**, а не просто сортировкой:

```sql
CREATE OR REPLACE VIEW forest_unified AS
WITH ranked AS (
  SELECT
    fp.*,
    fs.priority AS source_priority,
    ROW_NUMBER() OVER (
      PARTITION BY ST_SnapToGrid(ST_Centroid(fp.geometry), 0.001)
      ORDER BY fs.priority DESC, fp.confidence DESC
    ) AS rn
  FROM forest_polygon fp
  JOIN forest_source fs ON fs.code = fp.source
)
SELECT * FROM ranked WHERE rn = 1;
```

Это оставит OSM-полигоны там, где Copernicus ещё не загружен (например, если регион частично покрыт), и Copernicus-полигоны везде, где они есть.

### 3.5. Перегенерация тайлов
```bash
make tiles-forest
```
Тайлы читают `forest_unified` — никаких других изменений. Фронт просто начинает показывать более точную карту.

### 3.6. Валидация
- Сверить суммарную площадь леса OSM vs Copernicus в регионе — должны совпадать ±15%
- Пройтись глазами по 5-10 известным местам: Линдуловская роща (ель) должна быть ель, Лемболовские сосняки (сосна) — сосна
- Прогнать `test_forest_classification.py` — сравнение с заранее размеченным ground truth

---

## 4. Что не меняется

| Компонент | Изменения |
|---|---|
| Схема `forest_polygon` | нет (уже готова под Copernicus) |
| API эндпоинты | нет |
| Frontend | нет |
| `species_forest_affinity` | нет (те же slug'и пород) |
| Агрегация наблюдений | нет (привязка через ST_Intersects) |

Менять придётся только:
1. Реализацию `CopernicusForestSource.fetch/normalize` — **один файл**
2. Обновить `forest_unified` view — **одна миграция** `007_forest_unified_copernicus.sql`
3. Перегенерировать PMTiles

---

## 5. Альтернативы и комбинирование

- **Rosleshoz ВЛС** — публичная лесная карта России, породный состав по выделам (очень точно, но API недокументировано, нужен скрапинг). Приоритет 40 (выше OSM, ниже Copernicus).
- **PALSAR/Sentinel-2 ручная классификация** — свой ML, если качество Copernicus не устроит. Тот же интерфейс `ForestSource`.
- **Гибрид**: Copernicus для породы + Rosleshoz для границ выделов + OSM для "где вообще есть лес". Архитектура это допускает — разные источники пишутся в одну таблицу, view разрешает конфликты.

---

## 6. Checklist для миграции

- [ ] Зарегистрироваться в Copernicus Data Space
- [ ] Получить API-ключ / credentials
- [ ] Реализовать `CopernicusForestSource.fetch` (скачивание)
- [ ] Реализовать `CopernicusForestSource.normalize` (векторизация + смесь)
- [ ] Написать миграцию `007_forest_unified_copernicus.sql`
- [ ] Прогнать `make ingest-forest SOURCE=copernicus REGION=lenoblast`
- [ ] Валидация по чеклисту §3.6
- [ ] Перегенерация тайлов
- [ ] Обновить легенду на фронте (детальнее породы)
