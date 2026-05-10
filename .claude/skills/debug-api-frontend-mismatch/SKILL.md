---
name: debug-api-frontend-mismatch
description: Use when frontend renders empty / undefined / "—" in fields that should have data, especially after API or schema changes. The fastest path is curl-the-API-first to compare actual response keys against the TypeScript interface — TS doesn't typecheck `res.json()`, so renames silently break rendering. Skips ~30 minutes of frontend debugging.
---

# Debug «empty/undefined data in UI» bugs the right way

The Spotlight name_ru→name bug (redesign-2026-05) burned ~25 minutes of frontend tracing before someone curl'd the actual API and saw the schema mismatch in 5 seconds. Pattern recurs whenever:

- Backend Pydantic model gets a field rename
- Frontend `interface` and backend response drift independently
- Migration script changes column name
- 3rd-party API (Yandex, OSM, Nominatim) updates wire format

`fetch().json()` returns `unknown` or `any` — TypeScript can't catch the mismatch. The frontend renders `obj.name_ru`, sees `undefined`, prints empty string.

## Symptoms this skill catches

- Search results show kind + coords but **names missing**
- Spot detail page shows rating but **no title**
- Forecast values are all `0.00` or `NaN`
- Card has the eyebrow + accent but **body text is blank**
- TypeCheck passes, Vitest passes, but page renders broken

## Step 1: Curl the actual endpoint, FIRST

Before opening `preview_eval`, before reading frontend rendering code, before adding `console.log` — get the literal HTTP response.

```bash
# Replace endpoint + query with the one you suspect
curl -s 'https://api.geobiom.ru/api/places/search?q=%D0%9F%D0%B5%D1%82%D0%B5%D1%80%D0%B3%D0%BE%D1%84&limit=2' | head -100
```

Tips:
- URL-encode Cyrillic queries (`echo -n 'Петергоф' | jq -sRr @uri`).
- For protected endpoints, add `-H "Cookie: session=..."` from a logged-in browser session (DevTools → Application → Cookies).
- For local dev, hit `http://localhost:8000/api/...` directly (or `https://api.geobiom.ru` since prod is reliably up).

Read the **first object's keys** in the response. Note what they're called.

## Step 2: Find the TypeScript interface

In this repo, frontend types for API DTOs live in:

- `packages/api-client/src/index.ts` — `searchSpecies`, `searchGazetteer`, `listSpots`, `createSpot`, `fetchSpeciesDetail`, `fetchForecastDistricts` etc. Each export has its `interface XxxResult` next to it.
- `packages/types/src/` — shared types (`UserSpot`, `SpeciesSearchResult`, …) used by both web and mobile.

Grep for the function the broken UI calls:

```bash
grep -nE "function (searchGazetteer|fetchSpeciesDetail|listSpots)" packages/api-client/src/index.ts
```

Open the matching `interface` and compare every field to the actual JSON keys from step 1. **Mismatches = the bug.**

## Step 3: Verify the rendering uses the correct key

Once you've found the interface that lies — grep for callers:

```bash
grep -rn "name_ru\|<the renamed field>" apps/web/src apps/mobile
```

Each match is a place that needs to read the corrected name. If TypeScript was already happy with the wrong field, that's a sign your interface declaration matched the wrong field — don't be fooled into looking elsewhere.

## Step 4: Pick the right side to fix

Two options when frontend and backend disagree:

**(a) Update the frontend interface + render to match the backend.**
- Use this when the backend response is the canonical/authoritative shape (e.g. follows a published OpenAPI spec, a 3rd-party API, or matches the DB column name).
- Lower deploy friction — frontend-only change.

**(b) Update the backend response model to match the frontend's old expectation.**
- Use this when the rename was accidental on the backend, or when the old name has SEO/contract value.
- Riskier — touches Python/Pydantic + redeploy of API service.

In the redesign-2026-05 Spotlight bug, option (a) was right: backend `name` matched the DB column `gazetteer_entry.name`, frontend's `name_ru` was a stale historical assumption.

## Step 5: Validate the fix end-to-end

After the patch:

1. `npx tsc --noEmit` (catches your typo if you renamed half the references)
2. `npx vitest run` (regressions in tests that mocked the old shape)
3. `curl <endpoint>` again to re-confirm the contract didn't drift
4. `mcp__Claude_Preview__preview_eval` to read the rendered DOM and verify the field renders (see `verify-ui-via-claude-preview` skill)

## Common false leads to skip

- "Maybe React isn't re-rendering" — almost never. State + render flow is reliable. The data is empty.
- "Maybe the CSS hides it" — check via `getComputedStyle` quickly to rule out, but rare.
- "Maybe the request is rate-limited / 429" — would show error toast or empty results entirely, not partial fields. Status `200` with partial fields = schema mismatch.
- "Maybe localization is missing" — i18n issues show fallback strings or untranslated keys, not blank fields.

## When NOT to use

- **The whole API call returns 4xx/5xx** — that's an HTTP/auth/CORS issue, not a schema mismatch. Open Network tab or read response body.
- **Frontend never made the request** — check Network panel. If no request, the bug is in event wiring, not the API.
- **Field renders the wrong value, not empty** — that's a transformation bug (pluralization, formatting, default value). Different debugging path.
