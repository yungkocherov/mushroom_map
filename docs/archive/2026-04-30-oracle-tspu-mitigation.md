# Oracle TSPU Mitigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Сделать так чтобы прод на Oracle ARM `79.76.53.170` (Stockholm)
работал **без VPN из РФ**. Сейчас новый Oracle IP попал под TSPU bandwidth
throttling — bash curl HTTP/1.1 проходит мгновенно (200 OK 70ms), но
браузеры с TLS-fingerprint'ом Chrome/Firefox получают **selective
throttle**: 4KB HTML за 19s, главный JS bundle (~1MB) timeout'ит.

**Architecture:** Поэтапная mitigation — от дешёвых лотерей (новый IP,
TLS-tweaks) к гарантированному решению (Yandex Cloud reverse-proxy
в РФ как frontend перед Oracle).

**Tech Stack:** OCI CLI, Caddy TLS config, Yandex Cloud (если до C
дойдёт), Vite manual chunks.

---

## Spec reference

`docs/superpowers/specs/2026-04-30-prod-readiness-design.md` §6 для контекста миграции.
Мемори `project_website_migration.md` — текущее состояние.

## Текущее состояние (фиксация)

- **DNS:** geobiom.ru / www / api → `178.253.43.136 (TimeWeb)`, ttl=300
- **TimeWeb VM** mushroom_db_prod / mushroom_api_prod / mushroom_caddy_prod — Up, healthy
- **Oracle VM** `79.76.53.170` — все три контейнера тоже Up, prod-data восстановлено,
  LE certs выданы. Просто DNS на него не указывает.
- **Cloudflare API token:** `~/.cloudflare/geobiom-api-token` (mode 600)
- **OCI CLI:** аутентифицирован, region eu-stockholm-1, owner Margo
- **Tailscale lockdown:** не сделан, ufw allow public 22 на Oracle (не регрессия,
  TimeWeb так же)

## Pre-conditions для каждого шага

- ssh `geobiom-prod-oracle` (`ubuntu@79.76.53.170`, key `~/.ssh/geobiom_yc`) работает
- ssh `geobiom-prod-timeweb` (`root@178.253.43.136`) работает
- CF API token валиден (`curl ... user/tokens/verify` → status active)
- Oracle стек все три контейнера Up: `ssh geobiom-prod-oracle 'sudo docker ps'`

---

## Tasks

### Task 1 (Phase A): Detach + reattach public IP на Oracle

**Files:** none, OCI CLI операция.

**Hypothesis:** TSPU флагнул конкретный IP `79.76.53.170` или его /24
подсеть. Detach + reattach даёт новый ephemeral IPv4. Может попасть в
другой /24, не флагнутый. Шансы 30-50%.

**Risk:** При detach VM теряет публичный доступ — для re-attach обязателен
internal/private IP или OCI console. Лучше делать с private network mode
запасной (Tailscale на VM работает, плюс OCI console attach-from-list).

- [ ] **Step 1:** Снять текущий VNIC OCID

```bash
INSTANCE=ocid1.instance.oc1.eu-stockholm-1.anqxeljrptt7hxicjss7smkk2vjbxsan3wlchnvsc5r5mqzuzomcyiws3kpq
oci compute instance list-vnics --instance-id "$INSTANCE" \
    --query 'data[0].id' --raw-output
# сохрани VNIC_ID
```

- [ ] **Step 2:** Получить ephemeral PublicIP OCID

```bash
oci network public-ip get-by-private-ip-id \
    --private-ip-id $(oci network private-ip list --vnic-id "$VNIC_ID" \
        --query 'data[0].id' --raw-output) \
    --query 'data.id' --raw-output
# сохрани OLD_PIP_ID
```

- [ ] **Step 3:** Отвязать ephemeral PublicIP

```bash
oci network public-ip delete --public-ip-id "$OLD_PIP_ID" --force
# через 10-30 сек VM теряет публичный IP
```

- [ ] **Step 4:** Привязать новый ephemeral PublicIP к тому же private-IP

```bash
PRIVATE_IP_ID=$(oci network private-ip list --vnic-id "$VNIC_ID" \
    --query 'data[0].id' --raw-output)
oci network public-ip create --compartment-id "$COMPARTMENT_ID" \
    --lifetime EPHEMERAL \
    --private-ip-id "$PRIVATE_IP_ID" \
    --query 'data."ip-address"' --raw-output
# сохрани NEW_IP
```

- [ ] **Step 5:** Update SSH config + cloudflare DNS

```bash
# Update ~/.ssh/config: geobiom-prod-oracle HostName -> NEW_IP
# Update CF: api/www/geobiom -> NEW_IP via cloudflare_dns_cutover.sh с NEW_IP=...
NEW_IP=<new ip> bash scripts/deploy/cloudflare_dns_cutover.sh
```

- [ ] **Step 6:** Wait DNS prop + smoke test from RU без VPN

```bash
# подождать 5 мин (TTL=300)
bash scripts/deploy/smoke_test_prod.sh geobiom.ru
# ОТКРЫТЬ ВРУЧНУЮ В БРАУЗЕРЕ БЕЗ VPN — главный экзамен
```

- [ ] **Step 7:** Если работает — оставить, обновить memory + CLAUDE.md.
- [ ] **Step 7-альт:** Если throttle сохранился — переходить к Task 2.

### Task 2 (Phase B): TLS-tweaks в Caddy

**Files:**
- Modify: `infra/Caddyfile`

**Hypothesis:** TSPU фильтрует по TLS fingerprint (JA3). Force TLS 1.2 only
+ disable HTTP/3 advertising полностью + узкие cipher suites — может
изменить fingerprint так что DPI не флагнет.

**Risk:** TLS 1.2 без forward secrecy на старых cipher suites — security
regression. Браузеры всё равно используют ECDHE-RSA-AES128-GCM-SHA256 с
1.2, что приемлемо.

- [ ] **Step 1:** Добавить TLS settings в Caddyfile global block

```caddyfile
{
    email {$CADDY_ACME_EMAIL}
    servers {
        protocols h1   # уже есть
    }
    # NEW:
    servers :443 {
        protocols h1
        listener_wrappers {
            tls
        }
    }
}
```

И в каждый site-block:

```caddyfile
{$CADDY_API_HOST} {
    tls {
        protocols tls1.2 tls1.2
        ciphers TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
    }
    # ... остальное как было
}
```

То же для `{$CADDY_WEB_HOST}`.

- [ ] **Step 2:** Commit + push + restart Caddy на Oracle

```bash
git add infra/Caddyfile
git commit -m "fix(caddy): TLS 1.2 only + narrow cipher suite — TSPU mitigation try"
git push
ssh -i ~/.ssh/geobiom_yc ubuntu@79.76.53.170 'cd /srv/mushroom-map && git pull && sudo docker compose -f docker-compose.prod.yml --env-file .env.prod restart caddy'
```

- [ ] **Step 3:** Test from RU без VPN. Same browser test как в Task 1.

- [ ] **Step 4:** Если помогло — оставить, повторить smoke + memory update.
- [ ] **Step 4-альт:** Если нет — откатить TLS-tweaks (вернуть default), идти Task 3.

### Task 3 (Phase C): Yandex Cloud reverse-proxy

**Files:**
- Create: `scripts/deploy/yc_reverse_proxy_setup.sh` — IaC bootstrap скрипт
- Create: `infra/yc-proxy/Caddyfile` — конфиг Caddy на YC VM
- Create: `infra/yc-proxy/docker-compose.yml` — single Caddy сервис

**Hypothesis:** Yandex Cloud VM в РФ имеет RU-IP, не throttle'ится TSPU.
Caddy на ней проксирует геobiom.ru/* → 79.76.53.170/* (Oracle).
Пользователь в РФ → YC VM (RU IP, no TSPU) → интернет → Oracle.
RU-leg чистый.

**Cost:** ~150-300 RUB/мес за самую мелкую YC VM (b2.nano: 2 vCPU /
2 GB / 30 GB / 100% utilization).

**Risk:** Yandex Cloud account уже есть (Y.O.S. backup). Нужна compute
сервис — отдельная активация, может потребовать платежки. Если YC откажет
— альтернатива Selectel или VK Cloud (та же логика, RU-frontend).

- [ ] **Step 1:** Проверить что YC compute доступен текущему аккаунту

```bash
yc compute instance list 2>&1 | head -3
# Если ругается на «no folder configured» — yc init
```

- [ ] **Step 2:** Создать YC VM (b2.nano, Ubuntu 22.04)

```bash
yc compute instance create \
    --name geobiom-yc-proxy \
    --zone ru-central1-a \
    --network-interface subnet-name=default-ru-central1-a,nat-ip-version=ipv4 \
    --create-boot-disk image-folder-id=standard-images,image-family=ubuntu-2204-lts,size=30 \
    --memory 2 --cores 2 --core-fraction 100 \
    --ssh-key ~/.ssh/geobiom_yc.pub
# сохрани public IP
```

- [ ] **Step 3:** Bootstrap YC VM (apt update, docker, ufw)

```bash
ssh ubuntu@<yc-ip> 'bash -s' < scripts/deploy/yc_reverse_proxy_setup.sh
```

Скрипт `yc_reverse_proxy_setup.sh`:
- apt update + docker + ufw
- ufw allow 22/tcp (from any), 80, 443 (from any)
- mkdir /srv/yc-proxy, скопировать туда Caddyfile + docker-compose

- [ ] **Step 4:** Caddyfile для YC-прокси

```caddyfile
# infra/yc-proxy/Caddyfile
{
    email {$CADDY_ACME_EMAIL}
}

{$CADDY_PRIMARY_HOST} {
    encode gzip
    reverse_proxy https://{$ORACLE_PUBLIC_IP} {
        # Caddy → Oracle: всё-таки HTTPS наружу (Oracle Caddy всё равно
        # требует валидного TLS на 443). header Host: api.geobiom.ru
        # сохраняем чтобы Oracle Caddy match'нул правильный site-block.
        header_up Host {host}
        transport http {
            tls
            tls_insecure_skip_verify
            # YC → Oracle на любом IP, cert уже на api.geobiom.ru имени
        }
    }
    # SPA fallback не нужен — Oracle handle'ит
}
```

или проще — просто проксируем все 3 домена через один Caddy site:

```caddyfile
geobiom.ru, www.geobiom.ru, api.geobiom.ru {
    encode gzip
    reverse_proxy https://79.76.53.170 {
        header_up Host {host}
        transport http {
            tls
            tls_insecure_skip_verify
        }
    }
}
```

YC-Caddy получает свой LE cert (HTTP-01 через 80 порт, прибит к публичному
YC IP). Backend cert validation skipped (Oracle cert на правильном CN —
geobiom.ru — но IP-based connection не matches CN, поэтому
insecure_skip_verify).

- [ ] **Step 5:** Up Caddy на YC VM

```bash
ssh ubuntu@<yc-ip> 'cd /srv/yc-proxy && sudo docker compose up -d'
```

- [ ] **Step 6:** Update DNS на YC IP

```bash
NEW_IP=<yc-ip> bash scripts/deploy/cloudflare_dns_cutover.sh
```

- [ ] **Step 7:** Wait DNS prop, smoke-test, **открыть в браузере без VPN**

Этот шаг — финальный экзамен. Из РФ:
- DNS → YC VM (RU IP)
- TLS handshake к YC Caddy (no TSPU)
- Caddy proxy → Oracle (Stockholm, всё равно через интернет, но не
  через RU-провайдера, поэтому TSPU не на пути backend-leg'а)

- [ ] **Step 8:** Если работает — добавить YC VM в monitoring (UptimeRobot
монитор `https://geobiom.ru/health`). Документировать в memory.

### Task 4 (Phase D): Code-split Vite bundle

**Files:**
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/src/main.tsx` (если нужно — lazy MapPage)

Полезно в любом случае, не зависит от A/B/C. Делается ОТДЕЛЬНО, после
того как прод стабилизирован через A/B/C.

**Hypothesis:** Главный JS chunk сейчас ~1 MB (gzipped 378 KB). На
TSPU-throttled IP такой большой файл timeout'ит. Code-split на чанки
< 100KB каждый — дайте каждый chunk шанс пройти отдельно.

- [ ] **Step 1:** Vite manual chunks config

```ts
// apps/web/vite.config.ts — в build:
build: {
    sourcemap: true,
    rollupOptions: {
        output: {
            manualChunks: {
                'react': ['react', 'react-dom', 'react-router-dom'],
                'maplibre': ['maplibre-gl', 'pmtiles'],
                'sentry': ['@sentry/react'],
                'radix': ['@radix-ui/react-dialog', '@radix-ui/react-popover',
                          '@radix-ui/react-select', '@radix-ui/react-tabs',
                          '@radix-ui/react-tooltip', '@radix-ui/react-accordion'],
                'fonts': ['@fontsource-variable/fraunces', '@fontsource-variable/inter',
                          '@fontsource-variable/jetbrains-mono'],
            },
        },
    },
},
```

- [ ] **Step 2:** Build, проверить что chunks разумного размера

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd apps/web
npm run build
ls -lh dist/assets/*.js | awk '{print $5, $9}' | sort -h
```

Цель: главный entry chunk ≤ 150KB, каждый split-chunk ≤ 200KB.

- [ ] **Step 3:** Lazy-load MapPage (если ещё не сделано)

В router.tsx:
```ts
const MapHomePage = lazy(() => import('./routes/MapHomePage'));
```

- [ ] **Step 4:** Commit + push (deploy-web автоматически билдит)

```bash
git add apps/web/vite.config.ts apps/web/src/router.tsx
git commit -m "perf(web): code-split bundle into chunks for TSPU throttle resilience"
git push
```

### Task 5: Update CLAUDE.md и memory с финальным состоянием

**Files:**
- Modify: `CLAUDE.md`
- Modify: `~/.claude/projects/.../memory/project_website_migration.md`

После того как один из путей A/B/C сработал — обновить:
- В CLAUDE.md «Production стек»: новый prod-IP, дата live, путь (direct vs YC proxy)
- Memory: убрать "in flight" статус, mark как DONE
- Если Task 3 (YC proxy) — добавить новый компонент в архитектуру

### Task 6: Decommission TimeWeb (после soak)

**Files:** none

После 7-14 дней работы Oracle (или Oracle+YC proxy) без инцидентов:

```bash
AGE_RECIPIENT=<your_age_pubkey> \
TIMEWEB_HOST=geobiom-prod-timeweb \
    bash scripts/deploy/decommission_timeweb.sh
```

Затем manual в TimeWeb dashboard — выключить + удалить VM.

---

## Self-review

**Покрытие гипотез:**
- TSPU floods на specific IP → Task 1 (detach/reattach)
- TSPU floods на TLS fingerprint → Task 2 (TLS-tweaks)
- TSPU блокирует whole stockholm /24 → Task 3 (YC proxy полностью обходит)
- Bandwidth throttle на размер chunks → Task 4 (smaller chunks)

**Order:** Дешевые сначала (1, 2). Если оба не сработали — Task 3 гарантирует.
Task 4 ортогональный, делается потом.

**Rollback story:** На каждом шаге `rollback_to_timeweb.sh` возвращает прод
на TimeWeb за 5 мин. TimeWeb VM не выключаем до Task 6.

**Placeholders:** All steps содержат конкретные команды. OCI commands
требуют `$INSTANCE`, `$COMPARTMENT_ID` — берутся из существующего
`oracle_capacity_catcher.sh` или из `~/.oci/config`.

**Type/name consistency:** SSH alias'ы `geobiom-prod-oracle` /
`geobiom-prod-timeweb` уже определены в `~/.ssh/config`. CF API через
существующий `cloudflare_dns_cutover.sh`.
