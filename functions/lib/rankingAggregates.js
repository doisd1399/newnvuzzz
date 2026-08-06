"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureRankingAggregates = exports.updateRankingAggregatesOnTripWrite = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();
const TIME_ZONE = "America/Sao_Paulo";
const AGGREGATES_COLLECTION = "ranking_aggregates";
const CONTROLS_COLLECTION = "ranking_aggregate_controls";
const SCHEMA_VERSION = 1;
const PAGE_SIZE = 500;
const WRITE_BATCH_SIZE = 350;
const LOCK_TTL_MS = 10 * 60 * 1000;
const RECONCILE_AFTER_MS = 24 * 60 * 60 * 1000;
const RANKING_CHECKPOINT_VERSION = 1;
const FAILED_RETRY_COOLDOWN_MS = 15 * 60 * 1000;
const DATE_FIELDS = [
    "completedAt",
    "dataFechamento",
    "date",
    "dataLancamento",
    "createdAt",
];
const simulatorFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});
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
function normalizeText(value) {
    return String(value || "")
        .trim()
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}
function canonicalSimulatorAliasKey(value) {
    const normalized = normalizeText(value);
    const aliases = {
        gto: "gto",
        grandtrucksimulator: "gto",
        globaltruckonline: "gto",
        wtds: "wtds",
        worldtruckdrivingsimulator: "wtds",
        wbds: "wbds",
        worldbusdrivingsimulator: "wbds",
        toe3: "toe3",
        truckersofeurope3: "toe3",
        ets2: "ets2",
        eurotrucksimulator2: "ets2",
        ats: "ats",
        americantrucksimulator: "ats",
        pbs: "pbs",
        protonbussimulator: "pbs",
    };
    return aliases[normalized] || normalized;
}
function safeDocumentId(value) {
    return value.replace(/[^a-zA-Z0-9%_.~-]/g, "_").slice(0, 1400);
}
function aggregateDocumentId(simulatorId, periodKey) {
    return safeDocumentId(`v${SCHEMA_VERSION}__${encodeURIComponent(simulatorId)}__${periodKey}`);
}
function pad(value) {
    return String(value).padStart(2, "0");
}
function formatUtcDateKey(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
function readZonedParts(date) {
    const values = {};
    simulatorFormatter.formatToParts(date).forEach((part) => {
        if (part.type !== "literal")
            values[part.type] = part.value;
    });
    return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
        hour: Number(values.hour),
        minute: Number(values.minute),
        second: Number(values.second),
    };
}
/** Converts a wall-clock time in America/Sao_Paulo to a UTC Date. */
function zonedDateTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
    let utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const parts = readZonedParts(new Date(utcMs));
        const actualAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, millisecond);
        const adjustment = desiredAsUtc - actualAsUtc;
        utcMs += adjustment;
        if (adjustment === 0)
            break;
    }
    return new Date(utcMs);
}
function periodFromKey(periodType, periodKey) {
    if (periodType === "mes") {
        const match = /^mes_(\d{4})-(\d{2})$/.exec(periodKey);
        if (!match)
            return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        if (month < 1 || month > 12)
            return null;
        const start = zonedDateTimeToUtc(year, month, 1);
        const nextMonth = month === 12
            ? zonedDateTimeToUtc(year + 1, 1, 1)
            : zonedDateTimeToUtc(year, month + 1, 1);
        return {
            type: periodType,
            key: periodKey,
            start,
            end: new Date(nextMonth.getTime() - 1),
        };
    }
    const match = /^semana_(\d{4})-(\d{2})-(\d{2})$/.exec(periodKey);
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    if (calendarDate.getUTCFullYear() !== year ||
        calendarDate.getUTCMonth() + 1 !== month ||
        calendarDate.getUTCDate() !== day ||
        calendarDate.getUTCDay() !== 0) {
        return null;
    }
    const start = zonedDateTimeToUtc(year, month, day);
    const nextSundayCalendar = new Date(calendarDate);
    nextSundayCalendar.setUTCDate(nextSundayCalendar.getUTCDate() + 7);
    const nextStart = zonedDateTimeToUtc(nextSundayCalendar.getUTCFullYear(), nextSundayCalendar.getUTCMonth() + 1, nextSundayCalendar.getUTCDate());
    return {
        type: periodType,
        key: periodKey,
        start,
        end: new Date(nextStart.getTime() - 1),
    };
}
function periodsForDate(date) {
    const parts = readZonedParts(date);
    const monthKey = `mes_${parts.year}-${pad(parts.month)}`;
    const calendarDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    calendarDate.setUTCDate(calendarDate.getUTCDate() - calendarDate.getUTCDay());
    const weekKey = `semana_${formatUtcDateKey(calendarDate)}`;
    const month = periodFromKey("mes", monthKey);
    const week = periodFromKey("semana", weekKey);
    return [week, month].filter((period) => Boolean(period));
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
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function tripMetricDate(data) {
    return parseDate(data.completedAt ||
        data.dataFechamento ||
        data.date ||
        data.dataLancamento ||
        data.createdAt);
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
    return !status && Boolean(tripMetricDate(data));
}
function companyIdOf(data) {
    return firstNonEmpty(data.companyId, data.empresaId, data.company_id, data.empresa_id);
}
function driverIdOf(data) {
    return firstNonEmpty(data.driverId, data.motoristaId, data.motorista_id, data.userId, data.driver_id);
}
function companyNameOf(data) {
    return firstNonEmpty(data.empresaNome, data.companyName, data.company_name);
}
function driverNameOf(data) {
    return firstNonEmpty(data.motoristaNome, data.driverName, data.motorista_nome, data.nomeMotorista, data.driver_name);
}
function simulatorCandidates(data) {
    return [
        data.simulatorId,
        data.simuladorId,
        data.simulatorKey,
        data.simuladorKey,
        data.simulatorName,
        data.simuladorNome,
        data.simulator,
        data.simulador,
    ]
        .map((value) => firstNonEmpty(value))
        .filter(Boolean);
}
let simulatorCatalogCache = null;
async function loadSimulatorCatalog() {
    if (simulatorCatalogCache && simulatorCatalogCache.expiresAt > Date.now()) {
        return simulatorCatalogCache;
    }
    const snapshot = await db.collection("simulators").get();
    const descriptors = snapshot.docs.map((document) => {
        const data = document.data();
        const id = document.id;
        const name = firstNonEmpty(data.name, data.nome, data.label, data.title, id);
        const aliases = Array.from(new Set([
            id,
            name,
            firstNonEmpty(data.code),
            firstNonEmpty(data.slug),
            firstNonEmpty(data.key),
            firstNonEmpty(data.simulatorId),
            firstNonEmpty(data.simuladorId),
        ].filter(Boolean)));
        return { id, name, aliases };
    });
    const byAlias = new Map();
    const ids = new Set();
    descriptors.forEach((descriptor) => {
        ids.add(descriptor.id);
        descriptor.aliases.forEach((alias) => {
            byAlias.set(alias, descriptor.id);
            const normalized = canonicalSimulatorAliasKey(alias);
            if (normalized)
                byAlias.set(normalized, descriptor.id);
        });
    });
    simulatorCatalogCache = {
        expiresAt: Date.now() + 5 * 60 * 1000,
        descriptors,
        byAlias,
        ids,
    };
    return simulatorCatalogCache;
}
function resolveSimulatorFromRecords(trip, company, catalog) {
    const candidates = [
        ...simulatorCandidates(trip),
        ...(company ? simulatorCandidates(company) : []),
    ];
    for (const candidate of candidates) {
        if (catalog.ids.has(candidate))
            return candidate;
        const exact = catalog.byAlias.get(candidate);
        if (exact)
            return exact;
        const normalized = canonicalSimulatorAliasKey(candidate);
        const resolved = normalized ? catalog.byAlias.get(normalized) : undefined;
        if (resolved)
            return resolved;
    }
    return "";
}
async function contributionFromData(data) {
    var _a, _b, _c;
    if (!data || !isValidCompletedTrip(data))
        return null;
    const date = tripMetricDate(data);
    const companyId = companyIdOf(data);
    const driverId = driverIdOf(data);
    if (!date || !companyId || !driverId)
        return null;
    const catalog = await loadSimulatorCatalog();
    let company;
    let simulatorId = resolveSimulatorFromRecords(data, undefined, catalog);
    if (!simulatorId) {
        const companySnapshot = await db.collection("frotas").doc(companyId).get();
        company = companySnapshot.exists ? companySnapshot.data() : undefined;
        simulatorId = resolveSimulatorFromRecords(data, company, catalog);
    }
    if (!simulatorId)
        return null;
    return {
        simulatorId,
        companyId,
        companyName: companyNameOf(data) || firstNonEmpty(company === null || company === void 0 ? void 0 : company.companyName, company === null || company === void 0 ? void 0 : company.name),
        driverId,
        driverName: driverNameOf(data),
        value: Math.max(0, parseTripValue((_c = (_b = (_a = data.valor) !== null && _a !== void 0 ? _a : data.value) !== null && _b !== void 0 ? _b : data.totalValue) !== null && _c !== void 0 ? _c : data.ganho)),
        date,
    };
}
function contributionSignature(contribution) {
    if (!contribution)
        return "";
    return [
        contribution.simulatorId,
        contribution.companyId,
        contribution.driverId,
        contribution.value,
        contribution.date.getTime(),
    ].join("|");
}
function deltaKey(simulatorId, periodKey) {
    return `${simulatorId}|${periodKey}`;
}
function ensureDelta(deltas, simulatorId, period) {
    const key = deltaKey(simulatorId, period.key);
    const existing = deltas.get(key);
    if (existing)
        return existing;
    const created = {
        simulatorId,
        period,
        companyDeltas: new Map(),
        driverDeltas: new Map(),
        sourceTripDelta: 0,
    };
    deltas.set(key, created);
    return created;
}
function addContributionDelta(deltas, contribution, direction) {
    periodsForDate(contribution.date).forEach((period) => {
        const delta = ensureDelta(deltas, contribution.simulatorId, period);
        const company = delta.companyDeltas.get(contribution.companyId) || {
            trips: 0,
            val: 0,
            name: contribution.companyName || undefined,
        };
        company.trips += direction;
        company.val += direction * contribution.value;
        if (!company.name && contribution.companyName)
            company.name = contribution.companyName;
        delta.companyDeltas.set(contribution.companyId, company);
        const driver = delta.driverDeltas.get(contribution.driverId) || {
            trips: 0,
            val: 0,
            companyId: contribution.companyId,
            name: contribution.driverName || undefined,
        };
        driver.trips += direction;
        driver.val += direction * contribution.value;
        if (direction > 0)
            driver.companyId = contribution.companyId;
        if (!driver.name && contribution.driverName)
            driver.name = contribution.driverName;
        delta.driverDeltas.set(contribution.driverId, driver);
        delta.sourceTripDelta += direction;
    });
}
function parseCompanyMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    const result = {};
    Object.entries(value).forEach(([id, raw]) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            return;
        const record = raw;
        result[id] = {
            trips: Math.max(0, Math.trunc(Number(record.trips) || 0)),
            val: Math.max(0, Number(record.val) || 0),
            name: firstNonEmpty(record.name) || undefined,
        };
    });
    return result;
}
function parseDriverMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    const result = {};
    Object.entries(value).forEach(([id, raw]) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            return;
        const record = raw;
        result[id] = {
            trips: Math.max(0, Math.trunc(Number(record.trips) || 0)),
            val: Math.max(0, Number(record.val) || 0),
            companyId: firstNonEmpty(record.companyId) || undefined,
            name: firstNonEmpty(record.name) || undefined,
        };
    });
    return result;
}
function applyCompanyDeltas(current, deltas) {
    deltas.forEach((delta, id) => {
        const previous = current[id] || { trips: 0, val: 0 };
        const trips = previous.trips + delta.trips;
        const val = previous.val + delta.val;
        if (trips <= 0) {
            // Company rankings intentionally keep valid companies with zero trips,
            // matching the existing client engine. The current catalog still
            // decides whether that company is visible or has been deleted/moved.
            current[id] = {
                trips: 0,
                val: 0,
                name: previous.name || delta.name,
            };
            return;
        }
        current[id] = {
            trips,
            val: Math.max(0, val),
            name: previous.name || delta.name,
        };
    });
}
function applyDriverDeltas(current, deltas) {
    deltas.forEach((delta, id) => {
        const previous = current[id] || { trips: 0, val: 0 };
        const trips = previous.trips + delta.trips;
        const val = previous.val + delta.val;
        if (trips <= 0) {
            delete current[id];
            return;
        }
        current[id] = {
            trips,
            val: Math.max(0, val),
            companyId: delta.companyId || previous.companyId,
            name: previous.name || delta.name,
        };
    });
}
async function applyAggregateDeltas(deltas) {
    if (deltas.size === 0)
        return;
    const entries = Array.from(deltas.values());
    await db.runTransaction(async (transaction) => {
        const snapshots = [];
        const references = entries.map((entry) => db.collection(AGGREGATES_COLLECTION).doc(aggregateDocumentId(entry.simulatorId, entry.period.key)));
        for (const reference of references) {
            snapshots.push(await transaction.get(reference));
        }
        entries.forEach((entry, index) => {
            const snapshot = snapshots[index];
            if (!snapshot.exists)
                return;
            const data = snapshot.data() || {};
            if (data.schemaVersion !== SCHEMA_VERSION || data.complete !== true)
                return;
            const companies = parseCompanyMap(data.companies);
            const drivers = parseDriverMap(data.drivers);
            applyCompanyDeltas(companies, entry.companyDeltas);
            applyDriverDeltas(drivers, entry.driverDeltas);
            transaction.update(references[index], {
                // Update the whole maps so participants whose total reaches zero are
                // actually removed instead of surviving through recursive merge.
                companies,
                drivers,
                sourceTripCount: Math.max(0, Math.trunc(Number(data.sourceTripCount) || 0) + entry.sourceTripDelta),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                revision: admin.firestore.FieldValue.increment(1),
            });
        });
    });
}
exports.updateRankingAggregatesOnTripWrite = functions.firestore
    .document("historico_viagens/{tripId}")
    .onWrite(async (change) => {
    const [before, after] = await Promise.all([
        contributionFromData(change.before.exists ? change.before.data() : undefined),
        contributionFromData(change.after.exists ? change.after.data() : undefined),
    ]);
    if (contributionSignature(before) === contributionSignature(after))
        return;
    const deltas = new Map();
    if (before)
        addContributionDelta(deltas, before, -1);
    if (after)
        addContributionDelta(deltas, after, 1);
    await applyAggregateDeltas(deltas);
});
async function fetchTripsByDateField(field, period) {
    const documents = [];
    let cursor = null;
    while (true) {
        let rangeQuery = db
            .collection("historico_viagens")
            .where(field, ">=", admin.firestore.Timestamp.fromDate(period.start))
            .where(field, "<=", admin.firestore.Timestamp.fromDate(period.end))
            .orderBy(field, "asc")
            .limit(PAGE_SIZE);
        if (cursor)
            rangeQuery = rangeQuery.startAfter(cursor);
        const snapshot = await rangeQuery.get();
        documents.push(...snapshot.docs);
        if (snapshot.size < PAGE_SIZE)
            break;
        cursor = snapshot.docs[snapshot.docs.length - 1];
    }
    return documents;
}
async function fetchPeriodTrips(period) {
    const results = await Promise.allSettled(DATE_FIELDS.map((field) => fetchTripsByDateField(field, period)));
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    if (fulfilled.length === 0) {
        const failure = results.find((result) => result.status === "rejected");
        throw (failure === null || failure === void 0 ? void 0 : failure.reason) || new Error("Nenhuma consulta de período pôde ser executada.");
    }
    results
        .filter((result) => result.status === "rejected")
        .forEach((result) => console.warn("[RankingAggregates] Alias de data ignorado:", result.reason));
    const byId = new Map();
    fulfilled.forEach((result) => {
        result.value.forEach((document) => byId.set(document.id, document));
    });
    return Array.from(byId.values());
}
function isEligibleCompany(data) {
    if (!data)
        return false;
    const status = normalizeText(data.status || data.situacao || data.state);
    return !(data.deleted === true ||
        data.softDeleted === true ||
        data.excluida === true ||
        data.excluido === true ||
        ["deleted", "excluida", "excluido", "removed", "removida", "removido"].includes(status));
}
function emptyAggregate() {
    return { companies: {}, drivers: {}, sourceTripCount: 0 };
}
function addToAggregate(aggregate, contribution) {
    const company = aggregate.companies[contribution.companyId] || {
        trips: 0,
        val: 0,
        name: contribution.companyName || undefined,
    };
    company.trips += 1;
    company.val += contribution.value;
    if (!company.name && contribution.companyName)
        company.name = contribution.companyName;
    aggregate.companies[contribution.companyId] = company;
    const driver = aggregate.drivers[contribution.driverId] || {
        trips: 0,
        val: 0,
        companyId: contribution.companyId,
        name: contribution.driverName || undefined,
    };
    driver.trips += 1;
    driver.val += contribution.value;
    driver.companyId = contribution.companyId;
    if (!driver.name && contribution.driverName)
        driver.name = contribution.driverName;
    aggregate.drivers[contribution.driverId] = driver;
    aggregate.sourceTripCount += 1;
}
async function rebuildPeriod(period, onCheckpoint) {
    var _a;
    await (onCheckpoint === null || onCheckpoint === void 0 ? void 0 : onCheckpoint("collecting", { checkpointPhase: "loading_inputs" }));
    const [tripDocuments, companiesSnapshot, catalog] = await Promise.all([
        fetchPeriodTrips(period),
        db.collection("frotas").get(),
        loadSimulatorCatalog(),
    ]);
    const companiesById = new Map();
    companiesSnapshot.docs.forEach((document) => {
        const data = document.data();
        if (isEligibleCompany(data))
            companiesById.set(document.id, data);
    });
    const aggregates = new Map();
    catalog.descriptors.forEach((simulator) => {
        aggregates.set(simulator.id, emptyAggregate());
    });
    // Preserve the previous ranking behavior: valid companies in the selected
    // simulator exist in the company ranking with zero trips until activity is
    // recorded. Hard-deleted companies are deliberately excluded.
    companiesById.forEach((company, companyId) => {
        const simulatorId = resolveSimulatorFromRecords({}, company, catalog);
        if (!simulatorId)
            return;
        const aggregate = aggregates.get(simulatorId) || emptyAggregate();
        aggregate.companies[companyId] = {
            trips: 0,
            val: 0,
            name: firstNonEmpty(company.companyName, company.name) || undefined,
        };
        aggregates.set(simulatorId, aggregate);
    });
    tripDocuments.forEach((document) => {
        var _a, _b, _c;
        const data = document.data();
        if (!isValidCompletedTrip(data))
            return;
        const date = tripMetricDate(data);
        if (!date || date < period.start || date > period.end)
            return;
        const companyId = companyIdOf(data);
        const driverId = driverIdOf(data);
        if (!companyId || !driverId)
            return;
        const company = companiesById.get(companyId);
        if (!company)
            return;
        const simulatorId = resolveSimulatorFromRecords(data, company, catalog);
        if (!simulatorId)
            return;
        const contribution = {
            simulatorId,
            companyId,
            companyName: companyNameOf(data) || firstNonEmpty(company.companyName, company.name),
            driverId,
            driverName: driverNameOf(data),
            value: Math.max(0, parseTripValue((_c = (_b = (_a = data.valor) !== null && _a !== void 0 ? _a : data.value) !== null && _b !== void 0 ? _b : data.totalValue) !== null && _c !== void 0 ? _c : data.ganho)),
            date,
        };
        const aggregate = aggregates.get(simulatorId) || emptyAggregate();
        addToAggregate(aggregate, contribution);
        aggregates.set(simulatorId, aggregate);
    });
    await (onCheckpoint === null || onCheckpoint === void 0 ? void 0 : onCheckpoint("collecting", {
        checkpointPhase: "inputs_loaded",
        sourceDocumentsFetched: tripDocuments.length,
        eligibleCompanies: companiesById.size,
        simulatorCount: aggregates.size,
    }));
    const now = admin.firestore.FieldValue.serverTimestamp();
    const writes = Array.from(aggregates.entries()).map(([simulatorId, aggregate]) => ({
        ref: db.collection(AGGREGATES_COLLECTION).doc(aggregateDocumentId(simulatorId, period.key)),
        data: {
            schemaVersion: SCHEMA_VERSION,
            simulatorId,
            periodType: period.type,
            periodKey: period.key,
            periodStart: admin.firestore.Timestamp.fromDate(period.start),
            periodEnd: admin.firestore.Timestamp.fromDate(period.end),
            complete: true,
            sourceTripCount: aggregate.sourceTripCount,
            companies: aggregate.companies,
            drivers: aggregate.drivers,
            generatedAt: now,
            updatedAt: now,
            lastReconciledAt: now,
            revision: Date.now(),
        },
    }));
    const totalWriteBatches = Math.ceil(writes.length / WRITE_BATCH_SIZE);
    await (onCheckpoint === null || onCheckpoint === void 0 ? void 0 : onCheckpoint("writing", {
        checkpointPhase: "writing_aggregates",
        rebuiltDocuments: writes.length,
        sourceTrips: tripDocuments.length,
        writeBatchesTotal: totalWriteBatches,
        writeBatchesCompleted: 0,
    }));
    for (let index = 0; index < writes.length; index += WRITE_BATCH_SIZE) {
        const batch = db.batch();
        const chunk = writes.slice(index, index + WRITE_BATCH_SIZE);
        chunk.forEach((write) => {
            // Full overwrite is intentional: a reconciliation must remove stale
            // participants that no longer belong to the canonical period dataset.
            batch.set(write.ref, write.data);
        });
        await batch.commit();
        await (onCheckpoint === null || onCheckpoint === void 0 ? void 0 : onCheckpoint("writing", {
            checkpointPhase: "writing_aggregates",
            rebuiltDocuments: writes.length,
            sourceTrips: tripDocuments.length,
            writeBatchesTotal: totalWriteBatches,
            writeBatchesCompleted: Math.floor(index / WRITE_BATCH_SIZE) + 1,
            lastWrittenAggregateId: ((_a = chunk[chunk.length - 1]) === null || _a === void 0 ? void 0 : _a.ref.id) || "",
        }));
    }
    return {
        rebuiltDocuments: writes.length,
        sourceTrips: tripDocuments.length,
    };
}
function timestampMs(value) {
    const parsed = parseDate(value);
    return parsed ? parsed.getTime() : 0;
}
exports.ensureRankingAggregates = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onCall(async (rawInput, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Autenticação obrigatória para carregar o ranking.");
    }
    const simulatorId = firstNonEmpty(rawInput === null || rawInput === void 0 ? void 0 : rawInput.simulatorId);
    const periodType = firstNonEmpty(rawInput === null || rawInput === void 0 ? void 0 : rawInput.periodType);
    const periodKey = firstNonEmpty(rawInput === null || rawInput === void 0 ? void 0 : rawInput.periodKey);
    if (!simulatorId || !periodKey || !["semana", "mes"].includes(periodType)) {
        throw new functions.https.HttpsError("invalid-argument", "Simulador e período válidos são obrigatórios.");
    }
    const period = periodFromKey(periodType, periodKey);
    if (!period) {
        throw new functions.https.HttpsError("invalid-argument", "A chave do período não é válida.");
    }
    // The public callable is only a bootstrap/reconciliation path for recent
    // rankings. It must never become an authenticated full-history scanner.
    const oldestAllowedStart = Date.now() - 70 * 24 * 60 * 60 * 1000;
    const newestAllowedStart = Date.now() + 24 * 60 * 60 * 1000;
    if (period.start.getTime() < oldestAllowedStart ||
        period.start.getTime() > newestAllowedStart) {
        throw new functions.https.HttpsError("failed-precondition", "Somente períodos recentes podem ser consolidados por esta função.");
    }
    const catalog = await loadSimulatorCatalog();
    const canonicalSimulatorId = catalog.ids.has(simulatorId)
        ? simulatorId
        : catalog.byAlias.get(simulatorId) || catalog.byAlias.get(canonicalSimulatorAliasKey(simulatorId)) || "";
    if (!canonicalSimulatorId) {
        throw new functions.https.HttpsError("failed-precondition", "O simulador selecionado não existe no catálogo.");
    }
    const aggregateRef = db.collection(AGGREGATES_COLLECTION).doc(aggregateDocumentId(canonicalSimulatorId, period.key));
    const existing = await aggregateRef.get();
    if (existing.exists) {
        const data = existing.data() || {};
        const reconciledAt = timestampMs(data.lastReconciledAt);
        if (data.schemaVersion === SCHEMA_VERSION &&
            data.complete === true &&
            reconciledAt > 0 &&
            Date.now() - reconciledAt <= RECONCILE_AFTER_MS) {
            return { success: true, status: "ready", periodKey: period.key };
        }
    }
    const controlRef = db.collection(CONTROLS_COLLECTION).doc(period.key);
    const runId = safeDocumentId(`${period.key}_${((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid) || "unknown"}_${Date.now()}_${Math.random()}`);
    const lockAcquired = await db.runTransaction(async (transaction) => {
        var _a;
        const control = await transaction.get(controlRef);
        const controlData = control.data() || {};
        const lockedUntil = timestampMs(controlData.lockedUntil);
        if (lockedUntil > Date.now())
            return false;
        const failedAt = timestampMs(controlData.failedAt);
        if (controlData.checkpointVersion === RANKING_CHECKPOINT_VERSION &&
            controlData.schemaVersion === SCHEMA_VERSION &&
            controlData.status === "failed" &&
            failedAt > 0 &&
            Date.now() - failedAt < FAILED_RETRY_COOLDOWN_MS) {
            return false;
        }
        transaction.set(controlRef, {
            checkpointVersion: RANKING_CHECKPOINT_VERSION,
            schemaVersion: SCHEMA_VERSION,
            periodType: period.type,
            periodKey: period.key,
            periodStart: admin.firestore.Timestamp.fromDate(period.start),
            periodEnd: admin.firestore.Timestamp.fromDate(period.end),
            status: "running",
            checkpointStage: "collecting",
            checkpointPhase: "lock_acquired",
            runId,
            lockedUntil: admin.firestore.Timestamp.fromMillis(Date.now() + LOCK_TTL_MS),
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastCheckpointAt: admin.firestore.FieldValue.serverTimestamp(),
            requestedBy: ((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid) || "unknown",
            error: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        return true;
    });
    if (!lockAcquired) {
        return { success: true, status: "in_progress", periodKey: period.key };
    }
    let checkpointStage = "collecting";
    const saveCheckpoint = async (stage, data = {}) => {
        checkpointStage = stage;
        await controlRef.set(Object.assign({ checkpointVersion: RANKING_CHECKPOINT_VERSION, schemaVersion: SCHEMA_VERSION, status: stage === "completed" ? "completed" : "running", checkpointStage: stage, runId, lockedUntil: stage === "completed"
                ? admin.firestore.Timestamp.fromMillis(0)
                : admin.firestore.Timestamp.fromMillis(Date.now() + LOCK_TTL_MS), lastCheckpointAt: admin.firestore.FieldValue.serverTimestamp() }, data), { merge: true });
    };
    try {
        const result = await rebuildPeriod(period, saveCheckpoint);
        await saveCheckpoint("completed", {
            checkpointPhase: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            rebuiltDocuments: result.rebuiltDocuments,
            sourceTrips: result.sourceTrips,
            error: admin.firestore.FieldValue.delete(),
        });
        return Object.assign({ success: true, status: "rebuilt", periodKey: period.key }, result);
    }
    catch (error) {
        await controlRef.set({
            checkpointVersion: RANKING_CHECKPOINT_VERSION,
            schemaVersion: SCHEMA_VERSION,
            status: "failed",
            checkpointStage,
            runId,
            lockedUntil: admin.firestore.Timestamp.fromMillis(0),
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastCheckpointAt: admin.firestore.FieldValue.serverTimestamp(),
            error: String(error instanceof Error ? error.message : error).slice(0, 500),
        }, { merge: true });
        console.error("[RankingAggregates] Falha ao reconstruir período:", error);
        throw new functions.https.HttpsError("internal", "Não foi possível consolidar o ranking agora.");
    }
});
//# sourceMappingURL=rankingAggregates.js.map