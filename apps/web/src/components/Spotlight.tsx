/**
 * Spotlight (⌘K) — модальный поиск по видам / топонимам / районам.
 * Зависимость `cmdk` ставится в Phase 3. API: `/api/places/search` и
 * `/api/species/search`.
 *
 * Phase 1: скелет.
 */
export interface SpotlightProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Spotlight(_props: SpotlightProps) {
  return <div data-todo="phase-3" />;
}
