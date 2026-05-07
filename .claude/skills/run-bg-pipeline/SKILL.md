---
name: run-bg-pipeline
description: Use when launching a long-running (>5min) pipeline like scrape/ingest/build/sync. Wraps pipeline in background bash + spawns until-grep monitor + sets ScheduleWakeup. Implements the 3-layer redundancy: foreground bash exit notification + monitor exit notification + active wakeup checkin. Avoids stale-monitor and false-positive-grep pitfalls.
---

# Launch long-running pipeline with redundant monitoring

Long pipelines (scrape, full-region ingest, etc) need three independent completion signals because each is unreliable on its own.

## Pattern

```bash
# 1. Pipeline in background, writing ASCII end-signal at finish
cd /c/Users/ikoch/mushroom-map && (
  echo "=== START $(date) ==="
  echo "=== STAGE 1: ... ==="
  ...
  echo "=== STAGE N: ... ==="
  ...
  echo "MY_PIPELINE_<UNIQUE>_DONE at $(date)"   # ← ASCII end-signal, MUST be unique
) > logs/<task_name>.log 2>&1
# launched with run_in_background:true
```

```bash
# 2. Until-grep monitor — independent process, exits on signal match
cd /c/Users/ikoch/mushroom-map && \
  until grep -qE "MY_PIPELINE_<UNIQUE>_DONE|^Traceback|^ERROR" logs/<task_name>.log 2>/dev/null; do
    sleep 30
  done
  echo MONITOR_EXIT
  tail -20 logs/<task_name>.log
# launched with run_in_background:true → notification on exit
```

```text
3. ScheduleWakeup with adaptive delay:
   - sub-5m task: 60-270s (cache stays warm)
   - 5m-1h task: 1200-1800s
   - >1h task: 1800-3600s, recurring every 25-30m
   reason: specific text — "checking <task> ETA <N>min"
   prompt: self-contained instructions for the next session
```

## Critical pitfalls — must avoid

### 1. Unique end-signal token
Don't use generic `Done` or `complete` in `until grep` — these match many incidental log lines including caller bash output. Use task-specific tokens like `PIPELINE_EAST_DONE`, `INGEST_DONE_R4`, etc.

### 2. cp1251 mojibake on Windows console
Python scripts print Cyrillic to stdout, Windows console mangles to cp1251 (or worse, cp866 in different shells). UTF-8 grep patterns will never match. Always use ASCII tokens for monitoring: `Done in`, `ok=`, `fail=`, `INGEST_DONE`. Never `Готово`, `Ошибка`.

### 3. Worktree vs main path
If you're working in `.claude/worktrees/<branch>/` but the pipeline runs from main repo path (`/c/Users/ikoch/<repo>/`), edits go to worktree but pipeline reads main. Always `cd /c/Users/ikoch/<repo> && bash ...` for chained pipelines, and verify the file you edited is the one being read:
```bash
diff -q .claude/worktrees/<branch>/<path> <path>
```

### 4. Kill stale monitors before starting new ones
If you re-launch a pipeline after fixing a bug, the old monitor on the old log will fire when the *first* matching token appears (often noise). Before starting new pipeline:
```bash
# either TaskStop old monitor task IDs, or use a fresh log filename
```

### 5. ScheduleWakeup is best-effort
Wakeups have been observed to fire 1-2h late or skip entirely. Don't rely on a single wakeup; always have monitor-based notification as backup. If user says "почему не проснулся / time прошло" — verify state immediately, don't deflect.

### 6. Background bash task-notification fires on bash exit, not pipeline exit
If the pipeline runs inside `(...) > log 2>&1` and the parent bash exits after launching, you get notification "completed" but the python pipeline inside is still running. To wait for the actual pipeline, the bash command should *block* on the pipeline (no trailing `&`).

## Resource considerations

- Disk: stage tables in Postgres temp can hold 5GB+ during finalize INSERT
- Egress: monitor TimeWeb/Oracle quota before sync (see `~/.claude/CLAUDE.md` free-tier rule)
- Concurrent pipelines: scrape writes only to `progress.db` SQLite, can run alongside ingest/build that work on `forest_polygon`. But don't re-ingest while scrape is exporting `geojson` — race on file.
