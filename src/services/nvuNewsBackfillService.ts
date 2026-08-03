import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

export type NvuNewsBackfillResult = {
  success: boolean;
  status: "completed" | "already_completed" | "in_progress";
  created: number;
  updated: number;
  ignored: number;
  migratedCommunications: number;
  sourceTrips: number;
  generationKey: string;
  historyVersion: string;
  removedLegacyClassifications: number;
};

let inFlight: Promise<NvuNewsBackfillResult> | null = null;
const HISTORY_VERSION = "nvu_news_full_history_individual_v3";
const STORAGE_KEY = `nvu_news_history_checked_${HISTORY_VERSION}`;

async function invokeBackfill(): Promise<NvuNewsBackfillResult> {
  const callable = httpsCallable<Record<string, never>, NvuNewsBackfillResult>(
    functions,
    "generateNvuNewsBackfill",
  );
  const response = await callable({});
  return response.data;
}

export async function ensureNvuNewsBackfill(): Promise<NvuNewsBackfillResult> {
  if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "completed") {
    return {
      success: true,
      status: "already_completed",
      created: 0,
      updated: 0,
      ignored: 0,
      migratedCommunications: 0,
      sourceTrips: 0,
      generationKey: HISTORY_VERSION,
      historyVersion: HISTORY_VERSION,
      removedLegacyClassifications: 0,
    };
  }

  if (inFlight) return inFlight;

  inFlight = invokeBackfill()
    .then((result) => {
      if (
        typeof window !== "undefined" &&
        result.status !== "in_progress" &&
        result.historyVersion === HISTORY_VERSION
      ) {
        localStorage.setItem(STORAGE_KEY, "completed");
      }
      return result;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
