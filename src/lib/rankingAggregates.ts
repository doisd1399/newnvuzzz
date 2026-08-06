import type { RankingPageDriverItem } from "./rankingPageEngine";

export const RANKING_AGGREGATES_COLLECTION = "ranking_aggregates";
export const RANKING_AGGREGATE_SCHEMA_VERSION = 1;
export const RANKING_AGGREGATE_RECONCILE_AFTER_MS = 24 * 60 * 60 * 1000;

export type RankingAggregatePeriodType = "semana" | "mes";

export interface RankingAggregateCompanyStat {
  trips: number;
  val: number;
  name?: string;
}

export interface RankingAggregateDriverStat {
  trips: number;
  val: number;
  companyId?: string;
  name?: string;
}

export interface RankingAggregateDocument {
  schemaVersion: number;
  simulatorId: string;
  periodType: RankingAggregatePeriodType;
  periodKey: string;
  complete: boolean;
  sourceTripCount: number;
  companies: Record<string, RankingAggregateCompanyStat>;
  drivers: Record<string, RankingAggregateDriverStat>;
  generatedAt?: unknown;
  updatedAt?: unknown;
  lastReconciledAt?: unknown;
}

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const zonedDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SAO_PAULO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function readZonedDateParts(date: Date) {
  const values: Record<string, string> = {};
  zonedDateFormatter.formatToParts(date).forEach((part) => {
    if (part.type !== "literal") values[part.type] = part.value;
  });

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatUtcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function buildRankingAggregatePeriodKey(
  periodType: RankingAggregatePeriodType,
  referenceDate = new Date(),
) {
  const parts = readZonedDateParts(referenceDate);
  if (periodType === "mes") {
    return `mes_${parts.year}-${pad(parts.month)}`;
  }

  const localCalendarDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
  localCalendarDate.setUTCDate(
    localCalendarDate.getUTCDate() - localCalendarDate.getUTCDay(),
  );
  return `semana_${formatUtcDateKey(localCalendarDate)}`;
}

export function buildRankingAggregateDocumentId(
  simulatorId: string,
  periodKey: string,
) {
  return `v${RANKING_AGGREGATE_SCHEMA_VERSION}__${encodeURIComponent(
    simulatorId.trim(),
  )}__${periodKey}`
    .replace(/[^a-zA-Z0-9%_.~-]/g, "_")
    .slice(0, 1400);
}

function asFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCompanyStats(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, RankingAggregateCompanyStat>;
  }

  const result: Record<string, RankingAggregateCompanyStat> = {};
  Object.entries(value as Record<string, unknown>).forEach(([id, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const record = raw as Record<string, unknown>;
    result[id] = {
      trips: Math.max(0, Math.trunc(asFiniteNumber(record.trips))),
      val: Math.max(0, asFiniteNumber(record.val)),
      name: asText(record.name) || undefined,
    };
  });
  return result;
}

function parseDriverStats(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, RankingAggregateDriverStat>;
  }

  const result: Record<string, RankingAggregateDriverStat> = {};
  Object.entries(value as Record<string, unknown>).forEach(([id, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const record = raw as Record<string, unknown>;
    result[id] = {
      trips: Math.max(0, Math.trunc(asFiniteNumber(record.trips))),
      val: Math.max(0, asFiniteNumber(record.val)),
      companyId: asText(record.companyId) || undefined,
      name: asText(record.name) || undefined,
    };
  });
  return result;
}

export function parseRankingAggregateDocument(
  value: Record<string, unknown> | undefined,
): RankingAggregateDocument | null {
  if (!value) return null;
  const schemaVersion = asFiniteNumber(value.schemaVersion);
  const simulatorId = asText(value.simulatorId);
  const periodType = asText(value.periodType);
  const periodKey = asText(value.periodKey);

  if (
    schemaVersion !== RANKING_AGGREGATE_SCHEMA_VERSION ||
    !simulatorId ||
    !periodKey ||
    (periodType !== "semana" && periodType !== "mes") ||
    value.complete !== true
  ) {
    return null;
  }

  return {
    schemaVersion,
    simulatorId,
    periodType,
    periodKey,
    complete: true,
    sourceTripCount: Math.max(0, Math.trunc(asFiniteNumber(value.sourceTripCount))),
    companies: parseCompanyStats(value.companies),
    drivers: parseDriverStats(value.drivers),
    generatedAt: value.generatedAt,
    updatedAt: value.updatedAt,
    lastReconciledAt: value.lastReconciledAt,
  };
}

export function rankingAggregateTimestampMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();

  const timestamp = value as {
    toDate?: () => Date;
    seconds?: unknown;
    _seconds?: unknown;
  };
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().getTime();
  }

  const seconds = Number(timestamp.seconds ?? timestamp._seconds);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

  const parsed = new Date(value as string | number).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function readEntityText(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function shortDriverName(value: unknown) {
  const parts = String(value || "Motorista Desconhecido")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.slice(0, 2).join(" ") || "Motorista Desconhecido";
}

export function buildCompanyRankingFromAggregate(
  aggregate: RankingAggregateDocument,
  companies: Record<string, unknown>[],
) {
  const companiesById = new Map(
    companies
      .map((company) => [readEntityText(company, "id"), company] as const)
      .filter(([id]) => Boolean(id)),
  );

  return Object.entries(aggregate.companies)
    .map(([id, stats]) => {
      const company = companiesById.get(id);
      // A hard-deleted company must not be recreated by an old aggregate.
      if (!company) return null;
      return {
        id,
        name:
          readEntityText(company, "companyName") ||
          readEntityText(company, "name") ||
          stats.name ||
          "Empresa Desconhecida",
        logo:
          readEntityText(company, "logoUrl") ||
          readEntityText(company, "logoURL") ||
          readEntityText(company, "companyLogoURL") ||
          readEntityText(company, "logo"),
        trips: stats.trips,
        val: stats.val,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => {
      if (b.val !== a.val) return b.val - a.val;
      return b.trips - a.trips;
    });
}

export function buildDriverRankingFromAggregate(
  aggregate: RankingAggregateDocument,
  users: Record<string, unknown>[],
  companies: Record<string, unknown>[],
): RankingPageDriverItem[] {
  const usersById = new Map(
    users
      .map((user) => [readEntityText(user, "id"), user] as const)
      .filter(([id]) => Boolean(id)),
  );
  const companiesById = new Map(
    companies
      .map((company) => [readEntityText(company, "id"), company] as const)
      .filter(([id]) => Boolean(id)),
  );

  return Object.entries(aggregate.drivers)
    .map(([id, stats]) => {
      const user = usersById.get(id);
      const company = stats.companyId
        ? companiesById.get(stats.companyId)
        : undefined;

      return {
        id,
        name: shortDriverName(readEntityText(user, "name") || stats.name),
        logo:
          readEntityText(user, "profilePhotoURL") ||
          readEntityText(user, "photoURL") ||
          readEntityText(user, "photoUrl") ||
          readEntityText(user, "avatar") ||
          readEntityText(user, "profileImage") ||
          readEntityText(user, "imageUrl") ||
          readEntityText(user, "photo"),
        trips: stats.trips,
        val: stats.val,
        companyId: stats.companyId,
        companyName:
          readEntityText(company, "companyName") ||
          readEntityText(company, "name"),
      };
    })
    .sort((a, b) => {
      if (b.val !== a.val) return b.val - a.val;
      return b.trips - a.trips;
    });
}
