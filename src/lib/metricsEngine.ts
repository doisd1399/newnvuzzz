import { NormalizedTrip, normalizeTrip } from "./tripNormalizer";

export { normalizeTrip };

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
  return new Date(date);
}

export function getFilteredTrips(
  trips: NormalizedTrip[],
  startDate?: Date,
  endDate?: Date,
  empresaId?: string,
  simulator?: string,
  companies?: any[] // Needed for simulator filtering
) {
  return trips.filter((trip) => {
    if (!trip.isValid) return false;

    const completed = normalizeDate(trip.metricDate || trip.completedAt);

    if (startDate && completed < startDate) return false;
    if (endDate && completed > endDate) return false;

    if (empresaId && trip.empresaId !== empresaId) return false;

    if (simulator && simulator !== "Todos os simuladores" && companies) {
      const comp = companies.find((c) => c.id === trip.empresaId);
      const compSim = comp?.simulatorName || "Geral";
      if (compSim !== simulator) return false;
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
  companies?: any[]
) {
  const filteredTrips = getFilteredTrips(trips, startDate, endDate, empresaId, simulator, companies);

  const tripsCount = filteredTrips.length;
  const totalRevenue = filteredTrips.reduce((acc, trip) => acc + trip.normalizedValor, 0);

  return {
    tripsCount,
    totalRevenue,
    filteredTrips,
  };
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
  
  filteredTrips.forEach((trip) => {
    const cId = trip.empresaId;
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
  users?: any[]
) {
  const filteredTrips = getFilteredTrips(trips, startDate, endDate, empresaId);
  const stats: Record<string, { id: string; name: string; logo: string; trips: number; val: number }> = {};
  
  filteredTrips.forEach((trip) => {
    const mId = trip.motoristaId;
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
        logo: user?.photoURL || "",
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
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function getEndOfDay(date: Date | string | number): Date {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function getCustomRange(start: Date | string, end: Date | string) {
  return {
    start: getStartOfDay(start),
    end: getEndOfDay(end),
  };
}
