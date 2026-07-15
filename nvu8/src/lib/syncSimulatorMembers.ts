import { collection, doc, writeBatch, getDocs, query, where, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { CompanyMember, CompanyProfile } from "../context/AppContext";

export async function syncSingleSimulatorMember(
  userId: string,
  companyId: string,
  status: string,
  roles: string[],
  simulatorIdOverride?: string
) {
  try {
    if (!userId || !companyId) return;

    const docId = `${userId}_${companyId}`; // Unique per user and company
    const docRef = doc(db, "simulator_members", docId);
    
    if (status === "deleted") {
      await deleteDoc(docRef);
      return;
    }

    let simulatorId = simulatorIdOverride;
    if (!simulatorId) {
      const companyDoc = await getDoc(doc(db, "frotas", companyId));
      if (companyDoc.exists()) {
         simulatorId = companyDoc.data().simulatorName || "default";
      } else {
         simulatorId = "default";
      }
    }

    const role = roles.includes("driver") ? "driver" : (roles[0] || "driver");
    const isEligible = status === "active";

    await setDoc(docRef, {
      userId,
      companyId,
      simulatorId,
      status,
      role,
      isEligible
    }, { merge: true });
  } catch (error) {
    console.error("Error syncing simulator member:", error);
  }
}

export async function removeSimulatorMember(userId: string, companyId: string) {
  try {
    const docId = `${userId}_${companyId}`;
    const docRef = doc(db, "simulator_members", docId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error removing simulator member:", error);
  }
}
