import { useSyncExternalStore } from "react";
import type { StoreLocation } from "@/hooks/use-store";

const KEY = "store-location";
const listeners = new Set<() => void>();
let current: StoreLocation = "in_house";
let hydrated = false;

function read(): StoreLocation {
  if (typeof window === "undefined") return "in_house";
  if (!hydrated) {
    const saved = window.sessionStorage.getItem(KEY);
    if (saved === "warehouse" || saved === "in_house") current = saved;
    hydrated = true;
  }
  return current;
}

export function setStoreLocation(loc: StoreLocation) {
  current = loc;
  hydrated = true;
  if (typeof window !== "undefined") window.sessionStorage.setItem(KEY, loc);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Store-wide location selection, kept for the whole browser session. */
export function useStoreLocation(): [StoreLocation, (l: StoreLocation) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(),
    () => "in_house" as StoreLocation,
  );
  return [value, setStoreLocation];
}
