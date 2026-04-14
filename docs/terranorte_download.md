# Как получить TerraNorte RLC для Ленобласти

TerraNorte RLC (Russia Land Cover) — научный продукт **Института
космических исследований РАН** (ИКИ РАН), группа С.А. Барталёва.
Классификация растительного покрова **всей России** по временным рядам
MODIS, 230 м, ежегодно.

Нам он нужен потому что Copernicus HRL заканчивается на границе EEA39
и Россия в нём не покрыта. TerraNorte — единственный публичный научный
продукт, который даёт разделение **ель/сосна/лиственница/берёза** для
российских лесов без скрапинга кадастра. Подробный анализ альтернатив —
в [forest_sources_analysis.md](forest_sources_analysis.md).

---

## Шаг 1. Заходишь на сайт

**URL:** http://terranorte.iki.rssi.ru/

Это сайт лаборатории спутникового мониторинга растительного покрова
(лаб. 55 ИКИ РАН). Сайт немного «академический» — ищи раздел
**«Products»** / **«Products and Services»** / **«Данные»** /
**«TerraNorte RLC»** в верхнем меню.

Альтернативная точка входа через общий сайт института:
https://smiswww.iki.rssi.ru/ → раздел Vega, продукты растительного
покрова.

---

## Шаг 2. Находишь продукт «Russia Land Cover»

Название может быть указано как:
- **«TerraNorte RLC»**
- **«Russia Land Cover»**
- **«Карта растительного покрова России»**
- **«RLC 20xx»** (где xx — год)

На странице продукта обычно есть:
- Описание легенды (важно для class_map — см. шаг 4)
- Ссылка на последнюю версию
- Публикации (Bartalev et al., Remote Sensing of Environment)
- Контакт для получения данных

---

## Шаг 3. Получение данных

**Варианты доступа могут меняться. Наиболее вероятные:**

### Вариант A — прямое скачивание

Если на странице есть кнопка **«Download»** / **«Скачать»** — жмёшь,
выбираешь формат **GeoTIFF** (не GRID, не HDF, не shapefile), качаешь
весь растр России или тайлы по выбранной области.

### Вариант B — запрос по email

Иногда научные продукты ИКИ РАН отдают по запросу. На странице должен
быть контактный email (обычно bartalev[a]iki.rssi.ru или
labveget[a]smis.iki.rssi.ru). Формат письма:

> Здравствуйте,
>
> Я разрабатываю интерактивную карту грибных мест Ленинградской области
> (некоммерческий проект, https://github.com/yungkocherov/mushroom_map).
> Для классификации типов лесных массивов хотел бы использовать
> продукт TerraNorte RLC последней версии.
>
> Возможно ли получить GeoTIFF на bbox (27.8E, 58.5N) — (33.0E, 61.8N)
> или карту всей России для некоммерческого использования с указанием
> авторства?
>
> Спасибо!

### Вариант C — Vega-Web

ИКИ РАН раздаёт часть продуктов через сервис **Vega** (vega.ru.net
или sci-vega.ru). Там нужна регистрация, но можно экспортировать
выбранный слой в GeoTIFF по bbox.

---

## Шаг 4. Самое важное — сверь легенду классов

**Маппинг классов `DEFAULT_TERRANORTE_CLASS_MAP` в коде — это best guess**
по публикациям группы Барталёва. Реальные коды классов в твоей
конкретной поставке могут отличаться:

- В разных годах продукт выходил с разной легендой
- 23-класс vs 15-класс vs упрощённые варианты

Когда скачаешь файл — пришли мне **либо** скриншот легенды со страницы
продукта, **либо** вывод метаданных:

```bash
.venv/Scripts/python.exe -c "
import rasterio
with rasterio.open('data/terranorte/rlc_2020.tif') as src:
    print('nodata:', src.nodata)
    print('dtype:', src.dtypes[0])
    print('unique values:', set(src.read(1).flatten().tolist()[:1000000]))
    print('tags:', src.tags())
    try:
        print('colormap:', src.colormap(1))
    except Exception:
        print('no colormap')
"
```

Я на основе этого откорректирую маппинг в
`services/geodata/src/geodata/sources/terranorte.py::DEFAULT_TERRANORTE_CLASS_MAP`.

---

## Шаг 5. Раскладка файлов

```
mushroom-map/
└── data/
    └── terranorte/
        ├── rlc_2020.tif          ← основной растр
        ├── rlc_2020.aux.xml      ← метаданные (если есть)
        └── class_map.yaml        ← опционально: твой маппинг классов
```

Файлы в `data/terranorte/` не коммитятся в git (см. `.gitignore`).

---

## Шаг 6. Применение миграции

```bash
python db/migrate.py
```

Применит миграцию `009_forest_unified_terranorte.sql` — она:
- Регистрирует TerraNorte в таблице `forest_source` с приоритетом 45
- Обновляет view `forest_unified` с каскадом copernicus(50) > terranorte(45) > osm(10)
- Создаёт partial GIST-индекс на terranorte-полигонах

---

## Шаг 7. Запуск ingest

```bash
# Dry-run сначала — посмотреть сколько полигонов получится
python pipelines/ingest_forest.py --source terranorte --region lenoblast --dry-run

# Реальная запись
python pipelines/ingest_forest.py --source terranorte --region lenoblast

# Если скачал один огромный файл на всю Россию:
python pipelines/ingest_forest.py --source terranorte --region lenoblast \
    --copernicus-dir data/terranorte \
    --copernicus-product iki-rlc-2020

# Если у тебя свой class_map.yaml (после проверки легенды):
python pipelines/ingest_forest.py --source terranorte --region lenoblast \
    --copernicus-class-map data/terranorte/class_map.yaml
```

**Полезные флаги** (флаги называются `--copernicus-*` — мы переиспользуем
код):

| Флаг | Для TerraNorte |
|---|---|
| `--copernicus-dir` | Папка с GeoTIFF (по умолчанию `data/terranorte/`) |
| `--copernicus-product` | Слаг для source_version, напр. `iki-rlc-2020` |
| `--copernicus-class-map` | Свой YAML/JSON маппинг классов |
| `--copernicus-min-m2` | Мин. площадь полигона (по умолчанию 50000 = 5 га, потому что 230 м пиксель) |

---

## Шаг 8. Перегенерация PMTiles

```bash
python pipelines/build_tiles.py
```

---

## Шаг 9. Валидация

```sql
-- Распределение по классам
SELECT dominant_species, COUNT(*), ROUND(SUM(area_m2)/1e6) AS km2
FROM forest_polygon WHERE source='terranorte' AND region_id=1
GROUP BY dominant_species ORDER BY 3 DESC;
```

**Ожидаемо для Ленобласти:**
- ель (spruce): ~40% (доминирует на севере и востоке области)
- сосна (pine): ~30% (Карельский перешеек, южные песчаные массивы)
- берёза (birch): ~15% (вторичные леса, вырубки)
- смешанное + прочее: ~15%

Если распределение резко другое — скорее всего неверный class_map,
см. шаг 4.

**Глазом проверь:**
- Линдуловская роща (60.150, 29.583) → должна быть ель (`spruce`)
- Лемболовская возвышенность (60.250, 30.200) → должна быть сосна (`pine`)
- Окрестности Выборга (60.71, 28.75) → смешанные, с большой долей сосны

---

## Ссылки

- Сайт группы: http://terranorte.iki.rssi.ru/
- ИКИ РАН: https://iki.rssi.ru/
- Vega: http://vega.smislab.ru/ или https://sci-vega.ru/
- Ключевая публикация: Bartalev S.A. et al. (2014) «A new SPOT4-VEGETATION
  derived land cover map of Northern Eurasia», International Journal of
  Remote Sensing, 32 (18).

---

## Что мне нужно от тебя

1. **Регистрация / запрос на получение данных** — пройти шаги 1-3 выше.
2. **Прислать легенду классов** — после того как скачаешь, либо
   скриншот с сайта, либо вывод команды из шага 4. Без этого маппинг
   останется best-guess'ом и результат может быть шумный.
3. **Подтвердить, что разрешение 230 м тебе подходит** — если захочется
   большего, дальше Rosleshoz ВЛС scraping, но это 1-2 недели работы.
