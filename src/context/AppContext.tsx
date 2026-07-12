import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
} from "react";
import { toast } from "sonner";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { syncSingleSimulatorMember, removeSimulatorMember } from "../lib/syncSimulatorMembers";
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
} from "firebase/firestore";

// --- Types ---
export type Role = "admin" | "driver";

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  roles: Role[];
  permissions: string[];
  status: "active" | "pending" | "rejected";
  joinedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  photoURL?: string;
  whatsapp?: string;
  applicationSubmitted?: boolean;
  status: "active" | "pending" | "rejected";
  isOnline?: boolean;
  level?: number;
  rating?: number;
  avatar?: string;
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
  userId?: string;
  companyId: string;
  simulatorId?: string;
  photoURL: string;
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
  createdAt: string;
}

export interface CompanyProfile {
  id: string;
  userId?: string;
  ownerId?: string;
  companyName: string;
  fleetName?: string; // Fallback temporário
  simulatorName: string;
  ownerName: string;
  cnpj: string;
  whatsapp?: string;
  logoUrl?: string;
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
  adminId: string;
  status: "pendente" | "aprovado" | "recusado";
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  titulo: string;
  mensagem: string;
  tipo: "solicitacao" | "aprovado" | "recusado";
  lida: boolean;
  createdAt: string;
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
    avatar: "https://i.pravatar.cc/150?u=u1",
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
    avatar: "https://i.pravatar.cc/150?u=u2",
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
    avatar: "https://i.pravatar.cc/150?u=u3",
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
    avatar: "https://i.pravatar.cc/150?u=u4",
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
interface AppContextType {
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

  users: User[];
  vehicles: Vehicle[];
  trailers: Trailer[];
  contracts: Contract[];
  sequences: Sequence[];
  jobs: Job[];
  jobDemands: JobDemand[];
  companies: CompanyProfile[];
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
  ) => Promise<void>;
  approveRecruitmentApplication: (applicationId: string) => Promise<void>;
  rejectRecruitmentApplication: (applicationId: string) => Promise<void>;
  deleteRecruitmentApplication: (applicationId: string) => Promise<void>;

  createCompany: (data: Omit<CompanyProfile, "id" | "cnpj">) => void;
  updateCompany: (
    id: string,
    updates: Partial<Omit<CompanyProfile, "id" | "cnpj">>,
  ) => void;
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
  markNotificationAsRead: (notificationId: string) => void;
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

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null); // Start in login flow
  const [authInitialized, setAuthInitialized] = useState(false);
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [memberships, setMemberships] = useState<CompanyMember[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(() => {
    const seniorAccess = sessionStorage.getItem("seniorAccess") === "true";
    const seniorCompanyId = sessionStorage.getItem("seniorCompanyId");
    if (seniorAccess && seniorCompanyId) {
      return seniorCompanyId;
    }
    return localStorage.getItem("activeCompanyId");
  });
  const [isSeniorAuthenticated, setIsSeniorAuthenticated] = useState<boolean>(() => sessionStorage.getItem("isSeniorAuthenticated") === "true");
  const [seniorCompanyId, setSeniorCompanyId] = useState<string | null>(() => sessionStorage.getItem("seniorCompanyId"));
  const [activeRole, setActiveRole] = useState<Role | null>(() => {
    return localStorage.getItem("activeRole") as Role | null;
  });

  const [globalPeriodPreset, setGlobalPeriodPreset] = useState<"semana" | "mes" | "custom">("mes");
  const [globalStartDateStr, setGlobalStartDateStr] = useState<string>("");
  const [globalEndDateStr, setGlobalEndDateStr] = useState<string>("");

  // Observe auth state initially
  useEffect(() => {
    let unsubDoc: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        try {
          unsubDoc = onSnapshot(
            doc(db, "users", firebaseUser.uid),
            (userDoc) => {
              if (userDoc.exists()) {
                const data = { ...userDoc.data(), id: userDoc.id } as User;
                if (!data.roles) data.roles = [data.role || "driver"];
                if (
                  data.roles.includes("admin") &&
                  !data.roles.includes("driver")
                ) {
                  data.roles.push("driver");
                }
                if (!data.role)
                  data.role = data.roles.includes("admin") ? "admin" : "driver";
                if (data.roles.includes("admin")) {
                  data.status = "active";
                }
                setCurrentUser(data);
              } else {
                setCurrentUser(null);
              }
              setAuthInitialized(true);
            },
            (e: any) => {
              console.error("Error fetching user data", e);
              if (e.code === "permission-denied") {
                alert(
                  "Atenção! Suas regras no Firestore estão bloqueando o acesso. Certifique-se de adicionar regras de leitura/escrita para a coleção 'users' no seu Console do Firebase.\n\nExemplo:\nmatch /users/{userId} {\n  allow read, write: if request.auth != null;\n}",
                );
              }
              setCurrentUser(null);
              setAuthInitialized(true);
            },
          );
        } catch (e) {
          console.error("Error attaching user snapshot", e);
          setAuthInitialized(true);
        }
      } else {
        setCurrentUser(null);
        setActiveCompanyId(null);
        setActiveRole(null);
        setMemberships([]);
        setAllCompanyMembers([]);
        setUsers([]);
        setFetchedMissingUsers([]);
        setVehicles([]);
        setTrailers([]);
        setContracts([]);
        setJobs([]);
        setJobDemands([]);
        setDriverRequests([]);
        setNotifications([]);
        setRecruitmentApplications([]);

        localStorage.removeItem("activeCompanyId");
        localStorage.removeItem("activeRole");
        // Clear anything else that might be lingering
        sessionStorage.clear();
        setAuthInitialized(true);
        if (unsubDoc) {
          unsubDoc();
          unsubDoc = undefined;
        }
      }
    });

    return () => {
      if (unsubDoc) unsubDoc();
      unsubAuth();
    };
  }, []);

  const [users, setUsers] = useState<User[]>([]);
  const [fetchedMissingUsers, setFetchedMissingUsers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobDemands, setJobDemands] = useState<JobDemand[]>([]);
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [driverRequests, setDriverRequests] = useState<DriverRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [allCompanyMembers, setAllCompanyMembers] = useState<CompanyMember[]>(
    [],
  );

  const [recruitmentApplications, setRecruitmentApplications] = useState<
    RecruitmentApplication[]
  >([]);

  useEffect(() => {
    if (isSeniorAuthenticated) {
      sessionStorage.setItem("isSeniorAuthenticated", "true");
    } else {
      sessionStorage.removeItem("isSeniorAuthenticated");
    }
    if (seniorCompanyId) {
      sessionStorage.setItem("seniorCompanyId", seniorCompanyId);
    } else {
      sessionStorage.removeItem("seniorCompanyId");
    }
  }, [isSeniorAuthenticated, seniorCompanyId]);

  useEffect(() => {
    if (activeCompanyId) {
      localStorage.setItem("activeCompanyId", activeCompanyId);
    } else {
      localStorage.removeItem("activeCompanyId");
    }
    if (activeRole) {
      localStorage.setItem("activeRole", activeRole);
    } else {
      localStorage.removeItem("activeRole");
    }
  }, [activeCompanyId, activeRole]);

  // --- Global Public Companies Subscription ---
  useEffect(() => {
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
        setCompanies(data);
      },
      (error) => {
        console.error("Error fetching global frotas snapshot:", error);
      },
    );
    return () => unsubCompanies();
  }, []);

  // --- Real-time Firestore Subscriptions (Authenticated) ---
  useEffect(() => {
    if (!currentUser || !currentUser.id) {
      setMemberships([]);
      setMembershipsLoaded(true);
      return;
    }
    const q = query(
      collection(db, "companyMembers"),
      where("userId", "==", currentUser.id),
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const fetchedMemberships = snap.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id }) as CompanyMember,
        );

        // Auto-migration for legacy relationships
        if (
          fetchedMemberships.length === 0 &&
          (currentUser.memberships || currentUser.companyId)
        ) {
          console.log(
            "Auto-migrating legacy memberships to companyMembers collection...",
          );
          const batch = writeBatch(db);
          if (currentUser.memberships) {
            Object.entries(currentUser.memberships).forEach(
              ([compId, membershipData]) => {
                const rolesList =
                  membershipData.roles || [membershipData.role] || [];
                const docRef = doc(collection(db, "companyMembers"));
                batch.set(docRef, {
                  companyId: compId,
                  userId: currentUser.id,
                  roles: rolesList,
                  status: membershipData.status || "active",
                  permissions: rolesList.includes("admin")
                    ? ["admin", "owner", "manage_fleet", "all"]
                    : [],
                  joinedAt: new Date().toISOString(),
                });
              },
            );
          }

          if (
            currentUser.companyId &&
            (!currentUser.memberships ||
              !currentUser.memberships[currentUser.companyId])
          ) {
            const rolesList =
              currentUser.roles ||
              (currentUser.role ? [currentUser.role] : ["admin", "driver"]);
            const docRef = doc(collection(db, "companyMembers"));
            batch.set(docRef, {
              companyId: currentUser.companyId,
              userId: currentUser.id,
              roles: rolesList,
              status: "active",
              permissions: rolesList.includes("admin")
                ? ["admin", "owner", "manage_fleet", "all"]
                : [],
              joinedAt: new Date().toISOString(),
            });
          }
          await batch
            .commit()
            .then(() => {
              // Snapshot listener should pick up the newly created docs shortly.
              if (currentUser.memberships) {
                Object.entries(currentUser.memberships).forEach(([compId, membershipData]) => {
                  const rolesList = membershipData.roles || [membershipData.role] || [];
                  syncSingleSimulatorMember(currentUser.id, compId, membershipData.status || "active", rolesList);
                });
              }
              if (currentUser.companyId && (!currentUser.memberships || !currentUser.memberships[currentUser.companyId])) {
                const rolesList = currentUser.roles || (currentUser.role ? [currentUser.role] : ["admin", "driver"]);
                syncSingleSimulatorMember(currentUser.id, currentUser.companyId, "active", rolesList);
              }
            })
            .catch((e) => {
              console.error("Auto-migration failed:", e.message);

              // Fallback: Populate local memberships so the app doesn't break
              const mockMemberships: CompanyMember[] = [];
              if (currentUser.memberships) {
                Object.entries(currentUser.memberships).forEach(
                  ([compId, membershipData]) => {
                    const rolesList =
                      membershipData.roles || [membershipData.role] || [];
                    mockMemberships.push({
                      id: "mock-" + compId,
                      companyId: compId,
                      userId: currentUser.id,
                      roles: rolesList,
                      status: (membershipData.status as any) || "active",
                      permissions: rolesList.includes("admin")
                        ? ["admin", "owner", "manage_fleet", "all"]
                        : [],
                      joinedAt: new Date().toISOString(),
                    });
                  },
                );
              }

              if (
                currentUser.companyId &&
                (!currentUser.memberships ||
                  !currentUser.memberships[currentUser.companyId])
              ) {
                const rolesList = currentUser.roles || [
                  currentUser.role as any,
                ];
                mockMemberships.push({
                  id: "mock-" + currentUser.companyId,
                  companyId: currentUser.companyId,
                  userId: currentUser.id,
                  roles: rolesList,
                  status: "active",
                  permissions: rolesList.includes("admin")
                    ? ["admin", "owner", "manage_fleet", "all"]
                    : [],
                  joinedAt: new Date().toISOString(),
                });
              }
              setMemberships(mockMemberships);
              setMembershipsLoaded(true);
            });
        } else {
          setMemberships(fetchedMemberships);
          setMembershipsLoaded(true);
        }
      },
      (err) => {
        console.error("Error fetching memberships", err);
        setMembershipsLoaded(true);
      },
    );
    return () => unsub();
  }, [currentUser?.id]);

  // Stable primitives for dependencies to avoid excessive re-renders/listener recreations
  const currentUserId = currentUser?.id;
  const currentUserCompanyId = currentUser?.companyId;

  useEffect(() => {
    if (!currentUser || memberships.length === 0) return;

    const validCompanyIds = memberships.map((m) => m.companyId);

    // Check if current activeCompanyId is still valid and corresponds to an actual membership
    const isStale = !activeCompanyId || (!validCompanyIds.includes(activeCompanyId) && !(isSeniorAuthenticated && seniorCompanyId === activeCompanyId));

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
      } else if (isSeniorAuthenticated && seniorCompanyId === activeCompanyId) {
        if (activeRole !== "admin") {
          setActiveRole("admin");
        }
      }
    }
  }, [currentUserId, memberships, activeCompanyId, activeRole]);

  // Fast initial setting of activeCompanyId to avoid blank/flickering states
  useEffect(() => {
    if (currentUserCompanyId && !activeCompanyId) {
      setActiveCompanyId(currentUserCompanyId);
      if (!activeRole) {
        setActiveRole((currentUser.role || "driver") as Role);
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
    const seniorAccess = sessionStorage.getItem("seniorAccess") === "true";
    const seniorId = sessionStorage.getItem("seniorCompanyId");
    if (seniorAccess && seniorId === activeCompanyId) return true;
    if (isSeniorAuthenticated && seniorCompanyId === activeCompanyId) return true;
    const currentMembership = memberships.find(
      (m) => m.companyId === activeCompanyId,
    );
    return (
      currentMembership?.status === "active" ||
      currentMembership?.roles?.includes("admin") === true
    );
  }, [currentUser, memberships, activeCompanyId, isSeniorAuthenticated, seniorCompanyId]);

  const targetCompanyId = useMemo(() => {
    const seniorAccess = sessionStorage.getItem("seniorAccess") === "true";
    const seniorId = sessionStorage.getItem("seniorCompanyId");
    if (seniorAccess && seniorId) {
      return seniorId;
    }
    return activeCompanyId || currentUserCompanyId;
  }, [activeCompanyId, currentUserCompanyId]);

  useEffect(() => {
    if (!currentUserId) {
      setVehicles([]);
      setTrailers([]);
      setContracts([]);
      setJobs([]);
      setUsers([]);
      setDriverRequests([]);
      setNotifications([]);
      return;
    }

    const uid = currentUserId;
    const isActive = isActiveUser;

    let unsubVehicles: () => void = () => {};
    let unsubTrailers: () => void = () => {};
    let unsubContracts: () => void = () => {};
    let unsubSequences: () => void;
    let unsubJobs: () => void = () => {};
    let unsubDemands: () => void = () => {};
    let unsubUsers: () => void = () => {};
    let unsubAllCompanyMembers: () => void = () => {};
    

    const handleSnapError = (prefix: string) => (error: any) => {
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
            setJobs(
              snap.docs.map(
                (doc) => ({ ...doc.data(), id: doc.id }) as Job,
              ),
            );
          },
          handleSnapError("Error fetching trabalhos snap"),
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
            let mappedUsers = snap.docs.map(
              (doc) => ({ ...doc.data(), id: doc.id }) as User,
            );

            // Auto-fix for Carlos Henrique
            if (targetCompanyId) {
              const carlos = mappedUsers.find(
                (u) =>
                  u.name && u.name.toLowerCase().includes("carlos henrique"),
              );
              if (carlos && carlos.status === "rejected") {
                updateDoc(doc(db, "users", carlos.id), {
                  status: "active",
                  companyId: targetCompanyId,
                  roles: ["driver"],
                  role: "driver",
                }).catch((e) => console.error("Auto-fix Carlos falhou:", e));
              }
            }

            mappedUsers = mappedUsers.map((u) => {
              if (!u.roles) u.roles = [u.role || "driver"];
              if (u.roles.includes("admin") && !u.roles.includes("driver"))
                u.roles.push("driver");
              if (u.roles.includes("admin")) u.status = "active";
              return u;
            });
            setUsers(mappedUsers);
          },
          handleSnapError("Error fetching users snap"),
        );
      }

      // NOVO: Fetch todos os membros da empresa ativa
      if (targetCompanyId) {
        unsubAllCompanyMembers = onSnapshot(
          query(
            collection(db, "companyMembers"),
            where("companyId", "==", targetCompanyId),
          ),
          (snap) => {
            setAllCompanyMembers(
              snap.docs.map(
                (doc) => ({ ...doc.data(), id: doc.id }) as CompanyMember,
              ),
            );
          },
          handleSnapError("Error fetching all company members"),
        );
      }
    }

    // Helper pra unsub
    let unsubDriverRequests: () => void = () => {};
    let unsubNotifications: () => void = () => {};
    let unsubRecruitmentApps: () => void = () => {};

    if (isActive) {
      // Notificações: o prórprio uid.
      unsubNotifications = onSnapshot(
        query(collection(db, "notificacoes"), where("userId", "==", uid)),
        (snap) => {
          setNotifications(
            snap.docs.map(
              (doc) => ({ ...doc.data(), id: doc.id }) as AppNotification,
            ),
          );
        },
        handleSnapError("Error fetching notificacoes"),
      );

      if (activeRole === "admin") {
        if (targetCompanyId) {
          unsubDriverRequests = onSnapshot(
            query(
              collection(db, "solicitacoes_motoristas"),
              where("empresaId", "==", targetCompanyId),
            ),
            (snap) => {
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
            setDriverRequests(
              snap.docs.map(
                (doc) => ({ ...doc.data(), id: doc.id }) as DriverRequest,
              ),
            );
          },
          handleSnapError("Error fetching driver requests motorista"),
        );

        unsubRecruitmentApps = onSnapshot(
          query(
            collection(db, "recruitment_applications"),
            where("userId", "==", uid),
          ),
          (snap) => {
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
      // If not active, only try to fetch recruitment apps just in case it works so they can see data,
      // but gracefully ignore permission errors.
      unsubRecruitmentApps = onSnapshot(
        query(
          collection(db, "recruitment_applications"),
          where("userId", "==", uid),
        ),
        (snap) => {
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

    return () => {
      unsubVehicles();
      unsubTrailers();
      unsubContracts();
      unsubJobs();
      
      unsubUsers();
      unsubAllCompanyMembers();
      unsubDriverRequests();
      unsubNotifications();
      unsubDemands();
      unsubRecruitmentApps();
    };
  }, [currentUserId, targetCompanyId, activeCompanyId, activeRole, isActiveUser]);

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
        console.error("Error fetching missing users:", e);
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
      if (data.userId || data.email) {
        // Validate if owner
        const targetCompany = companies.find((c) => c.id === data.companyId);
        if (targetCompany && targetCompany.ownerId === data.userId) {
          throw new Error("Você é proprietário desta empresa e não pode se inscrever como motorista.");
        }

        // Validate if member
        const memQ = query(collection(db, "company_members"), where("userId", "==", data.userId), where("companyId", "==", data.companyId), where("status", "==", "active"));
        const memQs = await getDocs(memQ);
        if (!memQs.empty) {
          throw new Error("Você já faz parte desta empresa e não precisa enviar uma nova inscrição.");
        }

        let checkQ;
        if (data.userId) {
          checkQ = query(
            collection(db, "recruitment_applications"),
            where("userId", "==", data.userId),
            where("companyId", "==", data.companyId),
            where("status", "in", ["pending", "approved"])
          );
        } else {
          // Fallback to email if userId isn't defined yet
          checkQ = query(
            collection(db, "recruitment_applications"),
            where("email", "==", data.email.trim().toLowerCase()),
            where("companyId", "==", data.companyId),
            where("status", "in", ["pending", "approved"])
          );
        }

        const checkQs = await getDocs(checkQ);
        const existingApps = checkQs.docs.filter((d) => (d.data() as RecruitmentApplication).simulatorId === data.simulatorId);

        if (existingApps.length > 0) {
          throw new Error("Você já enviou uma inscrição para esta empresa neste simulador.");
        }
      }

      // Don't enforce current user auth - this is a public form
      await addDoc(collection(db, "recruitment_applications"), {
        ...data,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      if (auth.currentUser) {
        // Use setDoc with merge: true instead of updateDoc to ensure it doesn't fail if the user doc hasn't been created yet
        await setDoc(
          doc(db, "users", auth.currentUser.uid),
          {
            applicationSubmitted: true,
            status: "pending", // Update their own user status
          },
          { merge: true },
        );
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const approveRecruitmentApplication = async (applicationId: string) => {
    try {
      getCurrentUserId();
      const app = recruitmentApplications.find((a) => a.id === applicationId);
      if (!app) return;

      // Check if user with this email already exists
      const q = query(
        collection(db, "users"),
        where("email", "==", app.email.trim().toLowerCase()),
      );
      const qs = await getDocs(q);

      let userId = "";
      if (!qs.empty) {
        // user exists, just update them
        userId = qs.docs[0].id;
        const currentData = qs.docs[0].data();

        const updates: any = {
          name: app.fullName,
          whatsapp: app.whatsapp,
          photoURL: app.photoURL || currentData.photoURL || "",
        };

        if (currentData.status !== "active") {
          updates.status = "active";
          updates.companyId = app.companyId;
          updates.role = "driver";
          updates.roles = ["driver"];
        }

        await updateDoc(doc(db, "users", userId), updates);

        // Update or create membership
        const memberQuery = query(
          collection(db, "companyMembers"),
          where("userId", "==", userId),
          where("companyId", "==", app.companyId),
        );
        const mqs = await getDocs(memberQuery);
        if (mqs.empty) {
          await addDoc(collection(db, "companyMembers"), {
            userId: userId,
            companyId: app.companyId,
            roles: ["driver"],
            status: "active",
            permissions: [],
            joinedAt: new Date().toISOString(),
          });
          syncSingleSimulatorMember(userId, app.companyId, "active", ["driver"]);
        } else {
          await updateDoc(doc(db, "companyMembers", mqs.docs[0].id), {
            status: "active",
            roles: arrayUnion("driver"),
          });
          const currentRoles = mqs.docs[0].data().roles || [];
          if (!currentRoles.includes("driver")) currentRoles.push("driver");
          syncSingleSimulatorMember(userId, app.companyId, "active", currentRoles);
        }
      } else {
        // create new user profile using Auth UID if available
        userId = app.userId || doc(collection(db, "users")).id;
        const newDocRef = doc(db, "users", userId);
        await setDoc(newDocRef, {
          id: userId,
          email: app.email.trim().toLowerCase(),
          name: app.fullName,
          whatsapp: app.whatsapp,
          photoURL: app.photoURL || "",
          status: "active",
          companyId: app.companyId,
          role: "driver",
          roles: ["driver"],
          createdAt: new Date().toISOString(),
        });

        await addDoc(collection(db, "companyMembers"), {
          userId: userId,
          companyId: app.companyId,
          roles: ["driver"],
          status: "active",
          permissions: [],
          joinedAt: new Date().toISOString(),
        });
        syncSingleSimulatorMember(userId, app.companyId, "active", ["driver"]);
      }

      await updateDoc(doc(db, "recruitment_applications", applicationId), {
        status: "approved",
      });
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

      if (app && app.userId) {
        const u = await getDoc(doc(db, "users", app.userId));
        if (u.exists() && u.data().status === "pending") {
          await updateDoc(doc(db, "users", app.userId), { status: "rejected" });
        }
      } else if (app && app.email) {
        const q = query(
          collection(db, "users"),
          where("email", "==", app.email.trim().toLowerCase()),
        );
        const qs = await getDocs(q);
        if (!qs.empty && qs.docs[0].data().status === "pending") {
          await updateDoc(doc(db, "users", qs.docs[0].id), {
            status: "rejected",
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
      const randomNum = (min: number, max: number) =>
        Math.floor(Math.random() * (max - min + 1)) + min;
      const cnpj = `${randomNum(10, 99)}.${randomNum(100, 999)}.${randomNum(100, 999)}/0001-${randomNum(10, 99)}`;
      const payload = {
        ...data,
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

      await addDoc(collection(db, "trabalhos"), {
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

      // Update vehicle status
      await updateDoc(doc(db, "veiculos", vehicleId), { status: "in_use" });
      if (trailerId) {
        await updateDoc(doc(db, "reboques", trailerId), { status: "in_use" });
      }

      // Check if driver has a pending job demand
      const pendingDemand = jobDemands.find(
        (d) =>
          d.driverId === driverId &&
          d.status === "pending" &&
          d.companyId === activeCompanyId,
      );
      if (pendingDemand) {
        await updateDoc(doc(db, "jobDemands", pendingDemand.id), {
          status: "reviewed",
        });
      }
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
        (r) => r.empresaId === companyId && r.status === "pendente",
      );
      if (hasPending) {
        alert("Você já tem uma solicitação pendente para esta empresa.");
        return;
      }

      const activeCompany = companies.find((c) => c.id === companyId);

      await addDoc(collection(db, "solicitacoes_motoristas"), {
        motoristaId: uid,
        empresaId: companyId,
        adminId: activeCompany?.userId || "", // Adiciona adminId para regras de segurança
        status: "pendente",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Notify the admin of the company
      if (activeCompany && activeCompany.userId) {
        await addDoc(collection(db, "notificacoes"), {
          userId: activeCompany.userId, // Send to the company owner
          titulo: "Nova Solicitação",
          mensagem: `${currentUser?.name} solicitou entrada na empresa ${activeCompany.companyName}.`,
          tipo: "solicitacao",
          lida: false,
          createdAt: new Date().toISOString(),
        });
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
        status: "aprovado",
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
      await addDoc(collection(db, "notificacoes"), {
        userId: req.motoristaId,
        titulo: "Solicitação Aprovada",
        mensagem: `Sua solicitação para a empresa ${company?.companyName || ""} foi aprovada!`,
        tipo: "aprovado",
        lida: false,
        createdAt: new Date().toISOString(),
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
        status: "recusado",
        updatedAt: new Date().toISOString(),
      });

      // Notify user
      const company = companies.find((c) => c.id === req.empresaId);
      await addDoc(collection(db, "notificacoes"), {
        userId: req.motoristaId,
        titulo: "Solicitação Recusada",
        mensagem: `Sua solicitação para a empresa ${company?.companyName || ""} foi recusada.`,
        tipo: "recusado",
        lida: false,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      getCurrentUserId();
      await updateDoc(doc(db, "notificacoes", notificationId), { lida: true });
    } catch (e) {
      handleFirebaseError(e);
    }
  };

  const switchRole = async (role: Role, newCompanyId?: string) => {
    if (currentUser) {
      const targetCompanyId =
        newCompanyId || activeCompanyId || currentUser.companyId;
      if (!targetCompanyId) return;

      const membership = memberships.find(
        (m) => m.companyId === targetCompanyId,
      );
      const memberRoles = membership?.roles || ["driver"];

      const hasSeniorAccess = isSeniorAuthenticated && (seniorCompanyId === targetCompanyId || newCompanyId === targetCompanyId);

      if ((membership && memberRoles.includes(role)) || hasSeniorAccess) {
        setActiveRole(role);
        setActiveCompanyId(targetCompanyId);

        // Optional fallback for older components
        try {
          await updateDoc(doc(db, "users", currentUser.id), {
            role,
            companyId: targetCompanyId,
          });
          setCurrentUser({
            ...currentUser,
            role,
            companyId: targetCompanyId,
            roles: hasSeniorAccess ? ["admin"] : memberRoles,
          });
        } catch (e) {
          console.error("Failed to persist role/company switch:", e);
        }
      } else if (currentUser.roles?.includes(role)) {
        // Legacy fallback
        setActiveRole(role);
        setActiveCompanyId(targetCompanyId);
        try {
          await updateDoc(doc(db, "users", currentUser.id), {
            role,
            companyId: targetCompanyId,
          });
          setCurrentUser({
            ...currentUser,
            role,
            companyId: targetCompanyId,
            roles: currentUser.roles,
          });
        } catch (e) {
          console.error("Failed to persist role/company switch:", e);
        }
      }
    }
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

      const memberQuery = query(
        collection(db, "companyMembers"),
        where("userId", "==", driverId),
        where("companyId", "==", activeCompanyId),
      );
      const qs = await getDocs(memberQuery);
      if (!qs.empty) {
        await deleteDoc(doc(db, "companyMembers", qs.docs[0].id));
        removeSimulatorMember(driverId, activeCompanyId);
      }

      const driverRef = doc(db, "users", driverId);
      const driverDoc = await getDoc(driverRef);

      if (driverDoc.exists()) {
        const updates: any = { updatedAt: new Date().toISOString() };

        // Remove legacy membership
        updates[`memberships.${activeCompanyId}`] = deleteField();

        // If legacy match, fallback
        if (driverDoc.data().companyId === activeCompanyId) {
          updates.companyId = null;
          updates.status = "pending";
          updates.role = "driver";
          updates.roles = ["driver"];
        }

        await updateDoc(driverRef, updates);
        console.log("Driver removido com sucesso!");
      }
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
        photoURL: driverData.photoURL || "",
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

      await addDoc(collection(db, "jobDemands"), payload);
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
        await addDoc(collection(db, "notificacoes"), {
          userId: demand.driverId,
          titulo: "Solicitação Recusada",
          mensagem:
            "Sua solicitação de nova demanda foi recusada no momento. Aguarde ou informe o administrador.",
          lida: false,
          data: new Date().toISOString(),
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
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during logOutApp signOut:", error);
    }
    
    // Clear global state explicitly
    setCurrentUser(null);
    setActiveCompanyId(null);
    setActiveRole(null);
    setMemberships([]);
    setAllCompanyMembers([]);
    setUsers([]);
    setFetchedMissingUsers([]);
    setVehicles([]);
    setTrailers([]);
    setContracts([]);
    setJobs([]);
    setJobDemands([]);
    setDriverRequests([]);
    setNotifications([]);
    setRecruitmentApplications([]);

    // Clear session and local storage
    sessionStorage.clear();
    localStorage.removeItem("activeCompanyId");
    localStorage.removeItem("activeRole");
  };

  const syncCompanyData = async () => {
    if (!activeCompanyId) return;
    try {
      const companyJobs = jobs.filter((j) => j.companyId === activeCompanyId);
      const companyUsers = users.filter(
        (u) =>
          u.memberships?.[activeCompanyId] || u.companyId === activeCompanyId,
      );

      const batch = writeBatch(db);
      let updates = 0;

      // Pass 1: Build O(1) lookup structures
      const completedJobsProgressByDriver = new Map<string, { count: number, totalProgress: number }>();
      const activeJobProgressByDriver = new Map<string, number>();
      const activeVehicleIds = new Set<string>();
      const activeTrailerIds = new Set<string>();

      for (const job of companyJobs) {
        if (job.status === "completed") {
          const current = completedJobsProgressByDriver.get(job.driverId) || { count: 0, totalProgress: 0 };
          current.count += 1;
          current.totalProgress += job.progress || 0;
          completedJobsProgressByDriver.set(job.driverId, current);
        } else if (["pending", "active", "delayed"].includes(job.status)) {
          if (!activeJobProgressByDriver.has(job.driverId)) {
            activeJobProgressByDriver.set(job.driverId, job.progress || 0);
          }
        }
        
        if (["pending", "active"].includes(job.status)) {
          if (job.vehicleId) activeVehicleIds.add(job.vehicleId);
          if (job.trailerId) activeTrailerIds.add(job.trailerId);
        }
      }

      for (const driver of companyUsers) {
        const completedStats = completedJobsProgressByDriver.get(driver.id) || { count: 0, totalProgress: 0 };
        const activeProgress = activeJobProgressByDriver.get(driver.id) || 0;

        const totalDeliveries = completedStats.totalProgress + activeProgress;
        const xp = totalDeliveries * 150 + completedStats.count * 50;
        const calculatedLevel = Math.floor(xp / 1000) + 1;

        let needsUpdate = false;
        const driverUpdates: any = {};

        if (needsUpdate) {
          batch.update(doc(db, "users", driver.id), driverUpdates);
          updates++;
        }
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
        await batch.commit();
      }
    } catch (e) {
      console.error("Error syncing data:", e);
    }
  };

  // Implementação do auto-sync inteligente (baseado nas mudanças de recursos passivos)
  useEffect(() => {
    if (!authInitialized || !activeCompanyId) return;

    // Debounce de 1.5s para evitar recalculos em massa caso muitas coisas mudem em batch
    const syncTimer = setTimeout(() => {
      syncCompanyData();
    }, 1500);

    return () => clearTimeout(syncTimer);
  }, [jobs, users, vehicles, trailers, activeCompanyId, authInitialized]);

  // Recalculo e sync se retomar a conexão com a internet
  useEffect(() => {
    const handleOnline = () => {
      console.log("[Auto-Sync] Conexão restabelecida. Rodando sincronização.");
      syncCompanyData();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [jobs, users, vehicles, trailers, activeCompanyId, authInitialized]);

  const value = useMemo(() => {
    const combinedUsers = [...users];
    fetchedMissingUsers.forEach((fmu) => {
      if (!combinedUsers.some((u) => u.id === fmu.id)) combinedUsers.push(fmu);
    });
    if (currentUser && !combinedUsers.some((u) => u.id === currentUser.id)) {
      if (
        activeCompanyId &&
        (currentUser.companyId === activeCompanyId ||
          currentUser.memberships?.[activeCompanyId] ||
          allCompanyMembers.some((m) => m.userId === currentUser.id))
      ) {
        combinedUsers.push(currentUser);
      }
    }

    return {
      isSeniorAuthenticated,
      setIsSeniorAuthenticated,
      seniorCompanyId,
      setSeniorCompanyId,
      currentUser,
      setCurrentUser,
      authInitialized,
      membershipsLoaded,
      users: combinedUsers,
      allCompanyMembers,
      activeRole,
      memberships,
      vehicles,
      trailers,
      contracts,
        sequences,
        createSequence,
        updateSequence,
        deleteSequence,
      jobs,
      jobDemands: jobDemands.filter(
        (jd) =>
          jd.companyId === activeCompanyId || jd.driverId === currentUser?.id,
      ),
      companies: isSeniorAuthenticated ? companies : companies.filter(c => memberships?.some(m => m.companyId === c.id)),
      allCompanies: companies,
      activeCompanyId,
      setActiveCompanyId,
      driverRequests: driverRequests.filter(
        (dr) =>
          dr.empresaId === activeCompanyId ||
          dr.motoristaId === currentUser?.id,
      ),
      notifications,
      markNotificationAsRead,
      recruitmentApplications: recruitmentApplications.filter(
        (ra) =>
          ra.companyId === activeCompanyId ||
          (currentUser?.id && ra.userId === currentUser.id) ||
          (currentUser?.email &&
            ra.email?.toLowerCase() === currentUser.email.toLowerCase()),
      ),
      createCompany,
      updateCompany,
      deleteCompany,
      createContract,
      updateContract,
      deleteContract,
      assignJob,
      startJob,
      finishJob,
      cancelJob,
      deleteJob,
      requestJoinCompany,
      cancelRequestJoinCompany,
      approveDriver,
      rejectDriver,
      createManualDriver,
      registerUser,
      requestNewJobDemand,
      cancelJobDemand,
      rejectJobDemand,
      syncCompanyData,
      addVehicle,
      updateVehicle,
      deleteVehicle,
      addTrailer,
      updateTrailer,
      deleteTrailer,
      logOutApp,
      switchRole,
      promoteDriverToAdmin,
      demoteAdminToDriver,
      removeDriverFromFleet,
      updateUserOnlineStatus,
      updateRecruitmentSettings,
      submitRecruitmentApplication,
      approveRecruitmentApplication,
      rejectRecruitmentApplication,
      deleteRecruitmentApplication,
      globalPeriodPreset,
      setGlobalPeriodPreset,
      globalStartDateStr,
      setGlobalStartDateStr,
      globalEndDateStr,
      setGlobalEndDateStr,
    };
  }, [
    currentUser,
    authInitialized,
    users,
    fetchedMissingUsers,
    allCompanyMembers,
    vehicles,
    trailers,
    contracts,
        sequences,
        createSequence,
        updateSequence,
        deleteSequence,
    jobs,
    jobDemands,
    companies,
    activeCompanyId,
    driverRequests,
    notifications,
    recruitmentApplications,
    activeRole,
    memberships,
    globalPeriodPreset,
    globalStartDateStr,
    globalEndDateStr,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppStore must be used within AppProvider");
  return context;
};
