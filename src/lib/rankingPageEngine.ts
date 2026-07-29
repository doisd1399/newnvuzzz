import { buildDriverRankingContext, RankingScope } from "./performanceEngine";
import { filterTripsBySimulator } from "./metricsEngine";
import type { NormalizedTrip } from "./tripNormalizer";

export interface RankingPageDriverItem {
  id: string;
  name: string;
  logo: string;
  trips: number;
  val: number;
  companyId?: string;
  companyName?: string;
}

export interface BuildDriverRankingPageDataParams {
  trips: NormalizedTrip[];
  startDate?: Date;
  endDate?: Date;
  scope: RankingScope;
  companyId?: string | null;
  simulatorId?: string;
  companies?: Record<string, unknown>[];
  simulators?: Record<string, unknown>[];
  users?: Record<string, unknown>[];
}

export interface BuildCanonicalDriverRankingContextParams
  extends BuildDriverRankingPageDataParams {
  driverId: string;
}

/**
 * Canonical context shared by the detailed ranking page and driver profile.
 * It applies the simulator filter once, then delegates ranking, position,
 * next competitor and financial gap to the same performance engine.
 */
export function buildCanonicalDriverRankingContext({
  trips,
  startDate,
  endDate,
  scope,
  companyId,
  simulatorId,
  companies = [],
  simulators = [],
  driverId,
}: BuildCanonicalDriverRankingContextParams) {
  if (scope === "internal" && !companyId) {
    return buildDriverRankingContext([], {
      scope,
      startDate: startDate || new Date(0),
      endDate: endDate || new Date(),
      driverId,
      companyId,
    });
  }

  const simulatorTrips = filterTripsBySimulator(trips, simulatorId, companies, simulators);
  return buildDriverRankingContext(simulatorTrips, {
    scope,
    startDate: startDate || new Date(0),
    endDate: endDate || new Date(),
    driverId,
    companyId,
  });
}

function shortDriverName(value: unknown): string {
  const name = String(value || "Motorista Desconhecido").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || "Motorista Desconhecido";
}

/**
 * Produces the driver list shown on the ranking page from the exact same
 * canonical engine used by DriverPerformanceCard. This prevents the profile
 * card and the detailed ranking from calculating different totals, positions
 * or participants for the same simulator and period.
 */
export function buildDriverRankingPageData({
  trips,
  startDate,
  endDate,
  scope,
  companyId,
  simulatorId,
  companies = [],
  simulators = [],
  users = [],
}: BuildDriverRankingPageDataParams): RankingPageDriverItem[] {
  if (scope === "internal" && !companyId) return [];

  const context = buildCanonicalDriverRankingContext({
    trips,
    startDate,
    endDate,
    scope,
    companyId,
    simulatorId,
    companies,
    simulators,
    // The ranking page needs the ordered population, not a specific driver's
    // position. A sentinel ID keeps the shared engine deterministic.
    driverId: "__ranking_page__",
  });

  const readText = (record: Record<string, unknown> | undefined, key: string) => {
    const value = record?.[key];
    return typeof value === "string" ? value : "";
  };

  const usersById = new Map(
    users
      .map((user) => [readText(user, "id"), user] as const)
      .filter(([id]) => Boolean(id)),
  );
  const companiesById = new Map(
    companies
      .map((company) => [readText(company, "id"), company] as const)
      .filter(([id]) => Boolean(id)),
  );

  return context.ranking.map((entry) => {
    const user = usersById.get(entry.id);
    const company = entry.companyId
      ? companiesById.get(entry.companyId)
      : undefined;

    return {
      id: entry.id,
      // The user document is the canonical identity after approval. Trip
      // snapshots intentionally keep their historical motoristaNome for
      // auditability, but must not overwrite a newer approved profile name.
      name: shortDriverName(readText(user, "name") || entry.name),
      logo:
        readText(user, "profilePhotoURL") ||
        readText(user, "photoURL") ||
        readText(user, "photoUrl") ||
        readText(user, "avatar") ||
        readText(user, "profileImage") ||
        readText(user, "imageUrl") ||
        readText(user, "photo"),
      trips: entry.trips,
      val: entry.earnings,
      companyId: entry.companyId,
      companyName:
        readText(company, "companyName") || readText(company, "name"),
    };
  });
}
