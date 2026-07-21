import { calculateScopeAwareOperationalScores } from "./operationalRhythm";
import { getTripMetricDate, normalizeTrip, parseTripValue } from "./tripNormalizer";

export type RankingScope = "internal" | "global";

export interface DriverRankingQuery {
  scope: RankingScope;
  startDate: Date;
  endDate: Date;
  driverId: string;
  companyId?: string | null;
}

export interface DriverRankingEntry {
  id: string;
  name?: string;
  companyId?: string;
  trips: number;
  earnings: number;
}

export interface DriverRankingContextResult {
  scope: RankingScope;
  ranking: DriverRankingEntry[];
  position: number | null;
  totalParticipants: number;
  differenceToNext: number;
  nextCompetitor: DriverRankingEntry | null;
  current: DriverRankingEntry;
  entityTrips: any[];
  periodTrips: any[];
  ritmoOperacionalScore: number;
  viagensScore: number;
  ganhosScore: number;
  finalIndex: number;
}

function tripDate(trip: any): Date {
  return getTripMetricDate(trip);
}

function driverIdOf(trip: any): string | undefined {
  return trip?.motoristaId || trip?.driverId;
}

function companyIdOf(trip: any): string | undefined {
  return trip?.empresaId || trip?.companyId || trip?.company_id;
}

function driverNameOf(trip: any): string | undefined {
  const raw = trip?.motoristaNome || trip?.driverName || trip?.nomeMotorista;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function tripValue(trip: any): number {
  return typeof trip?.normalizedValor === "number"
    ? trip.normalizedValor
    : parseTripValue(trip?.valor);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function overallRankingScore(position: number | null, totalParticipants: number): number {
  if (!position || totalParticipants <= 0) return 0;
  if (totalParticipants === 1) return 100;
  return clampScore(((totalParticipants - position) / (totalParticipants - 1)) * 100);
}

/**
 * Single source of truth for the driver performance card.
 * The same scoped population feeds scores, ranking, KPIs and history.
 */
export function buildDriverRankingContext(
  trips: any[],
  query: DriverRankingQuery,
): DriverRankingContextResult {
  const start = query.startDate.getTime();
  const end = query.endDate.getTime();

  const periodTrips = trips
    .map((trip) =>
      typeof trip?.isValid === "boolean" && trip?.metricDate instanceof Date
        ? trip
        : normalizeTrip(trip),
    )
    .filter((trip) => {
      if (!trip.isValid) return false;
      const time = tripDate(trip).getTime();
      return Number.isFinite(time) && time >= start && time <= end;
    });

  // Aggregate each driver's totals once from the full simulator-period
  // dataset. The ranking scope only controls participant eligibility; it must
  // never change a driver's own trips or earnings for the same period.
  const canonicalStats = new Map<string, DriverRankingEntry>();
  for (const trip of periodTrips) {
    const id = driverIdOf(trip);
    if (!id) continue;
    const current = canonicalStats.get(id) || {
      id,
      name: driverNameOf(trip),
      companyId: companyIdOf(trip),
      trips: 0,
      earnings: 0,
    };
    if (!current.name) current.name = driverNameOf(trip);
    if (!current.companyId) current.companyId = companyIdOf(trip);
    current.trips += 1;
    current.earnings += tripValue(trip);
    canonicalStats.set(id, current);
  }

  const eligibleDriverIds = new Set<string>();
  if (query.scope === "global") {
    canonicalStats.forEach((_entry, id) => eligibleDriverIds.add(id));
  } else if (query.companyId) {
    for (const trip of periodTrips) {
      if (companyIdOf(trip) !== query.companyId) continue;
      const id = driverIdOf(trip);
      if (id) eligibleDriverIds.add(id);
    }
  }

  const ranking = Array.from(eligibleDriverIds)
    .map((id) => canonicalStats.get(id))
    .filter((entry): entry is DriverRankingEntry => Boolean(entry))
    .sort((a, b) => {
    if (b.earnings !== a.earnings) return b.earnings - a.earnings;
    return b.trips - a.trips;
  });

  const index = ranking.findIndex((entry) => entry.id === query.driverId);
  const current = canonicalStats.get(query.driverId) ||
    { id: query.driverId, companyId: query.companyId || undefined, trips: 0, earnings: 0 };
  const hasActivity = current.trips > 0;
  const position = hasActivity && index >= 0 ? index + 1 : null;
  const nextCompetitor = hasActivity && index > 0 ? ranking[index - 1] : null;
  const differenceToNext = nextCompetitor
    ? Math.max(0, nextCompetitor.earnings - current.earnings)
    : 0;

  const baseScores = calculateScopeAwareOperationalScores(
    { viagens: current.trips, ganhos: current.earnings },
    ranking.map((entry) => ({ viagens: entry.trips, ganhos: entry.earnings })),
  );

  // The selected universe must influence every displayed score, not only the
  // position card. Blend the metric comparison with the driver's overall
  // position in the selected ranking. This makes Interno/Global react to the
  // exact same population used by the ranking and classification history.
  const scopeRankScore = hasActivity
    ? overallRankingScore(position, ranking.length)
    : 0;
  const scores = {
    ritmoOperacionalScore: clampScore(
      baseScores.ritmoOperacionalScore * 0.5 + scopeRankScore * 0.5,
    ),
    viagensScore: clampScore(
      baseScores.viagensScore * 0.65 + scopeRankScore * 0.35,
    ),
    ganhosScore: clampScore(
      baseScores.ganhosScore * 0.65 + scopeRankScore * 0.35,
    ),
  };

  return {
    scope: query.scope,
    ranking,
    position,
    totalParticipants: Math.max(ranking.length, 1),
    differenceToNext,
    nextCompetitor,
    current,
    entityTrips: periodTrips.filter((trip) => driverIdOf(trip) === query.driverId),
    periodTrips,
    ...scores,
    finalIndex: Math.round(
      (scores.ritmoOperacionalScore + scores.viagensScore + scores.ganhosScore) / 3,
    ),
  };
}
