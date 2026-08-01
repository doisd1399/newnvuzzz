import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

export type NvuNewsBackfillResult = {
  success: boolean;
  status: "completed" | "already_completed" | "in_progress";
  created: number;
  updated: number;
  ignored: number;
  recordCreated: number;
  recordUpdated: number;
  recordIgnored: number;
  archived: number;
  sourceTrips: number;
  generationKey: string;
};

let inFlight: Promise<NvuNewsBackfillResult> | null = null;
const STORAGE_KEY = "nvu_news_automation_checked_v5";
const NEWS_TIME_ZONE = "America/Sao_Paulo";

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NEWS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function invokeBackfill(): Promise<NvuNewsBackfillResult> {
  const callable = httpsCallable<Record<string, never>, NvuNewsBackfillResult>(
    functions,
    "generateNvuNewsBackfill",
  );
  const response = await callable({});
  return response.data;
}

export async function ensureNvuNewsBackfill(): Promise<NvuNewsBackfillResult> {
  const currentDay = todayKey();
  if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === currentDay) {
    return {
      success: true,
      status: "already_completed",
      created: 0,
      updated: 0,
      ignored: 0,
      recordCreated: 0,
      recordUpdated: 0,
      recordIgnored: 0,
      archived: 0,
      sourceTrips: 0,
      generationKey: currentDay,
    };
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    let result = await invokeBackfill();

    for (let attempt = 0; result.status === "in_progress" && attempt < 3; attempt += 1) {
      await wait(1200);
      result = await invokeBackfill();
    }

    if (typeof window !== "undefined" && result.status !== "in_progress") {
      localStorage.setItem(STORAGE_KEY, currentDay);
    }
    return result;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
