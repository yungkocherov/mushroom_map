# Roadmap — что сделано и что дальше

Обновляется вручную после крупных изменений. Историю коммитов смотри
через `git log --oneline -30`.

## Этапы (в обратном хронологическом порядке)

### ✅ Этап 8 — Полное покрытие ЛО + UI + рефакторинг пайплайнов (апрель 2026)
- **Полная Ленобласть** — ~2M выделов (27.8–36.0°E), PMTiles 496 MB
  - Восточная зона (33–36°E): 480k тайлов ФГИС ЛК скачаны, 1.18M обработаны
  - fgislk_tiles_to_geojson → ingest_forest → build_tiles: 27 мин
- **Подписи населённых пунктов** — 7 116 точек из OSM Overpass
  - Собственный GeoJSON-слой (Versatiles тайлы не содержат village/hamlet ниже z12)
  - Zoom-фильтр: city z4+, town z6+, village z8+, hamlet z10+
  - Извлечение шрифтов из Versatiles-стиля для корректного рендера
- **Компактный UI** — "Доп. слои" сворачиваемая панель, тултипы, фильтр грибов
- **Рефакторинг пайплайнов**
  - `pipelines/tile_utils.py` — shared `build_dsn`, `lonlat_to_tile`, `region_bbox`
  - 199 строк дублирования удалено из 7 build-скриптов
  - `ST_TileEnvelope` CTE — вычисляется 1 раз вместо 2 за тайл

### ✅ Этап 7 — Новые слои + тесты (апрель 2026)
- **Болота** — 34 177 полигонов OSM `natural=wetland`, PMTiles 20 MB
- **Вырубки и гари** — 1 270 полигонов ФГИС ЛК `SPECIAL_CONDITION_AREA`, PMTiles 6 MB
- **Защитные леса** — 598 полигонов ФГИС ЛК `PROTECTIVE_FOREST`, PMTiles 14 MB
- **Лесные дороги** — 318 884 линии OSM, PMTiles 31 MB
  - Фикс: `r.geometry && ST_Transform(ST_TileEnvelope(), 4326)` вместо
    `ST_Transform(r.geometry, 3857) && ...` — разница 3+ часов vs 1 минута
- **34 теста**: 25 unit (formula parser) + 9 API smoke
- Миграции 014-016 (wetland, felling_area, protective_forest)

### ✅ Этап 6 — Оверлейные слои (апрель 2026)
- ООПТ — 419 полигонов из OSM, PMTiles 1.2 MB
- Водоохранные зоны — PMTiles 6.2 MB
- Даунлоадеры: `scripts/download_oopt_overpass.py`,
  `scripts/download_osm_roads_overpass.py`,
  `scripts/download_wetlands_overpass.py`
  (grid-split + retry + dedup по OSM way id)
- CLAUDE.md — дурабельные правила для Claude Code сессий

### ✅ Этап 5 — Оптимизация pipeline (апрель 2026)
- Pipeline 73 мин → 9 мин (~8×)
- WKB pass-through — обходит shapely целиком,
  PostGIS парсит через `ST_GeomFromWKB(decode(x, 'hex'))`
- area_m2 вычисляется в SQL через `ST_Area(ST_Transform(geom, 3857))`
- DELETE+INSERT вместо ON CONFLICT DO UPDATE
- COPY FROM STDIN вместо `cursor.executemany()`
- Multiprocessing в `fgislk_tiles_to_geojson.py`
- `CLUSTER forest_3857 USING idx_forest_3857_gix` в build_tiles

### ✅ Этап 4 — Интерфейс (апрель 2026)
- 4 подложки: OSM / Схема (Versatiles Colorful) / Спутник (ESRI) / Гибрид
- 3 режима раскраски леса: порода / бонитет / возраст
- Попап: бонитет, запас м³/га, возрастная группа, виды грибов
- Сезонный фильтр видов, поиск по виду и по месту (Nominatim)
- Share URL, координаты под курсором, URL sync `?lat=&lon=&z=`
- Patch Versatiles стиля: sprite array→string, text-size ×1.6,
  label minzoom понижен на 2-3 уровня
- 7 тоггл-кнопок слоёв в UI

### ✅ Этап 3 — Rosleshoz/ФГИСЛК — первичное покрытие (апрель 2026)
- ~913k полигонов, западная часть ЛО до 33°E (Карельский перешеек)
- bonitet, timber_stock, age_group в `meta JSONB`
- PMTiles 322 MB

### ✅ Этап 2 — Первичные данные лесов
- OSM ingest через Overpass — 47k полигонов, 88% unknown
- `ForestSource` абстракция с приоритетами
  (rosleshoz=60 > copernicus=50 > terranorte=45 > osm=10)

### ✅ Этап 1 — Инфраструктура
- PostGIS + Docker Compose
- Миграции 001..016
- FastAPI + React + MapLibre GL + PMTiles

---

## Что дальше — по приоритету

### 🔴 Высокий приоритет

1. **VK-наблюдения** (запуск существующего парсера)
   - *Зачем:* эмпирические данные для тепловой карты и попапа
   - *Как:* получить VK_TOKEN, запустить LM Studio с Gemma 3 12B,
     прогнать `pipelines/ingest_vk.py` (4 стадии), затем
     `pipelines/extract_places.py` (NER + H3)
   - *Блокер:* нужен работающий LM Studio + ~10 GB под модель
   - *Оценка:* 1 день настройки + несколько часов прогона

2. **Тепловая карта H3** (`observation_h3_species_stats`)
   - *Зачем:* "горячие точки" видны без клика
   - *Как:* API endpoint `GET /api/observations/h3?bbox=&species=`,
     фронт-слой на fill-color ramp с hex-полигонами
   - *Блокер:* нужны VK-наблюдения (п.1)
   - *Оценка:* 2-3 дня

### 🟡 Средний приоритет

3. **CI/CD** — `.github/workflows/test.yml`
   - Сейчас тесты запускаются только руками
   - *Оценка:* 2 часа

4. **Мобильная вёрстка** — сейчас только desktop
   - Компактные контролы уже есть, но touch-оптимизации нет

5. **Материализация `forest_unified`** — при добавлении второго региона
   VIEW с NOT EXISTS станет O(n²). Нужна `MATERIALIZED VIEW` с
   `REFRESH` после каждого ingest.

6. **Инкрементальный tile build** — сейчас build_tiles.py пересчитывает
   все тайлы с нуля. С 2M полигонами ~5 мин, но дальше будет расти.

### 🟢 Низкий приоритет / "когда-нибудь"

7. **Рельеф / хиллшейдинг** — Copernicus DEM 30m
8. **Точки доступа** — OSM `highway=bus_stop` + `amenity=parking`
9. **PWA offline-mode** — загрузка региона без интернета
10. **Лента последних находок** — `GET /api/observations/recent?bbox=`
11. **Временной фильтр наблюдений** — слайдер "последние 2-3 года"
    - *Блокер:* нужны VK-наблюдения
