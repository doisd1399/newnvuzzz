import { useEffect, useState } from "react";
import { TripsRepository } from "../repositories/TripsRepository";
import {
  isAuthTeardownActive,
  onAuthTeardown,
} from "../lib/authLifecycle";

type DriverTripsState = {
  trips: any[];
  loading: boolean;
  error: unknown | null;
};

type DriverTripsEntry = DriverTripsState & {
  driverId: string;
  subscribers: Set<() => void>;
  unsubscribe: (() => void) | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
};

const RELEASE_DELAY_MS = 120_000;
const cache = new Map<string, DriverTripsEntry>();
let teardownAttached = false;

const EMPTY_STATE: DriverTripsState = {
  trips: [],
  loading: false,
  error: null,
};

function notify(entry: DriverTripsEntry) {
  entry.subscribers.forEach((subscriber) => subscriber());
}

function ensureTeardown() {
  if (teardownAttached || typeof window === "undefined") return;
  teardownAttached = true;
  onAuthTeardown(() => {
    cache.forEach((entry) => {
      if (entry.releaseTimer) clearTimeout(entry.releaseTimer);
      try {
        entry.unsubscribe?.();
      } catch {
        // Cleanup is best-effort.
      }
      entry.subscribers.clear();
    });
    cache.clear();
  });
}

function ensureEntry(driverId: string) {
  ensureTeardown();
  const existing = cache.get(driverId);
  if (existing) {
    if (existing.releaseTimer) {
      clearTimeout(existing.releaseTimer);
      existing.releaseTimer = null;
    }
    return existing;
  }

  const entry: DriverTripsEntry = {
    driverId,
    trips: [],
    loading: true,
    error: null,
    subscribers: new Set(),
    unsubscribe: null,
    releaseTimer: null,
  };
  cache.set(driverId, entry);

  entry.unsubscribe = TripsRepository.listenDriverTrips(
    driverId,
    (trips) => {
      if (isAuthTeardownActive()) return;
      entry.trips = trips;
      entry.loading = false;
      entry.error = null;
      notify(entry);
    },
    (error) => {
      if (isAuthTeardownActive()) return;
      entry.loading = false;
      entry.error = error;
      notify(entry);
    },
  );

  return entry;
}

function snapshot(entry: DriverTripsEntry): DriverTripsState {
  return {
    trips: entry.trips,
    loading: entry.loading,
    error: entry.error,
  };
}

export function useDriverTrips(
  driverId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  ensureTeardown();
  const enabled = options.enabled !== false;
  const normalizedId = enabled ? String(driverId || "").trim() : "";
  const [state, setState] = useState<DriverTripsState>(() => {
    if (!normalizedId) return EMPTY_STATE;
    const existing = cache.get(normalizedId);
    return existing ? snapshot(existing) : { ...EMPTY_STATE, loading: true };
  });

  useEffect(() => {
    if (!normalizedId || isAuthTeardownActive()) {
      setState(EMPTY_STATE);
      return;
    }

    const entry = ensureEntry(normalizedId);
    const update = () => setState(snapshot(entry));
    entry.subscribers.add(update);
    update();

    return () => {
      entry.subscribers.delete(update);
      if (entry.subscribers.size > 0) return;
      entry.releaseTimer = setTimeout(() => {
        entry.releaseTimer = null;
        if (entry.subscribers.size > 0) return;
        try {
          entry.unsubscribe?.();
        } catch {
          // Cleanup is best-effort.
        }
        entry.unsubscribe = null;
        if (cache.get(normalizedId) === entry) cache.delete(normalizedId);
      }, RELEASE_DELAY_MS);
    };
  }, [normalizedId, enabled]);

  return state;
}
