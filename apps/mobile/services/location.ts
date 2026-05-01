import * as Location from "expo-location";
import { useUserLocation, type LocationPermissionState } from "../stores/useUserLocation";

let watcher: Location.LocationSubscription | null = null;

function mapPermissionStatus(
  status: Location.PermissionStatus,
): LocationPermissionState {
  switch (status) {
    case Location.PermissionStatus.GRANTED:
      return "granted";
    case Location.PermissionStatus.DENIED:
      return "denied";
    case Location.PermissionStatus.UNDETERMINED:
      return "undetermined";
    default:
      return "unknown";
  }
}

export async function requestLocationPermission(): Promise<LocationPermissionState> {
  const store = useUserLocation.getState();
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const mapped = mapPermissionStatus(status);
    store.setPermission(mapped);
    if (mapped !== "granted") {
      store.setError("Location permission denied");
    }
    return mapped;
  } catch (err) {
    store.setError(err instanceof Error ? err.message : "permission-error");
    store.setPermission("unknown");
    return "unknown";
  }
}

/**
 * Starts foreground GPS watch. Pushes fixes into the zustand store
 * every ~10 m of movement or 2 s, whichever happens first. Caller is
 * responsible for calling stopLocationWatch on unmount.
 */
export async function startLocationWatch(): Promise<void> {
  const store = useUserLocation.getState();
  if (watcher) return;

  let permission = store.permission;
  if (permission !== "granted") {
    permission = await requestLocationPermission();
    if (permission !== "granted") return;
  }

  store.setError(null);

  try {
    watcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2000,
        distanceInterval: 10,
      },
      (loc) => {
        useUserLocation.getState().setFix({
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? null,
          heading: loc.coords.heading ?? null,
          speed: loc.coords.speed ?? null,
          timestamp: loc.timestamp,
        });
      },
    );
    store.setWatching(true);
  } catch (err) {
    store.setError(err instanceof Error ? err.message : "watch-error");
    store.setWatching(false);
  }
}

export function stopLocationWatch(): void {
  if (watcher) {
    watcher.remove();
    watcher = null;
  }
  useUserLocation.getState().setWatching(false);
}
