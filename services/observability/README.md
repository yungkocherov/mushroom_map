# Observability stack — runbook

Self-hosted error tracking (GlitchTip, Sentry-compatible) и web
analytics (Umami) на той же прод-VM что и API.

См. spec: [`docs/superpowers/specs/2026-04-30-prod-readiness-design.md`](../../docs/superpowers/specs/2026-04-30-prod-readiness-design.md) §4-§5.

## Architecture

```
geobiom.ru / api.geobiom.ru / sentry.geobiom.ru / analytics.geobiom.ru
                              ↓
                       Caddy (TLS) :443
              ┌───────────┼───────────┬─────────────┐
              ▼           ▼           ▼             ▼
       /srv/web      api:8000   glitchtip-web  umami:3000
                                    :8000     (loopback :8002)
                                       ↓             ↓
                                       └──── db:5432 ┘
                                  (отдельные БД: glitchtip, umami)
```

GlitchTip = web (Django + gunicorn) + worker (Celery) + redis.
Umami = single Node container.

Оба — отдельные docker-compose файлы, **оверлеятся** поверх
`docker-compose.prod.yml`. Контейнеры биндятся только на loopback
(`127.0.0.1:8001`, `127.0.0.1:8002`); наружу выходят только через Caddy.

## One-time provisioning

### 1. Создать БД и роли в проде

Зашёл на VM, в существующий postgres-контейнер:

```bash
ssh geobiom-prod
docker compose -f /srv/mushroom-map/docker-compose.prod.yml exec -T db \
    psql -U mushroom -d mushroom_map <<'SQL'
CREATE ROLE glitchtip LOGIN PASSWORD 'GENERATE_RANDOM_HERE';
CREATE DATABASE glitchtip OWNER glitchtip;

CREATE ROLE umami LOGIN PASSWORD 'GENERATE_RANDOM_HERE';
CREATE DATABASE umami OWNER umami;
SQL
```

Сгенерировать пароли заранее: `openssl rand -base64 32` × 2. Положить
в:
- `services/observability/glitchtip/.env` → `GLITCHTIP_DB_PASSWORD`
- `services/observability/umami/.env` → `UMAMI_DB_PASSWORD`

### 2. DNS records (Cloudflare, grey-cloud DNS-only)

В Cloudflare dashboard, zone `geobiom.ru`, обе записи **DNS-only**
(grey-cloud, не proxied — TSPU режет CF SNI):

```
sentry.geobiom.ru     A   <oracle-ip-or-current-prod-ip>
analytics.geobiom.ru  A   <same-ip>
```

### 3. Заполнить env-файлы

```bash
cp services/observability/glitchtip/.env.example services/observability/glitchtip/.env
cp services/observability/umami/.env.example services/observability/umami/.env
```

GlitchTip `.env`:
- `SECRET_KEY` — `python -c "import secrets; print(secrets.token_urlsafe(50))"`
- `GLITCHTIP_DB_PASSWORD` — из шага 1
- остальное оставить как есть

Umami `.env`:
- `APP_SECRET` — `openssl rand -base64 32`
- `UMAMI_DB_PASSWORD` — из шага 1

В `.env.prod` добавить:

```
CADDY_SENTRY_HOST=sentry.geobiom.ru
CADDY_UMAMI_HOST=analytics.geobiom.ru
GLITCHTIP_DB_PASSWORD=<такой же как в glitchtip/.env>
UMAMI_DB_PASSWORD=<такой же как в umami/.env>
```

(Дублирование в двух местах нужно потому, что переменная читается
compose'ом верхнего уровня для подстановки в `${GLITCHTIP_DB_PASSWORD}`,
но env_file шарится только с конкретным сервисом.)

### 4. Поднять сервисы

С dev-машины:

```bash
ssh geobiom-prod bash -c '
  cd /srv/mushroom-map &&
  docker compose \
    -f docker-compose.prod.yml \
    -f services/observability/glitchtip/docker-compose.yml \
    -f services/observability/umami/docker-compose.yml \
    --env-file .env.prod up -d
'
```

GlitchTip первый старт прогонит Django-миграции автоматически (web
контейнер делает `manage.py migrate` на entrypoint'е).
Umami то же самое — Prisma migrations при первом старте.

### 5. GlitchTip first-run: createsuperuser + organization

```bash
ssh geobiom-prod bash -c '
  docker exec -it glitchtip_web ./manage.py createsuperuser
'
```

Логин в `https://sentry.geobiom.ru` → создать Organization (`Geobiom`)
→ создать Project (`mushroom-map-api` для бэка, `mushroom-map-web` для
фронта) → скопировать DSN из Project Settings.

В `.env.prod` добавить:

```
SENTRY_DSN=<DSN для api>
SENTRY_ENVIRONMENT=production
```

В GitHub repository settings → Variables (НЕ Secrets — это публичный
DSN, попадёт во фронтовый бандл):

```
VITE_SENTRY_DSN=<DSN для web>
```

### 6. Umami first-run: login + website registration

Логин по дефолту: `admin / umami` → **сразу сменить пароль** в Profile.

Settings → Websites → Add website:
- Name: `geobiom.ru`
- Domain: `geobiom.ru`

Скопировать `Website ID` (UUID).

В GitHub Variables добавить:

```
VITE_UMAMI_HOST=https://analytics.geobiom.ru
VITE_UMAMI_WEBSITE_ID=<UUID из Umami>
```

### 7. Редеплой фронта

После того как `VITE_*` переменные появились в GH Variables, нужен
ребилд фронта чтобы они запеклись в bundle:

```bash
gh workflow run deploy-web.yml
```

Или просто пуш любого коммита в main.

### 8. UptimeRobot мониторы

Добавить два HTTP(s) монитора на 5-min interval:
- `https://sentry.geobiom.ru/`
- `https://analytics.geobiom.ru/`

## Проверка работы

### GlitchTip

В dev-консоли браузера на geobiom.ru:

```js
throw new Error("test sentry integration")
```

Через минуту в `https://sentry.geobiom.ru/Geobiom/issues/` должна
появиться ошибка с release-tag = git SHA и source-map'ом строки/колонки.

API: дёрнуть несуществующий handler:

```bash
curl https://api.geobiom.ru/api/__test_sentry_500__
```

(Эндпоинт не существует → 404 — Sentry это не пишет, это нормально.
Для теста именно exception capture можно добавить временный route в
api/main.py с `raise RuntimeError("test")` или просто подождать первой
реальной ошибки.)

### Umami

Открыть geobiom.ru, потыкать слои на карте, открыть `/species/<slug>`,
сохранить spot. В Umami dashboard → Realtime должны появиться:
- pageview'ы
- custom events: `layer.toggle`, `species.open`, `spot.save`,
  `district.open`, `spotlight.search`

## Disaster recovery

Бэкап GlitchTip и Umami данных идёт автоматически — они живут в той же
Postgres-инстансе, которая бэкапится `geobiom-backup.timer`'ом
ежедневно. Restore drill (`scripts/backup/restore_drill.sh`) восстановит
все три БД одним заходом.

Конфиги (`.env`-файлы, docker-compose.yml оверлеи) — в репо, плюс
`/etc/geobiom/.env.backup` и аналоги в `tar` ежедневно (TODO в
`scripts/backup/` Phase 0 не закрыл config-snapshot).

## Известные грабли

- **GlitchTip миграции на upgrade**: между мажорными версиями (v4 → v5)
  миграции могут зависать. Pin'ы на конкретный tag (`v4.1`); при
  апгрейде сначала прогон миграций в staging.
- **Umami v1 → v2 ломающее изменение**: схема БД полностью переписана.
  Pin'ы на `v2.13.1`; апгрейд требует data migration из docs Umami.
- **Source maps экспонированы**: `build.sourcemap=true` во vite.config
  делает `*.map` файлы доступными по URL `https://geobiom.ru/assets/*.map`.
  Это приемлемо для open-source проекта; для closed-source стоит
  использовать `@sentry/vite-plugin` для аплоада в GlitchTip + строжайший
  Caddy-блок на `/assets/*.map` от внешних хитов.
- **DSN public vs secret**: фронтовый `VITE_SENTRY_DSN` **публичный** —
  он встраивается в bundle и виден в DevTools. GlitchTip это понимает
  (DSN не даёт доступ к чтению, только к записи событий).
- **Privacy под 152-ФЗ**: Umami не пишет IP в чистом виде (хеширует),
  не ставит cookies. Cookie-banner не нужен. Но **track-функции в коде
  не должны передавать персональные данные** (текст поиска, координаты,
  username) — см. `apps/web/src/lib/track.ts`, типы `UmamiEvents`
  принимают только length/boolean/slug.
