import admin from 'firebase-admin';
import fs from 'fs';
import { normalizeTrip } from './src/lib/tripNormalizer';
import { getFilteredTrips, groupMetricsByDriver } from './src/lib/metricsEngine';

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

async function runAudit() {
  console.log("Fetching trips...");
  const tripsSnapshot = await db.collection('historico_viagens').get();
  const rawTrips = tripsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const companiesSnapshot = await db.collection('frotas').get();
  const companies = companiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const usersSnapshot = await db.collection('users').get();
  const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const dcTransportes = companies.find(c => c.companyName === "DC Transportes");
  const dcId = dcTransportes?.id;

  const normalizedTrips = rawTrips.map(t => normalizeTrip(t as any));

  const startDate = new Date('2026-06-01T00:00:00-03:00');
  const endDate = new Date('2026-06-30T23:59:59-03:00');

  // Historico
  const historicoTrips = getFilteredTrips(
    normalizedTrips,
    startDate,
    endDate,
    dcId,
    "Todos os simuladores",
    companies,
    "Todos os Motoristas"
  );

  // Ranking
  const rankingMetrics = groupMetricsByDriver(
    normalizedTrips,
    startDate,
    endDate,
    dcId,
    users,
    "Todos os simuladores",
    companies
  );
  
  const rankingTotalViagens = rankingMetrics.reduce((acc, r) => acc + r.trips, 0);
  const rankingTotalGanhos = rankingMetrics.reduce((acc, r) => acc + r.val, 0);
  
  // Dashboard (OperationsTab / Profile)
  const dashboardTrips = getFilteredTrips(
    normalizedTrips,
    startDate,
    endDate,
    dcId,
    "Todos os simuladores",
    companies,
    undefined // actually operations tab handles this similarly
  );
  
  // Exportação is same as Histórico (from finalTrips)

  console.log("Histórico:");
  console.log("Viagens:", historicoTrips.length);
  console.log("Ganhos:", historicoTrips.reduce((acc, t) => acc + t.normalizedValor, 0));

  console.log("Ranking:");
  console.log("Viagens:", rankingTotalViagens);
  console.log("Ganhos:", rankingTotalGanhos);

  // Ranking array of trips is just what groupMetrics calls internally:
  const rankingTrips = getFilteredTrips(
    normalizedTrips,
    startDate,
    endDate,
    dcId,
    "Todos os simuladores",
    companies,
    undefined // driver
  );

  const histIds = new Set(historicoTrips.map(t => t.id));
  const rankingIds = new Set(rankingTrips.map(t => t.id));
  const dashboardIds = new Set(dashboardTrips.map(t => t.id));

  const histOnly = historicoTrips.filter(t => !rankingIds.has(t.id));
  const rankingOnly = rankingTrips.filter(t => !histIds.has(t.id));

  let report = `Equivalência dos módulos\n\n`;
  report += `Histórico\nviagens: ${historicoTrips.length}\nganhos: R$ ${historicoTrips.reduce((acc, t) => acc + t.normalizedValor, 0).toFixed(2)}\n\n`;
  report += `Ranking\nviagens: ${rankingTrips.length}\nganhos: R$ ${rankingTrips.reduce((acc, t) => acc + t.normalizedValor, 0).toFixed(2)}\n\n`;
  report += `Dashboard\nviagens: ${dashboardTrips.length}\nganhos: R$ ${dashboardTrips.reduce((acc, t) => acc + t.normalizedValor, 0).toFixed(2)}\n\n`;
  report += `Exportação\nviagens: ${historicoTrips.length}\nganhos: R$ ${historicoTrips.reduce((acc, t) => acc + t.normalizedValor, 0).toFixed(2)}\n\n`;

  report += `Comparação dos IDs\n\n`;
  report += `IDs exclusivos do Histórico:\n${histOnly.map(t => t.id).join(', ') || 'Nenhum'}\n\n`;
  report += `IDs exclusivos do Ranking:\n${rankingOnly.map(t => t.id).join(', ') || 'Nenhum'}\n\n`;
  
  if (histOnly.length > 0) {
    report += `\nMotivos de descarte:\n`;
    for (const t of histOnly) {
       report += `Trip ${t.id} - motoristaId: ${t.motoristaId}, ignorada porque groupMetricsByDriver omite "Todos os Motoristas"\n`;
    }
  }

  fs.writeFileSync('relatorio.txt', report);
  console.log(report);

  process.exit(0);
}

runAudit().catch((e) => {
  console.error(e);
  process.exit(1);
});
