/**
 * Methodology articles registry.
 *
 * Eager-imports every .mdx file in this directory so the router can
 * match slug → module synchronously (no Suspense, no loading state).
 * Also extracts frontmatter for the hub page listing.
 *
 * For Phase 1 all three articles live in the initial bundle
 * (~20-40 KB total incl. shiki styles). Phase 4 polish can switch to
 * lazy imports once the article count justifies code-splitting.
 */

import type { ComponentType } from "react";

/** 4 рубрики каталога /methodology по spec'у redesign-2026-04. */
export type MethodologyCategory =
  | "Источники данных"
  | "Модель прогноза"
  | "О проекте"
  | "Юридическое";

export const METHODOLOGY_CATEGORIES: MethodologyCategory[] = [
  "Источники данных",
  "Модель прогноза",
  "О проекте",
  "Юридическое",
];

interface MdxModule {
  default: ComponentType<Record<string, unknown>>;
  frontmatter: {
    title: string;
    slug: string;
    category?: MethodologyCategory;
    abstract?: string;
    reading_minutes?: number;
    updated?: string;
  };
}

const modules = import.meta.glob<MdxModule>("./*.mdx", { eager: true });

export interface MethodologyArticle {
  slug: string;
  title: string;
  category: MethodologyCategory;
  abstract?: string;
  reading_minutes?: number;
  updated?: string;
  Component: ComponentType<Record<string, unknown>>;
}

export const articles: MethodologyArticle[] = Object.values(modules).map((m) => ({
  slug: m.frontmatter.slug,
  title: m.frontmatter.title,
  // Без category в frontmatter article попадает в «Источники данных» —
  // безопасный default для технических статей.
  category: m.frontmatter.category ?? "Источники данных",
  abstract: m.frontmatter.abstract,
  reading_minutes: m.frontmatter.reading_minutes,
  updated: m.frontmatter.updated,
  Component: m.default,
}));

export function findArticle(slug: string): MethodologyArticle | undefined {
  return articles.find((a) => a.slug === slug);
}
