# @mushroom-map/api-client

Typed `fetch` wrappers around the FastAPI surface. Each function returns a `@mushroom-map/types` value and hides the network plumbing.

Lives here rather than in `apps/web` so the mobile app can share the same calls. The package is platform-agnostic — no DOM or React assumptions.

Populated in Phase 0 commit (e).
