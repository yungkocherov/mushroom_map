# Phases 5-6: GlitchTip + Umami + SDK instrumentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire self-hosted error tracking (GlitchTip) and privacy-first
web analytics (Umami) into prod, plus instrument the API (sentry-sdk)
and frontend (@sentry/react + Umami snippet + custom events) so that
exceptions and product usage are observable.

**Architecture:** GlitchTip = Django + Redis, Umami = Node, both share
the existing Postgres instance via separate databases. Caddy reverse-
proxies `sentry.geobiom.ru` and `analytics.geobiom.ru`. Frontend and
API initialize SDKs **only when the DSN/website-id envs are set**, so
this code can ship before the servers are up — activates automatically
on first deploy after Phase 5.

**Tech Stack:** docker-compose, GlitchTip Django stack, Umami Node app,
sentry-sdk[fastapi], @sentry/react, Caddy.

---

## Spec reference

`docs/superpowers/specs/2026-04-30-prod-readiness-design.md` §4
(GlitchTip), §5 (Umami).

## File Structure

```
services/observability/
  README.md                            — operator runbook
  glitchtip/
    docker-compose.yml                 — web + worker + redis (uses prod db)
    .env.example
  umami/
    docker-compose.yml                 — single Node container (uses prod db)
    .env.example

infra/
  Caddyfile                            — add sentry.geobiom.ru + analytics.geobiom.ru blocks

services/api/
  pyproject.toml                       — add sentry-sdk[fastapi]
  src/api/main.py                      — sentry_sdk.init()
  src/api/settings.py                  — SENTRY_DSN, GIT_SHA settings

apps/web/
  package.json                         — add @sentry/react
  src/main.tsx                         — Sentry.init()
  src/lib/track.ts                     — Umami custom event helper
  src/components/mapView/LayerGrid.tsx — track('layer.toggle', ...)
  src/components/SaveSpotModal.tsx     — track('spot.save')
  src/pages/SpeciesDetailPage.tsx      — track('species.open', ...)
  src/components/Spotlight.tsx         — track('spotlight.search', ...)
  src/store/useMapMode.ts              — track('district.open', ...)
  index.html                           — Umami <script> snippet
  vite.config.ts                       — build.sourcemap = true (for self-hosted maps)

docker-compose.prod.yml                — add SENTRY_DSN / GIT_SHA env passthrough for api
.github/workflows/deploy-web.yml       — pass VITE_SENTRY_DSN / VITE_UMAMI_* into vite build
```

## Manual prerequisites (before SDKs go live)

These happen on Oracle VM after Oracle migration (Phase 4) — the SDK
code in this plan is harmless until envs are set.

1. **Create Postgres roles + databases for GlitchTip and Umami:**
   ```sql
   CREATE ROLE glitchtip LOGIN PASSWORD '<random-32>';
   CREATE DATABASE glitchtip OWNER glitchtip;
   CREATE ROLE umami LOGIN PASSWORD '<random-32>';
   CREATE DATABASE umami OWNER umami;
   ```
2. **Add DNS A records** in Cloudflare (grey-cloud, DNS-only):
   `sentry.geobiom.ru → <oracle-ip>`,
   `analytics.geobiom.ru → <oracle-ip>`.
3. **Generate Django SECRET_KEY for GlitchTip** + put in
   `services/observability/glitchtip/.env`.
4. **Generate APP_SECRET for Umami** (32+ bytes) + put in
   `services/observability/umami/.env`.
5. **First-run admin / website registration** — see operator runbook.
6. **Copy DSN / website-id back into prod `.env.prod`** so api+web pick
   them up on next deploy.

---

## Tasks

### Task 1: GlitchTip docker-compose

**Files:**
- Create: `services/observability/glitchtip/docker-compose.yml`
- Create: `services/observability/glitchtip/.env.example`

GlitchTip needs:
- web container (Django + gunicorn) on port 8001
- worker container (Celery, same image, different command)
- Redis (cheap, in-network)
- Postgres — reuse existing prod `db` service via the same compose
  network. We don't run a second Postgres.

- [ ] **Step 1: docker-compose.yml**

```yaml
# services/observability/glitchtip/docker-compose.yml
# Run alongside prod stack:
#   docker compose -f docker-compose.prod.yml \
#                  -f services/observability/glitchtip/docker-compose.yml \
#                  --env-file .env.prod up -d
# Expects: db service from prod compose; reads its own envs from
# services/observability/glitchtip/.env (separate file from .env.prod
# so secrets don't leak into the api).

services:
  glitchtip-redis:
    image: redis:7-alpine
    container_name: glitchtip_redis
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 128m

  glitchtip-web:
    image: glitchtip/glitchtip:v4.1
    container_name: glitchtip_web
    restart: unless-stopped
    depends_on:
      glitchtip-redis:
        condition: service_started
      db:
        condition: service_healthy
    env_file: ./services/observability/glitchtip/.env
    environment:
      DATABASE_URL: postgresql://glitchtip:${GLITCHTIP_DB_PASSWORD}@db:5432/glitchtip
      REDIS_URL: redis://glitchtip-redis:6379/0
      PORT: "8000"
    ports:
      - "127.0.0.1:8001:8000"
    deploy:
      resources:
        limits:
          memory: 768m

  glitchtip-worker:
    image: glitchtip/glitchtip:v4.1
    container_name: glitchtip_worker
    restart: unless-stopped
    depends_on:
      glitchtip-redis:
        condition: service_started
      db:
        condition: service_healthy
    env_file: ./services/observability/glitchtip/.env
    environment:
      DATABASE_URL: postgresql://glitchtip:${GLITCHTIP_DB_PASSWORD}@db:5432/glitchtip
      REDIS_URL: redis://glitchtip-redis:6379/0
    command: ./bin/run-celery-with-beat.sh
    deploy:
      resources:
        limits:
          memory: 384m
```

- [ ] **Step 2: .env.example**

```
# services/observability/glitchtip/.env.example
# Copy to services/observability/glitchtip/.env on the VM and fill in real values.

# Django secret — 50+ random bytes. Generate with:
#   python -c "import secrets; print(secrets.token_urlsafe(50))"
SECRET_KEY=REPLACE_ME

# DB password for the glitchtip role (created manually, see runbook §1).
GLITCHTIP_DB_PASSWORD=REPLACE_ME

# Public URL the web container assumes it lives at. Used for outbound
# email links, server-side rendering, etc.
GLITCHTIP_DOMAIN=https://sentry.geobiom.ru

# Disable user registration after admin account is created (one operator).
ENABLE_USER_REGISTRATION=false
ENABLE_ORGANIZATION_CREATION=false

# Email is optional. If you want incident emails, set EMAIL_URL=smtp://...
# Otherwise GlitchTip falls back to console (visible only in journalctl).
EMAIL_URL=consolemail://
DEFAULT_FROM_EMAIL=glitchtip@geobiom.ru
```

### Task 2: Umami docker-compose

**Files:**
- Create: `services/observability/umami/docker-compose.yml`
- Create: `services/observability/umami/.env.example`

Single Node container, ~256 MB RAM. Uses postgres from prod stack.

- [ ] **Step 1: docker-compose.yml**

```yaml
# services/observability/umami/docker-compose.yml
# Run alongside prod stack:
#   docker compose -f docker-compose.prod.yml \
#                  -f services/observability/umami/docker-compose.yml \
#                  --env-file .env.prod up -d

services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-v2.13.1
    container_name: umami
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file: ./services/observability/umami/.env
    environment:
      DATABASE_URL: postgresql://umami:${UMAMI_DB_PASSWORD}@db:5432/umami
      DATABASE_TYPE: postgresql
    ports:
      - "127.0.0.1:8002:3000"
    deploy:
      resources:
        limits:
          memory: 384m
```

- [ ] **Step 2: .env.example**

```
# services/observability/umami/.env.example

# 32+ bytes of randomness — used for cookie/JWT signing.
APP_SECRET=REPLACE_ME

# DB password for the umami role.
UMAMI_DB_PASSWORD=REPLACE_ME

# Optional: pin tracker hostname so cross-domain doesn't leak data.
# (Leave empty for default behavior.)
TRACKER_SCRIPT_NAME=
```

### Task 3: Operator runbook

**Files:**
- Create: `services/observability/README.md`

- [ ] **Step 1: Write README** with sections:
  - Architecture (text diagram showing Caddy → glitchtip-web / umami)
  - Manual prerequisites: psql commands to create databases + roles
  - GlitchTip first-run: migrate, createsuperuser, organization creation
  - Umami first-run: migrate (auto on first start), login (admin/umami → change)
  - "Get DSN / website-id" — where to copy from after first-run
  - How to add to `.env.prod` so SDKs activate on next deploy
  - DNS: A records grey-cloud
  - Caddy: brief note that blocks are already in `infra/Caddyfile`
  - UptimeRobot: add 2 monitors

### Task 4: Caddyfile additions

**Files:**
- Modify: `infra/Caddyfile`

- [ ] **Step 1: Read current Caddyfile** to match style.

- [ ] **Step 2: Add two site blocks at the bottom**

```caddyfile
# GlitchTip self-hosted error tracking. Reachable only via Caddy →
# loopback. Container itself binds to 127.0.0.1 in compose, so port
# 8001 is not exposed to the public internet.
{$CADDY_SENTRY_HOST:sentry.geobiom.ru} {
    encode gzip zstd
    reverse_proxy glitchtip-web:8000
}

# Umami self-hosted analytics. Same approach.
{$CADDY_UMAMI_HOST:analytics.geobiom.ru} {
    encode gzip zstd
    reverse_proxy umami:3000
    # Disable HSTS preload to keep this domain easy to repoint later.
    header -Strict-Transport-Security
}
```

- [ ] **Step 3: Document new env vars in CLAUDE.md** Production стек
      section (`CADDY_SENTRY_HOST`, `CADDY_UMAMI_HOST`).

### Task 5: API Sentry SDK

**Files:**
- Modify: `services/api/pyproject.toml`
- Modify: `services/api/src/api/settings.py`
- Modify: `services/api/src/api/main.py`
- Modify: `docker-compose.prod.yml`

- [ ] **Step 1: Add dependency**

```toml
# services/api/pyproject.toml — append to dependencies
"sentry-sdk[fastapi]>=2.20",
```

- [ ] **Step 2: Settings**

```python
# services/api/src/api/settings.py — add fields:
sentry_dsn: str = ""           # empty = SDK not initialized
git_sha: str = "unknown"       # release tag for Sentry events
sentry_traces_sample_rate: float = 0.1
sentry_environment: str = "production"
```

- [ ] **Step 3: Init in main.py — before app = FastAPI()**

```python
# services/api/src/api/main.py — at top, after imports:
import sentry_sdk
from sentry_sdk.integrations.asgi import SentryAsgiMiddleware

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        release=settings.git_sha,
        environment=settings.sentry_environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # Don't ship request bodies to GlitchTip — they may contain user data
        # (saved spot coords). Default sentry-sdk strips PII, but be explicit.
        send_default_pii=False,
    )
```

`sentry-sdk[fastapi]` auto-instruments via the FastAPI integration —
ASGI middleware wrap is automatic when init() is called before
`app = FastAPI()`. Exceptions raised in handlers are captured.

- [ ] **Step 4: Pass envs through prod compose**

```yaml
# docker-compose.prod.yml — add to api.environment:
SENTRY_DSN:                    ${SENTRY_DSN:-}
GIT_SHA:                       ${GIT_SHA:-unknown}
SENTRY_ENVIRONMENT:            ${SENTRY_ENVIRONMENT:-production}
```

- [ ] **Step 5: Update deploy-api.yml** to pass git SHA on deploy:

```yaml
# .github/workflows/deploy-api.yml — in the ssh deploy step:
ssh ... "
    cd /srv/mushroom-map &&
    export GIT_SHA=${{ github.sha }} &&
    docker compose -f docker-compose.prod.yml --env-file .env.prod pull api &&
    docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api
"
```

### Task 6: Frontend Sentry SDK

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/vite.config.ts`
- Modify: `.github/workflows/deploy-web.yml`

- [ ] **Step 1: Install package**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm install --workspace=@mushroom-map/web @sentry/react
```

- [ ] **Step 2: Init in main.tsx**

```tsx
// apps/web/src/main.tsx — before ReactDOM.createRoot:
import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const GIT_SHA = import.meta.env.VITE_GIT_SHA ?? "unknown";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: GIT_SHA,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    // Don't auto-capture user input from forms — privacy.
    sendDefaultPii: false,
  });
}
```

- [ ] **Step 3: Enable source maps in vite.config.ts**

```ts
// vite.config.ts — add to defineConfig:
build: {
  sourcemap: true,  // self-hosted source maps; GlitchTip fetches from /assets/
},
```

- [ ] **Step 4: Pass envs through deploy-web.yml**

```yaml
# .github/workflows/deploy-web.yml — in the build step:
- name: Build web
  env:
    VITE_API_URL:           ${{ vars.VITE_API_URL }}
    VITE_SENTRY_DSN:        ${{ vars.VITE_SENTRY_DSN }}
    VITE_UMAMI_HOST:        ${{ vars.VITE_UMAMI_HOST }}
    VITE_UMAMI_WEBSITE_ID:  ${{ vars.VITE_UMAMI_WEBSITE_ID }}
    VITE_GIT_SHA:           ${{ github.sha }}
  run: npm run build --workspace=@mushroom-map/web
```

### Task 7: Umami snippet

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/lib/track.ts` (new)

- [ ] **Step 1: index.html — add inside `<head>`**

```html
<!-- Umami self-hosted, privacy-first analytics. Loads only if both
     env vars are set at build time (vite replaces import.meta.env at
     build, so this gets baked into index.html via a small inline
     script). -->
<script>
  (function () {
    var host = "%VITE_UMAMI_HOST%";
    var siteId = "%VITE_UMAMI_WEBSITE_ID%";
    if (!host || host.indexOf("%VITE") === 0) return;
    if (!siteId || siteId.indexOf("%VITE") === 0) return;
    var s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = host.replace(/\/$/, "") + "/script.js";
    s.setAttribute("data-website-id", siteId);
    document.head.appendChild(s);
  })();
</script>
```

`%VITE_UMAMI_HOST%` substitution: vite doesn't templ index.html at this
level. Better to do this from `main.tsx` instead — see step 2. **Drop
the index.html version, do it from main.tsx so we can use
`import.meta.env`.**

- [ ] **Step 2 (revised): Inject from main.tsx instead**

```tsx
// apps/web/src/main.tsx — after Sentry init:
const UMAMI_HOST = import.meta.env.VITE_UMAMI_HOST;
const UMAMI_WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID;
if (UMAMI_HOST && UMAMI_WEBSITE_ID) {
  const s = document.createElement("script");
  s.async = true;
  s.defer = true;
  s.src = `${UMAMI_HOST.replace(/\/$/, "")}/script.js`;
  s.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
  document.head.appendChild(s);
}
```

- [ ] **Step 3: track.ts helper**

```ts
// apps/web/src/lib/track.ts
// Type-safe wrapper around umami's global track API. No-ops if Umami
// hasn't loaded (script blocked, dev mode without envs, etc).
//
// Add new event types to UmamiEvents below. Keep names in dot-namespace
// (`area.action`) for grouping in Umami UI.

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}

export type UmamiEvents = {
  "layer.toggle":      { layer: string; visible: boolean };
  "spot.save":         { has_rating: boolean; tag_count: number };
  "species.open":      { slug: string };
  "district.open":     { name: string };
  "spotlight.search":  { query_length: number };  // length only — never the query text
};

export function track<K extends keyof UmamiEvents>(
  event: K,
  data: UmamiEvents[K],
): void {
  try {
    window.umami?.track(event, data);
  } catch {
    // Never break UX because of analytics.
  }
}
```

### Task 8: Custom-event call sites

**Files:**
- Modify: `apps/web/src/components/mapView/LayerGrid.tsx`
- Modify: `apps/web/src/components/SaveSpotModal.tsx`
- Modify: `apps/web/src/pages/SpeciesDetailPage.tsx`
- Modify: `apps/web/src/components/Spotlight.tsx`
- Modify: `apps/web/src/store/useMapMode.ts`

- [ ] **Step 1: LayerGrid — wrap onToggle**

```tsx
// In LayerGrid.tsx where toggle handlers fire:
import { track } from "@/lib/track";
// inside chip click handler, after store.toggle call:
track("layer.toggle", { layer: chip.id, visible: !visible });
```

- [ ] **Step 2: SaveSpotModal — on submit**

```tsx
import { track } from "@/lib/track";
// after successful save:
track("spot.save", {
  has_rating: rating !== null,
  tag_count: tags.length,
});
```

- [ ] **Step 3: SpeciesDetailPage — on mount**

```tsx
import { track } from "@/lib/track";
useEffect(() => {
  if (slug) track("species.open", { slug });
}, [slug]);
```

- [ ] **Step 4: useMapMode — when entering district**

```ts
import { track } from "@/lib/track";
// inside setMode('district', district):
track("district.open", { name: district.name });
```

- [ ] **Step 5: Spotlight — on submit**

```tsx
import { track } from "@/lib/track";
// when search runs:
track("spotlight.search", { query_length: query.length });
```

### Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add «Observability» section** under «Production стек»:
  - GlitchTip URL, location of compose file, env file, how to start/stop
  - Umami URL, location of compose file
  - Pointer to operator runbook
  - Note that DSN/website-id come from first-run, copied to `.env.prod`

### Task 10: Commit + push

- [ ] **Step 1: Stage and commit**

```bash
git add services/observability/ \
        services/api/pyproject.toml services/api/src/api/main.py services/api/src/api/settings.py \
        apps/web/package.json apps/web/package-lock.json apps/web/src/main.tsx \
        apps/web/src/lib/track.ts apps/web/vite.config.ts \
        apps/web/src/components/mapView/LayerGrid.tsx \
        apps/web/src/components/SaveSpotModal.tsx \
        apps/web/src/components/Spotlight.tsx \
        apps/web/src/pages/SpeciesDetailPage.tsx \
        apps/web/src/store/useMapMode.ts \
        infra/Caddyfile docker-compose.prod.yml \
        .github/workflows/deploy-api.yml .github/workflows/deploy-web.yml \
        CLAUDE.md docs/superpowers/plans/2026-04-30-prod-readiness-observability.md
git commit -m "feat(obs): GlitchTip + Umami compose, sentry-sdk + @sentry/react, custom events"
git push
```

- [ ] **Step 2: Verify CI green** (`gh run list --limit 5`).

---

## Self-review

**Spec coverage (§4 GlitchTip):**
- Single Postgres for all (✓ uses prod db, separate database+role)
- ~1 GB RAM (✓ web 768m + worker 384m + redis 128m = ~1280m, slightly above
  the spec estimate but matches reality of GlitchTip workload)
- 100% Sentry-SDK compatible (✓ same DSN format, same ingest endpoint)
- Source maps via self-hosted (✓ build.sourcemap=true; no Sentry CLI needed)
- Release = git SHA (✓ via VITE_GIT_SHA / GIT_SHA envs)

**Spec coverage (§5 Umami):**
- One container, ~256 MB (✓ limit 384m for headroom)
- Privacy: no PII, hashed IP, no cookies (✓ Umami v2 default)
- 152-ФЗ-чисто (✓ self-host + no third-party + no PII)
- Custom events: layer.toggle, spot.save, species.open, district.open,
  spotlight.search (✓ all in track.ts type definitions)
- What NOT trackend: IP, координаты, содержимое spot'ов (✓ track helper
  только length и boolean'ы)

**Placeholders:** none — all snippets are real code; manual values
(DSN, website-id, passwords) are expected to live in env files, not
in the repo.

**Activation safety:** SDK init() is conditional on env presence; both
API and frontend ship as no-ops until envs are set. Code can land
before GlitchTip/Umami are deployed.

**Source maps caveat:** With `build.sourcemap=true` and self-hosted
GlitchTip, source maps are exposed to anyone who fetches the bundle.
Acceptable for an open-source project / low-risk frontend; for a
closed-source app you'd use `@sentry/vite-plugin` to upload to Sentry
and strip from public assets. Document this tradeoff in the runbook.

**Naming consistency:** `track()` helper used everywhere; event names
all in `dot.namespace` form; env var prefix `VITE_*` for frontend,
plain for backend.
