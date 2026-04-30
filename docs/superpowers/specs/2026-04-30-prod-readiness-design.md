# Production readiness под Oracle — design

Дата: 2026-04-30
Автор: Claude (brainstorming session с пользователем)
Статус: draft, ждёт review пользователем

## Проблема

Текущий прод (с 2026-04-29) живёт на одной TimeWeb VM `178.253.43.136`:
фронт (Caddy + /srv/web), API container, Postgres, PMTiles в
`/srv/mushroom-map/tiles/`. Всё работает, но:

- **нет резервных копий БД** — потеря VM = потеря всего (VK ingest history,
  user_spot, gazetteer, forest_polygon вьюхи и т.д.)
- **нет внешнего мониторинга** — узнаю о падении сайта от пользователя
  или случайно открыв страницу
- **нет error tracking** — frontend exceptions и API 500'ки не
  агрегируются нигде, диагностика только через `docker compose logs`
- **нет analytics** — не вижу что происходит на сайте, какие слои
  включают, куда кликают, откуда приходят
- **SSH открыт в интернет на 22/tcp** — уязвимая поверхность, fail2ban
  не настроен, ключевая аутентификация одна линия защиты
- **TimeWeb — временно** (см. memory `project_website_migration.md`):
  cели на 1100 RUB/мес VM, потому что не заблочили Oracle ARM-катчер;
  цель — переехать на Oracle Cloud Free Tier (4 OCPU / 24 GB ARM,
  always-free)

Цена удержания статуса:
- **один deployment-инцидент** (DROP TABLE, drift миграции, кривой
  `git push`) — невосстановимая потеря данных
- **рост user-base без observability** — баги остаются в проде
  до момента пока кто-то их явно не пожалуется
- **миграция на Oracle без backup-плана** = риск data loss во время
  cutover

## Цели

1. **Backup БД** — автоматический ежедневный, шифрованный, оффсайт
   (Yandex Object Storage). Restore-drill пройден.
2. **External uptime monitoring** — алерты на email + Telegram при
   падении фронта / API / tiles.
3. **Error tracking** — Sentry-совместимый сбор ошибок с фронта и API,
   привязанный к git SHA через source maps.
4. **Web analytics** — privacy-first, self-hosted, no-cookie pageviews
   + custom events для ключевых действий на карте.
5. **SSH lockdown** — Tailscale tailnet, ufw deny 22/tcp from public,
   GitHub Actions deploy через Tailscale OAuth.
6. **Migration to Oracle ARM** — pure mechanical, после того как
   §1-§5 готовы и проверены на TimeWeb.

Не-цели:
- Sentry self-hosted (≥8 сервисов, нереально на 24 GB) — берём GlitchTip.
- Multi-region failover, hot-standby Postgres, blue-green deploy — для
  MVP-проекта overkill, бэкапа+мониторинга достаточно.
- Plausible/Matomo Cloud, Google Analytics — privacy-сомнительно либо
  стоит денег. Umami — open source, self-host, ~256 MB RAM.
- CDN для PMTiles. Текущая модель «Caddy → API → bind-mount» работает,
  файлы холодные, Range-requests кэшируются браузером. Можно вернуться
  если будет проблема с bandwidth.

## Архитектура

### Целевое состояние (Oracle ARM 4 OCPU / 24 GB)

```
                      ┌─────────────────────────────┐
                      │  Cloudflare DNS (grey-cloud)│
                      │  geobiom.ru                 │
                      │  www.geobiom.ru             │
                      │  api.geobiom.ru             │
                      │  sentry.geobiom.ru   (new)  │
                      │  analytics.geobiom.ru (new) │
                      └─────────────┬───────────────┘
                                    │
                                    ▼
                      ┌─────────────────────────────┐
                      │  Oracle ARM 4/24 GB         │
                      │  ┌──────────────────────┐   │
                      │  │ Caddy (TLS, proxy)   │   │
                      │  └──┬──┬──┬──┬──────────┘   │
                      │     │  │  │  │              │
                      │     ▼  ▼  ▼  ▼              │
                      │   API GT Um  /srv/web       │
                      │    │  │  │     (static)     │
                      │    └──┴──┴── Postgres       │
                      │              (3 БД:         │
                      │               mushroom_map, │
                      │               glitchtip,    │
                      │               umami)        │
                      │                             │
                      │  /srv/mushroom-map/tiles/   │
                      │   (PMTiles, ~700 MB)        │
                      └─────────────────────────────┘
                                    │
                                    │ nightly pg_dump | age | rclone
                                    ▼
                      ┌─────────────────────────────┐
                      │  Yandex Object Storage      │
                      │  bucket: geobiom-backups    │
                      │  prefixes: db/ tiles/ cfg/  │
                      └─────────────────────────────┘
```

### RAM-бюджет (24 GB)

| Сервис    | RAM    |
|-----------|--------|
| Postgres  | ~2 GB  |
| API       | ~512 MB|
| GlitchTip | ~1 GB  |
| Umami     | ~256 MB|
| Caddy     | ~100 MB|
| OS + buffers | ~1 GB |
| **Used**  | **~5 GB** |
| **Free**  | **~19 GB** |

Запас огромный — 19 GB на ML-эксперименты прогноза, доп. ETL, или
будущие сервисы.

### DNS plan (Cloudflare, grey-cloud DNS-only)

| Host                    | Type | Target            | Status            |
|-------------------------|------|-------------------|-------------------|
| `geobiom.ru`            | A    | `<oracle-ip>`     | мигрирует         |
| `www.geobiom.ru`        | A    | `<oracle-ip>`     | мигрирует         |
| `api.geobiom.ru`        | A    | `<oracle-ip>`     | мигрирует         |
| `sentry.geobiom.ru`     | A    | `<oracle-ip>`     | новый, GlitchTip  |
| `analytics.geobiom.ru`  | A    | `<oracle-ip>`     | новый, Umami      |

**Никаких proxied (orange-cloud)** — TSPU режет CF SNI из РФ (см.
memory `project_website_migration.md`).

### TimeWeb fallback policy

TimeWeb VM не выключаем сразу после DNS-cutover. Держим **1-2 недели**
как warm-fallback: если Oracle ляжет / окажется flaky / Cloudflare
капризно резолвит — DNS откатывается обратно на TimeWeb за 5 минут
(TTL 5 мин выставляем заранее перед cutover). После 1-2 недель
soak-периода — снапшот конфигов в Y.O.S., decommission TimeWeb.

## Решения по подсистемам

### §1 Backup

**Стек:** `pg_dump --format=custom -Z 9` → `age` (single-recipient
encryption) → `rclone copy` в Yandex Object Storage S3-bucket.

**Schedule:** systemd timer (не cron — лучше observability через
`journalctl -u backup.timer`), nightly 03:00 UTC.

**Retention:** 7 daily + 4 weekly + 3 monthly = 14 файлов max.
Ротация в скрипте через `rclone delete --min-age=...` по префиксам.

**Encryption: age**, не gpg. Один публичный ключ на VM
(`/etc/geobiom/backup.age.pub`), приватный ключ — у меня локально
(`~/.ssh/age-geobiom-backup.key`, в `gopass` или просто в зашифрованном
home). Decrypt: `age -d -i key.txt < backup.sql.gz.age`.

**Bucket:** `geobiom-backups` (Y.O.S., RU-резидент, ~₽5/мес).
Префиксы:
- `db/YYYY-MM-DD.sql.gz.age` — pg_dump (~50-200 MB после сжатия)
- `tiles/YYYY-MM-DD/` — снапшот PMTiles (раз в неделю, при изменении)
- `configs/YYYY-MM-DD.tar.age` — `/srv/*` configs, `.env.prod`,
  `Caddyfile`, systemd units

**Restore-drill:** скрипт `scripts/backup/restore_drill.sh` поднимает
свежий локальный `docker run postgres:16` и накатывает последний дамп.
Проверяет: `SELECT count(*) FROM forest_polygon` >= 2_000_000 и
`SELECT count(*) FROM vk_post` >= 60_000. **Прогон обязателен один раз
до DNS-cutover на Oracle.** Без репетиции бэкап считаем
несуществующим.

**Y.O.S. credentials:** новый сервисный аккаунт `geobiom-backup-writer`
с ролью `storage.editor` только на bucket `geobiom-backups`. Static
key (Access Key ID + Secret) в `/etc/geobiom/.env.backup` (chmod 600,
owner root). Никаких master-credentials на VM.

### §2 SSH + Tailscale

**Tailscale Free Personal** (3 users / 100 devices). Ограничение
3 users — это про администраторов tailnet'а, не про конечных юзеров
сайта. У нас 1 user (я) и ~3-4 устройства (dev-машина, Oracle VM,
mushroom-forecast машина опц., телефон опц.). Запас.

**Setup:**
1. `tailscale up --ssh --hostname=oracle-prod` на VM
2. `tailscale up` на dev-машине
3. Получаем MagicDNS `oracle-prod.tail-xxxxx.ts.net` и tailnet IP
   `100.x.x.x`
4. **ufw on VM:**
   - `ufw allow 80/tcp` (Caddy)
   - `ufw allow 443/tcp` (Caddy)
   - `ufw deny 22/tcp from any` — порт открыт только в tailnet
   - На самом деле tailscale ssh не использует 22/tcp — он туннелирует
     через WireGuard на UDP 41641. Так что `ufw deny 22/tcp` — про
     старый sshd, который остаётся для emergency но недоступен снаружи
5. **Oracle Security List** (cloud firewall) — то же самое: deny 22,
   allow 80/443. Двухуровневая защита.

**GitHub Actions deploy через Tailscale:**
- `tailscale/github-action@v2` + Tailscale OAuth client с tag
  `tag:ci-deploy`
- Эфемерный node поднимается на время workflow, получает tailnet IP,
  ssh идёт на `oracle-prod` MagicDNS
- `PROD_HOST` GH secret меняется с публичного IP на `oracle-prod` (или
  tailnet 100.x.x.x — что стабильнее, MagicDNS требует DNS-resolve
  внутри tailnet)
- ACL: tag `ci-deploy` имеет ssh-access только к tag `prod` (где
  Oracle VM)

### §3 Uptime monitoring — UptimeRobot Free

**Почему не self-host:** внешний пинг по определению не должен жить на
той же VM что и проверяемый сервис. Self-host monitoring (Uptime Kuma
и т.п.) на той же машине — антипаттерн.

**Tier:** UptimeRobot Free, 50 monitors, 5-min interval. Хватит.

**Мониторы:**

| URL                                         | Что проверяем              |
|---------------------------------------------|----------------------------|
| `HEAD https://geobiom.ru/`                  | фронт (Caddy + static)     |
| `HEAD https://api.geobiom.ru/health`        | API + Postgres            |
| `HEAD https://api.geobiom.ru/tiles/forest.pmtiles` | tiles + диск      |
| `HEAD https://sentry.geobiom.ru/`           | GlitchTip (после Phase 5) |
| `HEAD https://analytics.geobiom.ru/`        | Umami (после Phase 5)     |

**Alert channels:**
- Email на личный gmail
- Telegram через UptimeRobot webhook → личный bot → личный канал

**Setup:** через UI UptimeRobot, не Terraform. Один раз ставим — не
меняется.

### §4 Error tracking — GlitchTip

**Почему GlitchTip, не Sentry self-host:**
- Sentry self-host = Kafka + Snuba + ClickHouse + Symbolicator + ещё
  4 сервиса = 8+ контейнеров, минимум 8-16 GB RAM. Нереально.
- GlitchTip = Django + Postgres + Redis. ~1 GB RAM. 100% Sentry-SDK
  совместим (event API, ingest endpoint, source maps).

**Deploy:** docker-compose в `services/glitchtip/`:
```yaml
services:
  glitchtip-web:
    image: glitchtip/glitchtip:latest
    ports: ["8001:8000"]
    env: DATABASE_URL, REDIS_URL, SECRET_KEY, EMAIL_URL...
  glitchtip-worker:
    image: glitchtip/glitchtip:latest
    command: ["./bin/run-celery-with-beat.sh"]
  redis:
    image: redis:7-alpine
```

**Postgres:** **отдельная БД `glitchtip` на том же Postgres-инстансе**,
не отдельный контейнер. Решение: один Postgres для всех (mushroom_map,
glitchtip, umami) — проще backup, ресурсов хватает, изоляция через
БД+роли.

**Reverse-proxy:** `sentry.geobiom.ru` через Caddy → `localhost:8001`.

**SDK интеграция:**

API (Python):
- `services/api/requirements.txt`: `sentry-sdk[fastapi]==2.x`
- `services/api/src/main.py`: `sentry_sdk.init(dsn=os.getenv("SENTRY_DSN"),
  traces_sample_rate=0.1, release=os.getenv("GIT_SHA"))`
- DSN из env, проставляется на VM в `.env.prod`

Frontend (React/Vite):
- `apps/web/package.json`: `@sentry/react`, `@sentry/vite-plugin`
- `apps/web/src/main.tsx`: `Sentry.init({dsn, release: GIT_SHA, tracesSampleRate: 0.1})`
- Vite plugin uploads source maps в build-step `deploy-web.yml` после
  `vite build`, до rsync

**Release tagging:** `release = git SHA` → в GlitchTip видно из какого
коммита прилетела ошибка, со source map'ом line/column попадает в
исходник.

### §5 Web analytics — Umami

**Один Node-контейнер** + БД `umami` на том же Postgres.

**Deploy:** docker-compose в `services/umami/`:
```yaml
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    ports: ["8002:3000"]
    env: DATABASE_URL=postgresql://...@db:5432/umami, APP_SECRET=...
```

**Reverse-proxy:** `analytics.geobiom.ru` через Caddy → `localhost:8002`.

**SDK интеграция:**
```html
<!-- apps/web/index.html или apps/web/src/Layout.tsx -->
<script async defer
        src="https://analytics.geobiom.ru/script.js"
        data-website-id="<umami-website-id>"></script>
```

**Privacy:** Umami не пишет IP в чистом виде (хеширует salt'ом),
не ставит cookies, не имеет user-tracking across сайтов. **GDPR /
152-ФЗ чистый по умолчанию**, без cookie-banner. Self-hosted →
никакие данные не уходят third-party.

**Что трекаем:**
- pageviews (автоматом)
- referrers, device/browser (автоматом)
- top pages (автоматом)
- **custom events** через `umami.track(event_name, data)`:
  - `layer.toggle` `{layer: 'forest', visible: true}` — клики по чипам
  - `spot.save` — сохранение spot'а
  - `species.open` `{slug: 'boletus-edulis'}` — открытие species
  - `district.open` `{name: 'Выборгский'}` — переход в district mode
  - `spotlight.search` `{query: 'белый гриб'}`

**Что НЕ трекаем:** IP, user_id, координаты на карте (тип данных
sensitive, не хочу его агрегировать), содержимое spot'ов.

### §6 Migration sequencing

Зависимости и порядок (✓ = можно делать прямо сейчас параллельно с
ожиданием Oracle-катчера):

```
Phase 0 (на TimeWeb, СЕЙЧАС, ~3-4 ч)
  ✓ Backup script + Y.O.S. интеграция → systemd timer на TimeWeb
  ✓ Restore-drill локально (репетиция!)
  ✓ UptimeRobot мониторы (api.geobiom.ru, geobiom.ru, /tiles/forest.pmtiles)
  ✓ Tailscale на dev-машине + на TimeWeb (опционально, чтоб набить руку
    до Oracle)

Phase 1 (блокер: PAYG-апгрейд + Oracle ARM catcher land, дни-неделя)
  Oracle ARM 4/24 поднят, base Ubuntu 22.04, ssh работает

Phase 2 (Oracle bootstrap, ~2 ч)
  Docker, ufw, swap (4 GB), Tailscale up, Caddy install,
  /srv/web, /srv/mushroom-map/tiles, .env.prod, .env.backup
  GitHub Actions secrets обновить (PROD_HOST → tailnet IP/MagicDNS)

Phase 3 (миграция prod-стека, ~3 ч)
  Pull последний backup из Y.O.S. → restore в Oracle Postgres → API up
  Sync tiles (rsync с TimeWeb на Oracle через Tailscale)
  Deploy API + web через GH Actions (новый PROD_HOST)
  Smoke-test через tailnet (curl https://oracle-prod/health), без DNS-cutover
  Backup script на Oracle (systemd timer заводим заранее, до cutover)

Phase 4 (DNS cutover, 5 мин + propagation)
  За 24 ч до этого: TTL CF записей → 5 мин (для быстрого rollback)
  Cloudflare A: geobiom.ru / www / api.geobiom.ru → Oracle IP
  TimeWeb VM не выключаем — она жива, просто без трафика

Phase 5 (новые наблюдательные сервисы, ~3 ч)
  GlitchTip docker-compose, миграции, admin user, organization+project
  Umami docker-compose, миграции, website setup
  Caddy: sentry.geobiom.ru + analytics.geobiom.ru
  UptimeRobot: добавить мониторы для них

Phase 6 (instrumentation, ~2 ч)
  sentry-sdk[fastapi] в API + @sentry/react в фронте
  @sentry/vite-plugin source maps upload в deploy-web.yml
  Umami snippet в Layout.tsx (или index.html)
  Custom events в LayerGrid, SaveSpotModal, SpeciesPage, и т.д.
  Test: бросить ошибку из dev → увидеть в GlitchTip с source map'ом

Phase 7 (soak, 7 дней)
  Жить и смотреть. Если что-то ломается — есть TimeWeb fallback,
  откат DNS = 5 минут (TTL уже 5 мин с Phase 4).

Phase 8 (cleanup)
  TimeWeb VM: snapshot конфигов в /srv/* → tar | age → Y.O.S.
  Decommission TimeWeb VM (через TimeWeb dashboard).
  Update CLAUDE.md prod-стек секцию (заменить TimeWeb VM на Oracle ARM,
  обновить «Production стек (live с …)» дату).
  Update memory `project_website_migration.md` → DONE.
```

**ETA:**
- Phase 0 — сегодня-завтра, можно делать прямо сейчас
- Phases 2-8 — 1 день solid-work после landed Oracle (1-2 недели
  ожидания катчера)

## Ответы на open questions

**Q1: Один Postgres на 3 БД (mushroom_map + glitchtip + umami) vs
отдельные контейнеры?**
→ **Один**. Резолвлено пользователем. Проще backup (один pg_dump
покрывает всё через `--all-databases` или 3 separate dumps), ресурсов
хватает, БД-уровневая изоляция достаточна. Каждая БД получает свою
роль с правами только на неё.

**Q2: age vs gpg для шифрования бэкапов?**
→ **age**. Резолвлено пользователем. Проще, современнее,
single 32-byte ключ, один command-line flag.

**Q3: Tailscale Free Personal — хватит?**
→ **Да**. Free Personal = 3 users / 100 devices. Это про
администраторов tailnet'а, не про конечных пользователей сайта (они
ходят через публичный CF DNS). У меня 1 user, 3-4 устройства. Запас.

**Q4: Y.O.S. — один bucket или несколько?**
→ **Один** `geobiom-backups` с префиксами `db/`, `tiles/`, `configs/`.
Резолвлено пользователем.

## Известные риски и open items

- **Oracle ARM catcher** — внешний блокер, не контролируется. Phase 0
  работа делается на TimeWeb, не зависит от Oracle.
- **TimeWeb pg_dump host-side** — у scripts/deploy/sync_db_to_remote.sh
  уже есть fallback на `docker exec mushroom_db pg_dump`. Не нужно
  ставить host-side postgres-client.
- **Tailscale на TimeWeb** — опционально в Phase 0; если не получится
  настроить (Tailscale требует TUN/TAP, на VPS возможны ограничения),
  не блокирует — на Oracle поставим в Phase 2.
- **GlitchTip миграции** — на свежей БД проходят чисто, но если что-то
  сломается, бэкап уже стоит (Phase 0 делает backup до Phase 5).
- **Source maps utility** — `@sentry/vite-plugin` загружает в
  GlitchTip через тот же ingest endpoint. Если plugin glitchtip-incompat
  (бывает), запасной вариант — `sentry-cli` через `glitchtip-cli`
  fork.
- **Umami breaking changes** — Umami v2 ↔ v1 несовместимы. Pin на
  конкретный image tag, не `latest`.

## Что не входит в этот spec (отдельные планы)

Spec охватывает design. Implementation разбит на отдельные plan-файлы:

1. `docs/superpowers/plans/2026-04-30-prod-readiness-phase0.md` —
   Backup + UptimeRobot + Tailscale на dev (можно делать сейчас)
2. `docs/superpowers/plans/2026-04-XX-prod-readiness-oracle-migration.md` —
   Phase 1-4 (после landed Oracle)
3. `docs/superpowers/plans/2026-04-XX-prod-readiness-observability.md` —
   Phase 5-6 (GlitchTip + Umami + instrumentation)

Phase 7-8 — без отдельного плана, soak + cleanup.
