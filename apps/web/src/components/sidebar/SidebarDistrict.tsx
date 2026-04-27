/**
 * District sidebar — рендерится при `useMapMode().mode === 'district'`.
 * Eyebrow «РАЙОН» + H1 (имя района) + индекс прогноза + топ-3 виды +
 * LayerGrid + CTA «Назад к обзору». Phase 1: скелет.
 */
export interface SidebarDistrictProps {
  className?: string;
}

export function SidebarDistrict(_props: SidebarDistrictProps) {
  return <div data-todo="phase-2" />;
}
