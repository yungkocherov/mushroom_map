# Geobiom backup runbook

Nightly Postgres dump → `age` encryption → Yandex Object Storage.
Driven by systemd timers on the prod VM (TimeWeb сейчас, Oracle ARM
после миграции).

См. spec: [`docs/superpowers/specs/2026-04-30-prod-readiness-design.md`](../../docs/superpowers/specs/2026-04-30-prod-readiness-design.md) §1.

## Architecture

```
03:00 UTC daily
  ↓
geobiom-backup.timer
  ↓
geobiom-backup.service (oneshot)
  ↓
dump_db.sh:
  docker exec mushroom_db_prod pg_dump -Fc -Z 9
    | age -r $AGE_RECIPIENT
    | rclone rcat geobiom-yos:geobiom-backups/db/YYYY-MM-DD.sql.gz.age

04:00 UTC every Sunday
  ↓
geobiom-backup-rotate.timer
  ↓
rotate.sh: keep 7d + 4w + 3m, delete the rest
```

Key file inventory:
- `dump_db.sh` — main backup pipeline (no temp file on disk; pure stream)
- `restore_drill.sh` — DR validation: pulls latest, decrypts, restores into
  transient docker postgres, asserts row counts
- `rotate.sh` — retention enforcement
- `check_env.sh` — guard run by other scripts
- `rclone.conf.example` — template for `/root/.config/rclone/rclone.conf`
- `systemd/*.service` + `systemd/*.timer` — installed via
  `scripts/deploy/install_backup_systemd.sh`

## One-time provisioning (operator checklist)

These steps require the operator (you) to do them manually. Scripts
won't run until they're done.

> **Текущий backend (с 2026-05-03):** Cloudflare R2 free-tier (10 ГБ).
> YOS_*-имена env-переменных оставлены как исторические алиасы — это
> только метки, скрипты не привязаны к конкретному провайдеру (всё через
> rclone S3-совместимый интерфейс). Размер бэкапа держим в free-tier через
> `INCLUDE_TABLES` (см. §3): дампим только irreducible — `users`,
> `user_spot`, `user_refresh_token`, `vk_post`, `vk_post_model_result`.
> Гео-таблицы (`forest_polygon`, `osm_*`, `wetland`, ...) восстанавливаются
> перезапуском `pipelines/` и в бэкап не попадают.

### 1. R2 bucket + API token

В [dash.cloudflare.com](https://dash.cloudflare.com) → R2 Object Storage:

1. Создать **bucket** `geobiom-backups` (Automatic location,
   Standard storage class — у IA минимум 30 days/object, для daily-rotated
   daily'ев получается дороже).
2. R2 → **Manage R2 API Tokens** → Create API token:
   - Name: `geobiom-backup-writer`
   - Permissions: **Object Read and Write**
   - Specify bucket: только `geobiom-backups` (НЕ all buckets)
   - TTL: Forever (или 5 лет)
3. CF покажет один раз: **Access Key ID** (32 char) + **Secret Access Key**
   (64 char) + **S3 endpoint** (`https://<account-id>.r2.cloudflarestorage.com`).
   Записать все три.

### 2. age keypair (на dev-машине)

```bash
# Если age не установлен:
#   Windows (winget):  winget install FiloSottile.age
#   macOS (brew):       brew install age
#   Linux (apt):        apt install age

mkdir -p ~/.ssh
age-keygen -o ~/.ssh/geobiom-backup.age
# stdout содержит "public key: age1...". Скопировать pubkey.
chmod 600 ~/.ssh/geobiom-backup.age
```

**Приватный ключ** живёт только на dev-машине. Без него прод-бэкапы
нерасшифровать. **Бэкап ключа** — в личный password manager (gopass /
1Password / Bitwarden) **до** первого реального backup'а. Если ключ
потерян — все будущие бэкапы непригодны для recovery.

**Сильно рекомендуется второй recipient** (см. §9 ниже): любой из
двух private-key расшифрует, и потеря дев-ноута перестаёт быть
disaster'ом.

### 3. `.env.backup` на VM

```bash
# На VM (root):
mkdir -p /etc/geobiom
cat >/etc/geobiom/.env.backup <<'EOF'
# R2 credentials (из CF API token, §1)
YOS_ACCESS_KEY=<32-char access key id>
YOS_SECRET_KEY=<64-char secret>
YOS_BUCKET=geobiom-backups
YOS_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com

# age recipients (public-keys из §2)
AGE_RECIPIENT=age1<primary>
AGE_RECIPIENT_BACKUP=age1<paper>

# Postgres
POSTGRES_USER=mushroom
POSTGRES_DB=mushroom_map
PG_CONTAINER=mushroom_db_prod

# rclone remote-name (любой; должен совпадать с rclone.conf [section] в §4)
RCLONE_REMOTE=geobiom-yos

# Partial dump: только irreducible-таблицы. Гео-данные восстанавливаются
# через pipelines/, в бэкап не идут — это держит R2-storage в free-tier.
# Пробел-разделённый список таблиц (передаётся в pg_dump как -t).
INCLUDE_TABLES="public.users public.user_spot public.user_refresh_token public.vk_post public.vk_post_model_result"
EOF
chmod 600 /etc/geobiom/.env.backup
```

### 4. rclone config на VM (R2 backend)

```bash
# На VM:
apt-get update && apt-get install -y rclone age
mkdir -p /root/.config/rclone
cat >/root/.config/rclone/rclone.conf <<EOF
[geobiom-yos]
type = s3
provider = Cloudflare
access_key_id = $(grep ^YOS_ACCESS_KEY /etc/geobiom/.env.backup | cut -d= -f2)
secret_access_key = $(grep ^YOS_SECRET_KEY /etc/geobiom/.env.backup | cut -d= -f2)
endpoint = $(grep ^YOS_ENDPOINT /etc/geobiom/.env.backup | cut -d= -f2)
region = auto
acl = private
EOF
chmod 600 /root/.config/rclone/rclone.conf

# Smoke-test:
rclone lsd geobiom-yos:
# должен показать (или быть пустым, без ошибок аутентификации)
```

### 5. Deploy systemd units

С dev-машины:

```bash
REMOTE=root@<vm-ip> bash scripts/deploy/install_backup_systemd.sh
# проверить:
ssh $REMOTE 'systemctl list-timers | grep geobiom'
# Запустить первый бэкап вручную, не дожидаясь 03:00:
ssh $REMOTE 'systemctl start geobiom-backup.service && journalctl -u geobiom-backup.service -n 20'
```

### 6. Restore-drill (один раз обязательно перед DNS-cutover на Oracle)

С dev-машины (нужны: docker, rclone с тем же конфигом, age с приватным ключом):

```bash
# Клонировать конфиг rclone локально, скопировав с VM (или собрать сам).
# Установить env с YOS_BUCKET / RCLONE_REMOTE.

YOS_BUCKET=geobiom-backups RCLONE_REMOTE=geobiom-yos \
  AGE_KEY=~/.ssh/geobiom-backup.age \
  bash scripts/backup/restore_drill.sh

# Ожидаемый вывод:
#   [drill] latest: 2026-04-30.sql.gz.age
#   [drill] PASS
```

Без этого upgrade — бэкап считается несуществующим (см. spec §1).

### 7. UptimeRobot

В [uptimerobot.com](https://uptimerobot.com) (Free аккаунт):

| URL                                                  | Type | Interval |
|------------------------------------------------------|------|----------|
| `https://geobiom.ru/`                                | HTTP(s) | 5 min |
| `https://api.geobiom.ru/health`                      | HTTP(s) | 5 min |
| `https://api.geobiom.ru/tiles/forest.pmtiles`        | HEAD    | 5 min |

Alert contacts:
- Email на личный gmail
- Telegram через webhook → личный bot. Создать bot через @BotFather,
  получить chat_id, в UptimeRobot → My Settings → Add Alert Contact →
  Webhook → URL `https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<ID>&text=*monitorFriendlyName*+is+*alertTypeFriendlyName*`

После Phase 5 добавить:
- `https://sentry.geobiom.ru/`
- `https://analytics.geobiom.ru/`

### 8. Tailscale (опционально на TimeWeb, обязательно на Oracle)


```bash
# Dev-машина:
# Windows: https://tailscale.com/download/windows
# macOS:   brew install tailscale
# Linux:   curl -fsSL https://tailscale.com/install.sh | sh

tailscale up      # OAuth flow в браузере, login через personal email
tailscale status  # должна быть видна сама себя

# На VM (после Tailscale install):
tailscale up --ssh --hostname=oracle-prod
# или для текущей TimeWeb VM:
tailscale up --ssh --hostname=timeweb-prod

# В Tailscale admin (https://login.tailscale.com/admin/machines):
#   tag машины как `tag:prod`. Подготовить ACL для будущего CI deploy:
#   создать OAuth client с tag `tag:ci-deploy`, добавить в ACL правило
#   `{"action": "accept", "src": ["tag:ci-deploy"], "dst": ["tag:prod:22"]}`.

# После Tailscale up:
ufw deny 22/tcp from any
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

В GitHub Actions secrets обновить `PROD_HOST` на tailnet IP машины
(`100.x.x.x`) или MagicDNS (`oracle-prod.tail-xxxx.ts.net`).

### 9. Optional: second age recipient (paper backup, must-do для соло-prod)

`AGE_RECIPIENT` в `.env.backup` — это **single point of failure**: дев-ноут
украден или умер физически = всё, что зашифровано этим ключом, можно
выкидывать. Решение — добавить второй recipient: любой из двух
private-key расшифрует.

```bash
# Сгенерить второй keypair:
age-keygen -o ~/Documents/geobiom-backup-paper.age
# Public key (одна строка age1...) — добавим на VM как AGE_RECIPIENT_BACKUP.
# Private key (3 строки SECRET-KEY...) — НЕ хранить на дев-ноуте:
#   - Распечатать на бумагу + положить в физический сейф / ячейку банка.
#   - Или wrap в yubikey (age-plugin-yubikey).
#   - Или дать доверенному человеку в другой географии.
# Затем УДАЛИТЬ файл с дев-ноута (на бумаге уже есть).

shred -u ~/Documents/geobiom-backup-paper.age
```

На VM (root):

```bash
# Дописать в /etc/geobiom/.env.backup:
echo 'AGE_RECIPIENT_BACKUP=age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' >> /etc/geobiom/.env.backup
chmod 600 /etc/geobiom/.env.backup

# Smoke-тест: запустить бэкап вручную и убедиться что обе recipient'а
# приняты:
systemctl start geobiom-backup.service
journalctl -u geobiom-backup.service -n 20 --no-pager
# Не должно быть ошибок про "no recipients"; size > 0.
```

`dump_db.sh` автоматически детектит `AGE_RECIPIENT_BACKUP` (опциональный):
если переменная пуста — шифрует только на primary, как раньше; если
задана — `age -r primary -r backup`. Существующие бэкапы (зашифрованные
до добавления второго ключа) расшифровываются только primary —
**нельзя** ретроактивно добавить recipient к уже зашифрованному файлу.
Поэтому: после добавления `AGE_RECIPIENT_BACKUP` старые YOS-бэкапы
постепенно сами уйдут по retention'у через 3 месяца, и весь storage
будет dual-recipient.

**Ротация (раз в год):** перегенерить обе пары, обновить `.env.backup`,
обновить бумажный backup, прогнать `restore_drill.sh` с обоими
private-key (поочерёдно), убедиться что оба расшифровывают.

## Disaster recovery: VM полностью потеряна

```bash
# 1. Поднять чистую VM (Ubuntu 22.04, docker, rclone, age — установить).
# 2. Восстановить /etc/geobiom/.env.backup из password manager.
# 3. Восстановить rclone.conf по шагу 4 выше.
# 4. Pull latest:
rclone copyto geobiom-yos:geobiom-backups/db/$(rclone lsf geobiom-yos:geobiom-backups/db/ | sort | tail -1) /tmp/dump.age
age -d -i ~/.ssh/geobiom-backup.age -o /tmp/dump.bin /tmp/dump.age   # на dev, потом scp
# 5. На VM: docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
# 6. docker exec -i mushroom_db_prod pg_restore --no-owner --no-acl -U mushroom -d mushroom_map < /tmp/dump.bin
# 7. docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

PMTiles рекаверятся отдельно (см. `scripts/deploy/sync_tiles_to_vm.sh`)
— или сбилдить заново из исходных GeoJSON через
`pipelines/build_forest_tiles.sh` (~5 мин).

## Operator: manual run / debug

```bash
# Запустить бэкап вручную:
ssh $REMOTE systemctl start geobiom-backup.service

# Логи последнего запуска:
ssh $REMOTE journalctl -u geobiom-backup.service -n 50 --no-pager

# Список существующих бэкапов:
ssh $REMOTE rclone lsf geobiom-yos:geobiom-backups/db/ --human-readable --format "tsp"

# Запустить ротацию вручную:
ssh $REMOTE systemctl start geobiom-backup-rotate.service
```
