/**
 * Barrel export for @mushroom-map/types.
 *
 * Mirrors the FastAPI response shapes. Consumers:
 * - apps/web (via `import type { ... } from "@mushroom-map/types"`)
 * - packages/api-client (typed fetch wrappers — commit e)
 * - future apps/mobile
 *
 * Adding a new endpoint: create a new file in src/ with the response
 * types and re-export it here.
 */

export * from "./species";
export * from "./forest";
export * from "./soil";
export * from "./water";
export * from "./terrain";
export * from "./places";
