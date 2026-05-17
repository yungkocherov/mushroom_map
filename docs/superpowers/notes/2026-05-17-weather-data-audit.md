# Погода — data-feasibility audit (2026-05-17)

Read-only audit via `C:/tmp/_weather_audit.py` against dev DB
(`forecast.weather_daily`, sister-repo schema, read-only + `to_regclass`
guard). Gates the build plan of the «Погода» stats tab.

## Raw findings

- **`forecast.weather_daily` = 54 954 строк, per-district daily,
  18 районов (district_id 68..85 = admin_area level=6), 2018-01-01 ..
  2026-05-11.** 8 полных лет 2018-2025 (≈6570 строк/год = 18×365) +
  **частичный 2026 (до 11 мая, 2358 строк)**.
- 24 метео-переменные. Fill 100 %: temp max/min/mean, apparent
  temp max/min, precipitation_sum, rain_sum, snowfall_sum,
  precipitation_hours, sunshine_hours, shortwave_radiation_sum,
  wind (speed/gusts/dir), et0_fao, relative_humidity_2m,
  pressure_msl. Fill ~94 %: snow_depth, soil_temperature_0cm/6cm,
  soil_moisture_0_to_1cm/1_to_3cm (нет ранних 2018).
- Распределения (медианы): temp_mean 5.1 °C (min -31.6, max 29.3),
  precipitation_sum 0.5 мм/день (max 72.2), sunshine 6.6 ч,
  et0 1.04 мм, RH 81.8 %, soil_temp_6cm 5.0 °C, **soil_moisture_1_3cm
  0.348 m³/m³** (range 0.05–0.44 — объёмная доля, НЕ проценты).
- Существующий снапшот: `stats_weather_monthly` (per-year monthly
  means + climatology year=0) + `/api/stats/weather` →
  `{months, climatology}`. Узкий: только temp/precip/soil_moist
  помесячно, без anomaly/trend/district/GDD/extremes. Погода-таб
  расширяет, не заменяет (тот же snapshot-pattern).

## Resolved gating parameters

| Param | Value | Rationale |
|---|---|---|
| `WEATHER_YEARS_FULL` | 2018–2025 | 8 полных лет для norm/anomaly/trend. |
| `WEATHER_2026` | exclude from yearly aggregates | частичный (до 11 мая) — в годовых суммах даст ложный обвал. Допустимо «текущий год до даты X» отдельной серией, иначе не показывать. |
| `BASELINE_LABEL` | «среднее 2018–2025», НЕ «климат-норма» | WMO norm = 30 лет; 8 лет — short baseline, честная подпись. |
| `LO_AGGREGATE` | mean по 18 районам | районы сопоставимы по площади-погоде; простое среднее (не area-weight). |
| `SOIL_MOIST_UNIT` | m³/m³ (0–0.44) | объёмная доля, подпись «м³/м³», не %. |
| `GDD_BASE` | 5 °C | стандарт для бореали; база указывается в подписи. |
| `TREND_RENDER` | descriptive bars, НЕ fitted regression | 8 точек — нет статзначимости slope/R²; показываем bar-per-year + baseline-линия, без trendline-claim. |
| dead-ish | wind_dir, pressure, apparent temp | слабая грибная релевантность — в idea-bank не тянем (можно в «прочее» если место). |

## Idea bank (curated, mushroom-relevance ordered)

Climate / seasonal cycle (climatology 2018-2025):
1. Годовой ход температуры — mean line + min/max band по месяцам.
2. Годовой ход осадков — месячный mean precipitation, bars.
3. Годовой ход влажности почвы (1-3 см) — line (грибная переменная).
4. «Грибное окно» — overlay soil-temp + soil-moisture годовых
   кривых, подсветка благоприятного коридора.

Year-to-year / anomaly:
5. Аномалия среднегодовой T° vs среднее 2018-25 — diverging bars.
6. Годовая сумма осадков vs среднее — diverging bars (влажн/сухие).
7. Год × месяц: тепловая карта T° (8×12).
8. Год × месяц: тепловая карта осадков (8×12).
9. Длина тёплого сезона (дней с T_mean ≥ 10 °C) по годам — bars.
10. Влажность почвы тёплого сезона (июн-сен) по годам — bars.

Distribution / extremes:
11. Распределение суточных летних осадков — гистограмма.
12. Число дождливых дней за тёплый сезон по годам — bars.
13. Накопленные GDD (база 5 °C) по годам — overlaid S-curves.
14. Календарь заморозков — последний весенний / первый осенний
    заморозок по годам (границы сезона) — range/dot.

Spatial (18 districts, climatology):
15. Рейтинг районов по осадкам тёплого сезона — bars.
16. Рейтинг районов по влажности почвы тёплого сезона — bars.
17. Район × месяц: тепловая карта влажности почвы.
18. «Грибные дни» района — счёт дней авг-сен с soil_moist > порога
    И soil_temp в коридоре, ранжир — структурный прокси.

Water balance:
19. Баланс P − ET0 по месяцам (дефицит влаги) — line, ноль-ось.
20. Длительность снежного покрова (дней snow_depth>0) по годам — bars.

## Idea feasibility verdict

Feasible all 20: сильная temporal-ось (8 лет daily) + spatial
(18 районов) + 100 % fill ядра. Excluded: wind-dir/pressure/apparent
temp (слабая релевантность); fitted trendlines (8 точек); 2026 в
годовых суммах (частичный); join с VK-сезоном для lag-корреляции
(кросс-репо, fragile — отдельный проект, не в этот таб).
