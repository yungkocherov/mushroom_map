import { create } from "zustand";

export type LocationFix = {
  lat: number;
  lon: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
};

export type LocationPermissionState =
  | "unknown"
  | "granted"
  | "denied"
  | "undetermined";

type UserLocationState = {
  fix: LocationFix | null;
  permission: LocationPermissionState;
  isWatching: boolean;
  followMode: boolean;
  error: string | null;

  setFix: (fix: LocationFix) => void;
  setPermission: (p: LocationPermissionState) => void;
  setWatching: (w: boolean) => void;
  setFollowMode: (f: boolean) => void;
  setError: (e: string | null) => void;
};

export const useUserLocation = create<UserLocationState>((set) => ({
  fix: null,
  permission: "unknown",
  isWatching: false,
  followMode: true,
  error: null,

  setFix: (fix) => set({ fix }),
  setPermission: (permission) => set({ permission }),
  setWatching: (isWatching) => set({ isWatching }),
  setFollowMode: (followMode) => set({ followMode }),
  setError: (error) => set({ error }),
}));
