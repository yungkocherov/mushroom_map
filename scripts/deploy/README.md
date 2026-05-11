# Deploy / two-stack runbooks

Скрипты этой директории — операторские утилиты для двух прод-стеков
(TimeWeb primary RU + Oracle foreign replica). Полная архитектура
two-stack — см. CLAUDE.md «Production стек».

## Inventory

```
deploy/
  bootstrap_oracle.sh             one-shot setup Oracle VM (docker, dirs, .env)
  cutover_to_oracle.sh            DNS cutover в случае падения TimeWeb
  cloudflare_set_ttl.sh           CF TTL → 60 перед cutover (для быстрого rollback)
  cloudflare_dns_cutover.sh       CF API: A-record на Oracle
  rollback_to_timeweb.sh          обратный cutover
  decommission_timeweb.sh         финальный teardown TimeWeb (НЕ запускать без месяца review)
  smoke_test_prod.sh              после cutover: GET /api/* + tile probe
  lockdown_oracle.sh              hardening (ufw, sshd_config, fail2ban)
  oracle_capacity_catcher.sh      бесконечный курлинг OCI quota — для catch'а
                                  Always-Free слотов в момент освобождения

  sync_db_to_remote.sh            ad-hoc dev DB → prod (форсированный, ручной)
  sync_db_timeweb_to_oracle.sh    ★ daily TimeWeb → Oracle (через systemd)
  sync_forest_polygon_to_remote.sh  только forest_polygon table (после re-ingest)
  sync_tiles_to_vm.sh             pmtiles rsync → выбранная VM
  sync_glyphs_to_vm.sh            assets/glyphs/* → VM (для bundled labels)

  install_backup_systemd.sh       deploy systemd units из ../backup/systemd/
  install_db_sync_systemd.sh      ★ deploy systemd units из ./systemd/

  systemd/
    geobiom-db-sync.service       oneshot DB sync wrapper
    geobiom-db-sync.timer         daily 04:00 UTC trigger
```

★ — основной flow двух-стака. Остальные скрипты — disaster-recovery и
утилиты для редких операций.

---

## DB sync runbook (TimeWeb → Oracle, daily)

Реплицирует `mushroom_map` Postgres с TimeWeb (primary RU) на Oracle
(foreign replica) каждую ночь. Oracle допустимо отстаёт на 24h —
foreign юзеры через VPN получают slightly stale читалку, ингест и
запись идут только на TimeWeb.

### Architecture

```
04:00 UTC daily  (после backup'а в 03:00 UTC)
  ↓
geobiom-db-sync.timer (TimeWeb)
  ↓
geobiom-db-sync.service (oneshot, root, /usr/local/bin/geobiom-db-sync.sh)
  ↓
sync_db_timeweb_to_oracle.sh:
  1. ssh Oracle: docker compose stop api          (pool API держит conn → блок pg_restore --clean)
  2. docker exec mushroom_db_prod pg_dump -Fc -Z 6 --no-owner --no-acl
       | ssh oracle docker exec -i mushroom_db_prod pg_restore --clean --if-exists --no-owner --no-acl
  3. trap restore_api EXIT  (api поднимается даже если restore упал)
  4. sanity-check: SELECT count(*) FROM forest_polygon  (≥1M)
```

Дамп ~500 МБ сжатый, restore 8-12 мин на 2M forest_polygon строк.
Cancel-friendly: trap гарантирует API на Oracle поднимется в любом
случае. Persistent=true в timer — пропущенный run догонит после
ребута VM.

### One-time provisioning

Pre-requisite: обе VM (`geobiom-prod-timeweb` и `geobiom-prod-oracle`)
уже подняты, на каждой работает `docker compose --profile full up -d`,
обе инициализированы одинаковыми миграциями (`db/migrate.py`).

#### 1. SSH-key TimeWeb → Oracle

```bash
# На TimeWeb VM (root):
ssh root@<timeweb-ip>
ssh-keygen -t ed25519 -f ~/.ssh/sync_to_oracle -N "" \
    -C "geobiom-db-sync timeweb->oracle"
cat ~/.ssh/sync_to_oracle.pub
# Скопировать pubkey.

exit

# На Oracle VM (ubuntu):
ssh ubuntu@<oracle-ip>
echo "<pubkey-from-above>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Smoke-test с TimeWeb:
ssh root@<timeweb-ip>
ssh -i ~/.ssh/sync_to_oracle ubuntu@<oracle-ip> echo ok
```

#### 2. Deploy systemd units

С dev-машины (использует ssh-alias `geobiom-prod-timeweb` из
`~/.ssh/config`):

```bash
REMOTE=geobiom-prod-timeweb bash scripts/deploy/install_db_sync_systemd.sh
```

install скрипт:
- `scp sync_db_timeweb_to_oracle.sh → /usr/local/bin/geobiom-db-sync.sh`
- `scp systemd/geobiom-db-sync.{service,timer} → /etc/systemd/system/`
- `chmod +x /usr/local/bin/geobiom-db-sync.sh`
- `systemctl daemon-reload && systemctl enable --now geobiom-db-sync.timer`

#### 3. Smoke-test

```bash
ssh geobiom-prod-timeweb 'systemctl list-timers | grep db-sync'
# должен показать NEXT в районе 04:00:00 UTC + RandomizedDelaySec=10min jitter

# Запустить первый sync вручную, не дожидаясь ночи:
ssh geobiom-prod-timeweb 'systemctl start geobiom-db-sync.service'
ssh geobiom-prod-timeweb 'journalctl -u geobiom-db-sync.service -n 50 --no-pager'
# ожидаемый финал: "[YYYY-...] sync OK"
```

### Operations

```bash
# Статус
ssh geobiom-prod-timeweb 'systemctl status geobiom-db-sync.timer'
ssh geobiom-prod-timeweb 'systemctl list-timers | grep db-sync'

# Логи последнего run'а
ssh geobiom-prod-timeweb 'journalctl -u geobiom-db-sync.service -n 100 --no-pager'

# Логи всех run'ов за неделю
ssh geobiom-prod-timeweb 'journalctl -u geobiom-db-sync.service --since "7 days ago" --no-pager'

# Запустить вручную
ssh geobiom-prod-timeweb 'systemctl start geobiom-db-sync.service'

# Временно остановить (на время большого ingest'а или maintenance)
ssh geobiom-prod-timeweb 'systemctl disable --now geobiom-db-sync.timer'
# Включить обратно
ssh geobiom-prod-timeweb 'systemctl enable --now geobiom-db-sync.timer'

# Проверить отставание Oracle
ssh geobiom-prod-oracle 'docker exec mushroom_db_prod psql -U mushroom -d mushroom_map \
    -tAc "SELECT max(ingested_at) FROM forest_polygon"'
ssh geobiom-prod-timeweb 'docker exec mushroom_db_prod psql -U mushroom -d mushroom_map \
    -tAc "SELECT max(ingested_at) FROM forest_polygon"'
# diff ≤ 24h — норма
```

### Troubleshooting

**`Permission denied (publickey)` при ssh с TimeWeb на Oracle.**
Чек: `ssh -i /root/.ssh/sync_to_oracle ubuntu@<oracle> echo ok` напрямую
с TimeWeb. Если падает — `~/.ssh/sync_to_oracle.pub` отсутствует в
Oracle `~ubuntu/.ssh/authorized_keys`. Перезагрузить (см. §1).

**`pg_restore: error: connection to server failed`** на Oracle стороне.
Контейнер `mushroom_db_prod` упал. Проверить:
`ssh geobiom-prod-oracle 'docker compose -f /srv/mushroom-map/docker-compose.prod.yml ps'`.

**`pg_restore --clean` блокируется на DROP TABLE.** Кто-то держит conn
помимо api. Скрипт стопает только api контейнер. Если запущен какой-то
ad-hoc psql/pgAdmin — закрыть. Скрипт затаймаутит на 30min
(TimeoutStartSec в .service).

**Sanity-check FAIL — `forest_polygon count <1M`.** Дамп прошёл, но
данные не доехали (либо truncated stream через ssh, либо `pg_restore
--exit-on-error` упал на FK). Логи: `journalctl -u geobiom-db-sync -n
200`. Откатить: запустить `sync_db_to_remote.sh` руками с dev на
Oracle с full dump (восстанавливает за ~15 мин).

**Timer пропустил run.** Нормально если VM была down в момент
04:00 UTC + jitter 10min. `Persistent=true` в .timer — следующий boot
догонит. Если хочется немедленно — `systemctl start geobiom-db-sync`.

**Дамп растёт >1ГБ через несколько месяцев.** Скорее всего vk_post,
vk_post_model_result или forest_polygon разрослись. Проверить
`pg_database_size('mushroom_map')` на TimeWeb. Egress лимит Oracle
10TB/мес — даже daily 1ГБ дамп (~30ГБ/мес) держится с запасом, но
если станет 5ГБ — пересмотреть partial dump (как в backup runbook).

### Rollback (DB sync)

Если sync испортил Oracle DB:

```bash
# Восстановить Oracle из последнего R2 backup'а (если применимо к
# вашей schema; backup partial → только user-tables, гео-таблицы из
# pipelines).
ssh geobiom-prod-oracle 'bash /opt/geobiom/restore_from_r2.sh latest'

# Или: full dev → Oracle через sync_db_to_remote.sh (если dev в порядке
# и не сильно отстал)
REMOTE=geobiom-prod-oracle bash scripts/deploy/sync_db_to_remote.sh
```

---

## Tile sync (ad-hoc)

```bash
# All tiles
REMOTE=geobiom-prod-timeweb bash scripts/deploy/sync_tiles_to_vm.sh
REMOTE=geobiom-prod-oracle  bash scripts/deploy/sync_tiles_to_vm.sh

# Single layer
REMOTE=geobiom-prod-timeweb bash scripts/deploy/sync_tiles_to_vm.sh forest
```

Нет systemd-обвязки: tiles меняются редко (после re-ingest /
re-tippecanoe). Sync вручную после rebuild.

---

## Cutover runbooks

Полные сценарии:
- **TimeWeb deg → Oracle**: `cutover_to_oracle.sh` (1 минута DNS
  propagation если CF TTL=60, см. `cloudflare_set_ttl.sh` за день
  до).
- **Oracle deg → обратно TimeWeb**: `rollback_to_timeweb.sh`.
- **Контроль**: `smoke_test_prod.sh` после любого cutover.

История миграции и решения по архитектуре — memory
`project_website_migration.md`.
