import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../../context/AppContext";
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
  Clock,
  Award,
  Filter,
  BarChart3,
  Search,
} from "lucide-react";
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
  onSnapshot,
} from "firebase/firestore";
import { toast } from "sonner";
import { syncSingleSimulatorMember, removeSimulatorMember } from "../../lib/syncSimulatorMembers";
import { cn } from "../../lib/utils";
import SimulatorManager from "../../components/admin/SimulatorManager";
import { normalizeRegistrationImages } from "../../lib/registrationImages";
import { createNotification } from "../../services/notificationService";
import { isAuthTeardownActive, onAuthTeardown } from "../../lib/authLifecycle";

type SeniorTab = "requests" | "approved" | "profile" | "settings";

type SeniorNavigation = {
  activeTab: SeniorTab;
  selectedCompanyId: string | null;
};

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
      : "requests";
  const selectedCompanyId =
    typeof routeState.selectedCompanyId === "string"
      ? routeState.selectedCompanyId
      : null;

  return { activeTab, selectedCompanyId };
};

export default function SeniorPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSeniorAuthenticated, setIsSeniorAuthenticated, setActiveCompanyId, switchRole, setSeniorCompanyId } = useAppStore();
  const [password, setPassword] = useState("");
  const [loadingAction, setLoadingAction] = useState(false);
  const [unlocked, setUnlocked] = useState(
    sessionStorage.getItem("seniorPanelUnlocked") === "true"
  );

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

      const qRegs = query(
        collection(db, "recruitment_applications"),
        where("type", "==", "company_registration"),
      );
      unsubs.push(
        onSnapshot(
          qRegs,
          (snap) => {
            if (stopped || isAuthTeardownActive()) return;
            setRegistrations(
              snap.docs.map((d) =>
                normalizeRegistrationImages({ id: d.id, ...d.data() }),
              ),
            );
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

  const companyStats = useMemo(() => {
    return allCompanies.map((c) => {
      const members = allMembers.filter(
        (m) => m.companyId === c.id && m.status === "active",
      );
      const jobs = allJobs.filter((j) => j.companyId === c.id);
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
  ]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "9173") {
      setIsSeniorAuthenticated(true);
      setUnlocked(true);
      sessionStorage.setItem("seniorPanelUnlocked", "true");
    } else {
      toast.error("Senha incorreta.");
    }
  };

  const handleApprove = async (reg: any) => {
    try {
      setLoadingAction(true);
      if (auth.currentUser) await auth.currentUser.getIdToken(true);

      const normalizedRegistration = normalizeRegistrationImages(reg);
      const approvedCompanyLogo = normalizedRegistration.companyLogoURL;
      const approvedOwnerPhoto = normalizedRegistration.ownerPhotoUrl;

      const batch = writeBatch(db);
      const newCompanyRef = doc(collection(db, "frotas"));

      const companyPayload = {
        companyName: reg.companyName,
        ownerName: reg.ownerName,
        simulatorName: reg.simulatorName || "Euro Truck Simulator 2",
        cnpj: reg.cnpj,
        whatsapp: reg.whatsapp || "",
        userId: "",
        logoUrl: approvedCompanyLogo || "",
        ownerPhotoUrl: approvedOwnerPhoto || "",
        status: "active",
        createdAt: new Date().toISOString(),
      };

      let finalUserId = "";

      // 1. Try reg.userId first if available on application
      if (reg.userId) {
        finalUserId = reg.userId;
        const userRef = doc(db, "users", reg.userId);

        batch.set(
          userRef,
          {
            companyId: newCompanyRef.id,
            role: "admin",
            roles: ["admin", "driver"],
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
      if (!finalUserId && reg.email) {
        const userQ = query(
          collection(db, "users"),
          where("email", "==", reg.email.trim().toLowerCase()),
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
            email: reg.email.trim().toLowerCase(),
            name: reg.ownerName,
            status: "active",
            companyId: newCompanyRef.id,
            role: "admin",
            roles: ["admin", "driver"],
            profilePhotoURL: approvedOwnerPhoto || "",
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
          email: (reg.email || "").trim().toLowerCase(),
          name: reg.ownerName || "Proprietário",
          status: "active",
          companyId: newCompanyRef.id,
          role: "admin",
          roles: ["admin", "driver"],
          profilePhotoURL: approvedOwnerPhoto || "",
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

      const regRef = doc(db, "recruitment_applications", reg.id);
      batch.update(regRef, {
        status: "approved",
        approvedCompanyId: newCompanyRef.id,
        approvedUserId: finalUserId,
        ownerPhotoPropagated: Boolean(approvedOwnerPhoto),
      });

      await batch.commit();

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
          reg.simulatorName
        );
      }

      toast.success("Empresa aprovada com sucesso!");
      setShowApproveConfirm(null);
      setSelectedRegistrationId(null);
    } catch (e: any) {
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
              Acesso restrito
            </p>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="password"
                placeholder="Senha de acesso"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 dark:text-[#fafafa] text-center"
              />
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11"
              >
                Acessar
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
  const activeCompaniesCount = companyStats.length;

  const getRegistrationStatusInfo = (status: string) => {
    switch(status) {
      case 'approved': return { color: "text-slate-700 bg-slate-100 border border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700", label: "Aprovada" };
      case 'rejected': return { color: "text-slate-500 bg-slate-50 border border-slate-200 dark:text-slate-400 dark:bg-slate-900 dark:border-slate-800 line-through", label: "Recusada" };
      default: return { color: "text-slate-900 bg-white border border-slate-300 shadow-sm dark:text-white dark:bg-[#121212] dark:border-slate-600", label: "Em Análise" };
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
      {/* Corporate Banner Header */}
      <div className="bg-[#0f141e] w-full rounded-[24px] relative overflow-hidden flex flex-col p-6 sm:p-8 sm:pb-6 shadow-sm">
        {/* Decorative background graphics */}
        <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-20 pointer-events-none hidden md:flex items-center justify-end pr-8">
          <div className="relative w-48 h-48">
            <BarChart3 size={160} strokeWidth={1} className="absolute right-0 bottom-0 text-white" />
            <Search size={100} strokeWidth={1} className="absolute right-10 top-4 text-white" />
            <CheckCircle2 size={40} strokeWidth={2} className="absolute right-16 top-12 text-white bg-slate-900 rounded-full" />
          </div>
        </div>

        <div className="flex items-center gap-5 sm:gap-6 relative z-10 w-full mb-8">
          <div className="w-[72px] h-[72px] sm:w-[96px] sm:h-[96px] bg-gradient-to-br from-slate-700 to-slate-900 rounded-[20px] flex items-center justify-center shrink-0 shadow-inner overflow-hidden relative">
            <div className="absolute inset-x-0 top-0 h-px bg-white/20"></div>
            <div className="absolute inset-y-0 left-0 w-px bg-white/10"></div>
            <Building2 size={40} className="text-slate-200 sm:w-[48px] sm:h-[48px]" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col justify-center flex-1">
            <h1 className="text-[24px] sm:text-[32px] font-bold text-white tracking-tight leading-tight">
              Painel Sênior NVU
            </h1>
            <p className="text-[14px] sm:text-[16px] text-slate-400 mt-1 sm:mt-2 font-medium leading-snug">
              Gestão e homologação de <br className="sm:hidden" />empresas parceiras
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap sm:flex-nowrap items-start sm:items-center gap-5 sm:gap-8 mt-2 border-t border-white/10 pt-6 relative z-10 w-full">
          <div className="flex items-center gap-3.5">
            <ShieldCheck size={22} className="text-slate-400 shrink-0" strokeWidth={1.5} />
            <div className="leading-tight">
              <div className="text-[14px] font-bold text-white">Análise segura</div>
              <div className="text-[12px] text-slate-400 mt-0.5">Valide com confiança</div>
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <Clock size={22} className="text-slate-400 shrink-0" strokeWidth={1.5} />
            <div className="leading-tight">
              <div className="text-[14px] font-bold text-white">Processos eficientes</div>
              <div className="text-[12px] text-slate-400 mt-0.5">Decisões mais rápidas</div>
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <Award size={22} className="text-slate-400 shrink-0" strokeWidth={1.5} />
            <div className="leading-tight">
              <div className="text-[14px] font-bold text-white">Plataforma confiável</div>
              <div className="text-[12px] text-slate-400 mt-0.5">Qualidade em cada etapa</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="bg-white dark:bg-[#121212] border border-slate-100 dark:border-slate-800 rounded-[20px] p-5 lg:p-6 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] flex-1 flex items-center gap-5">
           <div className="w-[64px] h-[64px] bg-[#0f141e] dark:bg-slate-900 rounded-[16px] flex items-center justify-center shrink-0">
             <Activity size={32} className="text-white" strokeWidth={1.5} />
           </div>
           <div className="flex flex-col justify-center min-w-0">
             <h3 className="text-[14px] font-bold text-slate-500 dark:text-slate-400">Pendentes</h3>
             <div className="flex items-baseline gap-3 mt-1">
               <div className="text-[32px] sm:text-[36px] font-bold text-slate-900 dark:text-white leading-none">{pendingRequests.length}</div>
               <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 self-center"></div>
               <p className="text-[13px] font-medium text-slate-400 dark:text-slate-500 truncate">Aguardando análise</p>
             </div>
           </div>
        </div>
        <div className="bg-white dark:bg-[#121212] border border-slate-100 dark:border-slate-800 rounded-[20px] p-5 lg:p-6 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] flex-1 flex items-center gap-5">
           <div className="w-[64px] h-[64px] bg-[#0f141e] dark:bg-slate-900 rounded-[16px] flex items-center justify-center shrink-0">
             <Building2 size={32} className="text-white" strokeWidth={1.5} />
           </div>
           <div className="flex flex-col justify-center min-w-0">
             <h3 className="text-[14px] font-bold text-slate-500 dark:text-slate-400">Ativas</h3>
             <div className="flex items-baseline gap-3 mt-1">
               <div className="text-[32px] sm:text-[36px] font-bold text-slate-900 dark:text-white leading-none">{activeCompaniesCount}</div>
               <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 self-center"></div>
               <p className="text-[13px] font-medium text-slate-400 dark:text-slate-500 truncate">Empresas homologadas</p>
             </div>
           </div>
        </div>
      </div>

      {/* Compact Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-[#121212] rounded-[20px] p-2 sm:p-3 sm:px-4 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-800">
        <div className="flex bg-[#f8f9fa] dark:bg-slate-800/40 p-1.5 rounded-[16px] w-full sm:w-auto overflow-x-auto no-scrollbar items-center">
          <button
            onClick={() => selectSeniorTab("requests")}
            className={cn(
              "px-5 py-2.5 text-[15px] font-bold rounded-[12px] transition-all whitespace-nowrap flex items-center gap-2",
              activeTab === "requests"
                ? "bg-white dark:bg-[#121212] text-slate-900 dark:text-white shadow-[0_1px_8px_-2px_rgba(0,0,0,0.08)]"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
            )}
          >
            Solicitações
            {pendingRequests.length > 0 && (
              <span className={cn("py-0.5 px-2.5 rounded-full text-[12px] font-bold", 
                activeTab === "requests" ? "bg-[#0f141e] text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300")}>
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => selectSeniorTab("approved")}
            className={cn(
              "px-6 py-2.5 text-[15px] font-bold rounded-[12px] transition-all whitespace-nowrap",
              activeTab === "approved"
                ? "bg-white dark:bg-[#121212] text-slate-900 dark:text-white shadow-[0_1px_8px_-2px_rgba(0,0,0,0.08)]"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
            )}
          >
            Aprovadas
          </button>
        </div>

        <div className="flex items-center gap-5 w-full sm:w-auto justify-between sm:justify-end px-2 sm:px-0">
          <button className="flex items-center gap-2 text-[15px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            <Filter size={18} strokeWidth={2} /> Filtrar
          </button>
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
          <button 
            onClick={() => selectSeniorTab("settings")}
            className={cn(
              "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors",
              activeTab === "settings" && "text-slate-900 dark:text-white"
            )}
          >
            <Settings size={22} className="stroke-[1.5]" />
          </button>
        </div>
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
        <div className="space-y-4 animate-in fade-in duration-300">
          {companyStats.length === 0 ? (
            <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-[24px] p-12 text-center shadow-sm dark:shadow-none">
              <Building2
                size={48}
                className="mx-auto text-gray-300 dark:text-gray-700 mb-4"
              />
              <p className="text-gray-500 font-medium">
                Nenhuma empresa registrada.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {companyStats.map((c) => (
                <div
                  key={c.id}
                  className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-[24px] p-6 shadow-sm dark:shadow-none transition-all hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700 group flex flex-col"
                >
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-[#2A2F3A] border border-gray-100 dark:border-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                      {c.logoUrl ? (
                        <img
                          src={c.logoUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Building2
                          className="text-blue-500 shadow-none border-0"
                          size={24}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-[16px] text-gray-900 dark:text-[#fafafa] truncate">
                        {c.companyName}
                      </h3>
                      <span className="text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400 px-2 py-0.5 rounded-full inline-flex mt-1 uppercase tracking-wider">
                        Ativa & Operante
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mb-5 pb-4 border-b border-gray-100 dark:border-gray-800">
                    <span className="flex items-center gap-1">
                      <Gamepad2 size={12} /> {c.simulatorName || "ETS2"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} /> {c.ownerName}
                    </span>
                    <span className="flex items-center gap-1 w-full mt-1 border-t border-gray-50 dark:border-gray-800 pt-2 text-gray-400">
                      {c.ownerEmail || "N/A"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-auto">
                    <div>
                      <p className="text-gray-500 text-[11px] font-bold uppercase mb-1 flex items-center gap-1.5">
                        <Users size={12} /> Equipe
                      </p>
                      <p className="font-semibold text-gray-900 dark:text-white text-[15px]">
                        {c.totalEmployees}{" "}
                        <span className="text-gray-400 text-xs font-normal">
                          membros
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[11px] font-bold uppercase mb-1 flex items-center gap-1.5">
                        <Truck size={12} /> Motoristas
                      </p>
                      <p className="font-semibold text-gray-900 dark:text-white text-[15px]">
                        {c.totalDrivers}{" "}
                        <span className="text-gray-400 text-xs font-normal">
                          ativos
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[11px] font-bold uppercase mb-1 flex items-center gap-1.5">
                        <FileText size={12} /> Contratos
                      </p>
                      <p className="font-semibold text-gray-900 dark:text-white text-[15px]">
                        {c.totalContracts}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[11px] font-bold uppercase mb-1 flex items-center gap-1.5">
                        <Navigation size={12} /> Viagens
                      </p>
                      <p className="font-semibold text-gray-900 dark:text-white text-[15px]">
                        {c.totalTrips}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <Button
                      onClick={() => setConfirmDeleteId(c.id)}
                      disabled={loadingAction}
                      variant="ghost"
                      className="w-12 px-0 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 rounded-xl transition-colors shrink-0"
                      title="Remover empresa"
                    >
                      <XCircle size={18} />
                    </Button>
                    <Button
                      onClick={() => viewCompanyProfile(c.id)}
                      className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 dark:bg-[#09090b] dark:hover:bg-gray-800 dark:text-white rounded-xl shadow-none font-semibold transition-colors group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                    >
                      Acessar Painel <ArrowRight size={16} className="ml-2" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
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
