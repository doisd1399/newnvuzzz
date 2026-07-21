import assert from "node:assert/strict";
import { getMonthlyRange } from "./src/lib/metricsEngine";
import {
  filterAndSortTripHistory,
  summarizeTripHistory,
} from "./src/lib/tripHistoryEngine";
import { normalizeTrip, parseTripValue } from "./src/lib/tripNormalizer";
import { buildDriverRankingPageData } from "./src/lib/rankingPageEngine";

const companyId = "company-trs";
const driverId = "driver-joeliton";
const { start, end } = getMonthlyRange();

const dateInCurrentMonth = (index: number) => {
  const date = new Date(start);
  date.setDate(1 + (index % Math.max(1, Math.min(20, end.getDate()))));
  date.setHours(12, index % 60, 0, 0);
  return date;
};

const trips: any[] = [];
for (let index = 0; index < 155; index += 1) {
  trips.push({
    id: `month-${index}`,
    status: "completed",
    motoristaId: driverId,
    motoristaNome: "JOELITON S.MESQUITA",
    empresaId: companyId,
    simulatorId: "gto",
    // createdAt intentionally disagrees on one record. completedAt must win.
    createdAt:
      index === 0
        ? new Date(start.getFullYear(), start.getMonth() - 1, 15)
        : dateInCurrentMonth(index),
    completedAt: dateInCurrentMonth(index),
    valor: index === 0 ? "14.900,00" : 1000,
  });
}

for (let index = 0; index < 20; index += 1) {
  trips.push({
    id: `older-${index}`,
    status: "completed",
    motoristaId: driverId,
    motoristaNome: "JOELITON S.MESQUITA",
    empresaId: companyId,
    simulatorId: "gto",
    completedAt: new Date(start.getFullYear(), start.getMonth() - 1, 10),
    valor: 500,
  });
}

// Legacy records may use driverId/companyId instead of motoristaId/empresaId.
// They must still participate in the selected driver's all-time summary.
trips.push({
  id: "legacy-driver-field",
  status: "completed",
  driverId,
  driverName: "JOELITON S.MESQUITA",
  companyId,
  simulatorId: "gto",
  completedAt: new Date(start.getFullYear(), start.getMonth() - 2, 10),
  valor: "2.500,00",
});

// These documents must never affect either history or ranking totals.
trips.push(
  {
    id: "cancelled",
    status: "cancelled",
    motoristaId: driverId,
    empresaId: companyId,
    simulatorId: "gto",
    completedAt: dateInCurrentMonth(1),
    valor: 999999,
  },
  {
    id: "soft-deleted",
    status: "completed",
    deleted: true,
    motoristaId: driverId,
    empresaId: companyId,
    simulatorId: "gto",
    completedAt: dateInCurrentMonth(2),
    valor: 999999,
  },
);

const monthHistory = filterAndSortTripHistory(trips, {
  periodPreset: "mes",
  driverId,
});
const allHistory = filterAndSortTripHistory(trips, {
  periodPreset: "todos",
  driverId,
});

const monthSummary = summarizeTripHistory(monthHistory);
const allSummary = summarizeTripHistory(allHistory);
const visibleFirstPage = allHistory.slice(0, 30);

assert.equal(monthSummary.totalViagens, 155);
assert.equal(allSummary.totalViagens, 176);
assert.equal(visibleFirstPage.length, 30);
assert.notEqual(
  allSummary.totalViagens,
  visibleFirstPage.length,
  "O resumo de Tudo não pode usar apenas a página visual de 30 registros",
);
assert.equal(parseTripValue("14.900,00"), 14900);
assert.equal(monthHistory.some((trip) => trip.id === "month-0"), true);
assert.equal(monthHistory.some((trip) => trip.id === "cancelled"), false);
assert.equal(monthHistory.some((trip) => trip.id === "soft-deleted"), false);
assert.equal(allHistory.some((trip) => trip.id === "legacy-driver-field"), true);
assert.equal(
  allSummary.faturamentoTotal,
  monthSummary.faturamentoTotal + 20 * 500 + 2500,
);

const normalizedTrips = trips.map(normalizeTrip);
const ranking = buildDriverRankingPageData({
  trips: normalizedTrips,
  startDate: start,
  endDate: end,
  scope: "global",
  simulator: "gto",
  companies: [{ id: companyId, simulatorId: "gto" }],
  users: [{ id: driverId, name: "JOELITON S.MESQUITA" }],
});
const driverRanking = ranking.find((entry) => entry.id === driverId);

assert.ok(driverRanking, "O motorista deve aparecer no ranking mensal");
assert.equal(driverRanking.trips, monthSummary.totalViagens);
assert.equal(driverRanking.val, monthSummary.faturamentoTotal);

console.log("Histórico e ranking usam os mesmos totais canônicos: OK", {
  monthTrips: monthSummary.totalViagens,
  allTrips: allSummary.totalViagens,
  visibleRows: visibleFirstPage.length,
  monthRevenue: monthSummary.faturamentoTotal,
});
