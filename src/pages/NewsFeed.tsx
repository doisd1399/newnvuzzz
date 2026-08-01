import React, { useState, useEffect, useMemo } from "react";
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs,
  serverTimestamp,
  doc,
  getDoc,
  runTransaction,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useOperationalStore, useSessionStore } from "../context/AppContext";
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  RefreshCw, 
  Newspaper, 
  Building2, 
  User, 
  Send,
  Trophy,
  Activity,
  Megaphone,
  Search,
  SlidersHorizontal,
  X,
  Clock3,
  Banknote,
  CalendarDays,
  Gamepad2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "../components/ui/Button";
import { StableImage } from "../components/common/StableImage";
import { cn } from "../lib/utils";
import { ensureNvuNewsBackfill } from "../services/nvuNewsBackfillService";
import { resolveDriverPhoto } from "../lib/resolveDriverPhoto";
import { toast } from "sonner";



const NEWS_TIME_ZONE = "America/Sao_Paulo";
const NEWS_PAGE_SIZE = 20;
const NEWS_INITIAL_SCAN_LIMIT = 100;

function normalizeLookup(value: unknown): string {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function simulatorFilterKey(value: unknown): string {
  const normalized = normalizeLookup(value).replace(/[^a-z0-9]/g, "");
  if (!normalized) return "";
  if (normalized === "gto" || normalized.includes("globaltruckonline")) return "gto";
  if (normalized === "ets2" || normalized.includes("eurotrucksimulator2")) return "ets2";
  if (normalized === "ats" || normalized.includes("americantrucksimulator")) return "ats";
  if (normalized === "toe3" || normalized.includes("truckersofeurope3")) return "toe3";
  return normalized;
}

function timestampToDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value?.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function zonedDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NEWS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function zonedDateKey(date: Date): string {
  const parts = zonedDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function currentMondayKey(now: Date): string {
  const parts = zonedDateParts(now);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const offset = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - offset);
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function zonedDayNumber(date: Date): number {
  const parts = zonedDateParts(date);
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

function zonedWeekday(date: Date): number {
  const parts = zonedDateParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function isValidPeriodInterval(periodType: string, start: Date, end: Date): boolean {
  const startParts = zonedDateParts(start);
  const endParts = zonedDateParts(end);
  const daySpan = zonedDayNumber(end) - zonedDayNumber(start);

  if (periodType === "dia") return daySpan === 0;
  if (periodType === "semana") {
    // Política oficial do NVU News: segunda-feira até domingo.
    return zonedWeekday(start) === 1 && zonedWeekday(end) === 0 && daySpan === 6;
  }
  if (periodType === "mes") {
    const nextMonthFirstDay = Date.UTC(startParts.year, startParts.month, 1);
    const expectedLastDay = new Date(nextMonthFirstDay - 1).getUTCDate();
    return startParts.day === 1 &&
      endParts.year === startParts.year &&
      endParts.month === startParts.month &&
      endParts.day === expectedLastDay;
  }
  return true;
}

function isClosedAutomaticPeriod(post: any, now = new Date()): boolean {
  const automatic =
    post?.tipo === "automatico" ||
    post?.createdBySystem === true ||
    normalizeLookup(post?.origem).includes("automatico");
  if (!automatic) return true;

  const periodType = firstNonEmpty(
    post?.periodoTipo,
    String(post?.categoria || "").includes("_mes_") ? "mes" : "",
    String(post?.categoria || "").includes("_semana_") ? "semana" : "",
    String(post?.categoria || "").includes("_dia_") ? "dia" : "",
  );
  const start = timestampToDate(post?.periodoInicio);
  const end = timestampToDate(post?.periodoFim);
  if (!periodType || !start) return true;

  // Impede que registros antigos com calendário semanal incorreto
  // (por exemplo, domingo a sábado) sejam apresentados como vencedores.
  if (end && !isValidPeriodInterval(periodType, start, end)) return false;

  const scheduledPublication = timestampToDate(post?.publicacaoProgramadaEm);
  if (scheduledPublication) return now.getTime() >= scheduledPublication.getTime();
  if (end) return now.getTime() >= end.getTime() + 30 * 60 * 1000;

  // Compatibilidade somente para documentos antigos sem periodoFim.
  const startKey = zonedDateKey(start);
  const todayKey = zonedDateKey(now);
  if (periodType === "dia") return startKey < todayKey;
  if (periodType === "semana") return startKey < currentMondayKey(now);
  if (periodType === "mes") {
    const startParts = zonedDateParts(start);
    const nowParts = zonedDateParts(now);
    return startParts.year < nowParts.year ||
      (startParts.year === nowParts.year && startParts.month < nowParts.month);
  }
  return true;
}

function formatNewsDate(date: Date, includeYear = true): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: NEWS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    ...(includeYear ? { year: "numeric" as const } : {}),
  }).format(date);
}

function formatNewsWeekday(date: Date, short = false): string {
  const value = new Intl.DateTimeFormat("pt-BR", {
    timeZone: NEWS_TIME_ZONE,
    weekday: short ? "short" : "long",
  }).format(date).replace(/\.$/, "");
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function formatDailyNewsLabel(date: Date, compact = false): string {
  if (compact) {
    return `${formatNewsWeekday(date, true)}, ${new Intl.DateTimeFormat("pt-BR", {
      timeZone: NEWS_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(date)}`;
  }
  return `${formatNewsWeekday(date)}, ${formatNewsDate(date)}`;
}

function formatNewsPeriod(post: any): string {
  const start = timestampToDate(post?.periodoInicio);
  const end = timestampToDate(post?.periodoFim);
  const periodType = firstNonEmpty(post?.periodoTipo);

  if (start && end) {
    if (periodType === "dia") return formatDailyNewsLabel(start);
    if (periodType === "semana") {
      const startParts = zonedDateParts(start);
      const endParts = zonedDateParts(end);
      const sameYear = startParts.year === endParts.year;
      return `${formatNewsDate(start, !sameYear)} a ${formatNewsDate(end)}`;
    }
    if (periodType === "mes") {
      const label = new Intl.DateTimeFormat("pt-BR", {
        timeZone: NEWS_TIME_ZONE,
        month: "long",
        year: "numeric",
      }).format(start);
      return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
    }
  }

  return String(post?.periodo || "").replace(/^(Dia|Semana)\s+/i, "").trim();
}

function formatCompactNewsPeriod(post: any): string {
  const start = timestampToDate(post?.periodoInicio);
  const end = timestampToDate(post?.periodoFim);
  const periodType = firstNonEmpty(post?.periodoTipo);
  if (!start) return formatNewsPeriod(post);

  if (periodType === "dia") {
    return formatDailyNewsLabel(start, true);
  }
  if (periodType === "semana" && end) {
    const startLabel = new Intl.DateTimeFormat("pt-BR", {
      timeZone: NEWS_TIME_ZONE, day: "2-digit", month: "2-digit",
    }).format(start);
    const endLabel = new Intl.DateTimeFormat("pt-BR", {
      timeZone: NEWS_TIME_ZONE, day: "2-digit", month: "2-digit", year: "2-digit",
    }).format(end);
    return `${startLabel}–${endLabel}`;
  }
  if (periodType === "mes") {
    const value = new Intl.DateTimeFormat("pt-BR", {
      timeZone: NEWS_TIME_ZONE, month: "short", year: "numeric",
    }).format(start).replace(/\./g, "");
    return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
  }
  return formatNewsPeriod(post);
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function ensurePeriodContext(post: any, message: string): string {
  const normalized = String(message || "").trim();
  if (!normalized) return normalized;
  const periodType = firstNonEmpty(post?.periodoTipo);
  const start = timestampToDate(post?.periodoInicio);
  const end = timestampToDate(post?.periodoFim);
  const normalizedMessage = normalizeLookup(normalized);

  if (periodType === "dia" && start) {
    const fullLabel = formatDailyNewsLabel(start);
    const dateLabel = formatNewsDate(start);
    const weekdayLabel = formatNewsWeekday(start);
    if (
      normalizedMessage.includes(normalizeLookup(dateLabel)) &&
      normalizedMessage.includes(normalizeLookup(weekdayLabel))
    ) {
      return normalized;
    }
    return `${fullLabel}: ${normalized}`;
  }

  if (periodType !== "semana" || !start || !end) return normalized;
  const startLabel = formatNewsDate(start);
  const endLabel = formatNewsDate(end);
  if (normalizedMessage.includes(normalizeLookup(startLabel)) && normalizedMessage.includes(normalizeLookup(endLabel))) {
    return normalized;
  }
  return `${normalized} O resultado considera as operações registradas entre ${startLabel} e ${endLabel}.`;
}

function shortPersonName(value: unknown): string {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const parts = normalized.split(" ");
  return parts.length <= 2 ? normalized : `${parts[0]} ${parts[parts.length - 1]}`;
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (normalized) return normalized;
  }
  return "";
}

function resolveCompanyLogo(company: any, post?: any): string {
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
    post?.empresaLogo,
  );
}

function resolveNewsDriverPhoto(driver: any, post?: any): string {
  return firstNonEmpty(
    resolveDriverPhoto(driver),
    driver?.applicationPhotoURL,
    driver?.applicationPhotoUrl,
    driver?.authPhotoURL,
    post?.motoristaFoto,
  );
}

function normalizePostPresentation(post: any, company?: any, driver?: any) {
  const fullDriverName = firstNonEmpty(
    driver?.name,
    driver?.fullName,
    driver?.displayName,
    post.motoristaNomeCompleto,
    post.motoristaNome,
  );
  const motoristaNome = shortPersonName(fullDriverName);
  const empresaNome = firstNonEmpty(
    company?.companyName,
    company?.fleetName,
    company?.name,
    post.empresaNome,
  );
  return {
    ...post,
    motoristaNome,
    motoristaNomeCompleto: fullDriverName,
    empresaNome,
    motoristaFoto: resolveNewsDriverPhoto(driver, post),
    empresaLogo: resolveCompanyLogo(company, post),
  };
}

const newsCompanyCache = new Map<string, any>();
const newsDriverCache = new Map<string, any>();

async function hydrateNewsEntities(
  posts: any[],
  companies: any[],
  users: any[],
): Promise<{ companyById: Map<string, any>; userById: Map<string, any> }> {
  const companyById = new Map<string, any>();
  const userById = new Map<string, any>();

  (companies || []).forEach((company: any) => {
    const id = String(company?.id || "").trim();
    if (id) companyById.set(id, company);
  });
  (users || []).forEach((user: any) => {
    const id = String(user?.id || "").trim();
    if (id) userById.set(id, user);
  });
  newsCompanyCache.forEach((company, id) => companyById.set(id, company));
  newsDriverCache.forEach((user, id) => userById.set(id, user));

  const missingCompanyIds = Array.from(new Set(
    posts
      .map((post) => String(post?.empresaId || "").trim())
      .filter((id) => id && !companyById.has(id)),
  ));
  const missingDriverIds = Array.from(new Set(
    posts
      .map((post) => String(post?.motoristaId || "").trim())
      .filter((id) => id && !userById.has(id)),
  ));

  await Promise.all([
    ...missingCompanyIds.map(async (id) => {
      try {
        const snapshot = await getDoc(doc(db, "frotas", id));
        if (!snapshot.exists()) return;
        const company = { id: snapshot.id, ...snapshot.data() };
        newsCompanyCache.set(id, company);
        companyById.set(id, company);
      } catch (error) {
        console.warn(`[NVU NEWS] Não foi possível recuperar a empresa ${id}:`, error);
      }
    }),
    ...missingDriverIds.map(async (id) => {
      try {
        const snapshot = await getDoc(doc(db, "users", id));
        if (!snapshot.exists()) return;
        const user = { id: snapshot.id, ...snapshot.data() };
        newsDriverCache.set(id, user);
        userById.set(id, user);
      } catch (error) {
        console.warn(`[NVU NEWS] Não foi possível recuperar o motorista ${id}:`, error);
      }
    }),
  ]);

  return { companyById, userById };
}

const NEWS_TEMPLATES: Record<string, string[]> = {
  melhor_motorista_dia_viagens: [
    "{motoristaNome} foi o motorista mais ativo do dia, concluindo impressionantes {quantidadeViagens} viagens! Um excelente trabalho pela {empresaNome}.",
    "Destaque do dia! {motoristaNome} liderou com {quantidadeViagens} viagens concluídas. Parabéns pela dedicação na {empresaNome}!",
    "Com {quantidadeViagens} viagens no dia, {motoristaNome} alcançou o maior volume operacional pela {empresaNome}.",
  ],
  melhor_motorista_dia_ganhos: [
    "O maior ganho do dia vai para {motoristaNome}, que movimentou {valorMovimentado}! Um desempenho incrível pela {empresaNome}.",
    "{motoristaNome} é o destaque financeiro do dia, atingindo {valorMovimentado} em ganhos. Excelente trabalho!",
    "Com {valorMovimentado} em ganhos, {motoristaNome} liderou o resultado diário da {empresaNome}."
  ],
  melhor_motorista_semana_viagens: [
    "Fechando a semana com chave de ouro: {motoristaNome} realizou {quantidadeViagens} viagens. A {empresaNome} agradece o empenho!",
    "O motorista mais ativo da semana foi {motoristaNome} com {quantidadeViagens} viagens. Um verdadeiro exemplo de produtividade!",
    "Com ritmo consistente, {motoristaNome} foi o destaque semanal da {empresaNome}, somando {quantidadeViagens} viagens."
  ],
  melhor_motorista_semana_ganhos: [
    "O topo do ranking de ganhos da semana pertence a {motoristaNome}, movimentando {valorMovimentado}!",
    "Semana espetacular para {motoristaNome}, que liderou os ganhos com {valorMovimentado}. Parabéns!",
    "Com {valorMovimentado} no período, {motoristaNome} foi o destaque financeiro semanal da {empresaNome}."
  ],
  melhor_motorista_mes_viagens: [
    "O motorista do mês é {motoristaNome}! Foram {quantidadeViagens} viagens concluídas com excelência pela {empresaNome}.",
    "Destaque mensal absoluto: {motoristaNome} completou {quantidadeViagens} viagens. Um marco impressionante!",
    "Com {quantidadeViagens} viagens no mês, {motoristaNome} conquistou o principal destaque operacional da {empresaNome}."
  ],
  melhor_motorista_mes_ganhos: [
    "Recorde do mês! {motoristaNome} movimentou {valorMovimentado} e garantiu o primeiro lugar nos ganhos mensais.",
    "O grande campeão de ganhos do mês é {motoristaNome}, alcançando {valorMovimentado}. Parabéns pela conquista na {empresaNome}!",
    "Com {valorMovimentado} em ganhos mensais, {motoristaNome} conquistou o destaque financeiro da {empresaNome}."
  ],
  melhor_empresa_dia_viagens: [
    "A {empresaNome} liderou o dia com {quantidadeViagens} viagens realizadas por sua frota. Excelente coordenação!",
    "Destaque empresarial do dia: {empresaNome} atingiu a marca de {quantidadeViagens} viagens.",
    "Com {quantidadeViagens} viagens no dia, a {empresaNome} alcançou o maior volume operacional da plataforma."
  ],
  melhor_empresa_dia_movimentacao: [
    "O maior volume financeiro do dia foi da {empresaNome}, movimentando {valorMovimentado}.",
    "Dia produtivo! A {empresaNome} liderou a movimentação diária com {valorMovimentado}.",
    "Com {valorMovimentado} no dia, a {empresaNome} liderou a movimentação da plataforma."
  ],
  melhor_empresa_semana_viagens: [
    "A frota mais ativa da semana foi a {empresaNome}, completando incríveis {quantidadeViagens} viagens!",
    "Trabalho em equipe impecável da {empresaNome}, que liderou a semana com {quantidadeViagens} viagens.",
    "Com {quantidadeViagens} viagens no período, a {empresaNome} liderou o desempenho operacional da semana."
  ],
  melhor_empresa_semana_movimentacao: [
    "A {empresaNome} dominou a semana financeiramente, movimentando {valorMovimentado}.",
    "Resultados semanais: {empresaNome} no topo com {valorMovimentado} em movimentações!",
    "Com {valorMovimentado} no período, a {empresaNome} conquistou o destaque financeiro da semana."
  ],
  melhor_empresa_mes_viagens: [
    "A Empresa do Mês por volume de viagens é a {empresaNome}, totalizando {quantidadeViagens} viagens!",
    "Um mês histórico para a {empresaNome}, liderando o ranking geral com {quantidadeViagens} viagens concluídas.",
    "Com {quantidadeViagens} viagens mensais, a {empresaNome} conquistou a liderança operacional da plataforma."
  ],
  melhor_empresa_mes_movimentacao: [
    "A gigante do mês! {empresaNome} liderou as movimentações financeiras com {valorMovimentado}.",
    "Consistência e resultado: {empresaNome} é o destaque financeiro do mês com {valorMovimentado}.",
    "Com {valorMovimentado} em operações no mês, a {empresaNome} liderou a movimentação da plataforma."
  ]
};

const NEWS_CATEGORY_LABELS: Record<string, string> = {
  melhor_motorista_dia_viagens: "Mais viagens do dia",
  melhor_motorista_dia_ganhos: "Maior ganho do dia",
  melhor_motorista_semana_viagens: "Mais viagens da semana",
  melhor_motorista_semana_ganhos: "Maior ganho da semana",
  melhor_motorista_mes_viagens: "Mais viagens do mês",
  melhor_motorista_mes_ganhos: "Maior ganho do mês",
  melhor_empresa_dia_viagens: "Empresa do dia",
  melhor_empresa_dia_movimentacao: "Maior movimentação do dia",
  melhor_empresa_semana_viagens: "Empresa da semana",
  melhor_empresa_semana_movimentacao: "Maior movimentação da semana",
  melhor_empresa_mes_viagens: "Empresa do mês",
  melhor_empresa_mes_movimentacao: "Maior movimentação do mês",
  recorde_motorista_semana_viagens: "Recorde semanal de viagens",
  recorde_motorista_semana_ganhos: "Recorde semanal de ganhos",
  recorde_motorista_mes_viagens: "Recorde mensal de viagens",
  recorde_motorista_mes_ganhos: "Recorde mensal de ganhos",
  recorde_empresa_semana_viagens: "Recorde semanal da empresa",
  recorde_empresa_semana_movimentacao: "Recorde semanal de movimentação",
  recorde_empresa_mes_viagens: "Recorde mensal da empresa",
  recorde_empresa_mes_movimentacao: "Recorde mensal de movimentação",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function resolveMessage(post: any) {
  let message = "";
  if (post.mensagem) {
    const fullName = String(post.motoristaNomeCompleto || post.motoristaNome || "").trim();
    const shortName = shortPersonName(fullName);
    message = fullName && shortName && fullName !== shortName
      ? String(post.mensagem).split(fullName).join(shortName)
      : String(post.mensagem);
  } else if (post.tipo !== "manual" && post.categoria && NEWS_TEMPLATES[post.categoria]) {
    const templates = NEWS_TEMPLATES[post.categoria];
    const hash = post.id ? post.id.charCodeAt(0) % templates.length : 0;
    message = templates[hash]
      .replace(/{motoristaNome}/g, post.motoristaNome || "Motorista")
      .replace(/{empresaNome}/g, post.empresaNome || "Empresa")
      .replace(/{quantidadeViagens}/g, post.quantidadeViagens?.toString() || "0")
      .replace(/{valorMovimentado}/g, post.valorMovimentado ? formatCurrency(post.valorMovimentado) : "R$ 0,00")
      .replace(/{simulador}/g, post.simulador || "")
      .replace(/{periodo}/g, post.periodo || "");
  }
  return ensurePeriodContext(post, message);
}


function postPeriodType(post: any): string {
  return firstNonEmpty(
    post?.periodoTipo,
    String(post?.categoria || "").includes("_semana_") ? "semana" : "",
    String(post?.categoria || "").includes("_mes_") ? "mes" : "",
    String(post?.categoria || "").includes("_dia_") ? "dia" : "",
  );
}


function displayNewsTitle(post: any): string {
  const original = String(post?.titulo || "").trim();
  const periodType = postPeriodType(post);
  const start = timestampToDate(post?.periodoInicio);
  if (periodType !== "dia" || !start) return original;

  const label = formatDailyNewsLabel(start);
  if (normalizeLookup(original).includes(normalizeLookup(label))) return original;
  const base = original || (String(post?.categoria || "").includes("empresa")
    ? "Destaque empresarial do dia"
    : "Destaque do motorista no dia");
  return `${base.replace(/\s*[—-]\s*.*$/, "")} — ${label}`;
}

function displayNewsCategory(post: any): string {
  const base = NEWS_CATEGORY_LABELS[post?.categoria] || String(post?.categoria || "");
  const periodType = postPeriodType(post);
  const start = timestampToDate(post?.periodoInicio);
  if (periodType !== "dia" || !start) return base;
  return `${base} • ${formatDailyNewsLabel(start, true)}`;
}

type NewsFeedSectionKey = "manual" | "dia" | "semana" | "mes" | "recorde" | "historico_dia" | "outros";

const NEWS_FEED_SECTION_ORDER: Record<NewsFeedSectionKey, number> = {
  manual: 0,
  dia: 1,
  semana: 2,
  mes: 3,
  recorde: 4,
  historico_dia: 5,
  outros: 6,
};

const NEWS_FEED_SECTION_META: Record<NewsFeedSectionKey, { title: string; description: string }> = {
  manual: {
    title: "Comunicados oficiais",
    description: "Avisos e atualizações publicados pela administração do NVU.",
  },
  dia: {
    title: "Destaques dos dias",
    description: "Destaques dos últimos sete dias encerrados, do mais recente para o mais antigo.",
  },
  semana: {
    title: "Fechamentos semanais",
    description: "Resumos consolidados de semanas completas, de segunda-feira a domingo.",
  },
  mes: {
    title: "Fechamentos mensais",
    description: "Resultados finais de meses já encerrados, sem antecipar o período atual.",
  },
  recorde: {
    title: "Recordes históricos",
    description: "Maiores marcas semanais e mensais registradas desde o início da plataforma.",
  },
  historico_dia: {
    title: "Dias anteriores",
    description: "Resultados diários mais antigos preservados para consulta no histórico.",
  },
  outros: {
    title: "Outras notícias",
    description: "Publicações adicionais da plataforma.",
  },
};

function newsFeedSection(post: any): NewsFeedSectionKey {
  if (post?.tipo === "manual" || post?.origem === "senior") return "manual";
  if (post?.recordeHistorico === true || String(post?.categoria || "").startsWith("recorde_")) return "recorde";
  const type = postPeriodType(post);
  if (type === "dia" || type === "semana" || type === "mes") return type;
  return "outros";
}

function postReferenceTime(post: any): number {
  const end = timestampToDate(post?.periodoFim)?.getTime();
  const start = timestampToDate(post?.periodoInicio)?.getTime();
  const scheduled = timestampToDate(post?.publicacaoProgramadaEm)?.getTime();
  const created = timestampToDate(post?.dataCriacao)?.getTime();
  return end || start || scheduled || created || 0;
}

function postCategoryOrder(post: any): number {
  const category = String(post?.categoria || "");
  if (category.includes("empresa") && category.includes("viagens")) return 0;
  if (category.includes("empresa") && (category.includes("movimentacao") || category.includes("ganhos"))) return 1;
  if (category.includes("motorista") && category.includes("viagens")) return 2;
  if (category.includes("motorista") && category.includes("ganhos")) return 3;
  return 4;
}

function compareNewsFeedPosts(left: any, right: any): number {
  const leftSection = newsFeedSection(left);
  const rightSection = newsFeedSection(right);
  const sectionDifference = NEWS_FEED_SECTION_ORDER[leftSection] - NEWS_FEED_SECTION_ORDER[rightSection];
  if (sectionDifference !== 0) return sectionDifference;

  const referenceDifference = postReferenceTime(right) - postReferenceTime(left);
  if (referenceDifference !== 0) return referenceDifference;

  const categoryDifference = postCategoryOrder(left) - postCategoryOrder(right);
  if (categoryDifference !== 0) return categoryDifference;

  const leftCreated = timestampToDate(left?.dataCriacao)?.getTime() || 0;
  const rightCreated = timestampToDate(right?.dataCriacao)?.getTime() || 0;
  if (rightCreated !== leftCreated) return rightCreated - leftCreated;
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function postMatchesSimulator(post: any, simulatorKey: string): boolean {
  if (!simulatorKey || simulatorKey === "all") return true;
  if (post?.tipo === "manual" && !post?.simulador && !post?.simuladorId) return true;
  return simulatorFilterKey(post?.simuladorKey || post?.simulador || post?.simuladorId) === simulatorKey;
}

function hasWeeklyAndMonthlyCoverage(posts: any[], simulatorKey: string): boolean {
  const eligible = posts.filter((post) => {
    const status = String(post?.status || "publicado").toLowerCase();
    return ["publicado", "ativo", "active"].includes(status) &&
      post?.recordeHistorico !== true &&
      postMatchesSimulator(post, simulatorKey) &&
      isClosedAutomaticPeriod(post);
  });
  return eligible.some((post) => postPeriodType(post) === "semana") &&
    eligible.some((post) => postPeriodType(post) === "mes");
}

export default function NewsFeed() {
  const { currentUser, activeRole, activeCompanyId, isSeniorAuthenticated, allCompanies, companies } = useSessionStore();
  const { users, simulators } = useOperationalStore();
  const [posts, setPosts] = useState<any[]>([]);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSimulator, setSelectedSimulator] = useState("all");
  const [remoteSearchPosts, setRemoteSearchPosts] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);

  const isAdmin = activeRole === "admin" || isSeniorAuthenticated;
  const currentMonthLabel = useMemo(() => {
    const value = new Intl.DateTimeFormat("pt-BR", {
      timeZone: NEWS_TIME_ZONE,
      month: "long",
      year: "numeric",
    }).format(new Date());
    return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
  }, []);

  const activeCompany = useMemo(() => {
    const companyList = [...(allCompanies || []), ...(companies || [])];
    return companyList.find((company: any) => company.id === activeCompanyId);
  }, [activeCompanyId, allCompanies, companies]);

  const activeSimulatorKey = useMemo(() => simulatorFilterKey(
    activeCompany?.simulatorName ||
    activeCompany?.simuladorNome ||
    activeCompany?.simulatorId ||
    activeCompany?.simuladorId ||
    (currentUser as any)?.currentRecruitmentSimulatorId,
  ), [activeCompany, currentUser]);

  const simulatorOptions = useMemo(() => {
    const map = new Map<string, string>();
    const add = (value: unknown, label?: unknown) => {
      const key = simulatorFilterKey(label || value);
      if (!key || key === "naoinformado") return;
      const resolvedLabel = firstNonEmpty(label, value);
      if (!resolvedLabel) return;
      if (!map.has(key) || String(map.get(key)).length > resolvedLabel.length) {
        map.set(key, resolvedLabel);
      }
    };

    (simulators || []).forEach((simulator: any) => add(simulator?.id, simulator?.name));
    [...(allCompanies || []), ...(companies || [])].forEach((company: any) => {
      add(company?.simulatorId || company?.simuladorId, company?.simulatorName || company?.simuladorNome);
    });
    posts.forEach((post: any) => add(post?.simuladorId, post?.simulador));

    if (activeSimulatorKey) {
      add(
        activeSimulatorKey,
        activeCompany?.simulatorName || activeCompany?.simuladorNome || activeSimulatorKey.toUpperCase(),
      );
    }

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
  }, [activeCompany, activeSimulatorKey, allCompanies, companies, posts, simulators]);

  useEffect(() => {
    setSelectedSimulator(activeSimulatorKey || "all");
  }, [activeCompanyId, activeSimulatorKey]);

  const visiblePosts = useMemo(() => {
    const normalizedSearch = normalizeLookup(searchTerm);
    const source = normalizedSearch.length >= 3
      ? Array.from(new Map([...remoteSearchPosts, ...posts].map((post: any) => [post.id, post])).values())
      : posts;
    return source.filter((post: any) => {
      if (!isClosedAutomaticPeriod(post)) return false;

      const postSimulatorKey = simulatorFilterKey(post.simulador || post.simuladorId);
      const isGeneralCommunication = post.tipo === "manual" && !postSimulatorKey;
      if (selectedSimulator !== "all" && !isGeneralCommunication && postSimulatorKey !== selectedSimulator) {
        return false;
      }

      if (!normalizedSearch) return true;
      const searchable = normalizeLookup([
        post.motoristaNome,
        post.motoristaNomeCompleto,
        post.empresaNome,
        post.simulador,
        post.simuladorId,
        post.titulo,
        displayNewsTitle(post),
        post.mensagem,
        resolveMessage(post),
        post.periodo,
        NEWS_CATEGORY_LABELS[post.categoria] || post.categoria,
      ].filter(Boolean).join(" "));
      return searchable.includes(normalizedSearch);
    }).sort(compareNewsFeedPosts);
  }, [posts, remoteSearchPosts, searchTerm, selectedSimulator]);

  const groupedVisiblePosts = useMemo(() => {
    const recentDailyKeys = new Set(
      Array.from(new Set(
        visiblePosts
          .filter((post) => newsFeedSection(post) === "dia")
          .map((post) => zonedDateKey(timestampToDate(post?.periodoInicio) || new Date(0))),
      )).sort((left, right) => right.localeCompare(left)).slice(0, 7),
    );

    const groups = new Map<NewsFeedSectionKey, any[]>();
    visiblePosts.forEach((post) => {
      let section = newsFeedSection(post);
      if (section === "dia") {
        const periodKey = zonedDateKey(timestampToDate(post?.periodoInicio) || new Date(0));
        if (!recentDailyKeys.has(periodKey)) section = "historico_dia";
      }
      const current = groups.get(section) || [];
      current.push(post);
      groups.set(section, current);
    });

    return (Object.keys(NEWS_FEED_SECTION_ORDER) as NewsFeedSectionKey[])
      .sort((left, right) => NEWS_FEED_SECTION_ORDER[left] - NEWS_FEED_SECTION_ORDER[right])
      .map((key) => ({ key, meta: NEWS_FEED_SECTION_META[key], posts: groups.get(key) || [] }))
      .filter((group) => group.posts.length > 0);
  }, [visiblePosts]);

  useEffect(() => {
    const normalizedSearch = normalizeLookup(searchTerm);
    if (normalizedSearch.length < 3 || !currentUser?.id) {
      setRemoteSearchPosts([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const token = normalizedSearch
          .split(" ")
          .filter(Boolean)
          .sort((left, right) => right.length - left.length)[0]?.slice(0, 18);
        if (!token) return;

        const snapshot = await getDocs(query(
          collection(db, "noticias"),
          where("searchTokens", "array-contains", token),
          limit(60),
        ));
        const rawPosts = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        }));
        const entities = await hydrateNewsEntities(rawPosts, allCompanies || [], users || []);
        const hydrated = rawPosts.map((rawPost: any) => normalizePostPresentation(
          rawPost,
          entities.companyById.get(String(rawPost.empresaId || "")),
          entities.userById.get(String(rawPost.motoristaId || "")),
        ));
        const filtered = hydrated.filter((post: any) => {
          const normalizedStatus = String(post.status || "publicado").toLowerCase();
          if (!["publicado", "ativo", "active"].includes(normalizedStatus)) return false;
          if (!isAdmin && post.visibilidade === "privado") return false;
          if (post.publicoAlvo === "empresas" && !isAdmin) return false;
          if (post.publicoAlvo === "motoristas" && isAdmin && !isSeniorAuthenticated) return false;
          if (post.publicoAlvo === "empresa_especifica" && post.empresaId !== activeCompanyId && !isSeniorAuthenticated) return false;
          if (post.publicoAlvo === "motorista_especifico" && post.motoristaId !== currentUser.id && !isSeniorAuthenticated) return false;
          return true;
        }).sort(compareNewsFeedPosts);
        if (!cancelled) setRemoteSearchPosts(filtered);
      } catch (error) {
        console.warn("[NVU NEWS] Pesquisa remota indisponível:", error);
        if (!cancelled) setRemoteSearchPosts([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchTerm, currentUser?.id, activeCompanyId, allCompanies, users, isAdmin, isSeniorAuthenticated]);

  const fetchPosts = async (isLoadMore = false) => {
    if (!currentUser) return;

    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const postsRef = collection(db, "noticias");
      const rawDocuments: any[] = [];
      let cursor = isLoadMore ? lastVisible : null;
      let lastBatchSize = 0;
      const coverageSimulator = selectedSimulator !== "all"
        ? selectedSimulator
        : activeSimulatorKey || "all";

      do {
        const q = cursor
          ? query(postsRef, orderBy("dataCriacao", "desc"), startAfter(cursor), limit(NEWS_PAGE_SIZE))
          : query(postsRef, orderBy("dataCriacao", "desc"), limit(NEWS_PAGE_SIZE));
        const snapshot = await getDocs(q);
        lastBatchSize = snapshot.docs.length;
        rawDocuments.push(...snapshot.docs);
        cursor = snapshot.docs[snapshot.docs.length - 1] || cursor;

        if (isLoadMore || lastBatchSize < NEWS_PAGE_SIZE) break;
        const rawPreview = rawDocuments.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }));
        if (hasWeeklyAndMonthlyCoverage(rawPreview, coverageSimulator)) break;
      } while (rawDocuments.length < NEWS_INITIAL_SCAN_LIMIT);

      const rawPosts = rawDocuments.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...snapshotDoc.data(),
      }));
      const entities = await hydrateNewsEntities(rawPosts, allCompanies || [], users || []);
      const fetchedPosts = rawPosts.map((rawPost: any) => normalizePostPresentation(
        rawPost,
        entities.companyById.get(String(rawPost.empresaId || "")),
        entities.userById.get(String(rawPost.motoristaId || "")),
      ));

      const filteredPosts = fetchedPosts.filter((post: any) => {
        const normalizedStatus = String(post.status || "publicado").toLowerCase();
        if (!["publicado", "ativo", "active"].includes(normalizedStatus)) return false;
        if (!isAdmin && post.visibilidade === "privado") return false;
        if (post.publicoAlvo === "empresas" && !isAdmin) return false;
        if (post.publicoAlvo === "motoristas" && isAdmin && !isSeniorAuthenticated) return false;
        if (post.publicoAlvo === "empresa_especifica" && post.empresaId !== activeCompanyId && !isSeniorAuthenticated) return false;
        if (post.publicoAlvo === "motorista_especifico" && post.motoristaId !== currentUser.id && !isSeniorAuthenticated) return false;
        return true;
      });

      if (isLoadMore) {
        setPosts((previous) => Array.from(new Map(
          [...previous, ...filteredPosts].map((post: any) => [post.id, post]),
        ).values()));
      } else {
        setPosts(filteredPosts);
      }

      setLastVisible(cursor);
      setHasMore(lastBatchSize === NEWS_PAGE_SIZE);
      filteredPosts.forEach((post) => { void checkUserLike(post.id); });
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const checkUserLike = async (postId: string) => {
    if (!currentUser) return;
    try {
      const likeRef = doc(db, `noticias/${postId}/curtidas`, currentUser.id);
      const likeSnap = await getDoc(likeRef);
      if (likeSnap.exists()) {
        setLikedPosts(prev => {
          const next = new Set(prev);
          next.add(postId);
          return next;
        });
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    let cancelled = false;

    if (!currentUser?.id) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const initializeFeed = async () => {
      setLoading(true);
      try {
        await ensureNvuNewsBackfill();
      } catch (error) {
        // A função precisa estar publicada no Firebase. O feed existente ainda
        // é carregado normalmente caso o deploy das Functions esteja pendente.
        console.warn("[NVU NEWS] Backfill histórico indisponível:", error);
      }

      if (!cancelled) await fetchPosts();
    };

    void initializeFeed();
    return () => {
      cancelled = true;
    };
  }, [activeRole, activeCompanyId, currentUser?.id, allCompanies, users]);

  const toggleLike = async (postId: string, isLiked: boolean) => {
    if (!currentUser) return;

    const delta = isLiked ? -1 : 1;
    setLikedPosts((previous) => {
      const next = new Set(previous);
      if (isLiked) next.delete(postId);
      else next.add(postId);
      return next;
    });
    setPosts((previous) => previous.map((post) =>
      post.id === postId
        ? { ...post, curtidasCount: Math.max(0, Number(post.curtidasCount || 0) + delta) }
        : post,
    ));

    try {
      const postRef = doc(db, "noticias", postId);
      const likeRef = doc(db, `noticias/${postId}/curtidas`, currentUser.id);
      const result = await runTransaction(db, async (transaction) => {
        const [postSnapshot, likeSnapshot] = await Promise.all([
          transaction.get(postRef),
          transaction.get(likeRef),
        ]);
        if (!postSnapshot.exists()) throw new Error("Notícia não encontrada.");

        const postData = postSnapshot.data();
        const currentCount = Math.max(0, Number(postData.curtidasCount || 0));
        const currentComments = Math.max(0, Number(postData.comentariosCount || 0));
        if (likeSnapshot.exists()) {
          transaction.delete(likeRef);
          const nextCount = Math.max(0, currentCount - 1);
          transaction.update(postRef, {
            curtidasCount: nextCount,
            comentariosCount: currentComments,
          });
          return { liked: false, count: nextCount };
        }

        transaction.set(likeRef, {
          userId: currentUser.id,
          createdAt: serverTimestamp(),
        });
        const nextCount = currentCount + 1;
        transaction.update(postRef, {
          curtidasCount: nextCount,
          comentariosCount: currentComments,
        });
        return { liked: true, count: nextCount };
      });

      setLikedPosts((previous) => {
        const next = new Set(previous);
        if (result.liked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      setPosts((previous) => previous.map((post) =>
        post.id === postId ? { ...post, curtidasCount: result.count } : post,
      ));
    } catch (error) {
      console.error("Error toggling like:", error);
      setLikedPosts((previous) => {
        const next = new Set(previous);
        if (isLiked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      setPosts((previous) => previous.map((post) =>
        post.id === postId
          ? { ...post, curtidasCount: Math.max(0, Number(post.curtidasCount || 0) - delta) }
          : post,
      ));
      toast.error("Não foi possível atualizar a curtida.");
    }
  };

  const handleShare = async (post: any) => {
    const text = resolveMessage(post);
    const title = displayNewsTitle(post) || "Notícia NVU";
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text,
          url: url
        });
      } catch (e) {
        console.error("Share failed", e);
      }
    } else {
      navigator.clipboard.writeText(`${title}\n\n${text}\n\n${url}`);
      alert("Link copiado para a área de transferência!");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] font-sans pb-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Newspaper className="shrink-0 text-blue-600 dark:text-blue-500" />
              <span className="truncate">NVU News</span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Fique por dentro das novidades e rankings.
            </p>
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => fetchPosts()}
            disabled={loading}
            aria-label="Atualizar notícias"
            className="shrink-0 rounded-full bg-white dark:bg-[#18181b] border-slate-200 dark:border-slate-800"
          >
            <RefreshCw size={18} className={cn(loading && "animate-spin")} />
          </Button>
        </div>

        <div className="mb-5 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Empresa, motorista ou simulador"
                aria-label="Pesquisar no NVU News"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-[13px] text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-[#18181b] dark:text-slate-100 dark:focus:border-blue-700 dark:focus:ring-blue-950"
              />
              {searching ? (
                <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
              ) : searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Limpar pesquisa"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

            <div className="relative shrink-0">
              <SlidersHorizontal size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
              <select
                value={selectedSimulator}
                onChange={(event) => setSelectedSimulator(event.target.value)}
                aria-label="Filtrar por simulador"
                className="h-10 max-w-[142px] appearance-none rounded-xl border border-slate-200 bg-white pl-8 pr-7 text-[12px] font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-[#18181b] dark:text-slate-200 dark:focus:border-blue-700 dark:focus:ring-blue-950 sm:max-w-[190px]"
              >
                <option value="all">Todos</option>
                {simulatorOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400">▼</span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-[11px] leading-relaxed text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
            <Clock3 size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>{currentMonthLabel} está em andamento.</strong> O feed mostra somente períodos encerrados e organiza as publicações em: destaques diários, fechamentos semanais e fechamentos mensais. O dia anterior é publicado às 00:30; a semana fecha no domingo às 23:59 e publica na segunda às 00:30; o mês publica no primeiro dia do mês seguinte às 00:30.
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {groupedVisiblePosts.map((group) => (
            <section key={group.key} className="space-y-3.5" aria-labelledby={`nvu-news-section-${group.key}`}>
              <div className="flex items-start gap-2.5 px-1 pt-1">
                <div className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                  group.key === "dia" && "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
                  group.key === "semana" && "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
                  group.key === "mes" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
                  group.key === "recorde" && "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                  group.key === "historico_dia" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                  group.key === "manual" && "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                  group.key === "outros" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                )}>
                  {group.key === "dia" ? <Clock3 size={16} /> :
                    group.key === "semana" || group.key === "mes" ? <CalendarDays size={16} /> :
                    group.key === "recorde" ? <Trophy size={16} /> :
                    group.key === "historico_dia" ? <Clock3 size={16} /> :
                    group.key === "manual" ? <Megaphone size={16} /> : <Newspaper size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id={`nvu-news-section-${group.key}`} className="text-[14px] font-bold leading-tight text-slate-900 dark:text-white">
                    {group.meta.title}
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {group.meta.description}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold tabular-nums text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-[#18181b] dark:text-slate-400 dark:ring-slate-800">
                  {group.posts.length}
                </span>
              </div>

              <div className="space-y-4">
                {group.posts.map((post) => (
                  <NewsCard
                    key={post.id}
                    post={post}
                    isLiked={likedPosts.has(post.id)}
                    onToggleLike={() => toggleLike(post.id, likedPosts.has(post.id))}
                    onComment={() => setActiveCommentsPostId(activeCommentsPostId === post.id ? null : post.id)}
                    onCommentAdded={() => setPosts((current) => current.map((item) =>
                      item.id === post.id
                        ? { ...item, comentariosCount: Number(item.comentariosCount || 0) + 1 }
                        : item,
                    ))}
                    onShare={() => handleShare(post)}
                    showComments={activeCommentsPostId === post.id}
                  />
                ))}
              </div>
            </section>
          ))}

          {loading && visiblePosts.length === 0 && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {!loading && visiblePosts.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-[#18181b] rounded-2xl border border-slate-100 dark:border-[#2A2F3A]">
              <Newspaper size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Nenhum resultado</h3>
              <p className="mx-auto max-w-sm px-4 text-slate-500 dark:text-slate-400 text-sm">
                Não encontramos notícias para a pesquisa ou simulador selecionado. Rankings de períodos ainda abertos não são exibidos.
              </p>
              {(searchTerm || selectedSimulator !== "all") && (
                <button
                  type="button"
                  onClick={() => { setSearchTerm(""); setSelectedSimulator("all"); }}
                  className="mt-4 rounded-full border border-slate-200 px-4 py-2 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {hasMore && posts.length > 0 && (
            <div className="flex justify-center pt-4 pb-8">
              <Button 
                variant="outline" 
                onClick={() => fetchPosts(true)}
                disabled={loadingMore}
                className="bg-white dark:bg-[#18181b] rounded-full px-6"
              >
                {loadingMore ? "Carregando..." : "Carregar mais"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewsCard({ post, isLiked, onToggleLike, onComment, onCommentAdded, onShare, showComments }: any) {
  const message = resolveMessage(post);
  const date = post.dataCriacao?.toDate ? post.dataCriacao.toDate() : new Date();
  const periodValue = formatCompactNewsPeriod(post);
  const metricItems = [
    Number(post.quantidadeViagens || 0) > 0 ? {
      key: "viagens",
      label: "Viagens",
      value: Number(post.quantidadeViagens).toLocaleString("pt-BR"),
      fullValue: `${Number(post.quantidadeViagens).toLocaleString("pt-BR")} viagens`,
      icon: <Activity size={16} />,
      iconClass: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    } : null,
    Number(post.valorMovimentado || 0) > 0 ? {
      key: "ganhos",
      label: String(post.categoria || "").includes("motorista") ? "Ganhos" : "Movimentação",
      value: formatCompactCurrency(Number(post.valorMovimentado)),
      fullValue: formatCurrency(Number(post.valorMovimentado)),
      icon: <Banknote size={16} />,
      iconClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    } : null,
    periodValue ? {
      key: "periodo",
      label: "Período encerrado",
      value: periodValue,
      icon: <CalendarDays size={16} />,
      iconClass: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    } : null,
    post.simulador ? {
      key: "simulador",
      label: "Simulador",
      value: String(post.simulador),
      icon: <Gamepad2 size={16} />,
      iconClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
    } : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    value: string;
    fullValue?: string;
    icon: React.ReactNode;
    iconClass: string;
  }>;

  return (
    <div className={cn(
      "bg-white dark:bg-[#18181b] rounded-2xl p-5 sm:p-6 shadow-sm border transition-all hover:shadow-md",
      post.recordeHistorico
        ? "border-amber-200/90 dark:border-amber-800/60"
        : "border-slate-100 dark:border-slate-800/60",
    )}>
      <div className="flex flex-col gap-3 mb-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            {post.motoristaFoto ? (
              <StableImage
                src={post.motoristaFoto}
                alt={post.motoristaNome}
                wrapperClassName="w-12 h-12 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                className="object-cover"
                fallback={<User size={19} className="text-slate-400" />}
              />
            ) : post.empresaLogo ? (
              <StableImage
                src={post.empresaLogo}
                alt={post.empresaNome}
                wrapperClassName="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                className="object-cover"
                fallback={<Building2 size={19} className="text-slate-400" />}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
                {post.origem === "senior" ? <Megaphone size={20} /> : <Trophy size={20} />}
              </div>
            )}

            {post.motoristaFoto && post.empresaLogo && (
              <StableImage
                src={post.empresaLogo}
                alt={post.empresaNome}
                wrapperClassName="absolute -right-1 -bottom-1 w-6 h-6 rounded-md border-2 border-white dark:border-[#18181b] bg-white dark:bg-slate-800 shadow-sm"
                className="object-cover"
                fallback={<Building2 size={10} className="text-slate-400" />}
              />
            )}
          </div>

          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 dark:text-white text-[15px] leading-tight break-words [overflow-wrap:anywhere]">
              {post.origem === "senior" ? "Comunicado Oficial" : (shortPersonName(post.motoristaNome) || post.empresaNome)}
            </h3>
            {post.motoristaNome && post.empresaNome && (
              <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5 break-words [overflow-wrap:anywhere]">
                {post.empresaNome}
              </p>
            )}
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
              {formatDistanceToNow(date, { addSuffix: true, locale: ptBR })}
            </p>
          </div>
        </div>

        {post.categoria && (
          <span className={cn(
            "inline-flex self-start max-w-full sm:max-w-[210px] items-center justify-center px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] leading-tight text-left sm:text-center font-bold uppercase tracking-wide whitespace-normal break-words [overflow-wrap:anywhere]",
            post.recordeHistorico
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
          )}>
            {displayNewsCategory(post)}
          </span>
        )}
      </div>

      <div className="mb-4">
        {displayNewsTitle(post) && (
          <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2 leading-snug break-words [overflow-wrap:anywhere]">
            {displayNewsTitle(post)}
          </h4>
        )}
        <p className="text-slate-700 dark:text-slate-300 text-[15px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {message}
        </p>
      </div>

      {/* Resumo compacto do destaque */}
      {metricItems.length > 0 && (
        <div
          className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-1.5 dark:border-slate-800 dark:bg-slate-900/35 sm:grid-cols-4"
          aria-label="Resumo do destaque"
        >
          {metricItems.map((item) => (
            <div
              key={item.key}
              title={item.fullValue || item.value}
              className="flex min-w-0 items-center gap-1.5 rounded-lg bg-white/80 px-2 py-1.5 dark:bg-slate-900/70"
            >
              <span className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md [&>svg]:h-3 [&>svg]:w-3",
                item.iconClass,
              )}>
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[7px] font-bold uppercase tracking-[0.07em] text-slate-400 dark:text-slate-500">
                  {item.label}
                </p>
                <p className="truncate text-[10px] font-semibold leading-tight text-slate-800 dark:text-slate-100 sm:text-[11px] tabular-nums">
                  {item.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-4 border-t border-slate-100 dark:border-slate-800/60">
        <button 
          onClick={onToggleLike}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl transition-colors text-[13px] font-medium",
            isLiked 
              ? "text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400" 
              : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
          )}
        >
          <Heart size={18} className={cn(isLiked && "fill-current")} />
          <span className="hidden sm:inline">Curtir</span>
          <span>{post.curtidasCount || 0}</span>
        </button>
        
        <button 
          onClick={onComment}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl transition-colors text-[13px] font-medium",
            showComments
              ? "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400"
              : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
          )}
        >
          <MessageCircle size={18} />
          <span className="hidden sm:inline">Comentar</span>
          <span>{post.comentariosCount || 0}</span>
        </button>
        
        <button 
          onClick={onShare}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors text-[13px] font-medium"
        >
          <Share2 size={18} />
          <span className="hidden sm:inline truncate">Compartilhar</span>
        </button>
      </div>

      {showComments && (
        <CommentsSection postId={post.id} onCommentAdded={onCommentAdded} />
      )}
    </div>
  );
}

function CommentsSection({ postId, onCommentAdded }: { postId: string; onCommentAdded?: () => void }) {
  const { currentUser } = useSessionStore();
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchComments = async () => {
      try {
        const commentsRef = collection(db, `noticias/${postId}/comentarios`);
        const q = query(commentsRef, orderBy("dataCriacao", "asc"));
        const snapshot = await getDocs(q);
        if (isMounted) {
          setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        if (isMounted) setLoading(false);
      }
    };
    fetchComments();
    return () => { isMounted = false; };
  }, [postId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser) return;
    
    setSubmitting(true);
    try {
      const commentRef = doc(collection(db, `noticias/${postId}/comentarios`));
      const authorName = shortPersonName(currentUser.name) || "Usuário";
      const authorPhoto = firstNonEmpty(
        currentUser.profilePhotoURL,
        currentUser.authPhotoURL,
        (currentUser as any).photoURL,
        (currentUser as any).photoUrl,
        (currentUser as any).applicationPhotoURL,
        (currentUser as any).avatar,
        (currentUser as any).profileImage,
      );
      const postRef = doc(db, "noticias", postId);
      await runTransaction(db, async (transaction) => {
        const postSnapshot = await transaction.get(postRef);
        if (!postSnapshot.exists()) throw new Error("Notícia não encontrada.");
        const postData = postSnapshot.data();
        const currentComments = Math.max(0, Number(postData.comentariosCount || 0));
        const currentLikes = Math.max(0, Number(postData.curtidasCount || 0));

        transaction.set(commentRef, {
          texto: newComment.trim(),
          autorId: currentUser.id,
          autorNome: authorName,
          autorFoto: authorPhoto,
          dataCriacao: serverTimestamp(),
        });
        transaction.update(postRef, {
          comentariosCount: currentComments + 1,
          curtidasCount: currentLikes,
        });
      });

      setComments((previous) => [...previous, {
        id: commentRef.id,
        texto: newComment.trim(),
        autorId: currentUser.id,
        autorNome: authorName,
        autorFoto: authorPhoto,
        dataCriacao: new Date(),
      }]);
      setNewComment("");
      onCommentAdded?.();
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível publicar o comentário.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60 animate-in slide-in-from-top-2">
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-400"></div>
        </div>
      ) : (
        <div className="space-y-4 mb-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {comments.length === 0 ? (
            <p className="text-center text-[13px] text-slate-500 dark:text-slate-400 py-2">
              Seja o primeiro a comentar.
            </p>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex gap-3">
                {c.autorFoto ? (
                  <StableImage
                    src={c.autorFoto}
                    alt={c.autorNome}
                    wrapperClassName="w-8 h-8 rounded-full shrink-0 bg-slate-200 dark:bg-slate-700"
                    className="object-cover"
                    fallback={<User size={14} className="text-slate-500 dark:text-slate-400" />}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <User size={14} className="text-slate-500 dark:text-slate-400" />
                  </div>
                )}
                <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-2xl rounded-tl-none p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="min-w-0 font-semibold text-[13px] text-slate-900 dark:text-white break-words [overflow-wrap:anywhere]">
                      {c.autorNome}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {c.dataCriacao?.toDate ? formatDistanceToNow(c.dataCriacao.toDate(), { locale: ptBR, addSuffix: true }) : "agora"}
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {c.texto}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input 
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Escreva um comentário..."
          className="flex-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#09090b] px-4 py-2 text-[13px] text-slate-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
          maxLength={300}
        />
        <Button 
          type="submit" 
          disabled={!newComment.trim() || submitting}
          className="rounded-full w-10 h-10 p-0 flex items-center justify-center shrink-0 bg-blue-600 hover:bg-blue-700"
        >
          {submitting ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Send size={16} />}
        </Button>
      </form>
    </div>
  );
}
