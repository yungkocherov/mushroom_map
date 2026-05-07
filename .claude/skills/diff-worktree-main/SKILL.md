---
name: diff-worktree-main
description: Use before launching any pipeline that reads code from disk (scrape, ingest, build) when you've been editing files. Verifies that the file the pipeline will actually read matches your latest edits. Catches the worktree-vs-main confusion silently breaking pipelines.
---

# Verify worktree edits sync to main path before pipeline run

When working in `.claude/worktrees/<branch>/`, your `Edit`/`Write` operations go to the worktree directory. But shell commands using `cd /c/Users/ikoch/<repo>` execute against the main repo working tree. These can diverge silently — Python imports the file from `cd`'s working directory, not from where you edited.

## Symptoms this catches

- "I just added sanity-check `ratio>3` in `db.py`, but ingest didn't filter anything"
- "I committed the edit but the running pipeline still uses old behaviour"
- After re-ingest with new code, bogus rows still appear

## Pre-flight check

Run before any pipeline that depends on edited Python:

```bash
# All edited files must show "files differ" or be identical (dependent)
for f in services/geodata/src/geodata/db.py \
         pipelines/scrape_fgislk_attrinfo.py \
         pipelines/ingest_forest.py \
         services/geodata/src/geodata/sources/rosleshoz/source.py; do
  diff -q .claude/worktrees/<branch>/$f $f 2>/dev/null
done
```

If any line says `... differ`:
```bash
cp .claude/worktrees/<branch>/<path> <path>
```

Or skip the worktree entirely and edit main repo directly when changes need to be applied to runtime.

## Best practice

If user task involves running pipeline + editing same files:
1. Edit main repo (`/c/Users/ikoch/<repo>/`) directly, not worktree
2. Or: edit worktree, then `git add + commit + checkout` to apply to main

The worktree's purpose is *isolation* — keeps `git status` clean if you want to abort. But it breaks "edit + run" iteration unless you sync explicitly.

## Project-specific paths in mushroom-map

- Edits in worktree: `.claude/worktrees/<branch>/...`
- Pipeline runs read: `/c/Users/ikoch/mushroom-map/...`
- Critical files for ingest: `services/geodata/src/geodata/db.py`, `pipelines/ingest_forest.py`, `pipelines/scrape_fgislk_attrinfo.py`
- Memory & user-config (already global, no copy needed): `~/.claude/...`
