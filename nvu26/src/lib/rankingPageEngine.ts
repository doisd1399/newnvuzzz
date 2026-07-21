import { buildDriverRankingContext, RankingScope } from "./performanceEngine";
import { filterTripsBySimulator } from "./metricsEngine";

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
  trips: any[];
  startDate?: Date;
  endDate?: Date;
  scope: RankingScope;
  companyId?: string | null;
  simulator?: string;
  companies?: any[];
  users?: any[];
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
  simulator,
  companies = [],
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

  const simulatorTrips = filterTripsBySimulator(trips, simulator, companies);
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
  simulator,
  companies = [],
  users = [],
}: BuildDriverRankingPageDataParams): RankingPageDriverItem[] {
  if (scope === "internal" && !companyId) return [];

  const context = buildCanonicalDriverRankingContext({
    trips,
    startDate,
    endDate,
    scope,
    companyId,
    simulator,
    companies,
    // The ranking page needs the ordered population, not a specific driver's
    // position. A sentinel ID keeps the shared engine deterministic.
    driverId: "__ranking_page__",
  });

  return context.ranking.map((entry) => {
    const user = users.find((candidate) => candidate?.id === entry.id);
    const company = companies.find((candidate) => candidate?.id === entry.companyId);

    return {
      id: entry.id,
      name: shortDriverName(entry.name || user?.name),
      logo:
        user?.profilePhotoURL ||
        user?.photoURL ||
        user?.photoUrl ||
        user?.avatar ||
        user?.profileImage ||
        user?.imageUrl ||
        user?.photo ||
        "",
      trips: entry.trips,
      val: entry.earnings,
      companyId: entry.companyId,
      companyName: company?.companyName || company?.name || "",
    };
  });
}
