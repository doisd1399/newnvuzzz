import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  addDoc
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { isAuthTeardownActive } from "../lib/authLifecycle";
import { normalizeTrip } from "../lib/tripNormalizer";

const backfillInFlight = new Map<string, Promise<void>>();
const backfillCompleted = new Set<string>();

export class TripsRepository {
  static listenCompanyTrips(companyId: string, onNext: (trips: any[]) => void, onError?: (err: any) => void) {
    if (!companyId) {
      onNext([]);
      return () => {};
    }

    // Current documents use `empresaId`, while older migrations can contain
    // `companyId` or `company_id`. Listen to all compatible variants and
    // deduplicate by document ID so history and ranking see the same company
    // universe.
    const fields = ["empresaId", "companyId", "company_id"] as const;
    const sourceMaps = new Map<string, Map<string, any>>();
    let active = true;
    let successfulSources = 0;
    let failedSources = 0;

    const emit = () => {
      if (!active || isAuthTeardownActive()) return;
      const merged = new Map<string, any>();
      for (const source of sourceMaps.values()) {
        for (const [id, trip] of source.entries()) merged.set(id, trip);
      }
      onNext(Array.from(merged.values()));
    };

    const unsubscribers = fields.map((field) => {
      const q = query(
        collection(db, "historico_viagens"),
        where(field, "==", companyId),
      );
      return onSnapshot(
        q,
        (snapshot) => {
          if (!active || isAuthTeardownActive()) return;
          successfulSources += 1;
          sourceMaps.set(
            field,
            new Map(
              snapshot.docs.map((d) => [d.id, { id: d.id, ...d.data() }]),
            ),
          );
          emit();
        },
        (error) => {
          if (!active || isAuthTeardownActive()) return;
          failedSources += 1;
          if (failedSources === fields.length && successfulSources === 0 && onError) {
            onError(error);
          }
        },
      );
    });

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // Cleanup is best-effort.
        }
      });
    };
  }

  static listenAllTrips(onNext: (trips: any[]) => void, onError?: (err: any) => void) {
    const q = query(collection(db, "historico_viagens"));
    return onSnapshot(
      q,
      (snapshot) => {
        onNext(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        if (!isAuthTeardownActive() && onError) onError(error);
      }
    );
  }

  static async getCompanyTrips(companyId: string) {
    if (!companyId) return [];
    const fields = ["empresaId", "companyId", "company_id"] as const;
    const snapshots = await Promise.all(
      fields.map((field) =>
        getDocs(
          query(
            collection(db, "historico_viagens"),
            where(field, "==", companyId),
          ),
        ),
      ),
    );
    const merged = new Map<string, any>();
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
    });
    return Array.from(merged.values());
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
      getDocs(
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
      const tripsSnap = await getDocs(qTrips);
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
        getDocs(
          query(
            collection(db, "vehicles"),
            where("companyId", "==", activeCompanyId),
          ),
        ),
        getDocs(
          query(
            collection(db, "contracts"),
            where("companyId", "==", activeCompanyId),
          ),
        ),
        getDocs(
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
