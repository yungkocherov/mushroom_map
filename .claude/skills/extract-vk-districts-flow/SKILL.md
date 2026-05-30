---
name: extract-vk-districts-flow
description: Use after VK posts ingest, OR when sister-repo training_sample is stale, OR when юзер показал отчёт «районы пропущены». Multi-pass flow Natasha NER + regex fallback + QA report. Without --write на regex_district_check ловится только 8% постов (Natasha alone) — pump до 60% даёт второй pass.
---

# VK → district_admin_area_id extraction flow

После того как VK-посты загрузились в `vk_post` (через `ingest_vk.py`),
их район в `vk_post.district_admin_area_id` извлекается **двумя
независимыми проходами**. Это не auto-chain — оба запускаются вручную.
Запустишь только первый — получишь 8% покрытия и юзер потом покажет
отчёт с очевидными «Лужский район» / «Гатчинский район» в тексте
постов как пропущенные.

## Полный flow (всегда оба)

```bash
# 1. NER + Gazetteer (~3-5 мин, идемпотент по place_extracted_at IS NULL).
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe -u pipelines/extract_vk_districts.py \
    --region lenoblast

# 2. Regex fallback на ВСЕ посты — заполнит где Natasha дала NULL
#    но regex видит уникальный LO-район в тексте. Также обновит
#    place_match.detected_places для всех. ~5-10 мин.
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/regex_district_check.py --check --write
```

**Pipeline 1** (`extract_vk_districts.py`) использует Natasha NER + GazetteerMatcher.
Ловит ~8% постов. Фильтр: `WHERE text IS NOT NULL AND text <> '' AND place_extracted_at IS NULL`.
Без `--reprocess` — incremental.

**Pipeline 2** (`regex_district_check.py --write`) — pumping fallback:
- Полный pass по `vk_post WHERE text <> ''` (~68k постов).
- Заполняет `district_admin_area_id` где `natasha=NULL && regex дал ровно 1 LO-район`. Confidence 0.80.
- Обновляет `place_match.detected_places` для всех с матчами.
- НЕ перезатирает Natasha матчи (только NULL → matched).
- Bumping coverage 8% → 60%.

## QA report после прогона

```bash
# HTML отчёт по обработанным постам (текст + извлечённый район + place_match)
.venv/Scripts/python.exe pipelines/vk_districts_report.py --since 2h --no-open
# → C:\tmp\vk_districts_report.html (open в браузере)
```

Цветовая классификация в отчёте:
- **GREEN**: район определён, confidence ≥ 0.7
- **YELLOW**: район определён, confidence < 0.7
- **ORANGE**: NULL, но regex/NER нашёл LO-релевантное упоминание (district_lo / settlement / lake) — возможный miss, расширить regex
- **RED**: NULL, regex детектировал не-ЛО (district_spb / subject_ru) — правильный skip
- **GRAY**: пустой текст / нет mentions

JS-фильтры по color-chip'у в самом HTML.

## Gotcha: `\b#хэштег` регекс БРОКЕН

Word-boundary `\b` не срабатывает между двумя non-word символами. `#`
(non-word) после space/start-of-string (тоже non-word) — НЕТ boundary
перед `#`. Поэтому `\b#курортный` не матчит «#Курортный 3.05.26».

**Правильно**: `#курортный\w*` (без leading `\b`). Уникальность `#`
сам по себе фильтрует — false-positive только в substring типа
«super#курортный», что в VK-постах не встречается.

Проверка после правки паттерна:
```python
import re
re.search(r'\b#курортный', '#Курортный 3.05.26')  # → None (bug)
re.search(r'#курортный', '#Курортный 3.05.26')     # → match (правильно)
```

## Расширение patterns — sample-driven

Когда юзер показывает миссы в отчёте — НЕ просто добавляй один pattern.
Делай **рандомный сэмпл NULL-постов** (500-10000) и классифицируй:

```python
# Sample script:
sys.path.insert(0, r'C:\Users\ikoch\mushroom-map\scripts')
from regex_district_check import detect_places, COMPILED
# ...for each row: hits = detect_places(text); классификация
```

Бакеты которые ищешь:
- `no_match_with_hint` — есть слово «район»/«посёлок»/etc, но regex миссит → **investigate**
- `LO_ambiguous` (≥2 LO matches) — пограничные случаи, OK leave NULL
- `outside_subject` — Псковская/Тверская/Карелия — НЕ ЛО, правильно
- `spb` — СПб район, правильно NULL для LO
- `no_match_no_hint` — нет геопризнаков, правильно

В `no_match_with_hint` ищи частотные кандидаты:
- Частые хэштеги (#Кронштадт #Петергоф #Лисийнос…) → новый district_spb или расширение
- Частые toponym candidates (Capitalized Cyrillic 4+ chars) → возможные селения
- Padежные формы существующих топонимов (Выборгом / Кировском / Тихвином / Соснового Бора)

## Когда расширять regex vs игнорить

✅ **Расширять**:
- Конкретный посёлок/деревня уникален для одного LO-района (Девяткино → Всеволожский, Новолисино → Тосненский)
- Падежная форма топонима уже в dict, но pattern узкий (`[аеу]?` → `(?:а|у|е|ом)?`)
- Хэштег-форма (без слова «район») для СПб или ЛО (`#курортный`)

❌ **НЕ расширять**:
- Distinct word but generic (Первомайский, Кировский — повсеместные советские названия). Если уж — `(?:ое|ом)\b` только конкретные формы.
- Опечатки (Ломоноский, Всеволожсий) — false-positive risk высокий, отдельные patterns создают шум.
- Реки/озёра в нескольких районах одновременно (Луга — Лужский+СПб+другое).

## Final state ожидаемый

После двух pipeline'ов + расширения regex по двум sample итерациям
(500 + 10000 постов):
- `vk_post.district_admin_area_id`: ~60-62% покрытия на 68k постов
- 28-30 disagreements между Natasha и regex (можно `--rewrite-disagreements` если regex явно надёжнее на спот-сэмплах — обычно да)
- training_sample stale → перед использованием в sister-repo:
  `cd /c/Users/ikoch/mushroom-forecast && .venv/Scripts/python.exe -m mushroom_forecast.cli build-training-sample`

## Связанные скилы

- `vk_districts_report.py` (pipeline) — QA отчёт.
- При появлении НОВЫХ районов CLAUDE.md в `mushroom-forecast/` — обновить `forecast.group` через INSERT (не миграцию).
