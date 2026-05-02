# Global review (code + structure + security) — design

Дата: 2026-05-02
Автор: Claude (4 параллельных адверсариальных ревью-агента: backend, frontend+mobile, security, architecture)
Статус: snapshot, fix-roadmap → `docs/superpowers/plans/2026-05-02-global-review-fixes.md`

## Контекст

User-запрос: «глобальный code review + structure/architecture review + security/bugs review» проекта mushroom-map / Geobiom без правок кода. Состояние репо на момент ревью — после autonomous run 2026-05-01 (Phase 4 mobile polish, forest fragmentation fix, лес из remote-source online).

Метод: 4 параллельных general-purpose агента, каждый под свою линзу, каждый применяет три персоны (Saboteur / New Hire / Security Auditor) + промоутит severity при совпадениях. Все находки — с file:line.

## Общий вердикт: **CONCERNS** (близко к **BLOCK** для mobile-релиза)

Кодбаза в хорошей форме для one-author проекта в проде:
- `MapView` после 2026-04-29 рефактора — registry-driven, 837→97 LoC.
- Refresh-token rotation с reuse-detection корректный (commit-before-raise учтён).
- JWT-secret hard-fail в проде работает.
- Бэкапы с restore-drill + row-count asserts.
- CI с реальной PostGIS, не мок.

НО есть:
- 1 XSS в форест-попапе (тривиально превращается в кражу access-token);
- 1 TypeError-bug, кладёт каждый mobile-логин в Yandex;
- отсутствие rate-limiting на всех auth-эндпоинтах;
- UNIQUE-индекс на `user_spot.client_uuid` без `user_id` — кросс-юзер enumeration oracle;
- 365-day device-JWT, принимаемый везде вместе с access-токеном, и stub `auth/revoke`;
- GH Actions на плавающих тегах с доступом к `PROD_SSH_KEY`;
- forecast-контракт с sister-репо — заглушка.

Mobile в текущем виде в RuStore публиковать нельзя.

## Секреты — статус

**Credentials в репо не утекают:**
- `.env*` в репо отсутствуют (memory `feedback_no_env_files` соблюдается).
- `JWT_SECRET`, `OAUTH_STATE_SECRET`, `YANDEX_*_SECRET`, `DB_PASSWORD`, `AGE_RECIPIENT` — только в `.env.prod` на VM.
- `VITE_*` и `EXPO_PUBLIC_*` в бандле — `VITE_API_URL`, `VITE_SENTRY_DSN`, `VITE_UMAMI_*`, `EXPO_PUBLIC_YANDEX_MOBILE_CLIENT_ID`, `EXPO_PUBLIC_API_BASE_URL`. Все public-by-design (DSN/client_id безопасны для bundle, secret — на бэке + PKCE).
- `JWT_SECRET` fail-closed в проде ([`settings.py:90-112`](../../../services/api/src/api/settings.py#L90)).
- GitHub-секреты используются корректно.
- Source maps публично — accepted, проверено.

**Каналы утечки внутреннего состояния / PII (не credentials, но фиксить):**

| ID | Где | Что светит | Severity |
|----|-----|------------|----------|
| L1 | `services/api/src/api/main.py:101` `/api/healthz` | `detail=f"db unreachable: {exc}"` (DSN parts, socket errors) | WARNING |
| L2 | `services/api/src/api/routes/mobile.py:283` | `str(exc)[:200]` в JSON ответе sync — имена колонок/constraints | CRITICAL (см. C4) |
| L3 | `services/api/src/api/main.py:22-37` Sentry init | `with_locals` дефолтный → `change` (lat/lon/note) утекает в GlitchTip через traceback | WARNING |
| L4 | `.gitignore` не покрывает `dist/`, `*.apk`, `*.keystore`, `*.age`, `id_rsa*`, `.cloudflare/` | Риск случайного коммита build-артефактов / ключей | NOTE |

Дополнительный supply-chain риск: GH Actions на плавающих тегах (`appleboy/ssh-action@v1`, `easingthemes/ssh-deploy@v5.0.3`) с доступом к `PROD_SSH_KEY` — не утечка, но потенциальный канал захвата прода через скомпрометированный third-party action.

## CRITICAL findings

### C1 — Mobile auth crash: `upsert_oauth_user` вызван с неверными kwargs

- **Где:** [`services/api/src/api/routes/mobile.py:84-92`](../../../services/api/src/api/routes/mobile.py#L84-L92)
- **Сигнатура:** [`services/api/src/api/auth/users.py:52-62`](../../../services/api/src/api/auth/users.py#L52-L62) ждёт `auth_provider=`, `provider_subject=`, `email_verified=`, `locale=` (без default).
- **Что в коде:** передаётся `provider=`, `subject=`, без `email_verified`, без `locale`.
- **Эффект:** каждый mobile-логин в Yandex 500-ит с `TypeError`. Никаких интеграционных тестов — `test_mobile_jwt.py` только round-trip JWT-helper'ов.
- **Фикс:** скопировать вызов из [`services/api/src/api/routes/auth.py:190-199`](../../../services/api/src/api/routes/auth.py#L190) (web-флоу). Добавить тест.
- **Severity:** CRITICAL (mobile-only — паркуется при отсрочке мобайла).

### C2 — XSS в forest popup через unescaped backend-strings

- **Где:** [`apps/web/src/components/mapView/utils/popup.ts`](../../../apps/web/src/components/mapView/utils/popup.ts)
  - L67-77: `n.name`, `n.kind` (gazetteer / water layer)
  - L95-110: `p.soil0.descript`, `accomp.join("; ")`, `parent`
  - L190: `f.dominant_species` через `forestName` fallback (L23: `FOREST_NAMES[f.dominant_species] ?? f.dominant_species`)
  - L222-227: `s.name_ru`, `s.name_lat` в `<a>...</a>` и `<td>` (species)
- **Контраст:** [`apps/web/src/components/mapView/layers/userSpots.ts:90,96`](../../../apps/web/src/components/mapView/layers/userSpots.ts#L90) — корректно вызывает `escapeHtml(p.note)`. Паттерн известен, не применён в popup.ts.
- **Эффект:** OSM-данные публично редактируемы. Один `name='<img src=x onerror=...>'` в bbox ЛО → клик пользователя около этой точки = exfil access-token из `AuthProvider.tsx:57` + действия от его имени. CSP не настроен ([`infra/Caddyfile:120-127`](../../../infra/Caddyfile#L120) явно акцептирует долг).
- **Фикс:** `popup.setHTML(...)` → `popup.setDOMContent(buildPopupDom(...))`, либо `escapeHtml` на каждый сервер-стринг + ESLint guard.
- **Severity:** CRITICAL.

### C3 — Cross-user `client_uuid` enumeration oracle

- **Где:** [`db/migrations/031_user_spot_client_uuid.sql:22-24`](../../../db/migrations/031_user_spot_client_uuid.sql#L22) + [`services/api/src/api/routes/mobile.py:378-389`](../../../services/api/src/api/routes/mobile.py#L378)
- **Что:** `UNIQUE INDEX ON user_spot(client_uuid) WHERE client_uuid IS NOT NULL` — глобально, не `(user_id, client_uuid)`. UPSERT с `WHERE user_spot.user_id = EXCLUDED.user_id` блокирует кросс-юзер write, но возвращает empty RETURNING → код кидает `_ConflictError("server has newer version")`.
- **Эффект:** Два разных ответа на один и тот же ввод (известный чужой UUID → conflict; неизвестный → ok) = oracle. Плюс настоящая v4-коллизия легитимного пользователя становится permanent conflict без resolution path.
- **Фикс:** миграция 033 — DROP старого индекса, CREATE `UNIQUE (user_id, client_uuid) WHERE client_uuid IS NOT NULL`. ON CONFLICT в mobile.py → `(user_id, client_uuid)`.
- **Severity:** CRITICAL (mobile-only — паркуется).

### C4 — Sync error swallow + commit-after-aborted-txn + leak

- **Где:** [`services/api/src/api/routes/mobile.py:248-285`](../../../services/api/src/api/routes/mobile.py#L248)
- **Что:** Внутри цикла `for change in payload.client_changes` стоит `try: ... except Exception as exc:`. После первой ошибки в psycopg3 транзакция помечена aborted; `conn.commit()` на L285 silently откатывает; следующая итерация падает на `InFailedSqlTransaction`, но клиент видит `status: "ok"` для записей, которые физически не записались. Плюс `str(exc)[:200]` в response светит наружу имена колонок и constraints.
- **Эффект:** тихая порча данных + утечка внутренностей psycopg.
- **Фикс:** per-change SAVEPOINT (`with conn.transaction():` внутри psycopg3 → savepoint). Клиенту generic `"server error"`, полный — `log.exception`.
- **Severity:** CRITICAL (mobile-only — паркуется).

### C5 — OAuth state JWT не связан с PKCE verifier (CSRF)

- **Где:** [`services/api/src/api/routes/auth.py:123-126, 159, 168`](../../../services/api/src/api/routes/auth.py#L123)
- **Что:** state JWT содержит только `{"nonce": ...}`. PKCE verifier живёт в отдельной cookie `mm_oauth_pkce`. На callback PKCE-verifier берётся из cookie, state криптографически не связан с verifier'ом.
- **Эффект:** атакующий, который может писать cookie на любом сабдомене (или через XSS из C2), подменяет verifier у жертвы и привязывает её сессию к своей Yandex-учётке.
- **Фикс:** `encode_oauth_state` кладёт `code_challenge` в payload; callback верифицирует `pkce_challenge(verifier_from_cookie) == state.code_challenge`.
- **Severity:** CRITICAL.

### C6 — Нет rate-limiting + публичный `/docs`, `/openapi.json`

- **Где:** [`services/api/src/api/main.py:47-52`](../../../services/api/src/api/main.py#L47) — `FastAPI(...)` без `docs_url=None`. Grep по `slowapi`/`Limiter`/`RateLimit` — 0 совпадений.
- **Эффект:**
  - `/docs`, `/redoc`, `/openapi.json` публично на `api.geobiom.ru` — recon из одного URL.
  - DoS на `/api/auth/refresh` (SHA-256 lookup в БД), `/api/auth/yandex/login` (10s timeout × 2 outbound в Yandex), `/api/places/search` (3× ILIKE %q% + trgm). Burst 100 RPS убивает Postgres pool (max 10).
- **Фикс:** в проде `FastAPI(... docs_url=None, redoc_url=None, openapi_url=None)`. `slowapi` на auth/search/sync эндпоинтах.
- **Severity:** CRITICAL.

### C7 — 365-day device JWT + stub revoke + accepted everywhere

- **Где:** [`settings.py:61`](../../../services/api/src/api/settings.py#L61) `device_token_ttl_seconds = 365 * 86400`. [`auth/jwt_tokens.py:69-72`](../../../services/api/src/api/auth/jwt_tokens.py#L69) `typ in {"access","device"}` принимаются одинаково всеми `Depends(CurrentUser)`. [`routes/mobile.py:107-114`](../../../services/api/src/api/routes/mobile.py#L107) `auth_revoke` — stub, `return None`.
- **Эффект:** украденный device-token = бессрочный web-логин до истечения, в т.ч. на `/api/cabinet/*`. Плюс [`refresh.py:38-45`](../../../services/api/src/api/auth/refresh.py#L38) использует тот же `JWT_SECRET` как pepper для refresh-hash → ротация секрета убивает ВСЕ refresh-токены (mass-logout).
- **Фикс:** таблица `device_token_revocation (user_id, device_id, revoked_at, UNIQUE(user_id, device_id))`, проверка в `decode_access_token` при `typ=='device'`. Отдельный `DEVICE_JWT_SECRET`. TTL ↓ до 90 дней.
- **Severity:** CRITICAL для RuStore-релиза. Паркуется на этапе паузы по мобайлу.

### C8 — GitHub Actions на плавающих тегах с доступом к prod SSH key

- **Где:** [`.github/workflows/deploy-api.yml`](../../../.github/workflows/deploy-api.yml), [`.github/workflows/deploy-web.yml`](../../../.github/workflows/deploy-web.yml). `appleboy/ssh-action@v1`, `easingthemes/ssh-deploy@v5.0.3`, `actions/*@v4` — все плавающие.
- **Эффект:** один взлом third-party action → полный takeover prod на следующем `git push`.
- **Фикс:** SHA-pin каждого `uses:`. Dependabot будет PR'ить SHA-bumps.
- **Severity:** CRITICAL.

### C9 — Forecast cross-repo контракт фиктивный

- **Где:** [`services/api/src/api/routes/forecast.py`](../../../services/api/src/api/routes/forecast.py). Эндпоинт возвращает `hashlib.sha256(district_id, date).hex` как score + жёсткий пул из 18 species (L52). Grep по `forecast.` (схема) в `services/api/src/` = 0.
- **Эффект:** когда mushroom-forecast реально начнёт писать в `forecast.prediction` — drift в shape/slug = 500 на `/api/forecast/at` + чистый choropleth. Migration 032 ввела `admin_area.slug`, read-path всё ещё дёргает `code[len("osm_rel_"):]` (L176).
- **Фикс:** `forecast_repo.py` читает `forecast.prediction`, fallback на fixture только если row пуст или старее 24h. Schema-version pinning через `forecast.prediction.schema_version`. ADR.
- **Severity:** CRITICAL архитектурный долг, не блокер пока forecast не используется.

## WARNINGS

### Backend / API

- **W-B1** [`routes/cabinet.py:182-193`](../../../services/api/src/api/routes/cabinet.py#L182) — web-DELETE = hard delete, mobile sync = soft delete. Расхождение кеша: web-удалённый спот не пропадает в мобайле, mobile-удалённый невидим в кабинете (фильтр `deleted_at IS NULL`).
- **W-B2** [`routes/auth.py:96-98`](../../../services/api/src/api/routes/auth.py#L96) — `request.headers.get("x-forwarded-for").split(",")[0]`. Caddy сейчас strip'ает XFF, работает «по случайности топологии». Любой прокси/CDN перед Caddy → клиент инжектит свой IP в audit-trail.
- **W-B3** `OAUTH_STATE_SECRET` упомянут в CLAUDE.md «Pre-prod-deploy checklist §2» как отдельный секрет, в `Settings` его нет; `encode_oauth_state` использует `jwt_secret`. Либо реализовать, либо убрать из чек-листа.
- **W-B4** `services/geodata/.../db.py:11-22` — `init_pool(min_size=2, max_size=10)` без `timeout=`. На исчерпании пула запросы блокируются дефолтные 30s вместо быстрого 503.
- **W-B5** `routes/mobile.py:330` — `int(rating)` упадёт, если rating станет nullable (Pydantic `SpotSyncServerChange.rating: Optional[int]` это уже разрешает).
- **W-B6** `routes/mobile.py:396-397` — `change.name or ""`, `change.rating or 3`. Клиент шлёт `{"op":"update","rating":null}` с намерением «не трогать» — сервер пишет `3`. Нужен явный contract.
- **W-B7** `routes/mobile.py:308` — `sent_uuids` пересобирается на каждой итерации внутреннего цикла. 500×1000 = 500k стрингификаций на запрос.
- **W-B8** `routes/mobile.py:212` — `last_sync_at: int` без зафиксированных единиц. Клиент пошлёт `Date.now()/1000` по ошибке → сервер думает «1970+19 дней» → возвращает full history. Ужесточить `ge=10**12`.
- **W-B9** [`pipelines/ingest_vk.py`](../../../pipelines/ingest_vk.py) — 1073 LoC, 4 stages в одном файле, общие mutable-константы, нет recovery primitives. Promote-stage пишет `observation_written = TRUE` (L990) в таблицу, которую CLAUDE.md называет deprecated.
- **W-B10** [`pipelines/build_forest_tiles.sh`](../../../pipelines/build_forest_tiles.sh) — нет atomic rename / `pmtiles verify`. При падении tippecanoe pmtiles-файл может стать zero-byte; Caddy ставит `Cache-Control: immutable, max-age=86400` — корраптный файл прокеширован у юзеров на сутки.
- **W-B11** Нет DOWN-миграций. Migration 030 (color → rating) — необратимая. `deploy-api.yml` запускает migrate.py сразу после `up -d` без pre-migration backup.

### Frontend (web)

- **W-W1** [`hooks/useMapLayers.ts:63-94`](../../../apps/web/src/components/mapView/hooks/useMapLayers.ts#L63) — `lazyAdd` await fetch HEAD захватывает `m`, не `mapRef`. При unmount во время HEAD `entry.add(m)` падает на removed map. `inFlightRef` залипает.
- **W-W2** [`auth/AuthProvider.tsx:83-114`](../../../apps/web/src/auth/AuthProvider.tsx#L83) — `hydrate` async без `cancelled` flag. `logout()` во время hydrate → state перезатирается на authenticated после resolve.
- **W-W3** `AuthProvider.tsx:66-77` — `scheduleRenew` не ретраит на network-failure. Один blip → silent logout через 15 мин.
- **W-W4** [`hooks/useBaseMap.ts:40-48`](../../../apps/web/src/components/mapView/hooks/useBaseMap.ts#L40) — RAF-poll до `isStyleLoaded()` без timeout. Glyph 404 → RAF идёт вечно.
- **W-W5** [`vite.config.ts:51-61`](../../../apps/web/vite.config.ts#L51) — service worker кеширует `/api/*` через NetworkFirst со `statuses: [0, 200]` без auth-aware cache key. На общем ноуте после logout юзер B видит спот юзера A на flaky-network.
- **W-W6** Нет CSP-заголовка. Defense-in-depth для C2.
- **W-W7** Нет фронтовых тестов. Бэк: 67/39 тестов. Web: ноль `*.test.tsx`.

### Mobile (паркуется до решения по мобайлу)

- **W-M1** Cancel API mismatch: `signal.aborted` проверяется только между layer-итерациями.
- **W-M2** `sha256File` читает 30-70 МБ pmtiles целиком как base64 в память.
- **W-M3** SQLite не зашифрован в v0 (release-blocker для RuStore).
- **W-M4** `applyServerChanges` тихо дропает server-row'ы без UUID.
- **W-M5** `setApiBaseUrl` mutable global.
- **W-M6** Нет mobile CI workflow.
- **W-M7** `device_id` from client (revoke spoofable).

### Architecture / supply chain

- **W-A1** Two-stack web — деплой на Oracle ручной. `deploy-web-oracle.yml` отсутствует.
- **W-A2** [`services/api/pyproject.toml:6-19`](../../../services/api/pyproject.toml#L6) — все зависимости `>=`, нет lockfile.
- **W-A3** Три параллельных словаря видов: `_FORECAST_SPECIES_POOL` (forecast.py), `species_forest_affinity` (SQL), `GROUP_TO_SLUGS` (ingest_vk.py / CLAUDE.md).
- **W-A4** Hand-rolled `SpotSyncResponse` в [`apps/mobile/services/sync.ts:34-54`](../../../apps/mobile/services/sync.ts#L34) дублирует Pydantic из `routes/mobile.py:196-238`. Dрейф в рантайме.
- **W-A5** [`docker-compose.prod.yml:9-11`](../../../docker-compose.prod.yml#L9) комментарий «Web фронт не входит — Cloudflare Pages» устарел с 2026-04-29.

### Security misc

- **W-S1** = L1: `/api/healthz` светит DB exception text.
- **W-S2** Single-recipient age-key для бэкапов. Дев-ноут потерян → невосстановимо. Дев-ноут украден → атакующий читает все DB-дампы.
- **W-S3** [`scripts/deploy/cutover_to_oracle.sh:86-102`](../../../scripts/deploy/cutover_to_oracle.sh#L86) — bash-интерполяция пароля в HEREDOC psql. Кавычка в пароле = поломка.
- **W-S4** = L3: `sentry_sdk.init` без `with_locals=False` тащит lat/lon в GlitchTip.
- **W-S5** Caddyfile loopback-bind для GlitchTip заявлен в комментарии, надо смоук-проверить через `scripts/deploy/smoke_test_prod.sh`.

## NOTES

- `apps/web/src/routes/MapPage.tsx` — лениво импортируется только для `/map/:district`, спека: «SidebarDistrict пока пустой». Мёртвый роут?
- `mapView/hooks/useMapShare.ts`, возможно `useMouseLngLat.ts` — без вызывателей.
- Хардкод `palette.light.chanterelle` для FAB + active rating + active tag — конфликт смыслов.
- `.gitignore` не покрывает `dist/`, `*.apk`, `*.keystore`, `*.age`, `id_rsa*`, `.cloudflare/` (= L4).
- `services/web/` пустая директория (только `node_modules/`).
- Корневой `package.json` тащит `expo`, `react`, `react-native` как direct deps.
- `pipelines/extract_places.py` — deprecated, заменён `extract_vk_districts.py`, всё ещё 263 LoC.
- `observation` table + `vk_post.observation_written` — CLAUDE.md «deprecated», `ingest_vk.py:990` всё ещё пишет.
- 35 скриптов pipeline + 15 deploy-shell без runbook'а.
- Mobile `SpikeMap.tsx` (329 LoC) не прошёл декомпозицию как web `MapView`.
- Inline-стили в `SaveSpotModal.tsx` (~270 LoC).
- Нет staging-окружения.
- Нет SLO/alert (GlitchTip ловит ошибки, никто не смотрит на 5xx-rate / pool-saturation).

## Threat model — top 5 attack scenarios

1. **Mobile device-token theft → 365-day full account access.** Rooted/stolen Android, SQLite plaintext, SecureStore bypass, no server-side revoke. Highest blast-radius unmitigated risk.
2. **Auth-endpoint flood.** Нет rate limit на `/api/auth/refresh`, `/api/mobile/auth/yandex`, `/api/auth/yandex/login`, `/api/places/search`. CPU/db exhaustion DoS, Yandex API quota burn.
3. **Supply-chain compromise via floating-tag GH Actions** с prod SSH key access.
4. **Stale dev box → backup decryption.** Single-recipient age key на одном ноуте. Theft = read all DB backups; loss = unrecoverable disaster.
5. **OSM/gazetteer XSS via popup `name` interpolation.** XSS на geobiom.ru читает `accessToken` из React-context.

## Strengths (preserve these)

1. **Layer registry pattern** ([`mapView/registry.ts`](../../../apps/web/src/components/mapView/registry.ts)) — добавление слоя реально 1 файл + 1 запись.
2. **`useLayerVisibility` Zustand** как single source of truth.
3. **Refresh-token rotation с reuse-detection** ([`auth/refresh.py:147-159`](../../../services/api/src/api/auth/refresh.py#L147)) — peppered SHA-256, family-revoke, commit-before-raise.
4. **JWT-secret hard-fail в проде** (`settings.py:90-112`).
5. **`scripts/_bbox.py` + `_overpass.py`** zero-dep helpers.
6. **`forest_unified` VIEW** с приоритетами источников.
7. **Backup со restore-drill** + row-count asserts.
8. **`ForestSource` ABC strategy** в `services/geodata`.
9. **CI с реальной PostGIS** (test.yml:64-127).
10. **Sync — idempotent + last-write-wins по client_uuid** — CRDT-lite контракт корректный (после фикса C3).

## Что НЕ требует немедленных действий (мониторим)

1. **Если появятся юзеры помимо автора** — TimeWeb-only deploy + Oracle-stale становится production-risk (W-A1).
2. **Когда mushroom-forecast начнёт писать в forecast.\*** — без C9 фикса первый рассинхрон shape убъёт choropleth.
3. **При росте до 1k users × 100 spots × daily sync** — `LIMIT 1000` на server_changes (`mobile.py:299`) перестанет хватать после месяца offline. Cursor-пагинация.

## Ссылки

- Fix-roadmap: [`docs/superpowers/plans/2026-05-02-global-review-fixes.md`](../plans/2026-05-02-global-review-fixes.md)
- CLAUDE.md «Mobile app plan» (Phase 4 done): актуальное состояние мобайла
- CLAUDE.md «MapView architecture (post-refactor 2026-04-29)»: контракт frontend
- CLAUDE.md «Production стек: two-stack (с 2026-04-30)»: текущий деплой
