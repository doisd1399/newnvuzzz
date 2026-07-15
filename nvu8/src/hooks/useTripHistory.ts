import { useEffect, useState } from "react";
import { TripsRepository } from "../repositories/TripsRepository";

type TripHistoryState = {
  trips: any[];
  loading: boolean;
  error: any;
};

type TripHistoryCacheEntry = TripHistoryState & {
  listeners: Set<() => void>;
  unsubscribe: (() => void) | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
};

const CACHE_RELEASE_DELAY_MS = 30_000;
const tripHistoryCache = new Map<string, TripHistoryCacheEntry>();

const EMPTY_STATE: TripHistoryState = {
  trips: [],
  loading: false,
  error: null,
};

function notify(entry: TripHistoryCacheEntry) {
  entry.listeners.forEach((listener) => listener());
}

function scheduleEntryRelease(companyId: string, entry: TripHistoryCacheEntry) {
  if (entry.releaseTimer) clearTimeout(entry.releaseTimer);

  entry.releaseTimer = setTimeout(() => {
    entry.releaseTimer = null;

    // A component may have mounted again while the release timer was pending.
    if (entry.listeners.size > 0) return;

    entry.unsubscribe?.();
    entry.unsubscribe = null;

    if (tripHistoryCache.get(companyId) === entry) {
      tripHistoryCache.delete(companyId);
    }
  }, CACHE_RELEASE_DELAY_MS);
}

function ensureEntry(companyId: string): TripHistoryCacheEntry {
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
  };
  tripHistoryCache.set(companyId, entry);

  try {
    entry.unsubscribe = TripsRepository.listenCompanyTrips(
      companyId,
      (trips) => {
        entry.trips = trips;
        entry.loading = false;
        entry.error = null;
        notify(entry);
      },
      (error) => {
        console.error("Error fetching trip history:", error);
        entry.error = error;
        entry.loading = false;
        notify(entry);
      },
    );
  } catch (error) {
    console.error("Error subscribing to trip history:", error);
    entry.error = error;
    entry.loading = false;
  }

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

export function useTripHistory(companyId: string | null | undefined) {
  const normalizedCompanyId = companyId ?? null;
  const [state, setState] = useState<HookState>(() => ({
    companyId: normalizedCompanyId,
    value: getInitialState(companyId),
  }));

  useEffect(() => {
    if (!companyId) {
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
  }, [companyId]);

  const visibleState = state.companyId === normalizedCompanyId
    ? state.value
    : getInitialState(companyId);

  return {
    historicoTrips: visibleState.trips,
    loading: visibleState.loading,
    error: visibleState.error,
  };
}
