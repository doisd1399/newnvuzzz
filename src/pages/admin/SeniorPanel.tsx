import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useOperationalStore, useSessionStore } from "../../context/AppContext";
import { Card, CardContent } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import {
  CheckCircle2,
  XCircle,
  Building2,
  Users,
  FileText,
  Trash2,
  TrendingUp,
  Truck,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  ArrowRight,
  Activity,
  Gamepad2,
  Navigation,
  ShieldCheck,

  Filter,
  Search,
  ChevronDown,
} from "lucide-react";
import { useTripsRealtime } from "../../hooks/useTripsRealtime";
import { db, auth } from "../../lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  deleteDoc,
  setDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  deleteField,
  onSnapshot,
} from "firebase/firestore";
import { toast } from "sonner";
import { syncSingleSimulatorMember, removeSimulatorMember } from "../../lib/syncSimulatorMembers";
import { cn } from "../../lib/utils";
import SimulatorManager from "../../components/admin/SimulatorManager";
import {
  isCompanyRegistration,
  normalizeRegistrationImages,
} from "../../lib/registrationImages";
import { hydrateRegistrationImages } from "../../lib/registrationImageStorage";
import { resolveSimulatorId } from "../../lib/resolveSimulator";
import { createNotification } from "../../services/notificationService";
import { isAuthTeardownActive, onAuthTeardown } from "../../lib/authLifecycle";
import { getFilteredTrips, getMonthlyRange } from "../../lib/metricsEngine";

type SeniorTab = "requests" | "approved" | "profile" | "settings";

type SeniorNavigation = {
  activeTab: SeniorTab;
  selectedCompanyId: string | null;
};

// Transitional access mode kept for the existing NVU operation. Replace this
// shared password with a server-side role/custom-claim flow when the security
// hardening phase is scheduled.
const LEGACY_SENIOR_PASSWORD = "9173";
const SENIOR_PASSWORD_SESSION_KEY = "seniorPanelPasswordUnlocked";
const SENIOR_PASSWORD_UID_KEY = "seniorPanelPasswordUid";

const getSeniorNavigation = (state: unknown): SeniorNavigation => {
  const routeState =
    state && typeof state === "object"
      ? (state as Record<string, unknown>)
      : {};
  const requestedTab = routeState.activeTab;
  const activeTab: SeniorTab =
    requestedTab === "approved" ||
    requestedTab === "profile" ||
    requestedTab === "settings" ||
    requestedTab === "requests"
      ? requestedTab
      : "approved";
  const selectedCompanyId =
    typeof routeState.selectedCompanyId === "string"
      ? routeState.selectedCompanyId
      : null;

  return { activeTab, selectedCompanyId };
};

export default function SeniorPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    currentUser,
    setIsSeniorAuthenticated,
    setActiveCompanyId,
    switchRole,
    setSeniorCompanyId,
  } = useSessionStore();
  const { simulators } = useOperationalStore();
  const [loadingAction, setLoadingAction] = useState(false);
  const [password, setPassword] = useState("");
  const hasSeniorRole = Boolean(
    (currentUser as any)?.role === "senior" ||
      (Array.isArray((currentUser as any)?.roles) &&
        (currentUser as any).roles.includes("senior")),
  );
  const currentUid = auth.currentUser?.uid || currentUser?.id || "";
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const roleSession =
      hasSeniorRole && sessionStorage.getItem("seniorPanelUnlocked") === "true";
    const passwordSession =
      Boolean(currentUid) &&
      sessionStorage.getItem(SENIOR_PASSWORD_SESSION_KEY) === "true" &&
      sessionStorage.getItem(SENIOR_PASSWORD_UID_KEY) === currentUid;

    if (hasSeniorRole || roleSession || passwordSession) {
      setUnlocked(true);
      setIsSeniorAuthenticated(true);
      return;
    }

    setUnlocked(false);
    setIsSeniorAuthenticated(false);
    if (!hasSeniorRole) sessionStorage.removeItem("seniorPanelUnlocked");
  }, [currentUid, hasSeniorRole, setIsSeniorAuthenticated]);

  // Global Data States
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [allCompanies, setAllCompanies] = useState<any[]>([]);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [allContracts, setAllContracts] = useState<any[]>([]);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [allVehicles, setAllVehicles] = useState<any[]>([]);
  const [allTrailers, setAllTrailers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any>({});

  // UI States
  const [activeTab, setActiveTab] = useState<SeniorTab>(() =>
    getSeniorNavigation(location.state).activeTab,
  );
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    () => getSeniorNavigation(location.state).selectedCompanyId,
  );
  
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showApproveConfirm, setShowApproveConfirm] = useState<string | null>(null);
  const [showRejectConfirm, setShowRejectConfirm] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteRegId, setConfirmDeleteRegId] = useState<string | null>(null);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedSimulator, setSelectedSimulator] = useState("all");
  const [simulatorMenuOpen, setSimulatorMenuOpen] = useState(false);

  // The senior panel contains multiple views inside one route. Mirror the
  // selected view into React Router so browser/WebView Back can restore the
  // previous corporate view.
  useEffect(() => {
    const nextNavigation = getSeniorNavigation(location.state);
    setActiveTab(nextNavigation.activeTab);
    setSelectedCompanyId(nextNavigation.selectedCompanyId);
  }, [location.state]);

  const selectSeniorTab = (
    nextTab: SeniorTab,
    nextCompanyId: string | null =
      nextTab === "profile" ? selectedCompanyId : null,
  ) => {
    if (nextTab === activeTab && nextCompanyId === selectedCompanyId) return;

    const currentState =
      location.state && typeof location.state === "object"
        ? (location.state as Record<string, unknown>)
        : {};

    navigate(location.pathname, {
      state: {
        ...currentState,
        activeTab: nextTab,
        selectedCompanyId: nextTab === "profile" ? nextCompanyId : null,
      },
    });
  };

  useEffect(() => {
    if (unlocked) {
      const unsubs: any[] = [];
      let stopped = false;
      let registrationHydrationVersion = 0;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        unsubs.splice(0).forEach((unsubscribe) => {
          try {
            unsubscribe();
          } catch {
            // Listener cleanup is best-effort during logout.
          }
        });
      };
      const removeTeardownListener = onAuthTeardown(stop);
      const snapshotError = (label: string) => (error: unknown) => {
        if (!stopped && !isAuthTeardownActive()) {
          console.warn(`[NVU Senior] ${label}:`, error);
        }
      };

      // Do not rely only on the current `type` field: older submissions can
      // lack it while still carrying the company identity and legacy logo.
      const qRegs = query(collection(db, "recruitment_applications"));
      unsubs.push(
        onSnapshot(
          qRegs,
          (snap) => {
            if (stopped || isAuthTeardownActive()) return;
            const version = ++registrationHydrationVersion;
            const normalized = snap.docs
              .map((d) => normalizeRegistrationImages({ id: d.id, ...d.data() }))
              .filter((registration) => isCompanyRegistration(registration));
            setRegistrations(normalized);
            void Promise.all(
              normalized.map((registration) =>
                hydrateRegistrationImages(registration),
              ),
            ).then((hydrated) => {
              if (
                !stopped &&
                !isAuthTeardownActive() &&
                version === registrationHydrationVersion
              ) {
                setRegistrations(hydrated);
              }
            }).catch((error) => {
              if (!stopped && !isAuthTeardownActive()) {
                console.warn("[NVU Senior] Falha ao resolver imagem legada:", error);
              }
            });
          },
          snapshotError("Falha ao ler inscrições"),
        ),
      );

      unsubs.push(
        onSnapshot(
          collection(db, "frotas"),
          (snap) => {
            if (stopped || isAuthTeardownActive()) return;
            setAllCompanies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          snapshotError("Falha ao ler empresas"),
        ),
      );
      unsubs.push(
        onSnapshot(
          collection(db, "companyMembers"),
          (snap) => {
            if (stopped || isAuthTeardownActive()) return;
            setAllMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          snapshotError("Falha ao ler membros"),
        ),
      );
      unsubs.push(
        onSnapshot(
          collection(db, "contratos"),
          (snap) => {
            if (stopped || isAuthTeardownActive()) return;
            setAllContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          snapshotError("Falha ao ler contratos"),
        ),
      );
      unsubs.push(
        onSnapshot(
          collection(db, "trabalhos"),
          (snap) => {
            if (stopped || isAuthTeardownActive()) return;
            setAllJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          snapshotError("Falha ao ler trabalhos"),
        ),
      );
      unsubs.push(
        onSnapshot(
          collection(db, "veiculos"),
          (snap) => {
            if (stopped || isAuthTeardownActive()) return;
            setAllVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          snapshotError("Falha ao ler veículos"),
        ),
      );
      unsubs.push(
        onSnapshot(
          collection(db, "reboques"),
          (snap) => {
            if (stopped || isAuthTeardownActive()) return;
            setAllTrailers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          snapshotError("Falha ao ler reboques"),
        ),
      );
      unsubs.push(
        onSnapshot(
          collection(db, "users"),
          (snap) => {
            if (stopped || isAuthTeardownActive()) return;
            setAllUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          snapshotError("Falha ao ler usuários"),
        ),
      );
      unsubs.push(
        onSnapshot(
          doc(db, "settings", "system"),
          (snap) => {
            if (stopped || isAuthTeardownActive()) return;
            if (snap.exists()) setSystemSettings(snap.data());
          },
          snapshotError("Falha ao ler configurações"),
        ),
      );

      return () => {
        removeTeardownListener();
        stop();
      };
    }
  }, [unlocked]);

  const toDate = (value: any): Date | null => {
    if (!value) return null;
    if (typeof value?.toDate === "function") return value.toDate();
    if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const monthlyRange = useMemo(() => getMonthlyRange(), []);
  
  const { trips: currentMonthTrips } = useTripsRealtime({
    startDate: monthlyRange.start,
    endDate: monthlyRange.end,
    enabled: unlocked
  });

  const companyStats = useMemo(() => {
    return allCompanies.map((c) => {
      const members = allMembers.filter(
        (m) => m.companyId === c.id && m.status === "active",
      );
      const jobs = allJobs.filter((j) => j.companyId === c.id);
      
      const monthlyTrips = getFilteredTrips(
        currentMonthTrips,
        undefined, // startDate
        undefined, // endDate
        c.id, // empresaId
        undefined, // simulatorId
        allCompanies, // companies
        undefined, // motorista
        simulators as Record<string, unknown>[]
      ).length;
      
      const owner = allUsers.find((u) => u.id === c.userId);

      return {
        ...c,
        ownerEmail: owner?.email || "N/A",
        totalEmployees: members.length,
        totalDrivers: members.filter((m) => m.roles.includes("driver")).length,
        totalAdmins: members.filter((m) => m.roles.includes("admin")).length,
        totalContracts: allContracts.filter((ct) => ct.companyId === c.id)
          .length,
        totalTrips: jobs.length,
        monthlyTrips,
        totalDeliveries: jobs.reduce((acc, j) => acc + (j.progress || 0), 0),
        totalVehicles: allVehicles.filter((v) => v.companyId === c.id).length,
        totalTrailers: allTrailers.filter((t) => t.companyId === c.id).length,
      };
    });
  }, [
    allCompanies,
    allMembers,
    allContracts,
    allJobs,
    allVehicles,
    allTrailers,
    allUsers,
    currentMonthTrips,
  ]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const passwordAccepted = password === LEGACY_SENIOR_PASSWORD;
    if (hasSeniorRole || passwordAccepted) {
      setIsSeniorAuthenticated(true);
      setUnlocked(true);
      sessionStorage.setItem("seniorPanelUnlocked", "true");
      if (passwordAccepted && currentUid) {
        sessionStorage.setItem(SENIOR_PASSWORD_SESSION_KEY, "true");
        sessionStorage.setItem(SENIOR_PASSWORD_UID_KEY, currentUid);
      }
      setPassword("");
    } else {
      toast.error("Senha de acesso inválida.");
    }
  };

  const handleApprove = async (reg: any) => {
    const regRef = doc(db, "recruitment_applications", reg.id);
    const actorId = auth.currentUser?.uid || "senior-panel";
    let claimOwned = false;
    let batchCommitted = false;
    try {
      setLoadingAction(true);
      if (auth.currentUser) await auth.currentUser.getIdToken(true);

      const claim = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(regRef);
        if (!snapshot.exists()) throw new Error("Solicitação não encontrada.");
        const current = snapshot.data() as Record<string, any>;
        if (current.status === "approved") return { alreadyApproved: true, data: current };
        if (current.status !== "pending") {
          throw new Error("Esta solicitação não está mais pendente.");
        }
        const lockOwner = String(current.approvalInProgressBy || "");
        const lockValue = current.approvalStartedAt;
        const lockMillis =
          typeof lockValue?.toMillis === "function"
            ? lockValue.toMillis()
            : Date.parse(String(lockValue || "")) || 0;
        if (
          lockOwner &&
          lockOwner !== actorId &&
          lockMillis > 0 &&
          Date.now() - lockMillis < 10 * 60 * 1000
        ) {
          throw new Error("Esta solicitação já está sendo processada por outro administrador.");
        }
        transaction.update(regRef, {
          approvalInProgressBy: actorId,
          approvalStartedAt: serverTimestamp(),
        });
        return { alreadyApproved: false, data: current };
      });

      if (claim.alreadyApproved) {
        toast.info("Esta empresa já foi aprovada anteriormente.");
        setShowApproveConfirm(null);
        setSelectedRegistrationId(null);
        return;
      }
      claimOwned = true;
      const normalizedRegistration: any = normalizeRegistrationImages(
        await hydrateRegistrationImages({ ...claim.data, id: reg.id }),
      );
      const approvedCompanyLogo = normalizedRegistration.companyLogoURL;
      const approvedOwnerPhoto = normalizedRegistration.ownerPhotoUrl;
      const rawSimulatorValue = String(
        normalizedRegistration.simulatorId ||
          normalizedRegistration.simulatorName ||
          "",
      ).trim();
      const matchingSimulator = (Array.isArray(simulators) ? simulators : []).find(
        (simulator: any) =>
          String(simulator.id || "").toLowerCase() === rawSimulatorValue.toLowerCase() ||
          String(simulator.name || "").toLowerCase() === rawSimulatorValue.toLowerCase(),
      );
      const canonicalSimulatorId =
        matchingSimulator?.id || resolveSimulatorId(normalizedRegistration, simulators);
      const companyCreatedAt = new Date().toISOString();

      const batch = writeBatch(db);
      const newCompanyRef = doc(collection(db, "frotas"));

      const companyPayload = {
        companyName: normalizedRegistration.companyName,
        ownerName: normalizedRegistration.ownerName,
        simulatorId: canonicalSimulatorId,
        simulatorName: normalizedRegistration.simulatorName || "Euro Truck Simulator 2",
        cnpj: normalizedRegistration.cnpj,
        whatsapp: normalizedRegistration.whatsapp || "",
        userId: "",
        logoUrl: approvedCompanyLogo || "",
        ...(normalizedRegistration.companyLogoStoragePath && {
          logoStoragePath: normalizedRegistration.companyLogoStoragePath,
        }),
        ...(normalizedRegistration.ownerPhotoStoragePath && {
          ownerPhotoStoragePath: normalizedRegistration.ownerPhotoStoragePath,
        }),
        ownerPhotoUrl: approvedOwnerPhoto || "",
        status: "active",
        sourceRegistrationId: reg.id,
        createdAt: companyCreatedAt,
      };

      let finalUserId = "";
      const registrationEmail = String(normalizedRegistration.email || "")
        .trim()
        .toLowerCase();

      // 1. Use the submitted UID only when it belongs to the same e-mail.
      // Older forms could retain another account's UID while the visible
      // company data belonged to the new applicant; never bind approval to
      // that stale identity.
      const submittedUserId = String(normalizedRegistration.userId || "").trim();
      if (submittedUserId) {
        const submittedUserSnapshot = await getDoc(
          doc(db, "users", submittedUserId),
        );
        const submittedUserEmail = String(
          submittedUserSnapshot.data()?.email || "",
        )
          .trim()
          .toLowerCase();
        if (
          submittedUserSnapshot.exists() &&
          registrationEmail &&
          submittedUserEmail === registrationEmail
        ) {
          finalUserId = submittedUserId;
        }
      }

      if (finalUserId) {
        const userRef = doc(db, "users", finalUserId);

        batch.set(
          userRef,
          {
            companyId: newCompanyRef.id,
            role: "admin",
            roles: ["admin", "driver"],
            authProvisioningRequired:
              finalUserId !== auth.currentUser?.uid,
            ...(approvedOwnerPhoto && {
              profilePhotoURL: approvedOwnerPhoto,
            }),
            status: "active",
          },
          { merge: true },
        );

        const newMemberRef = doc(collection(db, "companyMembers"));
        batch.set(newMemberRef, {
          companyId: newCompanyRef.id,
          userId: finalUserId,
          roles: ["admin", "driver"],
          status: "active",
          permissions: ["admin", "owner", "manage_fleet", "all"],
          joinedAt: new Date().toISOString(),
        });
      }

      // 2. Fallback search by email if reg.userId was not set or didn't exist
      if (!finalUserId && registrationEmail) {
        const userQ = query(
          collection(db, "users"),
          where("email", "==", registrationEmail),
        );
        const userQs = await getDocs(userQ);

        if (!userQs.empty) {
          finalUserId = userQs.docs[0].id;
          const userRef = doc(db, "users", finalUserId);

          batch.update(userRef, {
            companyId: newCompanyRef.id,
            role: "admin",
            roles: ["admin", "driver"],
            ...(approvedOwnerPhoto && {
              profilePhotoURL: approvedOwnerPhoto,
            }),
            status: "active",
          });

          const newMemberRef = doc(collection(db, "companyMembers"));
          batch.set(newMemberRef, {
            companyId: newCompanyRef.id,
            userId: finalUserId,
            roles: ["admin", "driver"],
            status: "active",
            permissions: ["admin", "owner", "manage_fleet", "all"],
            joinedAt: new Date().toISOString(),
          });
        } else {
          const newUserRef = doc(collection(db, "users"));
          finalUserId = newUserRef.id;

          batch.set(newUserRef, {
            email: registrationEmail,
            name: normalizedRegistration.ownerName,
            status: "active",
            companyId: newCompanyRef.id,
            role: "admin",
            roles: ["admin", "driver"],
            profilePhotoURL: approvedOwnerPhoto || "",
            // A Firestore user document is not a Firebase Auth account. Keep
            // this explicit so the provisioning flow can create/send access
            // credentials instead of silently leaving an unreachable user.
            authProvisioningRequired: true,
            createdAt: new Date().toISOString(),
          });

          const newMemberRef = doc(collection(db, "companyMembers"));
          batch.set(newMemberRef, {
            companyId: newCompanyRef.id,
            userId: finalUserId,
            roles: ["admin", "driver"],
            status: "active",
            permissions: ["admin", "owner", "manage_fleet", "all"],
            joinedAt: new Date().toISOString(),
          });
        }
      }

      // 3. Absolute fallback to ensure finalUserId is never empty
      if (!finalUserId) {
        const newUserRef = doc(collection(db, "users"));
        finalUserId = newUserRef.id;

        batch.set(newUserRef, {
          email: registrationEmail,
          name: normalizedRegistration.ownerName || "Proprietário",
          status: "active",
          companyId: newCompanyRef.id,
          role: "admin",
          roles: ["admin", "driver"],
          profilePhotoURL: approvedOwnerPhoto || "",
          authProvisioningRequired: true,
          createdAt: new Date().toISOString(),
        });

        const newMemberRef = doc(collection(db, "companyMembers"));
        batch.set(newMemberRef, {
          companyId: newCompanyRef.id,
          userId: finalUserId,
          roles: ["admin", "driver"],
          status: "active",
          permissions: ["admin", "owner", "manage_fleet", "all"],
          joinedAt: new Date().toISOString(),
        });
      }

      // 4. Record ownerId and userId on company payload and save
      const finalCompanyPayload = {
        ...companyPayload,
        userId: finalUserId,
        ownerId: finalUserId,
      };
      batch.set(newCompanyRef, finalCompanyPayload);

      batch.update(regRef, {
        status: "approved",
        approvedCompanyId: newCompanyRef.id,
        approvedUserId: finalUserId,
        approvedAt: serverTimestamp(),
        approvedBy: actorId,
        companyLogoURL: approvedCompanyLogo || "",
        ownerPhotoUrl: approvedOwnerPhoto || "",
        companyLogoStoragePath:
          normalizedRegistration.companyLogoStoragePath || "",
        ownerPhotoStoragePath:
          normalizedRegistration.ownerPhotoStoragePath || "",
        ownerPhotoPropagated: Boolean(approvedOwnerPhoto),
        logoPropagated: Boolean(approvedCompanyLogo),
        approvalInProgressBy: deleteField(),
        approvalStartedAt: deleteField(),
      });

      await batch.commit();
      batchCommitted = true;

      if (finalUserId) {
        try {
          await createNotification({
            userId: finalUserId,
            companyId: newCompanyRef.id,
            targetProfile: "corporate",
            type: "COMPANY_APPROVED",
            title: "Empresa Aprovada",
            message: "Parabéns! Sua empresa foi aprovada e ativada na NVU.",
            dedupeKey: `COMPANY_APPROVED_${reg.id}`,
          });
        } catch (notificationError) {
          // A aprovação já foi concluída. Falha de aviso não pode desfazer a
          // empresa nem deixar o painel preso em estado de erro.
          console.warn(
            "[SeniorPanel] Empresa aprovada, mas a notificação falhou:",
            notificationError,
          );
        }

        await syncSingleSimulatorMember(
          finalUserId, 
          newCompanyRef.id, 
          "active", 
          ["admin", "driver"], 
          canonicalSimulatorId
        );
      }

      toast.success("Empresa aprovada com sucesso!");
      setShowApproveConfirm(null);
      setSelectedRegistrationId(null);
    } catch (e: any) {
      if (claimOwned && !batchCommitted) {
        try {
          await updateDoc(regRef, {
            approvalInProgressBy: deleteField(),
            approvalStartedAt: deleteField(),
          });
        } catch (unlockError) {
          console.warn("Não foi possível liberar o bloqueio da aprovação:", unlockError);
        }
      }
      console.error(e);
      toast.error("Erro ao aprovar: " + e.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleReject = async (id: string) => {
    try {
      setLoadingAction(true);
      const batch = writeBatch(db);
      const regRef = doc(db, "recruitment_applications", id);
      
      batch.update(regRef, { 
        status: "rejected", 
        rejectionReason: rejectionReason 
      });
      
      const reg = registrations.find((registration) => registration.id === id);

      await batch.commit();

      if (reg?.userId) {
        try {
          await createNotification({
            userId: reg.userId,
            targetProfile: "corporate",
            type: "COMPANY_REJECTED",
            title: "Solicitação Recusada",
            message:
              "Sua solicitação de empresa foi recusada. Consulte os detalhes enviados pela administração.",
            dedupeKey: `COMPANY_REJECTED_${id}`,
          });
        } catch (notificationError) {
          console.warn(
            "[SeniorPanel] Solicitação recusada, mas a notificação falhou:",
            notificationError,
          );
        }
      }

      toast.success("Solicitação recusada.");
      setShowRejectConfirm(null);
      setRejectionReason("");
      setSelectedRegistrationId(null);
    } catch (e: any) {
      toast.error("Erro ao recusar: " + e.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDeleteCompany = async (id: string) => {
    try {
      setLoadingAction(true);

      const batch = writeBatch(db);

      // Delete the company document
      batch.delete(doc(db, "frotas", id));

      // Remove roles and companyId from users that are associated
      const membersToUpdate = allMembers.filter((m) => m.companyId === id);
      membersToUpdate.forEach((m) => {
        batch.delete(doc(db, "companyMembers", m.id));
        removeSimulatorMember(m.userId, id);
      });

      const usersToUpdate = allUsers.filter((u) => u.companyId === id);
      usersToUpdate.forEach((u) => {
        batch.update(doc(db, "users", u.id), {
          companyId: null,
          role: null,
          roles: [],
        });
      });

      await batch.commit();

      toast.success("Empresa removida com sucesso do sistema.");
      if (selectedCompanyId === id) {
        selectSeniorTab("approved", null);
      }
      setConfirmDeleteId(null);
    } catch (e: any) {
      toast.error("Erro ao remover: " + e.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDeleteRegistration = async (id: string) => {
    try {
      setLoadingAction(true);
      await deleteDoc(doc(db, "recruitment_applications", id));
      toast.success("Solicitação removida com sucesso.");
      setConfirmDeleteRegId(null);
      if (selectedRegistrationId === id) {
        setSelectedRegistrationId(null);
      }
    } catch (e: any) {
      toast.error("Erro ao remover solicitação: " + e.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const viewCompanyProfile = (companyId: string) => {
    sessionStorage.setItem("seniorAccess", "true");
    sessionStorage.setItem("seniorCompanyId", companyId);
    setSeniorCompanyId(companyId);
    setActiveCompanyId(companyId);
    switchRole("admin", companyId);
    navigate("/admin/fleet", {
      state: {
        activeTab: "company",
      },
    });
  };

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4">
        <Card className="w-full max-w-sm rounded-[24px] overflow-hidden border border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26] shadow-xl dark:shadow-none">
          <CardContent className="p-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-[#fafafa] mb-2 text-center">
              Painel Senior
            </h2>
            <p className="text-[13px] text-gray-500 dark:text-[#a1a1aa] mb-6 text-center">
              Informe a senha de acesso do painel.
            </p>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Senha de acesso"
                autoComplete="current-password"
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-[#2A2F3A] bg-white dark:bg-[#09090b] px-3 text-center text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
              />
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11"
              >
                Entrar no painel
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedCompany = selectedCompanyId
    ? companyStats.find((c) => c.id === selectedCompanyId)
    : null;

  const pendingRequests = registrations.filter((r) => r.status === "pending");
  const rejectedRequests = registrations.filter((r) => r.status === "rejected");
  const activeCompanies = companyStats.filter((company) => {
    const status = String(company.status || "active").toLowerCase();
    return status === "active" || status === "approved";
  });
  const activeCompaniesCount = activeCompanies.length;

  const activeSimulatorOptions: Array<{ id: string; name: string }> = Array.from(
    new Map<string, { id: string; name: string }>(
      activeCompanies.map((company) => {
        const id = String(company.simulatorId || company.simulatorName || "").trim();
        const catalogEntry = (Array.isArray(simulators) ? simulators : []).find(
          (simulator: any) =>
            String(simulator.id || "").toLowerCase() === id.toLowerCase() ||
            String(simulator.name || "").toLowerCase() ===
              String(company.simulatorName || "").toLowerCase(),
        );
        const name = String(
          catalogEntry?.name || company.simulatorName || company.simulatorId || "Não informado",
        );
        return [id || name, { id: id || name, name }];
      }),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const selectedSimulatorLabel =
    selectedSimulator === "all"
      ? "Todos os simuladores"
      : activeSimulatorOptions.find((option) => option.id === selectedSimulator)?.name ||
        "Todos os simuladores";

  const filteredCompanies = activeCompanies.filter((company) => {
    const queryValue = companySearch.trim().toLocaleLowerCase("pt-BR");
    const matchesSearch =
      !queryValue ||
      [company.companyName, company.ownerName, company.ownerEmail, company.simulatorName]
        .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(queryValue));
    const companySimulator = String(
      company.simulatorId || company.simulatorName || "",
    ).trim();
    const matchesSimulator =
      selectedSimulator === "all" || companySimulator === selectedSimulator;
    return matchesSearch && matchesSimulator;
  });

  const getRegistrationStatusInfo = (status: string) => {
    switch(status) {
      case 'approved': return { color: "text-slate-700 bg-slate-100 border border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700", label: "Aprovada" };
      case 'rejected': return { color: "text-slate-500 bg-slate-50 border border-slate-200 dark:text-slate-400 dark:bg-slate-900 dark:border-slate-800 line-through", label: "Recusada" };
      default: return { color: "text-slate-900 bg-white border border-slate-300 shadow-sm dark:text-white dark:bg-[#121212] dark:border-slate-600", label: "Em Análise" };
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto px-3 sm:px-5 lg:px-6 pt-1 sm:pt-2 pb-6 space-y-2.5 sm:space-y-4">
      {/* Corporate Banner Header */}
      <div className="relative overflow-hidden bg-white/70 dark:bg-[#121213]/70 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 rounded-[18px] sm:rounded-[22px] px-5 sm:px-8 py-5 sm:py-6 shadow-[0_4px_24px_-12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_24px_-12px_rgba(0,0,0,0.5)] flex items-center justify-between">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 to-slate-100/30 dark:from-white/[0.02] dark:to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 rounded-md mb-2.5 shadow-sm">
            <ShieldCheck size={12} className="text-slate-600 dark:text-slate-300" />
            <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">ADMINISTRAÇÃO</span>
          </div>
          <h1 className="text-[20px] sm:text-[24px] font-semibold text-slate-900 dark:text-white leading-tight tracking-tight mb-0.5">
            Painel Sênior NVU
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 font-medium truncate">
            Gestão suprema de empresas parceiras
          </p>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1/2 sm:w-1/3 opacity-[0.03] dark:opacity-[0.07] pointer-events-none flex items-center justify-end pr-4 sm:pr-8">
          <ShieldCheck size={120} className="text-slate-900 dark:text-white translate-x-1/4 sm:translate-x-0" strokeWidth={1} />
        </div>
      </div>

      {/* Resumo real da plataforma */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => selectSeniorTab("requests")}
          className="min-w-0 bg-white/80 dark:bg-[#121213]/80 backdrop-blur-lg border border-slate-200/60 dark:border-slate-800/60 rounded-[14px] sm:rounded-[16px] px-3 py-2.5 sm:px-3.5 sm:py-3 shadow-sm flex items-center gap-2.5 sm:gap-3 text-left overflow-hidden hover:bg-slate-50/90 dark:hover:bg-[#18181a]/90 transition-all active:scale-[0.98]"
        >
          <span className="w-8 h-8 sm:w-10 sm:h-10 rounded-[10px] bg-slate-100/80 dark:bg-slate-800/80 flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-slate-700/50">
            <Activity size={16} className="text-slate-600 dark:text-slate-300 sm:hidden" strokeWidth={2} />
            <Activity size={18} className="text-slate-600 dark:text-slate-300 hidden sm:block" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1 flex flex-col justify-center">
            <span className="block text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-none uppercase tracking-wider mb-0.5">Pendentes</span>
            <span className="block text-[20px] sm:text-[24px] font-bold text-slate-900 dark:text-white leading-none tracking-tight mb-0.5">{pendingRequests.length}</span>
            <span className="block text-[9px] sm:text-[10px] text-slate-400 leading-none line-clamp-1 sm:truncate">Aguardando análise</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => selectSeniorTab("approved")}
          className="min-w-0 bg-white/80 dark:bg-[#121213]/80 backdrop-blur-lg border border-slate-200/60 dark:border-slate-800/60 rounded-[14px] sm:rounded-[16px] px-3 py-2.5 sm:px-3.5 sm:py-3 shadow-sm flex items-center gap-2.5 sm:gap-3 text-left overflow-hidden hover:bg-slate-50/90 dark:hover:bg-[#18181a]/90 transition-all active:scale-[0.98]"
        >
          <span className="w-8 h-8 sm:w-10 sm:h-10 rounded-[10px] bg-slate-100/80 dark:bg-slate-800/80 flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-slate-700/50">
            <Building2 size={16} className="text-slate-600 dark:text-slate-300 sm:hidden" strokeWidth={2} />
            <Building2 size={18} className="text-slate-600 dark:text-slate-300 hidden sm:block" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1 flex flex-col justify-center">
            <span className="block text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-none uppercase tracking-wider mb-0.5">Empresas Ativas</span>
            <span className="block text-[20px] sm:text-[24px] font-bold text-slate-900 dark:text-white leading-none tracking-tight mb-0.5">{activeCompaniesCount}</span>
            <span className="block text-[9px] sm:text-[10px] text-slate-400 leading-none line-clamp-1 sm:truncate">Ativas na plataforma</span>
          </span>
        </button>
      </div>

      {/* Busca e filtro por simulador */}
      <div className="relative bg-white/90 dark:bg-[#121212]/95 border border-slate-100 dark:border-slate-800 rounded-[20px] p-2 shadow-[0_8px_30px_-22px_rgba(15,23,42,0.45)]">
        <div className="flex items-center gap-2">
          <label className="flex-1 min-w-0 h-11 sm:h-12 rounded-[14px] sm:rounded-[15px] bg-slate-50/80 dark:bg-slate-900/70 flex items-center gap-2.5 px-3.5 sm:px-4">
            <Search size={20} className="text-slate-400 shrink-0" />
            <input
              value={companySearch}
              onChange={(event) => setCompanySearch(event.target.value)}
              placeholder="Buscar empresas..."
              className="w-full min-w-0 bg-transparent outline-none text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </label>
          <button
            type="button"
            onClick={() => setSimulatorMenuOpen((open) => !open)}
            aria-label="Selecionar simulador"
            aria-expanded={simulatorMenuOpen}
            className="h-11 sm:h-12 px-3 sm:px-4 rounded-[14px] sm:rounded-[15px] bg-slate-50/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 flex items-center gap-1.5 sm:gap-2 font-semibold shrink-0"
          >
            <Gamepad2 size={21} />
            <span className="hidden sm:inline text-sm max-w-[180px] truncate">{selectedSimulatorLabel}</span>
            <ChevronDown size={16} className={cn("transition-transform", simulatorMenuOpen && "rotate-180")} />
          </button>
        </div>
        <p className="px-2.5 pt-1.5 pb-0.5 text-[11px] sm:text-[12px] font-medium leading-tight text-slate-500 dark:text-slate-400">
          Simulador selecionado: <span className="text-slate-900 dark:text-white">{selectedSimulatorLabel}</span>
        </p>

        {simulatorMenuOpen && (
          <div className="absolute right-2 top-[62px] z-30 w-[min(320px,calc(100%-16px))] rounded-[18px] border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#171717]/95 backdrop-blur-xl p-2 shadow-xl">
            {[{ id: "all", name: "Todos os simuladores" }, ...activeSimulatorOptions].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setSelectedSimulator(option.id);
                  setSimulatorMenuOpen(false);
                }}
                className={cn(
                  "w-full rounded-xl px-3 py-2.5 text-left text-sm flex items-center justify-between gap-3",
                  selectedSimulator === option.id
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800",
                )}
              >
                <span className="flex items-center gap-2 min-w-0"><Gamepad2 size={16} /><span className="truncate">{option.name}</span></span>
                {selectedSimulator === option.id && <CheckCircle2 size={16} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === "settings" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <Card className="rounded-[24px] overflow-hidden border border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26] shadow-sm dark:shadow-none">
            <CardContent className="p-8 space-y-6">
              <div>
                <SimulatorManager />
              <h2 className="text-xl font-bold text-gray-900 dark:text-[#fafafa] flex items-center gap-2 mb-2">
                  Integrações de Sistema
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
                  Configure os serviços externos e integrações que a plataforma
                  NVU utiliza para operar. Estas configurações são globais.
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-[#09090b] border border-gray-100 dark:border-[#2A2F3A] rounded-2xl p-6 flex flex-col gap-6 justify-between items-start">
                <div className="space-y-2">
                  <h3 className="font-bold text-gray-900 dark:text-white text-[16px] flex items-center gap-2">
                    Armazenamento de Arquivos
                    <span className="bg-green-100 text-green-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider">
                      Storage Ativo
                    </span>
                  </h3>
                  <p className="text-sm text-gray-500 max-w-lg leading-relaxed">
                    O sistema está configurado de forma nativa e segura para
                    utilizar o Firebase Storage como servidor de mídias e
                    comprovantes, organizando os arquivos automaticamente por
                    empresa.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "profile" && selectedCompany && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <Button
            onClick={() => selectSeniorTab("approved")}
            variant="outline"
            className="h-10 px-4 rounded-xl shadow-sm border-gray-200 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26]"
          >
            <ChevronLeft size={18} className="mr-2" /> Voltar para Lista
          </Button>

          <Card className="rounded-[24px] overflow-hidden border border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26] shadow-sm dark:shadow-none">
            <CardContent className="p-8">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 bg-blue-50 dark:bg-[#2A2F3A] rounded-2xl flex items-center justify-center shrink-0 overflow-hidden border border-gray-100 dark:border-gray-800">
                  {selectedCompany.logoUrl ? (
                    <img
                      src={selectedCompany.logoUrl}
                      alt="Logo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Building2 className="text-blue-500" size={32} />
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-[#fafafa] flex items-center gap-2">
                    {selectedCompany.companyName}
                    <span className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider mt-1">
                      Status Ativo
                    </span>
                  </h2>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Gamepad2 size={16} /> {selectedCompany.simulatorName}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users size={16} /> {selectedCompany.ownerName}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-[#09090b] p-4 rounded-2xl border border-gray-100 dark:border-[#2A2F3A]">
                  <p className="text-gray-500 dark:text-gray-400 text-[13px] font-medium flex items-center gap-2">
                    <Users size={14} className="text-blue-500" /> Equipe
                    Registrada
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {selectedCompany.totalEmployees}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-[#09090b] p-4 rounded-2xl border border-gray-100 dark:border-[#2A2F3A]">
                  <p className="text-gray-500 dark:text-gray-400 text-[13px] font-medium flex items-center gap-2">
                    <Navigation size={14} className="text-green-500" /> Viagens
                    Entregues
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {selectedCompany.totalTrips}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-[#09090b] p-4 rounded-2xl border border-gray-100 dark:border-[#2A2F3A]">
                  <p className="text-gray-500 dark:text-gray-400 text-[13px] font-medium flex items-center gap-2">
                    <FileText size={14} className="text-purple-500" /> Total
                    Contratos
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {selectedCompany.totalContracts}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-[#09090b] p-4 rounded-2xl border border-gray-100 dark:border-[#2A2F3A]">
                  <p className="text-gray-500 dark:text-gray-400 text-[13px] font-medium flex items-center gap-2">
                    <Truck size={14} className="text-orange-500" /> Veículos na
                    Frota
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {selectedCompany.totalVehicles}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase px-1 border-b border-gray-100 dark:border-gray-800 pb-2">
                    Informações Fiscais
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">
                        CNPJ
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {selectedCompany.cnpj}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">
                        Data de Cadastro
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        {new Date(selectedCompany.createdAt).toLocaleDateString(
                          "pt-BR",
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">
                        Proprietário (ID)
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white text-[11px] font-mono">
                        {selectedCompany.userId || "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase px-1 border-b border-gray-100 dark:border-gray-800 pb-2">
                    Métricas de Frota e Staff
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">
                        Volume Transportado
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {selectedCompany.totalDeliveries}{" "}
                        <span className="text-[11px] text-gray-400">unids</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">
                        Administradores
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {selectedCompany.totalAdmins}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">
                        Motoristas Qualificados
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {selectedCompany.totalDrivers}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "requests" && (
        <div className="animate-in fade-in duration-300">
          {registrations.filter(r => r.status === 'pending' || r.status === 'rejected').length === 0 ? (
            <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
              <CheckCircle2
                size={48}
                className="mx-auto text-green-500 mb-4 opacity-50"
              />
              <h3 className="text-slate-900 dark:text-[#fafafa] font-bold text-lg">
                Tudo limpo!
              </h3>
              <p className="text-slate-500 dark:text-[#a1a1aa] mt-2">
                Nenhuma solicitação pending encontrada.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col shadow-sm">
              {registrations.filter(r => r.status === 'pending' || r.status === 'rejected').sort((a,b) => {
                if (a.status === 'pending' && b.status !== 'pending') return -1;
                if (b.status === 'pending' && a.status !== 'pending') return 1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              }).map((reg, idx, arr) => (
                  <div
                    key={reg.id}
                    className={cn(
                      "p-4 sm:p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/20 group",
                      idx !== arr.length - 1 && "border-b border-slate-100 dark:border-slate-800/80"
                    )}
                  >
                    <div 
                      onClick={() => setSelectedRegistrationId(reg.id)}
                      className="flex items-center gap-4 flex-1 w-full min-w-0 cursor-pointer"
                    >
                       <div className="w-12 h-12 bg-slate-900 dark:bg-slate-800 rounded-[12px] flex items-center justify-center shrink-0 border-none overflow-hidden text-white font-bold text-lg shadow-sm">
                        {reg.companyLogoURL ? (
                          <img
                            src={reg.companyLogoURL}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          reg.companyName.substring(0,2).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col">
                        <h3 className="font-bold text-[15px] text-slate-900 dark:text-white truncate">
                          {reg.companyName}
                        </h3>
                        <div className="flex items-center gap-3 text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                          <span className="truncate flex-1 max-w-[120px]">{reg.ownerName}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <Gamepad2 size={14} /> {reg.simulatorName || "ETS2"}
                          </span>
                        </div>
                        <div className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {reg.cnpj}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between sm:justify-end items-center gap-6 w-full sm:w-auto mt-2 sm:mt-0">
                      <div className={cn("text-[12px] font-medium px-3 py-1 rounded-full flex items-center gap-1.5", 
                        reg.status === 'pending' ? "text-yellow-700 bg-yellow-50 border border-yellow-200/60 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20" : 
                        "text-slate-600 bg-slate-100 border border-slate-200/60 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" 
                      )}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", reg.status === 'pending' ? "bg-yellow-400" : "bg-slate-400")}></div>
                        {reg.status === 'pending' ? "Em análise" : "Recusada"}
                      </div>
                      <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
                        <span className="text-[13px] hidden sm:inline-block">
                          {new Date(reg.createdAt).toLocaleDateString("pt-BR") === new Date().toLocaleDateString("pt-BR") ? "Hoje" : "Ontem"}, {new Date(reg.createdAt).toLocaleTimeString("pt-BR", {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        
                        {reg.status === 'rejected' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteRegId(reg.id);
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        
                        <ChevronRight 
                          size={18} 
                          onClick={() => setSelectedRegistrationId(reg.id)}
                          className="text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-300 transition-colors cursor-pointer" 
                        />
                      </div>
                    </div>
                  </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "approved" && (
        <div className="space-y-3 animate-in fade-in duration-300">
          {filteredCompanies.length === 0 ? (
            <div className="bg-white dark:bg-[#1A1F26] border border-slate-100 dark:border-[#2A2F3A] rounded-[24px] p-10 text-center shadow-sm">
              <Building2 size={44} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-slate-500 font-medium">Nenhuma empresa encontrada para este filtro.</p>
            </div>
          ) : (
            filteredCompanies.map((company) => (
              <article
                key={company.id}
                className="bg-white/95 dark:bg-[#1A1F26]/95 border border-slate-100 dark:border-[#2A2F3A] rounded-[20px] sm:rounded-[22px] px-3 py-3 sm:p-5 shadow-[0_10px_35px_-26px_rgba(15,23,42,0.55)] overflow-hidden"
              >
                <div className="grid grid-cols-[minmax(0,1.28fr)_minmax(128px,.72fr)] sm:grid-cols-[minmax(0,1fr)_300px] gap-2.5 sm:gap-5 items-stretch">
                  <div className="flex gap-2.5 sm:gap-4 min-w-0">
                    <div className="w-12 h-12 sm:w-[76px] sm:h-[76px] rounded-[14px] sm:rounded-[18px] bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 border border-slate-100 dark:border-slate-700">
                      {company.logoUrl ? (
                        <img src={company.logoUrl} alt={`Logo de ${company.companyName}`} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 size={22} className="text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-[14px] sm:text-[19px] text-slate-950 dark:text-white leading-[1.15] truncate">{company.companyName}</h3>
                      <div className="mt-1.5 sm:mt-2 space-y-1 sm:space-y-2 text-[10.5px] sm:text-[13px] leading-tight text-slate-500 dark:text-slate-400">
                        <p className="flex items-center gap-1.5 sm:gap-2 min-w-0"><Gamepad2 size={13} className="shrink-0" /><span className="truncate">{company.simulatorName || company.simulatorId || "Não informado"}</span></p>
                        <p className="flex items-center gap-1.5 sm:gap-2 min-w-0"><Users size={13} className="shrink-0" /><span className="truncate">{company.ownerName || "Proprietário não informado"}</span></p>
                        <p className="flex items-center gap-1.5 sm:gap-2 min-w-0"><FileText size={13} className="shrink-0" /><span className="truncate">{company.ownerEmail || "E-mail não informado"}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 flex flex-col justify-between border-l border-slate-100 dark:border-slate-800 pl-2.5 sm:pl-5">
                    <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-800">
                      <div className="pr-2 sm:pr-4 min-w-0">
                        <p className="text-[8px] sm:text-[11px] font-bold uppercase tracking-[0.02em] sm:tracking-wide text-slate-500 dark:text-slate-400 whitespace-nowrap">Equipe</p>
                        <p className="text-[22px] sm:text-[28px] font-bold text-slate-950 dark:text-white leading-none mt-1.5 sm:mt-2">{company.totalEmployees}</p>
                        <p className="text-[9px] sm:text-[12px] text-slate-400 mt-1 truncate">membros</p>
                      </div>
                      <div className="pl-2 sm:pl-4 min-w-0">
                        <p className="text-[8px] sm:text-[11px] font-bold uppercase tracking-[0.01em] sm:tracking-wide text-slate-500 dark:text-slate-400 whitespace-nowrap">Viagens (mês)</p>
                        <p className="text-[22px] sm:text-[28px] font-bold text-slate-950 dark:text-white leading-none mt-1.5 sm:mt-2">{company.monthlyTrips}</p>
                        <p className="text-[9px] sm:text-[12px] text-slate-400 mt-1 truncate">realizadas</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-[34px_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)] gap-1.5 sm:gap-2 mt-2.5 sm:mt-3">
                      <Button
                        onClick={() => setConfirmDeleteId(company.id)}
                        disabled={loadingAction}
                        variant="ghost"
                        aria-label={`Excluir ${company.companyName}`}
                        className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 rounded-[11px] sm:rounded-[12px] font-semibold p-0 sm:p-3"
                      >
                        <Trash2 size={14} /> <span className="hidden sm:inline ml-2">Excluir</span>
                      </Button>
                      <Button
                        onClick={() => viewCompanyProfile(company.id)}
                        className="h-8 sm:h-9 min-w-0 px-2 sm:px-4 bg-slate-50 hover:bg-slate-100 text-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-white rounded-[11px] sm:rounded-[12px] shadow-none font-semibold text-[10px] sm:text-sm whitespace-nowrap"
                      >
                        <span className="truncate">Acessar Painel</span><ArrowRight size={14} className="ml-1 shrink-0" />
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* Confirmation Modals */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] rounded-[24px] p-6 w-full max-w-sm shadow-xl flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white pb-2 border-b border-gray-100 dark:border-gray-800 mb-3">
                Remover Empresa
              </h3>
              <p className="text-[14px] text-gray-500 dark:text-gray-400">
                ATENÇÃO: Você tem certeza que deseja remover esta empresa
                permanentemente? Todos os vínculos associados a ela perderão
                referência à empresa.
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <Button
                onClick={() => setConfirmDeleteId(null)}
                variant="outline"
                disabled={loadingAction}
                className="h-10 text-sm"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => handleDeleteCompany(confirmDeleteId)}
                disabled={loadingAction}
                className="h-10 text-sm bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm"
              >
                Confirmar Remoção
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteRegId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] rounded-[24px] p-6 w-full max-w-sm shadow-xl flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white pb-2 border-b border-gray-100 dark:border-gray-800 mb-3">
                Remover Solicitação
              </h3>
              <p className="text-[14px] text-gray-500 dark:text-gray-400">
                Tem certeza que deseja excluir permanentemente esta solicitação recusada? Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <Button
                onClick={() => setConfirmDeleteRegId(null)}
                variant="outline"
                disabled={loadingAction}
                className="h-10 text-sm"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => handleDeleteRegistration(confirmDeleteRegId)}
                disabled={loadingAction}
                className="h-10 text-sm bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm"
              >
                Confirmar Exclusão
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedRegistrationId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-50 dark:bg-[#09090b] overflow-y-auto">
          {(() => {
            const reg = registrations.find((r) => r.id === selectedRegistrationId);
            if (!reg) return null;
            return (
              <div className="w-full min-h-screen flex flex-col pt-14 pb-20 justify-start items-center relative">
                {/* Fixed Header */}
                <div className="fixed top-0 left-0 right-0 h-12 bg-white/90 dark:bg-[#1A1F26]/90 backdrop-blur-md border-b border-slate-200 dark:border-[#2A2F3A] px-4 md:px-6 flex items-center justify-between z-[70] shadow-sm">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedRegistrationId(null)}
                      className="text-slate-500 hover:text-slate-900 dark:text-[#a1a1aa] dark:hover:text-white transition-colors flex items-center gap-1 text-[13px] font-semibold"
                    >
                      <ChevronLeft size={16} /> Voltar
                    </button>
                    <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-2"></div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-[14px] font-bold text-slate-900 dark:text-[#fafafa]">Análise de Cadastro</h2>
                      <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full tracking-wider", getRegistrationStatusInfo(reg.status).color)}>
                        {getRegistrationStatusInfo(reg.status).label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Content Replica of the Registration Form */}
                <div className="w-full max-w-[420px] mx-auto py-6 px-4 sm:px-0">
                  <div className="text-center mb-5">
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-[#fafafa] tracking-tight mb-1">
                      NVU
                    </h1>
                    <p className="text-slate-500 dark:text-[#a1a1aa] text-[13px] font-medium">
                      Dados Submetidos para Análise
                    </p>
                  </div>

                  <Card className="rounded-[16px] border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-[#121212]">
                    <CardContent className="p-4 sm:p-5 space-y-5">
                      
                      <div className="space-y-3">
                        <h3 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-3">Dados da Empresa & Documentos</h3>
                        
                        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 w-full mb-1">
                          <div className="relative shrink-0">
                            {reg.companyLogoURL ? (
                              <button onClick={() => setZoomedImage(reg.companyLogoURL!)} className="block w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm relative hover:opacity-80 transition-opacity">
                                <img
                                  src={reg.companyLogoURL}
                                  alt="Logo"
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </button>
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center">
                                <Building2 size={16} className="text-slate-400 dark:text-slate-500" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="block text-[13px] font-semibold text-slate-800 dark:text-[#d4d4d8] mb-0.5">
                              Logo da Empresa
                            </label>
                            <p className="text-[11px] text-slate-500 dark:text-[#a1a1aa] truncate">
                              {reg.companyLogoURL ? "Clique para ampliar" : "Não enviada"}
                            </p>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[12px] font-medium text-slate-600 dark:text-[#d4d4d8] mb-1 ml-0.5">
                            Nome da Empresa
                          </label>
                          <input
                            readOnly
                            value={reg.companyName}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 h-10 text-[14px] outline-none text-slate-900 dark:text-[#fafafa] cursor-default font-medium"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[12px] font-medium text-slate-600 dark:text-[#d4d4d8] mb-1 ml-0.5">
                              CNPJ
                            </label>
                            <input
                              readOnly
                              value={reg.cnpj}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 h-10 text-[14px] outline-none text-slate-900 dark:text-[#fafafa] cursor-default font-medium"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-slate-600 dark:text-[#d4d4d8] mb-1 ml-0.5">
                              Simulador
                            </label>
                            <input
                              readOnly
                              value={reg.simulatorName || "N/A"}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 h-10 text-[14px] outline-none text-slate-900 dark:text-[#fafafa] cursor-default font-medium"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 pt-3">
                        <h3 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-3">Dados do Proprietário</h3>

                        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 w-full mb-1">
                          <div className="relative shrink-0">
                            {reg.ownerPhotoUrl ? (
                              <button onClick={() => setZoomedImage(reg.ownerPhotoUrl!)} className="block w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm relative hover:opacity-80 transition-opacity">
                                <img
                                  src={reg.ownerPhotoUrl}
                                  alt="Owner"
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </button>
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center">
                                <Users size={16} className="text-slate-400 dark:text-slate-500" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="block text-[13px] font-semibold text-slate-800 dark:text-[#d4d4d8] mb-0.5">
                              Foto do Proprietário
                            </label>
                            <p className="text-[11px] text-slate-500 dark:text-[#a1a1aa] truncate">
                              {reg.ownerPhotoUrl ? "Clique para ampliar" : "Não enviada"}
                            </p>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[12px] font-medium text-slate-600 dark:text-[#d4d4d8] mb-1 ml-0.5">
                            Nome do Proprietário
                          </label>
                          <input
                            readOnly
                            value={reg.ownerName}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 h-10 text-[14px] outline-none text-slate-900 dark:text-[#fafafa] cursor-default font-medium"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[12px] font-medium text-slate-600 dark:text-[#d4d4d8] mb-1 ml-0.5">
                              Email
                            </label>
                            <input
                              readOnly
                              value={reg.email || "N/A"}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 h-10 text-[14px] outline-none text-slate-900 dark:text-[#fafafa] cursor-default font-medium"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-slate-600 dark:text-[#d4d4d8] mb-1 ml-0.5">
                              WhatsApp
                            </label>
                            <input
                              readOnly
                              value={reg.whatsapp || "N/A"}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 h-10 text-[14px] outline-none text-slate-900 dark:text-[#fafafa] cursor-default font-medium"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Abertura:</span>
                          <span className="text-[12px] font-medium text-slate-600 dark:text-slate-400">{new Date(reg.createdAt).toLocaleString("pt-BR")}</span>
                        </div>
                        {reg.status !== "pending" && (
                          <div className="pt-2">
                             <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Parecer Registrado:</label>
                             <textarea readOnly value={reg.rejectionReason || "Nenhuma observação informada no sistema."} className="w-full h-16 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[13px] font-medium text-slate-600 dark:text-slate-400 resize-none outline-none cursor-default"/>
                          </div>
                        )}
                      </div>

                    </CardContent>
                  </Card>
                </div>

                {/* Fixed Footer */}
                {reg.status === "pending" && (
                  <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#1A1F26]/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-3 sm:p-4 flex justify-center z-[70] shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)]">
                    <div className="w-full max-w-[420px] flex gap-3">
                      <Button
                        onClick={() => setShowRejectConfirm(reg.id)}
                        variant="outline"
                        className="flex-1 rounded-xl h-10 text-[13px] font-semibold border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
                      >
                        Recusar
                      </Button>
                      <Button
                        onClick={() => setShowApproveConfirm(reg.id)}
                        className="flex-[2] bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 rounded-xl h-10 text-[13px] font-bold shadow-sm"
                      >
                        Aprovar e Ativar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {showApproveConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 w-full max-w-sm shadow-xl flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800 mb-3">
                Aprovar Empresa
              </h3>
              <p className="text-[13px] text-slate-600 dark:text-slate-400">
                Confirma a ativação desta empresa na plataforma NVU? Após a aprovação ela poderá operar normalmente.
              </p>
            </div>
            <div className="flex gap-2 justify-end mt-2">
              <Button
                onClick={() => setShowApproveConfirm(null)}
                variant="outline"
                disabled={loadingAction}
                className="h-9 text-[13px] px-4"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                   const reg = registrations.find(r => r.id === showApproveConfirm);
                   if (reg) handleApprove(reg);
                }}
                disabled={loadingAction}
                className="h-9 text-[13px] px-4 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 border-0 shadow-sm"
              >
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}

      {showRejectConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 w-full max-w-sm shadow-xl flex flex-col gap-3 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800 mb-3">
                Recusar Solicitação
              </h3>
              <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-3">
                Tem certeza que deseja recusar esta solicitação?
              </p>
              
              <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Motivo (Opcional)</label>
              <textarea 
                 value={rejectionReason} 
                 onChange={(e) => setRejectionReason(e.target.value)} 
                 className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-[13px] resize-none outline-none focus:border-slate-400 dark:focus:border-slate-500" 
                 placeholder="Explique o motivo..." 
                 rows={3} 
              />
            </div>
            <div className="flex gap-2 justify-end mt-1">
              <Button
                onClick={() => setShowRejectConfirm(null)}
                variant="outline"
                disabled={loadingAction}
                className="h-9 text-[13px] px-4"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => handleReject(showRejectConfirm)}
                disabled={loadingAction}
                className="h-9 text-[13px] px-4 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 border-0 shadow-sm"
              >
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Image Zoom Overlay */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setZoomedImage(null)}
        >
          <button 
            className="absolute top-4 right-4 p-2 md:top-8 md:right-8 bg-black/50 text-white hover:bg-white hover:text-black transition-colors rounded-full"
            onClick={(e) => { e.stopPropagation(); setZoomedImage(null); }}
          >
            <XCircle size={32} />
          </button>
          <img 
            src={zoomedImage} 
            alt="Zoomed" 
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-300" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

    </div>
  );
}
