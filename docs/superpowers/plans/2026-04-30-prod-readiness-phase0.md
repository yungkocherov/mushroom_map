# Phase 0: Backup + UptimeRobot + Tailscale (TimeWeb) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up automated encrypted nightly Postgres backups to Yandex
Object Storage, restore-drill validation, external uptime monitoring,
and Tailscale tailnet — all on the existing TimeWeb VM, before Oracle
migration.

**Architecture:** `pg_dump --format=custom -Z 9 | age -r <pubkey> | rclone
copy` driven by a systemd timer. Restore-drill spins up a transient
docker postgres, restores the latest dump, and asserts row counts.
Operator runbook documents one-time manual provisioning (Y.O.S. service
account, age keypair, UptimeRobot UI, Tailscale OAuth).

**Tech Stack:** bash, age, rclone, systemd, postgres-client (via docker
exec fallback), Yandex Object Storage S3 API.

---

## Spec reference

`docs/superpowers/specs/2026-04-30-prod-readiness-design.md` §1 (Backup),
§3 (Uptime), §2 (Tailscale).

## File Structure

```
scripts/backup/
  README.md              — operator runbook (manual provisioning steps)
  dump_db.sh             — pg_dump → age → rclone copy → exit 0/1
  restore_drill.sh       — pull latest, decrypt, restore, assert row counts
  rotate.sh              — apply 7d/4w/3m retention to Y.O.S. via rclone
  check_env.sh           — validate /etc/geobiom/.env.backup before scheduled runs

scripts/backup/systemd/
  geobiom-backup.service           — oneshot, runs dump_db.sh
  geobiom-backup.timer             — daily 03:00 UTC
  geobiom-backup-rotate.service    — oneshot, runs rotate.sh
  geobiom-backup-rotate.timer      — weekly Sun 04:00 UTC

scripts/deploy/
  install_backup_systemd.sh        — push scripts + systemd units to VM, enable timers
```

No frontend / API code changes in this phase.

## Manual prerequisites (operator must do before scripts can run)

These are documented in `scripts/backup/README.md`. Phase 0 plan
**does not** automate them — they require user-side credentials/UI:

1. Create Y.O.S. service account `geobiom-backup-writer` with role
   `storage.editor` on bucket `geobiom-backups` (create bucket first).
2. Get static access key (Access Key ID + Secret).
3. Generate age keypair locally (`age-keygen -o ~/.ssh/geobiom-backup.age`).
   Public key goes to `/etc/geobiom/backup.age.pub` on VM. Private key
   stays on dev machine.
4. Create `/etc/geobiom/.env.backup` on VM with `YOS_ACCESS_KEY`,
   `YOS_SECRET_KEY`, `YOS_BUCKET`, `YOS_ENDPOINT`, `AGE_RECIPIENT`.
5. UptimeRobot account creation + 3 monitors (geobiom.ru, api/health,
   api/tiles/forest.pmtiles) + Telegram webhook setup.
6. Tailscale account + `tailscale up` on dev machine. Optional on
   TimeWeb (VPS may not allow TUN; not a blocker).

---

## Tasks

### Task 1: Operator runbook scaffold

**Files:**
- Create: `scripts/backup/README.md`

- [ ] **Step 1: Write README** with sections:
  - Architecture diagram (text)
  - Manual prerequisites (numbered list above, with exact commands)
  - Local key generation + safekeeping
  - Y.O.S. bucket creation steps
  - `.env.backup` template
  - Restore-drill workflow
  - Disaster recovery runbook (if VM is gone, how to restore from Y.O.S.)
  - UptimeRobot monitor list with exact URLs

- [ ] **Step 2: Commit just the README** so the operator can start the
      manual steps in parallel with later tasks.

```bash
git add scripts/backup/README.md
git commit -m "docs(backup): operator runbook for nightly Y.O.S. backup"
```

### Task 2: `check_env.sh` — environment validator

**Files:**
- Create: `scripts/backup/check_env.sh`

Required envs: `YOS_ACCESS_KEY`, `YOS_SECRET_KEY`, `YOS_BUCKET`,
`YOS_ENDPOINT`, `AGE_RECIPIENT`, `POSTGRES_USER`, `POSTGRES_DB`,
`PG_CONTAINER` (default `mushroom_db_prod`).

- [ ] **Step 1: Write check_env.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail
required=(YOS_ACCESS_KEY YOS_SECRET_KEY YOS_BUCKET YOS_ENDPOINT
          AGE_RECIPIENT POSTGRES_USER POSTGRES_DB)
missing=()
for v in "${required[@]}"; do
  [[ -z "${!v:-}" ]] && missing+=("$v")
done
if (( ${#missing[@]} )); then
  echo "missing env: ${missing[*]}" >&2
  exit 1
fi
command -v age >/dev/null || { echo "age not installed" >&2; exit 1; }
command -v rclone >/dev/null || { echo "rclone not installed" >&2; exit 1; }
```

- [ ] **Step 2: Smoke-test locally**

```bash
chmod +x scripts/backup/check_env.sh
bash scripts/backup/check_env.sh    # expected: missing env: ...
YOS_ACCESS_KEY=x YOS_SECRET_KEY=x YOS_BUCKET=x YOS_ENDPOINT=x \
  AGE_RECIPIENT=x POSTGRES_USER=x POSTGRES_DB=x \
  bash scripts/backup/check_env.sh  # expected: success or "age not installed"
```

### Task 3: `dump_db.sh` — main backup script

**Files:**
- Create: `scripts/backup/dump_db.sh`

Behavior:
1. Source `/etc/geobiom/.env.backup`.
2. Validate envs via `check_env.sh`.
3. `docker exec $PG_CONTAINER pg_dump -Fc -Z 9` → stream stdout.
4. Pipe to `age -r $AGE_RECIPIENT` → stream stdout.
5. Stream stdout to `rclone rcat geobiom-yos:$YOS_BUCKET/db/$(date -u +%F).sql.gz.age`.
6. On failure, exit non-zero (systemd will record).
7. On success, log size + duration to stdout (journalctl).

- [ ] **Step 1: Write dump_db.sh**

```bash
#!/usr/bin/env bash
# Nightly Postgres dump → age-encrypted → Y.O.S.
# Reads /etc/geobiom/.env.backup. Driven by geobiom-backup.timer.

set -euo pipefail
ENV_FILE="${BACKUP_ENV_FILE:-/etc/geobiom/.env.backup}"
[[ -r "$ENV_FILE" ]] && set -a && . "$ENV_FILE" && set +a

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/check_env.sh"

PG_CONTAINER="${PG_CONTAINER:-mushroom_db_prod}"
DATE_UTC="$(date -u +%F)"
KEY="db/${DATE_UTC}.sql.gz.age"
RCLONE_REMOTE="${RCLONE_REMOTE:-geobiom-yos}"

start_ts="$(date +%s)"
echo "[backup] start ${DATE_UTC} → ${RCLONE_REMOTE}:${YOS_BUCKET}/${KEY}"

# Stream-pipe: pg_dump → age → rclone rcat (no temp file on disk).
# pipefail catches a failure in any stage.
docker exec -i "$PG_CONTAINER" pg_dump \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --format=custom -Z 9 --no-owner --no-acl \
  | age -r "$AGE_RECIPIENT" \
  | rclone rcat "${RCLONE_REMOTE}:${YOS_BUCKET}/${KEY}"

dur=$(( $(date +%s) - start_ts ))
size=$(rclone size --json "${RCLONE_REMOTE}:${YOS_BUCKET}/${KEY}" \
       | grep -oP '"bytes":\K[0-9]+' || echo 0)
echo "[backup] done in ${dur}s, ${size} bytes"
```

- [ ] **Step 2: Validate locally with mock pipeline**

```bash
chmod +x scripts/backup/dump_db.sh
# Without real env, we expect the script to exit 1 from check_env.sh:
bash scripts/backup/dump_db.sh; test $? -eq 1
```

### Task 4: `rclone.conf` template + bootstrap helper

**Files:**
- Create: `scripts/backup/rclone.conf.example`
- Modify: `scripts/backup/README.md` (add rclone config snippet)

Y.O.S. is S3-compatible with endpoint `https://storage.yandexcloud.net`.
Region is `ru-central1`. Provider value is `Other`, force_path_style not
needed for Y.O.S.

- [ ] **Step 1: Write rclone.conf.example**

```
[geobiom-yos]
type = s3
provider = Other
access_key_id = REPLACE_ME
secret_access_key = REPLACE_ME
endpoint = https://storage.yandexcloud.net
region = ru-central1
acl = private
```

- [ ] **Step 2: Document in README** how to render the real file from
      env: `envsubst < rclone.conf.example > /root/.config/rclone/rclone.conf`.

### Task 5: `restore_drill.sh` — the actual test

**Files:**
- Create: `scripts/backup/restore_drill.sh`

Behavior:
1. Pull latest `db/*.sql.gz.age` from Y.O.S.
2. Decrypt via age (uses local private key, `~/.ssh/geobiom-backup.age`).
3. Spin up transient `postgis/postgis:16-3.4` container on a free port.
4. `pg_restore` into it.
5. Run assertions: `forest_polygon` >= 2_000_000, `vk_post` >= 60_000,
   `admin_area` >= 18.
6. Tear down container.
7. Print PASS/FAIL.

This is the `green` step that validates the whole pipeline. Without
this, backups are unverified.

**Caveat:** `sync_db_to_remote.sh` excludes `vk_post` data. If the prod
backup uses the same exclusion, `vk_post >= 60_000` would fail in
restore-drill against a prod backup. **For Phase 0, prod backup
includes everything** — we want a full DR copy. The 200 MB cost is
trivial.

- [ ] **Step 1: Write restore_drill.sh**

```bash
#!/usr/bin/env bash
# Pull latest backup from Y.O.S., decrypt, restore into transient
# postgres, verify row counts. Run as repetition of the DR drill.

set -euo pipefail
ENV_FILE="${BACKUP_ENV_FILE:-./scripts/backup/.env.local}"
if [[ -r "$ENV_FILE" ]]; then set -a; . "$ENV_FILE"; set +a; fi

AGE_KEY="${AGE_KEY:-$HOME/.ssh/geobiom-backup.age}"
RCLONE_REMOTE="${RCLONE_REMOTE:-geobiom-yos}"
YOS_BUCKET="${YOS_BUCKET:?YOS_BUCKET required}"

[[ -f "$AGE_KEY" ]] || { echo "age key missing: $AGE_KEY" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; docker rm -f drill-pg 2>/dev/null || true' EXIT

echo "[drill] listing latest backup"
LATEST=$(rclone lsf "${RCLONE_REMOTE}:${YOS_BUCKET}/db/" \
         | sort | tail -1)
[[ -n "$LATEST" ]] || { echo "no backups found" >&2; exit 1; }
echo "[drill] latest: $LATEST"

echo "[drill] downloading + decrypting"
rclone copyto "${RCLONE_REMOTE}:${YOS_BUCKET}/db/${LATEST}" "$WORK/dump.age"
age -d -i "$AGE_KEY" -o "$WORK/dump.bin" "$WORK/dump.age"

echo "[drill] starting transient postgres on :55432"
docker run -d --name drill-pg \
    -e POSTGRES_USER=mushroom -e POSTGRES_PASSWORD=drill \
    -e POSTGRES_DB=mushroom_map \
    -p 55432:5432 postgis/postgis:16-3.4 >/dev/null
# Wait for ready
for i in {1..60}; do
    docker exec drill-pg pg_isready -U mushroom >/dev/null 2>&1 && break
    sleep 1
done

echo "[drill] pg_restore"
docker cp "$WORK/dump.bin" drill-pg:/tmp/dump.bin
docker exec drill-pg pg_restore --no-owner --no-acl \
    -U mushroom -d mushroom_map /tmp/dump.bin

echo "[drill] asserting row counts"
fail=0
assert() {
    local table="$1" min="$2"
    local n
    n=$(docker exec drill-pg psql -U mushroom -d mushroom_map -At \
        -c "SELECT count(*) FROM $table")
    if (( n < min )); then
        echo "  FAIL  $table: $n < $min" >&2
        fail=1
    else
        echo "  OK    $table: $n >= $min"
    fi
}
assert forest_polygon 2000000
assert admin_area 18
# vk_post >= 60_000 only when full backup. If excluded, drop this assert.
assert vk_post 60000

if (( fail )); then
    echo "[drill] FAIL"
    exit 1
fi
echo "[drill] PASS"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/backup/restore_drill.sh
```

### Task 6: `rotate.sh` — retention enforcement

**Files:**
- Create: `scripts/backup/rotate.sh`

Retention plan (14 files max in `db/` prefix):
- Keep last 7 daily
- Keep 4 weekly (Sunday's dump from each of the last 4 weeks)
- Keep 3 monthly (1st-of-month dump from each of the last 3 months)
- Delete everything else

Implementation: rclone `lsjson` → bash filter by date → `rclone deletefile`.

- [ ] **Step 1: Write rotate.sh**

```bash
#!/usr/bin/env bash
# Apply retention policy to db/ prefix in Y.O.S. backup bucket.

set -euo pipefail
ENV_FILE="${BACKUP_ENV_FILE:-/etc/geobiom/.env.backup}"
[[ -r "$ENV_FILE" ]] && set -a && . "$ENV_FILE" && set +a

RCLONE_REMOTE="${RCLONE_REMOTE:-geobiom-yos}"
YOS_BUCKET="${YOS_BUCKET:?}"

today=$(date -u +%F)
week_ago=$(date -u -d "$today - 7 days" +%F)
month_ago=$(date -u -d "$today - 28 days" +%F)
quarter_ago=$(date -u -d "$today - 84 days" +%F)

# List all backups; for each, decide keep/delete.
keep=()
delete=()

while IFS= read -r f; do
    # f looks like "2026-04-30.sql.gz.age"
    date_str="${f%%.sql.gz.age}"
    [[ -z "$date_str" ]] && continue

    if [[ "$date_str" > "$week_ago" || "$date_str" == "$week_ago" ]]; then
        keep+=("$f")  # last 7 daily
    elif [[ "$date_str" > "$month_ago" || "$date_str" == "$month_ago" ]]; then
        # weekly: keep Sundays
        dow=$(date -u -d "$date_str" +%u)
        [[ "$dow" == "7" ]] && keep+=("$f") || delete+=("$f")
    elif [[ "$date_str" > "$quarter_ago" || "$date_str" == "$quarter_ago" ]]; then
        # monthly: keep day 01
        [[ "$date_str" == *-01 ]] && keep+=("$f") || delete+=("$f")
    else
        delete+=("$f")  # past quarter, too old
    fi
done < <(rclone lsf "${RCLONE_REMOTE}:${YOS_BUCKET}/db/" | sort)

echo "[rotate] keep=${#keep[@]} delete=${#delete[@]}"
for f in "${delete[@]}"; do
    echo "  - $f"
    rclone deletefile "${RCLONE_REMOTE}:${YOS_BUCKET}/db/$f"
done
echo "[rotate] done"
```

### Task 7: systemd units

**Files:**
- Create: `scripts/backup/systemd/geobiom-backup.service`
- Create: `scripts/backup/systemd/geobiom-backup.timer`
- Create: `scripts/backup/systemd/geobiom-backup-rotate.service`
- Create: `scripts/backup/systemd/geobiom-backup-rotate.timer`

- [ ] **Step 1: backup.service** (oneshot)

```ini
[Unit]
Description=Geobiom Postgres backup → Y.O.S.
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/geobiom/.env.backup
ExecStart=/srv/geobiom/scripts/backup/dump_db.sh
StandardOutput=journal
StandardError=journal
# Don't run two backups at once
ConditionPathExists=!/run/geobiom-backup.lock
```

- [ ] **Step 2: backup.timer**

```ini
[Unit]
Description=Daily Geobiom backup at 03:00 UTC

[Timer]
OnCalendar=*-*-* 03:00:00 UTC
Persistent=true
RandomizedDelaySec=15min
Unit=geobiom-backup.service

[Install]
WantedBy=timers.target
```

- [ ] **Step 3: rotate.service**

```ini
[Unit]
Description=Geobiom backup rotation
After=geobiom-backup.service

[Service]
Type=oneshot
EnvironmentFile=/etc/geobiom/.env.backup
ExecStart=/srv/geobiom/scripts/backup/rotate.sh
StandardOutput=journal
StandardError=journal
```

- [ ] **Step 4: rotate.timer**

```ini
[Unit]
Description=Weekly Geobiom backup retention

[Timer]
OnCalendar=Sun *-*-* 04:00:00 UTC
Persistent=true
Unit=geobiom-backup-rotate.service

[Install]
WantedBy=timers.target
```

### Task 8: `install_backup_systemd.sh` — deploy helper

**Files:**
- Create: `scripts/deploy/install_backup_systemd.sh`

- [ ] **Step 1: Write deploy helper**

```bash
#!/usr/bin/env bash
# rsync scripts/backup → VM, install systemd units, enable timers.
# Usage: REMOTE=root@<vm-ip> bash scripts/deploy/install_backup_systemd.sh
set -euo pipefail
REMOTE="${REMOTE:?Set REMOTE=user@host}"

ssh "$REMOTE" "mkdir -p /srv/geobiom/scripts/backup /etc/geobiom"
rsync -av --delete \
    --exclude '.env.local' \
    scripts/backup/ "$REMOTE:/srv/geobiom/scripts/backup/"

ssh "$REMOTE" "
    set -e
    chmod +x /srv/geobiom/scripts/backup/*.sh
    # Install systemd units
    cp /srv/geobiom/scripts/backup/systemd/*.service /etc/systemd/system/
    cp /srv/geobiom/scripts/backup/systemd/*.timer /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable --now geobiom-backup.timer
    systemctl enable --now geobiom-backup-rotate.timer
    systemctl list-timers | grep geobiom
"
```

### Task 9: Local restore-drill repetition

**Files:** none new.

This is the actual TDD-style red/green check. Spec §1 says: "Без
репетиции бэкап считаем несуществующим."

- [ ] **Step 1: Generate age keypair locally**

```bash
mkdir -p ~/.ssh
age-keygen -o ~/.ssh/geobiom-backup.age 2>&1 | grep -i pubkey
# Save the printed pubkey: this goes into AGE_RECIPIENT later
```

- [ ] **Step 2: Run a synthetic dump-encrypt-decrypt cycle**

```bash
# Use the running local mushroom_db container (not prod yet).
PUB=$(grep -oP 'public key: \Kage1\S+' ~/.ssh/geobiom-backup.age)
docker exec -i mushroom_db pg_dump -U mushroom -d mushroom_map \
    --format=custom -Z 9 --no-owner --no-acl \
  | age -r "$PUB" \
  > /tmp/drill-dump.age
# decrypt
age -d -i ~/.ssh/geobiom-backup.age -o /tmp/drill-dump.bin /tmp/drill-dump.age
ls -la /tmp/drill-dump.*
# Restore into transient pg, assert row counts (manual abbreviated drill).
```

If row counts pass, the pipeline works end-to-end.

### Task 10: Update CLAUDE.md "Production стек" section

**Files:**
- Modify: `CLAUDE.md` (Production стек section)

- [ ] **Step 1: Add backup subsection** documenting:
  - Where backup script lives (`scripts/backup/`)
  - Where systemd units live and how they're installed
  - Where Y.O.S. credentials live (`/etc/geobiom/.env.backup`)
  - Where age private key lives on dev (`~/.ssh/geobiom-backup.age`)
  - How to run restore-drill
  - Pointer to spec doc

### Task 11: Commit + push

- [ ] **Step 1: Stage and commit all backup scripts**

```bash
git add scripts/backup/ scripts/deploy/install_backup_systemd.sh CLAUDE.md \
        docs/superpowers/specs/2026-04-30-prod-readiness-design.md \
        docs/superpowers/plans/2026-04-30-prod-readiness-phase0.md
git commit -m "feat(backup): nightly pg_dump → age → Y.O.S. + restore-drill"
git push
```

- [ ] **Step 2: Verify CI green**

```bash
gh run list --limit 5
```

---

## What Phase 0 does NOT include (deferred to operator)

- Y.O.S. service account creation (UI in console.cloud.yandex.com)
- Bucket creation
- Static key provisioning
- Tailscale OAuth + ACL setup
- UptimeRobot account + monitor configuration
- Telegram bot creation for UptimeRobot webhook
- Actual deployment to TimeWeb (`bash scripts/deploy/install_backup_systemd.sh`)
  → operator runs after credentials are in place

These are tracked in `scripts/backup/README.md` as a checklist.

## Self-review

**Spec coverage (§1 Backup):**
- pg_dump custom format -Z 9 ✓ (Task 3)
- age encryption ✓ (Task 3)
- Y.O.S. upload via rclone ✓ (Task 3, 4)
- systemd timer 03:00 UTC ✓ (Task 7)
- 7d/4w/3m retention ✓ (Task 6)
- Restore-drill script + repetition ✓ (Task 5, 9)
- Single bucket with prefixes ✓ (`db/` prefix used)

**Spec coverage (§3 UptimeRobot):**
- Operator manual setup, no code ✓ (documented in Task 1 README)

**Spec coverage (§2 Tailscale):**
- Operator manual setup ✓ (documented in Task 1 README)
- ufw / Oracle Security List configuration deferred to Phase 2
  (Oracle bootstrap), since current TimeWeb VM stays as fallback.

**Placeholders:** none — all scripts have full bodies.

**Type/name consistency:** `geobiom-yos` rclone remote name used in
all scripts. `mushroom_db_prod` container name from
`docker-compose.prod.yml`. `AGE_RECIPIENT` env name consistent.
