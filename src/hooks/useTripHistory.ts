import { useEffect, useState } from "react";
import { TripsRepository } from "../repositories/TripsRepository";
import {
  isAuthTeardownActive,
  onAuthTeardown,
} from "../lib/authLifecycle";

type TripHistoryState = {
  trips: any[];
  loading: boolean;
  error: any;
};

type TripHistoryCacheEntry = TripHistoryState & {
  listeners: Set<() => void>;
  unsubscribe: (() => void) | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryAttempt: number;
};

const CACHE_RELEASE_DELAY_MS = 120_000;
const RETRY_MAX_DELAY_MS = 30_000;
const tripHistoryCache = new Map<string, TripHistoryCacheEntry>();

const EMPTY_STATE: TripHistoryState = {
  trips: [],
  loading: false,
  error: null,
};

let teardownListenerAttached = false;

function ensureTeardownListener() {
  if (teardownListenerAttached || typeof window === "undefined") return;
  teardownListenerAttached = true;
  onAuthTeardown(() => {
    for (const entry of tripHistoryCache.values()) {
      if (entry.releaseTimer) clearTimeout(entry.releaseTimer);
      if (entry.retryTimer) clearTimeout(entry.retryTimer);
      entry.releaseTimer = null;
      entry.retryTimer = null;
      entry.retryAttempt = 0;
      try {
        entry.unsubscribe?.();
      } catch {
        // A listener cleanup must never abort the global logout signal.
      }
      entry.unsubscribe = null;
      entry.trips = [];
      entry.loading = false;
      entry.error = null;
      notify(entry);
      entry.listeners.clear();
    }
    tripHistoryCache.clear();
  });
}

function notify(entry: TripHistoryCacheEntry) {
  entry.listeners.forEach((listener) => listener());
}

function scheduleEntryRelease(companyId: string, entry: TripHistoryCacheEntry) {
  if (isAuthTeardownActive()) return;
  if (entry.releaseTimer) clearTimeout(entry.releaseTimer);

  entry.releaseTimer = setTimeout(() => {
    entry.releaseTimer = null;

    // A component may have mounted again while the release timer was pending.
    if (entry.listeners.size > 0) return;

    try {
      entry.unsubscribe?.();
    } catch {
      // Listener cleanup is best-effort.
    }
    entry.unsubscribe = null;
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
    entry.retryAttempt = 0;

    if (tripHistoryCache.get(companyId) === entry) {
      tripHistoryCache.delete(companyId);
    }
  }, CACHE_RELEASE_DELAY_MS);
}

function subscribeEntry(companyId: string, entry: TripHistoryCacheEntry) {
  if (isAuthTeardownActive()) return;

  try {
    entry.unsubscribe = TripsRepository.listenCompanyTrips(
      companyId,
      (trips) => {
        if (isAuthTeardownActive()) return;
        entry.retryAttempt = 0;
        if (entry.retryTimer) clearTimeout(entry.retryTimer);
        entry.retryTimer = null;
        entry.trips = trips;
        entry.loading = false;
        entry.error = null;
        notify(entry);
      },
      (error) => {
        if (isAuthTeardownActive()) return;
        console.warn("Error fetching trip history:", error);
        entry.error = error;
        // Keep a previous complete dataset during a retry. The repository
        // never supplies a canonical-only subset.
        entry.loading = entry.trips.length === 0;
        notify(entry);

        if (entry.retryTimer) return;
        const delay = Math.min(
          RETRY_MAX_DELAY_MS,
          1_000 * 2 ** entry.retryAttempt,
        );
        entry.retryAttempt += 1;
        entry.retryTimer = setTimeout(() => {
          entry.retryTimer = null;
          if (
            isAuthTeardownActive() ||
            tripHistoryCache.get(companyId) !== entry
          )
            return;
          try {
            entry.unsubscribe?.();
          } catch {
            // Listener cleanup is best-effort before a retry.
          }
          entry.unsubscribe = null;
          entry.loading = entry.trips.length === 0;
          subscribeEntry(companyId, entry);
        }, delay);
      },
    );
  } catch (error) {
    if (isAuthTeardownActive()) return;
    console.warn("Error subscribing to trip history:", error);
    entry.error = error;
    entry.loading = entry.trips.length === 0;
    notify(entry);
  }
}

function ensureEntry(companyId: string): TripHistoryCacheEntry {
  ensureTeardownListener();
  const existingEntry = tripHistoryCache.get(companyId);
  if (existingEntry) {
    if (existingEntry.releaseTimer) {
      clearTimeout(existingEntry.releaseTimer);
      existingEntry.releaseTimer = null;
    }
    return existingEntry;
  }

  const entry: TripHistoryCacheEntry = {
    trips: [],
    loading: true,
    error: null,
    listeners: new Set(),
    unsubscribe: null,
    releaseTimer: null,
    retryTimer: null,
    retryAttempt: 0,
  };
  tripHistoryCache.set(companyId, entry);
  subscribeEntry(companyId, entry);

  return entry;
}

function getState(entry: TripHistoryCacheEntry): TripHistoryState {
  return {
    trips: entry.trips,
    loading: entry.loading,
    error: entry.error,
  };
}

function getInitialState(companyId: string | null | undefined): TripHistoryState {
  if (!companyId) return EMPTY_STATE;

  const cachedEntry = tripHistoryCache.get(companyId);
  return cachedEntry
    ? getState(cachedEntry)
    : { trips: [], loading: true, error: null };
}

type HookState = {
  companyId: string | null;
  value: TripHistoryState;
};

export function useTripHistory(
  companyId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  ensureTeardownListener();
  const enabled = options.enabled !== false;
  const normalizedCompanyId = enabled ? companyId ?? null : null;
  const [state, setState] = useState<HookState>(() => ({
    companyId: normalizedCompanyId,
    value: getInitialState(normalizedCompanyId),
  }));

  useEffect(() => {
    if (!enabled || !companyId || isAuthTeardownActive()) {
      setState({ companyId: null, value: EMPTY_STATE });
      return;
    }

    const entry = ensureEntry(companyId);
    const updateState = () =>
      setState({ companyId, value: getState(entry) });

    entry.listeners.add(updateState);
    updateState();

    return () => {
      entry.listeners.delete(updateState);
      if (entry.listeners.size === 0) {
        scheduleEntryRelease(companyId, entry);
      }
    };
  }, [companyId, enabled]);

  const visibleState = state.companyId === normalizedCompanyId
    ? state.value
    : getInitialState(companyId);

  return {
    historicoTrips: visibleState.trips,
    loading: visibleState.loading,
    error: visibleState.error,
  };
}
