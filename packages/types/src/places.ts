/**
 * Nominatim (external OSM service) place-search result.
 * Not one of our API shapes — lives here only because it's consumed
 * by the same api-client entrypoints.
 */

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
}
