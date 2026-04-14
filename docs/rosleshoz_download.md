# Как получить таксационные выделы Rosleshoz / ФГИС ЛК

Самый точный источник пород лесов России — **таксационные описания
выделов** из государственного лесного реестра. На 2026-04-14 нашли
**публичный путь** через MVT-тайлы ФГИС ЛК (см. **Вариант 0** ниже).

У нас готовы:

1. **Парсер формул** «6Е3С1Б» — для файлов, где формула записана в
   компактной нотации (старый путь через лесоустройство / GIS-Lab).
2. **Маппинг полных русских слов** («Ель» → spruce, «Берёза» → birch)
   — для файлов из ФГИС ЛК, где у каждого выдела только доминирующая порода.
3. **`RosleshozForestSource`** читает любой векторный файл (GeoJSON /
   Shapefile / GPKG / FlatGeobuf) с атрибутом `formula`/`tree_species`
   и превращает каждый выдел в строку `forest_polygon` с реальным
   `species_composition`.
4. **Downloader и конвертер MVT** — `pipelines/download_fgislk_tiles.py`
   и `pipelines/fgislk_tiles_to_geojson.py` (см. Вариант 0).

---

## Вариант 0 (рекомендуется!) — ФГИС ЛК публичная лесная карта через MVT

**Это рабочий путь, разобранный 2026-04-14.** Под официальным веб-вьюером
https://pub.fgislk.gov.ru/map/ крутится GeoWebCache, отдающий векторные
MVT-тайлы. Один тайл содержит 17 source-layer'ов, в том числе
**TAXATION_PIECE_PVS** — лесотаксационные выделы с полями:

| поле | описание | пример |
|---|---|---|
| `externalid` | «субъект:лесничество:участок:квартал:выдел» | `47:10:2:80:14` |
| `id` | уникальный числовой id выдела | `64396455` |
| `label_name` | номер выдела в квартале | `13` |
| `tree_species` | **доминирующая порода** | `Ель`, `Сосна`, `Береза`, `Ольха серая (белая)` |
| `age_group` | группа возраста | `спелые`, `молодняки`, `приспевающие`, ... |

**Ограничение:** `tree_species` даёт только доминирующую породу, не
полный состав вида `6Е3С1Б`. Для нашего попапа этого достаточно —
система хранит это как `species_composition={"<slug>": 1.0}` и
`dominant_species=<slug>`.

**Тайловая сетка кастомная (не стандартный Google XYZ):**
- EPSG:3857, origin `(-20037508.34, -20073348.34)`, 256×256 px
- **Зум 7-12** (выше нет), `z=12` = 2.8 м/пиксель
- Эндпоинт: `https://pub5.fgislk.gov.ru/plk/gwc-01/geowebcache/service/tms/1.0.0/FOREST_LAYERS:FOREST@EPSG:3857@pbf/{z}/{x}/{y}.pbf`

**Важно:** WAF на `pub.fgislk.gov.ru/geoserver/*` режет запросы с
иностранных IP (включая датацентровые VPN). Главная карта и pub5
субдомен проходят нормально. Для VPN-trouble см. «VPN и Claude Code»
ниже.

### Как пользоваться

```bash
# Шаг 1: посчитать план (сколько тайлов в bbox)
python pipelines/download_fgislk_tiles.py \
    --bbox 27.8,58.5,33.0,61.8 \
    --plan-only

# Шаг 2: скачать тайлы (concurrency можно поднимать до 16)
#   PoC (30x30 км): 2256 тайлов, ~4 минуты
#   Карельский перешеек: ~185k тайлов, ~5 часов
#   Вся Ленобласть: ~830k тайлов, ~24 часа
python pipelines/download_fgislk_tiles.py \
    --bbox 30.00,60.20,30.30,60.35 \
    --concurrency 12 \
    --out data/rosleshoz/fgislk_tiles

# Шаг 3: сконвертировать тайлы в единый GeoJSON
python pipelines/fgislk_tiles_to_geojson.py \
    --in data/rosleshoz/fgislk_tiles \
    --out data/rosleshoz/fgislk_vydels.geojson

# Шаг 4: применить миграцию 010 (если ещё не)
python db/migrate.py

# Шаг 5: ingest в forest_polygon
python pipelines/ingest_forest.py --source rosleshoz --region lenoblast \
    --rosleshoz-file data/rosleshoz/fgislk_vydels.geojson \
    --rosleshoz-formula-field tree_species \
    --rosleshoz-version fgislk-2026

# Шаг 6: перегенерация PMTiles
python pipelines/build_tiles.py
```

### VPN и Claude Code

У меня (ассистента) трафик идёт через VPN. WAF ФГИС ЛК режет
датацентровые VPN диапазоны на **определённых** путях
(`pub.fgislk.gov.ru/map/geo/geoserver/*`), но **не режет** pub5
субдомен и `/map/geo/map_api/*`. Поэтому мой `download_fgislk_tiles.py`
работает даже с VPN. Если что-то перестанет работать — проверь:
1. **GetCapabilities** (`pub.fgislk.gov.ru/map/geo/geoserver/wfs`) → 403
   — это НОРМА, мы этим путём не пользуемся.
2. **Layer tree** (`pub.fgislk.gov.ru/map/geo/map_api/layer/list`) → 200
   — должен работать.
3. **MVT тайл** (`pub5.fgislk.gov.ru/plk/gwc-01/.../12/32523/39602.pbf`)
   → 200 — должен работать.

---

## Альтернативные варианты (если Вариант 0 сломается)

Публичного REST-API с таксацией **не существует**. Раньше (до ФГИС ЛК)
данные доставались через:
1. Ведомственные web-viewer'ы (tile-слои).
2. Официальные запросы в лесничество.
3. Региональные ГИС-порталы.
4. Сторонние неофициальные сборки.

Ни один из этих путей не быстрый. Закладывайся на неделю-две
ожидания ответа от лесничества или на несколько часов поиска готовых
сборок в интернете. Это цена, если Вариант 0 перестанет работать.

---

## Вариант A — Портал ФГИС ЛК (lesegais.ru)

**Федеральная ГИС лесного комплекса** — центральная система учёта
лесного фонда РФ.

1. https://lesegais.ru — публичный сайт с картой и справочниками.
2. Зарегистрироваться можно, но экспорт геометрии выделов для внешних
   пользователей **закрыт** (только на просмотр в map viewer).
3. Если у тебя есть `gosuslugi.ru` — попробуй через ЕСИА, расширенный
   доступ. Обычно он тоже не даёт массовой выгрузки, но даёт API для
   точечных запросов.

**Реалистичная цель:** вытащить через web-inspector вызовы tile-сервера
(обычно WMS/WMTS или ArcGIS FeatureService) и прогнать через свой
скрипт. Найди в devtools endpoint вида:

```
https://lesegais.ru/gis/rest/services/.../FeatureServer/0/query?f=geojson&where=1=1&...
```

Если такой есть — это ArcGIS REST API, можно выгрузить в формате GeoJSON
постранично. Нужно соблюсти лимит `resultRecordCount` (обычно 1000 или
2000 записей за запрос).

---

## Вариант B — Региональный портал (ГИС-пространственных данных Ленобласти)

Иногда **региональные правительства** публикуют лесной слой вместе с
таксацией как open data:

1. https://gisogd.lenobl.ru — ГИС-панель Ленобласти. Проверь раздел
   «Природные ресурсы» / «Леса».
2. https://rgis.lenobl.ru — геопортал. Ищи слои «Лесничества»,
   «Таксационные выделы», «Лесоустройство».
3. http://www.lenles.ru/ — Комитет по природным ресурсам Ленобласти.
   Проверь раздел «Открытые данные».

Если что-то найдётся — формат обычно **ESRI Shapefile** или **GPKG**,
с атрибутом `TAX_FORMULA` / `SPECIES_COMP` / `ПОРОДА` / `СОСТАВ`.

---

## Вариант C — Запрос в лесничество

Самый медленный, но гарантированный путь.

1. Найди своё **лесничество** (для Ленобласти это ~20 лесничеств, каждое
   курирует несколько районов). Карту лесничеств можно посмотреть на
   http://www.lenles.ru/.
2. Напиши официальный запрос на получение копии таксационного описания
   лесных выделов для учебной/исследовательской цели. Пример:

   > Уважаемые коллеги,
   >
   > Я разрабатываю некоммерческое исследовательское приложение для
   > картографии лесных экосистем Ленинградской области
   > (https://github.com/yungkocherov/mushroom_map).
   >
   > Для построения карты породного состава прошу предоставить копию
   > актуального лесоустройства/таксации выделов в формате ESRI
   > Shapefile или GPKG, с атрибутами формулы породного состава
   > («6Е3С1Б») и номеров кварталов/выделов.
   >
   > Использование исключительно некоммерческое, с указанием авторства
   > лесничества как источника данных.

3. Ожидание ответа: от недели до месяца. Иногда просят приехать на
   встречу.

---

## Вариант D — Неофициальные сборки и open data

Иногда OSM-сообщество или исследователи выкладывают таксационные
слои. Проверь эти площадки:

1. https://github.com/search — ищи по словам `лесоустройство Ленобласть`
   `taxation shapefile Russia` `rosleshoz forest data`.
2. https://data.mos.ru — открытые данные Москвы (аналогичный портал есть
   у некоторых субъектов).
3. Академические GIS-сборки: https://geoportal.rgo.ru.

**Минус:** актуальность не гарантирована, лицензия не всегда чистая,
атрибуты могут быть без формулы.

---

## Что именно сохранить

Нужен **векторный файл** (ESRI Shapefile / GeoPackage / GeoJSON /
FlatGeobuf), где:

- **Геометрия** = полигон выдела в WGS84 или любом CRS (скрипт сам
  перепроецирует в 4326).
- **Атрибут с формулой** — обязательно. Название может быть любым:
  `formula`, `species_formula`, `SPECIES_COMP`, `TAX_FORMULA`,
  `породный_состав`, `состав`, `PORODA` и т.п. Если автоопределение не
  сработает — укажешь явно через `--rosleshoz-formula-field`.
- Формат формулы: стандартный **«6Е3С1Б ед.Ол»** (см.
  [services/geodata/src/geodata/sources/rosleshoz/formula.py](../services/geodata/src/geodata/sources/rosleshoz/formula.py)
  для полного списка поддерживаемых сокращений).
- **Атрибут id (опционально)** — `vydel_id`, `OBJECTID`, `GID` —
  для воспроизводимости и отладки.

---

## Шаг 1. Раскладка файлов

```
mushroom-map/
└── data/
    └── rosleshoz/
        ├── lenoblast_vydels.gpkg    ← основной файл
        │   или
        ├── lenoblast_vydels.shp     ← ESRI Shapefile (+ .dbf .shx .prj)
        │   или
        └── lenoblast_vydels.geojson
```

Файлы в `data/rosleshoz/` в git не коммитятся (см. `.gitignore`).

---

## Шаг 2. Проверь что за атрибуты в файле

```bash
.venv/Scripts/python.exe -c "
import pyogrio
info = pyogrio.read_info('data/rosleshoz/lenoblast_vydels.gpkg')
print('features:', info.get('features'))
print('fields:', info.get('fields'))
print('crs:', info.get('crs'))
print('geometry_type:', info.get('geometry_type'))
"
```

Если поле с формулой называется не стандартно — запомни имя, потом
передашь через `--rosleshoz-formula-field`.

---

## Шаг 3. Посмотри пример формулы

```bash
.venv/Scripts/python.exe -c "
import pyogrio
_, _, _, fields = pyogrio.raw.read('data/rosleshoz/lenoblast_vydels.gpkg', max_features=10, encoding='utf-8')
for arr in fields:
    print(arr[:10])
"
```

Если видишь строки типа `6Е3С1Б`, `10С+Б`, `4Б3Ос2Е1Ол` — всё ок,
парсер их съест.

Если формулы в виде **отдельных полей** (например, `SPECIES1=Е PCT1=60
SPECIES2=С PCT2=30 ...`), напиши — сделаем адаптер, который сшивает
их в формулу перед парсингом.

---

## Шаг 4. Применение миграции

```bash
python db/migrate.py
```

Миграция `010_forest_unified_rosleshoz.sql`:
- Регистрирует rosleshoz в `forest_source` с приоритетом 60
- Обновляет view `forest_unified` — теперь каскад
  `rosleshoz(60) > copernicus(50) > terranorte(45) > osm(10)`
- Создаёт partial GIST-индекс на rosleshoz-полигонах

---

## Шаг 5. Запуск ingest

```bash
# Dry-run
python pipelines/ingest_forest.py --source rosleshoz --region lenoblast --dry-run \
    --rosleshoz-file data/rosleshoz/lenoblast_vydels.gpkg

# Реальная запись
python pipelines/ingest_forest.py --source rosleshoz --region lenoblast \
    --rosleshoz-file data/rosleshoz/lenoblast_vydels.gpkg \
    --rosleshoz-version lo-2024-q1

# Если поле с формулой называется нестандартно:
python pipelines/ingest_forest.py --source rosleshoz --region lenoblast \
    --rosleshoz-file data/rosleshoz/lenoblast_vydels.gpkg \
    --rosleshoz-formula-field SPECIES_COMP \
    --rosleshoz-id-field OBJECTID \
    --rosleshoz-version lo-2024-q1
```

### Флаги

| Флаг | Что задаёт |
|---|---|
| `--rosleshoz-file` | Путь к векторному файлу |
| `--rosleshoz-layer` | Имя слоя (GPKG может содержать несколько) |
| `--rosleshoz-formula-field` | Имя поля с формулой (авто-определение если не задано) |
| `--rosleshoz-id-field` | Имя поля с id выдела |
| `--rosleshoz-version` | Слаг версии, идёт в `source_version` — так можно хранить несколько версий параллельно |
| `--rosleshoz-min-m2` | Мин. площадь выдела (по умолчанию 1000 м² = 0.1 га) |

---

## Шаг 6. Перегенерация PMTiles

```bash
python pipelines/build_tiles.py
```

---

## Шаг 7. Валидация

```sql
-- Распределение пород по площади (самое информативное)
SELECT dominant_species, COUNT(*), ROUND(SUM(area_m2)/1e6) AS km2
FROM forest_polygon WHERE source='rosleshoz' AND region_id=1
GROUP BY dominant_species ORDER BY 3 DESC;

-- Примеры реальных композиций
SELECT dominant_species, species_composition, meta->>'formula' AS formula
FROM forest_polygon
WHERE source='rosleshoz' AND region_id=1
LIMIT 20;

-- Сколько выделов не распарсились (отсутствуют из-за ошибки формулы)
-- (смотри вывод ingest-пайплайна — он пишет warning'и)
```

**Ожидания для Ленобласти:**
- ель (spruce): ~40%
- сосна (pine): ~30%
- берёза (birch): ~15%
- осина (aspen): ~5%
- ольха (alder): ~5%
- смешанные: остальное

---

## Формат формул: что поддерживается

Смотри [services/geodata/src/geodata/sources/rosleshoz/formula.py](../services/geodata/src/geodata/sources/rosleshoz/formula.py),
словарь `SPECIES_ABBR_TO_SLUG`. Сейчас поддерживается:

**Хвойные:**  
`Е` ель → spruce, `П/Пх` пихта → fir, `С` сосна → pine, `К/Кс/Кдр` кедр → cedar, `Л/Лц` лиственница → larch

**Мелколиственные:**  
`Б` берёза → birch, `Ос` осина → aspen, `Ол/Олс/Олч` ольха → alder

**Широколиственные:**  
`Д` дуб → oak, `Лп` липа → linden, `Кл` клён → maple

**Отдельные виды**, у которых нет своего slug'а (попадают в `meta.unmapped`):  
ива, ясень, вяз, тополь, граб, бук, яблоня, груша, рябина, черёмуха.
Они не ломают парсинг — остальные виды перенормируются.

**Примеси:**  
`8Е2Б+Ос` — «плюс» означает trace (~2%). `ед.Ос` то же самое.

Если ты встретишь формулу, которая не парсится — пришли мне пример,
расширим словарь.

---

## Ссылки

- ФГИС ЛК: https://lesegais.ru
- Rosleshoz: https://rosleshoz.gov.ru
- Личный кабинет лесопользователя: https://lk.rosleshoz.gov.ru
- Комитет по природным ресурсам ЛО: http://www.lenles.ru/
- Геопортал ЛО: https://rgis.lenobl.ru
