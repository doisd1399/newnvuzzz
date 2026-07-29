import { useEffect, useMemo, useRef } from "react";
import {
  useOperationalStore,
  useRankingFilterStore,
  useSessionStore,
} from "../../context/AppContext";
import { auth } from "../../lib/firebase";
import { getCustomRange, getEndOfDay, getMonthlyRange, getStartOfDay, getWeeklyRange } from "../../lib/metricsEngine";
import { preloadRoute } from "../../lib/routePreload";
import { useLiveCalendarReference } from "../../hooks/useLiveCalendarReference";
import { useTripsRealtime } from "../../hooks/useTripsRealtime";
import { useRankingUsersRealtime } from "../../hooks/useRankingUsersRealtime";
import {
  beginRankingWarmupSession,
  markRankingWarmupSourcesReady,
  registerRankingPhotoUrls,
  resolveRankingUserPhoto,
  warmRankingUserProfiles,
} from "../../lib/rankingPhotoWarmup";

/**
 * Keeps the Ranking's data and avatars warm while the user is still on the
 * workspace home. The component renders nothing; it exists so the first
 * Ranking click does not start Firestore/image work from inside the route.
 */
export default function RankingStartupWarmup() {
  const {
    authInitialized,
    sessionReady,
    currentUser,
    allCompanies,
    companiesLoading,
  } = useSessionStore();
  const { users: knownUsers } = useOperationalStore();
  const {
    globalPeriodPreset: periodPreset,
    globalStartDateStr: startDateStr,
    globalEndDateStr: endDateStr,
  } = useRankingFilterStore();
  const referenceDate = useLiveCalendarReference();
  const uid = currentUser?.id || "";
  const authenticatedForUid =
    Boolean(uid) && auth.currentUser?.uid === uid;
  const enabled =
    authInitialized &&
    sessionReady &&
    authenticatedForUid;

  const rankingRange = useMemo(() => {
    if (periodPreset === "semana") return getWeeklyRange(referenceDate);
    if (periodPreset === "mes") return getMonthlyRange(referenceDate);
    if (startDateStr && endDateStr) {
      return getCustomRange(startDateStr, endDateStr);
    }
    if (startDateStr || endDateStr) {
      const fallback = getMonthlyRange(referenceDate);
      return {
        start: startDateStr
          ? getStartOfDay(startDateStr)
          : fallback.start,
        end: endDateStr ? getEndOfDay(endDateStr) : fallback.end,
      };
    }
    return getMonthlyRange(referenceDate);
  }, [endDateStr, periodPreset, referenceDate, startDateStr]);

  const { trips, loading: tripsLoading, refreshing: tripsRefreshing } =
    useTripsRealtime({
      startDate: rankingRange.start,
      endDate: rankingRange.end,
      enabled,
      keepPreviousData: true,
    });

  // The startup listener deliberately uses all simulators. A simulator
  // selection is a client-side filter on the same bounded trip range, so this
  // single participant set covers Entre empresas, Interno and Global. Keep the
  // ID set identical to the global page's canonical participant query; that
  // lets the visible hook reuse the already-hydrated shared entry.
  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    trips.forEach((trip: any) => {
      if (!trip?.isValid) return;
      const driverId = trip.motoristaId || trip.driverId;
      if (driverId) ids.add(String(driverId));
    });
    return Array.from(ids).sort();
  }, [trips]);

  const {
    users: rankingUsers,
    loading: rankingUsersLoading,
    refreshing: rankingUsersRefreshing,
  } = useRankingUsersRealtime(participantIds, enabled);

  // Start the route chunk and the account-scoped readiness barrier as soon as
  // authentication is confirmed. This is intentionally not idle-scheduled.
  useEffect(() => {
    if (!enabled || !uid) return;
    beginRankingWarmupSession(uid);
    void preloadRoute("/ranking").catch(() => undefined);
  }, [enabled, uid]);

  const photoUrls = useMemo(() => {
    const urls = new Set<string>();
    const add = (value: unknown) => {
      if (typeof value !== "string") return;
      const normalized = value.trim();
      if (normalized) urls.add(normalized);
    };

    allCompanies.forEach((company: any) => {
      add(company.logoUrl);
      add(company.logoURL);
      add(company.companyLogoURL);
      add(company.logo);
    });
    [...knownUsers, ...rankingUsers].forEach((user: any) =>
      add(resolveRankingUserPhoto(user)),
    );
    return Array.from(urls);
  }, [allCompanies, knownUsers, rankingUsers]);

  const photoSignature = photoUrls.join("|");
  const registeredPhotoSignatureRef = useRef("");
  useEffect(() => {
    if (!enabled || !uid || !photoSignature) return;
    if (registeredPhotoSignatureRef.current === photoSignature) return;
    registeredPhotoSignatureRef.current = photoSignature;

    // Register the mapping before the request starts so the route itself can
    // reuse it if the user taps while the final batch is still settling.
    void warmRankingUserProfiles([...knownUsers, ...rankingUsers], 12);
    void registerRankingPhotoUrls(uid, photoUrls, 12);
  }, [
    enabled,
    knownUsers,
    photoSignature,
    photoUrls,
    rankingUsers,
    uid,
  ]);

  const sourceReady =
    enabled &&
    !companiesLoading &&
    !tripsLoading &&
    !tripsRefreshing &&
    (!participantIds.length ||
      (!rankingUsersLoading && !rankingUsersRefreshing));

  useEffect(() => {
    if (!sourceReady || !uid) return;
    markRankingWarmupSourcesReady(uid);
  }, [sourceReady, uid]);

  return null;
}
