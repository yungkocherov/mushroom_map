/**
 * LayerGrid — 2×4 чипы для desktop, горизонтальная лента для mobile.
 * Каждый чип читает/пишет `useLayerVisibility`. Phase 1: скелет.
 */
export interface LayerGridProps {
  className?: string;
  /** desktop: 'grid'; mobile: 'strip' (horizontal scroll) */
  layout?: "grid" | "strip";
}

export function LayerGrid(_props: LayerGridProps) {
  return <div data-todo="phase-2" />;
}
