/**
 * Re-export shared spot-tags словаря из @mushroom-map/types.
 * Source-of-truth — packages/types/src/spotTags.ts. Этот модуль
 * оставлен как fasade для backward compat импортов из ../lib/spotTags.
 */
export {
  TREE_TAGS,
  MUSHROOM_TAGS,
  BERRY_TAGS,
  ALL_TAGS,
  tagLabel,
  type SpotTag,
} from "@mushroom-map/types";
