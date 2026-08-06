import { useLayoutEffect, useState } from "react";
import { TripsRepository } from "../repositories/TripsRepository";
import { getTripMetricDate } from "../lib/tripNormalizer";
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
const PERSISTED_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const PERSISTED_TRIP_LIMIT = 180;
const PERSISTED_CACHE_PREFIX = "nvu.instant.v1.driver-trips.";
const cache = new Map<string, DriverTripsEntry>();
let teardownAttached = false;

const EMPTY_STATE: DriverTripsState = {
  trips: [],
  loading: false,
  error: null,
};

const persistedCacheKey = (driverId: string) =>
  `${PERSISTED_CACHE_PREFIX}${encodeURIComponent(driverId)}`;

const stripHeavyTripFields = (trip: any) => {
  const compact: Record<string, unknown> = {};
  Object.entries(trip || {}).forEach(([key, value]) => {
    if (typeof value === "string" && value.length > 40_000) return;
    compact[key] = value;
  });
  return compact;
};

const readPersistedTrips = (driverId: string): any[] => {
  try {
    const raw = sessionStorage.getItem(persistedCacheKey(driverId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { trips?: any[]; cachedAt?: number };
    if (
      !Array.isArray(parsed.trips) ||
      typeof parsed.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt > PERSISTED_CACHE_MAX_AGE_MS
    ) {
      sessionStorage.removeItem(persistedCacheKey(driverId));
      return [];
    }
    return parsed.trips;
  } catch {
    return [];
  }
};

const writePersistedTrips = (driverId: string, trips: any[]) => {
  try {
    const compactTrips = [...trips]
      .sort(
        (a, b) =>
          getTripMetricDate(b).getTime() - getTripMetricDate(a).getTime(),
      )
      .slice(0, PERSISTED_TRIP_LIMIT)
      .map(stripHeavyTripFields);
    sessionStorage.setItem(
      persistedCacheKey(driverId),
      JSON.stringify({ trips: compactTrips, cachedAt: Date.now() }),
    );
  } catch {
    // Persistent cache is only an acceleration layer.
  }
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
    trips: readPersistedTrips(driverId),
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
      writePersistedTrips(driverId, trips);
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
    if (existing) return snapshot(existing);
    return {
      trips: readPersistedTrips(normalizedId),
      loading: true,
      error: null,
    };
  });

  useLayoutEffect(() => {
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
