# Roadmap — что сделано и что дальше

Обновляется вручную после крупных изменений. Историю коммитов смотри
через `git log --oneline -30`.

## Этапы (в обратном хронологическом порядке)

### ✅ Этап 6 — Оверлейные слои (апрель 2026)
- OSM дороги (track/path/footway/bridleway/cycleway) — 353 867 линий,
  скачаны через Overpass в `scripts/download_osm_roads_overpass.py`
  (3×3 bbox grid с ретраями и дедупом по OSM way id)
- ООПТ — 419 полигонов из OSM boundary=protected_area + leisure=
  nature_reserve, скачаны через `scripts/download_oopt_overpass.py`

### ✅ Этап 5 — Оптимизация pipeline (апрель 2026)
- Pipeline 73 мин → 9 мин (~8×)
- WKB pass-through в rosleshoz source — обходит shapely целиком,
  PostGIS парсит WKB в C-коде через `ST_GeomFromWKB(decode(x, 'hex'))`
- area_m2 вычисляется в SQL через `ST_Area(ST_Transform(geom, 3857))`
- DELETE+INSERT вместо ON CONFLICT DO UPDATE — убирает стоимость
  rewrite старых tuples
- COPY FROM STDIN вместо `cursor.executemany()`
- Multiprocessing в `fgislk_tiles_to_geojson.py` (ProcessPoolExecutor
  по X-директориям)
- `CLUSTER forest_3857 USING idx_forest_3857_gix` в build_tiles

### ✅ Этап 4 — Интерфейс (апрель 2026)
- 4 подложки: OSM / Схема (Versatiles Colorful) / Спутник (ESRI) / Гибрид
- 3 режима раскраски леса: порода / бонитет / возраст
- Попап: бонитет, запас м³/га, возрастная группа, виды грибов
  (теоретически из species_forest_affinity)
- Сезонный фильтр видов в попапе
- Поиск по виду гриба (фильтр лесного слоя) и по месту (Nominatim)
- Share URL, координаты под курсором, URL sync `?lat=&lon=&z=`
- Тоггл-кнопки: Лес / Водоохрана / ООПТ / Дороги
- Patch Versatiles стиля: sprite array→string, text-size ×1.6,
  label-place-* minzoom понижен на 2-3 уровня

### ✅ Этап 3 — Rosleshoz/ФГИСЛК — полное покрытие (апрель 2026)
- 1 086 247 полигонов на всю Ленобласть до 33°E
- bonitet, timber_stock, age_group в `meta JSONB`
- PMTiles 438 MB, 15 105 тайлов

### ✅ Этап 2 — Первичные данные лесов
- OSM ingest через Overpass — 47k полигонов, 88% unknown
- `ForestSource` абстракция с приоритетами
  (rosleshoz=60 > copernicus=50 > terranorte=45 > osm=10)

### ✅ Этап 1 — Инфраструктура
- PostGIS + Docker Compose
- Миграции 001..013
- FastAPI + React + MapLibre GL + PMTiles

---

## Что дальше — по приоритету

### 🔴 Высокий приоритет

1. **Болота** (OSM `natural=wetland`, `wetland=bog`)
   - *Зачем:* безопасность (не зайти в топь) + клюква/морошка/моховики
   - *Как:* `scripts/download_wetlands_overpass.py` (клон roads-скрипта),
     миграция `014_wetlands.sql`, `ingest_wetlands.py`, `build_wetlands_tiles.py`,
     фронт-тоггл
   - *Оценка:* 1 день

2. **Тепловая карта H3** (`observation_h3_species_stats`)
   - *Зачем:* "горячие точки" видны без клика, сразу показывает где чаще находят
   - *Как:* API endpoint `GET /api/observations/h3?bbox=&species=`, фронт-слой
     на fill-color ramp + `h3` для hexagons. Данные уже есть в matview.
   - *Блокер:* нужны реальные VK-наблюдения (см. ниже)
   - *Оценка:* 2-3 дня

3. **VK-наблюдения** (запуск существующего парсера)
   - *Зачем:* эмпирические данные для тепловой карты и попапа
   - *Как:* получить VK_TOKEN, запустить LM Studio с Gemma 3 12B,
     прогнать `pipelines/ingest_vk.py` (4 стадии), затем
     `pipelines/extract_places.py` (NER + H3)
   - *Блокер:* нужен работающий LM Studio и ~10 GB места для модели
   - *Оценка:* 1 день настройки + несколько часов прогона

4. **Расширение покрытия на восток** (Тихвин, Бокситогорск)
   - *Зачем:* сейчас данные только до 33°E, вся Ленобласть до ~36°E
   - *Как (автоматизация):*
     ```bash
     python pipelines/download_fgislk_tiles.py --bbox 33.0,58.5,36.0,61.0 \
         --out data/rosleshoz/fgislk_tiles
     python pipelines/fgislk_tiles_to_geojson.py \
         --in data/rosleshoz/fgislk_tiles \
         --out data/rosleshoz/fgislk_vydels_full.geojson
     python pipelines/ingest_forest.py --source rosleshoz --region lenoblast \
         --rosleshoz-file data/rosleshoz/fgislk_vydels_full.geojson \
         --rosleshoz-version fgislk-karelian-2026
     python pipelines/build_tiles.py --region lenoblast
     ```
     Это цепочка из существующих скриптов — можно обернуть в
     `scripts/reingest_rosleshoz.sh` одним вызовом.
   - *Оценка:* 1 час на запуск (большая часть времени — download ФГИС ЛК тайлов)

### 🟡 Средний приоритет

5. **Тесты**
   - `services/geodata/tests/test_formula_parser.py` — чисто-функциональный
     (2 часа)
   - `services/api/tests/conftest.py` + `test_api_smoke.py` — smoke для
     `/api/forest/at` и `/api/species/search` (1 день)
   - `tests/test_forest_unified.py` — проверка priority cascade (4 часа)
   - `.github/workflows/test.yml` — CI

6. **Вырубки и гари** — ФГИС ЛК слой `SPECIAL_CONDITION_AREA`
   - *Зачем:* на 3-7-летних вырубках массово растут подосиновики, маслята, опята
   - *Как:* patch в `fgislk_tiles_to_geojson.py` — добавить ещё один
     source-layer extraction, новая таблица `felling_area`, новый PMTiles,
     тоггл в UI
   - *Оценка:* 1 день

7. **Защитные леса** — ФГИС ЛК слой `PROTECTIVE_FOREST`
   - *Зачем:* запретные полосы, городские леса, сбор ограничен
   - *Как:* аналогично вырубкам — patch экстрактора, отдельный слой
   - *Оценка:* 1 день (делается вместе с вырубками)

8. **Временной фильтр наблюдений** — слайдер "последние 2-3 года"
   - *Блокер:* нужны реальные VK-наблюдения

### 🟢 Низкий приоритет / "когда-нибудь"

9. **Рельеф / хиллшейдинг** — Copernicus DEM 30m. Низины = сырость = подберёзовики,
   склоны = дренаж = рыжики/грузди
10. **Точки доступа** — OSM `highway=bus_stop` + `amenity=parking` возле леса
11. **Мобильная вёрстка** — сейчас только desktop
12. **PWA offline-mode** — загрузка региона для использования без интернета в лесу
13. **Лента последних находок** — `GET /api/observations/recent?bbox=`,
    "3 дня назад нашли белые"
