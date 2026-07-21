import { resolveSimulatorId } from "./resolveSimulator";
import { NormalizedTrip, normalizeTrip } from "./tripNormalizer";

export { normalizeTrip };

export function getTodayRange(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getWeeklyRange(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getMonthlyRange(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function normalizeDate(date: string | Date | number) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    return new Date(date.trim() + 'T00:00:00');
  }
  return new Date(date);
}

function normalizeSimulatorId(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase().replace(/\s+/g, "-");
}

function isAllSimulatorSelection(value: unknown) {
  const normalized = normalizeSimulatorId(value);
  return (
    !normalized ||
    normalized === "all" ||
    normalized === "todos-os-simuladores"
  );
}

export function getTripSimulatorId(trip: NormalizedTrip | any, companies: any[] = []) {
  const explicitId = trip?.simulatorId || trip?.simuladorId;
  if (explicitId) return String(explicitId);

  // Preserve the simulator snapshot stored on the trip before consulting the
  // company's current simulator. Otherwise old trips can move between
  // rankings when a company changes simulator later.
  const tripSimulatorName =
    trip?.simulatorName || trip?.simuladorNome || trip?.simulator;
  if (tripSimulatorName) return normalizeSimulatorId(tripSimulatorName);

  const tripCompanyId = trip?.empresaId || trip?.companyId || trip?.company_id;
  const company = companies.find((item) => item.id === tripCompanyId);

  return resolveSimulatorId(company, []);
}

export function filterTripsBySimulator(
  trips: NormalizedTrip[],
  simulator?: string,
  companies: any[] = [],
) {
  const targetSimulator = normalizeSimulatorId(simulator);
  if (isAllSimulatorSelection(targetSimulator)) {
    return trips;
  }

  return trips.filter(
    (trip) =>
      normalizeSimulatorId(getTripSimulatorId(trip, companies)) ===
      targetSimulator,
  );
}

export function getFilteredTrips(
  trips: NormalizedTrip[],
  startDate?: Date,
  endDate?: Date,
  empresaId?: string,
  simulator?: string,
  companies?: any[], // Needed for simulator filtering
  motorista?: string // Motorista name or ID filter
) {
  return trips.filter((trip) => {
    if (!trip.isValid) return false;

    const completed = normalizeDate(trip.metricDate || trip.completedAt);

    if (startDate && completed < startDate) return false;
    if (endDate && completed > endDate) return false;

    const tripCompanyId = trip.empresaId || (trip as any).companyId;
    if (empresaId && tripCompanyId !== empresaId) return false;

    if (!filterTripsBySimulator([trip], simulator, companies).length) {
      return false;
    }

    if (motorista && motorista !== "Todos os Motoristas" && motorista !== "all") {
       if (
         trip.motoristaNome?.toLowerCase() !== motorista.toLowerCase() &&
         trip.motoristaId !== motorista
       ) {
         return false;
       }
    }

    return true;
  });
}

export function calculateWeeklyMetrics(
  trips: NormalizedTrip[],
  startDate?: Date,
  endDate?: Date,
  empresaId?: string,
  simulator?: string,
  companies?: any[],
  motorista?: string
) {
  const filteredTrips = getFilteredTrips(trips, startDate, endDate, empresaId, simulator, companies, motorista);

  const tripsCount = filteredTrips.length;
  const totalRevenue = filteredTrips.reduce((acc, trip) => acc + trip.normalizedValor, 0);

  return {
    tripsCount,
    totalRevenue,
    filteredTrips,
  };
}

/**
 * Returns the drivers that must participate in a company ranking for a
 * period. The population is intentionally the union of:
 *   1. drivers who are active members now; and
 *   2. every driver with at least one valid trip in the selected period.
 *
 * This keeps a driver who left the company during the period in historical
 * weekly/monthly rankings, while still showing currently active drivers with
 * zero trips.
 */
export function getDriverIdsForPeriod(
  trips: NormalizedTrip[],
  startDate?: Date,
  endDate?: Date,
  empresaId?: string,
  currentMembers: any[] = [],
) {
  const driverIds = new Set<string>();

  currentMembers.forEach((member) => {
    const hasDriverRole =
      member?.roles?.includes?.("driver") || member?.role === "driver";
    if (
      member?.userId &&
      member?.status === "active" &&
      hasDriverRole &&
      (!empresaId || member.companyId === empresaId)
    ) {
      driverIds.add(member.userId);
    }
  });

  trips.forEach((trip) => {
    if (!trip.isValid) return;
    if (startDate && trip.metricDate < startDate) return;
    if (endDate && trip.metricDate > endDate) return;
    const tripCompanyId = trip.empresaId || (trip as any).companyId;
    if (empresaId && tripCompanyId !== empresaId) {
      return;
    }

    const driverId = trip.motoristaId || (trip as any).driverId;
    if (driverId) driverIds.add(driverId);
  });

  return driverIds;
}

/**
 * Returns the companies that must participate in a company ranking for a
 * period. The population is the union of:
 *   1. companies that currently exist in the companies source; and
 *   2. every company with at least one valid trip in the selected period.
 *
 * A company removed after operating during the period therefore remains in
 * that historical ranking, while current companies with zero trips remain in
 * the comparison population.
 */
export function getCompanyIdsForPeriod(
  trips: NormalizedTrip[],
  startDate?: Date,
  endDate?: Date,
  currentCompanies: any[] = [],
) {
  const companyIds = new Set<string>();

  currentCompanies.forEach((company) => {
    if (company?.id) companyIds.add(company.id);
  });

  trips.forEach((trip) => {
    if (!trip.isValid) return;
    if (startDate && trip.metricDate < startDate) return;
    if (endDate && trip.metricDate > endDate) return;

    const companyId = trip.empresaId || (trip as any).companyId;
    if (companyId) companyIds.add(companyId);
  });

  return companyIds;
}

export function groupMetricsByCompany(
  trips: NormalizedTrip[],
  startDate?: Date,
  endDate?: Date,
  simulator?: string,
  companies?: any[]
) {
  const filteredTrips = getFilteredTrips(trips, startDate, endDate, undefined, simulator, companies);
  const stats: Record<string, { id: string; name: string; logo: string; trips: number; val: number }> = {};

  const currentCompanies = (companies || []).filter(
    (company) =>
      isAllSimulatorSelection(simulator) ||
      normalizeSimulatorId(resolveSimulatorId(company)) ===
        normalizeSimulatorId(simulator),
  );

  getCompanyIdsForPeriod(filteredTrips, undefined, undefined, currentCompanies).forEach((companyId) => {
    const company = currentCompanies.find((item) => item.id === companyId) ||
      companies?.find((item) => item.id === companyId);
    stats[companyId] = {
      id: companyId,
      name: company?.companyName || company?.name || "Empresa Desconhecida",
      logo: company?.logoUrl || company?.logoURL || company?.logo || "",
      trips: 0,
      val: 0,
    };
  });
  
  filteredTrips.forEach((trip) => {
    const cId = trip.empresaId || (trip as any).companyId;
    if (!cId) return;
    
    if (!stats[cId]) {
      const comp = companies?.find(c => c.id === cId);
      stats[cId] = {
        id: cId,
        name: comp?.companyName || comp?.name || trip.empresaNome || "Empresa Desconhecida",
        logo: comp?.logoUrl || comp?.logoURL || comp?.logo || "",
        trips: 0,
        val: 0
      };
    }
    stats[cId].trips += 1;
    stats[cId].val += trip.normalizedValor;
  });

  return Object.values(stats).sort((a, b) => {
    if (b.val !== a.val) return b.val - a.val;
    return b.trips - a.trips;
  });
}

export function groupMetricsByDriver(
  trips: NormalizedTrip[],
  startDate?: Date,
  endDate?: Date,
  empresaId?: string,
  users?: any[],
  simulator?: string,
  companies?: any[],
  companyDrivers?: any[]
) {
  const filteredTrips = getFilteredTrips(trips, startDate, endDate, empresaId, simulator, companies);
  const stats: Record<string, { id: string; name: string; logo: string; trips: number; val: number }> = {};
  
  // Preload company drivers (Internal Ranking Dynamic)
  if (companyDrivers && companyDrivers.length > 0) {
    companyDrivers.forEach(m => {
      const hasDriverRole =
        m?.roles?.includes?.("driver") || m?.role === "driver";
      if (m.userId && m.status === "active" && hasDriverRole) {
        const user = users?.find(u => u.id === m.userId);
        let driverName = user?.name || "Motorista Desconhecido";
        if (driverName) {
          const parts = driverName.trim().split(" ");
          if (parts.length > 1) {
            driverName = `${parts[0]} ${parts[1]}`;
          } else {
            driverName = parts[0];
          }
        }
        stats[m.userId] = {
          id: m.userId,
          name: driverName,
          logo: user?.profilePhotoURL || "",
          trips: 0,
          val: 0
        };
      }
    });
  }

  filteredTrips.forEach((trip) => {
    const mId = trip.motoristaId || (trip as any).driverId;
    if (!mId) return;

    if (!stats[mId]) {
      const user = users?.find(u => u.id === mId);
      
      let driverName = trip.motoristaNome || user?.name || "Motorista Desconhecido";
      if (driverName) {
        const parts = driverName.trim().split(" ");
        if (parts.length > 1) {
          driverName = `${parts[0]} ${parts[1]}`;
        } else {
          driverName = parts[0];
        }
      }

      stats[mId] = {
        id: mId,
        name: driverName,
        logo: user?.profilePhotoURL || "",
        trips: 0,
        val: 0
      };
    }
    stats[mId].trips += 1;
    stats[mId].val += trip.normalizedValor;
  });

  return Object.values(stats).sort((a, b) => {
    if (b.val !== a.val) return b.val - a.val;
    return b.trips - a.trips;
  });
}

// Ensure time boundaries for day-level filtering
export function getStartOfDay(date: Date | string | number): Date {
  let d: Date;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    d = new Date(date.trim() + 'T00:00:00');
  } else {
    d = new Date(date);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function getEndOfDay(date: Date | string | number): Date {
  let d: Date;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    d = new Date(date.trim() + 'T00:00:00');
  } else {
    d = new Date(date);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function getCustomRange(start: Date | string, end: Date | string) {
  return {
    start: getStartOfDay(start),
    end: getEndOfDay(end),
  };
}
