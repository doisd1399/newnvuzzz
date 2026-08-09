"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncCompanyApprovalNews = exports.publishCompanyApprovalNewsOnSimulatorWrite = exports.publishCompanyApprovalNewsOnOwnerProfileWrite = exports.publishCompanyApprovalNewsOnCompanyCreate = exports.publishCompanyApprovalNews = void 0;
exports.syncCompanyApprovalNewsHistory = syncCompanyApprovalNewsHistory;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const node_crypto_1 = require("node:crypto");
const authorization_1 = require("./authorization");
const db = admin.firestore();
const NEWS_COLLECTION = "nvu_classificacoes";
const REGISTRATIONS_COLLECTION = "recruitment_applications";
const COMPANIES_COLLECTION = "frotas";
const USERS_COLLECTION = "users";
const SIMULATORS_COLLECTION = "simulators";
const NEWS_TIME_ZONE = "America/Sao_Paulo";
const SCHEMA_VERSION = "nvu_company_approval_v6";
const SYNC_CONTROL_DOCUMENT_ID = "nvu_company_approval_news_v6";
const SYNC_LOCK_TIMEOUT_MS = 15 * 60 * 1000;
const SYNC_REUSE_WINDOW_MS = 30 * 60 * 1000;
const WRITE_BATCH_SIZE = 350;
const APPROVAL_POST_TITLE = "Nova empresa no ecossistema NVU";
let simulatorCatalogCache = null;
function emptyResult() {
    return { created: 0, updated: 0, ignored: 0, removed: 0 };
}
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
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function knownSimulatorKey(value) {
    if (!value)
        return "";
    if (value === "gto" ||
        value.includes("globaltruckonline"))
        return "gto";
    if (value === "ets2" || value.includes("eurotrucksimulator2"))
        return "ets2";
    if (value === "ats" || value.includes("americantrucksimulator"))
        return "ats";
    if (value === "toe3" || value.includes("truckersofeurope3"))
        return "toe3";
    if (value === "wtds" || value.includes("worldtruckdrivingsimulator"))
        return "wtds";
    if (value === "wbds" || value.includes("worldbusdrivingsimulator"))
        return "wbds";
    if (value === "pbs" || value.includes("protonbussimulator"))
        return "pbs";
    return "";
}
function simulatorKey(...values) {
    const normalizedValues = values
        .map((value) => normalizeText(value).replace(/\s/g, ""))
        .filter(Boolean);
    for (const normalized of normalizedValues) {
        const known = knownSimulatorKey(normalized);
        if (known)
            return known;
    }
    return normalizedValues[0] || "";
}
function simulatorCandidates(registration, company) {
    return [
        company.simulatorId,
        company.simuladorId,
        company.simulatorKey,
        company.simuladorKey,
        registration.simulatorId,
        registration.simuladorId,
        registration.simulatorKey,
        registration.simuladorKey,
        company.simulatorName,
        company.simuladorNome,
        company.simulator,
        company.simulador,
        registration.simulatorName,
        registration.simuladorNome,
        registration.simulator,
        registration.simulador,
    ]
        .map((value) => firstNonEmpty(value))
        .filter(Boolean);
}
async function loadSimulatorCatalog() {
    if (simulatorCatalogCache && simulatorCatalogCache.expiresAt > Date.now()) {
        return simulatorCatalogCache.value;
    }
    const snapshot = await db.collection(SIMULATORS_COLLECTION).get();
    const descriptors = snapshot.docs.map((document) => {
        const data = document.data() || {};
        const id = document.id;
        const name = firstNonEmpty(data.name, data.nome, data.label, data.title, data.displayName, id);
        const rawAliases = Array.from(new Set([
            id,
            name,
            firstNonEmpty(data.code),
            firstNonEmpty(data.slug),
            firstNonEmpty(data.key),
            firstNonEmpty(data.simulatorId),
            firstNonEmpty(data.simuladorId),
        ].filter(Boolean)));
        const key = simulatorKey(...rawAliases) || normalizeText(name).replace(/\s/g, "");
        const aliases = Array.from(new Set([
            ...rawAliases,
            key,
            ...rawAliases.map((alias) => normalizeText(alias).replace(/\s/g, "")),
        ].filter(Boolean)));
        return { id, name, key, aliases };
    });
    const byExact = new Map();
    const byNormalized = new Map();
    descriptors.forEach((descriptor) => {
        descriptor.aliases.forEach((alias) => {
            byExact.set(alias, descriptor);
            const normalized = normalizeText(alias).replace(/\s/g, "");
            if (normalized)
                byNormalized.set(normalized, descriptor);
        });
    });
    const value = { byExact, byNormalized };
    simulatorCatalogCache = {
        expiresAt: Date.now() + 5 * 60 * 1000,
        value,
    };
    return value;
}
function resolveSimulatorDescriptor(registration, company, catalog) {
    const candidates = simulatorCandidates(registration, company);
    // IDs from the simulator catalog are authoritative. This prevents an old,
    // incorrect display name (for example the former ETS2 fallback) from moving
    // an ATS company post into the wrong feed.
    for (const candidate of candidates) {
        const exact = catalog.byExact.get(candidate);
        if (exact)
            return exact;
    }
    for (const candidate of candidates) {
        const normalized = normalizeText(candidate).replace(/\s/g, "");
        const matched = normalized ? catalog.byNormalized.get(normalized) : undefined;
        if (matched)
            return matched;
    }
    const key = simulatorKey(...candidates) || "all";
    const id = firstNonEmpty(company.simulatorId, company.simuladorId, registration.simulatorId, registration.simuladorId, key);
    const name = firstNonEmpty(company.simulatorName, company.simuladorNome, company.simulator, registration.simulatorName, registration.simuladorNome, registration.simulator, key === "all" ? "Simulador não informado" : key.toUpperCase());
    return {
        id,
        name,
        key,
        aliases: Array.from(new Set([
            ...candidates,
            key,
            ...candidates.map((candidate) => normalizeText(candidate).replace(/\s/g, "")),
        ].filter(Boolean))),
    };
}
function isDeletedCompany(company) {
    const status = normalizeText(company.status || company.situacao || company.state);
    return company.deleted === true ||
        company.softDeleted === true ||
        company.excluida === true ||
        company.excluido === true ||
        ["deleted", "excluida", "excluido", "removed", "removida", "removido"].includes(status);
}
/** Mirrors the active-company rule used by the Senior Panel. */
function isActiveCompany(company) {
    if (isDeletedCompany(company))
        return false;
    const status = normalizeText(company.status || company.situacao || company.state || "active");
    return ["active", "approved", "ativo"].includes(status);
}
function isCompanyRegistration(record) {
    const type = normalizeText(record.type || record.registrationType || record.tipo);
    return type === "company registration" ||
        type === "company_registration" ||
        type === "registro de empresa" ||
        Boolean(record.companyName && record.ownerName && !record.fullName);
}
function parseDate(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
    if (value instanceof admin.firestore.Timestamp) {
        const parsed = value.toDate();
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof (value === null || value === void 0 ? void 0 : value.toDate) === "function") {
        const parsed = value.toDate();
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof (value === null || value === void 0 ? void 0 : value.seconds) === "number") {
        const parsed = new Date(Number(value.seconds) * 1000);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function formatApprovalDate(date) {
    return new Intl.DateTimeFormat("pt-BR", {
        timeZone: NEWS_TIME_ZONE,
        day: "2-digit",
        month: "long",
        year: "numeric",
    }).format(date);
}
function buildSearchTokens(...values) {
    const tokens = new Set();
    values.forEach((value) => {
        const normalized = normalizeText(value);
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
function safeDocumentId(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 1400);
}
function approvalDocumentId(companyId) {
    return safeDocumentId(`empresa_aprovada_empresa_${companyId}`);
}
function contentDigest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(value)).digest("hex");
}
function companyLogoOf(registration, company) {
    return firstNonEmpty(company.logoUrl, company.logoURL, company.companyLogoURL, company.companyLogoUrl, registration.companyLogoURL, registration.companyLogoUrl, registration.logoUrl, registration.logoURL, registration.photoURL);
}
function ownerIdOf(registration, company) {
    return firstNonEmpty(company.ownerId, company.userId, registration.approvedUserId, registration.userId);
}
function ownerNameOf(registration, company, ownerProfile = {}) {
    return firstNonEmpty(ownerProfile.name, ownerProfile.fullName, ownerProfile.displayName, company.ownerName, registration.ownerName, registration.name, "Proprietário");
}
function ownerPhotoOf(registration, company, ownerProfile = {}) {
    return firstNonEmpty(ownerProfile.profilePhotoURL, ownerProfile.profilePhotoUrl, ownerProfile.photoURL, ownerProfile.photoUrl, ownerProfile.applicationPhotoURL, ownerProfile.applicationPhotoUrl, ownerProfile.authPhotoURL, ownerProfile.avatarUrl, ownerProfile.avatar, ownerProfile.profileImage, ownerProfile.imageUrl, company.ownerPhotoUrl, company.ownerPhotoURL, registration.ownerPhotoUrl, registration.ownerPhotoURL, registration.profilePhotoURL, registration.ownerImageUrl);
}
function approvalDateOf(registration, company) {
    return parseDate(registration.approvedAt) ||
        parseDate(registration.approvalDate) ||
        parseDate(company.approvedAt) ||
        parseDate(company.createdAt) ||
        parseDate(registration.updatedAt) ||
        parseDate(registration.createdAt) ||
        new Date();
}
function buildApprovalPost(registrationId, registration, companyId, company, origin, ownerProfile = {}, resolvedSimulator) {
    const resolvedCompanyId = firstNonEmpty(companyId, registration.approvedCompanyId, company.id);
    if (!resolvedCompanyId || !isActiveCompany(company))
        return null;
    const companyName = firstNonEmpty(company.companyName, company.fleetName, registration.companyName, registration.fleetName, "Empresa NVU");
    const ownerName = ownerNameOf(registration, company, ownerProfile);
    const ownerId = ownerIdOf(registration, company);
    const simulatorId = firstNonEmpty(resolvedSimulator === null || resolvedSimulator === void 0 ? void 0 : resolvedSimulator.id, company.simulatorId, company.simuladorId, registration.simulatorId, registration.simuladorId);
    const simulatorName = firstNonEmpty(resolvedSimulator === null || resolvedSimulator === void 0 ? void 0 : resolvedSimulator.name, company.simulatorName, company.simuladorNome, company.simulator, registration.simulatorName, registration.simuladorNome, registration.simulator, simulatorId, "Simulador não informado");
    const resolvedSimulatorKey = firstNonEmpty(resolvedSimulator === null || resolvedSimulator === void 0 ? void 0 : resolvedSimulator.key, simulatorKey(simulatorId, simulatorName), "all");
    const resolvedSimulatorAliases = Array.from(new Set([
        ...((resolvedSimulator === null || resolvedSimulator === void 0 ? void 0 : resolvedSimulator.aliases) || []),
        simulatorId,
        simulatorName,
        resolvedSimulatorKey,
    ].filter(Boolean)));
    const approvalDate = approvalDateOf(registration, company);
    const approvalTimestamp = admin.firestore.Timestamp.fromDate(approvalDate);
    const companyLogo = companyLogoOf(registration, company);
    const ownerPhoto = ownerPhotoOf(registration, company, ownerProfile);
    const dateLabel = formatApprovalDate(approvalDate);
    const caption = `Em ${dateLabel}, a empresa ${companyName} foi aprovada no simulador ${simulatorName} e agora faz parte do ecossistema NVU.`;
    const sourceRegistrationId = firstNonEmpty(company.sourceRegistrationId, registrationId);
    const documentId = approvalDocumentId(resolvedCompanyId);
    const stableData = {
        schemaVersion: SCHEMA_VERSION,
        secao: "noticias",
        tipo: "empresa_aprovada",
        categoria: "nova_empresa",
        entidade: "empresa",
        titulo: APPROVAL_POST_TITLE,
        legenda: caption,
        empresaId: resolvedCompanyId,
        empresaNome: companyName,
        empresaLogo: companyLogo,
        proprietarioId: ownerId,
        proprietarioNome: ownerName,
        proprietarioFoto: ownerPhoto,
        empresa: {
            id: resolvedCompanyId,
            nome: companyName,
            logo: companyLogo,
        },
        proprietario: {
            id: ownerId,
            nome: ownerName,
            foto: ownerPhoto,
        },
        simuladorId: simulatorId,
        simulador: simulatorName,
        simuladorKey: resolvedSimulatorKey,
        simuladorAliases: resolvedSimulatorAliases,
        dataAprovacaoLabel: dateLabel,
        sourceRegistrationId,
        origem: origin,
        historico: origin === "historico",
        status: "publicado",
        visibilidade: "publico",
        createdBySystem: true,
        dedupeKey: documentId,
        searchTokens: buildSearchTokens(APPROVAL_POST_TITLE, caption, companyName, ownerName, simulatorName, dateLabel, "nova empresa", "empresa aprovada", "ecossistema nvu"),
    };
    const contentHash = contentDigest(Object.assign(Object.assign({}, stableData), { approvedAt: approvalDate.toISOString() }));
    return {
        id: documentId,
        contentHash,
        data: Object.assign(Object.assign({}, stableData), { contentHash, approvedAt: approvalTimestamp, sortAt: approvalTimestamp, dataReferencia: approvalTimestamp, createdAt: approvalTimestamp }),
    };
}
async function commitApprovalPosts(posts) {
    const result = emptyResult();
    for (let index = 0; index < posts.length; index += WRITE_BATCH_SIZE) {
        const chunk = posts.slice(index, index + WRITE_BATCH_SIZE);
        const refs = chunk.map((post) => db.collection(NEWS_COLLECTION).doc(post.id));
        const existingSnapshots = refs.length > 0 ? await db.getAll(...refs) : [];
        const batch = db.batch();
        let writes = 0;
        chunk.forEach((post, postIndex) => {
            const existing = existingSnapshots[postIndex];
            const existingData = (existing === null || existing === void 0 ? void 0 : existing.data()) || {};
            if ((existing === null || existing === void 0 ? void 0 : existing.exists) &&
                existingData.contentHash === post.contentHash &&
                existingData.schemaVersion === SCHEMA_VERSION &&
                normalizeText(existingData.status || "publicado") === "publicado") {
                result.ignored += 1;
                return;
            }
            if (existing === null || existing === void 0 ? void 0 : existing.exists)
                result.updated += 1;
            else
                result.created += 1;
            batch.set(refs[postIndex], Object.assign(Object.assign({}, post.data), { updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            writes += 1;
        });
        if (writes > 0)
            await batch.commit();
    }
    return result;
}
async function deleteDocumentRefs(refs) {
    const uniqueRefs = Array.from(new Map(refs.map((ref) => [ref.path, ref])).values());
    let removed = 0;
    for (let index = 0; index < uniqueRefs.length; index += WRITE_BATCH_SIZE) {
        const chunk = uniqueRefs.slice(index, index + WRITE_BATCH_SIZE);
        const batch = db.batch();
        chunk.forEach((ref) => batch.delete(ref));
        if (chunk.length > 0) {
            await batch.commit();
            removed += chunk.length;
        }
    }
    return removed;
}
async function readApprovalNewsDocuments() {
    const [byType, byLegacyType, byLegacyTipo, byCategory, byLegacyCategory, byTitle] = await Promise.all([
        db.collection(NEWS_COLLECTION).where("tipo", "==", "empresa_aprovada").get(),
        db.collection(NEWS_COLLECTION).where("type", "==", "company_approval").get(),
        db.collection(NEWS_COLLECTION).where("tipo", "==", "company_approval").get(),
        db.collection(NEWS_COLLECTION).where("categoria", "==", "nova_empresa").get(),
        db.collection(NEWS_COLLECTION).where("categoria", "==", "company_approval").get(),
        db.collection(NEWS_COLLECTION).where("titulo", "==", APPROVAL_POST_TITLE).get(),
    ]);
    return Array.from(new Map([
        ...byType.docs,
        ...byLegacyType.docs,
        ...byLegacyTipo.docs,
        ...byCategory.docs,
        ...byLegacyCategory.docs,
        ...byTitle.docs,
    ].map((document) => [
        document.ref.path,
        document,
    ])).values());
}
function approvalCompanyId(data) {
    var _a, _b;
    return firstNonEmpty(data.empresaId, data.companyId, (_a = data.empresa) === null || _a === void 0 ? void 0 : _a.id, (_b = data.company) === null || _b === void 0 ? void 0 : _b.id);
}
async function auditApprovalPostConsistency(desiredIds, activeCompanyIds) {
    const documents = await readApprovalNewsDocuments();
    const published = documents.filter((document) => {
        const data = document.data();
        const status = normalizeText(data.status || "publicado");
        return status === "publicado";
    });
    const companyIds = published.map((document) => approvalCompanyId(document.data()));
    const uniqueCompanyIds = new Set(companyIds.filter(Boolean));
    const canonicalIds = new Set(published.map((document) => document.id));
    const allCanonical = published.every((document) => desiredIds.has(document.id));
    const allCompaniesActive = companyIds.every((companyId) => Boolean(companyId) && activeCompanyIds.has(companyId));
    const exactlyOnePerCompany = published.length === uniqueCompanyIds.size &&
        uniqueCompanyIds.size === activeCompanyIds.size;
    const everyDesiredPostExists = Array.from(desiredIds).every((id) => canonicalIds.has(id));
    return {
        publishedPosts: published.length,
        consistent: allCanonical &&
            allCompaniesActive &&
            exactlyOnePerCompany &&
            everyDesiredPostExists,
    };
}
async function reconcileApprovalPosts(posts, activeCompanyIds) {
    const writeResult = await commitApprovalPosts(posts);
    const desiredIds = new Set(posts.map((post) => post.id));
    const existingApprovalPosts = await readApprovalNewsDocuments();
    const staleRefs = existingApprovalPosts
        .filter((document) => {
        const data = document.data();
        const companyId = approvalCompanyId(data);
        return !desiredIds.has(document.id) ||
            !companyId ||
            !activeCompanyIds.has(companyId);
    })
        .map((document) => document.ref);
    writeResult.removed = await deleteDocumentRefs(staleRefs);
    return writeResult;
}
async function readApprovedCompanyRegistrations() {
    const registrations = [];
    const snapshot = await db
        .collection(REGISTRATIONS_COLLECTION)
        .where("status", "==", "approved")
        .get();
    snapshot.docs.forEach((document) => {
        const data = document.data();
        if (isCompanyRegistration(data))
            registrations.push({ id: document.id, data });
    });
    return registrations;
}
function registrationSortTime(record) {
    return approvalDateOf(record.data, {}).getTime();
}
function setLatestRegistration(map, key, record) {
    if (!key)
        return;
    const current = map.get(key);
    if (!current || registrationSortTime(record) >= registrationSortTime(current)) {
        map.set(key, record);
    }
}
function companyIdentity(record) {
    return normalizeText([
        record.ownerEmail || record.email,
        record.companyName || record.fleetName,
    ].filter(Boolean).join("|"));
}
function ownerEmailOf(registration, company) {
    return firstNonEmpty(company.ownerEmail, company.email, registration.ownerEmail, registration.email).toLowerCase();
}
async function loadOwnerProfile(registration, company) {
    const ownerId = ownerIdOf(registration, company);
    if (ownerId) {
        const snapshot = await db.collection(USERS_COLLECTION).doc(ownerId).get();
        if (snapshot.exists)
            return Object.assign(Object.assign({}, snapshot.data()), { id: snapshot.id });
    }
    const ownerEmail = ownerEmailOf(registration, company);
    if (!ownerEmail)
        return {};
    const byEmail = await db
        .collection(USERS_COLLECTION)
        .where("email", "==", ownerEmail)
        .limit(5)
        .get();
    if (byEmail.empty)
        return {};
    const preferred = byEmail.docs.find((document) => Boolean(ownerPhotoOf({}, {}, document.data()))) || byEmail.docs[0];
    return Object.assign(Object.assign({}, preferred.data()), { id: preferred.id });
}
async function loadOwnerProfilesByIds(ownerIds) {
    const uniqueIds = Array.from(new Set(ownerIds.filter(Boolean)));
    const profiles = new Map();
    for (let index = 0; index < uniqueIds.length; index += WRITE_BATCH_SIZE) {
        const chunk = uniqueIds.slice(index, index + WRITE_BATCH_SIZE);
        const refs = chunk.map((ownerId) => db.collection(USERS_COLLECTION).doc(ownerId));
        const snapshots = refs.length > 0 ? await db.getAll(...refs) : [];
        snapshots.forEach((snapshot) => {
            if (snapshot.exists) {
                profiles.set(snapshot.id, Object.assign(Object.assign({}, snapshot.data()), { id: snapshot.id }));
            }
        });
    }
    return profiles;
}
function syntheticRegistrationForCompany(companyId, company) {
    const sourceRegistrationId = firstNonEmpty(company.sourceRegistrationId);
    return {
        id: sourceRegistrationId || `company_${companyId}`,
        data: {
            type: "company_registration",
            status: "approved",
            approvedCompanyId: companyId,
            approvedUserId: firstNonEmpty(company.ownerId, company.userId),
            companyName: firstNonEmpty(company.companyName, company.fleetName),
            ownerName: company.ownerName,
            simulatorId: company.simulatorId,
            simulatorName: company.simulatorName,
            companyLogoURL: companyLogoOf({}, company),
            ownerPhotoUrl: ownerPhotoOf({}, company),
            approvedAt: company.approvedAt || company.createdAt,
            createdAt: company.createdAt,
        },
    };
}
async function syncCompanyApprovalNewsHistory() {
    const [registrations, companiesSnapshot, simulatorCatalog] = await Promise.all([
        readApprovedCompanyRegistrations(),
        db.collection(COMPANIES_COLLECTION).get(),
        loadSimulatorCatalog(),
    ]);
    const registrationsById = new Map();
    const registrationsByCompanyId = new Map();
    const registrationsByIdentity = new Map();
    registrations.forEach((record) => {
        registrationsById.set(record.id, record);
        setLatestRegistration(registrationsByCompanyId, firstNonEmpty(record.data.approvedCompanyId), record);
        setLatestRegistration(registrationsByIdentity, companyIdentity(record.data), record);
    });
    const generated = [];
    const activeCompanyIds = new Set();
    const activeCompanies = companiesSnapshot.docs.flatMap((document) => {
        const company = Object.assign(Object.assign({}, document.data()), { id: document.id });
        if (!isActiveCompany(company))
            return [];
        return [{ companyId: document.id, company }];
    });
    const ownerProfiles = await loadOwnerProfilesByIds(activeCompanies.map(({ company }) => ownerIdOf({}, company)));
    for (const { companyId, company } of activeCompanies) {
        activeCompanyIds.add(companyId);
        const registration = registrationsById.get(firstNonEmpty(company.sourceRegistrationId)) ||
            registrationsByCompanyId.get(companyId) ||
            registrationsByIdentity.get(companyIdentity(company)) ||
            syntheticRegistrationForCompany(companyId, company);
        const ownerProfile = ownerProfiles.get(ownerIdOf(registration.data, company)) ||
            await loadOwnerProfile(registration.data, company);
        const resolvedSimulator = resolveSimulatorDescriptor(registration.data, company, simulatorCatalog);
        const post = buildApprovalPost(registration.id, registration.data, companyId, company, "historico", ownerProfile, resolvedSimulator);
        if (post)
            generated.push(post);
    }
    generated.sort((left, right) => {
        var _a, _b;
        const leftDate = ((_a = parseDate(left.data.sortAt)) === null || _a === void 0 ? void 0 : _a.getTime()) || 0;
        const rightDate = ((_b = parseDate(right.data.sortAt)) === null || _b === void 0 ? void 0 : _b.getTime()) || 0;
        return leftDate - rightDate || left.id.localeCompare(right.id);
    });
    const result = await reconcileApprovalPosts(generated, activeCompanyIds);
    const consistency = await auditApprovalPostConsistency(new Set(generated.map((post) => post.id)), activeCompanyIds);
    result.activeCompanies = activeCompanyIds.size;
    result.expectedPosts = activeCompanyIds.size;
    result.publishedPosts = consistency.publishedPosts;
    result.consistent = consistency.consistent;
    if (!result.consistent) {
        console.error("[NVU NEWS] Inconsistência na reconciliação de empresas aprovadas.", {
            activeCompanies: activeCompanyIds.size,
            generatedPosts: generated.length,
            publishedPosts: consistency.publishedPosts,
        });
    }
    return result;
}
function storedSyncResult(data) {
    const activeCompanies = Number(data.activeCompanies);
    const expectedPosts = Number(data.expectedPosts);
    const publishedPosts = Number(data.publishedPosts);
    return Object.assign(Object.assign(Object.assign(Object.assign({ created: Number(data.created || 0), updated: Number(data.updated || 0), ignored: Number(data.ignored || 0), removed: Number(data.removed || 0) }, (Number.isFinite(activeCompanies) ? { activeCompanies } : {})), (Number.isFinite(expectedPosts) ? { expectedPosts } : {})), (Number.isFinite(publishedPosts) ? { publishedPosts } : {})), { consistent: data.consistent !== false });
}
async function syncCompanyApprovalNewsHistoryOnce(options) {
    const controlRef = db.collection("system_settings").doc(SYNC_CONTROL_DOCUMENT_ID);
    const runId = (0, node_crypto_1.createHash)("sha256")
        .update(`${Date.now()}_${Math.random()}`)
        .digest("hex")
        .slice(0, 24);
    const decision = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(controlRef);
        const current = snapshot.data() || {};
        const lockAt = parseDate(current.lockAt);
        const completedAt = parseDate(current.completedAt);
        const expectedMatches = (options === null || options === void 0 ? void 0 : options.expectedActiveCompanies) === undefined ||
            Number(current.activeCompanies) === options.expectedActiveCompanies;
        if (current.status === "in_progress" &&
            lockAt &&
            Date.now() - lockAt.getTime() < SYNC_LOCK_TIMEOUT_MS) {
            return { reuse: storedSyncResult(current) };
        }
        if (!(options === null || options === void 0 ? void 0 : options.force) &&
            current.status === "completed" &&
            current.schemaVersion === SCHEMA_VERSION &&
            current.consistent !== false &&
            current.needsRecount !== true &&
            completedAt &&
            expectedMatches &&
            Date.now() - completedAt.getTime() < SYNC_REUSE_WINDOW_MS) {
            return { reuse: storedSyncResult(current) };
        }
        transaction.set(controlRef, {
            schemaVersion: SCHEMA_VERSION,
            status: "in_progress",
            runId,
            lockAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        return "run";
    });
    if (typeof decision === "object" && "reuse" in decision)
        return decision.reuse;
    try {
        const result = await syncCompanyApprovalNewsHistory();
        await controlRef.set({
            schemaVersion: SCHEMA_VERSION,
            status: "completed",
            runId,
            created: result.created,
            updated: result.updated,
            ignored: result.ignored,
            removed: result.removed,
            activeCompanies: result.activeCompanies || 0,
            expectedPosts: result.expectedPosts || 0,
            publishedPosts: result.publishedPosts || 0,
            consistent: result.consistent !== false,
            needsRecount: admin.firestore.FieldValue.delete(),
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lockAt: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        return result;
    }
    catch (error) {
        await controlRef.set({
            schemaVersion: SCHEMA_VERSION,
            status: "failed",
            runId,
            error: error instanceof Error ? error.message : String(error),
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lockAt: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        throw error;
    }
}
async function loadRegistrationForCompany(companyId, company) {
    const sourceRegistrationId = firstNonEmpty(company.sourceRegistrationId);
    if (sourceRegistrationId) {
        const sourceSnapshot = await db
            .collection(REGISTRATIONS_COLLECTION)
            .doc(sourceRegistrationId)
            .get();
        if (sourceSnapshot.exists) {
            const data = sourceSnapshot.data() || {};
            if (isCompanyRegistration(data) && normalizeText(data.status) === "approved") {
                return { id: sourceSnapshot.id, data };
            }
        }
    }
    const approvedRegistration = await db
        .collection(REGISTRATIONS_COLLECTION)
        .where("approvedCompanyId", "==", companyId)
        .get();
    const companyRegistrations = approvedRegistration.docs
        .map((document) => ({ id: document.id, data: document.data() }))
        .filter((record) => isCompanyRegistration(record.data) &&
        normalizeText(record.data.status) === "approved")
        .sort((left, right) => registrationSortTime(right) - registrationSortTime(left));
    if (companyRegistrations[0])
        return companyRegistrations[0];
    return syntheticRegistrationForCompany(companyId, company);
}
async function deleteApprovalPostsForCompany(companyId, company) {
    const refs = [
        db.collection(NEWS_COLLECTION).doc(approvalDocumentId(companyId)),
    ];
    const byCompany = await db
        .collection(NEWS_COLLECTION)
        .where("empresaId", "==", companyId)
        .get();
    refs.push(...byCompany.docs.map((document) => document.ref));
    const byLegacyCompany = await db
        .collection(NEWS_COLLECTION)
        .where("companyId", "==", companyId)
        .get();
    refs.push(...byLegacyCompany.docs.map((document) => document.ref));
    const sourceRegistrationId = firstNonEmpty(company === null || company === void 0 ? void 0 : company.sourceRegistrationId);
    if (sourceRegistrationId) {
        const byRegistration = await db
            .collection(NEWS_COLLECTION)
            .where("sourceRegistrationId", "==", sourceRegistrationId)
            .get();
        refs.push(...byRegistration.docs.map((document) => document.ref));
    }
    const existingRefs = await Promise.all(Array.from(new Map(refs.map((ref) => [ref.path, ref])).values()).map(async (ref) => ({ ref, snapshot: await ref.get() })));
    return deleteDocumentRefs(existingRefs.filter(({ snapshot }) => snapshot.exists).map(({ ref }) => ref));
}
async function updateActiveCompanySummary(before, after) {
    const wasActive = Boolean(before && isActiveCompany(before));
    const isActive = Boolean(after && isActiveCompany(after));
    if (wasActive === isActive)
        return;
    const controlRef = db.collection("system_settings").doc(SYNC_CONTROL_DOCUMENT_ID);
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(controlRef);
        const current = snapshot.data() || {};
        const currentCount = Number(current.activeCompanies);
        if (!Number.isFinite(currentCount)) {
            transaction.set(controlRef, {
                schemaVersion: SCHEMA_VERSION,
                needsRecount: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            return;
        }
        const nextCount = Math.max(0, currentCount + (isActive ? 1 : -1));
        transaction.set(controlRef, {
            schemaVersion: SCHEMA_VERSION,
            activeCompanies: nextCount,
            expectedPosts: nextCount,
            needsRecount: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}
async function publishCompanyDocumentApproval(companyId, company, origin = "automatico") {
    if (!isActiveCompany(company)) {
        return Object.assign(Object.assign({}, emptyResult()), { removed: await deleteApprovalPostsForCompany(companyId, company) });
    }
    const registration = await loadRegistrationForCompany(companyId, company);
    const [ownerProfile, simulatorCatalog] = await Promise.all([
        loadOwnerProfile(registration.data, company),
        loadSimulatorCatalog(),
    ]);
    const resolvedSimulator = resolveSimulatorDescriptor(registration.data, company, simulatorCatalog);
    const post = buildApprovalPost(registration.id, registration.data, companyId, Object.assign(Object.assign({}, company), { id: companyId }), origin, ownerProfile, resolvedSimulator);
    if (!post)
        return emptyResult();
    const result = await commitApprovalPosts([post]);
    const [duplicates, legacyDuplicates] = await Promise.all([
        db.collection(NEWS_COLLECTION).where("empresaId", "==", companyId).get(),
        db.collection(NEWS_COLLECTION).where("companyId", "==", companyId).get(),
    ]);
    result.removed = await deleteDocumentRefs([...duplicates.docs, ...legacyDuplicates.docs]
        .filter((document) => document.id !== post.id)
        .map((document) => document.ref));
    result.activeCompanies = 1;
    result.expectedPosts = 1;
    result.publishedPosts = 1;
    result.consistent = true;
    return result;
}
exports.publishCompanyApprovalNews = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .firestore.document(`${REGISTRATIONS_COLLECTION}/{applicationId}`)
    .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    if (!isCompanyRegistration(after))
        return null;
    if (normalizeText(after.status) !== "approved")
        return null;
    if (normalizeText(before.status) === "approved")
        return null;
    const approvedCompanyId = firstNonEmpty(after.approvedCompanyId);
    let companySnapshot = null;
    if (approvedCompanyId) {
        companySnapshot = await db
            .collection(COMPANIES_COLLECTION)
            .doc(approvedCompanyId)
            .get();
    }
    if (!(companySnapshot === null || companySnapshot === void 0 ? void 0 : companySnapshot.exists)) {
        const matchedCompany = await db
            .collection(COMPANIES_COLLECTION)
            .where("sourceRegistrationId", "==", context.params.applicationId)
            .limit(1)
            .get();
        companySnapshot = matchedCompany.docs[0] || null;
    }
    if (!(companySnapshot === null || companySnapshot === void 0 ? void 0 : companySnapshot.exists)) {
        console.warn("[NVU NEWS] Aprovação sem empresa ativa vinculada; aguardando o gatilho da frota.", {
            applicationId: context.params.applicationId,
        });
        return null;
    }
    const company = companySnapshot.data() || {};
    if (!isActiveCompany(company)) {
        await deleteApprovalPostsForCompany(companySnapshot.id, company);
        return null;
    }
    await publishCompanyDocumentApproval(companySnapshot.id, company, "automatico");
    return null;
});
/**
 * Keeps one approval post per active company. The original export name is
 * preserved so existing deploy commands continue to update the same Function.
 */
exports.publishCompanyApprovalNewsOnCompanyCreate = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .firestore.document(`${COMPANIES_COLLECTION}/{companyId}`)
    .onWrite(async (change, context) => {
    const companyId = context.params.companyId;
    const before = change.before.exists ? change.before.data() || {} : {};
    const after = change.after.exists ? change.after.data() || {} : {};
    await updateActiveCompanySummary(change.before.exists ? before : null, change.after.exists ? after : null);
    if (!change.after.exists) {
        await deleteApprovalPostsForCompany(companyId, before);
        return null;
    }
    if (!isActiveCompany(after)) {
        await deleteApprovalPostsForCompany(companyId, after);
        return null;
    }
    await publishCompanyDocumentApproval(companyId, after, "automatico");
    return null;
});
/**
 * Refreshes company approval posts when the owner's current profile photo or
 * display name changes. This keeps historical posts aligned with the profile
 * currently shown in the app instead of preserving the image from registration.
 */
exports.publishCompanyApprovalNewsOnOwnerProfileWrite = functions
    .runWith({ timeoutSeconds: 180, memory: "256MB" })
    .firestore.document(`${USERS_COLLECTION}/{userId}`)
    .onWrite(async (change, context) => {
    const userId = context.params.userId;
    const before = change.before.exists ? change.before.data() || {} : {};
    const after = change.after.exists ? change.after.data() || {} : {};
    const beforeIdentity = contentDigest({
        name: firstNonEmpty(before.name, before.fullName, before.displayName),
        photo: ownerPhotoOf({}, {}, before),
        email: firstNonEmpty(before.email).toLowerCase(),
    });
    const afterIdentity = contentDigest({
        name: firstNonEmpty(after.name, after.fullName, after.displayName),
        photo: ownerPhotoOf({}, {}, after),
        email: firstNonEmpty(after.email).toLowerCase(),
    });
    if (beforeIdentity === afterIdentity)
        return null;
    const ownerEmails = Array.from(new Set([
        firstNonEmpty(after.email).toLowerCase(),
        firstNonEmpty(before.email).toLowerCase(),
    ].filter(Boolean)));
    const companyQueries = [
        db.collection(COMPANIES_COLLECTION).where("ownerId", "==", userId).get(),
        db.collection(COMPANIES_COLLECTION).where("userId", "==", userId).get(),
    ];
    ownerEmails.forEach((email) => {
        companyQueries.push(db.collection(COMPANIES_COLLECTION).where("ownerEmail", "==", email).get(), db.collection(COMPANIES_COLLECTION).where("email", "==", email).get());
    });
    const companySnapshots = await Promise.all(companyQueries);
    const companies = Array.from(new Map(companySnapshots.flatMap((snapshot) => snapshot.docs).map((document) => [
        document.id,
        document,
    ])).values());
    for (const companyDocument of companies) {
        const company = companyDocument.data() || {};
        if (!isActiveCompany(company)) {
            await deleteApprovalPostsForCompany(companyDocument.id, company);
            continue;
        }
        await publishCompanyDocumentApproval(companyDocument.id, company, "automatico");
    }
    return null;
});
/**
 * Reclassifies approval posts when a simulator label, alias or document ID is
 * edited. This is especially important for legacy companies whose simulatorId
 * is an opaque Firestore document ID and whose old simulatorName was incorrect.
 */
exports.publishCompanyApprovalNewsOnSimulatorWrite = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .firestore.document(`${SIMULATORS_COLLECTION}/{simulatorId}`)
    .onWrite(async () => {
    simulatorCatalogCache = null;
    await syncCompanyApprovalNewsHistoryOnce({ force: true });
    return null;
});
function canForceFullApprovalSync(context) {
    var _a;
    const token = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token;
    if (!token)
        return false;
    if (token.admin === true || token.senior === true || token.isSenior === true)
        return true;
    const roles = Array.isArray(token.roles) ? token.roles.map((role) => normalizeText(role)) : [];
    return roles.includes("admin") || roles.includes("senior");
}
exports.syncCompanyApprovalNews = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .https.onCall(async (data, context) => {
    (0, authorization_1.requireSenior)(context, "Somente o Painel Sênior pode sincronizar notícias de empresas.");
    const companyId = firstNonEmpty(data === null || data === void 0 ? void 0 : data.companyId);
    if (companyId) {
        const companySnapshot = await db
            .collection(COMPANIES_COLLECTION)
            .doc(companyId)
            .get();
        if (!companySnapshot.exists) {
            return Object.assign(Object.assign({ success: true }, emptyResult()), { removed: await deleteApprovalPostsForCompany(companyId) });
        }
        const company = companySnapshot.data() || {};
        const result = await publishCompanyDocumentApproval(companyId, company, "automatico");
        return Object.assign({ success: true }, result);
    }
    const requestedExpectedCount = Number(data === null || data === void 0 ? void 0 : data.expectedActiveCompanies);
    const expectedActiveCompanies = Number.isFinite(requestedExpectedCount)
        ? Math.max(0, Math.trunc(requestedExpectedCount))
        : undefined;
    const force = Boolean(data === null || data === void 0 ? void 0 : data.force) && canForceFullApprovalSync(context);
    const result = await syncCompanyApprovalNewsHistoryOnce({
        force,
        expectedActiveCompanies,
    });
    return Object.assign({ success: true }, result);
});
//# sourceMappingURL=companyApprovalNews.js.map