---
name: audit-dead-code-cleanup
description: Use when user says "почисти dead code", "убери мёртвый код", "не остался ли мёртвый/устаревший код после <X>", or asks to verify that some old feature has fully been removed. Audits all references to a candidate symbol/file/feature, classifies each as active-code / zombie-comment / doc / CI, plans migration vs delete vs leave-alone (with prod-side deferred cleanup). Avoids the trap of nuking something still actively used by a fork (web vs mobile, web vs API). Project-specific: Geobiom workspace structure (apps/web, apps/mobile, pipelines, services, docs, scripts).
---

# Audit dead code candidate before deleting

The trap: delete a function/file that LOOKS unused, but a fork (mobile, API, scheduled task) still calls it. Or update a comment thinking the code is removed when only ONE of two paths was migrated.

## Step 1 — frame the candidate

Ask the user (or infer from context) **exactly** what symbol/file/feature is suspected dead:
- A specific file (`pipelines/build_tiles.py`)?
- A column/table (`forest_3857_low`)?
- A whole feature (`forest_lo` low-zoom layer system)?
- A function name?

Pick the **narrowest stable identifier** that grep'll find. For features (e.g. forest_lo), that's the system's tag word — `forest_lo` matches sources, layers, file paths, comments.

## Step 2 — wide grep across all forks

```bash
# Cast a wide net. Include all source extensions + docs + CI + Dockerfiles.
grep -rln "<CANDIDATE>" /c/Users/ikoch/mushroom-map \
  --include="*.py" --include="*.ts" --include="*.tsx" \
  --include="*.sh" --include="*.yml" --include="*.yaml" \
  --include="Dockerfile*" --include="*.md" --include="*.json" \
  | grep -v node_modules | grep -v ".claude/worktrees" | grep -v ".venv"
```

Don't filter results yet — we want the raw list to classify each.

## Step 3 — classify every reference

Open each match and put it in one bucket. Walk through them ONE BY ONE; don't batch-decide.

| Bucket | What it is | Action |
|---|---|---|
| **A. Active code in stack X** | Function call, import, source registration, table reference. Code path is reachable. | Either migrate stack X off this candidate, OR keep candidate alive (and don't delete). |
| **B. Zombie comment** | Comment, docstring, log message mentioning candidate. Code doesn't actually depend on candidate. | Update text to current reality. Don't change behavior. |
| **C. Documentation** | README, docs/, CLAUDE.md. User-facing reference. | Update reference to current command/file. |
| **D. CI / deploy** | `.github/workflows/`, scripts/deploy/, Dockerfiles. Build pipeline. | Verify pipeline still passes after candidate removed. |
| **E. Cross-fork mismatch** | One fork (e.g. web) already migrated; another (e.g. mobile) still uses it. | Either migrate the other fork too (user-preferred, ask) or leave candidate alive for them. |

Prepare a markdown table for the user with three columns: file, what it is, classified bucket. Show before doing anything destructive.

## Step 4 — handle cross-fork (web vs mobile vs API)

This project has **three independent map renderers**:
- `apps/web` — MapLibre GL JS (browser)
- `apps/mobile` — `@maplibre/maplibre-react-native` (RN/Expo)
- `services/api` — server-side, no rendering but uses `forest_polygon`

A common bug: web migrates off X, mobile keeps using X. Removing X breaks mobile silently (typecheck might still pass — RN deals in MVT source-layer strings).

For each candidate, check **all three** stacks before deciding it's globally dead.

## Step 5 — DB tables / DB-level audit

For DB candidates (tables, columns, materialized views):

```bash
# Does the table even exist in dev DB?
docker exec mushroom_db psql -U mushroom -d mushroom_map -c \
  "SELECT tablename FROM pg_tables WHERE tablename = '<CANDIDATE>';"

# And in prod DB? (Tables can drift between dev/prod via uneven migrations.)
ssh geobiom-prod-timeweb "docker exec mushroom_db_prod psql -U mushroom -d mushroom_map -c \
  \"SELECT tablename FROM pg_tables WHERE tablename = '<CANDIDATE>';\""

# Any materialized view / function referencing it?
docker exec mushroom_db psql -U mushroom -d mushroom_map -c \
  "SELECT matviewname FROM pg_matviews WHERE definition ILIKE '%<CANDIDATE>%';"
```

Don't drop tables blindly — migrations are **immutable** per `CLAUDE.md`. Better to leave dropped tables alone (they'll just be empty/missing) than to write a destructive migration.

## Step 6 — plan with user before destructive ops

Per `CLAUDE.md`: NO side-effect actions without explicit OK. Build a written plan:

```
Шаг 1 — точно безопасное удаление (commit в одном change):
  1. git rm pipelines/build_tiles.py (XXX строк)
  2. git rm pipelines/build_forest_lo_tiles.sh (YY строк)
  3. rm data/tiles/forest_test.pmtiles (local only)
  4. rm data/tiles/forest_lo.pmtiles (local only)

Шаг 2 — обновление комментариев/docs (no behavior change):
  5. apps/web/.../useMapInstance.ts:55-56 — coomment update
  6. apps/web/.../useMapLayers.ts:127-128 — comment update
  ...

Шаг 3 — миграция mobile fork (требует решения user'а):
  ...

Шаг 4 — НЕ удалять до следующего mobile deploy:
  - /srv/mushroom-map/tiles/forest_lo.pmtiles на prod (старые APK всё ещё дёргают)
```

Ждать «делай» / «погнали».

## Step 7 — verify after cleanup

```bash
# Type check both stacks (worktree may have stale node_modules — run from main path
# after sync, OR run from worktree if node_modules present)
cd /c/Users/ikoch/mushroom-map/apps/web && \
  export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit
cd /c/Users/ikoch/mushroom-map/apps/mobile && \
  export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit

# Smoke test: still works visually
# (Chrome MCP navigate + screenshot, or curl API endpoint with known coords)
```

## Step 8 — defer prod-side cleanup with memory TODO

If a prod artifact (file, table, container) can't be safely removed yet because old clients still use it, write a memory note:

```markdown
~/.claude/projects/.../memory/project_todo_prod_cleanup_<date>.md

# What's still on prod
<artifact path / size / why kept>

# When to delete
<after which event — next mobile deploy / week passes / etc>

# Associated commits
<commit hashes that did the local-side cleanup>
```

Don't promise yourself you'll remember. Memory > human memory.

## Anti-patterns to avoid

- **«Ушли же → можно удалить»**: web ушёл с `forest_lo`, кажется можно удалить — но mobile всё ещё использует. Always grep all forks.
- **Удалять прод-файл сразу**: clients (mobile APK, third-party API consumers) могут лагать с update. Prefer 7-day grace period + memory TODO.
- **Trust comments without verifying code**: comment says "x is removed" but `grep` shows imports. Comments lie.
- **Skip cross-DB check**: dev DB might have dropped X but prod still has it (or vice versa). Check both.
- **One commit for everything**: split removal-of-dead-pipeline from migration-of-mobile-fork. Easier to revert if smoke fails.
