/**
 * Sidebar — корневой контейнер. Условно рендерит Overview либо District
 * в зависимости от `useMapMode`. Phase 1: скелет.
 */
import { useMapMode } from "../../store/useMapMode";
import { SidebarOverview } from "./SidebarOverview";
import { SidebarDistrict } from "./SidebarDistrict";

export interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const mode = useMapMode((s) => s.mode);
  return mode === "overview"
    ? <SidebarOverview className={className} />
    : <SidebarDistrict className={className} />;
}
