import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { toast } from "sonner";
import { auth, db } from "../lib/firebase";
import { resolveSimulatorId } from "../lib/resolveSimulator";
import { normalizeSimulatorDocuments } from "../lib/simulatorCatalog";
import {
  beginAuthTeardown,
  endAuthTeardown,
  isAuthTeardownActive,
} from "../lib/authLifecycle";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { syncSingleSimulatorMember, removeSimulatorMember } from "../lib/syncSimulatorMembers";
import { resolveOperationalCompanyId } from "../lib/companyScope";
import { generateCnpj } from "../lib/cnpj";
import { preloadImages } from "../lib/imageCache";
import { warmRankingUserProfiles } from "../lib/rankingPhotoWarmup";
import { resolveMembershipRoles } from "../lib/membershipRoles";
import {
  resolveApprovedCompanyOwnerPhoto,
  resolvePersistedUserProfilePhoto,
} from "../lib/profilePhotoRecovery";
import {
  isNotificationVisibleForContext,
  normalizeNotificationForUi,
  notificationIdentity,
  notificationTimestampMs,
} from "../lib/notificationScope";
import {
  createCorporateNotifications,
  createNotification,
  resolveNotifications,
} from "../services/notificationService";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { registerDeviceForPush, clearPushRegistrationContext } from "../lib/capacitorPushService";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  deleteField,
  writeBatch,
  arrayUnion,
  serverTimestamp,
  or,
} from "firebase/firestore";

// --- Types ---
export type Role = "admin" | "driver";

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  roles: Role[];
  role?: Role;
  permissions: string[];
  status: "active" | "pending" | "rejected";
  joinedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  authPhotoURL?: string;
  profilePhotoURL?: string;
  whatsapp?: string;
  applicationSubmitted?: boolean;
  /** Documento da inscrição que está sendo acompanhada nesta sessão/conta. */
  currentRecruitmentApplicationId?: string;
  currentRecruitmentCompanyId?: string;
  currentRecruitmentSimulatorId?: string;
  currentRecruitmentStatus?: "pending" | "approved" | "rejected";
  status: "active" | "pending" | "rejected";
  isOnline?: boolean;
  level?: number;
  rating?: number;
  xp?: number;
  totalDeliveries?: number;

  // Legacy fields (kept for fallback only, do not rely on these)
  companyId?: string;
  memberships?: {
    [companyId: string]: {
      role: Role;
      roles: Role[];
      status: "active" | "pending" | "rejected";
    };
  };
  role?: Role;
  roles?: Role[];
}

export interface Vehicle {
  id: string;
  userId?: string;
  companyId: string;
  name: string;
  plate?: string;
  paintCode?: string;
  status: "available" | "in_use" | "maintenance";
}

export interface Trailer {
  id: string;
  userId?: string;
  companyId: string;
  name: string;
  plate?: string;
  paintCode?: string;
  status: "available" | "in_use";
}

export interface ContractDelivery {
  id: string;
  origin: string;
  destination: string;
}

export interface RecruitmentSettings {
  about: string;
  rules: string;
  howItWorks: string;
  benefits: string;
  isActive?: boolean;
}

export interface RecruitmentApplication {
  id: string;
  type?: "company_registration" | "driver_application";
  userId?: string;
  companyId: string;
  simulatorId?: string;
  applicationPhotoURL: string;
  applicationPhotoTransport?: "none" | "storage" | "firestore-data-url" | "legacy";
  fullName: string;
  whatsapp: string;
  email: string;
  reason: string;
  objective: string;
  deliveriesPerWeek: string;
  hasExperience?: boolean;
  primaryVehicle: string;
  secondaryVehicle: string;
  status: "pending" | "approved" | "rejected";
  flowVersion?: number;
  isCurrent?: boolean;
  supersededAt?: string;
  accessRevokedAt?: string;
  accessRevokedReason?: string;
  createdAt: string;
}

export interface Simulator {
  [key: string]: any;
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyProfile {
  [key: string]: any;
  id: string;
  userId?: string;
  ownerId?: string;
  companyName: string;
  fleetName?: string; // Fallback temporário
  simulatorName: string;
  simulatorId?: string;
  ownerName: string;
  email?: string;
  ownerEmail?: string;
  cnpj: string;
  whatsapp?: string;
  logoUrl?: string;
  logoURL?: string;
  companyLogoURL?: string;
  logoStoragePath?: string;
  ownerPhotoStoragePath?: string;
  ownerPhotoUrl?: string;
  sourceRegistrationId?: string;
  recruitmentSettings?: RecruitmentSettings;
}

export interface Sequence {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  createdAt: string;
  deleted?: boolean;
}

export interface Contract {
  id: string;
  userId?: string;
  companyId: string;
  companyName?: string;
  name: string;
  simulator: string;
  trailerId?: string;
  deadlineDays: number;
  totalDeliveries: number;
  mode: "simple" | "detailed";
  deliveries?: ContractDelivery[]; // Only for detailed mode
  status: "active" | "completed";
  sequenceId?: string;
  sequenceOrder?: number;
  deleted?: boolean;
}

export interface Job {
  id: string;
  userId?: string;
  motoristaId?: string;
  companyId: string;
  contractId: string;
  driverId: string;
  vehicleId: string;
  trailerId?: string;
  status: "pending" | "active" | "completed" | "cancelled" | "awaiting_completion";
  progress: number; // Num of completed deliveries
  contractNameSnapshot?: string;
  completedRoutes?: { origin: string; destination: string }[]; // For simple mode deliveries
  deadlineDate: string; // ISO String (legacy fallback)
  createdAt?: string;
  assignedAt?: string;
  dueAt?: string;
  completedAt?: string;
  completionStatus?: "on_time" | "late";
  completionTimeOffset?: string;
}

export interface JobDemand {
  id: string;
  driverId: string;
  companyId: string;
  status: "pending" | "reviewed";
  createdAt: string;
}

export interface DriverRequest {
  id: string;
  motoristaId: string;
  empresaId: string;
  simulatorId?: string;
  adminId: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  companyId?: string | null;
  targetProfile?: "driver" | "corporate";
  titulo: string;
  title?: string;
  mensagem: string;
  message?: string;
  tipo: string;
  type?: string;
  lida: boolean;
  read?: boolean;
  createdAt?: unknown;
  createdAtIso?: string;
  dataHora?: unknown;
  data?: unknown;
  popupShownAt?: unknown;
  popupShownAtIso?: string;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  sourceCollection?: "notifications" | "notificacoes";
}

// --- Initial Mock Data ---
const MOCK_COMPANIES: CompanyProfile[] = [
  {
    id: "c1",
    companyName: "Logistics Pro SA",
    fleetName: "Pro Fleet",
    simulatorName: "Euro Truck Simulator 2",
    ownerName: "Admin",
    cnpj: "12.345.678/0001-90",
  },
];

const MOCK_USERS: User[] = [
  {
    companyId: "c1",
    id: "u1",
    name: "Fábio Dias",
    email: "admin@frotalog.com",
    password: "123",
    role: "admin",
    roles: ["admin", "driver"],
    status: "active",
    profilePhotoURL: "https://i.prprofilePhotoURL.cc/150?u=u1",
  },
  {
    companyId: "c1",
    id: "u2",
    name: "João Silva",
    email: "joao@frotalog.com",
    password: "123",
    role: "driver",
    roles: ["driver"],
    status: "active",
    level: 4,
    rating: 4.8,
    profilePhotoURL: "https://i.prprofilePhotoURL.cc/150?u=u2",
  },
  {
    companyId: "c1",
    id: "u3",
    name: "Carlos Lima",
    email: "carlos@frotalog.com",
    password: "123",
    role: "driver",
    roles: ["driver"],
    status: "active",
    level: 2,
    rating: 4.5,
    profilePhotoURL: "https://i.prprofilePhotoURL.cc/150?u=u3",
  },
  {
    companyId: "c1",
    id: "u4",
    name: "Marcos Paulo",
    email: "marcos@frotalog.com",
    password: "123",
    role: "driver",
    roles: ["driver"],
    status: "pending",
    level: 1,
    rating: 5.0,
    profilePhotoURL: "https://i.prprofilePhotoURL.cc/150?u=u4",
  },
];

const MOCK_VEHICLES: Vehicle[] = [
  {
    companyId: "c1",
    id: "v1",
    name: "Scania R500",
    plate: "ABC-1D23",
    status: "available",
    paintCode: "#FF0000",
  },
  {
    companyId: "c1",
    id: "v2",
    name: "Volvo FH540",
    plate: "XYZ-9F71",
    status: "in_use",
    paintCode: "Azul Brilhante",
  },
  {
    companyId: "c1",
    id: "v3",
    name: "DAF XF 105",
    plate: "QWE-4422",
    status: "available",
  },
];

const MOCK_TRAILERS: Trailer[] = [
  {
    companyId: "c1",
    id: "t1",
    name: "Granel GR 7 Eixos",
    plate: "AAA-0001",
    status: "available",
    paintCode: "#FFFFFF",
  },
  {
    companyId: "c1",
    id: "t2",
    name: "Sider 3 Eixos",
    plate: "BBB-0002",
    status: "in_use",
  },
];

const MOCK_CONTRACTS: Contract[] = [
  {
    companyId: "c1",
    id: "c1",
    name: "Transporte de Grãos",
    simulator: "Euro Truck Sim 2",
    deadlineDays: 5,
    totalDeliveries: 8,
    mode: "simple",
    status: "active",
  },
  {
    companyId: "c1",
    id: "c2",
    name: "Minério de Ferro",
    simulator: "American Truck Sim",
    deadlineDays: 3,
    totalDeliveries: 4,
    mode: "detailed",
    deliveries: [
      { id: "d1", origin: "Mina A", destination: "Porto Novo" },
      { id: "d2", origin: "Mina A", destination: "Porto Sul" },
      { id: "d3", origin: "Mina B", destination: "Siderúrgica" },
      { id: "d4", origin: "Mina B", destination: "Porto Norte" },
    ],
    status: "active",
  },
];

// Pre-create some jobs
const d = new Date();
d.setDate(d.getDate() + 2); // Deadline in 2 days
const MOCK_JOBS: Job[] = [
  {
    companyId: "c1",
    id: "j1",
    contractId: "c1",
    driverId: "u2",
    vehicleId: "v2",
    trailerId: "t2",
    status: "active",
    progress: 3,
    deadlineDate: d.toISOString(),
  },
];

// --- Context Setup ---
export interface AppContextType {
  isSeniorAuthenticated: boolean;
  setIsSeniorAuthenticated: (val: boolean) => void;
  seniorCompanyId: string | null;
  setSeniorCompanyId: (val: string | null) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  activeRole: Role | null;
  memberships: CompanyMember[];
  allCompanyMembers: CompanyMember[];
  switchRole: (role: Role, newCompanyId?: string) => Promise<void>;
  promoteDriverToAdmin: (driverId: string) => Promise<void>;
  demoteAdminToDriver: (driverId: string) => Promise<void>;
  removeDriverFromFleet: (driverId: string) => Promise<void>;
  updateUserOnlineStatus: (isOnline: boolean) => Promise<void>;
  authInitialized: boolean;
  membershipsLoaded: boolean;
  sessionReady: boolean;
  sessionRecovering: boolean;
  refreshSession: (reason?: string) => void;

  users: User[];
  vehicles: Vehicle[];
  trailers: Trailer[];
  contracts: Contract[];
  sequences: Sequence[];
  jobs: Job[];
  jobDemands: JobDemand[];
  simulators: Simulator[];
  simulatorsLoading: boolean;
  simulatorsError: string | null;
  companies: CompanyProfile[];
  companiesLoading: boolean;
  allCompanies: CompanyProfile[];
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string | null) => void;
  recruitmentApplications: RecruitmentApplication[];

  // Global Ranking Filters
  globalPeriodPreset: "semana" | "mes" | "custom";
  setGlobalPeriodPreset: (p: "semana" | "mes" | "custom") => void;
  globalStartDateStr: string;
  setGlobalStartDateStr: (s: string) => void;
  globalEndDateStr: string;
  setGlobalEndDateStr: (s: string) => void;

  // Actions
  updateRecruitmentSettings: (
    companyId: string,
    settings: RecruitmentSettings,
  ) => Promise<void>;
  submitRecruitmentApplication: (
    data: Omit<RecruitmentApplication, "id" | "status" | "createdAt">,
  ) => Promise<string>;
  approveRecruitmentApplication: (applicationId: string) => Promise<void>;
  rejectRecruitmentApplication: (applicationId: string) => Promise<void>;
  deleteRecruitmentApplication: (applicationId: string) => Promise<void>;

  createCompany: (
    data: Omit<CompanyProfile, "id" | "cnpj">,
  ) => Promise<void>;
  updateCompany: (
    id: string,
    updates: Partial<Omit<CompanyProfile, "id" | "cnpj">>,
  ) => Promise<void>;
  deleteCompany: (id: string) => void;
  createContract: (contract: Omit<Contract, "id" | "status">) => Promise<void>;
  updateContract: (
    id: string,
    updates: Partial<Omit<Contract, "id">>,
  ) => Promise<void>;
  deleteContract: (id: string) => void;
  createSequence: (sequence: Omit<Sequence, "id" | "createdAt">) => Promise<void>;
  updateSequence: (id: string, updates: Partial<Omit<Sequence, "id">>) => Promise<void>;
  deleteSequence: (id: string) => Promise<void>;
  assignJob: (
    contractId: string,
    driverId: string,
    vehicleId: string,
    trailerId?: string,
    customDeadlineDays?: number,
  ) => void;
  startJob: (jobId: string) => Promise<void>;
  finishJob: (jobId: string) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  requestNewJobDemand: () => Promise<void>;
  cancelJobDemand: () => Promise<void>;
  rejectJobDemand: (demandId: string) => Promise<void>;
  driverRequests: DriverRequest[];
  notifications: AppNotification[];
  notificationsHydrated: boolean;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markNotificationPopupShown: (notificationId: string) => Promise<void>;
  requestJoinCompany: (companyId: string) => void;
  cancelRequestJoinCompany: (requestId: string) => void;
  approveDriver: (requestId: string) => void;
  rejectDriver: (requestId: string) => void;
  syncCompanyData: () => Promise<void>;
  createManualDriver: (driverData: Partial<User>) => Promise<void>;
  registerUser: (
    userData: Pick<User, "name" | "email" | "password" | "role">,
  ) => void;
  addVehicle: (vehicle: Omit<Vehicle, "id" | "status" | "companyId">) => void;
  updateVehicle: (id: string, updates: Partial<Omit<Vehicle, "id">>) => void;
  deleteVehicle: (id: string) => void;

  addTrailer: (trailer: Omit<Trailer, "id" | "status" | "companyId">) => void;
  updateTrailer: (id: string, updates: Partial<Omit<Trailer, "id">>) => void;
  deleteTrailer: (id: string) => void;
  logOutApp: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export interface SessionStoreType {
  isSeniorAuthenticated: boolean;
  setIsSeniorAuthenticated: (val: boolean) => void;
  seniorCompanyId: string | null;
  setSeniorCompanyId: (val: string | null) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  authInitialized: boolean;
  membershipsLoaded: boolean;
  sessionReady: boolean;
  sessionRecovering: boolean;
  refreshSession: (reason?: string) => void;
  activeRole: Role | null;
  memberships: CompanyMember[];
  companies: CompanyProfile[];
  companiesLoading: boolean;
  allCompanies: CompanyProfile[];
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string | null) => void;
  switchRole: (role: Role, newCompanyId?: string) => Promise<void>;
  logOutApp: () => Promise<void>;
}

export interface NotificationStoreType {
  notifications: AppNotification[];
  notificationsHydrated: boolean;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markNotificationPopupShown: (notificationId: string) => Promise<void>;
}

export interface ActivityStoreType {
  jobDemands: JobDemand[];
  driverRequests: DriverRequest[];
  recruitmentApplications: RecruitmentApplication[];
}

export interface RankingFilterStoreType {
  globalPeriodPreset: "semana" | "mes" | "custom";
  setGlobalPeriodPreset: (p: "semana" | "mes" | "custom") => void;
  globalStartDateStr: string;
  setGlobalStartDateStr: (s: string) => void;
  globalEndDateStr: string;
  setGlobalEndDateStr: (s: string) => void;
}

export type OperationalStoreType = Pick<
  AppContextType,
  | "users"
  | "allCompanyMembers"
  | "vehicles"
  | "trailers"
  | "contracts"
  | "sequences"
  | "jobs"
  | "simulators"
  | "simulatorsLoading"
  | "simulatorsError"
  | "updateRecruitmentSettings"
  | "submitRecruitmentApplication"
  | "approveRecruitmentApplication"
  | "rejectRecruitmentApplication"
  | "deleteRecruitmentApplication"
  | "createCompany"
  | "updateCompany"
  | "deleteCompany"
  | "createContract"
  | "updateContract"
  | "deleteContract"
  | "createSequence"
  | "updateSequence"
  | "deleteSequence"
  | "assignJob"
  | "startJob"
  | "finishJob"
  | "cancelJob"
  | "deleteJob"
  | "requestNewJobDemand"
  | "cancelJobDemand"
  | "rejectJobDemand"
  | "requestJoinCompany"
  | "cancelRequestJoinCompany"
  | "approveDriver"
  | "rejectDriver"
  | "promoteDriverToAdmin"
  | "demoteAdminToDriver"
  | "removeDriverFromFleet"
  | "updateUserOnlineStatus"
  | "createManualDriver"
  | "registerUser"
  | "syncCompanyData"
  | "addVehicle"
  | "updateVehicle"
  | "deleteVehicle"
  | "addTrailer"
  | "updateTrailer"
  | "deleteTrailer"
>;

const SessionContext = createContext<SessionStoreType | undefined>(undefined);
const NotificationStoreContext = createContext<NotificationStoreType | undefined>(undefined);
const ActivityContext = createContext<ActivityStoreType | undefined>(undefined);
const RankingFilterContext = createContext<RankingFilterStoreType | undefined>(undefined);
const OperationalContext = createContext<OperationalStoreType | undefined>(undefined);

/**
 * Keeps action identities stable while still executing the latest implementation.
 * This prevents context consumers from re-rendering only because AppProvider
 * recreated an async action after an unrelated Firestore snapshot.
 */
const useStableEvent = <T extends (...args: any[]) => any>(handler: T): T => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  return useMemo(
    () => ((...args: Parameters<T>) => handlerRef.current(...args)) as T,
    [],
  );
};

const SESSION_CACHE_VERSION = "v5";
const SESSION_UID_KEY = "nvu.session.uid";
const SESSION_USER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_MEMBERSHIP_CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const PUBLIC_COMPANIES_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const sessionUserCacheKey = (uid: string) =>
  `nvu.session.${SESSION_CACHE_VERSION}.user.${uid}`;
const sessionMembershipCacheKey = (uid: string) =>
  `nvu.session.${SESSION_CACHE_VERSION}.memberships.${uid}`;
const sessionActiveCompanyKey = (uid: string) =>
  `nvu.session.${SESSION_CACHE_VERSION}.active-company.${uid}`;
const sessionActiveRoleKey = (uid: string) =>
  `nvu.session.${SESSION_CACHE_VERSION}.active-role.${uid}`;
const COMPANIES_CACHE_KEY = "nvu.public.companies.v4";

const readLocalStorageValue = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocalStorageValue = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // O estado React permanece válido em previews com storage restrito.
  }
};

const removeLocalStorageValue = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Limpeza best-effort.
  }
};

const readSessionStorageValue = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeSessionStorageValue = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // O estado React permanece válido em previews com storage restrito.
  }
};

const removeSessionStorageValue = (key: string): void => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Limpeza best-effort.
  }
};

const clearSessionStorage = (): void => {
  try {
    sessionStorage.clear();
  } catch {
    // Limpeza best-effort.
  }
};

const isFreshCache = (cachedAt: unknown, maxAgeMs: number) =>
  typeof cachedAt === "number" &&
  Number.isFinite(cachedAt) &&
  cachedAt > 0 &&
  Date.now() - cachedAt <= maxAgeMs;

const readCachedCompanies = (): CompanyProfile[] => {
  try {
    const raw = localStorage.getItem(COMPANIES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      companies?: CompanyProfile[];
      cachedAt?: number;
    };
    return Array.isArray(parsed.companies) &&
      isFreshCache(parsed.cachedAt, PUBLIC_COMPANIES_CACHE_MAX_AGE_MS)
      ? parsed.companies
      : [];
  } catch {
    return [];
  }
};

const writeCachedCompanies = (companies: CompanyProfile[]) => {
  try {
    localStorage.setItem(
      COMPANIES_CACHE_KEY,
      JSON.stringify({ companies, cachedAt: Date.now() }),
    );
  } catch {
    // Public company cache is best-effort only.
  }
};

const normalizeAuthenticatedUser = (
  raw: Record<string, unknown>,
  id: string,
): User => {
  const data = { ...raw, id } as User;
  const rawRoles = Array.isArray(data.roles) ? [...data.roles] : [];
  if (rawRoles.length === 0) rawRoles.push(data.role || "driver");
  if (rawRoles.includes("admin") && !rawRoles.includes("driver")) {
    rawRoles.push("driver");
  }
  data.roles = Array.from(new Set(rawRoles));

  if (!data.role) {
    data.role = ((data.roles as string[]).includes("senior")
      ? "senior"
      : data.roles.includes("admin")
        ? "admin"
        : "driver") as Role;
  }
  if (data.roles.includes("admin")) data.status = "active";

  const resolvedProfilePhoto = resolvePersistedUserProfilePhoto(data);
  if (resolvedProfilePhoto && !data.profilePhotoURL) {
    data.profilePhotoURL = resolvedProfilePhoto;
  }

  return data;
};

const createFirebaseIdentityFallback = (firebaseUser: {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}): User => ({
  id: firebaseUser.uid,
  name:
    firebaseUser.displayName?.trim() ||
    firebaseUser.email?.split("@")[0] ||
    "Usuário",
  email: firebaseUser.email || "",
  authPhotoURL: firebaseUser.photoURL || undefined,
  profilePhotoURL: firebaseUser.photoURL || undefined,
  status: "active",
  role: "driver",
  roles: ["driver"],
});

const readCachedSessionUser = (uid: string): User | null => {
  try {
    const raw = localStorage.getItem(sessionUserCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      uid?: string;
      user?: User;
      cachedAt?: number;
    };
    if (
      parsed.uid !== uid ||
      !parsed.user ||
      parsed.user.id !== uid ||
      !isFreshCache(parsed.cachedAt, SESSION_USER_CACHE_MAX_AGE_MS)
    ) {
      return null;
    }
    return normalizeAuthenticatedUser(
      parsed.user as unknown as Record<string, unknown>,
      uid,
    );
  } catch {
    return null;
  }
};

const writeCachedSessionUser = (user: User) => {
  try {
    const cacheable = { ...user };
    delete cacheable.password;
    localStorage.setItem(
      sessionUserCacheKey(user.id),
      JSON.stringify({ uid: user.id, user: cacheable, cachedAt: Date.now() }),
    );
  } catch {
    // Storage can be unavailable in private mode; the live session still works.
  }
};

const normalizeCompanyMember = (
  raw: Record<string, unknown>,
  id: string,
): CompanyMember => {
  const normalized = { ...raw, id } as unknown as CompanyMember;
  normalized.companyId = String(raw.companyId || "");
  normalized.userId = String(raw.userId || "");
  normalized.roles = resolveMembershipRoles({
    ...raw,
    companyId: normalized.companyId,
  }) as Role[];
  normalized.permissions = Array.isArray(raw.permissions)
    ? raw.permissions.filter((permission): permission is string =>
        typeof permission === "string",
      )
    : [];
  normalized.status =
    raw.status === "pending" || raw.status === "rejected"
      ? raw.status
      : "active";
  return normalized;
};

const readCachedMemberships = (uid: string): CompanyMember[] => {
  try {
    const raw = localStorage.getItem(sessionMembershipCacheKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      uid?: string;
      memberships?: CompanyMember[];
      cachedAt?: number;
    };
    if (
      parsed.uid !== uid ||
      !Array.isArray(parsed.memberships) ||
      !isFreshCache(
        parsed.cachedAt,
        SESSION_MEMBERSHIP_CACHE_MAX_AGE_MS,
      )
    ) {
      return [];
    }
    return parsed.memberships
      .map((membership) =>
        normalizeCompanyMember(
          membership as unknown as Record<string, unknown>,
          membership.id || `cached-${membership.companyId}`,
        ),
      )
      .filter(
        (membership) =>
          membership.userId === uid && Boolean(membership.companyId),
      );
  } catch {
    return [];
  }
};

const hasCachedMembershipSnapshot = (uid: string) => {
  try {
    const raw = localStorage.getItem(sessionMembershipCacheKey(uid));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      uid?: string;
      memberships?: CompanyMember[];
      cachedAt?: number;
    };
    return (
      parsed.uid === uid &&
      Array.isArray(parsed.memberships) &&
      isFreshCache(
        parsed.cachedAt,
        SESSION_MEMBERSHIP_CACHE_MAX_AGE_MS,
      )
    );
  } catch {
    return false;
  }
};

const readBootSessionSnapshot = () => {
  try {
    const uid = localStorage.getItem(SESSION_UID_KEY);
    if (!uid) {
      return {
        uid: null as string | null,
        user: null as User | null,
        memberships: [] as CompanyMember[],
        membershipsCached: false,
      };
    }
    return {
      uid,
      user: readCachedSessionUser(uid),
      memberships: readCachedMemberships(uid),
      membershipsCached: hasCachedMembershipSnapshot(uid),
    };
  } catch {
    return {
      uid: null as string | null,
      user: null as User | null,
      memberships: [] as CompanyMember[],
      membershipsCached: false,
    };
  }
};

const writeCachedMemberships = (uid: string, memberships: CompanyMember[]) => {
  try {
    localStorage.setItem(
      sessionMembershipCacheKey(uid),
      JSON.stringify({
        uid,
        memberships: memberships.map((membership) =>
          normalizeCompanyMember(
            membership as unknown as Record<string, unknown>,
            membership.id || `cached-${membership.companyId}`,
          ),
        ),
        cachedAt: Date.now(),
      }),
    );
  } catch {
    // Best-effort cache only.
  }
};

const clearCachedSession = (uid?: string | null) => {
  try {
    const targetUid = uid || localStorage.getItem(SESSION_UID_KEY);
    if (targetUid) {
      localStorage.removeItem(sessionUserCacheKey(targetUid));
      localStorage.removeItem(sessionMembershipCacheKey(targetUid));
      localStorage.removeItem(sessionActiveCompanyKey(targetUid));
      localStorage.removeItem(sessionActiveRoleKey(targetUid));
    }
    localStorage.removeItem(SESSION_UID_KEY);
  } catch {
    // Best-effort cleanup only.
  }
};

const clearAllPrivateClientCaches = () => {
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (
        key &&
        (key.startsWith("nvu.session.") ||
          key.startsWith("nvu.ranking.snapshot."))
      ) {
        keys.push(key);
      }
    }
    keys.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem("activeCompanyId");
    localStorage.removeItem("activeRole");
  } catch {
    // Best-effort cleanup only.
  }
};

const waitForSessionRetry = (delayMs: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));

const isRecoverableSessionError = (error: unknown) => {
  const code = String((error as { code?: unknown })?.code || "").toLowerCase();
  return (
    !code ||
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("network-request-failed") ||
    code.includes("cancelled") ||
    code.includes("permission-denied") ||
    code.includes("unauthenticated")
  );
};

const runSessionReadWithRetry = async <T,>(
  operation: () => Promise<T>,
  firebaseUser: { getIdToken: (forceRefresh?: boolean) => Promise<string> },
  attempts = 3,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRecoverableSessionError(error) || attempt === attempts - 1) throw error;
      try {
        await firebaseUser.getIdToken(attempt > 0);
      } catch {
        // The next Firestore attempt still has a chance to use cached data.
      }
      await waitForSessionRetry(300 * 2 ** attempt);
    }
  }
  throw lastError;
};

const recoverApprovedCompanyOwnerPhoto = async (
  userId: string,
  email?: string,
): Promise<string> => {
  if (isAuthTeardownActive() || auth.currentUser?.uid !== userId) return "";
  const registrations = new Map<string, Record<string, unknown>>();

  const byUserId = await getDocs(
    query(
      collection(db, "recruitment_applications"),
      where("userId", "==", userId),
    ),
  );
  byUserId.docs.forEach((registrationDoc) =>
    registrations.set(registrationDoc.id, registrationDoc.data()),
  );

  if (email) {
    if (isAuthTeardownActive() || auth.currentUser?.uid !== userId) return "";
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail) {
      const byEmail = await getDocs(
        query(
          collection(db, "recruitment_applications"),
          where("email", "==", normalizedEmail),
        ),
      );
      byEmail.docs.forEach((registrationDoc) =>
        registrations.set(registrationDoc.id, registrationDoc.data()),
      );
    }
  }

  const ownerPhoto = resolveApprovedCompanyOwnerPhoto(
    Array.from(registrations.values()),
  );
  if (!ownerPhoto) return "";

  if (isAuthTeardownActive() || auth.currentUser?.uid !== userId) return "";

  await setDoc(
    doc(db, "users", userId),
    {
      profilePhotoURL: ownerPhoto,
      profilePhotoRecoveredAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return ownerPhoto;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Rehydrate the last validated session synchronously. Firebase remains the
  // authority and replaces/clears this snapshot as soon as Auth resolves, but
  // cached private data is exposed only when Firebase has already confirmed the
  // same UID. This prevents a previous account from flashing inside public
  // registration screens while Auth is still restoring its session.
  const bootSession = useMemo(() => readBootSessionSnapshot(), []);
  const verifiedBootUid =
    auth.currentUser?.uid && auth.currentUser.uid === bootSession.uid
      ? auth.currentUser.uid
      : null;
  const [currentUser, setCurrentUser] = useState<User | null>(() =>
    verifiedBootUid ? bootSession.user : null,
  );
  const [authInitialized, setAuthInitialized] = useState(
    () => Boolean(verifiedBootUid),
  );
  const [firebaseSessionUid, setFirebaseSessionUid] = useState<string | null>(
    auth.currentUser?.uid || null,
  );
  const [membershipsLoaded, setMembershipsLoaded] = useState(
    () => Boolean(verifiedBootUid && bootSession.membershipsCached),
  );
  const [memberships, setMemberships] = useState<CompanyMember[]>(
    () => (verifiedBootUid ? bootSession.memberships : []),
  );
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(() => {
    if (!verifiedBootUid) return null;
    const storedActiveCompanyId = readLocalStorageValue(
      sessionActiveCompanyKey(verifiedBootUid),
    );
    if (storedActiveCompanyId) return storedActiveCompanyId;

    const seniorAccess = readSessionStorageValue("seniorAccess") === "true";
    const storedSeniorCompanyId = readSessionStorageValue("seniorCompanyId");
    return seniorAccess ? storedSeniorCompanyId : null;
  });
  // Only restore the temporary Senior session when it is bound to the
  // currently signed-in Firebase UID. The old generic flag is intentionally
  // not trusted across account changes.
  const [isSeniorAuthenticated, setIsSeniorAuthenticated] = useState<boolean>(() => {
    const uid = auth.currentUser?.uid;
    return Boolean(
      uid &&
        readSessionStorageValue("seniorPanelPasswordUnlocked") === "true" &&
        readSessionStorageValue("seniorPanelPasswordUid") === uid,
    );
  });
  const [seniorCompanyId, setSeniorCompanyId] = useState<string | null>(() =>
    readSessionStorageValue("seniorCompanyId"),
  );
  const profilePhotoRepairAttemptedRef = useRef<Set<string>>(new Set());

  // Logout is a controlled teardown. These refs let us stop authenticated
  // Firestore listeners before Firebase Auth revokes the session, avoiding the
  // transient permission-denied errors seen in embedded previews/WebViews.
  const isLoggingOutRef = useRef(false);
  const userDocumentUnsubscribeRef = useRef<(() => void) | null>(null);
  const membershipsUnsubscribeRef = useRef<(() => void) | null>(null);
  const privateSubscriptionsUnsubscribeRef = useRef<(() => void) | null>(null);
  const privateSubscriptionsGenerationRef = useRef(0);
  // Shared company data (users, vehicles, contracts and members) remains
  // valid across an admin <-> driver switch inside the same company. Keep it
  // visible while role-specific listeners reconnect so the destination does
  // not flash empty or wait for a second round of snapshots.
  const privateDataScopeRef = useRef<{
    uid: string;
    companyId: string | null;
    role: Role | null;
  } | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const membershipsRef = useRef<CompanyMember[]>([]);
  const authObserverGenerationRef = useRef(0);
  const lastSessionRefreshAtRef = useRef(0);
  const [sessionRecovering, setSessionRecovering] = useState(false);
  const [sessionRefreshEpoch, setSessionRefreshEpoch] = useState(0);

  const canProcessAuthenticatedCallback = (expectedUid?: string) =>
    !isLoggingOutRef.current &&
    !isAuthTeardownActive() &&
    Boolean(auth.currentUser) &&
    (!expectedUid || auth.currentUser?.uid === expectedUid);

  const [activeRole, setActiveRole] = useState<Role | null>(() => {
    if (!verifiedBootUid) return null;
    const storedRole = readLocalStorageValue(
      sessionActiveRoleKey(verifiedBootUid),
    );
    return storedRole === "admin" || storedRole === "driver"
      ? storedRole
      : null;
  });

  const hasVerifiedSeniorRole = Boolean(
    (currentUser as any)?.role === "senior" ||
      (Array.isArray((currentUser as any)?.roles) &&
        (currentUser as any).roles.includes("senior")),
  );
  // Transitional password mode keeps the existing senior workflow usable
  // until the shared password is replaced by server-side claims.
  const hasSeniorPanelAccess = hasVerifiedSeniorRole || isSeniorAuthenticated;

  const [globalPeriodPreset, setGlobalPeriodPreset] = useState<"semana" | "mes" | "custom">("mes");
  const [globalStartDateStr, setGlobalStartDateStr] = useState<string>("");
  const [globalEndDateStr, setGlobalEndDateStr] = useState<string>("");

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    membershipsRef.current = memberships;
  }, [memberships]);

  const refreshSession = (reason = "manual") => {
    if (isLoggingOutRef.current || isAuthTeardownActive() || !auth.currentUser) return;
    const now = Date.now();
    if (reason !== "manual" && now - lastSessionRefreshAtRef.current < 2500) return;
    lastSessionRefreshAtRef.current = now;
    setSessionRecovering(true);
    setSessionRefreshEpoch((value) => value + 1);
  };

  useEffect(() => {
    const handleOnline = () => refreshSession("online");
    const handleVisible = () => {
      if (document.visibilityState === "visible") refreshSession("visible");
    };
    const handleRequestedRefresh = () => refreshSession("app-resume");

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("nvu-session-refresh", handleRequestedRefresh);
    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("nvu-session-refresh", handleRequestedRefresh);
    };
  }, []);

  // Observe auth state and rebuild the application session after refreshes,
  // deploys and Android WebView resumes.
  useEffect(() => {
    let unsubDoc: (() => void) | undefined;
    let fallbackTimer: number | undefined;
    let disposed = false;
    const generation = ++authObserverGenerationRef.current;

    const isCurrentGeneration = (uid?: string) =>
      !disposed &&
      generation === authObserverGenerationRef.current &&
      (!uid || canProcessAuthenticatedCallback(uid));

    const stopUserDocumentListener = () => {
      if (fallbackTimer !== undefined) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = undefined;
      }
      if (unsubDoc) {
        unsubDoc();
        if (userDocumentUnsubscribeRef.current === unsubDoc) {
          userDocumentUnsubscribeRef.current = null;
        }
        unsubDoc = undefined;
      }
    };

    const commitUserDocument = (
      firebaseUser: NonNullable<typeof auth.currentUser>,
      raw: Record<string, unknown>,
      id: string,
    ) => {
      if (!isCurrentGeneration(firebaseUser.uid)) return;
      const data = normalizeAuthenticatedUser(raw, id);
      currentUserRef.current = data;
      setCurrentUser(data);
      writeCachedSessionUser(data);
      setAuthInitialized(true);
      setSessionRecovering(false);

      const resolvedProfilePhoto = resolvePersistedUserProfilePhoto(data);
      if (
        !resolvedProfilePhoto &&
        !profilePhotoRepairAttemptedRef.current.has(firebaseUser.uid)
      ) {
        profilePhotoRepairAttemptedRef.current.add(firebaseUser.uid);
        void recoverApprovedCompanyOwnerPhoto(
          firebaseUser.uid,
          data.email || firebaseUser.email || undefined,
        ).catch((photoRecoveryError) => {
          console.warn(
            "[NVU Profile Photo] Approved owner photo recovery failed:",
            photoRecoveryError,
          );
        });
      }
    };

    const recoverUserDocument = async (
      firebaseUser: NonNullable<typeof auth.currentUser>,
      source: string,
    ) => {
      try {
        const userDocument = await runSessionReadWithRetry(
          () => getDoc(doc(db, "users", firebaseUser.uid)),
          firebaseUser,
        );
        if (!isCurrentGeneration(firebaseUser.uid)) return;
        if (userDocument.exists()) {
          commitUserDocument(firebaseUser, userDocument.data(), userDocument.id);
          return;
        }

        // A new Google login can briefly precede user-document unification.
        // Keep the cached identity while the next auth/profile cycle retries.
        const cachedUser = readCachedSessionUser(firebaseUser.uid);
        if (cachedUser) {
          currentUserRef.current = cachedUser;
          setCurrentUser(cachedUser);
        } else if (currentUserRef.current?.id !== firebaseUser.uid) {
          setCurrentUser(null);
        }
        setAuthInitialized(true);
        setSessionRecovering(false);
      } catch (error) {
        if (!isCurrentGeneration(firebaseUser.uid)) return;
        console.warn(`[NVU Session] Falha ao reidratar usuário (${source}).`, error);
        const cachedUser = readCachedSessionUser(firebaseUser.uid);
        if (cachedUser) {
          currentUserRef.current = cachedUser;
          setCurrentUser(cachedUser);
        }
        // Never erase a valid authenticated UI because of a transient
        // Firestore/token failure. A resume/online event will retry.
        setAuthInitialized(true);
        setSessionRecovering(false);
      }
    };

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      stopUserDocumentListener();

      if (firebaseUser) {
        setFirebaseSessionUid(firebaseUser.uid);
        if (!isLoggingOutRef.current) endAuthTeardown();

        const previousUid = readLocalStorageValue(SESSION_UID_KEY);
        const isSameAccount = previousUid === firebaseUser.uid;
        if (previousUid && !isSameAccount) {
          clearAllPrivateClientCaches();
          setActiveCompanyId(null);
          setActiveRole(null);
          setMemberships([]);
          membershipsRef.current = [];
          setMembershipsLoaded(false);
        }

        const legacyActiveCompanyId = isSameAccount
          ? readLocalStorageValue("activeCompanyId")
          : null;
        const legacyActiveRole = isSameAccount
          ? readLocalStorageValue("activeRole")
          : null;
        const restoredCompanyId =
          readLocalStorageValue(sessionActiveCompanyKey(firebaseUser.uid)) ||
          legacyActiveCompanyId;
        const restoredRoleValue =
          readLocalStorageValue(sessionActiveRoleKey(firebaseUser.uid)) ||
          legacyActiveRole;

        setActiveCompanyId(restoredCompanyId || null);
        setActiveRole(
          restoredRoleValue === "admin" || restoredRoleValue === "driver"
            ? restoredRoleValue
            : null,
        );
        if (restoredCompanyId) {
          writeLocalStorageValue(
            sessionActiveCompanyKey(firebaseUser.uid),
            restoredCompanyId,
          );
        }
        if (restoredRoleValue === "admin" || restoredRoleValue === "driver") {
          writeLocalStorageValue(
            sessionActiveRoleKey(firebaseUser.uid),
            restoredRoleValue,
          );
        }
        removeLocalStorageValue("activeCompanyId");
        removeLocalStorageValue("activeRole");
        writeLocalStorageValue(SESSION_UID_KEY, firebaseUser.uid);

        const cachedUser = readCachedSessionUser(firebaseUser.uid);
        const alreadyHydrated = currentUserRef.current?.id === firebaseUser.uid;
        if (!alreadyHydrated && cachedUser) {
          currentUserRef.current = cachedUser;
          setCurrentUser(cachedUser);
        } else if (!alreadyHydrated && !cachedUser) {
          // Firebase Auth is already authoritative for identity. This minimal
          // fallback starts membership rehydration without trusting a stored
          // company or admin role; the user document replaces it shortly.
          const identityFallback = createFirebaseIdentityFallback(firebaseUser);
          currentUserRef.current = identityFallback;
          setCurrentUser(identityFallback);
        }

        // During same-account recovery keep the current interface mounted.
        setAuthInitialized(true);
        setSessionRecovering(true);

        const passwordSessionBelongsToUser =
          readSessionStorageValue("seniorPanelPasswordUnlocked") === "true" &&
          readSessionStorageValue("seniorPanelPasswordUid") === firebaseUser.uid;
        setIsSeniorAuthenticated(passwordSessionBelongsToUser);

        console.log("[NVU Session] Firebase user detected:", firebaseUser.uid);
        let listenerHydrated = false;
        try {
          const unsubscribeUserDocument = onSnapshot(
            doc(db, "users", firebaseUser.uid),
            (userDocument) => {
              if (!isCurrentGeneration(firebaseUser.uid)) return;
              listenerHydrated = true;
              if (fallbackTimer !== undefined) {
                window.clearTimeout(fallbackTimer);
                fallbackTimer = undefined;
              }
              if (userDocument.exists()) {
                commitUserDocument(firebaseUser, userDocument.data(), userDocument.id);
              } else {
                void recoverUserDocument(firebaseUser, "snapshot-empty");
              }
            },
            (error) => {
              if (!isCurrentGeneration(firebaseUser.uid)) return;
              console.warn("[NVU Session] User listener interrupted; recovering.", error);
              void recoverUserDocument(firebaseUser, "snapshot-error");
            },
          );

          let userDocumentStopped = false;
          unsubDoc = () => {
            if (userDocumentStopped) return;
            userDocumentStopped = true;
            unsubscribeUserDocument();
          };
          userDocumentUnsubscribeRef.current = unsubDoc;

          fallbackTimer = window.setTimeout(() => {
            if (!listenerHydrated && isCurrentGeneration(firebaseUser.uid)) {
              void recoverUserDocument(firebaseUser, "snapshot-timeout");
            }
          }, 1400);
        } catch (error) {
          console.warn("[NVU Session] Could not attach user listener; recovering.", error);
          void recoverUserDocument(firebaseUser, "listener-attach");
        }
      } else {
        setFirebaseSessionUid(null);
        if (!isLoggingOutRef.current) endAuthTeardown();
        userDocumentUnsubscribeRef.current = null;
        currentUserRef.current = null;
        membershipsRef.current = [];

        setCurrentUser(null);
        setActiveCompanyId(null);
        setActiveRole(null);
        setIsSeniorAuthenticated(false);
        setSeniorCompanyId(null);
        setMemberships([]);
        setAllCompanyMembers([]);
        setUsers([]);
        setFetchedMissingUsers([]);
        setVehicles([]);
        setTrailers([]);
        setContracts([]);
        setSequences([]);
        setJobs([]);
        setJobDemands([]);
        setDriverRequests([]);
        setNotifications([]);
        setNotificationsHydrated(false);
        setRecruitmentApplications([]);
        setMembershipsLoaded(true);
        setSessionRecovering(false);

        clearAllPrivateClientCaches();
        clearSessionStorage();
        setAuthInitialized(true);
      }
    });

    return () => {
      disposed = true;
      stopUserDocumentListener();
      unsubAuth();
    };
  }, [sessionRefreshEpoch]);

  // Atualização dinâmica do contexto do Push Capacitor
  useEffect(() => {
    if (
      !authInitialized ||
      !currentUser?.id ||
      auth.currentUser?.uid !== currentUser.id
    ) {
      return;
    }

    console.log('[NVU PUSH UPDATE] Atualizando contexto do dispositivo...');
    try {
      void registerDeviceForPush({
        userId: currentUser.id,
        companyId: activeCompanyId,
        activeProfile: activeRole || currentUser.role,
      });
    } catch (error) {
      console.warn("[NVU PUSH ERROR] Falha ao atualizar contexto do Push", error);
    }
  }, [
    authInitialized,
    currentUser?.id,
    activeCompanyId,
    activeRole,
    currentUser?.role,
  ]);

  const [users, setUsers] = useState<User[]>([]);
  const [fetchedMissingUsers, setFetchedMissingUsers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobDemands, setJobDemands] = useState<JobDemand[]>([]);
  const [simulators, setSimulators] = useState<Simulator[]>([]);
  const [simulatorsLoading, setSimulatorsLoading] = useState(true);
  const [simulatorsError, setSimulatorsError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyProfile[]>(() =>
    readCachedCompanies(),
  );
  const [companiesLoading, setCompaniesLoading] = useState(
    () => readCachedCompanies().length === 0,
  );
  const [driverRequests, setDriverRequests] = useState<DriverRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);
  const [allCompanyMembers, setAllCompanyMembers] = useState<CompanyMember[]>(
    [],
  );

  const [recruitmentApplications, setRecruitmentApplications] = useState<
    RecruitmentApplication[]
  >([]);

  useEffect(() => {
    if (isSeniorAuthenticated) {
      writeSessionStorageValue("isSeniorAuthenticated", "true");
    } else {
      removeSessionStorageValue("isSeniorAuthenticated");
    }
    if (seniorCompanyId) {
      writeSessionStorageValue("seniorCompanyId", seniorCompanyId);
    } else {
      removeSessionStorageValue("seniorCompanyId");
    }
  }, [isSeniorAuthenticated, seniorCompanyId]);

  useEffect(() => {
    const uid = firebaseSessionUid;
    if (!uid || currentUser?.id !== uid) return;

    if (activeCompanyId) {
      writeLocalStorageValue(sessionActiveCompanyKey(uid), activeCompanyId);
    } else {
      removeLocalStorageValue(sessionActiveCompanyKey(uid));
    }
    if (activeRole) {
      writeLocalStorageValue(sessionActiveRoleKey(uid), activeRole);
    } else {
      removeLocalStorageValue(sessionActiveRoleKey(uid));
    }
    // Generic keys belonged to older builds and were shared by every account.
    removeLocalStorageValue("activeCompanyId");
    removeLocalStorageValue("activeRole");
  }, [activeCompanyId, activeRole, currentUser?.id, firebaseSessionUid]);

  
  // --- Simulators Subscription ---
  // Firebase is the single source of truth.
  // No automatic creation, seed, or hardcoded simulators.
  useEffect(() => {
    setSimulatorsLoading(true);
    setSimulatorsError(null);

    const unsub = onSnapshot(
      collection(db, "simulators"),
      (snap) => {
        const simulatorsData = normalizeSimulatorDocuments(
          snap.docs.map((simulatorDoc) => ({
            id: simulatorDoc.id,
            data: simulatorDoc.data(),
          })),
        ) as Simulator[];

        setSimulators(simulatorsData);
        setSimulatorsError(null);
        setSimulatorsLoading(false);

        console.log("[NVU] Simuladores carregados:", simulatorsData.length);
      },
      (error) => {
        if (isAuthTeardownActive()) return;
        console.error("[NVU] Erro ao carregar simuladores:", error);

        // Keep a safe, explicit state. Do not create or inject simulators.
        setSimulators([]);
        setSimulatorsError(error?.code || error?.message || "simulators-read-failed");
        setSimulatorsLoading(false);
      },
    );

    return () => unsub();
  }, []);

  // --- Global Public Companies Subscription ---
  useEffect(() => {
    setCompaniesLoading(true);
    const unsubCompanies = onSnapshot(
      collection(db, "frotas"),
      (snap) => {
        const data = snap.docs.map((doc) => {
          const raw = doc.data();
          return {
            ...raw,
            id: doc.id,
            companyName: raw.companyName || raw.fleetName || "Sem Nome",
          } as CompanyProfile;
        });
        const nextCompanies = Array.isArray(data) ? data : [];
        setCompanies(nextCompanies);
        writeCachedCompanies(nextCompanies);
        setCompaniesLoading(false);
      },
      (error) => {
        if (isAuthTeardownActive()) return;
        console.error("Error fetching global frotas snapshot:", error);
        // Keep the last public snapshot visible during transient network errors.
        setCompanies((current) =>
          current.length > 0 ? current : readCachedCompanies(),
        );
        setCompaniesLoading(false);
      },
    );
    return () => unsubCompanies();
  }, []);

  // --- Real-time Firestore Subscriptions (Authenticated) ---
  useEffect(() => {
    if (!currentUser || !currentUser.id) {
      membershipsUnsubscribeRef.current = null;
      setMemberships([]);
      setMembershipsLoaded(true);
      return;
    }

    const cachedMemberships = readCachedMemberships(currentUser.id);
    const hasCachedMemberships = hasCachedMembershipSnapshot(currentUser.id);
    if (hasCachedMemberships) {
      membershipsRef.current = cachedMemberships;
      setMemberships(cachedMemberships);
      setMembershipsLoaded(true);
    } else {
      setMembershipsLoaded(false);
    }

    const q = query(
      collection(db, "companyMembers"),
      where("userId", "==", currentUser.id),
    );
    const unsubscribeMemberships = onSnapshot(
      q,
      { includeMetadataChanges: true },
      async (snap) => {
        if (!canProcessAuthenticatedCallback(currentUser.id)) return;
        const fetchedMemberships = snap.docs.map((membershipDocument) =>
          normalizeCompanyMember(
            membershipDocument.data() as Record<string, unknown>,
            membershipDocument.id,
          ),
        );

        // An empty local cache is not proof that the authenticated user has no
        // company. Wait for the server-confirmed snapshot before redirecting
        // away from an already selected profile.
        if (fetchedMemberships.length === 0 && snap.metadata.fromCache) {
          const preservedMemberships =
            membershipsRef.current.length > 0
              ? membershipsRef.current
              : cachedMemberships;
          if (preservedMemberships.length > 0 || hasCachedMemberships) {
            membershipsRef.current = preservedMemberships;
            setMemberships(preservedMemberships);
            setMembershipsLoaded(true);
          } else {
            setMembershipsLoaded(false);
          }
          setSessionRecovering(true);
          return;
        }

        setSessionRecovering(false);

        // companyMembers é a única fonte de autorização. Nunca recrie um
        // vínculo ativo a partir de companyId/memberships legados do usuário:
        // após uma remoção, esses campos podem estar em cache ou pertencer a
        // uma inscrição anterior e não podem devolver acesso silenciosamente.
        membershipsRef.current = fetchedMemberships;
        setMemberships(fetchedMemberships);
        writeCachedMemberships(currentUser.id, fetchedMemberships);
        setMembershipsLoaded(true);
        setSessionRecovering(false);
      },
      (err) => {
        if (
          isLoggingOutRef.current ||
          isAuthTeardownActive() ||
          !auth.currentUser ||
          auth.currentUser.uid !== currentUser.id
        ) {
          return;
        }

        console.warn("[NVU Session] Membership listener interrupted; recovering.", err);
        const existingMemberships =
          membershipsRef.current.length > 0
            ? membershipsRef.current
            : readCachedMemberships(currentUser.id);

        if (existingMemberships.length > 0) {
          membershipsRef.current = existingMemberships;
          setMemberships(existingMemberships);
          setMembershipsLoaded(true);
        } else {
          setMembershipsLoaded(false);
        }
        setSessionRecovering(true);

        void runSessionReadWithRetry(
          () => getDocs(q),
          auth.currentUser,
        )
          .then((snapshot) => {
            if (!canProcessAuthenticatedCallback(currentUser.id)) return;
            const recoveredMemberships = snapshot.docs.map(
              (membershipDocument) =>
                normalizeCompanyMember(
                  membershipDocument.data() as Record<string, unknown>,
                  membershipDocument.id,
                ),
            );
            membershipsRef.current = recoveredMemberships;
            setMemberships(recoveredMemberships);
            writeCachedMemberships(currentUser.id, recoveredMemberships);
            setMembershipsLoaded(true);
            setSessionRecovering(false);
          })
          .catch((recoveryError) => {
            if (!canProcessAuthenticatedCallback(currentUser.id)) return;
            console.warn("[NVU Session] Membership recovery deferred.", recoveryError);
            // Cached memberships keep the active profile usable. Without a
            // cache, finish hydration so legitimate users with no membership
            // can continue to the normal status flow.
            setMembershipsLoaded(true);
            setSessionRecovering(false);
          });
      },
    );

    let membershipsStopped = false;
    const stopMembershipsSubscription = () => {
      if (membershipsStopped) return;
      membershipsStopped = true;
      unsubscribeMemberships();
    };

    membershipsUnsubscribeRef.current = stopMembershipsSubscription;

    return () => {
      stopMembershipsSubscription();
      if (
        membershipsUnsubscribeRef.current === stopMembershipsSubscription
      ) {
        membershipsUnsubscribeRef.current = null;
      }
    };
  }, [currentUser?.id, sessionRefreshEpoch]);

  // Stable primitives for dependencies to avoid excessive re-renders/listener recreations
  const currentUserId = currentUser?.id;
  const currentUserCompanyId = currentUser?.companyId;

  useEffect(() => {
    if (!currentUser || memberships.length === 0) return;

    const validCompanyIds = memberships.map((m) => m.companyId);

    // Check if current activeCompanyId is still valid and corresponds to an actual membership
    const isStale =
      !activeCompanyId ||
      (!validCompanyIds.includes(activeCompanyId) &&
        !(hasSeniorPanelAccess &&
          isSeniorAuthenticated &&
          seniorCompanyId === activeCompanyId));

    if (isStale) {
      // Find default membership: prefer admin if user role defaults to admin, otherwise first
      const defaultMember =
        memberships.find((m) => m.roles.includes("admin")) || memberships[0];
      setActiveCompanyId(defaultMember.companyId);

      const defaultRole = defaultMember.roles.includes("admin")
        ? "admin"
        : defaultMember.roles[0];
      setActiveRole(defaultRole as Role);
    } else {
      // Verify if activeRole is valid for the current activeCompanyId membership
      const currentMember = memberships.find(
        (m) => m.companyId === activeCompanyId,
      );
      if (currentMember) {
        if (!activeRole || !currentMember.roles.includes(activeRole)) {
          setActiveRole(currentMember.roles[0] as Role);
        }
      } else if (
        hasSeniorPanelAccess &&
        isSeniorAuthenticated &&
        seniorCompanyId === activeCompanyId
      ) {
        if (activeRole !== "admin") {
          setActiveRole("admin");
        }
      }
    }
  }, [
    currentUserId,
    memberships,
    activeCompanyId,
    activeRole,
    hasSeniorPanelAccess,
    isSeniorAuthenticated,
    seniorCompanyId,
  ]);

  // Senior is an authorization role, not a separate operational profile. Use
  // the admin data subscriptions while keeping `currentUser.role ===
  // "senior"` as the server-verified gate for the Senior panel.
  useEffect(() => {
    const roles = Array.isArray((currentUser as any)?.roles)
      ? (currentUser as any).roles
      : [];
    if (
      (currentUser as any)?.role === "senior" ||
      roles.includes("senior")
    ) {
      if (activeRole !== "admin") setActiveRole("admin");
    }
  }, [currentUser?.id, (currentUser as any)?.role, activeRole]);

  // Fast initial setting of activeCompanyId to avoid blank/flickering states
  useEffect(() => {
    if (currentUserCompanyId && !activeCompanyId) {
      setActiveCompanyId(currentUserCompanyId);
      if (!activeRole) {
        setActiveRole(
          ((currentUser as any).role === "senior"
            ? "admin"
            : currentUser.role || "driver") as Role,
        );
      }
    }
  }, [
    currentUserId,
    currentUserCompanyId,
    activeCompanyId,
    activeRole,
    currentUser?.role,
  ]);

  const isActiveUser = useMemo(() => {
    if (!currentUser) return false;
    const seniorAccess = readSessionStorageValue("seniorAccess") === "true";
    const seniorId = readSessionStorageValue("seniorCompanyId");
    if (hasSeniorPanelAccess && seniorAccess && seniorId === activeCompanyId)
      return true;
    if (
      hasSeniorPanelAccess &&
      isSeniorAuthenticated &&
      seniorCompanyId === activeCompanyId
    )
      return true;
    const currentMembership = memberships.find(
      (m) => m.companyId === activeCompanyId,
    );
    return (
      currentMembership?.status === "active" ||
      currentMembership?.roles?.includes("admin") === true
    );
  }, [
    currentUser,
    memberships,
    activeCompanyId,
    hasSeniorPanelAccess,
    isSeniorAuthenticated,
    seniorCompanyId,
  ]);

  const targetCompanyId = useMemo(() => {
    return resolveOperationalCompanyId({
      activeCompanyId,
      currentUserCompanyId,
      seniorCompanyId,
      seniorAccess:
        hasSeniorPanelAccess &&
        (isSeniorAuthenticated ||
          readSessionStorageValue("seniorAccess") === "true"),
    });
  }, [
    activeCompanyId,
    currentUserCompanyId,
    hasSeniorPanelAccess,
    isSeniorAuthenticated,
    seniorCompanyId,
  ]);


  // Warm the identity that is visible on every screen immediately. Ranking
  // photos are warmed in the same pass so switching to the internal ranking
  // does not first paint initials and then replace them with the bitmap.
  // Broader/non-critical fleet avatars remain deferred below.
  useEffect(() => {
    const memberIds = new Set(
      allCompanyMembers
        .filter((member) => member.companyId === activeCompanyId)
        .map((member) => member.userId),
    );
    const activeCompany = companies.find(
      (company) => company.id === activeCompanyId,
    );
    const resolveUserPhoto = (user: any) =>
      user?.profilePhotoURL ||
      user?.photoURL ||
      user?.photoUrl ||
      user?.avatar ||
      user?.profileImage ||
      user?.imageUrl ||
      user?.photo ||
      "";

    void preloadImages(
      [
        resolveUserPhoto(currentUser),
        activeCompany?.logoUrl,
        activeCompany?.logoURL,
        (activeCompany as any)?.logo,
      ],
      2,
    );

    const companyUsers = users.filter(
      (user) =>
        user.companyId === activeCompanyId || memberIds.has(user.id),
    );
    const activeJobDriverIds = new Set(
      jobs
        .filter((job) => job.companyId === activeCompanyId && job.driverId)
        .map((job) => job.driverId),
    );
    const activeJobDrivers = users.filter((user) =>
      activeJobDriverIds.has(user.id),
    );
    const deferredPhotos = Array.from(
      new Set(
        [...companyUsers, ...activeJobDrivers]
          .map(resolveUserPhoto)
          .filter(Boolean),
      ),
    ).slice(0, 60);

    if (deferredPhotos.length === 0) return;

    const idleApi = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const warmDeferredPhotos = () => {
      // Ranking avatars are useful after the first screen is stable, but
      // warming the whole company immediately after login competes with the
      // identity/operation render. Keep the same cache behavior and move only
      // this non-critical work to an idle slice.
      void warmRankingUserProfiles(
        [...companyUsers, ...activeJobDrivers],
        8,
      );
      void preloadImages(deferredPhotos, 3);
    };

    if (idleApi.requestIdleCallback) {
      const idleId = idleApi.requestIdleCallback(
        warmDeferredPhotos,
        { timeout: 2600 },
      );
      return () => idleApi.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(
      warmDeferredPhotos,
      1800,
    );
    return () => window.clearTimeout(timer);
  }, [
    currentUser,
    activeCompanyId,
    companies,
    users,
    allCompanyMembers,
    jobs,
  ]);

  useEffect(() => {
    if (!currentUserId) {
      privateDataScopeRef.current = null;
      privateSubscriptionsGenerationRef.current += 1;
      privateSubscriptionsUnsubscribeRef.current = null;
      setVehicles([]);
      setTrailers([]);
      setContracts([]);
      setSequences([]);
      setJobs([]);
      setJobDemands([]);
      setUsers([]);
      setAllCompanyMembers([]);
      setFetchedMissingUsers([]);
      setDriverRequests([]);
      setNotifications([]);
      setNotificationsHydrated(false);
      setRecruitmentApplications([]);
      return;
    }

    const uid = currentUserId;
    const previousPrivateScope = privateDataScopeRef.current;
    const sameCompanyScope =
      previousPrivateScope?.uid === uid &&
      previousPrivateScope.companyId === targetCompanyId;
    const roleChangedWithinCompany =
      sameCompanyScope && previousPrivateScope?.role !== activeRole;
    privateDataScopeRef.current = {
      uid,
      companyId: targetCompanyId,
      role: activeRole,
    };
    const isActive = isActiveUser;
    const subscriptionGeneration =
      ++privateSubscriptionsGenerationRef.current;
    const canPublishPrivateSnapshot = () =>
      privateSubscriptionsGenerationRef.current === subscriptionGeneration &&
      canProcessAuthenticatedCallback(uid);

    // Never expose data from another account/company. When only the role
    // changes inside the same company, shared collections remain available
    // immediately; only role-scoped collections are reset.
    if (!sameCompanyScope) {
      setVehicles([]);
      setTrailers([]);
      setContracts([]);
      setSequences([]);
      setJobs([]);
      setJobDemands([]);
      setUsers([]);
      setAllCompanyMembers([]);
      setFetchedMissingUsers([]);
      setDriverRequests([]);
      setNotifications([]);
      setNotificationsHydrated(false);
      setRecruitmentApplications([]);
    } else if (roleChangedWithinCompany) {
      setJobs([]);
      setJobDemands([]);
      setDriverRequests([]);
      setNotifications([]);
      setNotificationsHydrated(false);
      setRecruitmentApplications([]);
    }

    let unsubVehicles: () => void = () => {};
    let unsubTrailers: () => void = () => {};
    let unsubContracts: () => void = () => {};
    let unsubSequences: () => void = () => {};
    let unsubJobs: () => void = () => {};
    let unsubDemands: () => void = () => {};
    let unsubUsers: () => void = () => {};
    let unsubAllCompanyMembers: () => void = () => {};
    

    const handleSnapError = (prefix: string) => (error: any) => {
      if (
        !canPublishPrivateSnapshot() ||
        isLoggingOutRef.current ||
        isAuthTeardownActive() ||
        !auth.currentUser
      ) return;
      if (error.code !== "permission-denied") {
        console.error(`${prefix}:`, error);
      }
    };

    if (isActive) {
      // For dependent resources (vehicles, trailers, contracts, jobs), Admins and Drivers fetch by companyId.
      const vehicleQuery = activeCompanyId
        ? query(
            collection(db, "veiculos"),
            where("companyId", "==", activeCompanyId),
          )
        : null;

      if (vehicleQuery)
        unsubVehicles = onSnapshot(
          vehicleQuery,
          (snap) => {
            if (!canPublishPrivateSnapshot()) return;
            setVehicles(
              snap.docs.map(
                (doc) => ({ ...doc.data(), id: doc.id }) as Vehicle,
              ),
            );
          },
          handleSnapError("Error fetching veiculos snap"),
        );

      const trailerQuery = activeCompanyId
        ? query(
            collection(db, "reboques"),
            where("companyId", "==", activeCompanyId),
          )
        : null;

      if (trailerQuery)
        unsubTrailers = onSnapshot(
          trailerQuery,
          (snap) => {
            if (!canPublishPrivateSnapshot()) return;
            setTrailers(
              snap.docs.map(
                (doc) => ({ ...doc.data(), id: doc.id }) as Trailer,
              ),
            );
          },
          handleSnapError("Error fetching reboques snap"),
        );

      const contractQuery = activeCompanyId
        ? query(
            collection(db, "contratos"),
            where("companyId", "==", activeCompanyId),
          )
        : null;

      const sequenceQuery = activeCompanyId
        ? query(
            collection(db, "sequencias"),
            where("companyId", "==", activeCompanyId)
          )
        : null;

      if (sequenceQuery)
        unsubSequences = onSnapshot(
          sequenceQuery,
          (snap) => {
            if (!canPublishPrivateSnapshot()) return;
            setSequences(
              snap.docs
                .map((doc) => ({ ...doc.data(), id: doc.id }) as Sequence)
                .filter((s) => !s.deleted)
            );
          },
          handleSnapError("Error fetching sequencias snap")
        );

      if (contractQuery)
        unsubContracts = onSnapshot(
          contractQuery,
          (snap) => {
            if (!canPublishPrivateSnapshot()) return;
            setContracts(
              snap.docs
                .map((doc) => ({ ...doc.data(), id: doc.id }) as Contract)
                .filter((c) => !c.deleted)
            );
          },
          handleSnapError("Error fetching contratos snap"),
        );

      // For jobs, query by companyId and driverId directly in Firestore to avoid overfetching
      const jobQuery = activeCompanyId
        ? activeRole === "admin"
          ? query(
              collection(db, "trabalhos"),
              where("companyId", "==", activeCompanyId),
            )
          : query(
              collection(db, "trabalhos"),
              where("companyId", "==", activeCompanyId),
              where("driverId", "==", uid),
            )
        : null;

      if (jobQuery) {
        unsubJobs = onSnapshot(
          jobQuery,
          (snap) => {
            if (!canPublishPrivateSnapshot()) return;
            setJobs(
              snap.docs.map(
                (doc) => ({ ...doc.data(), id: doc.id }) as Job,
              ),
            );
          },
          handleSnapError("Error fetching trabalhos snap")
        );
      }

      const demandsQuery =
        activeRole === "admin"
          ? targetCompanyId
            ? query(
                collection(db, "jobDemands"),
                where("companyId", "==", targetCompanyId),
              )
            : null
          : query(collection(db, "jobDemands"), where("driverId", "==", uid));

      if (demandsQuery)
        unsubDemands = onSnapshot(
          demandsQuery,
          (snap) => {
            if (!canPublishPrivateSnapshot()) return;
            setJobDemands(
              snap.docs.map(
                (doc) => ({ ...doc.data(), id: doc.id }) as JobDemand,
              ),
            );
          },
          handleSnapError("Error fetching jobDemands"),
        );

      const usersQuery = targetCompanyId
        ? query(
            collection(db, "users"),
            where("companyId", "==", targetCompanyId),
          )
        : null;

      if (usersQuery) {
        unsubUsers = onSnapshot(
          usersQuery,
          (snap) => {
            if (!canPublishPrivateSnapshot()) return;
            let mappedUsers = snap.docs.map(
              (doc) => ({ ...doc.data(), id: doc.id }) as User,
            );

            mappedUsers = mappedUsers.map((u) => {
              if (!u.roles) u.roles = [u.role || "driver"];
              if (u.roles.includes("admin") && !u.roles.includes("driver"))
                u.roles.push("driver");
              if (u.roles.includes("admin")) u.status = "active";
              return u;
            });

            setUsers(mappedUsers);
          },
          handleSnapError("Error fetching users snap")
        );
      }

      // NOVO: Fetch todos os membros da empresa ativa
      if (targetCompanyId) {
        const q = query(
          collection(db, "companyMembers"),
          where("companyId", "==", targetCompanyId),
        );
        unsubAllCompanyMembers = onSnapshot(
          q,
          (snap) => {
            if (!canPublishPrivateSnapshot()) return;
            setAllCompanyMembers(
              snap.docs.map((membershipDocument) =>
                normalizeCompanyMember(
                  membershipDocument.data() as Record<string, unknown>,
                  membershipDocument.id,
                ),
              ),
            );
          },
          handleSnapError("Error fetching all company members")
        );
      }
    }

    // Helper pra unsub
    let unsubDriverRequests: () => void = () => {};
    let unsubNotifications: () => void = () => {};
    let unsubRecruitmentApps: () => void = () => {};
    const normalizedCurrentEmail = currentUser?.email?.trim().toLowerCase();
    const userRecruitmentApplicationsQuery = normalizedCurrentEmail
      ? query(
          collection(db, "recruitment_applications"),
          or(
            where("userId", "==", uid),
            where("email", "==", normalizedCurrentEmail),
          ),
        )
      : query(
          collection(db, "recruitment_applications"),
          where("userId", "==", uid),
        );

    if (isActive) {
      setNotifications([]);
      setNotificationsHydrated(false);
      // A UI interna usa o AppContext como fonte canônica. As duas coleções
      // são lidas apenas para compatibilidade com registros antigos.
      const notificationSources: Array<{
        collectionName: "notifications" | "notificacoes";
        notificationQuery: ReturnType<typeof query>;
      }> = [
        {
          collectionName: "notifications",
          notificationQuery: query(
            collection(db, "notifications"),
            where("userId", "==", uid),
          ),
        },
        {
          collectionName: "notificacoes",
          notificationQuery: query(
            collection(db, "notificacoes"),
            where("userId", "==", uid),
          ),
        },
      ];

      const sourceSnapshots = new Map<
        "notifications" | "notificacoes",
        AppNotification[]
      >();
      const initializedSources = new Set<"notifications" | "notificacoes">();

      const isVisible = (notification: AppNotification) =>
        isNotificationVisibleForContext(notification, {
          userId: uid,
          activeRole,
          activeCompanyId: targetCompanyId,
        });

      const publishNotifications = () => {
        const byLogicalIdentity = new Map<string, AppNotification>();
        // Prefere a coleção moderna quando o mesmo evento existir nas duas,
        // mesmo que algum produtor legado tenha usado outro ID de documento.
        for (const source of ["notificacoes", "notifications"] as const) {
          for (const notification of sourceSnapshots.get(source) ?? []) {
            byLogicalIdentity.set(
              notificationIdentity(notification, notification.id),
              notification,
            );
          }
        }

        const merged = Array.from(byLogicalIdentity.values())
          .filter(isVisible)
          .sort(
            (a, b) =>
              notificationTimestampMs(b) - notificationTimestampMs(a),
          );
        setNotifications(merged);
      };

      const notificationUnsubs = notificationSources.map(
        ({ collectionName, notificationQuery }) =>
          onSnapshot(
            notificationQuery,
            (snap) => {
              if (!canPublishPrivateSnapshot()) return;
              const incoming = snap.docs.map((notificationDocument) => {
                const normalized = normalizeNotificationForUi(
                  notificationDocument.id,
                  notificationDocument.data(),
                );
                return {
                  ...normalized,
                  sourceCollection: collectionName,
                } as AppNotification;
              });

              sourceSnapshots.set(collectionName, incoming);
              publishNotifications();

              // Só depois do primeiro snapshot das duas coleções o histórico
              // está completamente hidratado. O listener usa esse sinal para
              // não transformar documentos antigos em popups novos.
              initializedSources.add(collectionName);
              if (initializedSources.size === notificationSources.length) {
                setNotificationsHydrated(true);
              }
            },
            (error) => {
              if (
                canPublishPrivateSnapshot() &&
                !isLoggingOutRef.current &&
                !isAuthTeardownActive() &&
                auth.currentUser
              ) {
                console.error(
                  `[NVU Notifications] Falha ao ler ${collectionName}:`,
                  error,
                );
              }
              if (!canPublishPrivateSnapshot()) return;
              initializedSources.add(collectionName);
              if (initializedSources.size === notificationSources.length) {
                setNotificationsHydrated(true);
              }
            },
          ),
      );

      unsubNotifications = () => {
        notificationUnsubs.forEach((unsubscribe) => unsubscribe());
      };

      if (activeRole === "admin") {
        if (targetCompanyId) {
          unsubDriverRequests = onSnapshot(
            query(
              collection(db, "solicitacoes_motoristas"),
              where("empresaId", "==", targetCompanyId),
            ),
            (snap) => {
              if (!canPublishPrivateSnapshot()) return;
              setDriverRequests(
                snap.docs.map(
                  (doc) => ({ ...doc.data(), id: doc.id }) as DriverRequest,
                ),
              );
            },
            handleSnapError("Error fetching driver requests admin"),
          );

          unsubRecruitmentApps = onSnapshot(
            query(
              collection(db, "recruitment_applications"),
              where("companyId", "==", targetCompanyId),
            ),
            (snap) => {
              if (!canPublishPrivateSnapshot()) return;
              setRecruitmentApplications(
                snap.docs.map(
                  (doc) =>
                    ({ ...doc.data(), id: doc.id }) as RecruitmentApplication,
                ),
              );
            },
            handleSnapError("Error fetching recruitment apps"),
          );
        }
      } else {
        unsubDriverRequests = onSnapshot(
          query(
            collection(db, "solicitacoes_motoristas"),
            where("motoristaId", "==", uid),
          ),
          (snap) => {
            if (!canPublishPrivateSnapshot()) return;
            setDriverRequests(
              snap.docs.map(
                (doc) => ({ ...doc.data(), id: doc.id }) as DriverRequest,
              ),
            );
          },
          handleSnapError("Error fetching driver requests motorista"),
        );

        unsubRecruitmentApps = onSnapshot(
            userRecruitmentApplicationsQuery,
          (snap) => {
            if (!canPublishPrivateSnapshot()) return;
            setRecruitmentApplications(
              snap.docs.map(
                (doc) =>
                  ({ ...doc.data(), id: doc.id }) as RecruitmentApplication,
              ),
            );
          },
          handleSnapError("Error fetching recruitment apps motorista"),
        );
      }
    } else {
      setNotifications([]);
      setNotificationsHydrated(true);
      // If not active, only try to fetch recruitment apps just in case it works so they can see data,
      // but gracefully ignore permission errors.
      unsubRecruitmentApps = onSnapshot(
        userRecruitmentApplicationsQuery,
        (snap) => {
          if (!canPublishPrivateSnapshot()) return;
          setRecruitmentApplications(
            snap.docs.map(
              (doc) =>
                ({ ...doc.data(), id: doc.id }) as RecruitmentApplication,
            ),
          );
        },
        handleSnapError("Error fetching recruitment apps motorista"),
      );
    }

    let privateSubscriptionsStopped = false;
    const stopPrivateSubscriptions = () => {
      if (privateSubscriptionsStopped) return;
      privateSubscriptionsStopped = true;

      unsubVehicles();
      unsubTrailers();
      unsubContracts();
      unsubSequences();
      unsubJobs();
      unsubUsers();
      unsubAllCompanyMembers();
      unsubDriverRequests();
      unsubNotifications();
      unsubDemands();
      unsubRecruitmentApps();
    };

    privateSubscriptionsUnsubscribeRef.current = stopPrivateSubscriptions;

    return () => {
      if (
        privateSubscriptionsGenerationRef.current === subscriptionGeneration
      ) {
        privateSubscriptionsGenerationRef.current += 1;
      }
      stopPrivateSubscriptions();
      if (
        privateSubscriptionsUnsubscribeRef.current === stopPrivateSubscriptions
      ) {
        privateSubscriptionsUnsubscribeRef.current = null;
      }
    };
  }, [
    currentUserId,
    currentUser?.email,
    targetCompanyId,
    activeCompanyId,
    activeRole,
    isActiveUser,
  ]);

  useEffect(() => {
    if (!activeCompanyId || allCompanyMembers.length === 0) return;

    const existingIds = users.map((u) => u.id);
    const missingIds = allCompanyMembers
      .map((m) => m.userId)
      .filter((id): id is string => Boolean(id) && !existingIds.includes(id));

    if (missingIds.length === 0) return;

    const fetchUsers = async () => {
      const fetched: User[] = [];
      try {
        for (let i = 0; i < missingIds.length; i += 30) {
          const chunk = missingIds.slice(i, i + 30);
          const q = query(
            collection(db, "users"),
            where("__name__", "in", chunk),
          );
          const qs = await getDocs(q);
          qs.docs.forEach((d) =>
            fetched.push({ ...d.data(), id: d.id } as User),
          );
        }

        if (fetched.length > 0) {
          setFetchedMissingUsers((prev) => {
            const combined = [...prev];
            fetched.forEach((f) => {
              if (!combined.some((u) => u.id === f.id)) combined.push(f);
            });
            // apply auto-fix for roles
            return combined.map((u) => {
              if (!u.roles) u.roles = [u.role || "driver"];
              if (u.roles.includes("admin") && !u.roles.includes("driver"))
                u.roles.push("driver");
              if (u.roles.includes("admin")) u.status = "active";
              return u;
            });
          });
        }
      } catch (e) {
        if (
          !isLoggingOutRef.current &&
          !isAuthTeardownActive() &&
          auth.currentUser
        ) {
          console.warn("Error fetching missing users:", e);
        }
      }
    };

    fetchUsers();
  }, [allCompanyMembers, activeCompanyId, users.map((u) => u.id).join(",")]);

  // Helper para getCurrentUserId (conforme requisitos)
  const getCurrentUserId = () => {
    if (!auth.currentUser) throw new Error("Usuário não autenticado");
    return auth.currentUser.uid;
  };

  const handleFirebaseError = (error: any) => {
    if (isLoggingOutRef.current || isAuthTeardownActive()) return;
    console.error("Firebase Error: ", error);
    if (
      error.code === "permission-denied" ||
      error.message?.includes("permission-denied") ||
      error.message?.includes("Missing or insufficient permissions")
    ) {
      toast.error("Você não tem permissão para esta ação");
    } else {
      toast.error("Ocorreu um erro: " + (error.message || String(error)));
    }
  };

  // --- Implement Actions ---
  const updateRecruitmentSettings = async (
    companyId: string,
    settings: RecruitmentSettings,
  ) => {
    try {
      getCurrentUserId();
      await updateDoc(doc(db, "frotas", companyId), {
        recruitmentSettings: settings,
      });
    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const submitRecruitmentApplication = async (
    data: Omit<RecruitmentApplication, "id" | "status" | "createdAt">,
  ) => {
    try {
      const normalizedEmail = String(data.email || "").trim().toLowerCase();
      if (data.userId || normalizedEmail) {
        // Validate if owner
        const targetCompany = companies.find((c) => c.id === data.companyId);
        if (targetCompany && targetCompany.ownerId === data.userId) {
          throw new Error("Você é proprietário desta empresa e não pode se inscrever como motorista.");
        }

        // Validate membership without ever building a Firestore query with an
        // undefined userId. Anonymous/legacy applications are matched by the
        // normalized e-mail against an existing user profile first.
        const membershipUserIds = new Set<string>();
        if (data.userId) membershipUserIds.add(data.userId);
        if (!data.userId && normalizedEmail) {
          try {
            const usersByEmail = await getDocs(
              query(collection(db, "users"), where("email", "==", normalizedEmail)),
            );
            usersByEmail.docs.forEach((userDoc) => membershipUserIds.add(userDoc.id));
          } catch (err) {
            console.warn("Could not fetch user by email query (likely permissions):", err);
          }
        }

        const membershipSnapshots = await Promise.all(
          Array.from(membershipUserIds).map(async (userId) => {
            try {
              return await getDocs(
                query(
                  collection(db, "companyMembers"),
                  where("userId", "==", userId),
                  where("companyId", "==", data.companyId),
                  where("status", "==", "active"),
                ),
              );
            } catch (err) {
              console.warn("Could not fetch membership query (likely permissions):", err);
              return null;
            }
          }),
        );
        if (membershipSnapshots.filter(Boolean).some((snapshot) => !snapshot!.empty)) {
          throw new Error("Você já faz parte desta empresa e não precisa enviar uma nova inscrição.");
        }

      }

      // Cada envio é uma nova instância do fluxo. O histórico continua visível
      // ao RH, mas nunca bloqueia ou é reutilizado para montar esta inscrição.
      const createdAt = new Date().toISOString();
      if (data.userId || normalizedEmail) {
        try {
          const previousQueries = [
            data.userId
              ? query(
                  collection(db, "recruitment_applications"),
                  where("userId", "==", data.userId),
                )
              : null,
            normalizedEmail
              ? query(
                  collection(db, "recruitment_applications"),
                  where("email", "==", normalizedEmail),
                )
              : null,
          ].filter(Boolean) as ReturnType<typeof query>[];
          const previousSnapshots = await Promise.all(
            previousQueries.map((previousQuery) => getDocs(previousQuery)),
          );
          const previousRefs = new Map<string, any>();
          previousSnapshots.forEach((snapshot) =>
            snapshot.docs.forEach((previousApplication) =>
              previousRefs.set(previousApplication.id, previousApplication.ref),
            ),
          );
          await Promise.all(
            Array.from(previousRefs.values()).map((previousRef) =>
              updateDoc(previousRef, {
                isCurrent: false,
                supersededAt: createdAt,
              }),
            ),
          );
        } catch (historyError) {
          console.warn(
            "Não foi possível marcar todo o histórico como substituído; a nova inscrição continuará independente.",
            historyError,
          );
        }
      }
      const applicationRef = doc(collection(db, "recruitment_applications"));
      try {
        await setDoc(applicationRef, {
          ...data,
          type: "driver_application",
          email: normalizedEmail,
          status: "pending",
          flowVersion: 2,
          isCurrent: true,
          createdAt,
        });
      } catch (err) {
        console.error("addDoc recruitment_applications failed:", err);
        throw new Error("addDoc recruitment_applications failed: " + err.message);
      }

      try {
        await createCorporateNotifications({
          companyId: data.companyId,
          type: "RH_APPLICATION",
          title: "Nova inscrição no RH",
          message: `${data.fullName} enviou uma inscrição para a empresa.`,
          metadata: { applicationId: applicationRef.id, applicantUserId: data.userId ?? null },
          dedupeKey: `RH_APPLICATION_${applicationRef.id}`,
        });
      } catch (notificationError) {
        console.error(
          "[NVU Notifications] A inscrição foi salva, mas o aviso corporativo falhou:",
          notificationError,
        );
      }

      if (auth.currentUser) {
        // Use setDoc with merge: true instead of updateDoc to ensure it doesn't fail if the user doc hasn't been created yet
        try {
          await setDoc(
            doc(db, "users", auth.currentUser.uid),
            {
              applicationSubmitted: true,
              currentRecruitmentApplicationId: applicationRef.id,
              currentRecruitmentCompanyId: data.companyId,
              currentRecruitmentSimulatorId: resolveSimulatorId(data, simulators) || data.simulatorId || "",
              currentRecruitmentStatus: "pending",
              // A nova inscrição substitui qualquer aprovação antiga como
              // referência de acesso/identidade do fluxo.
              approvedIdentityApplicationId: deleteField(),
              approvedIdentityName: deleteField(),
            },
            { merge: true },
          );
        } catch (err) {
          console.error("setDoc users failed:", err);
          throw new Error("setDoc users failed: " + err.message);
        }
      }

      setRecruitmentApplications((current) => {
        const optimisticApplication: RecruitmentApplication = {
          id: applicationRef.id,
          type: "driver_application",
          userId: data.userId,
          companyId: data.companyId,
          simulatorId: data.simulatorId,
          applicationPhotoURL: data.applicationPhotoURL,
          applicationPhotoTransport: data.applicationPhotoTransport,
          fullName: data.fullName,
          whatsapp: data.whatsapp,
          email: normalizedEmail,
          reason: data.reason,
          objective: data.objective,
          deliveriesPerWeek: data.deliveriesPerWeek,
          hasExperience: data.hasExperience,
          primaryVehicle: data.primaryVehicle,
          secondaryVehicle: data.secondaryVehicle,
          status: "pending",
          flowVersion: 2,
          isCurrent: true,
          createdAt,
        };
        return [
          optimisticApplication,
          ...current.filter((application) => application.id !== applicationRef.id),
        ];
      });

      return applicationRef.id;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const approveRecruitmentApplication = async (applicationId: string) => {
    try {
      getCurrentUserId();
      const stateApplication = recruitmentApplications.find(
        (application) => application.id === applicationId,
      );
      if (!stateApplication) return;

      // The list listener can be one snapshot behind when two administrators
      // work at once. Re-read the selected document so approval always uses
      // the exact name/e-mail/photo that was submitted, never a stale row from
      // another section or account.
      const applicationSnapshot = await getDoc(
        doc(db, "recruitment_applications", applicationId),
      );
      const app = applicationSnapshot.exists()
        ? ({
            id: applicationSnapshot.id,
            ...applicationSnapshot.data(),
          } as RecruitmentApplication)
        : stateApplication;
      // Allow approving applications that are pending or rejected, but not already approved
      if (app.status === "approved") return;

      if (
        app.isCurrent === false ||
        app.accessRevokedAt ||
        app.accessRevokedReason === "removed_from_fleet"
      ) {
        throw new Error("Esta inscrição pertence ao histórico e não pode liberar acesso. O motorista precisa enviar uma nova inscrição.");
      }

      // Uma inscrição nova torna as anteriores apenas histórico. Mesmo que o
      // RH abra uma linha antiga, ela não pode criar vínculo nem substituir a
      // empresa da inscrição corrente.
      const submittedUserId = String(app.userId || "").trim();
      if (submittedUserId) {
        const submittedUserSnapshot = await getDoc(doc(db, "users", submittedUserId));
        const currentApplicationId = String(
          submittedUserSnapshot.data()?.currentRecruitmentApplicationId || "",
        ).trim();
        if (currentApplicationId && currentApplicationId !== applicationId) {
          throw new Error("Esta inscrição foi substituída por uma inscrição mais recente e não pode liberar acesso.");
        }
      }

      // O UID informado pela própria inscrição é a identidade canônica.
      // O e-mail é usado apenas como fallback para inscrições legadas. Isso
      // evita vincular a aprovação a um documento antigo/duplicado de usuário.
      const normalizedEmail = String(app.email || "").trim().toLowerCase();
      let userId = String(app.userId || "").trim();
      let currentUserData: any = {};

      if (userId) {
        const canonicalUserSnapshot = await getDoc(doc(db, "users", userId));
        const canonicalUserEmail = String(
          canonicalUserSnapshot.data()?.email || "",
        )
          .trim()
          .toLowerCase();
        const identityMatches =
          canonicalUserSnapshot.exists() &&
          (!normalizedEmail || canonicalUserEmail === normalizedEmail);
        if (identityMatches) {
          currentUserData = canonicalUserSnapshot.data();
        } else {
          // A legacy application can carry a UID from a previous account.
          // Discard it and resolve the user by the submitted e-mail instead.
          userId = "";
        }
      }

      if (!userId) {
        const emailQuery = query(
          collection(db, "users"),
          where("email", "==", normalizedEmail),
        );
        const emailSnapshot = await getDocs(emailQuery);
        if (!emailSnapshot.empty) {
          userId = emailSnapshot.docs[0].id;
          currentUserData = emailSnapshot.docs[0].data();
        } else {
          userId = doc(collection(db, "users")).id;
        }
      }

      const existingRoles = Array.isArray(currentUserData.roles)
        ? currentUserData.roles
        : [];
      const canonicalRoles = Array.from(new Set([...existingRoles, "driver"]));

      await setDoc(
        doc(db, "users", userId),
        {
          id: userId,
          email: normalizedEmail,
          name: app.fullName,
          whatsapp: app.whatsapp,
          ...(app.applicationPhotoURL && {
            profilePhotoURL: app.applicationPhotoURL,
          }),
          approvedIdentityName: app.fullName,
          approvedIdentityApplicationId: applicationId,
          status: "active",
          currentRecruitmentApplicationId: applicationId,
          currentRecruitmentCompanyId: app.companyId,
          currentRecruitmentSimulatorId: resolveSimulatorId(app, simulators),
          currentRecruitmentStatus: "approved",
          companyId: app.companyId,
          role: currentUserData.role === "admin" ? "admin" : "driver",
          roles: canonicalRoles,
          updatedAt: new Date().toISOString(),
          ...(!currentUserData.createdAt && { createdAt: new Date().toISOString() }),
        },
        { merge: true },
      );

      // Criação/atualização idempotente do vínculo. Se já houver registros
      // duplicados, todos são normalizados para impedir estados divergentes.
      const memberQuery = query(
        collection(db, "companyMembers"),
        where("userId", "==", userId),
        where("companyId", "==", app.companyId),
      );
      const memberSnapshot = await getDocs(memberQuery);

      if (memberSnapshot.empty) {
        await addDoc(collection(db, "companyMembers"), {
          userId,
          companyId: app.companyId,
          roles: ["driver"],
          status: "active",
          permissions: [],
          joinedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        await Promise.all(
          memberSnapshot.docs.map(async (memberDocument) => {
            const memberData = memberDocument.data();
            const memberRoles = Array.isArray(memberData.roles)
              ? memberData.roles
              : [];
            await updateDoc(memberDocument.ref, {
              userId,
              companyId: app.companyId,
              roles: Array.from(new Set([...memberRoles, "driver"])),
              status: "active",
              permissions: Array.isArray(memberData.permissions)
                ? memberData.permissions
                : [],
              updatedAt: new Date().toISOString(),
            });
          }),
        );
      }

      await syncSingleSimulatorMember(
        userId,
        app.companyId,
        "active",
        canonicalRoles,
        resolveSimulatorId(app, simulators),
      );

      await updateDoc(doc(db, "recruitment_applications", applicationId), {
        status: "approved",
        isCurrent: true,
        userId,
        email: normalizedEmail,
        updatedAt: new Date().toISOString(),
      });
      const company = companies.find((c) => c.id === app.companyId);
      if (userId) {
        try {
          await createNotification({
            userId: userId,
            companyId: app.companyId,
            targetProfile: "driver",
            type: "RECRUITMENT_APPROVED",
            title: "Solicitação aprovada",
            message: `Sua solicitação para a empresa ${company?.companyName || ""} foi aprovada!`,
            dedupeKey: `RECRUITMENT_APPROVED_${applicationId}`,
          });
        } catch (notificationError) {
          console.warn(
            "[NVU Notifications] A candidatura foi aprovada, mas o aviso falhou:",
            notificationError,
          );
        }
      }


    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const rejectRecruitmentApplication = async (applicationId: string) => {
    try {
      getCurrentUserId();
      const app = recruitmentApplications.find((a) => a.id === applicationId);
      await updateDoc(doc(db, "recruitment_applications", applicationId), {
        status: "rejected",
      });
      const company = companies.find((c) => c.id === app?.companyId);
      let targetUserId = app?.userId;
      if (!targetUserId && app?.email) {
        const q = query(collection(db, "users"), where("email", "==", app.email.trim().toLowerCase()));
        const qs = await getDocs(q);
        if (!qs.empty) targetUserId = qs.docs[0].id;
      }
      if (targetUserId && app?.companyId) {
        await createNotification({
          userId: targetUserId,
          companyId: app.companyId,
          targetProfile: "driver",
          type: "RECRUITMENT_REJECTED",
          title: "Solicitação recusada",
          message: `Sua solicitação para a empresa ${company?.companyName || ""} foi recusada.`,
          dedupeKey: `RECRUITMENT_REJECTED_${applicationId}`,
        });
      }


      if (app?.userId) {
        const userRef = doc(db, "users", app.userId);
        const userSnapshot = await getDoc(userRef);
        const currentApplicationId = String(
          userSnapshot.data()?.currentRecruitmentApplicationId || "",
        ).trim();
        if (userSnapshot.exists() && currentApplicationId === applicationId) {
          await updateDoc(userRef, {
            currentRecruitmentStatus: "rejected",
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const deleteRecruitmentApplication = async (applicationId: string) => {
    try {
      getCurrentUserId();
      await deleteDoc(doc(db, "recruitment_applications", applicationId));
    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const createCompany = async (data: Omit<CompanyProfile, "id" | "cnpj">) => {
    try {
      const uid = getCurrentUserId();
      console.log("[DEBUG] createCompany -> UID:", uid, "Data:", data);
      const cnpj = generateCnpj();
      const ownerEmail = String(
        data.email || data.ownerEmail || currentUserRef.current?.email || "",
      )
        .trim()
        .toLowerCase();
      const payload = {
        ...data,
        ...(ownerEmail && {
          email: ownerEmail,
          ownerEmail,
        }),
        userId: uid,
        ownerId: uid,
        cnpj,
        createdAt: new Date().toISOString(),
      };
      const newDoc = await addDoc(collection(db, "frotas"), payload);

      // Update user document to be an admin/driver in this company
      await updateDoc(doc(db, "users", uid), {
        companyId: newDoc.id,
        roles: ["admin", "driver"],
        status: "active",
      });

      // Create companyMember document for the constructor/owner
      await addDoc(collection(db, "companyMembers"), {
        companyId: newDoc.id,
        userId: uid,
        roles: ["admin", "driver"],
        status: "active",
        permissions: ["admin", "owner", "manage_fleet", "all"],
        joinedAt: new Date().toISOString(),
      });
      syncSingleSimulatorMember(uid, newDoc.id, "active", ["admin", "driver"]);

      setActiveCompanyId(newDoc.id);
      setActiveRole("admin");
    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const updateCompany = async (
    id: string,
    updates: Partial<Omit<CompanyProfile, "id" | "cnpj">>,
  ) => {
    try {
      getCurrentUserId(); // valida se tá autenticado
      await updateDoc(doc(db, "frotas", id), updates);
    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const deleteCompany = async (id: string) => {
    try {
      getCurrentUserId(); // valida

      const batch = writeBatch(db);

      const usersToUpdate = users.filter((u) => u.companyId === id);
      for (const u of usersToUpdate) {
        batch.update(doc(db, "users", u.id), {
          companyId: deleteField(),
          role: "driver",
        });
      }

      const vehiclesToDelete = vehicles.filter((v) => v.companyId === id);
      for (const v of vehiclesToDelete) {
        batch.delete(doc(db, "veiculos", v.id));
      }

      const trailersToDelete = trailers.filter((t) => t.companyId === id);
      for (const t of trailersToDelete) {
        batch.delete(doc(db, "reboques", t.id));
      }

      const contractsToDelete = contracts.filter((c) => c.companyId === id);
      for (const c of contractsToDelete) {
        batch.delete(doc(db, "contratos", c.id));
      }

      const jobsToDelete = jobs.filter((j) => j.companyId === id);
      for (const j of jobsToDelete) {
        batch.delete(doc(db, "trabalhos", j.id));
      }

      const requestsToDelete = driverRequests.filter((r) => r.empresaId === id);
      for (const r of requestsToDelete) {
        batch.delete(doc(db, "solicitacoes_motoristas", r.id));
      }

      // Query and delete all related memberships in companyMembers collection
      const membersToQuery = await getDocs(
        query(collection(db, "companyMembers"), where("companyId", "==", id)),
      );
      membersToQuery.forEach((docSnap) => {
        batch.delete(docSnap.ref);
        const data = docSnap.data();
        removeSimulatorMember(data.userId, id);
      });

      batch.delete(doc(db, "frotas", id));

      await batch.commit();

      if (activeCompanyId === id) setActiveCompanyId(null);
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const createContract = async (data: Omit<Contract, "id" | "status">) => {
    try {
      if (!activeCompanyId) return;
      const uid = getCurrentUserId();
      const activeCompany = companies.find((c) => c.id === activeCompanyId);
      if (!activeCompany) return;

      
      const rawPayload = {
        ...data,
        simulator: activeCompany.simulatorName, // Auto-populate simulator
        companyName: activeCompany.companyName, // Auto-populate company name
        userId: uid,
        companyId: activeCompanyId,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      
      const cleanPayload = { ...rawPayload };
      Object.keys(cleanPayload).forEach(key => {
        if (cleanPayload[key] === undefined) {
          cleanPayload[key] = null;
        }
      });

      await addDoc(collection(db, "contratos"), cleanPayload);
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const createSequence = async (sequence: Omit<Sequence, "id" | "createdAt">) => {
    try {
      getCurrentUserId();
      await addDoc(collection(db, "sequencias"), {
        ...sequence,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const updateSequence = async (id: string, updates: Partial<Omit<Sequence, "id">>) => {
    try {
      getCurrentUserId();
      const cleanUpdates: any = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) cleanUpdates[key] = deleteField();
        else cleanUpdates[key] = value;
      }
      await updateDoc(doc(db, "sequencias", id), cleanUpdates);
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const deleteSequence = async (id: string) => {
    try {
      getCurrentUserId();
      await updateDoc(doc(db, "sequencias", id), { deleted: true });
      
      // Remova as operações associadas
      const batch = writeBatch(db);
      const relatedContracts = contracts.filter(c => c.sequenceId === id);
      relatedContracts.forEach(c => {
        batch.update(doc(db, "contratos", c.id), { sequenceId: deleteField(), sequenceOrder: deleteField() });
      });
      await batch.commit();
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const updateContract = async (
    id: string,
    updates: Partial<Omit<Contract, "id">>,
  ) => {
    try {
      getCurrentUserId();
      const cleanUpdates: any = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) {
          cleanUpdates[key] = deleteField();
        } else {
          cleanUpdates[key] = value;
        }
      }
      await updateDoc(doc(db, "contratos", id), cleanUpdates);
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const deleteContract = async (id: string) => {
    try {
      getCurrentUserId();
      // Use soft delete instead of complete removal to preserve history
      await updateDoc(doc(db, "contratos", id), { 
        deleted: true,
        deletedAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const assignJob = async (
    contractId: string,
    driverId: string,
    vehicleId: string,
    trailerId?: string,
    customDeadlineDays?: number,
  ) => {
    try {
      if (!activeCompanyId) return;
      const uid = getCurrentUserId();
      const contract = contracts.find((c) => c.id === contractId);
      if (!contract) return;

      const deadline = new Date();
      if (
        customDeadlineDays !== undefined &&
        customDeadlineDays !== null &&
        customDeadlineDays > 0
      ) {
        deadline.setDate(deadline.getDate() + customDeadlineDays);
      } else {
        deadline.setDate(deadline.getDate() + contract.deadlineDays);
      }
      const deadlineISO = deadline.toISOString();

      console.log("[AppContext/AssignJob] Contrato enviado/vinculado:", {
        contractId,
        driverId,
        vehicleId,
        trailerId: trailerId || null,
        deadlineISO,
      });

      const jobRef = await addDoc(collection(db, "trabalhos"), {
        userId: uid,
        companyId: activeCompanyId,
        contractId,
        driverId,
        motoristaId: driverId, // user asked for motoristaId
        assignedDriverId: driverId, // Ensure assignedDriverId exists for data link
        tripId:
          "TRIP-" +
          Date.now().toString() +
          "-" +
          Math.random().toString(36).substring(2, 6), // Support for trip tracking link
        vehicleId,
        trailerId: trailerId || null,
        status: "pending",
        progress: 0,
        deadlineDate: deadlineISO, // Legacy fallback
        createdAt: new Date().toISOString(), // Legacy fallback
        assignedAt: new Date().toISOString(),
        dueAt: deadlineISO,
      });

      try {
        await createNotification({
          userId: driverId,
          companyId: activeCompanyId,
          targetProfile: "driver",
          type: "NEW_OPERATION",
          title: "Nova operação recebida",
          message: `Você recebeu a operação ${contract.name}.`,
          metadata: {
            jobId: jobRef.id,
            contractId,
            vehicleId,
          },
          dedupeKey: `NEW_OPERATION_${jobRef.id}`,
        });
      } catch (notificationError) {
        console.error(
          "[NVU Notifications] A operação foi criada, mas o aviso ao motorista falhou:",
          notificationError,
        );
      }

      // Update vehicle status
      await updateDoc(doc(db, "veiculos", vehicleId), { status: "in_use" });
      if (trailerId) {
        await updateDoc(doc(db, "reboques", trailerId), { status: "in_use" });
      }

      // Encaminhar uma nova operação confirma que a administração já analisou
      // o fluxo desse motorista. Portanto, encerramos tanto a solicitação de
      // trabalho quanto qualquer aviso da operação anterior concluída.
      const pendingDemands = jobDemands.filter(
        (d) =>
          d.driverId === driverId &&
          d.status === "pending" &&
          d.companyId === activeCompanyId,
      );

      await Promise.all(
        pendingDemands.map((demand) =>
          updateDoc(doc(db, "jobDemands", demand.id), {
            status: "reviewed",
          }),
        ),
      );

      await Promise.all([
        resolveNotifications({
          companyId: activeCompanyId,
          type: "WORK_REQUEST",
          metadata: { driverId },
        }),
        resolveNotifications({
          companyId: activeCompanyId,
          type: "OPERATION_COMPLETED",
          metadata: { driverId },
        }),
      ]);
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const startJob = async (jobId: string) => {
    try {
      getCurrentUserId();
      await updateDoc(doc(db, "trabalhos", jobId), { status: "active" });
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const finishJob = async (jobId: string) => {
    try {
      getCurrentUserId();
      const job = jobs.find((j) => j.id === jobId);
      let completionStatus: "on_time" | "late" = "on_time";
      let completionTimeOffset = "";
      const now = new Date();
      
      const referenceDueAt = job?.dueAt || job?.deadlineDate; // but dueAt is the architectural source for new
      
      if (referenceDueAt) {
        const deadline = new Date(referenceDueAt);
        const diffMs = deadline.getTime() - now.getTime();
        
        const formatTimeDiff = (ms: number) => {
            const absMs = Math.abs(ms);
            const d = Math.floor(absMs / (1000 * 60 * 60 * 24));
            const h = Math.floor((absMs / (1000 * 60 * 60)) % 24);
            
            let text = "";
            if (d > 0) text += `${d} dia${d > 1 ? 's' : ''}`;
            if (h > 0) text += `${text ? ' e ' : ''}${h} hora${h > 1 ? 's' : ''}`;
            if (d === 0 && h === 0) {
              const m = Math.floor((absMs / 1000 / 60) % 60);
              if (m > 0) text = `${m} minuto${m > 1 ? 's' : ''}`;
            }
            return text || "menos de 1 minuto";
        };

        if (diffMs >= 0) {
            completionStatus = "on_time";
            completionTimeOffset = `Restavam ${formatTimeDiff(diffMs)} para o prazo final.`;
        } else {
            completionStatus = "late";
            completionTimeOffset = `Prazo excedido em ${formatTimeDiff(diffMs)}.`;
        }
      }

      const contract = contracts.find(c => c.id === job?.contractId);
      const contractNameSnapshot = contract?.name || (contract as any)?.nome || job?.contractNameSnapshot || "Contrato não identificado";

      await updateDoc(doc(db, "trabalhos", jobId), { 
        status: "completed",
        completedAt: now.toISOString(),
        completionStatus,
        completionTimeOffset,
        contractNameSnapshot
      });

      if (job?.companyId) {
        const driver = users.find((user) => user.id === job.driverId);
        try {
          await createCorporateNotifications({
            companyId: job.companyId,
            type: "OPERATION_COMPLETED",
            title: "Operação concluída",
            message: `${driver?.name || "O motorista"} concluiu a operação ${contractNameSnapshot}.`,
            metadata: { jobId, driverId: job.driverId, contractId: job.contractId },
            dedupeKey: `OPERATION_COMPLETED_${jobId}`,
          });
        } catch (notificationError) {
          console.error(
            "[NVU Notifications] A operação foi concluída, mas o aviso corporativo falhou:",
            notificationError,
          );
        }
      }
      if (job) {
        if (job.vehicleId) {
          try {
            await updateDoc(doc(db, "veiculos", job.vehicleId), {
              status: "available",
            });
          } catch (err) {
            console.error("Ignorado erro ao liberar veiculo", err);
          }
        }
        if (job.trailerId) {
          try {
            await updateDoc(doc(db, "reboques", job.trailerId), {
              status: "available",
            });
          } catch (err) {
            console.error("Ignorado erro ao liberar reboque", err);
          }
        }
      }
      // removed alert
    } catch (e) {
      console.error(e);
      handleFirebaseError(e);
    }
  };

  const cancelJob = async (jobId: string) => {
    let prevJobState: Job | undefined;
    try {
      console.log(
        "[cancelJob] INICIO - Solicitando cancelamento para o jobId:",
        jobId,
      );
      if (!jobId) {
        console.error("[cancelJob] ERRO: jobId é nulo ou indefinido!");
        toast.error("Erro: ID do trabalho ausente.");
        return;
      }
      const uid = getCurrentUserId();
      console.log("[cancelJob] User UID:", uid);

      const docRef = doc(db, "trabalhos", jobId);
      console.log("[cancelJob] Verificando existência...");
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        console.error("[cancelJob] Documento não encontrado no Firestore!");
        toast.error("Erro: Operação não encontrada no servidor.");
        return;
      }

      console.log(
        "[cancelJob] Referência do documento criada, chamando updateDoc...",
      );

      // Salva snapshot antigo para caso de rollback
      prevJobState = jobs.find((j) => j.id === jobId);

      // Força alteração da UI instantaneamente para sensação de realtime
      setJobs((prev: Job[]) =>
        prev.map((j: Job) =>
          j.id === jobId ? { ...j, status: "cancelled" as const } : j,
        ),
      );

      await updateDoc(docRef, { status: "cancelled" });
      console.log("[cancelJob] updateDoc 'trabalhos' concluído com sucesso.");

      const job = prevJobState || jobs.find((j) => j.id === jobId);
      if (job) {
        console.log(
          "[cancelJob] Trabalho encontrado no local state, liberando vínculos. Vehicle:",
          job.vehicleId,
          "Trailer:",
          job.trailerId,
        );
        if (job.vehicleId) {
          try {
            await updateDoc(doc(db, "veiculos", job.vehicleId), {
              status: "available",
            });
          } catch (err) {
            console.error("[cancelJob] Ignorado erro ao liberar veiculo", err);
          }
        }
        if (job.trailerId) {
          try {
            await updateDoc(doc(db, "reboques", job.trailerId), {
              status: "available",
            });
          } catch (err) {
            console.error("[cancelJob] Ignorado erro ao liberar reboque", err);
          }
        }
      } else {
        console.warn(
          "[cancelJob] AVISO: Trabalho NÃO encontrado no local state 'jobs'!",
        );
      }
      toast.success("Trabalho cancelado com sucesso!");
    } catch (e: any) {
      console.error("[cancelJob] ERRO FATAL:", e);
      // Rollback da UI
      if (prevJobState) {
        setJobs((prev: Job[]) =>
          prev.map((j) => (j.id === jobId ? prevJobState! : j)),
        );
      }
      if (e.code) {
        console.error("Error Code:", e.code);
      }
      if (e.message) {
        console.error("Error Message:", e.message);
      }

      const debugInfo = `Falha ao cancelar!\nID: ${jobId}\nUID: ${getCurrentUserId()}\nRole: ${currentUser?.role || "null"}\nPayload: { status: 'cancelled' }\nErro: ${e.code || "unknown"} - ${e.message || String(e)}`;
      toast.error(debugInfo, {
        duration: 15000,
        style: { minWidth: "350px", whiteSpace: "pre-wrap" },
      });
      handleFirebaseError(e);
    }
  };

  const deleteJob = async (jobId: string) => {
    let prevJobState: Job | undefined;
    try {
      console.log(
        "[deleteJob] INICIO - Solicitando exclusão para o jobId:",
        jobId,
      );
      if (!jobId) {
        console.error("[deleteJob] ERRO: jobId incompleto.");
        toast.error("Erro ao excluir. ID ausente.");
        return;
      }
      const uid = getCurrentUserId();
      console.log("[deleteJob] User UID:", uid);

      const docRef = doc(db, "trabalhos", jobId);

      console.log("[deleteJob] Verificando existência...");
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        console.error("[deleteJob] Documento não encontrado no Firestore!");
        toast.error("Erro: Operação não encontrada no servidor.");
        return;
      }

      console.log("[deleteJob] Chamando deleteDoc...");

      prevJobState = jobs.find((j) => j.id === jobId);

      // Força alteração da UI instantaneamente para sensação de realtime
      setJobs((prev: Job[]) => prev.filter((j: Job) => j.id !== jobId));

      await deleteDoc(docRef);
      console.log("[deleteJob] deleteDoc finalizado.");
      toast.success("Histórico de trabalho excluído com sucesso!");
    } catch (e: any) {
      console.error("[deleteJob] ERRO FATAL:", e);
      // Rollback
      if (prevJobState) {
        setJobs((prev: Job[]) => {
          // Avoid duplicating if onSnapshot already fetched it
          if (prev.find((j) => j.id === jobId)) return prev;
          return [...prev, prevJobState!];
        });
      }
      if (e.code) {
        console.error("Error Code:", e.code);
      }
      if (e.message) {
        console.error("Error Message:", e.message);
      }

      const debugInfo = `Falha ao excluir!\nID: ${jobId}\nUID: ${getCurrentUserId()}\nRole: ${currentUser?.role || "null"}\nErro: ${e.code || "unknown"} - ${e.message || String(e)}`;
      toast.error(debugInfo, {
        duration: 15000,
        style: { minWidth: "350px", whiteSpace: "pre-wrap" },
      });
      handleFirebaseError(e);
    }
  };

  const requestJoinCompany = async (companyId: string) => {
    try {
      const uid = getCurrentUserId();
      if (!companyId) return;

      // Check if already requested
      const hasPending = driverRequests.some(
        (r) => r.empresaId === companyId && r.status === "pending",
      );
      if (hasPending) {
        alert("Você já tem uma solicitação pending para esta empresa.");
        return;
      }

      const activeCompany = companies.find((c) => c.id === companyId);

      await addDoc(collection(db, "solicitacoes_motoristas"), {
        motoristaId: uid,
        empresaId: companyId,
        simulatorId: (activeCompany as any)?.simulatorId || (activeCompany ? resolveSimulatorId(activeCompany as any) : ""),
        adminId: activeCompany?.userId || "", // Adiciona adminId para regras de segurança
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Notifica proprietário e todos os administradores ativos da empresa.
      if (activeCompany) {
        try {
          await createCorporateNotifications({
            companyId,
            type: "WORK_REQUEST",
            title: "Nova solicitação de entrada",
            message: `${currentUser?.name || "Um motorista"} solicitou entrada na empresa ${activeCompany.companyName}.`,
            metadata: { driverId: uid },
            dedupeKey: `JOIN_COMPANY_${companyId}_${uid}`,
          });
        } catch (notificationError) {
          console.error(
            "[NVU Notifications] A solicitação foi salva, mas o aviso corporativo falhou:",
            notificationError,
          );
        }
      }

      alert("Solicitação enviada com sucesso!");
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const cancelRequestJoinCompany = async (requestId: string) => {
    try {
      getCurrentUserId();
      await deleteDoc(doc(db, "solicitacoes_motoristas", requestId));
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const approveDriver = async (requestId: string) => {
    try {
      getCurrentUserId();
      const req = driverRequests.find((r) => r.id === requestId);
      if (!req) return;

      // Update request status
      await updateDoc(doc(db, "solicitacoes_motoristas", requestId), {
        status: "approved",
        updatedAt: new Date().toISOString(),


      });

      // Get user doc to update legacy fields (optional but good for safety)
      const userDocRef = doc(db, "users", req.motoristaId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        await updateDoc(userDocRef, {
          companyId: req.empresaId,
          status: "active",
        });
      }

      // Update or create membership
      const memberQuery = query(
        collection(db, "companyMembers"),
        where("userId", "==", req.motoristaId),
        where("companyId", "==", req.empresaId),
      );
      const qs = await getDocs(memberQuery);
      if (qs.empty) {
        await addDoc(collection(db, "companyMembers"), {
          userId: req.motoristaId,
          companyId: req.empresaId,
          roles: ["driver"],
          status: "active",
          permissions: [],
          joinedAt: new Date().toISOString(),
        });
        syncSingleSimulatorMember(req.motoristaId, req.empresaId, "active", ["driver"]);
      } else {
        await updateDoc(doc(db, "companyMembers", qs.docs[0].id), {
          status: "active",
          roles: arrayUnion("driver"),
        });
        const existingRoles = qs.docs[0].data().roles || [];
        if (!existingRoles.includes("driver")) existingRoles.push("driver");
        syncSingleSimulatorMember(req.motoristaId, req.empresaId, "active", existingRoles);
      }

      // Notify user
      const company = companies.find((c) => c.id === req.empresaId);
      await createNotification({
        userId: req.motoristaId,
        companyId: req.empresaId,
        targetProfile: "driver",
        type: "DRIVER_REQUEST_APPROVED",
        title: "Solicitação aprovada",
        message: `Sua solicitação para a empresa ${company?.companyName || ""} foi aprovada!`,
        dedupeKey: `DRIVER_REQUEST_APPROVED_${requestId}`,
      });
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const rejectDriver = async (requestId: string) => {
    try {
      getCurrentUserId();
      const req = driverRequests.find((r) => r.id === requestId);
      if (!req) return;

      // Update request status
      await updateDoc(doc(db, "solicitacoes_motoristas", requestId), {
        status: "rejected",
        updatedAt: new Date().toISOString(),
      });

      // Notify user
      const company = companies.find((c) => c.id === req.empresaId);
      await createNotification({
        userId: req.motoristaId,
        companyId: req.empresaId,
        targetProfile: "driver",
        type: "DRIVER_REQUEST_REJECTED",
        title: "Solicitação recusada",
        message: `Sua solicitação para a empresa ${company?.companyName || ""} foi recusada.`,
        dedupeKey: `DRIVER_REQUEST_REJECTED_${requestId}`,
      });
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification) return;

    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? { ...item, read: true, lida: true }
          : item,
      ),
    );

    try {
      getCurrentUserId();
      const sourceCollection = notification.sourceCollection ?? "notifications";
      await updateDoc(doc(db, sourceCollection, notificationId), {
        read: true,
        lida: true,
      });
    } catch (e) {
      console.warn("[NVU Notifications] Falha ao marcar como lida:", e);
    }
  };

  const markNotificationPopupShown = async (notificationId: string) => {
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification || notification.popupShownAt || notification.popupShownAtIso) {
      return;
    }

    const popupShownAtIso = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? { ...item, popupShownAtIso }
          : item,
      ),
    );

    try {
      getCurrentUserId();
      const sourceCollection = notification.sourceCollection ?? "notifications";
      await updateDoc(doc(db, sourceCollection, notificationId), {
        popupShownAt: serverTimestamp(),
        popupShownAtIso,
      });
    } catch (error) {
      // O Set local do listener já bloqueia repetição na sessão. Não exibimos
      // toast de erro para uma atualização silenciosa de controle de popup.
      console.warn(
        "[NVU Notifications] Falha ao persistir popup exibido:",
        error,
      );
    }
  };

  const switchRole = async (role: Role, newCompanyId?: string) => {
    if (!currentUser) return;

    const targetCompanyId =
      newCompanyId || activeCompanyId || currentUser.companyId;
    if (!targetCompanyId) return;

    const membership = memberships.find(
      (item) => item.companyId === targetCompanyId,
    );
    const memberRoles = resolveMembershipRoles(
      membership,
      currentUser,
    ) as Role[];
    const targetCompany = companies.find(
      (company) => company.id === targetCompanyId,
    );
    const isOwner = Boolean(
      targetCompany &&
        (targetCompany.ownerId === currentUser.id ||
          targetCompany.userId === currentUser.id),
    );

    const hasSeniorAccess =
      hasSeniorPanelAccess &&
      isSeniorAuthenticated &&
      (seniorCompanyId === targetCompanyId || newCompanyId === targetCompanyId);
    const ownerAdminAccess = isOwner && role === "admin";
    const hasMembershipAccess = Boolean(
      membership && memberRoles.includes(role),
    );
    const hasLegacyAccess = Boolean(
      currentUser.companyId === targetCompanyId &&
        currentUser.roles?.includes(role),
    );

    if (
      !hasMembershipAccess &&
      !hasSeniorAccess &&
      !ownerAdminAccess &&
      !hasLegacyAccess
    ) {
      return;
    }

    const effectiveRoles: Role[] = Array.from(
      new Set<Role>(
        hasSeniorAccess
          ? ["admin"]
          : [
              ...memberRoles,
              role,
              ...(ownerAdminAccess ? (["admin", "driver"] as Role[]) : []),
            ],
      ),
    );

    // Commit the UI context synchronously. The previous implementation waited
    // for Firestore before navigation, creating a visible loading intermission
    // every time the user changed profiles. Authorization has already been
    // checked against the active membership above; persistence can complete in
    // the background without blocking the destination screen.
    setActiveRole(role);
    setActiveCompanyId(targetCompanyId);
    writeLocalStorageValue("activeRole", role);
    writeLocalStorageValue("activeCompanyId", targetCompanyId);

    if (hasSeniorAccess) {
      setCurrentUser({ ...currentUser });
      return;
    }

    const optimisticUser: User = {
      ...currentUser,
      role,
      companyId: targetCompanyId,
      roles: effectiveRoles,
    };
    currentUserRef.current = optimisticUser;
    setCurrentUser(optimisticUser);
    writeCachedSessionUser(optimisticUser);

    void updateDoc(doc(db, "users", currentUser.id), {
      role,
      companyId: targetCompanyId,
    }).catch((error) => {
      if (!isAuthTeardownActive()) {
        console.error("Failed to persist role/company switch:", error);
      }
    });
  };

  const promoteDriverToAdmin = async (driverId: string) => {
    try {
      getCurrentUserId();
      if (!activeCompanyId) return;

      const memberQuery = query(
        collection(db, "companyMembers"),
        where("userId", "==", driverId),
        where("companyId", "==", activeCompanyId),
      );
      const qs = await getDocs(memberQuery);
      if (qs.empty) {
        alert("Driver is not in your active fleet.");
        return;
      }

      const memberDoc = qs.docs[0];
      const memberData = memberDoc.data() as CompanyMember;

      if (!memberData.roles.includes("admin")) {
        await updateDoc(doc(db, "companyMembers", memberDoc.id), {
          roles: [...memberData.roles, "admin"],
        });
        syncSingleSimulatorMember(driverId, activeCompanyId, memberData.status || "active", [...memberData.roles, "admin"]);
      }

      // Update legacy user doc
      const driverRef = doc(db, "users", driverId);
      const driverDoc = await getDoc(driverRef);
      if (driverDoc.exists()) {
        const driverData = driverDoc.data();
        const currentRoles = driverData.memberships?.[activeCompanyId]?.roles ||
          driverData.roles || ["driver"];
        if (!currentRoles.includes("admin")) {
          const newRoles = [...currentRoles, "admin"];

          const updates: any = {
            [`memberships.${activeCompanyId}.roles`]: newRoles,
            [`memberships.${activeCompanyId}.role`]: "admin",
            updatedAt: new Date().toISOString(),
          };

          if (driverData.companyId === activeCompanyId) {
            updates.roles = Array.from(
              new Set([...(driverData.roles || []), "admin"]),
            );
          }

          await updateDoc(driverRef, updates);
        }
      }
    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const demoteAdminToDriver = async (driverId: string) => {
    try {
      getCurrentUserId();
      if (!activeCompanyId) return;

      const memberQuery = query(
        collection(db, "companyMembers"),
        where("userId", "==", driverId),
        where("companyId", "==", activeCompanyId),
      );
      const qs = await getDocs(memberQuery);
      if (qs.empty) {
        alert("Driver is not in your active fleet.");
        return;
      }

      const memberDoc = qs.docs[0];
      const memberData = memberDoc.data() as CompanyMember;
      const newRoles = memberData.roles.filter((r) => r !== "admin");
      if (newRoles.length === 0) newRoles.push("driver");

      await updateDoc(doc(db, "companyMembers", memberDoc.id), {
        roles: newRoles,
      });
      syncSingleSimulatorMember(driverId, activeCompanyId, memberData.status || "active", newRoles);

      const driverRef = doc(db, "users", driverId);
      const driverDoc = await getDoc(driverRef);
      if (driverDoc.exists()) {
        const driverData = driverDoc.data();

        const currentRoles = driverData.memberships?.[activeCompanyId]?.roles ||
          driverData.roles || ["driver"];
        const fallbackRoles = currentRoles.filter((r: string) => r !== "admin");
        if (fallbackRoles.length === 0) fallbackRoles.push("driver");

        const updates: any = {
          [`memberships.${activeCompanyId}.roles`]: fallbackRoles,
          [`memberships.${activeCompanyId}.role`]: fallbackRoles[0],
          updatedAt: new Date().toISOString(),
        };

        if (driverData.companyId === activeCompanyId) {
          updates.roles = (driverData.roles || []).filter(
            (r: string) => r !== "admin",
          );
          if (updates.roles.length === 0) updates.roles.push("driver");

          // If they are currently viewing THIS company as admin, kick them to driver view.
          if (driverData.role === "admin") {
            updates.role = "driver";
          }
        }

        await updateDoc(driverRef, updates);
      }
    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const updateUserOnlineStatus = async (isOnline: boolean) => {
    try {
      const uid = getCurrentUserId();
      await updateDoc(doc(db, "users", uid), { isOnline });
      if (currentUser) {
        setCurrentUser({ ...currentUser, isOnline });
      }
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const removeDriverFromFleet = async (driverId: string) => {
    try {
      console.log("Removendo driver com ID:", driverId);
      getCurrentUserId();
      if (!activeCompanyId) return;

      const removalTimestamp = new Date().toISOString();

      const memberQuery = query(
        collection(db, "companyMembers"),
        where("userId", "==", driverId),
        where("companyId", "==", activeCompanyId),
      );
      const memberSnapshot = await getDocs(memberQuery);

      const driverRef = doc(db, "users", driverId);
      const driverDoc = await getDoc(driverRef);
      const driverEmail = driverDoc.exists()
        ? String(driverDoc.data().email || "").trim().toLowerCase()
        : "";

      const recruitmentQuery = query(
        collection(db, "recruitment_applications"),
        where("companyId", "==", activeCompanyId),
      );
      const recruitmentSnapshot = await getDocs(recruitmentQuery);
      const recruitmentUpdates = recruitmentSnapshot.docs.filter((applicationDoc) => {
        const application = applicationDoc.data() as Record<string, unknown>;
        const applicationUserId = String(application.userId || "").trim();
        const applicationEmail = String(application.email || "")
          .trim()
          .toLowerCase();
        return (
          applicationUserId === driverId ||
          Boolean(driverEmail && applicationEmail === driverEmail)
        );
      });

      const removalBatch = writeBatch(db);
      memberSnapshot.docs.forEach((memberDoc) => {
        // A legacy migration can leave more than one membership document for
        // the same driver/company. Remove every matching document in the same
        // commit that revokes the recruitment history.
        removalBatch.delete(memberDoc.ref);
      });
      removalBatch.delete(
        doc(db, "simulator_members", `${driverId}_${activeCompanyId}`),
      );
      recruitmentUpdates.forEach((applicationDoc) => {
        removalBatch.update(applicationDoc.ref, {
          status: "rejected",
          updatedAt: removalTimestamp,
          accessRevokedAt: removalTimestamp,
          accessRevokedReason: "removed_from_fleet",
        });
      });

      if (driverDoc.exists()) {
        const updates: any = { updatedAt: removalTimestamp };

        // Remove legacy membership
        updates[`memberships.${activeCompanyId}`] = deleteField();

        // If legacy match, fallback
        if (driverDoc.data().companyId === activeCompanyId) {
          updates.companyId = null;
          updates.status = "pending";
          updates.role = "driver";
          updates.roles = ["driver"];
        }

        // A remoção encerra a referência de recrutamento daquela empresa. Sem
        // limpar esse ponteiro, o login poderia voltar a abrir uma aprovação
        // antiga antes de o motorista enviar um novo formulário.
        if (driverDoc.data().currentRecruitmentCompanyId === activeCompanyId) {
          updates.currentRecruitmentApplicationId = deleteField();
          updates.currentRecruitmentCompanyId = deleteField();
          updates.currentRecruitmentSimulatorId = deleteField();
          updates.currentRecruitmentStatus = deleteField();
          updates.approvedIdentityApplicationId = deleteField();
          updates.approvedIdentityName = deleteField();
        }

        removalBatch.update(driverRef, updates);
      }

      await removalBatch.commit();
      console.log("Driver removido com sucesso!");
    } catch (e) {
      console.error("Erro ao remover driver:", e);
      handleFirebaseError(e);
    }
  };

  const createManualDriver = async (driverData: Partial<User>) => {
    try {
      if (!activeCompanyId) throw new Error("Nenhuma empresa ativa.");

      const email = driverData.email;
      if (!email) throw new Error("Email é obrigatório.");

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Não autenticado");

      // Verificamos se há algum usuário no sistema com este email
      const q = query(
        collection(db, "users"),
        where("email", "==", email.trim().toLowerCase()),
      );
      const qs = await getDocs(q);
      if (!qs.empty) {
        throw new Error(
          "Já existe um usuário com este email. Use o fluxo de convite ou peça para ele se inscrever.",
        );
      }

      const newDocRef = doc(collection(db, "users"));
      const newUserId = newDocRef.id;

      const payload = {
        id: newUserId,
        email: email.trim().toLowerCase(),
        name: driverData.name || "Motorista",
        whatsapp: driverData.whatsapp || "",
        profilePhotoURL: driverData.profilePhotoURL || "",
        status: "active",
        companyId: activeCompanyId,
        role: "driver",
        roles: ["driver"],
        createdAt: new Date().toISOString(),
      };

      await setDoc(newDocRef, payload);

      // Criar companyMember
      await addDoc(collection(db, "companyMembers"), {
        userId: newUserId,
        companyId: activeCompanyId,
        roles: ["driver"],
        status: "active",
        permissions: [],
        joinedAt: new Date().toISOString(),
      });
      syncSingleSimulatorMember(newUserId, activeCompanyId, "active", ["driver"]);
    } catch (e) {
      console.error("Erro ao criar motorista manual:", e);
      handleFirebaseError(e);
      throw e;
    }
  };

  const requestNewJobDemand = async () => {
    try {
      const uid = getCurrentUserId();
      const targetCompanyId = activeCompanyId || currentUser?.companyId;
      if (!targetCompanyId)
        throw new Error(
          "Você precisa estar em uma empresa para solicitar demandas.",
        );

      // Check if already requested
      const existing = jobDemands.find(
        (d) =>
          d.driverId === uid &&
          d.status === "pending" &&
          d.companyId === targetCompanyId,
      );
      if (existing) return; // Already pending

      const payload = {
        driverId: uid,
        companyId: targetCompanyId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const demandRef = await addDoc(collection(db, "jobDemands"), payload);

      const driverName = currentUser?.name || "Um motorista";
      try {
        await createCorporateNotifications({
          companyId: targetCompanyId,
          type: "WORK_REQUEST",
          title: "Nova solicitação de trabalho",
          message: `${driverName} solicitou uma nova operação.`,
          metadata: { demandId: demandRef.id, driverId: uid },
          dedupeKey: `WORK_REQUEST_${demandRef.id}`,
        });

      } catch (notificationError) {
        console.error(
          "[NVU Notifications] A solicitação foi salva, mas o aviso corporativo falhou:",
          notificationError,
        );
      }
    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const cancelJobDemand = async () => {
    try {
      const uid = getCurrentUserId();
      const targetCompanyId = activeCompanyId || currentUser?.companyId;
      const existing = jobDemands.find(
        (d) =>
          d.driverId === uid &&
          d.status === "pending" &&
          d.companyId === targetCompanyId,
      );
      if (!existing) return;

      await deleteDoc(doc(db, "jobDemands", existing.id));
    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const rejectJobDemand = async (demandId: string) => {
    try {
      const uid = getCurrentUserId();
      await updateDoc(doc(db, "jobDemands", demandId), { status: "rejected" });

      // Notify driver
      const demand = jobDemands.find((d) => d.id === demandId);
      if (demand) {
        await createNotification({
          userId: demand.driverId,
          companyId: demand.companyId,
          targetProfile: "driver",
          type: "JOB_REQUEST_REJECTED",
          title: "Solicitação recusada",
          message:
            "Sua solicitação de nova operação foi recusada no momento. Aguarde ou informe o administrador.",
          dedupeKey: `JOB_REQUEST_REJECTED_${demandId}`,
        });
      }
    } catch (e) {
      handleFirebaseError(e);
      throw e;
    }
  };

  const registerUser = (
    userData: Pick<User, "name" | "email" | "password" | "role">,
  ) => {
    // This is handled via Firebase Auth in the Login component now, we don't need this local function.
  };

  const addVehicle = async (
    data: Omit<Vehicle, "id" | "status" | "companyId">,
  ) => {
    try {
      if (!activeCompanyId) return;
      const uid = getCurrentUserId();
      await addDoc(collection(db, "veiculos"), {
        ...data,
        userId: uid,
        companyId: activeCompanyId,
        plate: data.plate || "---",
        status: "available",
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const updateVehicle = async (
    id: string,
    updates: Partial<Omit<Vehicle, "id">>,
  ) => {
    try {
      getCurrentUserId();
      await updateDoc(doc(db, "veiculos", id), updates);
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const deleteVehicle = async (id: string) => {
    try {
      getCurrentUserId();
      await deleteDoc(doc(db, "veiculos", id));
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const addTrailer = async (
    data: Omit<Trailer, "id" | "status" | "companyId">,
  ) => {
    try {
      if (!activeCompanyId) return;
      const uid = getCurrentUserId();
      await addDoc(collection(db, "reboques"), {
        ...data,
        userId: uid,
        companyId: activeCompanyId,
        plate: data.plate || "---",
        status: "available",
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const updateTrailer = async (
    id: string,
    updates: Partial<Omit<Trailer, "id">>,
  ) => {
    try {
      getCurrentUserId();
      await updateDoc(doc(db, "reboques", id), updates);
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const deleteTrailer = async (id: string) => {
    try {
      getCurrentUserId();
      await deleteDoc(doc(db, "reboques", id));
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const logOutApp = async () => {
    // Prevent duplicate taps from starting overlapping Auth/Firestore teardowns.
    if (isLoggingOutRef.current) return;
    const logoutUid = auth.currentUser?.uid || currentUserRef.current?.id || null;
    isLoggingOutRef.current = true;
    // Notify page-level hooks and long-lived services before Auth is revoked.
    // They can unsubscribe synchronously and ignore any late callbacks.
    beginAuthTeardown();

    // Stop every AppContext listener that requires authentication before
    // revoking Firebase Auth. This ordering prevents the transient
    // permission-denied error reported by Google AI Studio.
    const authenticatedUnsubscribes = [
      privateSubscriptionsUnsubscribeRef.current,
      membershipsUnsubscribeRef.current,
      userDocumentUnsubscribeRef.current,
    ];

    privateSubscriptionsUnsubscribeRef.current = null;
    membershipsUnsubscribeRef.current = null;
    userDocumentUnsubscribeRef.current = null;

    for (const unsubscribe of authenticatedUnsubscribes) {
      try {
        unsubscribe?.();
      } catch (unsubscribeError) {
        // Cleanup is best-effort and must never block logout.
        console.warn("[NVU Logout] Listener cleanup warning:", unsubscribeError);
      }
    }

    // Clear private UI state first. ProtectedRoute then unmounts page-level
    // listeners before signOut removes Firestore authorization.
    currentUserRef.current = null;
    membershipsRef.current = [];
    setFirebaseSessionUid(null);
    setCurrentUser(null);
    setActiveCompanyId(null);
    setActiveRole(null);
    setIsSeniorAuthenticated(false);
    setSeniorCompanyId(null);
    setMemberships([]);
    setMembershipsLoaded(false);
    setAllCompanyMembers([]);
    setUsers([]);
    setFetchedMissingUsers([]);
    setVehicles([]);
    setTrailers([]);
    setContracts([]);
    setSequences([]);
    setJobs([]);
    setJobDemands([]);
    setDriverRequests([]);
    setNotifications([]);
    setNotificationsHydrated(false);
    setRecruitmentApplications([]);
    try {
      clearPushRegistrationContext();
    } catch (pushCleanupError) {
      console.warn("[NVU Logout] Push cleanup warning:", pushCleanupError);
    }
    setSessionRecovering(false);
    clearCachedSession(logoutUid);
    clearAllPrivateClientCaches();

    clearSessionStorage();

    // Give React one paint to unmount route/page subscriptions. This is
    // especially important in the AI Studio iframe and Android WebView.
    await new Promise<void>((resolve) => {
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        window.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });

    try {
      await signOut(auth);
    } catch (error) {
      // Avoid console.error here: embedded previews display it as a runtime
      // crash even after the interface completed a safe logout.
      console.warn("[NVU Logout] Firebase signOut warning:", error);
    }

    // The Android login uses both Firebase JS Auth and the native
    // @capacitor-firebase/authentication session. Signing out only the JS side
    // leaves the previous Google account available to the next registration.
    try {
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.signOut();
      }
    } catch (nativeSignOutError) {
      console.warn("[NVU Logout] Native signOut warning:", nativeSignOutError);
    } finally {
      endAuthTeardown();
      isLoggingOutRef.current = false;
      setAuthInitialized(true);
    }
  };

  const syncCompanyData = async () => {
    if (
      !activeCompanyId ||
      isLoggingOutRef.current ||
      isAuthTeardownActive() ||
      !auth.currentUser
    )
      return;
    try {
      const companyJobs = jobs.filter((j) => j.companyId === activeCompanyId);

      const batch = writeBatch(db);
      let updates = 0;

      // Only active assignments affect resource availability. The previous
      // implementation also recalculated driver XP/level for every snapshot,
      // but the update condition was permanently false and produced no writes.
      const activeVehicleIds = new Set<string>();
      const activeTrailerIds = new Set<string>();

      for (const job of companyJobs) {
        if (!["pending", "active"].includes(job.status)) continue;
        if (job.vehicleId) activeVehicleIds.add(job.vehicleId);
        if (job.trailerId) activeTrailerIds.add(job.trailerId);
      }

      const companyVehicles = vehicles.filter(
        (v) => v.companyId === activeCompanyId,
      );
      for (const v of companyVehicles) {
        if (v.status === "in_use") {
          const hasActiveJob = activeVehicleIds.has(v.id);
          if (!hasActiveJob) {
            batch.update(doc(db, "veiculos", v.id), { status: "available" });
            updates++;
          }
        }
      }

      const companyTrailers = trailers.filter(
        (t) => t.companyId === activeCompanyId,
      );
      for (const t of companyTrailers) {
        if (t.status === "in_use") {
          const hasActiveJob = activeTrailerIds.has(t.id);
          if (!hasActiveJob) {
            batch.update(doc(db, "reboques", t.id), { status: "available" });
            updates++;
          }
        }
      }

      if (updates > 0) {
        if (
          isLoggingOutRef.current ||
          isAuthTeardownActive() ||
          !auth.currentUser
        )
          return;
        await batch.commit();
      }
    } catch (e) {
      if (
        !isLoggingOutRef.current &&
        !isAuthTeardownActive() &&
        auth.currentUser
      ) {
        console.warn("Error syncing data:", e);
      }
    }
  };

  // Resource reconciliation stays automatic, but runs after the current UI
  // work has settled so a Firestore snapshot cannot cause a navigation hitch.
  useEffect(() => {
    if (!authInitialized || !activeCompanyId) return;

    let idleId: number | null = null;
    const idleApi = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const syncTimer = window.setTimeout(() => {
      if (idleApi.requestIdleCallback) {
        idleId = idleApi.requestIdleCallback(
          () => void syncCompanyData(),
          { timeout: 2000 },
        );
      } else {
        void syncCompanyData();
      }
    }, 1800);

    return () => {
      window.clearTimeout(syncTimer);
      if (idleId !== null) idleApi.cancelIdleCallback?.(idleId);
    };
  }, [jobs, vehicles, trailers, activeCompanyId, authInitialized]);

  // Reconcile immediately when connectivity returns because the previous
  // attempt may have been interrupted while offline.
  useEffect(() => {
    const handleOnline = () => {
      console.log("[Auto-Sync] Conexão restabelecida. Rodando sincronização.");
      void syncCompanyData();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [jobs, vehicles, trailers, activeCompanyId, authInitialized]);

  const combinedUsers = useMemo(() => {
    const merged = [...users];
    fetchedMissingUsers.forEach((missingUser) => {
      if (!merged.some((user) => user.id === missingUser.id)) merged.push(missingUser);
    });

    if (currentUser && !merged.some((user) => user.id === currentUser.id)) {
      const belongsToActiveCompany = Boolean(
        activeCompanyId &&
          (currentUser.companyId === activeCompanyId ||
            currentUser.memberships?.[activeCompanyId] ||
            allCompanyMembers.some((member) => member.userId === currentUser.id)),
      );
      if (belongsToActiveCompany) merged.push(currentUser);
    }

    return merged;
  }, [
    activeCompanyId,
    allCompanyMembers,
    currentUser,
    fetchedMissingUsers,
    users,
  ]);

  const scopedJobDemands = useMemo(
    () =>
      jobDemands.filter(
        (demand) =>
          demand.companyId === activeCompanyId ||
          demand.driverId === currentUser?.id,
      ),
    [activeCompanyId, currentUser?.id, jobDemands],
  );

  const scopedDriverRequests = useMemo(
    () =>
      driverRequests.filter(
        (request) =>
          request.empresaId === activeCompanyId ||
          request.motoristaId === currentUser?.id,
      ),
    [activeCompanyId, currentUser?.id, driverRequests],
  );

  const scopedRecruitmentApplications = useMemo(
    () =>
      recruitmentApplications.filter(
        (application) =>
          application.companyId === activeCompanyId ||
          (currentUser?.id && application.userId === currentUser.id) ||
          (currentUser?.email &&
            application.email?.toLowerCase() === currentUser.email.toLowerCase()),
      ),
    [
      activeCompanyId,
      currentUser?.email,
      currentUser?.id,
      recruitmentApplications,
    ],
  );

  const visibleCompanies = useMemo(
    () =>
      hasSeniorPanelAccess
        ? companies
        : companies.filter((company) =>
            memberships.some((membership) => membership.companyId === company.id),
          ),
    [companies, hasSeniorPanelAccess, memberships],
  );

  const stableCreateSequence = useStableEvent(createSequence);
  const stableUpdateSequence = useStableEvent(updateSequence);
  const stableDeleteSequence = useStableEvent(deleteSequence);
  const stableCreateCompany = useStableEvent(createCompany);
  const stableUpdateCompany = useStableEvent(updateCompany);
  const stableDeleteCompany = useStableEvent(deleteCompany);
  const stableCreateContract = useStableEvent(createContract);
  const stableUpdateContract = useStableEvent(updateContract);
  const stableDeleteContract = useStableEvent(deleteContract);
  const stableAssignJob = useStableEvent(assignJob);
  const stableStartJob = useStableEvent(startJob);
  const stableFinishJob = useStableEvent(finishJob);
  const stableCancelJob = useStableEvent(cancelJob);
  const stableDeleteJob = useStableEvent(deleteJob);
  const stableRequestJoinCompany = useStableEvent(requestJoinCompany);
  const stableCancelRequestJoinCompany = useStableEvent(cancelRequestJoinCompany);
  const stableApproveDriver = useStableEvent(approveDriver);
  const stableRejectDriver = useStableEvent(rejectDriver);
  const stableCreateManualDriver = useStableEvent(createManualDriver);
  const stableRegisterUser = useStableEvent(registerUser);
  const stableRequestNewJobDemand = useStableEvent(requestNewJobDemand);
  const stableCancelJobDemand = useStableEvent(cancelJobDemand);
  const stableRejectJobDemand = useStableEvent(rejectJobDemand);
  const stableSyncCompanyData = useStableEvent(syncCompanyData);
  const stableAddVehicle = useStableEvent(addVehicle);
  const stableUpdateVehicle = useStableEvent(updateVehicle);
  const stableDeleteVehicle = useStableEvent(deleteVehicle);
  const stableAddTrailer = useStableEvent(addTrailer);
  const stableUpdateTrailer = useStableEvent(updateTrailer);
  const stableDeleteTrailer = useStableEvent(deleteTrailer);
  const stableLogOutApp = useStableEvent(logOutApp);
  const stableSwitchRole = useStableEvent(switchRole);
  const stablePromoteDriverToAdmin = useStableEvent(promoteDriverToAdmin);
  const stableDemoteAdminToDriver = useStableEvent(demoteAdminToDriver);
  const stableRemoveDriverFromFleet = useStableEvent(removeDriverFromFleet);
  const stableUpdateUserOnlineStatus = useStableEvent(updateUserOnlineStatus);
  const stableUpdateRecruitmentSettings = useStableEvent(updateRecruitmentSettings);
  const stableSubmitRecruitmentApplication = useStableEvent(submitRecruitmentApplication);
  const stableApproveRecruitmentApplication = useStableEvent(approveRecruitmentApplication);
  const stableRejectRecruitmentApplication = useStableEvent(rejectRecruitmentApplication);
  const stableDeleteRecruitmentApplication = useStableEvent(deleteRecruitmentApplication);
  const stableMarkNotificationAsRead = useStableEvent(markNotificationAsRead);
  const stableMarkNotificationPopupShown = useStableEvent(markNotificationPopupShown);
  const stableRefreshSession = useStableEvent(refreshSession);
  const sessionReady =
    authInitialized &&
    (!firebaseSessionUid || Boolean(currentUser && membershipsLoaded));

  const sessionValue = useMemo<SessionStoreType>(
    () => ({
      isSeniorAuthenticated,
      setIsSeniorAuthenticated,
      seniorCompanyId,
      setSeniorCompanyId,
      currentUser,
      setCurrentUser,
      authInitialized,
      membershipsLoaded,
      sessionReady,
      sessionRecovering,
      refreshSession: stableRefreshSession,
      activeRole,
      memberships,
      companies: visibleCompanies,
      companiesLoading,
      allCompanies: companies,
      activeCompanyId,
      setActiveCompanyId,
      switchRole: stableSwitchRole,
      logOutApp: stableLogOutApp,
    }),
    [
      activeCompanyId,
      activeRole,
      authInitialized,
      companies,
      companiesLoading,
      currentUser,
      isSeniorAuthenticated,
      memberships,
      membershipsLoaded,
      seniorCompanyId,
      sessionReady,
      sessionRecovering,
      stableRefreshSession,
      stableLogOutApp,
      stableSwitchRole,
      visibleCompanies,
    ],
  );

  const notificationValue = useMemo<NotificationStoreType>(
    () => ({
      notifications,
      notificationsHydrated,
      markNotificationAsRead: stableMarkNotificationAsRead,
      markNotificationPopupShown: stableMarkNotificationPopupShown,
    }),
    [
      notifications,
      notificationsHydrated,
      stableMarkNotificationAsRead,
      stableMarkNotificationPopupShown,
    ],
  );

  const activityValue = useMemo<ActivityStoreType>(
    () => ({
      jobDemands: scopedJobDemands,
      driverRequests: scopedDriverRequests,
      recruitmentApplications: scopedRecruitmentApplications,
    }),
    [
      scopedDriverRequests,
      scopedJobDemands,
      scopedRecruitmentApplications,
    ],
  );

  const rankingFilterValue = useMemo<RankingFilterStoreType>(
    () => ({
      globalPeriodPreset,
      setGlobalPeriodPreset,
      globalStartDateStr,
      setGlobalStartDateStr,
      globalEndDateStr,
      setGlobalEndDateStr,
    }),
    [globalEndDateStr, globalPeriodPreset, globalStartDateStr],
  );

  const operationalValue = useMemo<OperationalStoreType>(
    () => ({
      users: combinedUsers,
      allCompanyMembers,
      vehicles,
      trailers,
      contracts,
      sequences,
      jobs,
      simulators,
      simulatorsLoading,
      simulatorsError,
      updateRecruitmentSettings: stableUpdateRecruitmentSettings,
      submitRecruitmentApplication: stableSubmitRecruitmentApplication,
      approveRecruitmentApplication: stableApproveRecruitmentApplication,
      rejectRecruitmentApplication: stableRejectRecruitmentApplication,
      deleteRecruitmentApplication: stableDeleteRecruitmentApplication,
      createCompany: stableCreateCompany,
      updateCompany: stableUpdateCompany,
      deleteCompany: stableDeleteCompany,
      createContract: stableCreateContract,
      updateContract: stableUpdateContract,
      deleteContract: stableDeleteContract,
      createSequence: stableCreateSequence,
      updateSequence: stableUpdateSequence,
      deleteSequence: stableDeleteSequence,
      assignJob: stableAssignJob,
      startJob: stableStartJob,
      finishJob: stableFinishJob,
      cancelJob: stableCancelJob,
      deleteJob: stableDeleteJob,
      requestNewJobDemand: stableRequestNewJobDemand,
      cancelJobDemand: stableCancelJobDemand,
      rejectJobDemand: stableRejectJobDemand,
      requestJoinCompany: stableRequestJoinCompany,
      cancelRequestJoinCompany: stableCancelRequestJoinCompany,
      approveDriver: stableApproveDriver,
      rejectDriver: stableRejectDriver,
      promoteDriverToAdmin: stablePromoteDriverToAdmin,
      demoteAdminToDriver: stableDemoteAdminToDriver,
      removeDriverFromFleet: stableRemoveDriverFromFleet,
      updateUserOnlineStatus: stableUpdateUserOnlineStatus,
      createManualDriver: stableCreateManualDriver,
      registerUser: stableRegisterUser,
      syncCompanyData: stableSyncCompanyData,
      addVehicle: stableAddVehicle,
      updateVehicle: stableUpdateVehicle,
      deleteVehicle: stableDeleteVehicle,
      addTrailer: stableAddTrailer,
      updateTrailer: stableUpdateTrailer,
      deleteTrailer: stableDeleteTrailer,
    }),
    [
      allCompanyMembers,
      combinedUsers,
      contracts,
      jobs,
      sequences,
      simulators,
      simulatorsError,
      simulatorsLoading,
      trailers,
      vehicles,
    ],
  );

  const value = useMemo<AppContextType>(
    () => ({
      isSeniorAuthenticated,
      setIsSeniorAuthenticated,
      seniorCompanyId,
      setSeniorCompanyId,
      currentUser,
      setCurrentUser,
      authInitialized,
      membershipsLoaded,
      sessionReady,
      sessionRecovering,
      refreshSession: stableRefreshSession,
      users: combinedUsers,
      allCompanyMembers,
      activeRole,
      memberships,
      vehicles,
      trailers,
      contracts,
      sequences,
      createSequence: stableCreateSequence,
      updateSequence: stableUpdateSequence,
      deleteSequence: stableDeleteSequence,
      jobs,
      jobDemands: scopedJobDemands,
      companies: visibleCompanies,
      companiesLoading,
      simulators,
      simulatorsLoading,
      simulatorsError,
      allCompanies: companies,
      activeCompanyId,
      setActiveCompanyId,
      driverRequests: scopedDriverRequests,
      notifications,
      notificationsHydrated,
      markNotificationAsRead: stableMarkNotificationAsRead,
      markNotificationPopupShown: stableMarkNotificationPopupShown,
      recruitmentApplications: scopedRecruitmentApplications,
      createCompany: stableCreateCompany,
      updateCompany: stableUpdateCompany,
      deleteCompany: stableDeleteCompany,
      createContract: stableCreateContract,
      updateContract: stableUpdateContract,
      deleteContract: stableDeleteContract,
      assignJob: stableAssignJob,
      startJob: stableStartJob,
      finishJob: stableFinishJob,
      cancelJob: stableCancelJob,
      deleteJob: stableDeleteJob,
      requestJoinCompany: stableRequestJoinCompany,
      cancelRequestJoinCompany: stableCancelRequestJoinCompany,
      approveDriver: stableApproveDriver,
      rejectDriver: stableRejectDriver,
      createManualDriver: stableCreateManualDriver,
      registerUser: stableRegisterUser,
      requestNewJobDemand: stableRequestNewJobDemand,
      cancelJobDemand: stableCancelJobDemand,
      rejectJobDemand: stableRejectJobDemand,
      syncCompanyData: stableSyncCompanyData,
      addVehicle: stableAddVehicle,
      updateVehicle: stableUpdateVehicle,
      deleteVehicle: stableDeleteVehicle,
      addTrailer: stableAddTrailer,
      updateTrailer: stableUpdateTrailer,
      deleteTrailer: stableDeleteTrailer,
      logOutApp: stableLogOutApp,
      switchRole: stableSwitchRole,
      promoteDriverToAdmin: stablePromoteDriverToAdmin,
      demoteAdminToDriver: stableDemoteAdminToDriver,
      removeDriverFromFleet: stableRemoveDriverFromFleet,
      updateUserOnlineStatus: stableUpdateUserOnlineStatus,
      updateRecruitmentSettings: stableUpdateRecruitmentSettings,
      submitRecruitmentApplication: stableSubmitRecruitmentApplication,
      approveRecruitmentApplication: stableApproveRecruitmentApplication,
      rejectRecruitmentApplication: stableRejectRecruitmentApplication,
      deleteRecruitmentApplication: stableDeleteRecruitmentApplication,
      globalPeriodPreset,
      setGlobalPeriodPreset,
      globalStartDateStr,
      setGlobalStartDateStr,
      globalEndDateStr,
      setGlobalEndDateStr,
    }),
    [
      activeCompanyId,
      activeRole,
      allCompanyMembers,
      authInitialized,
      combinedUsers,
      companies,
      companiesLoading,
      contracts,
      currentUser,
      globalEndDateStr,
      globalPeriodPreset,
      globalStartDateStr,
      isSeniorAuthenticated,
      jobs,
      memberships,
      membershipsLoaded,
      sessionReady,
      sessionRecovering,
      stableRefreshSession,
      notifications,
      notificationsHydrated,
      scopedDriverRequests,
      scopedJobDemands,
      scopedRecruitmentApplications,
      seniorCompanyId,
      sequences,
      simulators,
      simulatorsError,
      simulatorsLoading,
      trailers,
      vehicles,
      visibleCompanies,
    ],
  );

  return (
    <SessionContext.Provider value={sessionValue}>
      <NotificationStoreContext.Provider value={notificationValue}>
        <ActivityContext.Provider value={activityValue}>
          <RankingFilterContext.Provider value={rankingFilterValue}>
            <OperationalContext.Provider value={operationalValue}>
              <AppContext.Provider value={value}>{children}</AppContext.Provider>
            </OperationalContext.Provider>
          </RankingFilterContext.Provider>
        </ActivityContext.Provider>
      </NotificationStoreContext.Provider>
    </SessionContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppStore must be used within AppProvider");
  return context;
};

export const useSessionStore = () => {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSessionStore must be used within AppProvider");
  return context;
};

export const useNotificationStore = () => {
  const context = useContext(NotificationStoreContext);
  if (!context) throw new Error("useNotificationStore must be used within AppProvider");
  return context;
};

export const useActivityStore = () => {
  const context = useContext(ActivityContext);
  if (!context) throw new Error("useActivityStore must be used within AppProvider");
  return context;
};

export const useRankingFilterStore = () => {
  const context = useContext(RankingFilterContext);
  if (!context) throw new Error("useRankingFilterStore must be used within AppProvider");
  return context;
};
export const useOperationalStore = () => {
  const context = useContext(OperationalContext);
  if (!context) throw new Error("useOperationalStore must be used within AppProvider");
  return context;
};
