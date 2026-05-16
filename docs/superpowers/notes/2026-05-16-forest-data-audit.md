# Лес — data-feasibility audit (2026-05-16)

Read-only audit via `C:/tmp/_forest_audit.py` + `_comp_check.py`
against dev DB (`forest_polygon`, source=`rosleshoz` = ФГИСЛК).
Fixes the gating facts for the build plan of the «Лес» stats tab.

## Raw findings

- **`forest_polygon` = 1 247 239 полигонов, 47 234 км², 100 %
  `source='rosleshoz'`** (copernicus/terranorte/osm дают 0 строк в
  ЛО — единый чистый источник, mixed-source ветку в табе НЕ нужно).
- Fill-rate (rosleshoz): `dominant_species` 100 %,
  `species_composition` 100 %, `bonitet` 98.4 %, `age_group` 98.3 %,
  `timber_stock` 96.9 %, **`canopy_cover` 0 %** (поле мёртвое — не
  использовать).
- **`dominant_species`** (доля площади): birch 31.8 % (14 998 км²),
  pine 31.6 % (14 930), spruce 25.3 % (11 950), aspen 8.8 % (4 175),
  alder 2.5 % (1 166). Хвост: larch/oak/linden/maple/cedar/fir — все
  ≤6 км² (≈0 %). → **5 значимых пород + «прочие» fold**.
- **`bonitet`** ординальный 1–5 (1 = лучшая продуктивность). Площадь:
  кл.2 19 259 км² > кл.3 15 367 > кл.4 4 942 > кл.1 4 378 >
  кл.5 2 343; ~945 км² пусто. Чистая ось 1–5 + «н/д».
- **`age_group`** 5 чистых классов (по площади): спелые 15 947 км² >
  средневозрастные 9 829 > приспевающие 8 150 > молодняки 7 846 >
  перестойные 4 610. Мусор: «Не установлена…» (54 км²), одиночный
  «молодняки I класса возраста» (1 строка), ~786 км² пусто → fold в
  «не определён». Порядок для оси: молодняки → средневозрастные →
  приспевающие → спелые → перестойные.
- **`timber_stock`** м³/га, 96.9 % заполнено: min 0, p25 120,
  **медиана 195**, p75 250, max 840. Хороший непрерывный признак.
- **`species_composition`** — **100 % монокультура** (5 % выборка:
  все строки `n_keys=1`, вид `{"pine":1.0}`). Несёт 0 информации
  сверх `dominant_species`. → **любые per-stand «смешанный лес /
  разнообразие древостоя» идеи ИСКЛЮЧЕНЫ**. «Разнообразие» возможно
  только агрегатно (Shannon по `dominant_species` внутри района).
- **Площадь выдела**: p10 0.54 га, медиана 2.21 га, p90 8.43 га,
  max 353.6 га. → все агрегаты **взвешивать по площади**, не по
  числу полигонов (count смещён к мелким slivers).
- **Район**: 2 % sample → 99.9 % полигонов мапятся в один из **18**
  районов ЛО (`admin_area level=6`, centroid ST_Contains). Полный
  per-district анализ feasible.
- Кросс-таблицы плотные: birch×bon2 = 189 745, pine×bon3 = 145 440,
  … — species×bonitet / species×age / age×bonitet heatmaps валидны.

## Resolved gating parameters

| Param | Value | Rationale |
|---|---|---|
| `FOREST_SOURCE` | `rosleshoz` only | 100 % строк; прочие источники 0 в ЛО. |
| `SPECIES_MAIN` | birch, pine, spruce, aspen, alder | 99.9 % площади. |
| `SPECIES_FOLD` | larch/oak/linden/maple/cedar/fir → `other` | каждый ≤6 км². |
| `WEIGHT` | **area_m2 (geodesic)**, не polygon count | median выдела 2.2 га, count смещён к slivers. |
| `BONITET_AXIS` | 1,2,3,4,5 + «н/д» | ординал, 1 = лучший. |
| `AGE_ORDER` | молодняки→средневозрастные→приспевающие→спелые→перестойные + «не определён» | мусорные бакеты fold в «не определён». |
| `DISTRICTS` | 18 (admin_area level=6, centroid match) | 99.9 % покрытие. |
| dead fields | `canopy_cover` (0 %), любые time-series | snapshot без temporal-оси (один ФГИСЛК-срез). |

## Idea feasibility verdict

Feasible: породный состав, фрагментация (площадь vs count),
размер выдела по породам, бонитет-распределение, timber_stock
гистограмма, species×bonitet heatmap, запас по породам (median+IQR),
bonitet→stock валидация, возрастная структура, возраст×порода
(100 %-stack), доля спелых/перестойных (грибная релевантность),
возраст×бонитет, породы по районам (100 %-stack), лесистость района,
средний бонитет/запас по району, «грибной» профиль района (структурный
прокси), возрастная структура по районам.

Excluded: per-stand смешанный лес / диверсити древостоя
(монокультура); canopy-based идеи (0 %); тренды/динамика (нет
истории — один срез ФГИСЛК).
