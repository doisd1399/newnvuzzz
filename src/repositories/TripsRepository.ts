import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  addDoc
} from "firebase/firestore";
import { db } from "../lib/firebase";

export class TripsRepository {
  static listenCompanyTrips(companyId: string, onNext: (trips: any[]) => void, onError?: (err: any) => void) {
    if (!companyId) {
      onNext([]);
      return () => {};
    }
    const q = query(
      collection(db, "historico_viagens"),
      where("empresaId", "==", companyId)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        onNext(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        if (onError) onError(error);
      }
    );
  }

  static listenAllTrips(onNext: (trips: any[]) => void, onError?: (err: any) => void) {
    const q = query(collection(db, "historico_viagens"));
    return onSnapshot(
      q,
      (snapshot) => {
        onNext(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        if (onError) onError(error);
      }
    );
  }

  static async getCompanyTrips(companyId: string) {
    if (!companyId) return [];
    const q = query(
      collection(db, "historico_viagens"),
      where("empresaId", "==", companyId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  static async addTrip(data: any) {
    return await addDoc(collection(db, "historico_viagens"), data);
  }

  static async updateTrip(tripId: string, data: any) {
    return await updateDoc(doc(db, "historico_viagens", tripId), data);
  }

  static async deleteTrip(tripId: string) {
    return await deleteDoc(doc(db, "historico_viagens", tripId));
  }

  static async runBackfill(activeCompanyId: string) {
    if (!activeCompanyId) return;
    try {
      const qTrips = query(
        collection(db, "historico_viagens"),
        where("empresaId", "==", activeCompanyId),
      );
      const tripsSnap = await getDocs(qTrips);

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
    } catch (error) {
      console.error("Backfill failed:", error);
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
