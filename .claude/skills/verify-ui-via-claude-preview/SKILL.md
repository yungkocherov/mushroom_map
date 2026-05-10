---
name: verify-ui-via-claude-preview
description: Use when verifying web UI changes locally via Claude Preview (mcp__Claude_Preview__*) — covers launch.json setup quirks, in-app navigation tricks, screenshot timing, and the exact patterns that worked vs failed in the redesign-2026-05 sessions. Avoids the ~15 minutes of friction every UI session would otherwise hit on launch.json paths and synthetic events.
---

# Verify Geobiom web UI via Claude Preview

When the user says "проверь сам через хром" / "screenshot the new layout" / "посмотри как выглядит" — Claude Preview MCP is the right tool. It manages a Vite dev server and gives you `preview_eval`, `preview_screenshot`, `preview_resize`, `preview_inspect`, `preview_click`, `preview_console_logs`. But the harness has several non-obvious traps that cost real time the first time you hit them.

This skill is the cheat-sheet.

## Pre-flight: load the deferred preview tools

Preview tools are deferred — only their names live in your context until you load schemas. Load them in bulk in one ToolSearch call:

```
ToolSearch({ query: "Claude_Preview", max_results: 15 })
```

Don't load them one-by-one with `select:` — that's one round-trip per tool.

## Step 1: launch.json setup

Claude Preview starts dev servers from `.claude/launch.json` **relative to the working directory**. In this repo two paths matter:

- Main repo working dir: `C:\Users\ikoch\mushroom-map\` — needs `.claude/launch.json`
- Worktree: `.claude/worktrees/<branch>/` — needs **its own** `.claude/launch.json`

If you're in a worktree, create the file there. The Bash sandbox CWD reset means you're often in the worktree anyway. Use this exact template:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "web-dev",
      "runtimeExecutable": "npm.cmd",
      "runtimeArgs": ["run", "dev", "--workspace=@mushroom-map/web"],
      "port": 5173
    }
  ]
}
```

**Quirks:**
- `runtimeExecutable: "npm.cmd"` works on Windows. NOT `"npm"` (resolution fails) and NOT `"C:\\Program Files\\nodejs\\npm.cmd"` (the launcher splits on space and tries to exec `"C:rogram"`).
- **No `cwd` field.** It's validated as relative-to-project-root and absolute paths return `cwd must be a relative path within the project root`. Just omit and let the Vite workspace resolve correctly.
- If you're in a worktree without `node_modules`, `preview_start` will fail with `Cannot find package '@vitejs/plugin-react'`. Run `npm install` from the worktree first (~60-90s background).
- Main repo also needs `npm install` (without `--workspaces=false`) to pull workspace deps. `npm install --workspaces=false` only installs root deps — won't help.

After `preview_start`, save the returned `serverId` for all subsequent calls.

## Step 2: navigation patterns

`location.assign('/route')` works but **always returns** `Eval failed: Inspected target navigated or closed` because the eval frame is destroyed by the navigation. The next `preview_eval` against the same server works fine — the result of the first one is just lost.

**Pattern that works** — pushState + popstate so React Router updates without losing the eval frame:

```js
history.pushState({}, '', '/route');
window.dispatchEvent(new PopStateEvent('popstate'));
await new Promise(r => setTimeout(r, 1500)); // let React rerender
return JSON.stringify({ path: location.pathname, h1: document.querySelector('h1')?.innerText });
```

**Pattern for first-visit redirect testing:**

```js
localStorage.removeItem('geobiom_onboarded');
location.assign('/');                    // accept the navigated-error
// next eval will land on /onboarding
```

After `location.assign`, do a follow-up eval to read the new state — don't try to `await` inside the same call.

## Step 3: screenshot timing

`preview_screenshot` has a 30s timeout. It hangs on:
- Pages still loading initial bundle
- Pages with unresolved network requests (basemap tiles, font fetch)
- Map pages where Vite HMR is reconnecting

Mitigations:
- Always do an `eval` first to confirm the route rendered (`document.body.innerText.length > 0` or `document.querySelector('h1')`)
- For map pages, eval `!!document.querySelector('.maplibregl-canvas')` before the screenshot
- If timeout still hits, retry once after 2s — usually unblocks
- If renderer truly stuck, `preview_console_logs --level error` reveals Vite import-resolve errors (e.g. missing `@fontsource/...` subset)

## Step 4: eval-clicking — synthetic events vs real

Synthetic `KeyboardEvent` dispatched via `window.dispatchEvent` does NOT reliably reach `window`-level keydown listeners in the iframe — focus context differs from a real user keypress. Spotlight `⌘K` listener catches NOTHING when dispatched this way.

**For Spotlight (or any global hotkey):** prefer clicking the element that opens it. The MapTopBar search button does the same dispatch internally; from there it works.

**For in-page buttons:** the `find-by-text + click` pattern is solid:

```js
Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Дальше')?.click();
```

Or use `preview_click` with a CSS selector — works for unambiguous selectors.

## Step 5: preview_eval gotchas

- **`fetch` to backend often fails with CORS** in dev. The Vite dev server proxies `/api/*` to `http://127.0.0.1:8000`, but if you didn't start the API container, fetch returns `Failed to fetch`. To verify backend behavior, `curl https://api.geobiom.ru/api/<endpoint>` directly from Bash — see the `debug-api-frontend-mismatch` skill.
- **`location.search` after pushState** updates synchronously, but React state lags one tick. Add `await new Promise(r => setTimeout(r, 1500))` after navigation before reading derived state.
- **Long expressions** must be a single line OR wrapped in IIFE: `(async () => { ... })()`.
- Multi-step interactions: chain promises in a single IIFE rather than separate `preview_eval` calls — separate calls re-create the JS context and lose state.

## Step 6: cleanup

When done, `preview_stop` the server. Avoids stale processes on the next session:

```
preview_stop({ serverId: "..." })
```

## Quick verify recipes

**Does `/onboarding` render step 1 with new headline?**

```js
JSON.stringify({
  path: location.pathname,
  h1: document.querySelector('h1')?.innerText,
  buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()),
  stepActive: document.querySelectorAll('[class*="stepDotActive"]').length,
})
```

**Is MapForecastPanel rendered with cream-card style?**

```js
JSON.stringify(Array.from(document.querySelectorAll('aside')).map(a => ({
  label: a.getAttribute('aria-label'),
  bg: getComputedStyle(a).backgroundColor,
  radius: getComputedStyle(a).borderRadius,
})))
```

**Did MapLibre nav controls land bottom-right?**

```js
JSON.stringify({
  inBottomRight: !!document.querySelector('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-group'),
  bg: getComputedStyle(document.querySelector('.maplibregl-ctrl-group') || document.body).backgroundColor,
})
```

## When NOT to use this skill

- **Backend-only changes** — `curl`/`pytest` is faster than spinning Vite.
- **TypeCheck / unit tests** — `npx tsc --noEmit` and `npx vitest run` cover the contract layer; preview is for visual regressions.
- **Production smoke** — `curl -sI https://geobiom.ru/<route>` is enough; preview is dev-only.
