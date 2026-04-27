/**
 * useForecastDistricts — shared hook around `/api/forecast/districts`.
 *
 * Both SidebarOverview (для топ-5) и forecastChoroplethLayer (через
 * MapView wiring) одно и то же дёргают; кэшируем по date+region в
 * простом in-memory map'е, чтобы при смене даты тудой-сюда не было
 * лишних запросов.
 *
 * Шейп `ForecastDistrictRow` живёт в `forecastChoropleth.ts` —
 * это первичное место «вот что приходит из API»; reuse оттуда.
 */
import { useEffect, useState } from "react";

import { API_ORIGIN } from "../components/mapView/utils/api";
import type { ForecastDistrictRow } from "../components/mapView/layers/forecastChoropleth";

const CACHE = new Map<string, Promise<ForecastDistrictRow[]>>();

function fetchForecastDistricts(
  date: string,
  region: string,
): Promise<ForecastDistrictRow[]> {
  const key = `${region}|${date}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const url = `${API_ORIGIN}/api/forecast/districts?date=${encodeURIComponent(
    date,
  )}&region=${encodeURIComponent(region)}`;
  const p = fetch(url, { credentials: "omit" }).then(async (r) => {
    if (!r.ok) {
      CACHE.delete(key);
      throw new Error(`forecast/districts: ${r.status}`);
    }
    return (await r.json()) as ForecastDistrictRow[];
  });
  CACHE.set(key, p);
  return p;
}

export interface UseForecastDistrictsResult {
  rows: ForecastDistrictRow[] | null;
  error: string | null;
  loading: boolean;
}

export function useForecastDistricts(
  date: string,
  region = "lenoblast",
): UseForecastDistrictsResult {
  const [rows, setRows] = useState<ForecastDistrictRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    fetchForecastDistricts(date, region)
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message ?? e));
        setRows([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, region]);

  return { rows, error, loading };
}
