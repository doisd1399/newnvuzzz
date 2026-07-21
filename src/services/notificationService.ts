import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { NotificationTargetProfile } from "../lib/notificationScope";

export type NotificationType =
  | "NEW_OPERATION"
  | "RH_APPLICATION"
  | "WORK_REQUEST"
  | "OPERATION_COMPLETED"
  | "DRIVER_REQUEST_APPROVED"
  | "DRIVER_REQUEST_REJECTED"
  | "JOB_REQUEST_REJECTED"
  | "COMPANY_APPROVED"
  | "COMPANY_REJECTED"
  | "RECRUITMENT_APPROVED"
  | "RECRUITMENT_REJECTED"
  | "SYSTEM";

export interface AppNotification {
  id?: string;
  userId: string;
  companyId?: string;
  type: NotificationType;
  title: string;
  message: string;
  targetProfile: NotificationTargetProfile;
  read?: boolean;
  metadata?: Record<string, unknown>;
  /** Chave opcional para evitar duplicação do mesmo evento para o mesmo usuário. */
  dedupeKey?: string;
}

export interface CorporateNotificationInput {
  companyId: string;
  type: Exclude<NotificationType, "NEW_OPERATION">;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

function safeDocumentId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 1400);
}

export function buildNotificationPayload(notification: AppNotification) {
  const isRead = notification.read ?? false;
  return {
    userId: notification.userId,
    companyId: notification.companyId ?? null,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    targetProfile: notification.targetProfile,
    metadata: notification.metadata ?? null,
    titulo: notification.title,
    mensagem: notification.message,
    tipo: notification.type,
    lida: isRead,
    actorUserId: auth.currentUser?.uid ?? null,
    read: isRead,
    schemaVersion: 3,
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString(),
  };
}

export async function persistNotificationWithFallback<T>(params: {
  writeModern: () => Promise<T>;
  writeLegacy: () => Promise<T>;
  onModernError?: (error: unknown) => void;
}) {
  try {
    return await params.writeModern();
  } catch (error) {
    params.onModernError?.(error);
    return params.writeLegacy();
  }
}

export async function createNotification(notification: AppNotification) {
  const { dedupeKey } = notification;
  const payload = buildNotificationPayload(notification);

  const notificationId = dedupeKey
    ? safeDocumentId(`${notification.userId}_${dedupeKey}`)
    : doc(collection(db, "notifications")).id;
  const modernRef = doc(db, "notifications", notificationId);

  const legacyRef = doc(db, "notificacoes", notificationId);
  return persistNotificationWithFallback({
    writeModern: async () => {
      await setDoc(modernRef, payload, { merge: true });
      return modernRef;
    },
    writeLegacy: async () => {
      await setDoc(legacyRef, payload, { merge: true });
      return legacyRef;
    },
    onModernError: (modernCollectionError) => {
      // Algumas instalações antigas têm regra liberada somente para
      // `notificacoes`. O fallback usa o mesmo ID para não duplicar o aviso.
      console.warn(
        "[NVU Notifications] Coleção moderna indisponível; usando legado.",
        modernCollectionError,
      );
    },
  });
}

export async function resolveCorporateRecipientIds(companyId: string) {
  const recipientIds = new Set<string>();

  const companySnapshot = await getDoc(doc(db, "frotas", companyId));
  if (companySnapshot.exists()) {
    const company = companySnapshot.data();
    if (typeof company.ownerId === "string" && company.ownerId) {
      recipientIds.add(company.ownerId);
    }
    if (typeof company.userId === "string" && company.userId) {
      recipientIds.add(company.userId);
    }
  }

  const membersSnapshot = await getDocs(
    query(collection(db, "companyMembers"), where("companyId", "==", companyId)),
  );

  membersSnapshot.docs.forEach((memberDocument) => {
    const member = memberDocument.data();
    const roles = Array.isArray(member.roles) ? member.roles : [];
    const isActive = member.status === "active" || member.status == null;
    if (
      isActive &&
      roles.includes("admin") &&
      typeof member.userId === "string" &&
      member.userId
    ) {
      recipientIds.add(member.userId);
    }
  });

  return Array.from(recipientIds);
}

export async function createCorporateNotifications(
  notification: CorporateNotificationInput,
) {
  const recipientIds = await resolveCorporateRecipientIds(notification.companyId);

  await Promise.all(
    recipientIds.map((userId) =>
      createNotification({
        userId,
        companyId: notification.companyId,
        targetProfile: "corporate",
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata,
        dedupeKey: notification.dedupeKey
          ? `${notification.dedupeKey}_${userId}`
          : undefined,
      }),
    ),
  );

  return recipientIds;
}
