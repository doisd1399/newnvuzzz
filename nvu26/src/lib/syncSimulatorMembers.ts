import { resolveSimulatorId } from "./resolveSimulator";
import { collection, doc, writeBatch, getDocs, query, where, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { CompanyMember, CompanyProfile } from "../context/AppContext";
import { isAuthTeardownActive } from "./authLifecycle";

export async function syncSingleSimulatorMember(
  userId: string,
  companyId: string,
  status: string,
  roles: string[],
  simulatorIdOverride?: string
) {
  try {
    if (!userId || !companyId || isAuthTeardownActive() || !auth.currentUser)
      return;

    const docId = `${userId}_${companyId}`; // Unique per user and company
    const docRef = doc(db, "simulator_members", docId);
    
    if (status === "deleted") {
      if (isAuthTeardownActive() || !auth.currentUser) return;
      await deleteDoc(docRef);
      return;
    }

    let simulatorId = simulatorIdOverride;
    if (!simulatorId) {
      const companyDoc = await getDoc(doc(db, "frotas", companyId));
      if (companyDoc.exists()) {
         simulatorId = resolveSimulatorId(companyDoc.data(), []) || "default";
      } else {
         simulatorId = "default";
      }
    }

    if (isAuthTeardownActive() || !auth.currentUser) return;

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
    if (!isAuthTeardownActive() && auth.currentUser) {
      console.warn("Error syncing simulator member:", error);
    }
  }
}

export async function removeSimulatorMember(userId: string, companyId: string) {
  try {
    if (!userId || !companyId || isAuthTeardownActive() || !auth.currentUser)
      return;
    const docId = `${userId}_${companyId}`;
    const docRef = doc(db, "simulator_members", docId);
    await deleteDoc(docRef);
  } catch (error) {
    if (!isAuthTeardownActive() && auth.currentUser) {
      console.warn("Error removing simulator member:", error);
    }
  }
}
