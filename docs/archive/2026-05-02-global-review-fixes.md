# Global review fixes — implementation plan (web + backend + infra)

Дата: 2026-05-02
Статус: draft, ждёт «отмашки» от пользователя
Спека: [`docs/superpowers/specs/2026-05-02-global-review-design.md`](../specs/2026-05-02-global-review-design.md)

## Решение по scope'у

**Mobile app паркуется на этом этапе** (по решению пользователя 2026-05-02 — мобильное приложение «только начали делать», правки преждевременны). Это означает, что следующие находки из спеки выбрасываются из плана:

- ~~C1~~ mobile auth TypeError (`upsert_oauth_user` kwargs) — баг в `routes/mobile.py`, но эндпоинт зовёт только мобайл-клиент
- ~~C3~~ client_uuid global UNIQUE — затрагивает только `/api/mobile/spots/sync`
- ~~C4~~ sync error swallow + commit-after-aborted-txn
- ~~C7~~ device JWT no-revoke + SQLCipher
- ~~W-B5, W-B6, W-B7, W-B8~~ — все в `routes/mobile.py`
- ~~W-A4~~ sync types drift mobile↔API
- ~~W-M1...W-M7~~ — все мобайл

Остальное (web + backend + infra + supply-chain + observability + бэкап) — в плане ниже.

## Сводка приоритетов

3 CRITICAL + 8 WARNING + housekeeping. ~16-20 часов суммарно. Группировка по PR'ам в порядке убывания пользы / срочности.

| PR | Цель | Severity max | Часы |
|----|------|-------------|------|
| PR-W1 | XSS popup + CSP | CRITICAL | 2-3 |
| PR-W2 | Auth hardening (CSRF + rate limit + /docs hidden) | CRITICAL | 4 |
| PR-W3 | Frontend race & lifecycle hygiene | WARNING | 4 |
| PR-W4 | Frontend tests baseline | WARNING | 3 |
| PR-W5 | Supply chain + secrets hygiene | CRITICAL | 2 |
| PR-W6 | Pipeline reliability + observability | WARNING | 3 |
| PR-W7 | Backup hardening | WARNING | 2 |

---

## PR-W1 — XSS popup + CSP

**Цель:** закрыть тривиальный XSS, который превращается в кражу access-token.

**Risk if skipped:** OSM-данные публично редактируемы. Один `name='<img src=x onerror=fetch(...)>'`  где-то в bbox ЛО → клик любого залогиненного пользователя около этой точки = exfil access-token + действия от его имени.

**Files:**
- Modify: `apps/web/src/components/mapView/utils/popup.ts`
- Modify: `infra/Caddyfile`
- (optional) Modify: `apps/web/.eslintrc.cjs` или `eslint.config.js`

### Tasks

- [ ] **W1.1** Переписать `popup.ts` с `popup.setHTML(...)` на `popup.setDOMContent(buildPopupDom(...))`.
  - MapLibre поддерживает `setDOMContent`. Строки `n.name`, `n.kind`, `s.name_ru`, `s.name_lat`, `f.dominant_species`, `p.soil0.descript` идут как `textContent`, не innerHTML.
  - Альтернатива (быстрее, грязнее): `escapeHtml(...)` на каждый сервер-стринг — паттерн уже есть в [`apps/web/src/components/mapView/layers/userSpots.ts:90,96`](../../../apps/web/src/components/mapView/layers/userSpots.ts#L90).
- [ ] **W1.2** Добавить в `infra/Caddyfile` (web-host блок, после X-Frame-Options) header:
  ```
  Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.geobiom.ru https://*.versatiles.org https://server.arcgisonline.com https://*.tile.openstreetmap.org; report-uri /csp-report"
  ```
  Через 7 дней без репортов — снять `-Report-Only`.
- [ ] **W1.3** ESLint правило `no-restricted-syntax` на `setHTML\(.*\$\{[^}]*\}.*\)` — guard от регресса. Проверить, что нынешний код проходит после W1.1.

### Acceptance

- Ручной тест: засеять `forest_polygon.dominant_species = '<img src=x onerror=alert(1)>'` в локальной БД → клик не выполняет JS.
- `curl -I https://geobiom.ru/` после деплоя содержит `Content-Security-Policy-Report-Only`.
- `npm run lint` зелёный.

---

## PR-W2 — Auth hardening (CSRF + rate limit + /docs hidden)

**Цель:** закрыть OAuth CSRF, убрать публичный recon-канал `/docs`, ограничить burst на auth/search.

**Risk if skipped:** атакующий с возможностью писать cookie на сабдомене (или через XSS из C2) подменяет PKCE-verifier у жертвы и привязывает её сессию к своей Yandex-учётке. Параллельно — burst 100 RPS на `/api/auth/refresh` убивает Postgres pool.

**Files:**
- Modify: `services/api/src/api/main.py`
- Modify: `services/api/src/api/routes/auth.py`
- Modify: `services/api/src/api/auth/jwt_tokens.py`
- Modify: `services/api/src/api/settings.py` (опционально под W2.4)
- Modify: `services/api/pyproject.toml` (добавить `slowapi`)
- Modify: `infra/Caddyfile` (trusted_proxies)

### Tasks

- [ ] **W2.1** В `encode_oauth_state` ([`auth/jwt_tokens.py`](../../../services/api/src/api/auth/jwt_tokens.py)) добавить `code_challenge` в payload. На callback ([`routes/auth.py:159-168`](../../../services/api/src/api/routes/auth.py#L159)) дёрнуть `pkce_challenge(verifier_from_cookie) == state.code_challenge`, иначе 400.
- [ ] **W2.2** В [`main.py:47-52`](../../../services/api/src/api/main.py#L47) `FastAPI(... docs_url=None, redoc_url=None, openapi_url=None)` под `if settings.cookie_secure:`. На dev `/docs` остаётся.
- [ ] **W2.3** Установить `slowapi`:
  ```
  pip install slowapi
  ```
  В `pyproject.toml` → `slowapi>=0.1.9`. В `main.py` инициализировать `Limiter(key_func=get_remote_address)`. Лимиты:
  - `5/min` на `POST /api/auth/yandex/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/yandex/callback`
  - `60/min` на `GET /api/places/search`
  - `120/min` на read-эндпоинты карты (forest/at, water/distance/at, terrain/at, soil/at)
- [ ] **W2.4** В [`routes/auth.py:96-98`](../../../services/api/src/api/routes/auth.py#L96) `_client_meta`: брать rightmost XFF-entry (после `trusted_proxies`); либо `request.client.host` как fallback. В Caddyfile добавить `trusted_proxies private_ranges` чтобы Caddy сам корректно ставил X-Forwarded-For.
- [ ] **W2.5** Реализовать `OAUTH_STATE_SECRET` отдельно от `JWT_SECRET` в `Settings` (обоснование — CLAUDE.md «Pre-prod-deploy checklist §2»). Если откладываем — убрать упоминание из CLAUDE.md, чтобы не врать.
- [ ] **W2.6** В `main.py:101` (`/api/healthz` 503 path) убрать `{exc}` из response. Логировать через `log.exception`.

### Acceptance

- `curl https://api.geobiom.ru/docs` → 404.
- `for i in {1..7}; do curl -X POST https://api.geobiom.ru/api/auth/refresh; done` → 6-й и 7-й = 429.
- CSRF-test: подменить `mm_oauth_pkce` cookie перед callback → 400.
- `curl -s https://api.geobiom.ru/api/healthz` (при упавшей БД) НЕ содержит DSN/socket-strings.
- `pytest tests/` зелёный.

---

## PR-W3 — Frontend race & lifecycle hygiene

**Цель:** убрать race conditions, которые сейчас не пожар, но в рантайме на flaky-сети дают ghost state.

**Risk if skipped:** «логин после логаута» (W-W2), silent logout через 15 мин на blip (W-W3), вечный RAF-poll и трата батареи (W-W4), кросс-юзер кеш-leak в SW (W-W5).

**Files:**
- Modify: `apps/web/src/components/mapView/hooks/useMapLayers.ts`
- Modify: `apps/web/src/auth/AuthProvider.tsx`
- Modify: `apps/web/src/components/mapView/hooks/useBaseMap.ts`
- Modify: `apps/web/vite.config.ts`

### Tasks

- [ ] **W3.1 (W-W1)** В `useMapLayers.lazyAdd` захватывать `mapRef`, не `m` напрямую. В `doAdd` проверка `if (!mapRef.current || mapRef.current !== capturedMap) return;`. Cleanup-функция useEffect: `return () => inFlightRef.current.clear();`.
- [ ] **W3.2 (W-W2)** В `AuthProvider.hydrate` добавить `cancelled` flag. `logout()` ставит generation-counter; `hydrate` сверяет на старте и перед каждым `setState`.
- [ ] **W3.3 (W-W3)** В catch `hydrate` различать 401 (logout) от network-error (retry-with-backoff: 1s, 5s, 30s, дальше — тост «session expired»).
- [ ] **W3.4 (W-W4)** В `useBaseMap` параллельно с RAF-poll'ом — `setTimeout(() => onAfterApply(), 5000)`; первый сработавший отменяет второго.
- [ ] **W3.5 (W-W5)** В `vite.config.ts` `runtimeCaching` — `urlPattern` SW-кеша исключает `/api/cabinet/*`, `/api/user/*`, `/api/auth/*`. В `AuthProvider.logout` дёргать `if ('caches' in window) await caches.delete('mushroom-api');`.

### Acceptance

- Ручной тест: открыть карту, переключать слои, мгновенно перейти на /species → нет ошибок в консоли.
- Logout → следующий refresh не показывает старые споты.
- Открыть DevTools Network → throttle Slow 3G → переключить basemap → через 5s карта работает (fallback сработал).

---

## PR-W4 — Frontend tests baseline

**Цель:** дальше любая регрессия PR-W1...W3 ловится автоматически.

**Risk if skipped:** XSS вернётся в следующий popup-edit; race condition в AuthProvider вернётся через 3 месяца. Web-тестов сейчас НОЛЬ.

**Files:**
- Add: `apps/web/vitest.config.ts`
- Add: `apps/web/src/test/setup.ts`
- Add: ~10 файлов `*.test.ts(x)` в соответствующих папках
- Modify: `apps/web/package.json`
- Modify: `.github/workflows/test.yml`

### Tasks

- [ ] **W4.1** Установить `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`.
- [ ] **W4.2** Минимальный набор тестов:
  - `escapeHtml.test.ts` — round-trip с `<img onerror>`, `<script>`, `'`, `"`, `&`
  - `safeNext.test.ts` — если есть utility для `?next=` redirect-проверки
  - `AuthProvider.test.tsx` с моком `fetchMe`: 401 → unauth, network-error → retry, success → auth, logout-during-hydrate → unauth
  - `Spotlight.test.tsx` — debounce + cancellation (race из W4 спеки)
  - `useLayerVisibility.test.ts` — reducers (`select`, `setForestColorMode`, etc.)
- [ ] **W4.3** В `apps/web/package.json` → `"test": "vitest run"`, `"test:watch": "vitest"`.
- [ ] **W4.4** В `.github/workflows/test.yml` добавить step после backend-тестов: `cd apps/web && npm test`.

### Acceptance

- ≥15 тестов зелёные локально (`npm test` из `apps/web`).
- В CI (push в main) виден шаг web-tests, зелёный.

---

## PR-W5 — Supply chain + secrets hygiene

**Цель:** закрыть SSH-takeover через скомпрометированные actions + .gitignore foot-guns + воспроизводимость билда API.

**Risk if skipped:** один взлом мейнтейнера `appleboy/ssh-action` → полный takeover prod на следующем `git push`. Случайный `git add .` забирает `.age` private key или `.apk` в git.

**Files:**
- Modify: `.github/workflows/deploy-api.yml`
- Modify: `.github/workflows/deploy-web.yml`
- Modify: `.github/workflows/test.yml`
- Modify: `.gitignore`
- Modify: `services/api/Dockerfile.prod`
- Add: `services/api/requirements.lock`

### Tasks

- [ ] **W5.1 (C8)** Прогнать каждый `uses:` в `.github/workflows/*.yml`:
  - `actions/checkout@v4` → `actions/checkout@<sha> # v4.1.7`
  - `actions/setup-node@v4` → SHA-pin
  - `actions/setup-python@v5` → SHA-pin
  - `appleboy/ssh-action@v1` → SHA-pin (внимательно проверить changelog)
  - `easingthemes/ssh-deploy@v5.0.3` → SHA-pin
  - `docker/login-action@v3`, `docker/setup-buildx-action@v3`, `docker/build-push-action@v6` → SHA-pin
  - Включить Dependabot для actions (`.github/dependabot.yml`).
- [ ] **W5.2 (L4)** В `.gitignore` добавить:
  ```
  apps/web/dist/
  apps/mobile/android/app/build/
  *.apk
  *.aab
  *.keystore
  *.jks
  *.age
  *.pem
  id_rsa
  id_rsa.pub
  .cloudflare/
  ```
- [ ] **W5.3 (W-A2)** Сгенерить lockfile:
  ```
  cd services/api
  pip install pip-tools
  pip-compile --generate-hashes pyproject.toml -o requirements.lock
  ```
  В `Dockerfile.prod` заменить `pip install -e .` на `pip install --no-deps -r requirements.lock && pip install -e .`. Dependabot-PR'ы будут обновлять lock.

### Acceptance

- `gh run view <run-id> --log` показывает SHA-длинные хеши в actions, не `@v4`.
- `git check-ignore apps/web/dist/index.html` → ignored.
- `docker build -f services/api/Dockerfile.prod` использует lock-versions.
- Dependabot PR появляется в репо в течение недели после merge.

---

## PR-W6 — Pipeline reliability + observability

**Цель:** не отдавать пользователям корраптный pmtiles, не светить PII в Sentry, проверить loopback-bind.

**Risk if skipped:** падение tippecanoe → корраптный forest.pmtiles прокеширован у юзеров на сутки (`Cache-Control: immutable`). Lat/lon юзера в GlitchTip-стактрейсе. GlitchTip публично доступен, если кто-то поправил compose.

**Files:**
- Modify: `pipelines/build_forest_tiles.sh`
- Modify: `services/geodata/src/geodata/db.py`
- Modify: `services/api/src/api/main.py`
- Modify: `scripts/deploy/smoke_test_prod.sh`
- Modify: `scripts/deploy/cutover_to_oracle.sh`

### Tasks

- [ ] **W6.1 (W-B10)** В `build_forest_tiles.sh`:
  - tippecanoe → `forest.pmtiles.tmp`
  - `pmtiles verify forest.pmtiles.tmp` (если CLI поддерживает) ИЛИ `pmtiles show --header forest.pmtiles.tmp | grep -q '"tiles":[1-9]'`
  - `mv -f forest.pmtiles.tmp forest.pmtiles`
  - Любая ошибка между шагами — `exit 1`, без подмены live-файла.
- [ ] **W6.2 (W-B4)** В `services/geodata/.../db.py:11` — `init_pool(min_size=2, max_size=10, timeout=5.0)`.
- [ ] **W6.3 (L3 / W-S4)** В `services/api/src/api/main.py:22-37` — `sentry_sdk.init(..., send_default_pii=False, with_locals=False)`. В `routes/mobile.py:277` (если фиксим — иначе оставляем mobile-park):
  ```python
  log.exception(
      "sync change failed",
      extra={"op": change.op, "client_uuid_present": bool(change.client_uuid)}
  )
  ```
  без самого `change` объекта.
- [ ] **W6.4 (W-S5)** В `scripts/deploy/smoke_test_prod.sh` добавить:
  ```bash
  # GlitchTip и Umami должны слушать только loopback
  for port in 8001 3000; do
    if curl -s -m 3 -o /dev/null -w "%{http_code}" "http://${PROD_HOST}:${port}/" 2>&1 | grep -qE "^[2345]"; then
      echo "FAIL: port $port reachable from internet" >&2
      exit 1
    fi
  done
  ```
- [ ] **W6.5 (W-S3)** В `scripts/deploy/cutover_to_oracle.sh:86-102` — заменить bash-интерполяцию пароля в HEREDOC на `psql --set=glitchtip_pw="$GLITCHTIP_PW" <<EOF ... CREATE ROLE glitchtip LOGIN PASSWORD :'glitchtip_pw'; EOF` (psql сам экранирует).

### Acceptance

- `bash pipelines/build_forest_tiles.sh` с искусственно сломанным postgres-входом → нет zero-byte `forest.pmtiles`.
- `bash scripts/deploy/smoke_test_prod.sh` зелёный после деплоя.
- В тестовом sentry-event при `sync change failed` есть `op` и `client_uuid_present`, нет `lat`/`lon`/`note`.

---

## PR-W7 — Backup hardening

**Цель:** дев-ноут больше не SPOF для бэкап-стратегии.

**Risk if skipped:** дев-ноут потерян → невозможно расшифровать новые бэкапы (DR провален). Дев-ноут украден → атакующий читает все DB-дампы.

**Files:**
- Modify: `scripts/backup/dump_db.sh`
- Modify: `scripts/backup/README.md`
- Modify: `/etc/geobiom/.env.backup` на VM (вручную, не в git)

### Tasks

- [ ] **W7.1 (W-S2)** Сгенерить второй age-key:
  ```bash
  age-keygen -o ~/.ssh/geobiom-backup-paper.age
  ```
  Распечатать private-key на бумагу, положить в физический сейф / yubikey-wrapped (по выбору). Public — в `/etc/geobiom/.env.backup` как `AGE_RECIPIENT_BACKUP=age1...`.
- [ ] **W7.2** В `scripts/backup/dump_db.sh` менять `age -r $AGE_RECIPIENT` на `age -r "$AGE_RECIPIENT" -r "$AGE_RECIPIENT_BACKUP"`. Каждый файл шифруется на оба recipient'а; любой из двух private-key расшифрует.
- [ ] **W7.3** Документировать ротацию (раз в год) в `scripts/backup/README.md`. Добавить раздел «Disaster recovery: оба private-key потеряны» — what-then ответ.

### Acceptance

- `bash scripts/backup/restore_drill.sh` зелёный с primary key.
- Тестовый restore с paper-key (расшифровать вручную через `age -d -i ~/path/to/paper.key < latest.sql.gz.age | gunzip`) — успешен.

---

## Что СОЗНАТЕЛЬНО оставлено на потом

- **C9 forecast contract fictional** — подождём пока mushroom-forecast реально начнёт писать в `forecast.prediction`. Сейчас никто не страдает.
- **W-A1 deploy-web-oracle** — пока юзеров фактически 1 (автор), Oracle-replica нужна редко; ручной rsync с дева достаточен.
- **W-A3 species vocab triplet** — silent-drift риск, но ловится первым же прогоном `ingest_vk.py`.
- **W-B9 ingest_vk.py monolith** — большой refactor (~1 день).
- **W-B11 нет DOWN-миграций** — пока юзеров нет, страх отката низкий.
- **Notes cleanup** (dead routes, useMapShare, observation table, extract_places, services/web/, корневой package.json deps) — кучкой в один cleanup-PR.
- **Все W-M\*** + C1, C3, C4, C7 — паркуются вместе с мобайлом до решения «продолжаем мобайл / нет».

## Порядок исполнения

Рекомендую **PR-W1 → PR-W2 → PR-W5** (CRITICAL первыми, supply-chain в составе CRITICAL по сути), потом **PR-W3 → PR-W4 → PR-W6 → PR-W7**.

PR-W1 и PR-W2 не пересекаются по файлам — можно лить параллельно если есть ревьювер. PR-W5 трогает только `.github/workflows/*.yml` + `.gitignore` + Dockerfile + lock — никаких пересечений с W1/W2.

Каждый PR должен быть **revertable**: один коммит, описание, smoke-тест на проде после merge (через `scripts/deploy/smoke_test_prod.sh`).

## Exit criteria для всего плана

- 3 CRITICAL закрыты (C2, C5, C6+C8 — последний считается критичным, хоть и формально supply-chain).
- 8 WARNING закрыты (W-B2, W-B3, W-B4, W-B10, W-S1, W-S2, W-S3, W-S5 + всё фронтовое из W-W1...W7).
- Web-test suite ≥15 тестов в CI.
- `.gitignore` покрывает все классы секретов / артефактов.
- Lockfile и SHA-pinned actions.
- В докладе после следующего push'а: «нет необработанных CRITICAL».

## Iteration workflow напоминалка

Перед закрытием плана (после исполнения хотя бы одного PR):
1. Commit + push в origin.
2. Update `Iter-N status` / `Next up` в CLAUDE.md.
3. Update memory (`MEMORY.md` + relevant `reference_*.md`).
4. Зафиксировать exit-state в этом файле (отметить выполненные `- [x]`).
