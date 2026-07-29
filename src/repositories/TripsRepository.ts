import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  getDocsFromServer,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  Timestamp
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  isAuthTeardownActive,
  onAuthTeardown,
} from "../lib/authLifecycle";
import { normalizeTrip } from "../lib/tripNormalizer";
import {
  areTripSourcesReady,
  mergeTripSources,
} from "../lib/tripDataset";



type TripDocument = Record<string, any> & { id: string };

let legacyTripsCache: TripDocument[] | null = null;
let legacyTripsPromise: Promise<TripDocument[]> | null = null;
const companyLegacyTripsCache = new Map<string, TripDocument[]>();
const companyLegacyTripsPromises = new Map<string, Promise<TripDocument[]>>();
const driverLegacyTripsCache = new Map<string, TripDocument[]>();
const driverLegacyTripsPromises = new Map<string, Promise<TripDocument[]>>();
let compatibilityTeardownAttached = false;

const clearCompatibilityCaches = () => {
  legacyTripsCache = null;
  legacyTripsPromise = null;
  companyLegacyTripsCache.clear();
  companyLegacyTripsPromises.clear();
  driverLegacyTripsCache.clear();
  driverLegacyTripsPromises.clear();
};

const ensureCompatibilityTeardown = () => {
  if (compatibilityTeardownAttached || typeof window === "undefined") return;
  compatibilityTeardownAttached = true;
  onAuthTeardown(clearCompatibilityCaches);
};

const documentCache = new WeakMap<any, TripDocument>();
const mapSnapshotDocuments = (snapshot: any): TripDocument[] =>
  snapshot.docs.map((document: any) => {
    if (documentCache.has(document)) {
      return documentCache.get(document);
    }
    const data = { id: document.id, ...document.data() };
    documentCache.set(document, data);
    return data;
  });

/**
 * Firestore may deliver a locally cached snapshot before the server result.
 * The cached snapshot is useful for latency, but it is not a cross-device
 * source of truth: two Preview frames can have different local caches. Trip
 * totals therefore advance only on a server-confirmed, committed snapshot.
 */
const isAuthoritativeSnapshot = (snapshot: any) =>
  snapshot?.metadata?.fromCache !== true &&
  snapshot?.metadata?.hasPendingWrites !== true;

/**
 * Legacy documents can predate the canonical `completedAt` field. They are
 * loaded once per authenticated session, then merged into every bounded
 * realtime query. New writes always include `completedAt`, so the expensive
 * compatibility scan is never kept as a live collection-wide listener.
 *
 * This cache is intentionally memory-only. A browser/WebView must not persist
 * an "empty" result for several days: legacy documents can be added by a
 * different client at any time and every viewport must resolve the same
 * server-backed dataset.
 */
const loadLegacyTripsOnce = async (): Promise<TripDocument[]> => {
  ensureCompatibilityTeardown();
  if (legacyTripsCache) return legacyTripsCache;
  if (legacyTripsPromise) return legacyTripsPromise;

  legacyTripsPromise = getDocsFromServer(collection(db, "historico_viagens"))
    .then((snapshot) =>
      mapSnapshotDocuments(snapshot).filter((trip) => !trip.completedAt),
    )
    .then((trips) => {
      if (!isAuthTeardownActive()) {
        legacyTripsCache = trips;
      }
      return trips;
    })
    .finally(() => {
      legacyTripsPromise = null;
    });

  return legacyTripsPromise;
};

const loadCompanyLegacyTripsOnce = async (
  companyId: string,
): Promise<TripDocument[]> => {
  ensureCompatibilityTeardown();
  const cached = companyLegacyTripsCache.get(companyId);
  if (cached) return cached;

  if (legacyTripsCache) {
    const fromGlobalCache = legacyTripsCache.filter(
      (trip) =>
        (trip.empresaId || trip.companyId || trip.company_id) === companyId,
    );
    companyLegacyTripsCache.set(companyId, fromGlobalCache);
    return fromGlobalCache;
  }

  const inFlight = companyLegacyTripsPromises.get(companyId);
  if (inFlight) return inFlight;

  const fields = ["empresaId", "company_id"] as const;
  const promise = Promise.all(
    fields.map((field) =>
      getDocsFromServer(
        query(
          collection(db, "historico_viagens"),
          where(field, "==", companyId),
        ),
      ),
    ),
  )
    .then((snapshots) => {
      const merged = new Map<string, TripDocument>();
      snapshots.forEach((snapshot) => {
        mapSnapshotDocuments(snapshot).forEach((trip) => {
          // Canonical documents are already covered by the live companyId
          // listener. Keep only records that truly need a legacy alias.
          if (!trip.companyId) merged.set(trip.id, trip);
        });
      });
      return Array.from(merged.values());
    })
    .then((trips) => {
      if (!isAuthTeardownActive()) {
        companyLegacyTripsCache.set(companyId, trips);
      }
      return trips;
    })
    .finally(() => {
      companyLegacyTripsPromises.delete(companyId);
    });

  companyLegacyTripsPromises.set(companyId, promise);
  return promise;
};

const loadDriverLegacyTripsOnce = async (
  driverId: string,
): Promise<TripDocument[]> => {
  ensureCompatibilityTeardown();
  const cached = driverLegacyTripsCache.get(driverId);
  if (cached) return cached;

  if (legacyTripsCache) {
    const fromGlobalCache = legacyTripsCache.filter(
      (trip) => (trip.motoristaId || trip.driverId) === driverId,
    );
    driverLegacyTripsCache.set(driverId, fromGlobalCache);
    return fromGlobalCache;
  }

  const inFlight = driverLegacyTripsPromises.get(driverId);
  if (inFlight) return inFlight;

  const driverFields = ["motoristaId", "driverId"] as const;
  const promise = Promise.all(
    driverFields.map((field) =>
      getDocsFromServer(
        query(
          collection(db, "historico_viagens"),
          where(field, "==", driverId),
        ),
      ),
    ),
  )
    .then((snapshots) => {
      const merged = new Map<string, TripDocument>();
      snapshots.forEach((snapshot) => {
        mapSnapshotDocuments(snapshot).forEach((trip) => {
          // Canonical documents are already covered by the live driverId
          // listener. Keep only records that truly need the legacy alias.
          if (!trip.driverId) merged.set(trip.id, trip);
        });
      });
      return Array.from(merged.values());
    })
    .then((trips) => {
      if (!isAuthTeardownActive()) {
        driverLegacyTripsCache.set(driverId, trips);
      }
      return trips;
    })
    .finally(() => {
      driverLegacyTripsPromises.delete(driverId);
    });

  driverLegacyTripsPromises.set(driverId, promise);
  return promise;
};

const isTripInsideRange = (trip: TripDocument, startDate: Date, endDate: Date) => {
  const metricDate = normalizeTrip(trip as any).metricDate;
  return metricDate >= startDate && metricDate <= endDate;
};

const backfillInFlight = new Map<string, Promise<void>>();
const backfillCompleted = new Set<string>();

export class TripsRepository {
  static listenCompanyTrips(
    companyId: string,
    onNext: (trips: any[]) => void,
    onError?: (err: any) => void,
  ) {
    if (!companyId) {
      onNext([]);
      return () => {};
    }

    // New trip documents always write `companyId`. Keep one realtime listener
    // on that canonical field and resolve old empresaId/company_id aliases only
    // once per session. This removes two permanent duplicate listeners without
    // dropping historical records.
    let active = true;
    let canonicalReady = false;
    let legacyReady = false;
    let canonicalTrips: TripDocument[] = [];
    let legacyTrips: TripDocument[] = [];

    const emit = () => {
      if (
        !active ||
        isAuthTeardownActive() ||
        !areTripSourcesReady(canonicalReady, legacyReady)
      )
        return;

      // Publish one complete dataset only after both sources have resolved.
      // Never expose the canonical subset first: separate Preview frames can
      // otherwise capture different totals while the compatibility scan runs.
      onNext(mergeTripSources(canonicalTrips, legacyTrips));
    };

    void loadCompanyLegacyTripsOnce(companyId)
      .then((trips) => {
        if (!active || isAuthTeardownActive()) return;
        legacyTrips = trips;
        legacyReady = true;
        emit();
      })
      .catch((error) => {
        if (!active || isAuthTeardownActive()) return;
        console.warn("Falha ao carregar viagens legadas da empresa:", error);
        onError?.(error);
      });

    const unsubscribe = onSnapshot(
      query(
        collection(db, "historico_viagens"),
        where("companyId", "==", companyId),
      ),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (
          !active ||
          isAuthTeardownActive() ||
          !isAuthoritativeSnapshot(snapshot)
        )
          return;
        canonicalTrips = mapSnapshotDocuments(snapshot);
        canonicalReady = true;
        emit();
      },
      (error) => {
        if (!active || isAuthTeardownActive()) return;
        onError?.(error);
      },
    );

    return () => {
      active = false;
      try {
        unsubscribe();
      } catch {
        // Cleanup is best-effort.
      }
    };
  }

  static listenDriverTrips(
    driverId: string,
    onNext: (trips: any[]) => void,
    onError?: (err: any) => void,
  ) {
    if (!driverId) {
      onNext([]);
      return () => {};
    }

    let active = true;
    let canonicalReady = false;
    let legacyReady = false;
    let canonicalTrips: TripDocument[] = [];
    let legacyTrips: TripDocument[] = [];

    const emit = () => {
      if (
        !active ||
        isAuthTeardownActive() ||
        !areTripSourcesReady(canonicalReady, legacyReady)
      )
        return;
      onNext(mergeTripSources(canonicalTrips, legacyTrips));
    };

    void loadDriverLegacyTripsOnce(driverId)
      .then((trips) => {
        if (!active || isAuthTeardownActive()) return;
        legacyTrips = trips;
        legacyReady = true;
        emit();
      })
      .catch((error) => {
        if (!active || isAuthTeardownActive()) return;
        console.warn("Falha ao carregar viagens legadas do motorista:", error);
        onError?.(error);
      });

    const unsubscribe = onSnapshot(
      query(
        collection(db, "historico_viagens"),
        where("driverId", "==", driverId),
      ),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (
          !active ||
          isAuthTeardownActive() ||
          !isAuthoritativeSnapshot(snapshot)
        )
          return;
        canonicalTrips = mapSnapshotDocuments(snapshot);
        canonicalReady = true;
        emit();
      },
      (error) => {
        if (!active || isAuthTeardownActive()) return;
        onError?.(error);
      },
    );

    return () => {
      active = false;
      try {
        unsubscribe();
      } catch {
        // Cleanup is best-effort.
      }
    };
  }

  /**
   * Realtime source for ranking/performance screens. Only canonical trips in
   * the requested period remain live. Documents without completedAt are merged
   * from the shared compatibility cache so old history remains visible.
   *
   * This query uses only one range field and therefore relies on Firestore's
   * automatic single-field index; no composite index deployment is required.
   */
  static listenTripsByDateRange(
    startDate: Date,
    endDate: Date,
    onNext: (trips: any[]) => void,
    onError?: (err: any) => void,
  ) {
    const safeStart = Number.isNaN(startDate.getTime())
      ? new Date(0)
      : startDate;
    const safeEnd = Number.isNaN(endDate.getTime()) ? new Date() : endDate;

    let active = true;
    let canonicalReady = false;
    let legacyReady = false;
    let canonicalTrips: TripDocument[] = [];
    let legacyTrips: TripDocument[] = [];

    const emit = () => {
      if (
        !active ||
        isAuthTeardownActive() ||
        !areTripSourcesReady(canonicalReady, legacyReady)
      )
        return;

      // The range and compatibility sources form one logical dataset. The
      // callback is intentionally withheld until both server reads resolve.
      onNext(mergeTripSources(canonicalTrips, legacyTrips));
    };

    void loadLegacyTripsOnce()
      .then((trips) => {
        if (!active || isAuthTeardownActive()) return;
        legacyTrips = trips.filter((trip) =>
          isTripInsideRange(trip, safeStart, safeEnd),
        );
        legacyReady = true;
        emit();
      })
      .catch((error) => {
        if (!active || isAuthTeardownActive()) return;
        console.warn("Falha ao carregar compatibilidade de viagens:", error);
        onError?.(error);
      });

    const rangeQuery = query(
      collection(db, "historico_viagens"),
      where("completedAt", ">=", Timestamp.fromDate(safeStart)),
      where("completedAt", "<=", Timestamp.fromDate(safeEnd)),
    );

    const unsubscribe = onSnapshot(
      rangeQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (
          !active ||
          isAuthTeardownActive() ||
          !isAuthoritativeSnapshot(snapshot)
        )
          return;
        canonicalTrips = mapSnapshotDocuments(snapshot);
        canonicalReady = true;
        emit();
      },
      (error) => {
        if (!active || isAuthTeardownActive()) return;
        onError?.(error);
      },
    );

    return () => {
      active = false;
      try {
        unsubscribe();
      } catch {
        // Cleanup is best-effort.
      }
    };
  }


  static async getCompanyTrips(companyId: string) {
    if (!companyId) return [];

    const [canonicalSnapshot, legacyTrips] = await Promise.all([
      getDocsFromServer(
        query(
          collection(db, "historico_viagens"),
          where("companyId", "==", companyId),
        ),
      ),
      loadCompanyLegacyTripsOnce(companyId),
    ]);

    return mergeTripSources(mapSnapshotDocuments(canonicalSnapshot), legacyTrips);
  }

  static async addTrip(data: any) {
    return await addDoc(collection(db, "historico_viagens"), data);
  }

  static async updateTrip(tripId: string, data: any) {
    return await updateDoc(doc(db, "historico_viagens", tripId), data);
  }

  /**
   * Recalculates a job's progress from valid trip documents instead of
   * incrementing/decrementing a potentially stale counter.
   */
  static async syncJobProgress(jobId: string): Promise<number> {
    if (!jobId) return 0;

    const [jobSnapshot, tripsSnapshot] = await Promise.all([
      getDoc(doc(db, "trabalhos", jobId)),
      getDocsFromServer(
        query(
          collection(db, "historico_viagens"),
          where("jobId", "==", jobId),
        ),
      ),
    ]);

    const realProgress = tripsSnapshot.docs
      .map((tripDoc) =>
        normalizeTrip({ id: tripDoc.id, ...tripDoc.data() } as any),
      )
      .filter((trip) => trip.isValid).length;

    if (!jobSnapshot.exists()) return realProgress;

    const jobData = jobSnapshot.data();
    const updates: Record<string, any> = { progress: realProgress };
    const contractId = jobData.contractId;

    if (contractId) {
      const contractSnapshot = await getDoc(doc(db, "contratos", contractId));
      if (contractSnapshot.exists()) {
        const totalDeliveries = Number(
          contractSnapshot.data()?.totalDeliveries || 0,
        );
        const status = String(jobData.status || "");

        if (
          totalDeliveries > 0 &&
          realProgress >= totalDeliveries &&
          ["pending", "active", "delayed", "awaiting_completion"].includes(
            status,
          )
        ) {
          updates.status = "awaiting_completion";
        } else if (status === "awaiting_completion" && realProgress < totalDeliveries) {
          updates.status = "active";
        } else if (status === "pending" && realProgress > 0) {
          updates.status = "active";
        }
      }
    }

    await updateDoc(jobSnapshot.ref, updates);
    return realProgress;
  }

  static async deleteTrip(tripId: string) {
    return await deleteDoc(doc(db, "historico_viagens", tripId));
  }

  static async runBackfill(activeCompanyId: string) {
    // This is a one-time migration for legacy trip records. Share the same
    // promise between mounted screens and skip it after the company is done.
    if (
      !activeCompanyId ||
      isAuthTeardownActive() ||
      backfillCompleted.has(activeCompanyId)
    )
      return;

    const currentBackfill = backfillInFlight.get(activeCompanyId);
    if (currentBackfill) {
      await currentBackfill;
      return;
    }

    const backfillPromise = (async () => {
      if (isAuthTeardownActive()) return;
      const qTrips = query(
        collection(db, "historico_viagens"),
        where("empresaId", "==", activeCompanyId),
      );
      const tripsSnap = await getDocsFromServer(qTrips);
      if (isAuthTeardownActive()) return;

      let needsMigration = false;
      for (const docSnap of tripsSnap.docs) {
        const t = docSnap.data();
        if (
          !t.veiculoNome ||
          t.veiculoNome === "-" ||
          !t.contratoNumero ||
          t.contratoNumero === "-"
        ) {
          needsMigration = true;
          break;
        }
      }

      if (!needsMigration) return;

      const [vSnap, cSnap, tSnap] = await Promise.all([
        getDocsFromServer(
          query(
            collection(db, "vehicles"),
            where("companyId", "==", activeCompanyId),
          ),
        ),
        getDocsFromServer(
          query(
            collection(db, "contracts"),
            where("companyId", "==", activeCompanyId),
          ),
        ),
        getDocsFromServer(
          query(
            collection(db, "trailers"),
            where("companyId", "==", activeCompanyId),
          ),
        ),
      ]);
      if (isAuthTeardownActive()) return;

      const vMap = new Map(vSnap.docs.map((d) => [d.id, d.data()]));
      const cMap = new Map(cSnap.docs.map((d) => [d.id, d.data()]));
      const tMap = new Map(tSnap.docs.map((d) => [d.id, d.data()]));

      const updates = tripsSnap.docs.map(async (docSnap) => {
        const tData = docSnap.data();
        if (
          !tData.veiculoNome ||
          tData.veiculoNome === "-" ||
          !tData.contratoNumero ||
          tData.contratoNumero === "-"
        ) {
          const v = vMap.get(tData.veiculoId);
          const c = cMap.get(tData.contratoId);
          const t = tMap.get(tData.reboqueId);

          const veiculoNome = v
            ? `${v.name || ""}`.trim()
            : "Veículo não encontrado";
          const veiculoPlaca = v?.plate || "";
          const contratoNumero = c ? c.name : "Contrato não encontrado";
          const contratoDescricao = "";
          const reboqueNome = t
            ? `${t.name || ""}`.trim()
            : "Reboque não encontrado";

          if (isAuthTeardownActive()) return;
          await updateDoc(doc(db, "historico_viagens", docSnap.id), {
            veiculoNome,
            veiculoPlaca,
            contratoNumero,
            contratoDescricao,
            reboqueNome,
          });
        }
      });

      await Promise.all(updates);
    })()
      .then(() => {
        if (!isAuthTeardownActive()) {
          backfillCompleted.add(activeCompanyId);
        }
      })
      .catch((error) => {
        if (!isAuthTeardownActive()) {
          console.warn("Backfill failed:", error);
        }
      });

    backfillInFlight.set(activeCompanyId, backfillPromise);
    try {
      await backfillPromise;
    } finally {
      if (backfillInFlight.get(activeCompanyId) === backfillPromise) {
        backfillInFlight.delete(activeCompanyId);
      }
    }
  }

  static async checkImageHash(hash: string): Promise<boolean> {
    const q = query(
      collection(db, "historico_viagens"),
      where("imageHash", "==", hash)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  }
}
