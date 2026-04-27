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

export function Sidebar(_props: SidebarProps) {
  const mode = useMapMode((s) => s.mode);
  return mode === "overview" ? <SidebarOverview /> : <SidebarDistrict />;
}
