import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

export interface RepairApprovedMembershipResult {
  success: boolean;
  userId: string;
  companyId: string;
  applicationId: string;
}

export async function repairApprovedMembership(): Promise<RepairApprovedMembershipResult> {
  const callable = httpsCallable<Record<string, never>, RepairApprovedMembershipResult>(
    functions,
    "repairApprovedMembership",
  );
  const result = await callable({});
  return result.data;
}
