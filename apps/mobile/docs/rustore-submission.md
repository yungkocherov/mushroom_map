# RuStore submission checklist

Чек-лист для **первой** публикации Geobiom в [RuStore](https://www.rustore.ru/).
После первой выкладки — обновления автоматизируются через RuStore CLI
или Developer Console.

Считаем что:
- Keystore сгенерирован и забэкаплен (см. `release-signing.md`).
- Backend (api.geobiom.ru) живой, mobile-эндпоинты работают.
- Yandex OAuth «Мобильное» приложение зарегистрировано отдельно
  (см. CLAUDE.md «Pre-prod-deploy checklist»).

## 1. Аккаунт RuStore Developer

- Зарегистрироваться [console.rustore.ru](https://console.rustore.ru) как
  физлицо (или ИП / ООО — ИП быстрее верифицируется).
- Подать на верификацию (паспорт скан + ИНН + СНИЛС).
- Подождать 1-3 рабочих дня.

## 2. Подготовить app.json к prod

Проверить что в `apps/mobile/app.json`:
- `expo.version` = `0.1.0` (или 1.0.0, в зависимости от готовности).
- `expo.android.versionCode` = 1 для первой публикации (потом
  monotonically incrementally).
- `expo.android.package` = `ru.geobiom.mobile`.

## 3. Метадата для RuStore

В Developer Console при создании приложения нужно:

| Поле | Значение |
|------|----------|
| Название | Geobiom |
| Краткое описание (80 симв) | Карта леса и грибных мест Ленобласти. Работает оффлайн, без VPN |
| Полное описание | См. `docs/rustore-listing.md` (создать на основе `apps/web/src/content/methodology/about.mdx`) |
| Категория | Утилиты (или Путешествия / Спорт и активный отдых) |
| Возрастное ограничение | 6+ (нет насилия / контента 18+) |
| Контакт-email | (твой) |
| Сайт | https://geobiom.ru |
| Privacy policy URL | https://geobiom.ru/legal/privacy |
| EULA / Terms URL | https://geobiom.ru/legal/terms |

## 4. Скриншоты (обязательные)

RuStore требует **минимум 2 скриншота** для phone-формата
(720×1280 или больше, JPEG/PNG):

1. Главный экран карты с GPS-маркером + chanterelle-dot-ом.
2. Открытый popup на вы́деле с породой / бонитетом.
3. Tab «Споты» с сохранёнными точками.
4. SaveSpotSheet (рейтинг + теги).
5. Detail-экран спота с компасом.

Снимать на physical device или эмуляторе через `adb exec-out screencap -p > shot.png`.

Опционально — feature graphic 1024×500 (banner на странице приложения).

## 5. AAB upload

1. Собрать prod-AAB:
   ```bash
   cd apps/mobile/android
   ./gradlew :app:bundleRelease
   ```
2. Залить `app/build/outputs/bundle/release/app-release.aab` в RuStore.
3. Подписать NDA / лицензионное соглашение (RuStore требует одноразово).
4. Указать что приложение собирает геолокацию (RuStore чек-лист
   персональных данных).

## 6. Yandex OAuth callback

В Yandex OAuth «Мобильное» application добавить redirect URI:

```
geobiom://auth/callback
```

Иначе вход через Yandex откажет. См. CLAUDE.md «Pre-prod-deploy
checklist §1».

## 7. Verify pre-launch

После заливки RuStore запустит автоматический pre-launch test
(установка APK на тест-устройства, проверка на crash'и при старте).
Длится 1-6 часов.

Чтобы пройти:
- Не должно крашиться при первом запуске без интернета (offline-first
  by design — должно работать даже без bootstrap'а regions).
- Не должно требовать non-listed permissions (наши: GPS, INTERNET,
  NETWORK_STATE — все объявлены).
- Иконка должна быть 512×512 (см. todo «real icon»).

## 8. Post-launch

- Версия публикуется в RuStore, появляется на странице
  https://www.rustore.ru/catalog/app/ru.geobiom.mobile.
- Подписаться на email-уведомления о ревью / отказах.
- Включить в Sentry (api) фильтр по mobile-source чтобы видеть
  reports.

## 9. Updates

```bash
# bump version + versionCode в app.json
cd apps/mobile/android
./gradlew :app:bundleRelease
# upload через RuStore Developer Console или
# rustore-cli (если возьмём) → новая версия
```

## Что мы НЕ публикуем

- Google Play — у Geobiom нет Google Play Developer account
  ($25 fee + Google требует geo-сервисы), это deferred to v2.
- AppGallery (Huawei) — possible after RuStore proves out, но не
  приоритет.
- iOS App Store — в roadmap v2 (нужен macOS + Apple Developer $99/yr).

## Failure modes

- **Pre-launch test FAIL: app crashes on cold start** — обычно
  отсутствует runtime permission flow или невалидный prebuild. Проверить
  локально на чистом эмуляторе с `adb uninstall ru.geobiom.mobile && expo run:android --variant release`.
- **Reject: «Privacy policy not accessible»** — Caddy на geobiom.ru
  должен 200 на `/legal/privacy`. Проверить `curl -I https://geobiom.ru/legal/privacy`.
- **Reject: «Foreign data sources»** — RuStore требовательны к серверам
  в РФ. Наш бэкенд на TimeWeb (RU) — должно быть ОК. Если будут
  вопросы — указать ASN TimeWeb.
