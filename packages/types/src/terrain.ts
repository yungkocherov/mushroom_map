/**
 * /api/terrain/at — elevation / slope / aspect from Copernicus GLO-30
 * reprojected to UTM 36N.
 */

export interface TerrainAtResponse {
  lat: number;
  lon: number;
  elevation_m: number | null;
  slope_deg: number | null;
  aspect_deg: number | null;
  /** "N" / "NE" / "E" / ... / "NW" or null for flat terrain. */
  aspect_cardinal: string | null;
}
