/**
 * BottomSheet — мобильная нижняя шторка с тремя snap-высотами (peek /
 * half / full). Жесты — `@use-gesture/react`, анимации —
 * `@react-spring/web` (зависимости устанавливаются в Phase 2).
 *
 * Phase 1: скелет, чтобы не было import-ошибки в будущих файлах.
 */
import type { ReactNode } from "react";

export type BottomSheetSnap = "peek" | "half" | "full";

export interface BottomSheetProps {
  snap?: BottomSheetSnap;
  onSnapChange?: (snap: BottomSheetSnap) => void;
  children?: ReactNode;
  className?: string;
}

export function BottomSheet(_props: BottomSheetProps) {
  return <div data-todo="phase-2" />;
}
