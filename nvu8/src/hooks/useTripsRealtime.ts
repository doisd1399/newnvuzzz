import { useEffect, useState } from "react";
import { normalizeTrip, NormalizedTrip } from "../lib/tripNormalizer";
import { TripsRepository } from "../repositories/TripsRepository";

type TripsRealtimeState = {
  trips: NormalizedTrip[];
  loading: boolean;
};

const LISTENER_RELEASE_DELAY_MS = 30_000;
const subscribers = new Set<() => void>();

let cachedState: TripsRealtimeState = {
  trips: [],
  loading: true,
};
let hasLoadedOnce = false;
let unsubscribe: (() => void) | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;

function getSnapshot(): TripsRealtimeState {
  return {
    trips: cachedState.trips,
    loading: cachedState.loading,
  };
}

function notifySubscribers() {
  subscribers.forEach((subscriber) => subscriber());
}

function ensureSubscription() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (unsubscribe) return;

  if (!hasLoadedOnce) {
    cachedState = { ...cachedState, loading: true };
  }

  unsubscribe = TripsRepository.listenAllTrips(
    (trips) => {
      retryAttempt = 0;
      cachedState = {
        trips: trips.map(normalizeTrip),
        loading: false,
      };
      hasLoadedOnce = true;
      notifySubscribers();
    },
    (error) => {
      console.error("Error fetching trips:", error);

      // Firestore closes a listener after an error. The previous code kept the
      // unsubscribe handle set, so the global ranking listener never opened
      // again and the UI silently reused company-only trips for both scopes.
      unsubscribe?.();
      unsubscribe = null;
      cachedState = { ...cachedState, loading: true };
      notifySubscribers();

      if (subscribers.size > 0 && !retryTimer) {
        const delay = Math.min(30_000, 1_500 * 2 ** retryAttempt);
        retryAttempt += 1;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (subscribers.size > 0) ensureSubscription();
        }, delay);
      }
    },
  );
}

function scheduleSubscriptionRelease() {
  if (releaseTimer) clearTimeout(releaseTimer);

  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    if (subscribers.size > 0) return;

    unsubscribe?.();
    unsubscribe = null;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryAttempt = 0;
  }, LISTENER_RELEASE_DELAY_MS);
}

export function useTripsRealtime() {
  const [state, setState] = useState<TripsRealtimeState>(() => getSnapshot());

  useEffect(() => {
    const updateState = () => setState(getSnapshot());
    subscribers.add(updateState);

    // Register the consumer before opening the listener. If Firestore rejects
    // immediately, the retry path can now see an active subscriber and recover.
    ensureSubscription();
    updateState();

    return () => {
      subscribers.delete(updateState);
      if (subscribers.size === 0) {
        scheduleSubscriptionRelease();
      }
    };
  }, []);

  return state;
}
