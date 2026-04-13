# Как скачать данные Copernicus HRL для Ленобласти

Документ описывает, **куда зайти, что нажать и что положить в какую папку**,
чтобы пайплайн `pipelines/ingest_forest.py --source copernicus` смог
векторизовать спутниковые растры и записать их в БД.

Копировать GeoTIFF'ы из этого окружения невозможно: нужны учётка Copernicus
и вручную принятая лицензия. Всё ниже делается в браузере один раз.

---

## TL;DR (для тех кто уже знает)

1. Регистрируешься на https://land.copernicus.eu (бесплатно).
2. Качаешь продукт **HRL Dominant Leaf Type (DLT) 2018**, 10 m, tile-формат,
   тайлы которые покрывают bbox Ленобласти.
3. Распаковываешь GeoTIFF'ы в `data/copernicus/tree_species/`.
4. (Опционально) Качаешь **HRL Tree Cover Density (TCD) 2018** в
   `data/copernicus/tcd/`.
5. Запускаешь:
   ```bash
   python db/migrate.py                  # применит миграцию 008 (smart view)
   python pipelines/ingest_forest.py --source copernicus --region lenoblast
   python pipelines/build_tiles.py       # перегенерировать PMTiles
   ```

---

## Шаг 1. Регистрация на Copernicus Land Monitoring Service

Copernicus Land (CLMS) — это европейская платформа EEA. Данные HRL бесплатны
для всех целей, включая коммерческие, при условии ссылки на источник.

1. Открой https://land.copernicus.eu
2. В правом верхнем углу — кнопка **«Sign in / Register»**.
3. Зарегистрируйся через EU Login (Eu Login — единая учётка Еврокомиссии,
   используется везде на .europa.eu).
4. После подтверждения email зайди обратно на land.copernicus.eu.

**Нужен ли API-ключ?** Нет. Для скачивания готовых растровых тайлов
достаточно авторизации через EU Login. API-ключ нужен только для
автоматизированного скачивания через CDSE (Copernicus Data Space Ecosystem) —
это отдельный путь, для которого нам пока не хватает объёмов.

---

## Шаг 2. Какой продукт качать

### Вариант A (рекомендуется для старта) — HRL Dominant Leaf Type (DLT)

**Зачем:** самое простое и надёжное. Делит лес на 2 класса — хвойный
и широколистный — на всей территории Европы с разрешением 10 м.
Для России это уже в разы лучше чем OSM (где 88% полигонов `unknown`).

1. Открой каталог: https://land.copernicus.eu/en/products/forests/dominant-leaf-type
2. Нажми на **«Dominant Leaf Type 2018»** (или последний доступный год).
3. Внизу карточки — раздел **«Download»**, кнопка **«Download tool»**
   (или напрямую: https://land.copernicus.eu/en/map-viewer).
4. Открывается **CLMS Map Viewer**. В нём нужно:
   - В левой панели выбрать слой **«Dominant Leaf Type 2018, 10 m»**.
   - На карте **нарисовать bbox Ленобласти** через инструмент «Rectangle».
     Примерный bbox: (27.8 E, 58.5 N) — (33.0 E, 61.8 N). Либо
     «Administrative Unit» → найти Leningrad Oblast (если там есть
     российские регионы, что не всегда — тогда рисуй bbox руками).
   - Нажать **«Request download»**.
5. Через несколько минут на твою почту придёт письмо со ссылкой
   на архив `.zip`. Ссылка живёт ~48 часов.

**Что в архиве:**
- `*.tif` — растр с классами 0/1/2 (0=nodata, 1=broadleaved, 2=coniferous).
- `*.tif.aux.xml` / `*.clr` — метаданные.
- `*.xml` — описание проекции и легенды.

### Вариант B (позже) — HRL Tree Species (если станет нужнее)

Продукт с конкретными видами (Pinus sylvestris, Picea abies, Betula и т.д.)
разрабатывается, на момент апреля 2026 для России может быть недоступен.
Проверь: https://land.copernicus.eu/en/products/forests

Если доступен — файлы кладутся туда же (`data/copernicus/tree_species/`),
меняется только маппинг классов (см. шаг 4).

### Опционально — HRL Tree Cover Density (TCD)

Нужен чтобы отсечь «не лес» (участки с low canopy cover).

1. https://land.copernicus.eu/en/products/forests/tree-cover-density
2. Скачать тот же год (2018) тем же способом.
3. Распаковать в `data/copernicus/tcd/`.

---

## Шаг 3. Распаковка и раскладка файлов

```
mushroom-map/
└── data/
    └── copernicus/
        ├── tree_species/       ← сюда положи DLT или Tree Species GeoTIFF'ы
        │   ├── DLT_2018_010m_N61E30.tif
        │   ├── DLT_2018_010m_N61E31.tif
        │   └── ...
        └── tcd/                ← опционально, сюда TCD GeoTIFF'ы
            └── TCD_2018_010m_N61E30.tif
```

Имена файлов не важны — код забирает всё с расширением `.tif`/`.tiff`.

Ожидаемые объёмы для Ленобласти: ~10-15 тайлов DLT, суммарно ~500 МБ – 2 ГБ.

---

## Шаг 4. Маппинг классов (если нужно)

По умолчанию код сконфигурирован под **DLT 2018**:

```python
# services/geodata/src/geodata/sources/copernicus.py
DLT_CLASS_MAP = {
    1: "mixed_broadleaved",
    2: "mixed_coniferous",
}
```

Если ты скачал **другой продукт** (например, Tree Species с детальными
классами), подготовь YAML:

```yaml
# data/copernicus/class_map.yaml
1:  fir
2:  birch
4:  oak
5:  pine
6:  spruce
7:  larch
8:  mixed_broadleaved
9:  mixed_coniferous
```

И при ingest передай его:

```bash
python pipelines/ingest_forest.py \
    --source copernicus \
    --region lenoblast \
    --copernicus-class-map data/copernicus/class_map.yaml
```

Допустимые slug'и пород — см. [services/geodata/src/geodata/types.py](../services/geodata/src/geodata/types.py)
(`ForestTypeSlug`). Если нужен новый slug (например, `beech`) — добавь
его в `FOREST_TYPE_SLUGS`, добавь запись в `species_forest_affinity`
и прогони миграции.

---

## Шаг 5. Применение миграции smart view

Один раз после того как скачал данные:

```bash
python db/migrate.py
```

Миграция `008_forest_unified_copernicus.sql` переопределит view
`forest_unified` так, чтобы Copernicus-полигоны имели приоритет везде, где
они есть, а OSM-полигоны показывались только в областях без Copernicus.

---

## Шаг 6. Запуск ingest

```bash
# dry-run сначала: просто посчитает сколько полигонов получится
python pipelines/ingest_forest.py --source copernicus --region lenoblast --dry-run

# реальная запись в БД
python pipelines/ingest_forest.py --source copernicus --region lenoblast
```

Полезные флаги:

| Флаг | Описание |
|------|----------|
| `--copernicus-dir PATH` | Другая директория с GeoTIFF'ами (по умолчанию `data/copernicus/tree_species`) |
| `--copernicus-tcd-dir PATH` | Директория с TCD-растрами для фильтра «не лес» |
| `--copernicus-product SLUG` | Идёт в `source_version`, напр. `hrl-tree-species-2024` |
| `--copernicus-class-map PATH` | YAML/JSON с кастомным маппингом классов |
| `--copernicus-min-m2 N` | Минимальная площадь полигона (по умолчанию 2500 м² = 0.25 га) |
| `--copernicus-tcd-min N` | Порог tree cover density 0..100, если задан tcd-dir |

---

## Шаг 7. Перегенерация PMTiles

```bash
python pipelines/build_tiles.py
```

Этот шаг читает `forest_unified` (который теперь выдаёт Copernicus где есть),
собирает PMTiles, кладёт их в `data/tiles/`. API их автоматически отдаёт
через `StaticFiles`.

Открой http://localhost:5173 — и увидишь более точную карту.

---

## Шаг 8. Валидация

Критерии «хорошо получилось»:

1. **Суммарная площадь леса** (SQL: `SELECT SUM(area_m2) FROM forest_polygon
   WHERE source='copernicus' AND region_id=1;`) должна совпадать с
   OSM-площадью ±15%. Если отличается сильно — либо не все тайлы скачаны,
   либо не тот продукт.
2. **Известные места:**
   - Линдуловская роща (60.150, 29.583) — должна быть `mixed_coniferous`
     (ель + лиственница).
   - Лемболовские сосняки (60.250, 30.200) — `mixed_coniferous` (сосна).
   - Парк Монрепо (60.717, 28.745) — `mixed_broadleaved` (смешанный).
3. **Распределение классов:**
   ```sql
   SELECT dominant_species, COUNT(*), SUM(area_m2)/1e6 AS km2
   FROM forest_polygon WHERE source='copernicus' AND region_id=1
   GROUP BY dominant_species ORDER BY 3 DESC;
   ```
   Для Ленобласти ожидаем примерно: coniferous ~60%, broadleaved ~40%.

---

## Что делать если что-то пошло не так

### Map Viewer не отдаёт Россию
Некоторые слои CLMS ограничены EEA39 (страны EEA + UK + Западные Балканы).
Россия может быть исключена из пан-европейского покрытия. В этом случае:
- Попробуй **EU DEM** и **Corine Land Cover 2018** — там Россия
  иногда попадает в зону «зарамочного покрытия».
- Альтернатива: **ESA WorldCover 2021** — 10 м, но не species-specific,
  только land cover classes. Подойдёт как проксирование через leaf_type.
- Или **Rosleshoz ВЛС** — отдельный путь, см. `docs/copernicus_migration.md` §5.

Код `CopernicusForestSource` переваривает любой GeoTIFF с классами, так что
можно подпереть его любым альтернативным растром.

### Пайплайн падает с `CRS` = None
GeoTIFF без проекции. Проверь, что скачал готовые продукты CLMS, а не
«сырые» снимки Sentinel-2. У CLMS всё в EPSG:3035 (ETRS89/LAEA Europe).

### Памяти мало
Один тайл DLT ~1-2 ГБ в памяти после распаковки. Если не влезает — режь
большой тайл на 4-8 кусочков через GDAL:
```bash
gdal_translate -srcwin 0 0 10000 10000 big.tif tile_00.tif
```
И клади куски в `data/copernicus/tree_species/`.

### ST_Intersects работает медленно при обновлении view
Миграция 008 создаёт частичный GIST-индекс `idx_forest_polygon_geom_cop`
только на Copernicus-полигонах, это должно быть ок до ~миллиона полигонов.
Если view всё равно тормозит — замени на матвью (SELECT в таблицу + REFRESH).

---

## Ссылки

- CLMS каталог: https://land.copernicus.eu/en/products
- HRL Forests: https://land.copernicus.eu/en/products/forests
- CLMS Map Viewer: https://land.copernicus.eu/en/map-viewer
- Product User Manual для HRL Forests 2018: искать на странице продукта → «Documents»
- Лицензионные условия: https://land.copernicus.eu/en/data-policy
