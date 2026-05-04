# Geobiom — brand assets (исходники иконки и сплэша)

Папка для **мастер-файлов и черновиков**. Production-ассеты, которые
реально подхватывает Expo, лежат на уровень выше:
[`../icon.png`](../icon.png), [`../adaptive-icon.png`](../adaptive-icon.png),
[`../splash.png`](../splash.png), [`../splash-logo.png`](../splash-logo.png).

Эта папка **в bundle не попадает** — Expo подхватывает только то, что
прописано в [`apps/mobile/app.json`](../../app.json).

## Brand color palette

| Назначение                       | Hex       |
|----------------------------------|-----------|
| Cream background (brand main)    | `#F5F1E6` |
| Forest green (primary)           | `#2F5F3E` |
| Chestnut (mushroom cap)          | `#6B4423` |
| Ivory (mushroom stem)            | `#F2E8D5` |
| Slate teal (water)               | `#4A6670` |

`#F5F1E6` уже стоит как `android.adaptiveIcon.backgroundColor` и
`splash.backgroundColor` в `app.json` — менять только синхронно с
обновлением `app.json`.

## Production-ассеты — что куда

| Файл (production)         | Источник в `brand/`                | Назначение               | Требования                                                              |
|---------------------------|-------------------------------------|--------------------------|--------------------------------------------------------------------------|
| `../icon.png`             | финальный «launcher» вариант        | iOS/обычная иконка       | 1024×1024, **с cream-фоном** (`#F5F1E6`), пин в центре                  |
| `../adaptive-icon.png`    | финальный «launcher», без фона      | Android adaptive foreground | 1024×1024, **transparent PNG**, пин в центральных ~66% (safe zone)   |
| `../splash.png`           | финальный «splash» (полная сцена)   | Splash screen            | 1242×2436+ или 2048×2048, фон `#F5F1E6`                                 |

## Convention для версий

Складываем все варианты — даже отвергнутые, чтобы видеть путь и не
повторяться. Имя файла:

```
icon-{вариант}-v{N}-{тип}.png
icon-pin-forest-v1.png            ← первая версия от ChatGPT
icon-pin-forest-v2-full.png       ← splash (полная сцена)
icon-pin-forest-v2-mark.png       ← launcher (только пин)
icon-recraft-v1-flat.png          ← попытки в Recraft
icon-recraft-v3-3d.png
```

После каждой добавленной картинки — одна строка в **журнале** ниже.

## Журнал итераций

| Дата       | Файл                                | Источник | Промт / стиль                              | Статус       | Заметки                              |
|------------|-------------------------------------|----------|---------------------------------------------|--------------|---------------------------------------|
| 2026-05-05 | `icon-recraft-v1-flat.png`          | Recraft  | Зелёная шляпка, flat vector, минимализм     | Отвергнуто   | Ножка-щепка, не похоже на гриб       |
| 2026-05-05 | `icon-recraft-v2-cartoon.png`       | Recraft  | Realistic cartoon mushroom                  | Отвергнуто   | Стоковая иллюстрация, не бренд       |
| 2026-05-05 | `icon-recraft-v3-outline.png`       | Recraft  | Negative-space геометр. mark                | Отвергнуто   | Странный аутлайн, не читается        |
| 2026-05-05 | `icon-pin-forest-v1.png`            | ChatGPT  | Map pin + forest scene + porcini            | Принято      | Базовая концепция, идём с ней        |
| 2026-05-05 | `icon-pin-forest-v2-full.png`       | ChatGPT  | Refined: + safe zone, +гриб, упрощён фон   | **В проде**  | → `icon.png` (1024) + `splash.png` (2048 cream) |
| 2026-05-05 | `icon-pin-forest-v2-mark.png`       | ChatGPT  | Только пин без external map                 | **В проде**  | → `adaptive-icon.png`, контент уменьшен до 66% safe-zone (исходный был 82% по высоте, кончик пина срезался circle-mask) |

## Чек-лист перед заменой production-ассетов

- [ ] Файл 1024×1024 (или больше для splash).
- [ ] Для `adaptive-icon.png`: фон **прозрачный**, пин укладывается в
      центральные 66% canvas (Android crop'ит под circle/squircle —
      всё за пределами safe zone не видно).
- [ ] Для `icon.png`: cream-фон `#F5F1E6` или близкий, без alpha.
- [ ] Сохранил оригинал в эту папку (`brand/`) с осмысленным именем.
- [ ] Дописал строку в журнал выше.
- [ ] После замены production-файлов на устройстве пересобрать
      mipmap'ы (см. ниже).

## Пересборка Android mipmap'ов после замены

Android-launcher читает не `assets/icon.png` напрямую, а сгенерированные
WebP-файлы в `apps/mobile/android/app/src/main/res/mipmap-*/`. После
замены ассетов:

```bash
cd apps/mobile
npx expo prebuild --platform android --clean
```

`--clean` пересоздаёт `android/` папку с нуля по `app.json` — все
mipmap'ы регенерируются из новых `icon.png` / `adaptive-icon.png`.

> **Внимание:** `prebuild --clean` снесёт ручные правки в `android/`.
> Проверь что все наши кастомизации (signing, plugins) живут в
> `app.json` / `plugins/`, а не в самом `android/`. Текущая практика
> репо — да, через [`apps/mobile/plugins/with-release-signing.js`](../../plugins/with-release-signing.js).
