# Phases 1-4 + 7-8: Oracle migration + cutover + decommission — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the prod stack (api + web + tiles + postgres) from
TimeWeb VM to Oracle Cloud Free Tier ARM (4 OCPU / 24 GB), keep TimeWeb
as warm-fallback for 1-2 weeks, then decommission. Land everything
**code-side** now — actual execution gates on Oracle catcher landing
the VM.

**Architecture:** Bootstrap script hardens Oracle VM (Docker, ufw,
Tailscale, swap, age/rclone). Cutover orchestrator restores Postgres
from latest Y.O.S. backup (Phase 0 pipeline), rsync's tiles directly
from TimeWeb via Tailscale, smoke-tests through tailnet before any DNS
flip. DNS pre-cutover script lowers TTL to 5 min for fast rollback.
Decommission tarballs configs to Y.O.S. and frees TimeWeb resources.

**Tech Stack:** bash, ssh, rsync, Tailscale, Docker, Cloudflare API,
existing scripts/backup pipeline.

---

## Spec reference

`docs/superpowers/specs/2026-04-30-prod-readiness-design.md` §6
(Migration sequencing) — Phases 1, 2, 3, 4, 7, 8.

## Phase 5-6 prerequisite

GlitchTip + Umami code already merged in the previous commit
(`feat(obs)`). Their docker-compose оверлеи поднимаются на Oracle
вместе с прод-стеком в Phase 3.

## File Structure

```
scripts/deploy/
  bootstrap_oracle.sh             — UPDATED: +Tailscale, +swap, +ufw lockdown, +age+rclone
  cutover_to_oracle.sh            — NEW: orchestrate db+tiles+stack restore on Oracle
  smoke_test_prod.sh              — NEW: curl assertions через tailnet или public DNS
  cloudflare_set_ttl.sh           — NEW: pre-cutover lower TTL to 300s on cf zone
  cloudflare_dns_cutover.sh       — NEW: flip A records to Oracle IP via CF API
  decommission_timeweb.sh         — NEW: tar /srv/* → age → Y.O.S., then guide-out
  rollback_to_timeweb.sh          — NEW: emergency DNS flip back

scripts/backup/
  README.md                       — UPDATED: add «Disaster scenarios» § for migration

docs/superpowers/plans/
  2026-04-30-prod-readiness-oracle-migration.md  — this plan
```

No app-level code changes — only ops scripts.

## Manual prerequisites (operator)

These require credentials/UI/auth flows. Scripts assume they're done.

1. **Oracle Free Tier ARM landed.** `oracle_capacity_catcher.sh` is
   already in repo; user keeps it running until VM is created.
2. **Tailscale** account + tag-acl (`tag:prod`, `tag:ci-deploy`) set up.
   See `scripts/backup/README.md` §8.
3. **`tailscale up --ssh`** on dev machine + on Oracle VM after bootstrap.
4. **Cloudflare API token** — Zone-level "DNS Edit" scoped to
   `geobiom.ru` zone. Stored in `~/.cloudflare/geobiom-api-token`
   (mode 600) on dev machine. Used by cloudflare scripts here.
5. **age private key** + Y.O.S. backup pipeline already running on
   TimeWeb (Phase 0 done).
6. **`.env.prod`** mirrored from TimeWeb to Oracle (secrets +
   `CADDY_API_HOST`, `CADDY_WEB_HOST`, `CADDY_SENTRY_HOST`,
   `CADDY_UMAMI_HOST`, `GLITCHTIP_DB_PASSWORD`, `UMAMI_DB_PASSWORD`,
   `SENTRY_DSN`, `JWT_SECRET`, `OAUTH_STATE_SECRET`, `YANDEX_*`,
   `WEB_HOST_PATH=/srv/web`).

---

## Tasks

### Task 1: Harden bootstrap_oracle.sh

**Files:**
- Modify: `scripts/deploy/bootstrap_oracle.sh`

Current script: apt + Docker + iptables 80/443 + clone repo. Add:
- 4 GB swap (Oracle ARM Free Tier ships без swap'а; OOM-killer ловит
  Postgres под нагрузкой)
- Tailscale install + `tailscale up --ssh --hostname=geobiom-prod`
  (interactive auth → operator runs once)
- ufw rules: `allow 80,443`, `deny 22 from any except tailnet`
- Install age + rclone (нужны для backup pipeline)
- Создать `/etc/geobiom` с правильными правами (root:root 700)

- [ ] **Step 1: Add swap helper** before Docker install:

```bash
echo "[1.5/N] Setting up 4 GB swap"
if ! swapon --show | grep -q "/swapfile"; then
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
```

- [ ] **Step 2: Add Tailscale install** after Docker:

```bash
echo "[N/M] Tailscale (operator must complete OAuth in browser)"
if ! command -v tailscale >/dev/null 2>&1; then
    curl -fsSL https://tailscale.com/install.sh | sudo sh
fi
echo "Run after this script:"
echo "    sudo tailscale up --ssh --hostname=geobiom-prod"
echo "Then in https://login.tailscale.com/admin/machines tag this host with tag:prod"
```

- [ ] **Step 3: Replace iptables block with ufw lockdown**:

```bash
echo "[N/M] ufw + Oracle Security List config"
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
# 22 — оставляем для emergency, но только из локальной подсети + tailnet
sudo ufw allow from 100.64.0.0/10 to any port 22 comment 'Tailscale CGNAT'
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
echo "  Reminder: Oracle Cloud Console → Security List should also drop 22 from public."
```

- [ ] **Step 4: Add age + rclone**:

```bash
echo "[N/M] Backup tooling (age + rclone)"
sudo apt-get install -y age rclone
sudo mkdir -p /etc/geobiom
sudo chmod 700 /etc/geobiom
```

- [ ] **Step 5: Update post-script NEXT message** with the explicit
      one-time steps the operator still does.

### Task 2: cutover_to_oracle.sh

**Files:**
- Create: `scripts/deploy/cutover_to_oracle.sh`

Goal: with one command, restore prod data on Oracle VM and bring stack
up — без затрагивания TimeWeb (TimeWeb остаётся живым, цель — иметь
Oracle с актуальной копией данных и протестировать через tailnet).

Inputs:
- `ORACLE_HOST` (env) — tailnet hostname `geobiom-prod` или IP
- `TIMEWEB_HOST` (env) — `geobiom-prod-timeweb` или старый IP
- `AGE_KEY` (env) — путь к приватному ключу age для расшифровки backup'а

Steps the script takes:
1. Sanity: ssh ping в обе стороны, docker compose validate prod-yml.
2. Pull latest backup из Y.O.S. на dev-машину → decrypt → scp на Oracle.
3. На Oracle: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db`
4. На Oracle: `docker exec mushroom_db_prod pg_restore --clean --if-exists ...`
5. На Oracle: применить миграции `db/migrate.py`.
6. rsync tiles с TimeWeb на Oracle (через tailnet — оба ходят через
   tailnet'овые IP, прямое TimeWeb-Oracle копирование).
7. `docker compose up -d` весь стек.
8. Запустить `smoke_test_prod.sh ORACLE_HOST` — проверить через tailnet.

- [ ] **Step 1: Write cutover_to_oracle.sh**

```bash
#!/usr/bin/env bash
# Cutover prod stack onto Oracle VM. TimeWeb остаётся живым — DNS не
# трогаем здесь. Это шаг 3 из spec §6 (Phase 3).
#
# Usage:
#   ORACLE_HOST=geobiom-prod TIMEWEB_HOST=geobiom-prod-timeweb \
#     AGE_KEY=$HOME/.ssh/geobiom-backup.age \
#     bash scripts/deploy/cutover_to_oracle.sh

set -euo pipefail

ORACLE_HOST="${ORACLE_HOST:?Set ORACLE_HOST=geobiom-prod (tailnet name)}"
TIMEWEB_HOST="${TIMEWEB_HOST:?Set TIMEWEB_HOST=geobiom-prod-timeweb (tailnet)}"
AGE_KEY="${AGE_KEY:-$HOME/.ssh/geobiom-backup.age}"
RCLONE_REMOTE="${RCLONE_REMOTE:-geobiom-yos}"
YOS_BUCKET="${YOS_BUCKET:-geobiom-backups}"

echo "[1/8] sanity: ssh ping"
ssh -o ConnectTimeout=5 "$ORACLE_HOST"  true || { echo "Oracle unreachable" >&2; exit 1; }
ssh -o ConnectTimeout=5 "$TIMEWEB_HOST" true || { echo "TimeWeb unreachable" >&2; exit 1; }

echo "[2/8] /srv/mushroom-map prep на Oracle"
ssh "$ORACLE_HOST" '
    set -e
    cd /srv/mushroom-map
    git pull --ff-only origin main
    test -f .env.prod || { echo "missing .env.prod на Oracle" >&2; exit 1; }
    mkdir -p data/tiles data/copernicus/terrain
'

echo "[3/8] pull latest backup из Y.O.S. → decrypt"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
LATEST=$(rclone lsf "${RCLONE_REMOTE}:${YOS_BUCKET}/db/" | sort | tail -1)
[[ -n "$LATEST" ]] || { echo "no backups" >&2; exit 1; }
echo "  $LATEST"
rclone copyto "${RCLONE_REMOTE}:${YOS_BUCKET}/db/${LATEST}" "$WORK/dump.age"
age -d -i "$AGE_KEY" -o "$WORK/dump.bin" "$WORK/dump.age"

echo "[4/8] scp dump на Oracle"
scp -C "$WORK/dump.bin" "$ORACLE_HOST:/tmp/dump.bin"

echo "[5/8] up db on Oracle + pg_restore + migrate"
ssh "$ORACLE_HOST" bash <<'REMOTE_EOF'
set -e
cd /srv/mushroom-map
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
# wait for healthy
for i in $(seq 1 60); do
    docker compose -f docker-compose.prod.yml exec -T db pg_isready -U mushroom >/dev/null 2>&1 && break
    sleep 1
done
docker cp /tmp/dump.bin mushroom_db_prod:/tmp/dump.bin
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
    pg_restore --clean --if-exists --no-owner --no-acl \
    -U mushroom -d mushroom_map /tmp/dump.bin || true
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db rm -f /tmp/dump.bin
rm -f /tmp/dump.bin
# After db is up, ensure observability databases exist (idempotent).
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
    psql -U mushroom -d mushroom_map <<'SQL'
DO $$ BEGIN
    CREATE ROLE glitchtip LOGIN PASSWORD :'GLITCHTIP_DB_PASSWORD';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE DATABASE glitchtip OWNER glitchtip;
EXCEPTION WHEN duplicate_database THEN NULL; END $$;
DO $$ BEGIN
    CREATE ROLE umami LOGIN PASSWORD :'UMAMI_DB_PASSWORD';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE DATABASE umami OWNER umami;
EXCEPTION WHEN duplicate_database THEN NULL; END $$;
SQL
REMOTE_EOF

echo "[6/8] rsync tiles TimeWeb -> Oracle (через dev в качестве посредника)"
# rsync between two remotes via local relay: dev pulls from TimeWeb,
# pushes to Oracle. Tiles ~700 MB, идёт ~10 мин по обычному uplink'у.
TILES_TMP=$(mktemp -d)
rsync -avh --progress "$TIMEWEB_HOST:/srv/mushroom-map/tiles/" "$TILES_TMP/"
rsync -avh --progress "$TILES_TMP/" "$ORACLE_HOST:/srv/mushroom-map/tiles/"
rm -rf "$TILES_TMP"

echo "[7/8] up full stack на Oracle"
ssh "$ORACLE_HOST" '
    set -e
    cd /srv/mushroom-map
    export GIT_SHA=$(git rev-parse HEAD)
    docker compose -f docker-compose.prod.yml \
                   -f services/observability/glitchtip/docker-compose.yml \
                   -f services/observability/umami/docker-compose.yml \
                   --env-file .env.prod pull
    docker compose -f docker-compose.prod.yml \
                   -f services/observability/glitchtip/docker-compose.yml \
                   -f services/observability/umami/docker-compose.yml \
                   --env-file .env.prod up -d
    docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api \
        python /app/db/migrate.py
'

echo "[8/8] smoke-test через tailnet"
bash scripts/deploy/smoke_test_prod.sh "$ORACLE_HOST"

echo
echo "Cutover stage done. Дальше — DNS cutover (см. cloudflare_dns_cutover.sh)."
```

### Task 3: smoke_test_prod.sh

**Files:**
- Create: `scripts/deploy/smoke_test_prod.sh`

Запускается между Phase 3 и Phase 4. Проверяет, что Oracle VM
обслуживает api/tiles/web корректно ДО того как переключаем DNS.

Использует tailnet hostname для прямого попадания в Oracle (минуя
публичный DNS, где geobiom.ru ещё указывает на TimeWeb).

- [ ] **Step 1: Write smoke_test_prod.sh**

```bash
#!/usr/bin/env bash
# Pre-cutover smoke test против Oracle VM через tailnet.
#
# Usage: bash scripts/deploy/smoke_test_prod.sh [tailnet-host]
#
# Тестирует:
#   - /health (api alive)
#   - /api/healthz (api + db reachable)
#   - /api/species (search hits db)
#   - /tiles/forest.pmtiles HEAD (PMTiles served)
#   - / (фронт SPA отдаётся)
#
# Внимание: TLS-сертификат CADDY на Oracle получит только когда DNS
# переключится. До того ходим по http://oracle-prod (tailnet host).
#
# С DNS-cutover (Phase 4) — тот же скрипт против https://geobiom.ru
# / https://api.geobiom.ru.

set -uo pipefail
HOST="${1:-geobiom-prod}"
PROTO="${PROTO:-http}"
HTTPS_HOST="${HTTPS_HOST:-}"  # после DNS-cutover можно прокидывать

fail=0
check() {
    local desc="$1" url="$2" expect_status="${3:-200}"
    local code
    code=$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 15 "$url" 2>/dev/null || echo 000)
    if [[ "$code" == "$expect_status" ]]; then
        echo "  OK    [$code] $desc — $url"
    else
        echo "  FAIL  [$code != $expect_status] $desc — $url" >&2
        fail=1
    fi
}

echo "[smoke] target: $PROTO://$HOST"
check "frontend SPA"   "$PROTO://$HOST/"                          200
check "health"         "$PROTO://$HOST/health"                    200
check "api healthz"    "$PROTO://$HOST/api/healthz"               200
check "species search" "$PROTO://$HOST/api/species?q=боровик"     200
check "tiles HEAD"     "$PROTO://$HOST/tiles/forest.pmtiles"      200

if (( fail )); then
    echo "[smoke] FAIL"
    exit 1
fi
echo "[smoke] PASS"
```

### Task 4: Cloudflare API helpers

**Files:**
- Create: `scripts/deploy/cloudflare_set_ttl.sh`
- Create: `scripts/deploy/cloudflare_dns_cutover.sh`
- Create: `scripts/deploy/rollback_to_timeweb.sh`

Все три скрипта — минимальные обёртки над `curl` к Cloudflare API.
Token живёт в `~/.cloudflare/geobiom-api-token` (chmod 600). Zone =
`geobiom.ru`.

- [ ] **Step 1: cloudflare_set_ttl.sh** — за 24 ч до cutover, опускаем
      TTL до 300 s. Это значит: после flip'а DNS пропагирует за 5 мин,
      и rollback тоже мгновенный.

```bash
#!/usr/bin/env bash
# Lower DNS TTL to 300 s on geobiom A-records before cutover.
# Run 24+ hours before DNS flip so old TTL expires.
set -euo pipefail

CF_TOKEN_FILE="${CF_TOKEN_FILE:-$HOME/.cloudflare/geobiom-api-token}"
CF_TOKEN="$(cat "$CF_TOKEN_FILE")"
CF_ZONE_NAME="${CF_ZONE_NAME:-geobiom.ru}"

api() { curl -fsS -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" "$@"; }

zone_id=$(api "https://api.cloudflare.com/client/v4/zones?name=$CF_ZONE_NAME" \
          | grep -oE '"id":"[a-f0-9]+"' | head -1 | cut -d'"' -f4)
[[ -n "$zone_id" ]] || { echo "zone not found" >&2; exit 1; }

for name in "geobiom.ru" "www.geobiom.ru" "api.geobiom.ru"; do
    rec=$(api "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records?name=$name&type=A")
    rec_id=$(echo "$rec" | grep -oE '"id":"[a-f0-9]+"' | head -1 | cut -d'"' -f4)
    rec_content=$(echo "$rec" | grep -oE '"content":"[^"]+"' | head -1 | cut -d'"' -f4)
    [[ -n "$rec_id" ]] || { echo "no A record for $name" >&2; exit 1; }
    api -X PATCH \
        "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records/$rec_id" \
        --data "{\"ttl\": 300, \"content\": \"$rec_content\"}" >/dev/null
    echo "  $name → ttl=300 (content=$rec_content)"
done
echo "[cf] TTL=300s applied. Wait 24h before cutover."
```

- [ ] **Step 2: cloudflare_dns_cutover.sh** — flip A-записи на Oracle.

```bash
#!/usr/bin/env bash
# Flip A-records на Oracle VM IP. Если что-то пойдёт не так — есть
# rollback_to_timeweb.sh.
set -euo pipefail

CF_TOKEN_FILE="${CF_TOKEN_FILE:-$HOME/.cloudflare/geobiom-api-token}"
CF_TOKEN="$(cat "$CF_TOKEN_FILE")"
CF_ZONE_NAME="${CF_ZONE_NAME:-geobiom.ru}"
NEW_IP="${NEW_IP:?Set NEW_IP=<oracle-public-ip>}"

api() { curl -fsS -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" "$@"; }

zone_id=$(api "https://api.cloudflare.com/client/v4/zones?name=$CF_ZONE_NAME" \
          | grep -oE '"id":"[a-f0-9]+"' | head -1 | cut -d'"' -f4)

for name in "geobiom.ru" "www.geobiom.ru" "api.geobiom.ru"; do
    rec=$(api "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records?name=$name&type=A")
    rec_id=$(echo "$rec" | grep -oE '"id":"[a-f0-9]+"' | head -1 | cut -d'"' -f4)
    api -X PATCH \
        "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records/$rec_id" \
        --data "{\"content\":\"$NEW_IP\",\"ttl\":300,\"proxied\":false}" >/dev/null
    echo "  $name → $NEW_IP"
done
echo "[cf] cutover applied. Wait ~5 min for propagation, then run smoke_test_prod.sh."
```

- [ ] **Step 3: rollback_to_timeweb.sh** — то же самое, но на TimeWeb IP.

```bash
#!/usr/bin/env bash
# Emergency: flip back to TimeWeb VM. После cutover на Oracle. Из-за
# TTL=300 пропагирует за 5 минут.
set -euo pipefail

# TIMEWEB_IP жёстко зашит т.к. это известная инфра, и в эмердженси не
# хочется лишний раз чего-то параметризовать.
NEW_IP=178.253.43.136 \
    bash "$(dirname "$0")/cloudflare_dns_cutover.sh"
```

### Task 5: decommission_timeweb.sh

**Files:**
- Create: `scripts/deploy/decommission_timeweb.sh`

После 1-2 недель successful soak — снимаем TimeWeb.

- [ ] **Step 1: Write decommission_timeweb.sh**

```bash
#!/usr/bin/env bash
# После soak-периода (1-2 недели на Oracle без инцидентов): снять
# конфиги с TimeWeb VM в Y.O.S. и подготовить инструкции для
# отключения TimeWeb account.
#
# Что НЕ делает: не удаляет TimeWeb VM сам — это ручной шаг через
# TimeWeb dashboard (там есть billing-нюансы). Только архивирует то,
# что может понадобиться для recovery.

set -euo pipefail
TIMEWEB_HOST="${TIMEWEB_HOST:?Set TIMEWEB_HOST}"
RCLONE_REMOTE="${RCLONE_REMOTE:-geobiom-yos}"
YOS_BUCKET="${YOS_BUCKET:-geobiom-backups}"
AGE_RECIPIENT="${AGE_RECIPIENT:?Set AGE_RECIPIENT (public key)}"
DATE_UTC=$(date -u +%F)

echo "[1/3] tar /srv on TimeWeb"
ssh "$TIMEWEB_HOST" '
    cd / &&
    tar -czf /tmp/timeweb-srv.tar.gz srv/mushroom-map/.env.prod \
        srv/mushroom-map/infra srv/web 2>/dev/null || true
'

echo "[2/3] pull → encrypt → upload в Y.O.S."
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
scp "$TIMEWEB_HOST:/tmp/timeweb-srv.tar.gz" "$WORK/timeweb-srv.tar.gz"
age -r "$AGE_RECIPIENT" -o "$WORK/timeweb-srv.tar.age" "$WORK/timeweb-srv.tar.gz"
rclone copyto "$WORK/timeweb-srv.tar.age" \
    "${RCLONE_REMOTE}:${YOS_BUCKET}/configs/timeweb-decommission-${DATE_UTC}.tar.age"
ssh "$TIMEWEB_HOST" 'rm -f /tmp/timeweb-srv.tar.gz'

echo "[3/3] DONE."
cat <<'NEXT'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Конфиги в Y.O.S.: configs/timeweb-decommission-DATE.tar.age

Manual finish:
  1. https://timeweb.cloud/my/servers — выключить + удалить VM.
  2. Проверить billing: убедиться что VM не в режиме "приостановлен".
  3. Из CLAUDE.md убрать упоминания TimeWeb (Production стек секция).
  4. Удалить ssh alias geobiom-prod-timeweb из ~/.ssh/config.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT
```

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1:** Не трогаем «Production стек (live с 2026-04-29)» прямо
      сейчас — секция продолжит описывать TimeWeb. Добавить **новую**
      секцию `## Migration to Oracle ARM (планируется)` со списком
      скриптов и шагов из этого плана. После реальной миграции (Phase
      8) `docs/superpowers/plans/2026-04-30-prod-readiness-oracle-migration.md`
      Step 6 финализирует — переписывает «Production стек» секцию.

### Task 7: Commit + push

- [ ] **Step 1: stage and commit**

```bash
git add scripts/deploy/ docs/superpowers/plans/2026-04-30-prod-readiness-oracle-migration.md CLAUDE.md
git commit -m "feat(deploy): Oracle migration scripts (cutover, smoke, CF API, decommission)"
git push
```

- [ ] **Step 2:** verify CI green.

---

## Self-review

**Spec coverage (§6 Phases):**
- Phase 1 (Oracle landing) — внешний blocker, не в скоупе плана.
- Phase 2 (Oracle bootstrap, ~2 ч) — Task 1 (hardened bootstrap_oracle.sh).
- Phase 3 (миграция prod-стека, ~3 ч) — Task 2 (cutover_to_oracle.sh).
- Phase 4 (DNS cutover, 5 мин + propagation) — Task 4 (cloudflare scripts).
- Phase 5-6 (новые наблюдательные сервисы + instrumentation) — закрыто
  предыдущим коммитом `feat(obs)`.
- Phase 7 (soak, 7 дней) — manual only.
- Phase 8 (cleanup) — Task 5 (decommission_timeweb.sh).

**Rollback story:**
- Если Phase 3 падает (smoke-test FAIL) — TimeWeb остаётся primary,
  Oracle тестим повторно.
- Если Phase 4 даёт сбой через DNS — `rollback_to_timeweb.sh` за 5 мин.
- Если Phase 8 нечаянно отключил что-то нужное — Y.O.S. сохранил
  configs до age-encrypted tarball'е.

**Placeholders:** none — все скрипты с реальным телом.

**Type/name consistency:** ssh alias'ы `geobiom-prod` (Oracle, целевой),
`geobiom-prod-timeweb` (текущий TimeWeb, остаётся для cutover) —
консистентны во всех скриптах.

**Code-only safety:** ничто из этого плана не выполняется автоматически
при коммите. Все скрипты opt-in (operator запускает руками или через
GH Actions, и оба требуют env'ы которых сейчас нет).
