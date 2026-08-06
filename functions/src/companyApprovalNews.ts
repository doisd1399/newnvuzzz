import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { createHash } from "node:crypto";

const db = admin.firestore();
const NEWS_COLLECTION = "nvu_classificacoes";
const REGISTRATIONS_COLLECTION = "recruitment_applications";
const COMPANIES_COLLECTION = "frotas";
const USERS_COLLECTION = "users";
const NEWS_TIME_ZONE = "America/Sao_Paulo";
const SCHEMA_VERSION = "nvu_company_approval_v4";
const SYNC_CONTROL_DOCUMENT_ID = "nvu_company_approval_news_v4";
const SYNC_LOCK_TIMEOUT_MS = 15 * 60 * 1000;
const WRITE_BATCH_SIZE = 350;
const APPROVAL_POST_TITLE = "Nova empresa no ecossistema NVU";

type ApprovalWriteResult = {
  created: number;
  updated: number;
  ignored: number;
  removed: number;
};

type GeneratedApprovalPost = {
  id: string;
  contentHash: string;
  data: FirebaseFirestore.DocumentData;
};

type RegistrationRecord = {
  id: string;
  data: FirebaseFirestore.DocumentData;
};

function emptyResult(): ApprovalWriteResult {
  return { created: 0, updated: 0, ignored: 0, removed: 0 };
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return "";
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function simulatorKey(...values: unknown[]): string {
  const normalizedValues = values
    .map((value) => normalizeText(value).replace(/\s/g, ""))
    .filter(Boolean);

  for (const normalized of normalizedValues) {
    if (["gto", "globaltruckonline", "grandtrucksimulator"].includes(normalized)) return "gto";
    if (["ets2", "eurotrucksimulator2"].includes(normalized)) return "ets2";
    if (["ats", "americantrucksimulator"].includes(normalized)) return "ats";
    if (["toe3", "truckersofeurope3"].includes(normalized)) return "toe3";
    if (["wtds", "worldtruckdrivingsimulator"].includes(normalized)) return "wtds";
    if (["wbds", "worldbusdrivingsimulator"].includes(normalized)) return "wbds";
    if (["pbs", "protonbussimulator"].includes(normalized)) return "pbs";
  }

  return normalizedValues[0] || "";
}

function isDeletedCompany(company: FirebaseFirestore.DocumentData): boolean {
  const status = normalizeText(company.status || company.situacao || company.state);
  return company.deleted === true ||
    company.softDeleted === true ||
    company.excluida === true ||
    company.excluido === true ||
    ["deleted", "excluida", "excluido", "removed", "removida", "removido"].includes(status);
}

/** Mirrors the active-company rule used by the Senior Panel. */
function isActiveCompany(company: FirebaseFirestore.DocumentData): boolean {
  if (isDeletedCompany(company)) return false;
  const status = normalizeText(
    company.status || company.situacao || company.state || "active",
  );
  return ["active", "approved", "ativo"].includes(status);
}

function isCompanyRegistration(record: FirebaseFirestore.DocumentData): boolean {
  const type = normalizeText(record.type || record.registrationType || record.tipo);
  return type === "company registration" ||
    type === "company_registration" ||
    type === "registro de empresa" ||
    Boolean(record.companyName && record.ownerName && !record.fullName);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof admin.firestore.Timestamp) {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof (value as { toDate?: unknown })?.toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof (value as { seconds?: unknown })?.seconds === "number") {
    const parsed = new Date(Number((value as { seconds: number }).seconds) * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatApprovalDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: NEWS_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildSearchTokens(...values: unknown[]): string[] {
  const tokens = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeText(value);
    if (!normalized) return;
    if (normalized.length <= 120) tokens.add(normalized);
    normalized.split(" ").filter(Boolean).forEach((word) => {
      tokens.add(word);
      for (let length = 3; length <= word.length && length <= 18; length += 1) {
        tokens.add(word.slice(0, length));
      }
    });
  });
  return Array.from(tokens).slice(0, 160);
}

function safeDocumentId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 1400);
}

function approvalDocumentId(companyId: string): string {
  return safeDocumentId(`empresa_aprovada_empresa_${companyId}`);
}

function contentDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function companyLogoOf(
  registration: FirebaseFirestore.DocumentData,
  company: FirebaseFirestore.DocumentData,
): string {
  return firstNonEmpty(
    company.logoUrl,
    company.logoURL,
    company.companyLogoURL,
    company.companyLogoUrl,
    registration.companyLogoURL,
    registration.companyLogoUrl,
    registration.logoUrl,
    registration.logoURL,
    registration.photoURL,
  );
}

function ownerIdOf(
  registration: FirebaseFirestore.DocumentData,
  company: FirebaseFirestore.DocumentData,
): string {
  return firstNonEmpty(
    company.ownerId,
    company.userId,
    registration.approvedUserId,
    registration.userId,
  );
}

function ownerNameOf(
  registration: FirebaseFirestore.DocumentData,
  company: FirebaseFirestore.DocumentData,
  ownerProfile: FirebaseFirestore.DocumentData = {},
): string {
  return firstNonEmpty(
    ownerProfile.name,
    ownerProfile.fullName,
    ownerProfile.displayName,
    company.ownerName,
    registration.ownerName,
    registration.name,
    "Proprietário",
  );
}

function ownerPhotoOf(
  registration: FirebaseFirestore.DocumentData,
  company: FirebaseFirestore.DocumentData,
  ownerProfile: FirebaseFirestore.DocumentData = {},
): string {
  return firstNonEmpty(
    ownerProfile.profilePhotoURL,
    ownerProfile.profilePhotoUrl,
    ownerProfile.photoURL,
    ownerProfile.photoUrl,
    ownerProfile.applicationPhotoURL,
    ownerProfile.applicationPhotoUrl,
    ownerProfile.authPhotoURL,
    ownerProfile.avatarUrl,
    ownerProfile.avatar,
    ownerProfile.profileImage,
    ownerProfile.imageUrl,
    company.ownerPhotoUrl,
    company.ownerPhotoURL,
    registration.ownerPhotoUrl,
    registration.ownerPhotoURL,
    registration.profilePhotoURL,
    registration.ownerImageUrl,
  );
}

function approvalDateOf(
  registration: FirebaseFirestore.DocumentData,
  company: FirebaseFirestore.DocumentData,
): Date {
  return parseDate(registration.approvedAt) ||
    parseDate(registration.approvalDate) ||
    parseDate(company.approvedAt) ||
    parseDate(company.createdAt) ||
    parseDate(registration.updatedAt) ||
    parseDate(registration.createdAt) ||
    new Date();
}

function buildApprovalPost(
  registrationId: string,
  registration: FirebaseFirestore.DocumentData,
  companyId: string,
  company: FirebaseFirestore.DocumentData,
  origin: "automatico" | "historico",
  ownerProfile: FirebaseFirestore.DocumentData = {},
): GeneratedApprovalPost | null {
  const resolvedCompanyId = firstNonEmpty(
    companyId,
    registration.approvedCompanyId,
    company.id,
  );
  if (!resolvedCompanyId || !isActiveCompany(company)) return null;

  const companyName = firstNonEmpty(
    company.companyName,
    company.fleetName,
    registration.companyName,
    registration.fleetName,
    "Empresa NVU",
  );

  const ownerName = ownerNameOf(registration, company, ownerProfile);
  const ownerId = ownerIdOf(registration, company);
  const simulatorId = firstNonEmpty(
    company.simulatorId,
    company.simuladorId,
    registration.simulatorId,
    registration.simuladorId,
  );
  const simulatorName = firstNonEmpty(
    company.simulatorName,
    company.simuladorNome,
    company.simulator,
    registration.simulatorName,
    registration.simuladorNome,
    registration.simulator,
    simulatorId,
    "Simulador NVU",
  );
  const resolvedSimulatorKey = simulatorKey(simulatorId, simulatorName);
  if (!resolvedSimulatorKey) return null;

  const approvalDate = approvalDateOf(registration, company);
  const approvalTimestamp = admin.firestore.Timestamp.fromDate(approvalDate);
  const companyLogo = companyLogoOf(registration, company);
  const ownerPhoto = ownerPhotoOf(registration, company, ownerProfile);
  const dateLabel = formatApprovalDate(approvalDate);
  const caption = `Em ${dateLabel}, a empresa ${companyName} foi aprovada no simulador ${simulatorName} e agora faz parte do ecossistema NVU.`;
  const sourceRegistrationId = firstNonEmpty(
    company.sourceRegistrationId,
    registrationId,
  );
  const documentId = approvalDocumentId(resolvedCompanyId);

  const stableData: FirebaseFirestore.DocumentData = {
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
    dataAprovacaoLabel: dateLabel,
    sourceRegistrationId,
    origem: origin,
    historico: origin === "historico",
    status: "publicado",
    visibilidade: "publico",
    createdBySystem: true,
    dedupeKey: documentId,
    searchTokens: buildSearchTokens(
      APPROVAL_POST_TITLE,
      caption,
      companyName,
      ownerName,
      simulatorName,
      dateLabel,
      "nova empresa",
      "empresa aprovada",
      "ecossistema nvu",
    ),
  };
  const contentHash = contentDigest({
    ...stableData,
    approvedAt: approvalDate.toISOString(),
  });

  return {
    id: documentId,
    contentHash,
    data: {
      ...stableData,
      contentHash,
      approvedAt: approvalTimestamp,
      sortAt: approvalTimestamp,
      dataReferencia: approvalTimestamp,
      createdAt: approvalTimestamp,
    },
  };
}

async function commitApprovalPosts(
  posts: GeneratedApprovalPost[],
): Promise<ApprovalWriteResult> {
  const result = emptyResult();

  for (let index = 0; index < posts.length; index += WRITE_BATCH_SIZE) {
    const chunk = posts.slice(index, index + WRITE_BATCH_SIZE);
    const refs = chunk.map((post) => db.collection(NEWS_COLLECTION).doc(post.id));
    const existingSnapshots = refs.length > 0 ? await db.getAll(...refs) : [];
    const batch = db.batch();
    let writes = 0;

    chunk.forEach((post, postIndex) => {
      const existing = existingSnapshots[postIndex];
      if (existing?.exists && existing.data()?.contentHash === post.contentHash) {
        result.ignored += 1;
        return;
      }
      if (existing?.exists) result.updated += 1;
      else result.created += 1;
      batch.set(refs[postIndex], {
        ...post.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      writes += 1;
    });

    if (writes > 0) await batch.commit();
  }

  return result;
}

async function deleteDocumentRefs(
  refs: FirebaseFirestore.DocumentReference[],
): Promise<number> {
  const uniqueRefs = Array.from(
    new Map(refs.map((ref) => [ref.path, ref])).values(),
  );
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

async function readApprovalNewsDocuments(): Promise<
  FirebaseFirestore.QueryDocumentSnapshot[]
> {
  const [byType, byCategory, byTitle] = await Promise.all([
    db.collection(NEWS_COLLECTION).where("tipo", "==", "empresa_aprovada").get(),
    db.collection(NEWS_COLLECTION).where("categoria", "==", "nova_empresa").get(),
    db.collection(NEWS_COLLECTION).where("titulo", "==", APPROVAL_POST_TITLE).get(),
  ]);
  return Array.from(
    new Map(
      [...byType.docs, ...byCategory.docs, ...byTitle.docs].map((document) => [
        document.ref.path,
        document,
      ]),
    ).values(),
  );
}

async function reconcileApprovalPosts(
  posts: GeneratedApprovalPost[],
  activeCompanyIds: Set<string>,
): Promise<ApprovalWriteResult> {
  const writeResult = await commitApprovalPosts(posts);
  const desiredIds = new Set(posts.map((post) => post.id));
  const existingApprovalPosts = await readApprovalNewsDocuments();
  const staleRefs = existingApprovalPosts
    .filter((document) => {
      const data = document.data();
      const companyId = firstNonEmpty(data.empresaId, data.empresa?.id);
      return !desiredIds.has(document.id) ||
        !companyId ||
        !activeCompanyIds.has(companyId);
    })
    .map((document) => document.ref);

  writeResult.removed = await deleteDocumentRefs(staleRefs);
  return writeResult;
}

async function readApprovedCompanyRegistrations(): Promise<RegistrationRecord[]> {
  const registrations: RegistrationRecord[] = [];
  const snapshot = await db
    .collection(REGISTRATIONS_COLLECTION)
    .where("status", "==", "approved")
    .get();
  snapshot.docs.forEach((document) => {
    const data = document.data();
    if (isCompanyRegistration(data)) registrations.push({ id: document.id, data });
  });
  return registrations;
}

function registrationSortTime(record: RegistrationRecord): number {
  return approvalDateOf(record.data, {}).getTime();
}

function setLatestRegistration(
  map: Map<string, RegistrationRecord>,
  key: string,
  record: RegistrationRecord,
): void {
  if (!key) return;
  const current = map.get(key);
  if (!current || registrationSortTime(record) >= registrationSortTime(current)) {
    map.set(key, record);
  }
}

function companyIdentity(record: FirebaseFirestore.DocumentData): string {
  return normalizeText([
    record.ownerEmail || record.email,
    record.companyName || record.fleetName,
  ].filter(Boolean).join("|"));
}

function ownerEmailOf(
  registration: FirebaseFirestore.DocumentData,
  company: FirebaseFirestore.DocumentData,
): string {
  return firstNonEmpty(
    company.ownerEmail,
    company.email,
    registration.ownerEmail,
    registration.email,
  ).toLowerCase();
}

async function loadOwnerProfile(
  registration: FirebaseFirestore.DocumentData,
  company: FirebaseFirestore.DocumentData,
): Promise<FirebaseFirestore.DocumentData> {
  const ownerId = ownerIdOf(registration, company);
  if (ownerId) {
    const snapshot = await db.collection(USERS_COLLECTION).doc(ownerId).get();
    if (snapshot.exists) return { ...snapshot.data(), id: snapshot.id };
  }

  const ownerEmail = ownerEmailOf(registration, company);
  if (!ownerEmail) return {};
  const byEmail = await db
    .collection(USERS_COLLECTION)
    .where("email", "==", ownerEmail)
    .limit(5)
    .get();
  if (byEmail.empty) return {};

  const preferred = byEmail.docs.find((document) =>
    Boolean(ownerPhotoOf({}, {}, document.data())),
  ) || byEmail.docs[0];
  return { ...preferred.data(), id: preferred.id };
}

async function loadOwnerProfilesByIds(
  ownerIds: string[],
): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  const uniqueIds = Array.from(new Set(ownerIds.filter(Boolean)));
  const profiles = new Map<string, FirebaseFirestore.DocumentData>();

  for (let index = 0; index < uniqueIds.length; index += WRITE_BATCH_SIZE) {
    const chunk = uniqueIds.slice(index, index + WRITE_BATCH_SIZE);
    const refs = chunk.map((ownerId) =>
      db.collection(USERS_COLLECTION).doc(ownerId),
    );
    const snapshots = refs.length > 0 ? await db.getAll(...refs) : [];
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) {
        profiles.set(snapshot.id, { ...snapshot.data(), id: snapshot.id });
      }
    });
  }

  return profiles;
}

function syntheticRegistrationForCompany(
  companyId: string,
  company: FirebaseFirestore.DocumentData,
): RegistrationRecord {
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

export async function syncCompanyApprovalNewsHistory(): Promise<ApprovalWriteResult> {
  const [registrations, companiesSnapshot] = await Promise.all([
    readApprovedCompanyRegistrations(),
    db.collection(COMPANIES_COLLECTION).get(),
  ]);

  const registrationsById = new Map<string, RegistrationRecord>();
  const registrationsByCompanyId = new Map<string, RegistrationRecord>();
  const registrationsByIdentity = new Map<string, RegistrationRecord>();
  registrations.forEach((record) => {
    registrationsById.set(record.id, record);
    setLatestRegistration(
      registrationsByCompanyId,
      firstNonEmpty(record.data.approvedCompanyId),
      record,
    );
    setLatestRegistration(
      registrationsByIdentity,
      companyIdentity(record.data),
      record,
    );
  });

  const generated: GeneratedApprovalPost[] = [];
  const activeCompanyIds = new Set<string>();
  const activeCompanies = companiesSnapshot.docs.flatMap((document) => {
    const company: FirebaseFirestore.DocumentData = {
      ...document.data(),
      id: document.id,
    };
    if (!isActiveCompany(company)) return [];

    return [{ companyId: document.id, company }];
  });
  const ownerProfiles = await loadOwnerProfilesByIds(
    activeCompanies.map(({ company }) => ownerIdOf({}, company)),
  );

  for (const { companyId, company } of activeCompanies) {
    activeCompanyIds.add(companyId);
    const registration =
      registrationsById.get(firstNonEmpty(company.sourceRegistrationId)) ||
      registrationsByCompanyId.get(companyId) ||
      registrationsByIdentity.get(companyIdentity(company)) ||
      syntheticRegistrationForCompany(companyId, company);
    const ownerProfile =
      ownerProfiles.get(ownerIdOf(registration.data, company)) ||
      await loadOwnerProfile(registration.data, company);
    const post = buildApprovalPost(
      registration.id,
      registration.data,
      companyId,
      company,
      "historico",
      ownerProfile,
    );
    if (post) generated.push(post);
  }

  generated.sort((left, right) => {
    const leftDate = parseDate(left.data.sortAt)?.getTime() || 0;
    const rightDate = parseDate(right.data.sortAt)?.getTime() || 0;
    return leftDate - rightDate || left.id.localeCompare(right.id);
  });

  return reconcileApprovalPosts(generated, activeCompanyIds);
}

async function syncCompanyApprovalNewsHistoryOnce(): Promise<ApprovalWriteResult> {
  const controlRef = db.collection("system_settings").doc(SYNC_CONTROL_DOCUMENT_ID);
  const runId = createHash("sha256")
    .update(`${Date.now()}_${Math.random()}`)
    .digest("hex")
    .slice(0, 24);

  const decision = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(controlRef);
    const current = snapshot.data() || {};
    const lockAt = parseDate(current.lockAt);
    if (
      current.status === "in_progress" &&
      lockAt &&
      Date.now() - lockAt.getTime() < SYNC_LOCK_TIMEOUT_MS
    ) {
      return "in_progress" as const;
    }

    transaction.set(controlRef, {
      schemaVersion: SCHEMA_VERSION,
      status: "in_progress",
      runId,
      lockAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    return "run" as const;
  });

  if (decision !== "run") return emptyResult();

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
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lockAt: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    return result;
  } catch (error) {
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

async function loadRegistrationForCompany(
  companyId: string,
  company: FirebaseFirestore.DocumentData,
): Promise<RegistrationRecord> {
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
    .filter((record) =>
      isCompanyRegistration(record.data) &&
      normalizeText(record.data.status) === "approved",
    )
    .sort((left, right) => registrationSortTime(right) - registrationSortTime(left));
  if (companyRegistrations[0]) return companyRegistrations[0];

  return syntheticRegistrationForCompany(companyId, company);
}

async function deleteApprovalPostsForCompany(
  companyId: string,
  company?: FirebaseFirestore.DocumentData,
): Promise<number> {
  const refs: FirebaseFirestore.DocumentReference[] = [
    db.collection(NEWS_COLLECTION).doc(approvalDocumentId(companyId)),
  ];
  const byCompany = await db
    .collection(NEWS_COLLECTION)
    .where("empresaId", "==", companyId)
    .get();
  refs.push(...byCompany.docs.map((document) => document.ref));

  const sourceRegistrationId = firstNonEmpty(company?.sourceRegistrationId);
  if (sourceRegistrationId) {
    const byRegistration = await db
      .collection(NEWS_COLLECTION)
      .where("sourceRegistrationId", "==", sourceRegistrationId)
      .get();
    refs.push(...byRegistration.docs.map((document) => document.ref));
  }

  const existingRefs = await Promise.all(
    Array.from(new Map(refs.map((ref) => [ref.path, ref])).values()).map(
      async (ref) => ({ ref, snapshot: await ref.get() }),
    ),
  );
  return deleteDocumentRefs(
    existingRefs.filter(({ snapshot }) => snapshot.exists).map(({ ref }) => ref),
  );
}

async function publishCompanyDocumentApproval(
  companyId: string,
  company: FirebaseFirestore.DocumentData,
  origin: "automatico" | "historico" = "automatico",
): Promise<ApprovalWriteResult> {
  if (!isActiveCompany(company)) {
    return {
      ...emptyResult(),
      removed: await deleteApprovalPostsForCompany(companyId, company),
    };
  }

  const registration = await loadRegistrationForCompany(companyId, company);
  const ownerProfile = await loadOwnerProfile(registration.data, company);
  const post = buildApprovalPost(
    registration.id,
    registration.data,
    companyId,
    { ...company, id: companyId },
    origin,
    ownerProfile,
  );
  if (!post) return emptyResult();

  const result = await commitApprovalPosts([post]);
  const duplicates = await db
    .collection(NEWS_COLLECTION)
    .where("empresaId", "==", companyId)
    .get();
  result.removed = await deleteDocumentRefs(
    duplicates.docs
      .filter((document) => document.id !== post.id)
      .map((document) => document.ref),
  );
  return result;
}

export const publishCompanyApprovalNews = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .firestore.document(`${REGISTRATIONS_COLLECTION}/{applicationId}`)
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    if (!isCompanyRegistration(after)) return null;
    if (normalizeText(after.status) !== "approved") return null;
    if (normalizeText(before.status) === "approved") return null;

    const approvedCompanyId = firstNonEmpty(after.approvedCompanyId);
    let companySnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
    if (approvedCompanyId) {
      companySnapshot = await db
        .collection(COMPANIES_COLLECTION)
        .doc(approvedCompanyId)
        .get();
    }
    if (!companySnapshot?.exists) {
      const matchedCompany = await db
        .collection(COMPANIES_COLLECTION)
        .where("sourceRegistrationId", "==", context.params.applicationId)
        .limit(1)
        .get();
      companySnapshot = matchedCompany.docs[0] || null;
    }

    if (!companySnapshot?.exists) {
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

    await publishCompanyDocumentApproval(
      companySnapshot.id,
      company,
      "automatico",
    );
    return null;
  });

/**
 * Keeps one approval post per active company. The original export name is
 * preserved so existing deploy commands continue to update the same Function.
 */
export const publishCompanyApprovalNewsOnCompanyCreate = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .firestore.document(`${COMPANIES_COLLECTION}/{companyId}`)
  .onWrite(async (change, context) => {
    const companyId = context.params.companyId;
    const before = change.before.exists ? change.before.data() || {} : {};
    if (!change.after.exists) {
      await deleteApprovalPostsForCompany(companyId, before);
      return null;
    }

    const after = change.after.data() || {};
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
export const publishCompanyApprovalNewsOnOwnerProfileWrite = functions
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
    if (beforeIdentity === afterIdentity) return null;

    const ownerEmails = Array.from(new Set([
      firstNonEmpty(after.email).toLowerCase(),
      firstNonEmpty(before.email).toLowerCase(),
    ].filter(Boolean)));
    const companyQueries = [
      db.collection(COMPANIES_COLLECTION).where("ownerId", "==", userId).get(),
      db.collection(COMPANIES_COLLECTION).where("userId", "==", userId).get(),
    ];
    ownerEmails.forEach((email) => {
      companyQueries.push(
        db.collection(COMPANIES_COLLECTION).where("ownerEmail", "==", email).get(),
        db.collection(COMPANIES_COLLECTION).where("email", "==", email).get(),
      );
    });
    const companySnapshots = await Promise.all(companyQueries);
    const companies = Array.from(
      new Map(
        companySnapshots.flatMap((snapshot) => snapshot.docs).map((document) => [
          document.id,
          document,
        ]),
      ).values(),
    );

    for (const companyDocument of companies) {
      const company = companyDocument.data() || {};
      if (!isActiveCompany(company)) {
        await deleteApprovalPostsForCompany(companyDocument.id, company);
        continue;
      }
      await publishCompanyDocumentApproval(
        companyDocument.id,
        company,
        "automatico",
      );
    }

    return null;
  });

export const syncCompanyApprovalNews = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Autenticação obrigatória para sincronizar o histórico.",
      );
    }

    const companyId = firstNonEmpty(data?.companyId);
    if (companyId) {
      const companySnapshot = await db
        .collection(COMPANIES_COLLECTION)
        .doc(companyId)
        .get();
      if (!companySnapshot.exists) {
        return {
          success: true,
          ...emptyResult(),
          removed: await deleteApprovalPostsForCompany(companyId),
        };
      }
      const company = companySnapshot.data() || {};
      const result = await publishCompanyDocumentApproval(
        companyId,
        company,
        "automatico",
      );
      return { success: true, ...result };
    }

    const result = await syncCompanyApprovalNewsHistoryOnce();
    return { success: true, ...result };
  });
