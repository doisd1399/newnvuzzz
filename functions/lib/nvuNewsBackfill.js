"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNvuNewsMonthlyScheduled = exports.generateNvuNewsScheduled = exports.generateNvuNewsBackfill = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const node_crypto_1 = require("node:crypto");
const db = admin.firestore();
const NEWS_TIME_ZONE = "America/Sao_Paulo";
const AUTOMATION_VERSION = "nvu_news_individual_v3";
const HISTORY_VERSION = "nvu_news_full_history_individual_v3";
const CONTROL_DOCUMENT_ID = AUTOMATION_VERSION;
const CLASSIFICATIONS_COLLECTION = "nvu_classificacoes";
const COMMUNICATIONS_COLLECTION = "nvu_comunicados";
const TRIPS_COLLECTION = "historico_viagens";
const PAGE_SIZE = 500;
const WRITE_BATCH_SIZE = 400;
const PUBLICATION_DELAY_MINUTES = 30;
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
function firstNonEmpty(...values) {
    for (const value of values) {
        if (value === null || value === undefined)
            continue;
        const normalized = String(value).trim();
        if (normalized)
            return normalized;
    }
    return "";
}
function shortPersonName(value) {
    const normalized = firstNonEmpty(value).replace(/\s+/g, " ");
    if (!normalized)
        return "";
    const parts = normalized.split(" ");
    return parts.length <= 2 ? normalized : `${parts[0]} ${parts[parts.length - 1]}`;
}
function normalizeText(value) {
    return String(value || "")
        .trim()
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
function normalizeSimulatorKey(value) {
    const normalized = normalizeText(value).replace(/[^a-z0-9]/g, "");
    if (!normalized)
        return "nao-informado";
    if (normalized === "gto" || normalized.includes("globaltruckonline"))
        return "gto";
    if (normalized === "ets2" || normalized.includes("eurotrucksimulator2"))
        return "ets2";
    if (normalized === "ats" || normalized.includes("americantrucksimulator"))
        return "ats";
    if (normalized === "toe3" || normalized.includes("truckersofeurope3"))
        return "toe3";
    return normalized;
}
function preferredSimulatorName(id, name) {
    const nameKey = normalizeSimulatorKey(name);
    const idKey = normalizeSimulatorKey(id);
    const key = ["gto", "ets2", "ats", "toe3"].includes(nameKey) ? nameKey : idKey;
    if (key === "gto")
        return "GTO";
    if (key === "ets2")
        return "Euro Truck Simulator 2";
    if (key === "ats")
        return "American Truck Simulator";
    if (key === "toe3")
        return "Truckers of Europe 3";
    return firstNonEmpty(name, id, "Não informado");
}
function isEligibleCompany(company) {
    if (!company || Object.keys(company).length === 0)
        return false;
    const status = normalizeText(company.status || company.situacao || company.state);
    return !(company.deleted === true ||
        company.softDeleted === true ||
        company.excluida === true ||
        company.excluido === true ||
        ["deleted", "excluida", "excluido", "removed", "removida", "removido"].includes(status));
}
function parseTripValue(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    const raw = String(value !== null && value !== void 0 ? value : "").trim();
    if (!raw)
        return 0;
    const cleaned = raw.replace(/[^0-9,.-]/g, "");
    if (!cleaned)
        return 0;
    let normalized = cleaned;
    if (cleaned.includes(",") && cleaned.includes(".")) {
        normalized = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
            ? cleaned.replace(/\./g, "").replace(",", ".")
            : cleaned.replace(/,/g, "");
    }
    else if (cleaned.includes(",")) {
        normalized = cleaned.replace(/\./g, "").replace(",", ".");
    }
    else if ((cleaned.match(/\./g) || []).length > 1) {
        const lastDot = cleaned.lastIndexOf(".");
        normalized = cleaned.slice(0, lastDot).replace(/\./g, "") + cleaned.slice(lastDot);
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}
function parseDate(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
    if (value instanceof admin.firestore.Timestamp)
        return value.toDate();
    const timestampLike = value;
    if (typeof (timestampLike === null || timestampLike === void 0 ? void 0 : timestampLike.toDate) === "function") {
        const date = timestampLike.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof (timestampLike === null || timestampLike === void 0 ? void 0 : timestampLike.seconds) === "number") {
        const date = new Date(timestampLike.seconds * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function tripMetricDate(data) {
    return parseDate(data.completedAt ||
        data.dataFechamento ||
        data.date ||
        data.dataLancamento ||
        data.createdAt);
}
function isValidCompletedTrip(data) {
    const status = normalizeText(data.status);
    const canceled = ["cancelado", "cancelada", "canceled", "cancelled", "excluido", "excluida"].includes(status) ||
        data.cancelado === true ||
        data.deleted === true ||
        data.softDeleted === true;
    if (canceled)
        return false;
    if (["concluida", "concluido", "completed", "finalizado", "finalizada", "entregue"].includes(status)) {
        return true;
    }
    return !status && Boolean(data.completedAt || data.dataFechamento || data.dataLancamento || data.date || data.createdAt);
}
function normalizeTrip(document, rangeStart, rangeEnd) {
    var _a, _b, _c;
    const data = document.data();
    if (!isValidCompletedTrip(data))
        return null;
    const date = tripMetricDate(data);
    if (!date || date.getTime() < rangeStart.getTime() || date.getTime() > rangeEnd.getTime())
        return null;
    const driverId = firstNonEmpty(data.motoristaId, data.driverId, data.motorista_id, data.userId, data.driver_id);
    const companyId = firstNonEmpty(data.empresaId, data.companyId, data.company_id, data.empresa_id);
    if (!driverId || !companyId)
        return null;
    return {
        id: document.id,
        date,
        value: Math.max(0, parseTripValue((_c = (_b = (_a = data.valor) !== null && _a !== void 0 ? _a : data.value) !== null && _b !== void 0 ? _b : data.totalValue) !== null && _c !== void 0 ? _c : data.ganho)),
        driverId,
        driverName: firstNonEmpty(data.motoristaNome, data.driverName, data.motorista_nome, data.nomeMotorista, data.driver_name),
        companyId,
        companyName: firstNonEmpty(data.empresaNome, data.companyName, data.empresa_nome, data.fleetName),
        simulatorId: firstNonEmpty(data.simulatorId, data.simuladorId, data.simulator_id, data.simulador_id),
        simulatorName: firstNonEmpty(data.simulatorName, data.simuladorNome, data.simulador, data.simulator),
    };
}
function zonedParts(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: NEWS_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const read = (type) => { var _a; return Number(((_a = parts.find((part) => part.type === type)) === null || _a === void 0 ? void 0 : _a.value) || 0); };
    return { year: read("year"), month: read("month"), day: read("day") };
}
function timeZoneOffsetMs(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: NEWS_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(date);
    const read = (type) => { var _a; return Number(((_a = parts.find((part) => part.type === type)) === null || _a === void 0 ? void 0 : _a.value) || 0); };
    const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
    return asUtc - date.getTime();
}
function zonedDate(year, month, day, hour = 0, minute = 0) {
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const first = new Date(guess.getTime() - timeZoneOffsetMs(guess));
    return new Date(guess.getTime() - timeZoneOffsetMs(first));
}
function dateKey(date) {
    const parts = zonedParts(date);
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
function formatDatePt(date) {
    return new Intl.DateTimeFormat("pt-BR", {
        timeZone: NEWS_TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
}
function formatMonthPt(date) {
    const label = new Intl.DateTimeFormat("pt-BR", {
        timeZone: NEWS_TIME_ZONE,
        month: "long",
        year: "numeric",
    }).format(date);
    return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}
function periodForDate(date, type, now) {
    const parts = zonedParts(date);
    let start;
    let end;
    let label;
    if (type === "semana") {
        const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
        const mondayOffset = (weekday + 6) % 7;
        start = zonedDate(parts.year, parts.month, parts.day - mondayOffset);
        const startParts = zonedParts(start);
        end = new Date(zonedDate(startParts.year, startParts.month, startParts.day + 7).getTime() - 1);
        label = `${formatDatePt(start)} a ${formatDatePt(end)}`;
    }
    else {
        start = zonedDate(parts.year, parts.month, 1);
        end = new Date(zonedDate(parts.year, parts.month + 1, 1).getTime() - 1);
        label = formatMonthPt(start);
    }
    const publicationAt = new Date(end.getTime() + 1 + PUBLICATION_DELAY_MINUTES * 60 * 1000);
    if (publicationAt.getTime() > now.getTime())
        return null;
    return {
        key: `${type}_${dateKey(start)}`,
        type,
        start,
        end,
        publicationAt,
        label,
    };
}
function simulatorOf(trip, company) {
    const id = firstNonEmpty(trip.simulatorId, company === null || company === void 0 ? void 0 : company.simulatorId, company === null || company === void 0 ? void 0 : company.simuladorId);
    const name = preferredSimulatorName(id, firstNonEmpty(trip.simulatorName, company === null || company === void 0 ? void 0 : company.simulatorName, company === null || company === void 0 ? void 0 : company.simuladorNome, company === null || company === void 0 ? void 0 : company.simulator, id));
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
async function loadDocumentsByIds(collectionName, ids, cache) {
    const missing = Array.from(new Set(ids.filter(Boolean))).filter((id) => !cache.has(id));
    const chunkSize = 250;
    for (let offset = 0; offset < missing.length; offset += chunkSize) {
        const chunk = missing.slice(offset, offset + chunkSize);
        const snapshots = await db.getAll(...chunk.map((id) => db.collection(collectionName).doc(id)));
        snapshots.forEach((snapshot) => {
            cache.set(snapshot.id, snapshot.exists ? snapshot.data() || {} : {});
        });
    }
}
function addAggregate(map, key, trip, entity, simulator) {
    const current = map.get(key) || {
        id: key,
        driverId: entity === "motorista" ? trip.driverId : "",
        companyId: trip.companyId,
        driverName: entity === "motorista" ? trip.driverName : "",
        companyName: trip.companyName,
        trips: 0,
        earnings: 0,
        reachedAt: trip.date,
        simulator,
    };
    current.trips += 1;
    current.earnings += trip.value;
    if (!current.driverName && trip.driverName)
        current.driverName = trip.driverName;
    if (!current.companyName && trip.companyName)
        current.companyName = trip.companyName;
    if (trip.date.getTime() > current.reachedAt.getTime())
        current.reachedAt = trip.date;
    map.set(key, current);
}
function compareRanking(left, right) {
    return right.earnings - left.earnings ||
        right.trips - left.trips ||
        left.reachedAt.getTime() - right.reachedAt.getTime() ||
        left.id.localeCompare(right.id);
}
function buildSearchTokens(...values) {
    const tokens = new Set();
    values.forEach((value) => {
        const normalized = normalizeText(value)
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!normalized)
            return;
        if (normalized.length <= 120)
            tokens.add(normalized);
        normalized.split(" ").filter(Boolean).forEach((word) => {
            tokens.add(word);
            for (let length = 3; length <= word.length && length <= 18; length += 1) {
                tokens.add(word.slice(0, length));
            }
        });
    });
    return Array.from(tokens).slice(0, 160);
}
function companyNameOf(aggregate, company) {
    return firstNonEmpty(company === null || company === void 0 ? void 0 : company.companyName, company === null || company === void 0 ? void 0 : company.fleetName, company === null || company === void 0 ? void 0 : company.name, aggregate.companyName, "Empresa NVU");
}
function companyLogoOf(company) {
    return firstNonEmpty(company === null || company === void 0 ? void 0 : company.logoUrl, company === null || company === void 0 ? void 0 : company.logoURL, company === null || company === void 0 ? void 0 : company.companyLogoURL, company === null || company === void 0 ? void 0 : company.companyLogoUrl, company === null || company === void 0 ? void 0 : company.company_logo_url, company === null || company === void 0 ? void 0 : company.logo, company === null || company === void 0 ? void 0 : company.logoEmpresa, company === null || company === void 0 ? void 0 : company.logo_empresa, company === null || company === void 0 ? void 0 : company.imageUrl, company === null || company === void 0 ? void 0 : company.avatar);
}
function driverNameOf(aggregate, user) {
    return shortPersonName(firstNonEmpty(user === null || user === void 0 ? void 0 : user.name, user === null || user === void 0 ? void 0 : user.fullName, user === null || user === void 0 ? void 0 : user.displayName, aggregate.driverName, "Motorista NVU"));
}
function driverPhotoOf(user) {
    return firstNonEmpty(user === null || user === void 0 ? void 0 : user.profilePhotoURL, user === null || user === void 0 ? void 0 : user.profilePhotoUrl, user === null || user === void 0 ? void 0 : user.photoURL, user === null || user === void 0 ? void 0 : user.photoUrl, user === null || user === void 0 ? void 0 : user.applicationPhotoURL, user === null || user === void 0 ? void 0 : user.applicationPhotoUrl, user === null || user === void 0 ? void 0 : user.authPhotoURL, user === null || user === void 0 ? void 0 : user.avatarUrl, user === null || user === void 0 ? void 0 : user.avatar, user === null || user === void 0 ? void 0 : user.profileImage, user === null || user === void 0 ? void 0 : user.imageUrl);
}
async function aggregateTrips(rangeStart, rangeEnd, periodTypes, fullHistory) {
    const groups = new Map();
    const companyCache = new Map();
    const now = new Date();
    let sourceTrips = 0;
    let cursor = null;
    do {
        let pageQuery;
        if (fullHistory) {
            pageQuery = db.collection(TRIPS_COLLECTION)
                .orderBy(admin.firestore.FieldPath.documentId())
                .limit(PAGE_SIZE);
        }
        else {
            pageQuery = db.collection(TRIPS_COLLECTION)
                .where("completedAt", ">=", admin.firestore.Timestamp.fromDate(rangeStart))
                .where("completedAt", "<=", admin.firestore.Timestamp.fromDate(rangeEnd))
                .orderBy("completedAt")
                .limit(PAGE_SIZE);
        }
        if (cursor)
            pageQuery = pageQuery.startAfter(cursor);
        const snapshot = await pageQuery.get();
        if (snapshot.empty)
            break;
        cursor = snapshot.docs[snapshot.docs.length - 1];
        const trips = snapshot.docs
            .map((document) => normalizeTrip(document, rangeStart, rangeEnd))
            .filter((trip) => Boolean(trip));
        sourceTrips += trips.length;
        await loadDocumentsByIds("frotas", trips.map((trip) => trip.companyId), companyCache);
        trips.forEach((trip) => {
            const company = companyCache.get(trip.companyId);
            // A viagem permanece no histórico, mas uma empresa removida não pode
            // reaparecer em classificações antigas ou futuras.
            if (!isEligibleCompany(company))
                return;
            const simulator = simulatorOf(trip, company);
            if (!simulator.key || simulator.key === "nao-informado")
                return;
            periodTypes.forEach((periodType) => {
                const period = periodForDate(trip.date, periodType, now);
                if (!period)
                    return;
                const groupKey = `${period.key}_${simulator.key}`;
                const group = groups.get(groupKey) || {
                    period,
                    simulator,
                    companies: new Map(),
                    drivers: new Map(),
                };
                addAggregate(group.companies, trip.companyId, trip, "empresa", simulator);
                addAggregate(group.drivers, trip.driverId, trip, "motorista", simulator);
                groups.set(groupKey, group);
            });
        });
        if (snapshot.size < PAGE_SIZE)
            break;
    } while (cursor);
    return { groups, sourceTrips, companies: companyCache };
}
function entityLabel(entity) {
    return entity === "empresa" ? "empresas" : "motoristas";
}
function monthTitleLabel(date) {
    const label = new Intl.DateTimeFormat("pt-BR", {
        timeZone: NEWS_TIME_ZONE,
        month: "long",
        year: "numeric",
    }).format(date);
    return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}
function periodTitleSegment(group) {
    if (group.period.type === "semana")
        return "semana";
    return `mês de ${monthTitleLabel(group.period.start)}`;
}
function titleForEntity(group, entity, count) {
    const period = periodTitleSegment(group);
    const entityPlural = entityLabel(entity);
    if (count === 1) {
        return group.period.type === "mes"
            ? `Fim da temporada mensal — ${monthTitleLabel(group.period.start)}`
            : "Fim da temporada semanal";
    }
    if (count === 2)
        return `2 ${entityPlural} em destaque no ${period} — ${group.simulator.name}`;
    return `3 melhores ${entityPlural} do ${period} — ${group.simulator.name}`;
}
function formatCurrency(value) {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
    }).format(Number.isFinite(numeric) ? numeric : 0);
}
function captionVariation(variant, group, entity, leaderName, count, leader) {
    const periodLabel = group.period.type === "semana" ? "semanal" : "mensal";
    const period = group.period.label;
    const simulator = group.simulator.name;
    const entityPlural = entityLabel(entity);
    const subject = entity === "empresa" ? `A ${leaderName}` : leaderName;
    if (count === 1) {
        const subjectLabel = entity === "empresa" ? "a empresa" : "o motorista";
        return `Sem concorrentes no período, ${subjectLabel} gerou ${formatCurrency(leader.ganhos)} em ganhos e realizou ${Number(leader.viagens || 0)} viagens.`;
    }
    const podium = count >= 3
        ? `Confira o pódio com as três melhores ${entityPlural}.`
        : count === 2
            ? `Confira os dois destaques que atenderam aos critérios do período.`
            : `O resultado apresenta o destaque elegível do período.`;
    const captions = [
        `A classificação ${periodLabel} de ${entityPlural} do ${simulator} está definida. ${subject} alcançou a liderança entre ${period}. ${podium}`,
        `Uma nova classificação foi concluída na NVU. ${subject} ocupou a primeira posição entre ${entityPlural} no ${simulator}. O resultado considera as viagens válidas de ${period}.`,
        `A NVU apresenta os destaques ${periodLabel === "semanal" ? "da semana" : "do mês"} entre ${entityPlural}. ${subject} encerrou o período na liderança do ${simulator}. ${podium}`,
        `O período ${period} chegou ao fim com uma nova classificação de ${entityPlural}. ${subject} conquistou o melhor desempenho válido no ${simulator}.`,
        `A NVU divulga o resultado ${periodLabel} de ${entityPlural} do ${simulator}. ${subject} ficou na primeira posição, representando o principal desempenho registrado em ${period}.`,
    ];
    return captions[variant % captions.length];
}
function contentDigest(data) {
    return (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(data)).digest("hex");
}
async function buildGeneratedDocuments(groups, companies, source) {
    const winnerDriverIds = new Set();
    const winnerCompanyIds = new Set();
    groups.forEach((group) => {
        Array.from(group.companies.values())
            .filter((entry) => entry.earnings > 0 && entry.trips > 0 && isEligibleCompany(companies.get(entry.companyId)))
            .sort(compareRanking)
            .slice(0, 3)
            .forEach((entry) => winnerCompanyIds.add(entry.companyId));
        Array.from(group.drivers.values())
            .filter((entry) => entry.earnings > 0 && entry.trips > 0 && isEligibleCompany(companies.get(entry.companyId)))
            .sort(compareRanking)
            .slice(0, 3)
            .forEach((entry) => {
            winnerDriverIds.add(entry.driverId);
            winnerCompanyIds.add(entry.companyId);
        });
    });
    await loadDocumentsByIds("frotas", Array.from(winnerCompanyIds), companies);
    const users = new Map();
    await loadDocumentsByIds("users", Array.from(winnerDriverIds), users);
    const generated = [];
    groups.forEach((group) => {
        const companyRanking = Array.from(group.companies.values())
            .filter((entry) => entry.earnings > 0 && entry.trips > 0 && isEligibleCompany(companies.get(entry.companyId)))
            .sort(compareRanking)
            .slice(0, 3);
        const driverRanking = Array.from(group.drivers.values())
            .filter((entry) => entry.earnings > 0 && entry.trips > 0 && isEligibleCompany(companies.get(entry.companyId)))
            .sort(compareRanking)
            .slice(0, 3);
        const topEmpresas = companyRanking.map((entry, index) => ({
            posicao: index + 1,
            id: entry.companyId,
            nome: companyNameOf(entry, companies.get(entry.companyId)),
            logo: companyLogoOf(companies.get(entry.companyId)),
            ganhos: Math.round(entry.earnings * 100) / 100,
            viagens: entry.trips,
        }));
        const topMotoristas = driverRanking.map((entry, index) => ({
            posicao: index + 1,
            id: entry.driverId,
            nome: driverNameOf(entry, users.get(entry.driverId)),
            foto: driverPhotoOf(users.get(entry.driverId)),
            empresaId: entry.companyId,
            empresaNome: companyNameOf(entry, companies.get(entry.companyId)),
            empresaLogo: companyLogoOf(companies.get(entry.companyId)),
            ganhos: Math.round(entry.earnings * 100) / 100,
            viagens: entry.trips,
        }));
        const publishEntity = (entity, entries, sortOffsetMs) => {
            var _a;
            if (entries.length === 0)
                return;
            const variantSeed = (0, node_crypto_1.createHash)("sha256")
                .update(`${group.period.key}_${group.simulator.key}_${entity}`)
                .digest()[0];
            const legendaModelo = variantSeed % 5;
            const leaderName = firstNonEmpty((_a = entries[0]) === null || _a === void 0 ? void 0 : _a.nome, entity === "empresa" ? "Empresa NVU" : "Motorista NVU");
            const titulo = titleForEntity(group, entity, entries.length);
            const legenda = captionVariation(legendaModelo, group, entity, leaderName, entries.length, entries[0]);
            const documentId = `classificacao_${group.period.type}_${entity}_${group.simulator.key}_${dateKey(group.period.start)}`;
            const entityEntries = entity === "empresa" ? { topEmpresas: entries, topMotoristas: [] } : { topEmpresas: [], topMotoristas: entries };
            const stableData = Object.assign(Object.assign({ schemaVersion: AUTOMATION_VERSION, secao: "noticias", tipo: "classificacao", categoria: "classificacao", entidade: entity, periodicidade: group.period.type, periodoTipo: group.period.type, titulo,
                legenda, legendaModelo: legendaModelo + 1, simuladorId: group.simulator.id, simulador: group.simulator.name, simuladorKey: group.simulator.key, periodo: group.period.label, periodoInicioKey: dateKey(group.period.start), periodoFimKey: dateKey(group.period.end) }, entityEntries), { totalClassificados: entries.length, semConcorrentes: entries.length === 1, formatoPublicacao: entries.length === 1 ? "fim_temporada" : "classificacao", origem: source, historico: source === "historico", status: "publicado", visibilidade: "publico", createdBySystem: true, dedupeKey: documentId, searchTokens: buildSearchTokens(titulo, legenda, group.simulator.name, group.period.label, entity, ...entries.map((item) => item.nome), ...entries.map((item) => item.empresaNome)) });
            const contentHash = contentDigest(stableData);
            generated.push({
                id: documentId,
                contentHash,
                data: Object.assign(Object.assign({}, stableData), { contentHash, periodoInicio: admin.firestore.Timestamp.fromDate(group.period.start), periodoFim: admin.firestore.Timestamp.fromDate(group.period.end), dataReferencia: admin.firestore.Timestamp.fromDate(group.period.end), sortAt: admin.firestore.Timestamp.fromDate(new Date(group.period.publicationAt.getTime() + sortOffsetMs)), publicacaoProgramadaEm: admin.firestore.Timestamp.fromDate(new Date(group.period.publicationAt.getTime() + sortOffsetMs)) }),
            });
        };
        // Os dois rankings viram notícias independentes, inclusive no histórico.
        publishEntity("empresa", topEmpresas, 0);
        publishEntity("motorista", topMotoristas, 60000);
    });
    return generated.sort((left, right) => String(left.id).localeCompare(String(right.id)));
}
async function commitDocuments(collectionName, documents) {
    let created = 0;
    let updated = 0;
    let ignored = 0;
    for (let offset = 0; offset < documents.length; offset += WRITE_BATCH_SIZE) {
        const chunk = documents.slice(offset, offset + WRITE_BATCH_SIZE);
        const refs = chunk.map((item) => db.collection(collectionName).doc(item.id));
        const snapshots = await db.getAll(...refs);
        const batch = db.batch();
        let hasWrites = false;
        snapshots.forEach((snapshot, index) => {
            const item = chunk[index];
            if (!snapshot.exists) {
                batch.create(refs[index], Object.assign(Object.assign({}, item.data), { createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
                created += 1;
                hasWrites = true;
                return;
            }
            const current = snapshot.data() || {};
            if (current.contentHash === item.contentHash && current.status === "publicado") {
                ignored += 1;
                return;
            }
            batch.set(refs[index], Object.assign(Object.assign({}, item.data), { updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            updated += 1;
            hasWrites = true;
        });
        if (hasWrites)
            await batch.commit();
    }
    return { created, updated, ignored };
}
async function deleteLegacyCombinedClassifications() {
    let removed = 0;
    let cursor = null;
    do {
        let page = db.collection(CLASSIFICATIONS_COLLECTION)
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(WRITE_BATCH_SIZE);
        if (cursor)
            page = page.startAfter(cursor);
        const snapshot = await page.get();
        if (snapshot.empty)
            break;
        cursor = snapshot.docs[snapshot.docs.length - 1];
        const legacyDocs = snapshot.docs.filter((document) => {
            const data = document.data() || {};
            return data.tipo === "classificacao" && !["empresa", "motorista"].includes(data.entidade);
        });
        if (legacyDocs.length > 0) {
            const batch = db.batch();
            legacyDocs.forEach((document) => batch.delete(document.ref));
            await batch.commit();
            removed += legacyDocs.length;
        }
        if (snapshot.size < WRITE_BATCH_SIZE)
            break;
    } while (cursor);
    return removed;
}
async function migrateLegacyCommunications() {
    const legacySnapshot = await db.collection("noticias").get();
    const documents = [];
    legacySnapshot.docs.forEach((snapshot) => {
        const data = snapshot.data() || {};
        const isManual = data.tipo === "manual" || data.origem === "senior";
        const status = normalizeText(data.status || "publicado");
        if (!isManual || ["arquivado", "excluido", "excluida"].includes(status))
            return;
        const title = firstNonEmpty(data.titulo, "Comunicado NVU");
        const message = firstNonEmpty(data.mensagem, data.conteudo, data.resumo);
        if (!message)
            return;
        const simulatorId = firstNonEmpty(data.simuladorId);
        const simulatorName = firstNonEmpty(data.simulador, data.simuladorNome);
        const simulatorKey = simulatorId || simulatorName
            ? normalizeSimulatorKey(simulatorName || simulatorId)
            : "all";
        const sortDate = parseDate(data.sortAt || data.dataCriacao || data.createdAt) || new Date();
        const id = `legacy_${snapshot.id}`;
        const stableData = {
            schemaVersion: AUTOMATION_VERSION,
            secao: "comunicados",
            tipo: "comunicado",
            categoria: "comunicado",
            titulo: title,
            mensagem: message,
            imagemUrl: firstNonEmpty(data.imagemUrl, data.imageUrl),
            simuladorId: simulatorId,
            simulador: simulatorName,
            simuladorKey: simulatorKey,
            origem: "migrado",
            status: "publicado",
            visibilidade: "publico",
            autorId: firstNonEmpty(data.autorId),
            autorNome: firstNonEmpty(data.autorNome, data.empresaNome, "Painel Sênior NVU"),
            searchTokens: buildSearchTokens(title, message, simulatorName, "comunicado"),
        };
        const contentHash = contentDigest(stableData);
        documents.push({
            id,
            contentHash,
            data: Object.assign(Object.assign({}, stableData), { contentHash, sortAt: admin.firestore.Timestamp.fromDate(sortDate), dataReferencia: admin.firestore.Timestamp.fromDate(sortDate) }),
        });
    });
    const result = await commitDocuments(COMMUNICATIONS_COLLECTION, documents);
    return result.created + result.updated;
}
async function acquireHistoryLock(runId) {
    const ref = db.collection("system_settings").doc(CONTROL_DOCUMENT_ID);
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data() || {};
        if (data.historyVersion === HISTORY_VERSION && data.historyStatus === "completed")
            return "completed";
        const lockAt = parseDate(data.historyLockAt);
        if (data.historyStatus === "in_progress" &&
            lockAt &&
            Date.now() - lockAt.getTime() < LOCK_TIMEOUT_MS) {
            return "in_progress";
        }
        transaction.set(ref, {
            version: AUTOMATION_VERSION,
            historyVersion: HISTORY_VERSION,
            historyStatus: "in_progress",
            historyRunId: runId,
            historyLockAt: admin.firestore.FieldValue.serverTimestamp(),
            automationStartedAt: data.automationStartedAt || admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return "run";
    });
}
async function generateFullHistory() {
    const generationKey = `${HISTORY_VERSION}_${dateKey(new Date())}`;
    const runId = (0, node_crypto_1.createHash)("sha256")
        .update(`${generationKey}_${Date.now()}_${Math.random()}`)
        .digest("hex")
        .slice(0, 32);
    const lock = await acquireHistoryLock(runId);
    if (lock === "completed") {
        return {
            success: true,
            status: "already_completed",
            created: 0,
            updated: 0,
            ignored: 0,
            migratedCommunications: 0,
            sourceTrips: 0,
            generationKey,
            historyVersion: HISTORY_VERSION,
            removedLegacyClassifications: 0,
        };
    }
    if (lock === "in_progress") {
        return {
            success: true,
            status: "in_progress",
            created: 0,
            updated: 0,
            ignored: 0,
            migratedCommunications: 0,
            sourceTrips: 0,
            generationKey,
            historyVersion: HISTORY_VERSION,
            removedLegacyClassifications: 0,
        };
    }
    const controlRef = db.collection("system_settings").doc(CONTROL_DOCUMENT_ID);
    try {
        const rangeStart = new Date(0);
        const rangeEnd = new Date();
        const aggregated = await aggregateTrips(rangeStart, rangeEnd, ["semana", "mes"], true);
        const generated = await buildGeneratedDocuments(aggregated.groups, aggregated.companies, "historico");
        const writeResult = await commitDocuments(CLASSIFICATIONS_COLLECTION, generated);
        const removedLegacyClassifications = await deleteLegacyCombinedClassifications();
        const migratedCommunications = await migrateLegacyCommunications();
        await controlRef.set({
            version: AUTOMATION_VERSION,
            historyVersion: HISTORY_VERSION,
            historyStatus: "completed",
            historyRunId: runId,
            sourceTripCount: aggregated.sourceTrips,
            generatedHistoryCount: generated.length,
            createdCount: writeResult.created,
            updatedCount: writeResult.updated,
            ignoredCount: writeResult.ignored,
            migratedCommunications,
            removedLegacyClassifications,
            historyCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            publicationPolicy: {
                timeZone: NEWS_TIME_ZONE,
                weekly: "segunda-feira às 00:35, após o encerramento de domingo",
                monthly: "primeiro dia do mês às 00:40",
                history: "migração única de todas as semanas e meses encerrados",
                pagination: "o aplicativo lê somente 10 publicações por vez",
                captions: "cinco modelos fixos alternados sem uso de inteligência artificial",
                posts: "empresa e motorista publicados em notícias independentes; participante único recebe somente o post Fim da temporada",
                companies: "empresas removidas não participam do histórico nem das próximas classificações",
            },
        }, { merge: true });
        return {
            success: true,
            status: "completed",
            created: writeResult.created,
            updated: writeResult.updated,
            ignored: writeResult.ignored,
            migratedCommunications,
            sourceTrips: aggregated.sourceTrips,
            generationKey,
            historyVersion: HISTORY_VERSION,
            removedLegacyClassifications,
        };
    }
    catch (error) {
        await controlRef.set({
            historyStatus: "failed",
            historyRunId: runId,
            historyError: error instanceof Error ? error.message : String(error),
            historyFailedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.error("[NVU NEWS] Falha ao gerar histórico compacto:", error);
        throw error;
    }
}
function subtractDays(date, days) {
    return new Date(date.getTime() - days * 86400000);
}
async function generateRecent(periodTypes, sourceLabel) {
    var _a;
    const now = new Date();
    const rangeStart = subtractDays(now, periodTypes.includes("mes") ? 70 : 16);
    const aggregated = await aggregateTrips(rangeStart, now, periodTypes, false);
    const controlSnapshot = await db.collection("system_settings").doc(CONTROL_DOCUMENT_ID).get();
    const automationStartedAt = parseDate((_a = controlSnapshot.data()) === null || _a === void 0 ? void 0 : _a.automationStartedAt) || new Date(0);
    const futureGroups = new Map(Array.from(aggregated.groups.entries()).filter(([, group]) => group.period.publicationAt.getTime() > automationStartedAt.getTime()));
    const generated = await buildGeneratedDocuments(futureGroups, aggregated.companies, "automatico");
    const writeResult = await commitDocuments(CLASSIFICATIONS_COLLECTION, generated);
    await db.collection("system_settings").doc(CONTROL_DOCUMENT_ID).set({
        version: AUTOMATION_VERSION,
        lastAutomaticSource: sourceLabel,
        lastAutomaticRunAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAutomaticSourceTrips: aggregated.sourceTrips,
        lastAutomaticGenerated: generated.length,
        lastAutomaticCreated: writeResult.created,
        lastAutomaticUpdated: writeResult.updated,
        lastAutomaticIgnored: writeResult.ignored,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}
exports.generateNvuNewsBackfill = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Autenticação obrigatória para preparar o histórico NVU.");
    }
    try {
        return await generateFullHistory();
    }
    catch (error) {
        throw new functions.https.HttpsError("internal", "Não foi possível preparar o histórico de classificações.");
    }
});
exports.generateNvuNewsScheduled = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("35 0 * * 1")
    .timeZone(NEWS_TIME_ZONE)
    .onRun(async () => {
    await generateRecent(["semana"], "weekly_scheduler");
    return null;
});
exports.generateNvuNewsMonthlyScheduled = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("40 0 1 * *")
    .timeZone(NEWS_TIME_ZONE)
    .onRun(async () => {
    await generateRecent(["mes"], "monthly_scheduler");
    return null;
});
//# sourceMappingURL=nvuNewsBackfill.js.map