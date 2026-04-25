# Production deployment runbook

Целевая архитектура (бесплатная):

```
┌─────────────────────────────────────────────────────────────┐
│ Cloudflare Pages                                            │
│   - mushroom-map.pages.dev (или кастомный домен)            │
│   - статический Vite-билд apps/web/dist                     │
│   - бесплатно: unlimited bandwidth, 500 builds/mo           │
└──────┬──────────────────────────────────────────┬───────────┘
       │ /api/*, /tiles/*                         │ остальное
       ▼                                          │ (фронт сам по себе)
┌──────────────────┐     /tiles/*           ┌─────┴───────────┐
│ Caddy (на VM)    │ ────────────────►      │ (опционально)   │
│   api.<домен>    │                        │ Cloudflare R2   │
│   - reverse-proxy│                        │   - 10 GB free  │
│   - auto Let's   │                        │   - tile-CDN    │
│     Encrypt TLS  │                        └─────────────────┘
└──────┬───────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Oracle Cloud Free Tier ARM Ampere VM                        │
│   - Ubuntu 22.04, 4 vCPU, 24 GB RAM, 200 GB storage         │
│   - docker-compose.prod.yml: db (PostGIS) + api (uvicorn)   │
└─────────────────────────────────────────────────────────────┘
```

Шаги ниже — последовательно. Что-то требует регистрации аккаунтов;
ничего не нужно платить — всё в бесплатных лимитах.

---

## 0. Что должно быть готово до начала

- [ ] Домен (`.ru` за 200₽/год через reg.ru или `.app` за $12/год через
      Cloudflare Registrar). Можно стартовать без своего домена — на
      `mushroom-map.pages.dev` (Cloudflare выдаёт субдомен).
- [ ] GitHub репозиторий (есть).
- [ ] Локально работающий стек (`docker compose --profile full up -d`).

---

## 1. Cloudflare Pages — статический фронт

1. Зарегистрироваться на cloudflare.com (если ещё нет).
2. Dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Подключить GitHub-репозиторий `mushroom_map`. Для прод-деплоя
   через Actions можно НЕ подключать build на стороне CF, но это
   удобно для preview-деплоев на PR.
4. Project name — например `mushroom-map`.
5. Build settings (если CF собирает сам):
   - Framework preset: `None`
   - Build command: `npm ci && npm -w @mushroom-map/web run build`
   - Build output directory: `apps/web/dist`
   - Root directory: пусто
   - Env vars: `VITE_API_URL=https://api.<твой-домен>`

После создания проекта подсмотреть Account ID (правая колонка дашборда,
8-символьное hex). Это `CF_ACCOUNT_ID` для GitHub Actions.

Создать API token:
   My Profile → API Tokens → Create Token → "Edit Cloudflare Pages"
   → ограничить scope аккаунтом и проектом → создать → запомнить
   значение (это `CF_API_TOKEN`).

---

## 2. Oracle Cloud Free Tier — VM для backend

1. Зарегистрироваться на cloud.oracle.com (нужна банковская карта для
   проверки личности; Oracle не списывает с неё, пока ты в free-tier).
   Регион — выбрать ближайший к ЛО, обычно Frankfurt или Amsterdam.
2. Compute → Instances → Create:
   - Image: Canonical Ubuntu 22.04 (ARM)
   - Shape: VM.Standard.A1.Flex — 4 OCPU, 24 GB RAM (always-free)
   - VCN: дефолтный + публичный subnet
   - Boot volume: 200 GB
   - SSH key: загрузить свой `~/.ssh/id_ed25519.pub`
3. После создания записать публичный IP инстанса.

**Открыть порты 80/443:**
   - Networking → Virtual Cloud Networks → твой VCN → Security Lists
     → Default Security List → Add Ingress Rules:
     - source CIDR `0.0.0.0/0`, dst port 80, TCP
     - source CIDR `0.0.0.0/0`, dst port 443, TCP

**Подготовить VM:**
```bash
ssh ubuntu@<vm-ip> 'bash -s' < scripts/deploy/bootstrap_oracle.sh
```
Скрипт ставит docker, открывает порты в iptables, клонирует репозиторий
в `/srv/mushroom-map`. После завершения — выйти и зайти заново (чтобы
группа docker применилась).

---

## 3. Domain + DNS

1. Купить домен (если хочешь свой).
2. В Cloudflare:
   - Add a Site → ввести домен.
   - Изменить NS-записи у регистратора на те, что Cloudflare выдаст.
   - DNS → Records → Add:
     - Type A, Name `api`, IPv4 = IP VM, Proxy status = **DNS only**
       (Caddy сам делает TLS, проксирование Cloudflare не нужно).
     - (опционально) Type CNAME, Name `tiles`, target = `pub-<id>.r2.dev`
       — после настройки R2 (см. шаг 5).
3. Cloudflare Pages → Custom domains → добавить `<твой-домен>` или
   поддомен (например `app.<домен>`). CF сам сгенерирует CNAME.

---

## 4. Yandex ID OAuth

1. Зайти на oauth.yandex.ru → Создать приложение.
2. Платформа: Web-сервис.
3. Callback URL: `https://api.<твой-домен>/api/auth/yandex/callback`
4. Доступы: `login:email`, `login:info`, `login:avatar`.
5. После создания — скопировать `ID` и `Пароль` (это
   `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET`).

---

## 5. (Опционально) Cloudflare R2 для PMTiles

Если хочешь снять нагрузку с VM на отдачу tile-файлов:

1. Cloudflare Dashboard → R2 → Create bucket → name `mushroom-map-tiles`.
2. Manage API Tokens → Create API token (Object Read & Write на bucket).
3. Локально:
   ```
   rclone config            # см. scripts/deploy/sync_tiles_to_r2.sh
   bash scripts/deploy/sync_tiles_to_r2.sh
   ```
4. R2 bucket → Settings → Public access → Allow OR Custom domain
   → tiles.<твой-домен>.

Если R2 пропускаешь — PMTiles остаются на VM в `/srv/mushroom-map/data/tiles`,
Caddy раздаёт через `/tiles/*`. На MVP-трафике работает нормально.

---

## 6. Первый деплой backend

На VM (`ssh ubuntu@<vm-ip>`):

```bash
cd /srv/mushroom-map
cp infra/.env.prod.example .env.prod
nano .env.prod
# заполнить:
#   POSTGRES_PASSWORD       — длинный рандом
#   JWT_SECRET              — длинный рандом (python -c "import secrets; print(secrets.token_urlsafe(64))")
#   API_CORS_ORIGINS        — https://<пока-CF-Pages-домен>,https://<свой-домен>
#   YANDEX_CLIENT_ID/SECRET — из шага 4
#   YANDEX_REDIRECT_URI     — https://api.<твой-домен>/api/auth/yandex/callback
#   FRONTEND_AUTH_*         — https://<твой-фронт>/auth/{complete,error}
#   CADDY_API_HOST          — api.<твой-домен>
#   CADDY_ACME_EMAIL        — твоя почта
#   TILES_HOST_PATH         — /srv/mushroom-map/data/tiles (если хранишь PMTiles на VM)

# Вытаскиваем PMTiles на VM (если не R2):
mkdir -p data/tiles data/copernicus/terrain
# 1. Один раз: scp -C *.pmtiles ubuntu@<vm-ip>:/srv/mushroom-map/data/tiles/
# 2. Или с R2 через rclone, если уже залил.

# Поднимаем стек:
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Применяем миграции (миграционник нужно прокинуть):
docker compose -f docker-compose.prod.yml --env-file .env.prod cp \
    db/migrations api:/app/migrations
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api \
    python -c "
from db.migrate import main
import sys; sys.argv=['migrate.py']; main()
" || echo "если эта команда не сработает — запусти /app/db/migrate.py вручную"
```

(Альтернатива по миграциям: добавить их в образ — `COPY db /app/db` в
Dockerfile.prod — и запускать через `python /app/db/migrate.py`.)

**Импортируем данные с локали** (одноразово, с локальной машины):

```bash
REMOTE=ubuntu@<vm-ip> bash scripts/deploy/sync_db_to_remote.sh
```

(Скрипт делает pg_dump локальной БД, scp на VM, pg_restore через
docker compose exec. Параметр `--exclude-table-data='vk_post'` экономит
~2 ГБ — VK-посты можно перегенерировать на VM позже.)

**Проверка:**
```bash
curl -I https://api.<твой-домен>/health
# должен вернуть 200 + Caddy TLS
```

---

## 7. Включение GitHub Actions деплоя

В репозитории на GitHub:

Settings → Secrets and variables → Actions → **Secrets**:
- `PROD_HOST` = IP VM
- `PROD_SSH_USER` = `ubuntu`
- `PROD_SSH_KEY` = содержимое приватного ключа (`cat ~/.ssh/id_ed25519`)
- `CF_API_TOKEN` = из шага 1
- `CF_ACCOUNT_ID` = из шага 1

Settings → Secrets and variables → Actions → **Variables**:
- `PROD_DEPLOY_ENABLED` = `true` (включает ssh-job в deploy-api.yml)
- `CF_PAGES_PROJECT` = `mushroom-map` (имя проекта в CF Pages)
- `VITE_API_URL` = `https://api.<твой-домен>`

После следующего push в main:
- `deploy-api.yml` соберёт образ → push в GHCR → ssh на VM → pull + restart.
- `deploy-web.yml` соберёт фронт и зальёт в Cloudflare Pages.

---

## 8. Поддержание Oracle Free Tier

Oracle снимает «всегда бесплатные» инстансы при продолжительной
неактивности. Чтобы не потерять VM:

```bash
# Раз в неделю автоматический ping. Создать на VM:
echo "0 6 * * * curl -s https://api.<твой-домен>/health > /dev/null" | crontab -
```

Также раз в неделю заходить по ssh — это считается активностью.

Если Oracle всё-таки заблокирует — план Б — Fly.io shared-cpu-1x с
подтюненным Postgres (теснее по памяти, но работает).

---

## 9. Откат

Если новый коммит ломает прод:

```bash
ssh ubuntu@<vm-ip>
cd /srv/mushroom-map
# найти предыдущий sha-tag (ghcr-теги хранятся 30+ дней по умолчанию):
docker images ghcr.io/<owner>/mushroom-map-api --format "{{.Tag}} {{.CreatedSince}}"
# откатиться:
sed -i "s|API_IMAGE=.*|API_IMAGE=ghcr.io/<owner>/mushroom-map-api:sha-XXXXXXX|" .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api
```

DB-миграции «вперёд-only»; для отката схемы нужен явный down-скрипт
(пока их нет — стараться не катить миграции, ломающие совместимость).

---

## 10. Что осталось не автоматизировано (TODO)

- [ ] Миграционник в prod-образе. Сейчас миграции применяются вручную
      или через bind-mount. Стоит добавить `COPY db /app/db` в
      Dockerfile.prod и шаг `python /app/db/migrate.py` в deploy-api.
- [ ] Бэкапы БД. Сейчас просто `pg_dump` руками; план — cron на VM,
      гонящий dump в R2 раз в сутки.
- [ ] Мониторинг. Сейчас только `curl /health`; план — uptime-monitor
      на UptimeRobot (free) + при появлении нагрузки Grafana Cloud free.
- [ ] Sentry/error tracking — пока никаких; добавить когда появится
      реальный трафик.
