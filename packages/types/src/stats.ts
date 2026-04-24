/**
 * /api/stats/* — landing / data-transparency endpoints.
 */

export interface StatsOverview {
  posts_total: number;
  posts_classified: number;
  species_count: number;
  district_count: number;
  forest_polygon_count: number;
  /** ISO timestamp (UTC). */
  last_vk_refresh: string | null;
  photo_prompt_version: string | null;
  forecast_model_version: string | null;
  forecast_cv_r2: number | null;
}

export type SpeciesNowTrend = "up" | "down" | "flat" | null;

export interface SpeciesNowItem {
  species_key: string;
  label: string;
  post_count: number;
  pct: number;
  trend: SpeciesNowTrend;
}

export interface SpeciesNowResponse {
  window_days: number;
  total_posts_in_window: number;
  items: SpeciesNowItem[];
}
