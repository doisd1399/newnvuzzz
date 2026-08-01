import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { createHash } from "node:crypto";

const db = admin.firestore();
const NEWS_TIME_ZONE = "America/Sao_Paulo";
const AUTOMATION_VERSION = "nvu_news_automation_v6";
const CONTROL_DOCUMENT_ID = AUTOMATION_VERSION;
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const HISTORY_MONTHS = 2;
const PUBLICATION_DELAY_MINUTES = 30;

type NewsPeriodType = "dia" | "semana" | "mes";
type NewsMetricType = "viagens" | "ganhos";
type NewsEntityType = "motorista" | "empresa";

type NormalizedTrip = {
  id: string;
  date: Date;
  value: number;
  driverId: string;
  driverName: string;
  companyId: string;
  companyName: string;
  simulatorId: string;
  simulatorName: string;
};

type SimulatorDescriptor = {
  key: string;
  id: string;
  name: string;
};

type Aggregate = {
  id: string;
  driverId: string;
  companyId: string;
  driverName: string;
  companyName: string;
  trips: number;
  earnings: number;
  simulator: SimulatorDescriptor;
};

type PeriodDescriptor = {
  key: string;
  type: NewsPeriodType;
  start: Date;
  end: Date;
  publicationAt: Date;
  label: string;
};

type GeneratedNews = {
  documentId: string;
  dedupeKey: string;
  contentHash: string;
  data: Record<string, unknown>;
};

type GenerationResult = {
  success: true;
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

type AutomationLockResult =
  | { action: "run"; runId: string }
  | { action: "completed"; data: FirebaseFirestore.DocumentData }
  | { action: "in_progress"; data: FirebaseFirestore.DocumentData };

const DRIVER_TRIP_TEMPLATES: Record<NewsPeriodType, string[]> = {
  dia: [
    "{periodoLegenda}, {motoristaNome} foi o motorista mais ativo da {empresaNome}, com {quantidadeViagens} viagens concluídas. O desempenho colocou o profissional no topo operacional do {simulador} naquele dia.",
    "O destaque diário do {simulador} ficou com {motoristaNome}. {periodoLegenda}, ele representou a {empresaNome} em {quantidadeViagens} viagens e alcançou o maior volume entre os motoristas do período.",
    "{motoristaNome} encerrou o dia como líder em viagens pela {empresaNome}. Foram {quantidadeViagens} operações concluídas {periodoLegenda}, resultado que garantiu o principal destaque diário do {simulador}.",
  ],
  semana: [
    "Entre {periodoInicio} e {periodoFim}, {motoristaNome} manteve o melhor ritmo operacional do {simulador}. Representando a {empresaNome}, o motorista concluiu {quantidadeViagens} viagens e terminou a semana na liderança.",
    "A semana de {periodoInicio} a {periodoFim} terminou com {motoristaNome} no topo do ranking de viagens. Foram {quantidadeViagens} operações pela {empresaNome}, demonstrando regularidade durante todo o período.",
    "Com presença consistente entre {periodoInicio} e {periodoFim}, {motoristaNome} foi o principal destaque semanal da {empresaNome}. O motorista somou {quantidadeViagens} viagens e liderou o {simulador}.",
  ],
  mes: [
    "Durante {periodoMes}, {motoristaNome} apresentou o maior volume mensal de viagens no {simulador}. O motorista representou a {empresaNome} em {quantidadeViagens} operações e encerrou o período na liderança.",
    "O fechamento de {periodoMes} confirmou {motoristaNome} como o motorista mais ativo do mês. Com {quantidadeViagens} viagens pela {empresaNome}, ele alcançou o principal resultado operacional do {simulador}.",
    "{motoristaNome} concluiu {periodoMes} como destaque mensal da {empresaNome}. Foram {quantidadeViagens} viagens registradas, marca que garantiu a liderança entre os motoristas do {simulador}.",
  ],
};

const DRIVER_EARNINGS_TEMPLATES: Record<NewsPeriodType, string[]> = {
  dia: [
    "{periodoLegenda}, {motoristaNome} alcançou o maior ganho diário do {simulador}. Representando a {empresaNome}, o motorista movimentou {valorMovimentado} em operações concluídas.",
    "O melhor resultado financeiro do dia ficou com {motoristaNome}. {periodoLegenda}, as viagens realizadas pela {empresaNome} totalizaram {valorMovimentado} em ganhos.",
    "{motoristaNome} liderou os ganhos diários da {empresaNome} {periodoLegenda}. O total de {valorMovimentado} colocou o motorista no principal destaque financeiro do {simulador}.",
  ],
  semana: [
    "Entre {periodoInicio} e {periodoFim}, {motoristaNome} registrou o maior ganho semanal do {simulador}. O motorista movimentou {valorMovimentado} representando a {empresaNome}.",
    "A semana de {periodoInicio} a {periodoFim} terminou com {motoristaNome} na liderança financeira. As operações realizadas pela {empresaNome} somaram {valorMovimentado} no período.",
    "Com resultado consistente entre {periodoInicio} e {periodoFim}, {motoristaNome} foi o destaque semanal em ganhos da {empresaNome}, alcançando {valorMovimentado} no {simulador}.",
  ],
  mes: [
    "Durante {periodoMes}, {motoristaNome} obteve o maior ganho mensal do {simulador}. As operações realizadas pela {empresaNome} totalizaram {valorMovimentado}.",
    "O fechamento de {periodoMes} colocou {motoristaNome} no topo do ranking mensal de ganhos. Representando a {empresaNome}, ele movimentou {valorMovimentado}.",
    "{motoristaNome} encerrou {periodoMes} como destaque financeiro da {empresaNome}. O total de {valorMovimentado} foi o maior resultado mensal entre os motoristas do {simulador}.",
  ],
};

const COMPANY_TRIP_TEMPLATES: Record<NewsPeriodType, string[]> = {
  dia: [
    "{periodoLegenda}, a {empresaNome} foi a empresa mais ativa do {simulador}. Sua equipe concluiu {quantidadeViagens} viagens e alcançou o maior volume operacional do dia.",
    "O destaque empresarial diário ficou com a {empresaNome}. {periodoLegenda}, a equipe registrou {quantidadeViagens} viagens e liderou as operações do {simulador}.",
    "A {empresaNome} encerrou o dia na liderança operacional. Foram {quantidadeViagens} viagens concluídas {periodoLegenda}, o melhor resultado empresarial do {simulador}.",
  ],
  semana: [
    "Entre {periodoInicio} e {periodoFim}, a {empresaNome} apresentou o maior volume operacional do {simulador}. A equipe concluiu {quantidadeViagens} viagens durante a semana.",
    "A semana de {periodoInicio} a {periodoFim} terminou com a {empresaNome} na liderança entre as empresas. Foram {quantidadeViagens} viagens registradas no {simulador}.",
    "Com atividade constante entre {periodoInicio} e {periodoFim}, a {empresaNome} conquistou o destaque semanal do {simulador}, somando {quantidadeViagens} viagens concluídas.",
  ],
  mes: [
    "Durante {periodoMes}, a {empresaNome} liderou o volume operacional do {simulador}. A equipe concluiu {quantidadeViagens} viagens e garantiu o principal destaque empresarial do mês.",
    "O fechamento de {periodoMes} confirmou a {empresaNome} como a empresa mais ativa do {simulador}. Foram {quantidadeViagens} viagens registradas no período.",
    "A {empresaNome} encerrou {periodoMes} no topo do ranking empresarial de viagens. Com {quantidadeViagens} operações concluídas, a equipe alcançou o melhor resultado mensal do {simulador}.",
  ],
};

const COMPANY_EARNINGS_TEMPLATES: Record<NewsPeriodType, string[]> = {
  dia: [
    "{periodoLegenda}, a {empresaNome} registrou a maior movimentação financeira do {simulador}. As operações da equipe totalizaram {valorMovimentado} no dia.",
    "O melhor resultado financeiro diário ficou com a {empresaNome}. {periodoLegenda}, a empresa movimentou {valorMovimentado} em viagens concluídas no {simulador}.",
    "A {empresaNome} encerrou o dia na liderança financeira do {simulador}. O total movimentado {periodoLegenda} foi de {valorMovimentado}.",
  ],
  semana: [
    "Entre {periodoInicio} e {periodoFim}, a {empresaNome} alcançou a maior movimentação semanal do {simulador}. As operações concluídas totalizaram {valorMovimentado}.",
    "A semana de {periodoInicio} a {periodoFim} terminou com a {empresaNome} no topo financeiro. A equipe movimentou {valorMovimentado} durante o período no {simulador}.",
    "Com forte desempenho entre {periodoInicio} e {periodoFim}, a {empresaNome} conquistou o destaque financeiro semanal do {simulador}, somando {valorMovimentado} em operações.",
  ],
  mes: [
    "Durante {periodoMes}, a {empresaNome} registrou a maior movimentação mensal do {simulador}. As operações da equipe totalizaram {valorMovimentado}.",
    "O fechamento de {periodoMes} colocou a {empresaNome} na liderança financeira do {simulador}. A empresa movimentou {valorMovimentado} durante o mês.",
    "A {empresaNome} encerrou {periodoMes} como destaque financeiro empresarial. O total de {valorMovimentado} foi a maior movimentação mensal registrada no {simulador}.",
  ],
};

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return "";
}

function shortPersonName(value: unknown): string {
  const normalized = firstNonEmpty(value).replace(/\s+/g, " ");
  if (!normalized) return "";
  const parts = normalized.split(" ");
  return parts.length <= 2 ? normalized : `${parts[0]} ${parts[parts.length - 1]}`;
}

function normalizeStatus(value: unknown): string {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeSimulatorKey(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (!normalized) return "nao-informado";
  if (normalized === "gto" || normalized.includes("globaltruckonline")) return "gto";
  if (normalized === "ets2" || normalized.includes("eurotrucksimulator2")) return "ets2";
  if (normalized === "ats" || normalized.includes("americantrucksimulator")) return "ats";
  if (normalized === "toe3" || normalized.includes("truckersofeurope3")) return "toe3";
  return normalized;
}

function preferredSimulatorName(id: string, name: string): string {
  const nameKey = normalizeSimulatorKey(name);
  const idKey = normalizeSimulatorKey(id);
  const key = ["gto", "ets2", "ats", "toe3"].includes(nameKey) ? nameKey : idKey;
  if (key === "gto") return "GTO";
  if (key === "ets2") return "Euro Truck Simulator 2";
  if (key === "ats") return "American Truck Simulator";
  if (key === "toe3") return "Truckers of Europe 3";
  return firstNonEmpty(name, id, "Não informado");
}

function parseTripValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9,.-]/g, "");
  if (!cleaned) return 0;

  let normalized = cleaned;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    normalized = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (hasComma) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    const lastDot = cleaned.lastIndexOf(".");
    normalized = cleaned.slice(0, lastDot).replace(/\./g, "") + cleaned.slice(lastDot);
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const timestampLike = value as { toDate?: () => Date; seconds?: unknown };
  if (value instanceof admin.firestore.Timestamp) return value.toDate();
  if (typeof timestampLike?.toDate === "function") {
    const date = timestampLike.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof timestampLike?.seconds === "number") {
    const date = new Date(timestampLike.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tripMetricDate(data: FirebaseFirestore.DocumentData): Date | null {
  return parseDate(
    data.completedAt ||
      data.dataFechamento ||
      data.date ||
      data.dataLancamento ||
      data.createdAt,
  );
}

function isValidCompletedTrip(data: FirebaseFirestore.DocumentData): boolean {
  const status = normalizeStatus(data.status);
  const canceled =
    ["cancelado", "cancelada", "canceled", "cancelled", "excluido", "excluida"].includes(status) ||
    data.cancelado === true ||
    data.deleted === true ||
    data.softDeleted === true;
  const completed = ["concluida", "concluido", "completed", "finalizado", "finalizada", "entregue"].includes(status);
  return !canceled && completed;
}

function zonedParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: NEWS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function timeZoneOffsetMs(date: Date): number {
  const parts = zonedParts(date);
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return representedAsUtc - date.getTime();
}

function zonedDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0): Date {
  const intendedUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let guess = intendedUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    guess = intendedUtc - timeZoneOffsetMs(new Date(guess));
  }
  return new Date(guess);
}

function dateKey(date: Date): string {
  const parts = zonedParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function currentGenerationKey(now: Date): string {
  return dateKey(new Date(now.getTime() - PUBLICATION_DELAY_MINUTES * 60 * 1000));
}

function historyRangeStart(now: Date): Date {
  const parts = zonedParts(now);
  return zonedDate(parts.year, parts.month - HISTORY_MONTHS, 1);
}

function startOfCurrentDay(now: Date): Date {
  const parts = zonedParts(now);
  return zonedDate(parts.year, parts.month, parts.day);
}

function parseDateKey(value: unknown): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  return zonedDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function startOfWeek(date: Date): Date {
  const parts = zonedParts(date);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  return zonedDate(parts.year, parts.month, parts.day - mondayOffset);
}

function incrementalRangeStart(lastGenerationKey: unknown, now: Date): Date {
  const historyStart = historyRangeStart(now);
  const lastDate = parseDateKey(lastGenerationKey);
  if (!lastDate) return historyStart;
  const parts = zonedParts(lastDate);
  const monthStart = zonedDate(parts.year, parts.month, 1);
  const weekStart = startOfWeek(lastDate);
  const earliest = monthStart.getTime() < weekStart.getTime() ? monthStart : weekStart;
  return earliest.getTime() < historyStart.getTime() ? historyStart : earliest;
}

function formatDatePt(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: NEWS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatWeekdayPt(date: Date, short = false): string {
  const value = new Intl.DateTimeFormat("pt-BR", {
    timeZone: NEWS_TIME_ZONE,
    weekday: short ? "short" : "long",
  }).format(date).replace(/\.$/, "");
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function formatMonthPt(date: Date): string {
  const value = new Intl.DateTimeFormat("pt-BR", {
    timeZone: NEWS_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(date);
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function periodLegend(period: PeriodDescriptor): string {
  if (period.type === "dia") {
    return `na ${formatWeekdayPt(period.start).toLocaleLowerCase("pt-BR")}, ${formatDatePt(period.start)}`;
  }
  if (period.type === "semana") return `entre ${formatDatePt(period.start)} e ${formatDatePt(period.end)}`;
  return `durante ${formatMonthPt(period.start)}`;
}

function getPeriodDescriptor(date: Date, type: NewsPeriodType, now: Date): PeriodDescriptor | null {
  const parts = zonedParts(date);
  let start: Date;
  let end: Date;
  let label: string;

  if (type === "dia") {
    start = zonedDate(parts.year, parts.month, parts.day);
    end = new Date(zonedDate(parts.year, parts.month, parts.day + 1).getTime() - 1);
    label = `${formatWeekdayPt(start)}, ${formatDatePt(start)}`;
  } else if (type === "semana") {
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    const mondayOffset = (weekday + 6) % 7;
    start = zonedDate(parts.year, parts.month, parts.day - mondayOffset);
    const startParts = zonedParts(start);
    end = new Date(zonedDate(startParts.year, startParts.month, startParts.day + 7).getTime() - 1);
    label = `Semana ${formatDatePt(start)} a ${formatDatePt(end)}`;
  } else {
    start = zonedDate(parts.year, parts.month, 1);
    end = new Date(zonedDate(parts.year, parts.month + 1, 1).getTime() - 1);
    label = formatMonthPt(start);
  }

  const publicationAt = new Date(end.getTime() + 1 + PUBLICATION_DELAY_MINUTES * 60 * 1000);
  if (publicationAt.getTime() > now.getTime()) return null;
  return { key: `${type}_${dateKey(start)}`, type, start, end, publicationAt, label };
}

function stableTemplateIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  const hash = createHash("sha256").update(seed).digest("hex");
  return Number.parseInt(hash.slice(0, 8), 16) % length;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function renderTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replace(new RegExp(`\\{${key}\\}`, "g"), String(value)),
    template,
  );
}

function compareTrips(left: Aggregate, right: Aggregate): number {
  return right.trips - left.trips || right.earnings - left.earnings || left.id.localeCompare(right.id);
}

function compareEarnings(left: Aggregate, right: Aggregate): number {
  return right.earnings - left.earnings || right.trips - left.trips || left.id.localeCompare(right.id);
}

function categoryKey(entity: NewsEntityType, period: NewsPeriodType, metric: NewsMetricType): string {
  const metricSuffix = entity === "empresa" && metric === "ganhos" ? "movimentacao" : metric;
  return `melhor_${entity}_${period}_${metricSuffix}`;
}

function titleFor(
  entity: NewsEntityType,
  period: NewsPeriodType,
  metric: NewsMetricType,
  descriptor?: PeriodDescriptor,
): string {
  const periodLabel = period === "dia" ? "do dia" : period === "semana" ? "da semana" : "do mês";
  let baseTitle: string;
  if (entity === "motorista") {
    baseTitle = metric === "viagens"
      ? `Motorista com mais viagens ${periodLabel}`
      : `Motorista com maior ganho ${periodLabel}`;
  } else {
    baseTitle = metric === "viagens"
      ? `Empresa com mais viagens ${periodLabel}`
      : `Empresa com maior movimentação ${periodLabel}`;
  }

  if (period === "dia" && descriptor) {
    return `${baseTitle} — ${formatWeekdayPt(descriptor.start)}, ${formatDatePt(descriptor.start)}`;
  }
  return baseTitle;
}

function normalizeTrip(document: FirebaseFirestore.QueryDocumentSnapshot, rangeStart: Date, rangeEnd: Date): NormalizedTrip | null {
  const data = document.data();
  if (!isValidCompletedTrip(data)) return null;
  const date = tripMetricDate(data);
  if (!date || date.getTime() < rangeStart.getTime() || date.getTime() > rangeEnd.getTime()) return null;

  const driverId = firstNonEmpty(data.motoristaId, data.driverId, data.motorista_id, data.userId, data.driver_id);
  const companyId = firstNonEmpty(data.empresaId, data.companyId, data.company_id, data.empresa_id);
  if (!driverId || !companyId) return null;

  return {
    id: document.id,
    date,
    value: Math.max(0, parseTripValue(data.valor ?? data.value ?? data.totalValue ?? data.ganho)),
    driverId,
    driverName: firstNonEmpty(data.motoristaNome, data.driverName, data.motorista_nome, data.nomeMotorista, data.driver_name),
    companyId,
    companyName: firstNonEmpty(data.empresaNome, data.companyName, data.empresa_nome, data.fleetName),
    simulatorId: firstNonEmpty(data.simulatorId, data.simuladorId, data.simulator_id, data.simulador_id),
    simulatorName: firstNonEmpty(data.simulatorName, data.simuladorNome, data.simulador, data.simulator),
  };
}

async function getDocumentsByIds(collectionName: string, ids: string[]): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const result = new Map<string, FirebaseFirestore.DocumentData>();
  const chunkSize = 250;

  for (let offset = 0; offset < uniqueIds.length; offset += chunkSize) {
    const chunk = uniqueIds.slice(offset, offset + chunkSize);
    const snapshots = await db.getAll(...chunk.map((id) => db.collection(collectionName).doc(id)));
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) result.set(snapshot.id, snapshot.data() || {});
    });
  }

  return result;
}

function companyNameOf(aggregate: Aggregate, company: FirebaseFirestore.DocumentData | undefined): string {
  return firstNonEmpty(company?.companyName, company?.fleetName, company?.name, aggregate.companyName);
}

function companyLogoOf(company: FirebaseFirestore.DocumentData | undefined): string {
  return firstNonEmpty(
    company?.logoUrl,
    company?.logoURL,
    company?.companyLogoURL,
    company?.companyLogoUrl,
    company?.company_logo_url,
    company?.logo,
    company?.logoEmpresa,
    company?.logo_empresa,
    company?.imageUrl,
    company?.avatar,
  );
}

function driverNameOf(aggregate: Aggregate, user: FirebaseFirestore.DocumentData | undefined): string {
  return shortPersonName(firstNonEmpty(user?.name, user?.fullName, user?.displayName, aggregate.driverName));
}

function driverPhotoOf(user: FirebaseFirestore.DocumentData | undefined): string {
  return firstNonEmpty(
    user?.profilePhotoURL,
    user?.profilePhotoUrl,
    user?.photoURL,
    user?.photoUrl,
    user?.applicationPhotoURL,
    user?.applicationPhotoUrl,
    user?.authPhotoURL,
    user?.avatarUrl,
    user?.avatar,
    user?.profileImage,
    user?.imageUrl,
  );
}

function simulatorOf(trip: NormalizedTrip, company: FirebaseFirestore.DocumentData | undefined): SimulatorDescriptor {
  const id = firstNonEmpty(
    trip.simulatorId,
    company?.simulatorId,
    company?.simuladorId,
  );
  const name = preferredSimulatorName(
    id,
    firstNonEmpty(
      trip.simulatorName,
      company?.simulatorName,
      company?.simuladorNome,
      company?.simulator,
      id,
    ),
  );
  const nameKey = normalizeSimulatorKey(name);
  const idKey = normalizeSimulatorKey(id);
  return {
    key: ["gto", "ets2", "ats", "toe3"].includes(nameKey)
      ? nameKey
      : firstNonEmpty(idKey === "nao-informado" ? "" : idKey, nameKey),
    id,
    name,
  };
}

function addToAggregate(
  map: Map<string, Aggregate>,
  key: string,
  trip: NormalizedTrip,
  entity: NewsEntityType,
  simulator: SimulatorDescriptor,
): void {
  const existing = map.get(key) || {
    id: key,
    driverId: entity === "motorista" ? trip.driverId : "",
    companyId: trip.companyId,
    driverName: entity === "motorista" ? trip.driverName : "",
    companyName: trip.companyName,
    trips: 0,
    earnings: 0,
    simulator,
  };

  existing.trips += 1;
  existing.earnings += trip.value;
  if (!existing.driverName && trip.driverName) existing.driverName = trip.driverName;
  if (!existing.companyName && trip.companyName) existing.companyName = trip.companyName;
  map.set(key, existing);
}

function selectTemplates(entity: NewsEntityType, metric: NewsMetricType, period: NewsPeriodType): string[] {
  if (entity === "motorista" && metric === "viagens") return DRIVER_TRIP_TEMPLATES[period];
  if (entity === "motorista" && metric === "ganhos") return DRIVER_EARNINGS_TEMPLATES[period];
  if (entity === "empresa" && metric === "viagens") return COMPANY_TRIP_TEMPLATES[period];
  return COMPANY_EARNINGS_TEMPLATES[period];
}

function buildSearchTokens(...values: unknown[]): string[] {
  const tokens = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeStatus(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (!normalized) return;
    if (normalized.length <= 120) tokens.add(normalized);
    normalized.split(" ").filter(Boolean).forEach((word) => {
      tokens.add(word);
      for (let length = 3; length <= word.length && length <= 18; length += 1) {
        tokens.add(word.slice(0, length));
      }
    });
  });
  return Array.from(tokens).slice(0, 120);
}

function contentDigest(data: Record<string, unknown>): string {
  const relevant = {
    categoria: data.categoria,
    titulo: data.titulo,
    mensagem: data.mensagem,
    empresaId: data.empresaId,
    empresaNome: data.empresaNome,
    empresaLogo: data.empresaLogo,
    motoristaId: data.motoristaId,
    motoristaNome: data.motoristaNome,
    motoristaFoto: data.motoristaFoto,
    simulador: data.simulador,
    simuladorId: data.simuladorId,
    periodo: data.periodo,
    periodoInicioKey: data.periodoInicioKey,
    periodoFimKey: data.periodoFimKey,
    recordeHistorico: data.recordeHistorico,
    recordeValor: data.recordeValor,
    quantidadeViagens: data.quantidadeViagens,
    valorMovimentado: data.valorMovimentado,
    searchTokens: data.searchTokens,
  };
  return createHash("sha256").update(JSON.stringify(relevant)).digest("hex");
}

function buildNewsDocument(
  entity: NewsEntityType,
  metric: NewsMetricType,
  period: PeriodDescriptor,
  aggregate: Aggregate,
  company: FirebaseFirestore.DocumentData | undefined,
  user: FirebaseFirestore.DocumentData | undefined,
): GeneratedNews | null {
  const category = categoryKey(entity, period.type, metric);
  const empresaNome = companyNameOf(aggregate, company);
  const motoristaNome = entity === "motorista" ? driverNameOf(aggregate, user) : "";
  if (!empresaNome || (entity === "motorista" && !motoristaNome)) return null;

  const dedupeKey = [
    AUTOMATION_VERSION,
    aggregate.simulator.key,
    category,
    period.type,
    dateKey(period.start),
    dateKey(period.end),
  ].join("_");
  const templates = selectTemplates(entity, metric, period.type);
  const template = templates[stableTemplateIndex(dedupeKey, templates.length)];
  const mensagem = renderTemplate(template, {
    motoristaNome,
    empresaNome,
    quantidadeViagens: aggregate.trips,
    valorMovimentado: formatCurrency(aggregate.earnings),
    simulador: aggregate.simulator.name,
    periodoLegenda: periodLegend(period),
    periodoInicio: formatDatePt(period.start),
    periodoFim: formatDatePt(period.end),
    periodoMes: formatMonthPt(period.start),
  });

  const data: Record<string, unknown> = {
    tipo: "automatico",
    categoria: category,
    titulo: titleFor(entity, period.type, metric, period),
    mensagem,
    empresaId: aggregate.companyId,
    empresaNome,
    empresaLogo: companyLogoOf(company),
    motoristaId: entity === "motorista" ? aggregate.driverId : "",
    motoristaNome,
    motoristaFoto: entity === "motorista" ? driverPhotoOf(user) : "",
    simulador: aggregate.simulator.name,
    simuladorId: aggregate.simulator.id,
    simuladorKey: aggregate.simulator.key,
    periodo: period.label,
    periodoLegenda: periodLegend(period),
    periodoTipo: period.type,
    periodoStatus: "encerrado",
    feedSection: period.type,
    feedSectionOrder: period.type === "dia" ? 1 : period.type === "semana" ? 2 : 3,
    feedPeriodLabel: period.type === "dia"
      ? `${formatWeekdayPt(period.start)}, ${formatDatePt(period.start)}`
      : period.label,
    periodoInicio: admin.firestore.Timestamp.fromDate(period.start),
    periodoFim: admin.firestore.Timestamp.fromDate(period.end),
    periodoInicioKey: dateKey(period.start),
    periodoFimKey: dateKey(period.end),
    publicacaoProgramadaEm: admin.firestore.Timestamp.fromDate(period.publicationAt),
    dataCriacao: admin.firestore.Timestamp.fromDate(period.publicationAt),
    quantidadeViagens: aggregate.trips,
    valorMovimentado: aggregate.earnings,
    status: "publicado",
    origem: "automatico_programado",
    visibilidade: "publico",
    publicoAlvo: "geral",
    dedupeKey,
    automationVersion: AUTOMATION_VERSION,
    createdBySystem: true,
    programacao: "Execução diária às 00:30 (America/Sao_Paulo). Dia anterior: diariamente; semana anterior: segunda-feira; mês anterior: primeiro dia do mês. Recordes históricos são atualizados somente quando uma nova marca supera a anterior.",
    searchTokens: buildSearchTokens(
      motoristaNome,
      empresaNome,
      aggregate.simulator.name,
      aggregate.simulator.id,
      titleFor(entity, period.type, metric, period),
      mensagem,
      period.label,
      category,
    ),
  };
  const contentHash = contentDigest(data);
  data.contentHash = contentHash;

  return {
    documentId: `news_v6_${createHash("sha256").update(dedupeKey).digest("hex").slice(0, 40)}`,
    dedupeKey,
    contentHash,
    data,
  };
}

function buildPeriodNews(
  period: PeriodDescriptor,
  periodTrips: NormalizedTrip[],
  companies: Map<string, FirebaseFirestore.DocumentData>,
  users: Map<string, FirebaseFirestore.DocumentData>,
): GeneratedNews[] {
  const tripsBySimulator = new Map<string, { simulator: SimulatorDescriptor; trips: NormalizedTrip[] }>();

  periodTrips.forEach((trip) => {
    const simulator = simulatorOf(trip, companies.get(trip.companyId));
    const current = tripsBySimulator.get(simulator.key) || { simulator, trips: [] };
    current.trips.push(trip);
    tripsBySimulator.set(simulator.key, current);
  });

  const generated: GeneratedNews[] = [];
  tripsBySimulator.forEach(({ simulator, trips }) => {
    const driverAggregates = new Map<string, Aggregate>();
    const companyAggregates = new Map<string, Aggregate>();

    trips.forEach((trip) => {
      addToAggregate(driverAggregates, `${trip.driverId}::${trip.companyId}`, trip, "motorista", simulator);
      addToAggregate(companyAggregates, trip.companyId, trip, "empresa", simulator);
    });

    const drivers = Array.from(driverAggregates.values());
    const companyRanking = Array.from(companyAggregates.values());
    const topDriverTrips = [...drivers].sort(compareTrips)[0];
    const topDriverEarnings = [...drivers].filter((item) => item.earnings > 0).sort(compareEarnings)[0];
    const topCompanyTrips = [...companyRanking].sort(compareTrips)[0];
    const topCompanyEarnings = [...companyRanking].filter((item) => item.earnings > 0).sort(compareEarnings)[0];

    const append = (news: GeneratedNews | null) => {
      if (news) generated.push(news);
    };

    if (topDriverTrips?.trips > 0) {
      append(buildNewsDocument(
        "motorista",
        "viagens",
        period,
        topDriverTrips,
        companies.get(topDriverTrips.companyId),
        users.get(topDriverTrips.driverId),
      ));
    }
    if (topDriverEarnings) {
      append(buildNewsDocument(
        "motorista",
        "ganhos",
        period,
        topDriverEarnings,
        companies.get(topDriverEarnings.companyId),
        users.get(topDriverEarnings.driverId),
      ));
    }
    if (topCompanyTrips?.trips > 0) {
      append(buildNewsDocument(
        "empresa",
        "viagens",
        period,
        topCompanyTrips,
        companies.get(topCompanyTrips.companyId),
        undefined,
      ));
    }
    if (topCompanyEarnings) {
      append(buildNewsDocument(
        "empresa",
        "ganhos",
        period,
        topCompanyEarnings,
        companies.get(topCompanyEarnings.companyId),
        undefined,
      ));
    }
  });

  return generated;
}


type RecordDescriptor = {
  entity: NewsEntityType;
  metric: NewsMetricType;
  period: "semana" | "mes";
};

function parseRecordDescriptor(category: unknown): RecordDescriptor | null {
  const match = /^melhor_(motorista|empresa)_(semana|mes)_(viagens|ganhos|movimentacao)$/.exec(String(category || ""));
  if (!match) return null;
  return {
    entity: match[1] as NewsEntityType,
    period: match[2] as "semana" | "mes",
    metric: match[3] === "movimentacao" ? "ganhos" : match[3] as NewsMetricType,
  };
}

function recordCategory(descriptor: RecordDescriptor): string {
  const metric = descriptor.entity === "empresa" && descriptor.metric === "ganhos" ? "movimentacao" : descriptor.metric;
  return `recorde_${descriptor.entity}_${descriptor.period}_${metric}`;
}

function recordTitle(descriptor: RecordDescriptor): string {
  const periodLabel = descriptor.period === "semana" ? "semanal" : "mensal";
  const entityLabel = descriptor.entity === "empresa" ? "Empresa" : "Motorista";
  const metricLabel = descriptor.metric === "viagens"
    ? "mais viagens"
    : descriptor.entity === "empresa" ? "maior movimentação" : "maior ganho";
  return `Recorde histórico ${periodLabel}: ${entityLabel} com ${metricLabel}`;
}

function recordMessage(
  descriptor: RecordDescriptor,
  source: Record<string, unknown>,
): string {
  const driverName = String(source.motoristaNome || "");
  const companyName = String(source.empresaNome || "");
  const simulator = String(source.simulador || "simulador");
  const start = String(source.periodoInicioKey || "").split("-").reverse().join("/");
  const end = String(source.periodoFimKey || "").split("-").reverse().join("/");
  const periodText = descriptor.period === "semana"
    ? `entre ${start} e ${end}`
    : `durante ${String(source.periodo || "o mês encerrado")}`;
  const value = descriptor.metric === "viagens"
    ? `${Number(source.quantidadeViagens || 0).toLocaleString("pt-BR")} viagens`
    : formatCurrency(Number(source.valorMovimentado || 0));

  if (descriptor.entity === "motorista") {
    const metricText = descriptor.metric === "viagens" ? "volume de viagens" : "resultado em ganhos";
    return `${periodText}, ${driverName} estabeleceu o maior ${metricText} já registrado por um motorista no ${simulator}: ${value}, representando a ${companyName}. A marca considera todos os períodos encerrados desde o início da plataforma NVU.`;
  }

  const metricText = descriptor.metric === "viagens" ? "volume de viagens" : "resultado de movimentação";
  return `${periodText}, a ${companyName} estabeleceu o maior ${metricText} já registrado por uma empresa no ${simulator}: ${value}. A marca considera todos os períodos encerrados desde o início da plataforma NVU.`;
}

function buildHistoricalRecordCandidates(generated: GeneratedNews[], now: Date): GeneratedNews[] {
  const bestByRecord = new Map<string, { news: GeneratedNews; value: number; descriptor: RecordDescriptor }>();

  generated.forEach((news) => {
    const descriptor = parseRecordDescriptor(news.data.categoria);
    if (!descriptor) return;
    const value = descriptor.metric === "viagens"
      ? Number(news.data.quantidadeViagens || 0)
      : Number(news.data.valorMovimentado || 0);
    if (!(value > 0)) return;
    const simulatorKey = String(news.data.simuladorKey || "nao-informado");
    const key = `${simulatorKey}_${descriptor.entity}_${descriptor.period}_${descriptor.metric}`;
    const current = bestByRecord.get(key);
    // Em caso de empate, conserva o período mais antigo: ele foi o primeiro a estabelecer a marca.
    if (!current || value > current.value) bestByRecord.set(key, { news, value, descriptor });
  });

  return Array.from(bestByRecord.entries()).map(([recordKey, candidate]) => {
    const source = candidate.news.data;
    const category = recordCategory(candidate.descriptor);
    const dedupeKey = `${AUTOMATION_VERSION}_recorde_${recordKey}`;
    const data: Record<string, unknown> = {
      ...source,
      categoria: category,
      titulo: recordTitle(candidate.descriptor),
      mensagem: recordMessage(candidate.descriptor, source),
      tipo: "automatico",
      origem: "recorde_historico_automatico",
      recordeHistorico: true,
      recordeEntidade: candidate.descriptor.entity,
      recordeMetrica: candidate.descriptor.metric,
      recordePeriodo: candidate.descriptor.period,
      recordeValor: candidate.value,
      recordePeriodoOriginal: source.periodo,
      recordeAtingidoEm: source.publicacaoProgramadaEm,
      publicacaoProgramadaEm: admin.firestore.Timestamp.fromDate(now),
      dataCriacao: admin.firestore.Timestamp.fromDate(now),
      dedupeKey,
      automationVersion: AUTOMATION_VERSION,
      createdBySystem: true,
      searchTokens: buildSearchTokens(
        source.motoristaNome,
        source.empresaNome,
        source.simulador,
        category,
        recordTitle(candidate.descriptor),
        recordMessage(candidate.descriptor, source),
        source.periodo,
        "recorde histórico",
      ),
    };
    const contentHash = contentDigest(data);
    data.contentHash = contentHash;
    return {
      documentId: `news_record_v1_${createHash("sha256").update(dedupeKey).digest("hex").slice(0, 36)}`,
      dedupeKey,
      contentHash,
      data,
    };
  });
}

async function commitHistoricalRecords(generated: GeneratedNews[]): Promise<{ created: number; updated: number; ignored: number }> {
  let created = 0;
  let updated = 0;
  let ignored = 0;

  for (let offset = 0; offset < generated.length; offset += 100) {
    const chunk = generated.slice(offset, offset + 100);
    const refs = chunk.map((item) => db.collection("noticias").doc(item.documentId));
    const snapshots = await db.getAll(...refs);
    const batch = db.batch();
    let hasWrites = false;

    chunk.forEach((item, index) => {
      const snapshot = snapshots[index];
      if (!snapshot.exists) {
        batch.create(refs[index], {
          ...item.data,
          curtidasCount: 0,
          comentariosCount: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        created += 1;
        hasWrites = true;
        return;
      }

      const current = snapshot.data() || {};
      const currentValue = Number(current.recordeValor || 0);
      const nextValue = Number(item.data.recordeValor || 0);
      if (nextValue <= currentValue) {
        ignored += 1;
        return;
      }

      batch.set(refs[index], {
        ...item.data,
        curtidasCount: Math.max(0, Number(current.curtidasCount || 0)),
        comentariosCount: Math.max(0, Number(current.comentariosCount || 0)),
        previousRecordValue: currentValue,
        lastCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      updated += 1;
      hasWrites = true;
    });

    if (hasWrites) await batch.commit();
  }

  return { created, updated, ignored };
}

function collectPeriods(
  trips: NormalizedTrip[],
  now: Date,
  periodTypes: NewsPeriodType[],
  minimumPeriodStart?: Date,
): Map<string, { descriptor: PeriodDescriptor; trips: NormalizedTrip[] }> {
  const periods = new Map<string, { descriptor: PeriodDescriptor; trips: NormalizedTrip[] }>();
  trips.forEach((trip) => {
    periodTypes.forEach((periodType) => {
      const descriptor = getPeriodDescriptor(trip.date, periodType, now);
      if (!descriptor) return;
      if (minimumPeriodStart && descriptor.start.getTime() < minimumPeriodStart.getTime()) return;
      const current = periods.get(descriptor.key) || { descriptor, trips: [] };
      current.trips.push(trip);
      periods.set(descriptor.key, current);
    });
  });
  return periods;
}

function generatedNewsFromPeriods(
  periods: Map<string, { descriptor: PeriodDescriptor; trips: NormalizedTrip[] }>,
  companies: Map<string, FirebaseFirestore.DocumentData>,
  users: Map<string, FirebaseFirestore.DocumentData>,
): GeneratedNews[] {
  return Array.from(periods.values())
    .sort((left, right) => left.descriptor.start.getTime() - right.descriptor.start.getTime())
    .flatMap(({ descriptor, trips }) => buildPeriodNews(descriptor, trips, companies, users));
}

async function acquireAutomationLock(runId: string, generationKey: string): Promise<AutomationLockResult> {
  const controlRef = db.collection("system_settings").doc(CONTROL_DOCUMENT_ID);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(controlRef);
    const data = snapshot.exists ? snapshot.data() || {} : {};

    if (
      data.status === "completed" &&
      data.lastGenerationKey === generationKey &&
      data.version === AUTOMATION_VERSION &&
      data.migrationCompleted === true
    ) {
      return { action: "completed", data };
    }

    const startedAt = parseDate(data.startedAt);
    if (data.status === "running" && startedAt && Date.now() - startedAt.getTime() < LOCK_TIMEOUT_MS) {
      return { action: "in_progress", data };
    }

    transaction.set(
      controlRef,
      {
        status: "running",
        runId,
        version: AUTOMATION_VERSION,
        targetGenerationKey: generationKey,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { action: "run", runId };
  });
}

function isLegacyAutomaticNews(data: FirebaseFirestore.DocumentData): boolean {
  const origin = firstNonEmpty(data.origem);
  return data.createdBySystem === true && data.automationVersion !== AUTOMATION_VERSION ||
    ["historico_automatico", "automatico"].includes(origin);
}

async function archiveLegacyAutomaticNews(): Promise<number> {
  const snapshot = await db.collection("noticias").get();
  const legacy = snapshot.docs.filter((document) => {
    const data = document.data();
    return isLegacyAutomaticNews(data) && data.feedArchived !== true;
  });
  let archived = 0;

  for (let offset = 0; offset < legacy.length; offset += 400) {
    const batch = db.batch();
    const chunk = legacy.slice(offset, offset + 400);
    chunk.forEach((document) => {
      const current = document.data() || {};
      batch.set(document.ref, {
        status: "arquivado",
        archivedReason: "periodos_abertos_ou_automacao_legada",
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        originalDataCriacao: current.originalDataCriacao || current.dataCriacao || null,
        dataCriacao: admin.firestore.Timestamp.fromDate(new Date(0)),
        feedArchived: true,
      }, { merge: true });
    });
    await batch.commit();
    archived += chunk.length;
  }

  return archived;
}

async function commitGeneratedNews(generated: GeneratedNews[]): Promise<{ created: number; updated: number; ignored: number }> {
  let created = 0;
  let updated = 0;
  let ignored = 0;
  const chunkSize = 180;

  for (let offset = 0; offset < generated.length; offset += chunkSize) {
    const chunk = generated.slice(offset, offset + chunkSize);
    const refs = chunk.map((item) => db.collection("noticias").doc(item.documentId));
    const snapshots = await db.getAll(...refs);
    const batch = db.batch();
    let hasWrites = false;

    chunk.forEach((item, index) => {
      const snapshot = snapshots[index];
      if (!snapshot.exists) {
        batch.create(refs[index], {
          ...item.data,
          curtidasCount: 0,
          comentariosCount: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        created += 1;
        hasWrites = true;
        return;
      }

      const current = snapshot.data() || {};
      if (current.contentHash === item.contentHash && current.status === "publicado") {
        ignored += 1;
        return;
      }

      batch.set(refs[index], {
        ...item.data,
        curtidasCount: Math.max(0, Number(current.curtidasCount || 0)),
        comentariosCount: Math.max(0, Number(current.comentariosCount || 0)),
        lastCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      updated += 1;
      hasWrites = true;
    });

    if (hasWrites) await batch.commit();
  }

  return { created, updated, ignored };
}

async function generateCompletedNews(source: "callable" | "scheduler"): Promise<GenerationResult> {
  const now = new Date();
  const generationKey = currentGenerationKey(now);
  const runId = createHash("sha256")
    .update(`${source}_${generationKey}_${Date.now()}_${Math.random()}`)
    .digest("hex")
    .slice(0, 32);
  const lock = await acquireAutomationLock(runId, generationKey);

  if (lock.action === "completed") {
    return {
      success: true,
      status: "already_completed",
      created: Number(lock.data.createdCount || 0),
      updated: Number(lock.data.updatedCount || 0),
      ignored: Number(lock.data.ignoredCount || 0),
      recordCreated: Number(lock.data.recordCreatedCount || 0),
      recordUpdated: Number(lock.data.recordUpdatedCount || 0),
      recordIgnored: Number(lock.data.recordIgnoredCount || 0),
      archived: Number(lock.data.archivedCount || 0),
      sourceTrips: Number(lock.data.sourceTripCount || 0),
      generationKey,
    };
  }
  if (lock.action === "in_progress") {
    return {
      success: true,
      status: "in_progress",
      created: 0,
      updated: 0,
      ignored: 0,
      recordCreated: 0,
      recordUpdated: 0,
      recordIgnored: 0,
      archived: 0,
      sourceTrips: 0,
      generationKey,
    };
  }

  const controlRef = db.collection("system_settings").doc(CONTROL_DOCUMENT_ID);

  try {
    const controlSnapshot = await controlRef.get();
    const controlData = controlSnapshot.data() || {};
    const migrationCompleted = controlData.migrationCompleted === true;
    const recordsMigrationCompleted = controlData.recordsMigrationCompleted === true;
    const archived = migrationCompleted ? 0 : await archiveLegacyAutomaticNews();
    const rangeStart = migrationCompleted
      ? incrementalRangeStart(controlData.lastGenerationKey, now)
      : historyRangeStart(now);
    const rangeEnd = new Date(startOfCurrentDay(now).getTime() - 1);

    let fullHistorySnapshot: FirebaseFirestore.QuerySnapshot | null = null;
    if (!migrationCompleted || !recordsMigrationCompleted) {
      fullHistorySnapshot = await db.collection("historico_viagens").get();
    }

    const tripsSnapshot = migrationCompleted
      ? await db.collection("historico_viagens")
        .where("completedAt", ">=", admin.firestore.Timestamp.fromDate(rangeStart))
        .where("completedAt", "<=", admin.firestore.Timestamp.fromDate(rangeEnd))
        .get()
      : fullHistorySnapshot as FirebaseFirestore.QuerySnapshot;

    const trips = tripsSnapshot.docs
      .map((document) => normalizeTrip(document, rangeStart, rangeEnd))
      .filter((trip): trip is NormalizedTrip => Boolean(trip));

    const historicalTrips = !recordsMigrationCompleted && fullHistorySnapshot
      ? fullHistorySnapshot.docs
        .map((document) => normalizeTrip(document, new Date(0), rangeEnd))
        .filter((trip): trip is NormalizedTrip => Boolean(trip))
      : [];

    const entityTrips = historicalTrips.length > 0 ? historicalTrips : trips;
    const [companies, users] = await Promise.all([
      getDocumentsByIds("frotas", entityTrips.map((trip) => trip.companyId)),
      getDocumentsByIds("users", entityTrips.map((trip) => trip.driverId)),
    ]);

    const minimumPeriodStart = historyRangeStart(now);
    const periods = collectPeriods(trips, now, ["dia", "semana", "mes"], minimumPeriodStart);
    const generated = generatedNewsFromPeriods(periods, companies, users);
    const result = await commitGeneratedNews(generated);

    // A primeira execução da versão faz uma única leitura histórica para localizar
    // as maiores marcas desde o início da plataforma. Depois disso, somente os
    // períodos semanais e mensais recém-encerrados concorrem com o recorde salvo.
    const recordSourceGenerated = historicalTrips.length > 0
      ? generatedNewsFromPeriods(
        collectPeriods(historicalTrips, now, ["semana", "mes"]),
        companies,
        users,
      )
      : generated.filter((news) => ["semana", "mes"].includes(String(news.data.periodoTipo || "")));
    const recordCandidates = buildHistoricalRecordCandidates(recordSourceGenerated, now);
    const recordResult = await commitHistoricalRecords(recordCandidates);

    await controlRef.set({
      status: "completed",
      runId,
      version: AUTOMATION_VERSION,
      source,
      migrationCompleted: true,
      recordsMigrationCompleted: true,
      lastGenerationKey: generationKey,
      rangeStart: admin.firestore.Timestamp.fromDate(rangeStart),
      rangeEnd: admin.firestore.Timestamp.fromDate(rangeEnd),
      sourceTripCount: trips.length,
      generatedCount: generated.length,
      createdCount: result.created,
      updatedCount: result.updated,
      ignoredCount: result.ignored,
      recordCreatedCount: recordResult.created,
      recordUpdatedCount: recordResult.updated,
      recordIgnoredCount: recordResult.ignored,
      archivedCount: archived,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      publicationPolicy: {
        timeZone: NEWS_TIME_ZONE,
        dailyRun: "00:30",
        daily: "publica o dia anterior",
        weekly: "às segundas-feiras, publica a semana anterior (segunda a domingo)",
        monthly: "no primeiro dia do mês, publica o mês anterior",
        weekDefinition: "segunda-feira a domingo",
        openPeriods: "não publica rankings de períodos ainda em andamento",
        records: "recordes semanais e mensais são publicados uma vez e atualizados somente quando uma marca superior é registrada",
      },
    }, { merge: true });

    return {
      success: true,
      status: "completed",
      created: result.created,
      updated: result.updated,
      ignored: result.ignored,
      recordCreated: recordResult.created,
      recordUpdated: recordResult.updated,
      recordIgnored: recordResult.ignored,
      archived,
      sourceTrips: trips.length,
      generationKey,
    };
  } catch (error) {
    await controlRef.set({
      status: "failed",
      runId,
      version: AUTOMATION_VERSION,
      source,
      generationKey,
      error: error instanceof Error ? error.message : String(error),
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.error("[NVU NEWS] Falha ao gerar notícias organizadas:", error);
    throw error;
  }
}

export const generateNvuNewsBackfill = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Autenticação obrigatória para carregar o NVU News.");
    }

    try {
      return await generateCompletedNews("callable");
    } catch (error) {
      throw new functions.https.HttpsError("internal", "Não foi possível atualizar as notícias do NVU News.");
    }
  });

export const generateNvuNewsScheduled = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .pubsub.schedule("30 0 * * *")
  .timeZone(NEWS_TIME_ZONE)
  .onRun(async () => {
    await generateCompletedNews("scheduler");
    return null;
  });
