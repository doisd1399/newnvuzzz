import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useLocation, useNavigate } from "react-router-dom";
import Dashboard from "./Dashboard";
import { useAppStore } from "../../context/AppContext";
import { Button } from "../../components/ui/Button";
import { cn, getJobRealTimestamp, getNomeContratoHistorico } from "../../lib/utils";
import { getDriverLevelData } from "../../lib/levelUtils";
import { getFilteredTrips, getTodayRange, getWeeklyRange, getMonthlyRange } from "../../lib/metricsEngine";
import { normalizeTrip, NormalizedTrip } from "../../lib/tripNormalizer";
import {
  TrendingUp,
  Target,
  BadgeCheck,
  ChevronRight,
  Crosshair,
  Route,
  X,
  Goal,
  Gauge,
  CheckCircle,
  Truck,
  Car,
  Info,
  Phone,
  Mail,
  Building2,
  Gamepad2,
  Settings,
  Package,
  Power,
  Calendar,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Edit,
  ShieldCheck,
  Check,
  LayoutDashboard,
  User as UserIcon,
  Navigation,
  Lock,
  History,
  Trophy,
  DollarSign,
  Star,
  Sparkles,
  Wallet,
  Award,
  Activity,
  AlertTriangle,
  Hourglass,
  CalendarDays,
  Banknote,
} from "lucide-react";
import { createPortal } from "react-dom";
import { ProfileModal } from "../../components/ProfileModal";
import { DriverPerformanceCard } from "../../components/DriverPerformanceCard";
import { useTripHistory } from "../../hooks/useTripHistory";
import { TripsRepository } from "../../repositories/TripsRepository";

export default function Profile() {
  const {
    currentUser,
    jobs,
    contracts,
    companies,
    vehicles,
    trailers,
    updateUserOnlineStatus,
    requestNewJobDemand,
    activeCompanyId,
    setActiveCompanyId,
    allCompanyMembers,
    memberships,
  } = useAppStore();
  const { historicoTrips = [] } = useTripHistory(activeCompanyId);
  const [isSimulatorMenuOpen, setIsSimulatorMenuOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isConfigMenuOpen, setIsConfigMenuOpen] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<
    "all" | "hoje" | "semana" | "mes" | "custom"
  >("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const [isPageSelectorOpen, setIsPageSelectorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "profile" | "operations"
  >("dashboard");

  if (!currentUser) return null;

  // Active job logic
  const validActiveJobs = jobs.filter(
    (j) =>
      j.driverId === currentUser.id &&
      ["pending", "active", "delayed"].includes(j.status) &&
      contracts.some((c) => c.id === j.contractId),
  );

  validActiveJobs.sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  const activeJob = validActiveJobs[0];
  const activeContract = activeJob
    ? contracts.find((c) => c.id === activeJob.contractId)
    : null;
  const activeVehicle =
    activeJob && activeJob.vehicleId
      ? vehicles.find((v) => v.id === activeJob.vehicleId)
      : null;
  const activeTrailerId = activeJob?.trailerId || activeContract?.trailerId;
  const activeTrailer = activeTrailerId
    ? trailers.find((t) => t.id === activeTrailerId)
    : null;

  // Historical jobs logic (xp calculation only looks at completed)
  const allDriverJobs = jobs.filter(
    (j) => j.driverId === currentUser.id && j.id !== activeJob?.id,
  );
  const pastJobs = allDriverJobs.filter((j) => j.status === "completed");

  const filteredHistoryJobs = pastJobs
    .filter((job) => {
      if (periodFilter === "all") return true;

      const dateStr =
        job.completedAt || job.createdAt || new Date().toISOString();
      const jobDate = new Date(dateStr);

      if (periodFilter === "hoje") {
        const { start, end } = getTodayRange();
        return jobDate >= start && jobDate <= end;
      }

      if (periodFilter === "semana") {
        const { start, end } = getWeeklyRange();
        return jobDate >= start && jobDate <= end;
      }

      if (periodFilter === "mes") {
        const { start, end } = getMonthlyRange();
        return jobDate >= start && jobDate <= end;
      }

      if (periodFilter === "custom") {
        if (customStartDate) {
          const start = new Date(customStartDate);
          const localStart = new Date(
            start.getTime() + start.getTimezoneOffset() * 60000,
          );
          if (jobDate < localStart) return false;
        }
        if (customEndDate) {
          const end = new Date(customEndDate);
          const localEnd = new Date(
            end.getTime() + end.getTimezoneOffset() * 60000,
          );
          localEnd.setHours(23, 59, 59, 999);
          if (jobDate > localEnd) return false;
        }
        return true;
      }
      return true;
    })
    .sort((a, b) => {
      // 1. Logs de depuração temporários para validar a ordem no console
      const tsA = getJobRealTimestamp(a, historicoTrips);
      const tsB = getJobRealTimestamp(b, historicoTrips);
      const dateA = new Date(tsA);
      const dateB = new Date(tsB);

      const contractA = getNomeContratoHistorico(a, contracts.find((c) => c.id === a.contractId));
      const contractB = getNomeContratoHistorico(b, contracts.find((c) => c.id === b.contractId));

      // Fallback if they exactly match
      if (tsB !== tsA) {
        console.log(
          `[SORT DEBUG] ${contractA} vs ${contractB} | ${dateA.toLocaleString()} vs ${dateB.toLocaleString()} | sort: ${tsB - tsA}`,
        );
        return tsB - tsA;
      }

      console.log(
        `[SORT DEBUG] ${contractA} vs ${contractB} | Fallback string comparison`,
      );
      return contractA.localeCompare(contractB);
    });

  const displayDeliveries =
    filteredHistoryJobs.reduce((acc, job) => acc + job.progress, 0) +
    (periodFilter === "all" && activeJob ? activeJob.progress : 0);
  const displayCompleted = filteredHistoryJobs.filter(
    (j) => j.status === "completed",
  ).length;

  const levelData = getDriverLevelData(
    currentUser.id,
    jobs,
    contracts,
    historicoTrips,
  );
  const displayLevel = levelData.displayLevel;
  const currentLevelXp = levelData.currentLevelXp;
  const xpProgress = levelData.xpProgress;

  const normalizedAllTrips = useMemo(() => historicoTrips.map((t: any) => normalizeTrip(t)), [historicoTrips]);
  
  const filteredDriverTrips = useMemo(() => {
    return getFilteredTrips(normalizedAllTrips, undefined, undefined, undefined, undefined, companies, currentUser.id);
  }, [normalizedAllTrips, currentUser.id, companies]);

  const totalGanhos = filteredDriverTrips.reduce((acc, t) => acc + t.normalizedValor, 0);
  const totalViagens = filteredDriverTrips.length;

  const currentActiveCompany = activeCompanyId
    ? companies.find((c) => c.id === activeCompanyId)
    : null;

  const [globalRank, setGlobalRank] = useState<{
    position: number;
    total: number;
    diffToNext: number | null;
  } | null>(null);

  const simulatorCompanies = useMemo(() => {
    const membershipCompanyIds = new Set(memberships?.map(m => m.companyId) || []);
    return companies.filter((c) => membershipCompanyIds.has(c.id));
  }, [companies, memberships]);

  // Dictionary for quick lookups in history map
  const contractsMap = useMemo(() => new Map(contracts.map(c => [c.id, c])), [contracts]);
  const vehiclesMap = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles]);
  const trailersMap = useMemo(() => new Map(trailers.map(t => [t.id, t])), [trailers]);

  const formatCurrency = (val?: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  useEffect(() => {
    if (!currentActiveCompany?.simulatorName || !currentUser?.id) return;

    // Obter apenas os membros da empresa atual
    const membersQ = query(
      collection(db, "companyMembers"),
      where("companyId", "==", currentActiveCompany.id),
    );

    let unsubTrips: () => void;
    let unsubMembers: () => void;

    // Calculado dinamicamente e atualizado automaticamente para o contexto da empresa
    unsubTrips = TripsRepository.listenCompanyTrips(currentActiveCompany.id, (trips) => {
      const earningsByDriver: Record<string, number> = {};

      trips.forEach((data) => {
        const mId = data.motoristaId;
        const valor = Number(data.valor) || 0;
        earningsByDriver[mId] = (earningsByDriver[mId] || 0) + valor;
      });

      // Busca onSnapshot pros members tambem para dinamismo
      unsubMembers = onSnapshot(membersQ, (memSnap) => {
        const driversInCompany = new Set<string>();
        memSnap.docs.forEach((md) => {
          driversInCompany.add(md.data().userId);
        });

        // Garantir que motoristas com trips entrem
        Object.keys(earningsByDriver).forEach((dId) =>
          driversInCompany.add(dId),
        );
        // Garantir o user atual
        driversInCompany.add(currentUser.id);

        const leaderboard = Array.from(driversInCompany).map((driverId) => ({
          id: driverId,
          ganhos: earningsByDriver[driverId] || 0,
        }));

        // Ordem decrescente
        leaderboard.sort((a, b) => b.ganhos - a.ganhos);

        const position =
          leaderboard.findIndex((item) => item.id === currentUser.id) + 1;

        let diffToNext = null;
        if (position > 1) {
          const nextPerson = leaderboard[position - 2];
          const currentGanhos = earningsByDriver[currentUser.id] || 0;
          diffToNext = nextPerson.ganhos - currentGanhos;
        }

        setGlobalRank({
          position: position > 0 ? position : leaderboard.length,
          total: leaderboard.length,
          diffToNext: diffToNext,
        });
      });
    });

    return () => {
      if (unsubTrips) unsubTrips();
      if (unsubMembers) unsubMembers();
    };
  }, [currentActiveCompany?.simulatorName, companies, currentUser.id]);

  const handleRequestWork = async () => {
    try {
      if (currentUser.isOnline) {
        await requestNewJobDemand();
        alert("Solicitação de novo trabalho enviada para a administração.");
      } else {
        alert(
          "Você precisa estar disponível (Online) para solicitar trabalho.",
        );
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Erro ao solicitar trabalho.");
    }
  };

  const currentMembership = activeCompanyId
    ? currentUser.memberships?.[activeCompanyId] ||
      memberships.find((m) => m.companyId === activeCompanyId)
    : null;
  const currentFormattedDate = (currentMembership as any)?.joinedAt
    ? new Date((currentMembership as any).joinedAt).toLocaleDateString("pt-BR")
    : "Recente";

  const pageOptions = [
    { id: "dashboard", label: "Painel Operacional", icon: LayoutDashboard },
    { id: "profile", label: "Meu Perfil", icon: UserIcon },
    { id: "history", label: "Histórico de Viagens", icon: History },
    { id: "operations", label: "Histórico de Operações", icon: Package },
    { id: "reports", label: "Relatórios", icon: Activity },
  ];

  const activePageDetails =
    pageOptions.find((p) => p.id === activeTab) || pageOptions[0];
  const ActiveIcon = activePageDetails.icon;

  const renderPageSelector = () => (
    <div className="w-full flex flex-col gap-2 sm:gap-3 mt-1 sm:mt-2 mb-2 sm:mb-3 z-20">
      <div className="w-full flex flex-row items-stretch justify-between gap-2 sm:gap-4">
        <div
          className={cn(
            "min-w-0 sm:flex-1",
            activeTab === "dashboard" ? "flex-[4.5]" : "flex-1",
          )}
        >
          <button
            onClick={() => setIsPageSelectorOpen(!isPageSelectorOpen)}
            className="w-full h-9 sm:h-[56px] bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg sm:rounded-[12px] px-2 sm:px-4 flex items-center justify-center gap-1.5 sm:gap-[12px] shadow-sm active:scale-[0.99] transition-transform"
          >
            <ActiveIcon
              size={14}
              className="text-slate-600 dark:text-slate-400 shrink-0 sm:!w-[20px] sm:!h-[20px]"
            />
            <span className="text-[11px] sm:text-[16px] font-semibold text-slate-800 dark:text-slate-200 truncate leading-none sm:leading-none">
              {activePageDetails.label}
            </span>
            <ChevronDown
              size={14}
              className={cn(
                "text-slate-400 shrink-0 transition-transform sm:!w-[20px] sm:!h-[20px]",
                isPageSelectorOpen && "rotate-180",
              )}
            />
          </button>
        </div>

        {activeTab === "dashboard" && (
          <div className="min-w-0 sm:flex-1 flex-[5.5]">
            <button
              onClick={() => {
                if (!activeJob || activeJob.status !== "active") {
                  alert(
                    "Inicie uma operação para lançar viagens.\n\n1. Receba um contrato.\n2. Inicie o contrato.\n3. Após iniciar a operação você poderá registrar suas viagens.",
                  );
                  return;
                }
                navigate("/driver/trip");
              }}
              className={cn(
                "w-full h-9 sm:h-[56px] rounded-lg sm:rounded-[12px] shadow-sm flex items-center justify-center gap-1.5 sm:gap-[12px] transition-colors",
                activeJob?.status === "active"
                  ? "bg-[#1f242d] hover:bg-[#2a303c] active:bg-[#151921] text-white dark:bg-slate-200 dark:hover:bg-slate-300 dark:text-slate-800"
                  : "bg-gray-400 dark:bg-gray-600 text-white cursor-not-allowed opacity-80",
              )}
            >
              {activeJob?.status === "active" ? (
                <Navigation
                  size={14}
                  className="shrink-0 sm:!w-[20px] sm:!h-[20px]"
                />
              ) : (
                <Lock
                  size={14}
                  className="shrink-0 sm:!w-[20px] sm:!h-[20px]"
                />
              )}
              <span className="text-[11px] sm:text-[16px] font-semibold tracking-wide sm:tracking-normal leading-none sm:leading-none">
                Lançar Viagem
              </span>
            </button>
          </div>
        )}

        {activeTab === "profile" && (
          <div className="shrink-0 relative">
            <button
              onClick={() => setIsConfigMenuOpen(!isConfigMenuOpen)}
              className="w-9 h-9 sm:w-[56px] sm:h-[56px] bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg sm:rounded-[12px] flex items-center justify-center shadow-sm active:scale-[0.99] transition-transform hover:bg-slate-50 dark:hover:bg-[#2A2F3A]"
            >
              <Settings
                size={16}
                className="text-slate-600 dark:text-slate-400 sm:!w-[22px] sm:!h-[22px]"
              />
            </button>

            {isConfigMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg shadow-lg overflow-hidden z-30 animate-in fade-in zoom-in-95">
                <button
                  onClick={() => {
                    setIsConfigMenuOpen(false);
                    setIsEditProfileOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors"
                >
                  <Edit size={16} className="text-slate-500" />
                  Editar Perfil
                </button>
                <button
                  onClick={() => {
                    setIsConfigMenuOpen(false);
                    setIsInfoOpen(!isInfoOpen);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors border-t border-slate-100 dark:border-slate-800/60"
                >
                  <Info size={16} className="text-slate-500" />
                  {isInfoOpen ? "Ocultar Info" : "Ver Informações"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isPageSelectorOpen && (
        <div className="w-full bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2">
          {pageOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  setIsPageSelectorOpen(false);
                  if (opt.id === "history") {
                    navigate("/driver/history");
                  } else if (opt.id === "reports") {
                    navigate("/driver/reports");
                  } else {
                    setActiveTab(
                      opt.id as "dashboard" | "profile" | "operations",
                    );
                  }
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-3 border-b border-slate-100 dark:border-[#2A2F3A] last:border-0 hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors text-left",
                  activeTab === opt.id ? "bg-slate-50 dark:bg-[#2A2F3A]" : "",
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    activeTab === opt.id
                      ? "text-blue-600 dark:text-[#0cb49f]"
                      : "text-slate-500",
                  )}
                />
                <span
                  className={cn(
                    "text-[13px] sm:text-[14px] font-semibold",
                    activeTab === opt.id
                      ? "text-blue-700 dark:text-[#0cb49f]"
                      : "text-slate-600 dark:text-slate-300",
                  )}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto w-full pb-6">
      {/* iOS Style Nav Bar Content */}
      <div className="flex items-center justify-center px-4 py-0 sm:py-2"></div>

      <div className="space-y-3 sm:space-y-4 px-4 sm:px-6 w-full box-border">
        {/* Action Buttons */}

        {/* Profile Header (Corp Card Style) */}
        <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[14px] sm:rounded-[16px] flex flex-col shadow-sm relative z-30 w-full box-border">
          <div className="p-3 sm:p-4 flex items-start sm:items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-900 dark:bg-[#2A2F3A] rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-[#3A3F4A] shadow-sm relative">
                {currentUser.avatar || currentUser.photoURL ? (
                  <img
                    src={currentUser.avatar || currentUser.photoURL}
                    alt={currentUser.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-base sm:text-lg font-bold text-white tracking-tighter">
                    {currentUser.name.substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex flex-col flex-1 min-w-0 justify-center">
                <div className="flex items-center gap-1.5 w-full">
                  <h2 className="text-[11px] sm:text-[13px] font-bold text-slate-900 dark:text-white leading-none whitespace-nowrap">
                    {currentUser.name}
                  </h2>
                </div>
                <p className="text-[9px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-1 whitespace-nowrap">
                  {currentUser.roles?.includes("admin")
                    ? "Administrador"
                    : "Motorista Parceiro"}
                </p>
              </div>
            </div>

            <div className="flex items-center pl-3 sm:pl-4 border-l border-slate-200 dark:border-[#2A2F3A] shrink-0 w-auto">
              <div className="flex flex-col w-auto min-w-0 justify-center">
                <span className="text-[8px] sm:text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-0.5 px-0.5 whitespace-nowrap">
                  Simulador
                </span>
                <button
                  onClick={() => setIsSimulatorMenuOpen(!isSimulatorMenuOpen)}
                  className="flex items-center justify-between gap-1.5 bg-slate-50 dark:bg-[#1A1F26] hover:bg-slate-100 dark:hover:bg-[#2A2F3A] transition-colors border border-slate-200 dark:border-[#2A2F3A] shadow-sm rounded-md px-1.5 py-1 w-auto active:scale-[0.98]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Truck
                      size={10}
                      className="text-slate-500 dark:text-slate-400 shrink-0"
                    />
                    <span className="text-[9px] sm:text-[10px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {currentActiveCompany?.simulatorName || "G. Truck"}
                    </span>
                  </div>
                  <ChevronDown
                    size={10}
                    className={cn(
                      "text-slate-400 shrink-0 transition-transform ml-1",
                      isSimulatorMenuOpen && "rotate-180",
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          {isSimulatorMenuOpen && (
            <div className="border-t border-slate-100 dark:border-[#2A2F3A] p-2 sm:p-3 bg-slate-50/50 dark:bg-[#1A1F26]/50 rounded-b-[14px] sm:rounded-b-[16px] animate-in fade-in slide-in-from-top-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-2">
                Selecione o Simulador:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {simulatorCompanies
                  .map((c) => {
                    const isSelected = c.id === activeCompanyId;
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setActiveCompanyId(c.id);
                          setIsSimulatorMenuOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 border border-transparent rounded-md transition-colors text-left",
                          isSelected
                            ? "bg-white dark:bg-[#2A2F3A] border-slate-200 dark:border-[#3A3F4A] shadow-sm"
                            : "hover:bg-white dark:hover:bg-[#2A2F3A] hover:border-slate-200 dark:hover:border-[#3A3F4A]",
                        )}
                      >
                        <span
                          className={cn(
                            "text-[11px] sm:text-[12px] font-semibold truncate mr-2",
                            isSelected
                              ? "text-slate-900 dark:text-white"
                              : "text-slate-600 dark:text-slate-300",
                          )}
                        >
                          {c.simulatorName || "Global Truck"}
                        </span>
                        {isSelected && (
                          <Check
                            size={14}
                            className="text-blue-600 dark:text-blue-400 shrink-0"
                          />
                        )}
                      </button>
                    );
                  })}
                {companies.filter((c) =>
                  memberships?.some((m) => m.companyId === c.id),
                ).length === 0 && (
                  <div className="px-4 py-3 text-[13px] text-slate-500 text-center col-span-full">
                    Nenhuma empresa disponível
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {renderPageSelector()}

        {activeTab === "profile" && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Driver Details Info Card */}
            {isInfoOpen && (
              <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[16px] p-4 sm:p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 flex items-center justify-center shrink-0">
                      <Mail
                        size={16}
                        className="text-blue-600 dark:text-blue-400"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Email
                      </p>
                      <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                        {currentUser.email || "Não informado"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-500/10 dark:border-green-500/20 flex items-center justify-center shrink-0">
                      <Phone
                        size={16}
                        className="text-green-600 dark:text-green-400"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        WhatsApp
                      </p>
                      <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                        {currentUser.whatsapp || "Não informado"}
                      </p>
                    </div>
                  </div>
                  {currentActiveCompany && (
                    <div className="flex items-center gap-3 sm:col-span-2">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0">
                        <Building2
                          size={16}
                          className="text-purple-600 dark:text-purple-400"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Empresa Ativa / Vínculo
                        </p>
                        <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                          {currentActiveCompany?.companyName || "Carregando..."}
                          <span className="text-slate-500 font-medium ml-1 text-[13px]">
                            • Desde {currentFormattedDate}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DriverPerformanceCard
              historicoTrips={historicoTrips}
              driverId={currentUser?.id}
              activeCompanyId={activeCompanyId}
              allCompanyMembers={allCompanyMembers}
              currentUser={currentUser}
              displayLevel={displayLevel}
              currentLevelXp={currentLevelXp}
              xpProgress={xpProgress}
            />
          </div>
        )}

        {activeTab === "operations" && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex flex-col gap-3">
              {!activeJob && currentUser.isOnline && (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 font-bold text-[14px] shadow-sm tracking-tight transition-all"
                  onClick={handleRequestWork}
                >
                  <Package size={18} className="mr-2" />
                  Solicitar Nova Operação
                </Button>
              )}
            </div>

            {/* Date Filter */}
            <div className="flex flex-col gap-3">
              <div className="relative group w-full">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                  <Calendar size={16} />
                </div>
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value as any)}
                  className="w-full appearance-none bg-slate-50 dark:bg-[#1A1F26] border border-slate-200/80 dark:border-white/5 rounded-[14px] pl-10 pr-10 py-3 text-[13px] font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shadow-sm"
                >
                  <option value="all">Tudo</option>
                  <option value="hoje">Hoje</option>
                  <option value="semana">Semana Atual</option>
                  <option value="mes">Mês Atual</option>
                  <option value="custom">
                    Personalizado
                  </option>
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
                  <ChevronDown size={16} />
                </div>
              </div>

              {periodFilter === "custom" && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex-1">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-2.5 sm:left-3 flex items-center pointer-events-none text-gray-400">
                        <Calendar size={13} />
                      </div>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full bg-gray-100 dark:bg-[#18181b] text-gray-700 dark:text-[#d4d4d8] text-[12px] sm:text-[13px] font-medium border border-transparent rounded-xl pl-8 sm:pl-9 pr-2 sm:pr-3 py-2 sm:py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 shadow-sm dark:shadow-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-2.5 sm:left-3 flex items-center pointer-events-none text-gray-400">
                        <Calendar size={13} />
                      </div>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full bg-gray-100 dark:bg-[#18181b] text-gray-700 dark:text-[#d4d4d8] text-[12px] sm:text-[13px] font-medium border border-transparent rounded-xl pl-8 sm:pl-9 pr-2 sm:pr-3 py-2 sm:py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 shadow-sm dark:shadow-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Active Job Section */}
            <div>
              <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400/80 uppercase tracking-[0.15em] mb-4 px-1">
                Operação Ativa
              </h3>
              {activeJob && activeContract ? (
                <div className="order-3 flex flex-col bg-white dark:bg-[#1A1F26] rounded-2xl sm:rounded-[24px] shadow-sm dark:shadow-none border border-gray-200 dark:border-[#2A2F3A] overflow-hidden mb-3 sm:mb-4">
                  {/* Header */}
                  <div className="relative overflow-hidden bg-[#1f242d] dark:bg-[#151921] p-3 sm:p-4 w-full">
                    {/* Subtle glow effect */}
                    <div className="absolute top-[-50%] right-[-10%] w-[150px] h-[150px] bg-white/5 rounded-full blur-[40px] pointer-events-none"></div>

                    <div className="flex justify-between items-start z-10 relative gap-3">
                      <div className="flex flex-col pr-2 min-w-0">
                        <span className="text-[8px] sm:text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 mt-0.5">
                          Operação atual
                        </span>
                        <h3 className="font-bold text-white text-[22px] sm:text-[26px] tracking-tight leading-none mb-1.5">
                          {activeContract.name}
                        </h3>
                        <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium leading-none truncate whitespace-nowrap">
                          Siga as especificações do transporte.
                        </p>
                      </div>

                      <div className="shrink-0 flex pt-0.5">
                        {activeJob.status === "pending" ? (
                          <span className="px-1.5 py-0.5 text-[8px] sm:text-[9px] font-semibold border border-yellow-500/20 bg-yellow-500/10 text-yellow-400 rounded-full flex items-center gap-1 whitespace-nowrap tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
                            PENDENTE
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[8px] sm:text-[9px] font-semibold border border-[#0cb49f]/20 bg-[#0cb49f]/10 text-[#0cb49f] rounded-full flex items-center gap-1 whitespace-nowrap tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#0cb49f]"></span>
                            TRABALHO ATIVO
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Content Area */}
                  <div className="p-3 pb-2 sm:p-4 sm:pb-3 flex flex-col gap-2.5">
                    {/* Buttons Row (Vehicles and Trailer) */}
                    <div className="flex flex-col gap-1.5">
                      <button className="flex items-center justify-between border border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#1f242d] rounded-[10px] py-1.5 px-3 text-left group shadow-sm dark:shadow-none cursor-default">
                        <div className="flex flex-col w-full justify-center">
                          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-0.5">
                            Veículo
                          </span>
                          <span className="text-[11px] sm:text-[12px] font-bold text-slate-800 dark:text-[#fafafa] leading-tight break-words">
                            {activeVehicle?.name || "Nenhum"}
                          </span>
                        </div>
                        <ChevronRight
                          size={14}
                          className="text-gray-300 dark:text-gray-600 shrink-0 ml-2"
                        />
                      </button>

                      <button className="flex items-center justify-between border border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#1f242d] rounded-[10px] py-1.5 px-3 text-left group shadow-sm dark:shadow-none cursor-default">
                        <div className="flex flex-col w-full justify-center">
                          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-0.5">
                            Reboque
                          </span>
                          <span className="text-[11px] sm:text-[12px] font-bold text-slate-800 dark:text-[#fafafa] leading-tight break-words">
                            {activeTrailer?.name || "Nenhum"}
                          </span>
                        </div>
                        <ChevronRight
                          size={14}
                          className="text-gray-300 dark:text-gray-600 shrink-0 ml-2"
                        />
                      </button>
                    </div>

                    {/* Metrics */}
                    <div className="border border-gray-100 dark:border-[#2A2F3A] bg-gray-50/50 dark:bg-[#1f242d] rounded-[8px] flex items-center shadow-sm dark:shadow-none mt-0.5">
                      <div className="flex-1 py-1.5 flex flex-col items-center justify-center text-center">
                        <span className="text-[14px] sm:text-[16px] font-bold text-slate-800 dark:text-gray-100 leading-none tracking-tight mb-0.5">
                          {activeJob.progress}/{activeContract.totalDeliveries}
                        </span>
                        <span className="text-[7px] sm:text-[8px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-semibold">
                          Entregas
                        </span>
                      </div>

                      <div className="w-px h-6 bg-gray-200/60 dark:bg-[#2A2F3A] shrink-0"></div>

                      <div className="flex-1 py-1.5 flex flex-col items-center justify-center text-center">
                        <span className="text-[14px] sm:text-[16px] font-bold text-slate-800 dark:text-gray-100 leading-none tracking-tight mb-0.5">
                          {Math.max(
                            0,
                            activeContract.totalDeliveries - activeJob.progress,
                          )}
                        </span>
                        <span className="text-[7px] sm:text-[8px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-semibold">
                          Faltam
                        </span>
                      </div>

                      <div className="w-px h-6 bg-gray-200/60 dark:bg-[#2A2F3A] shrink-0"></div>

                      <div className="flex-1 py-1.5 flex flex-col items-center justify-center text-center">
                        <span className="text-[14px] sm:text-[16px] font-bold text-slate-800 dark:text-gray-100 leading-none tracking-tight mb-0.5">
                          {activeContract.totalDeliveries > 0
                            ? Math.round(
                                (activeJob.progress /
                                  activeContract.totalDeliveries) *
                                  100,
                              )
                            : 0}
                          %
                        </span>
                        <span className="text-[7px] sm:text-[8px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-semibold">
                          Concluído
                        </span>
                      </div>
                    </div>

                    {/* Compact Progress bar */}
                    <div className="flex flex-col gap-1.5 mt-1 mb-0.5">
                      <div className="w-full bg-gray-100 dark:bg-[#2A2F3A] rounded-full h-1 overflow-hidden mx-auto max-w-full">
                        <div
                          className="h-full rounded-full transition-all duration-500 bg-slate-800 dark:bg-gray-300"
                          style={{
                            width: `${Math.max(3, activeContract.totalDeliveries > 0 ? Math.round((activeJob.progress / activeContract.totalDeliveries) * 100) : 0)}%`,
                          }}
                        ></div>
                      </div>
                      <p className="text-[8px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 text-center">
                        Progresso da operação
                      </p>
                    </div>
                  </div>

                  {/* Footer - Limit/Time */}
                  <div className="flex items-center justify-between border-t border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26] px-3 py-2 sm:px-4 sm:py-2.5 shrink-0 w-full overflow-hidden">
                    <div className="flex flex-1 items-center gap-2 min-w-0 pr-1">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-gray-50 dark:bg-[#2A2F3A] flex flex-shrink-0 items-center justify-center border border-gray-100 dark:border-transparent">
                        <CalendarDays
                          size={12}
                          className="text-gray-600 dark:text-gray-400"
                        />
                      </div>
                      <div className="flex flex-col min-w-0 overflow-hidden text-left">
                        <span className="text-[7px] sm:text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                          Prazo limite
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-800 dark:text-gray-200 whitespace-nowrap overflow-visible leading-none">
                          {activeJob.deadlineDate
                            ? new Date(
                                activeJob.deadlineDate,
                              ).toLocaleDateString("pt-BR")
                            : "Não definido"}
                        </span>
                      </div>
                    </div>

                    <div className="w-px h-5 bg-gray-100 dark:bg-[#2A2F3A] shrink-0 mx-1"></div>

                    <div className="flex flex-1 items-center justify-end gap-2 min-w-0 pl-1 text-right">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-gray-50 dark:bg-[#2A2F3A] flex flex-shrink-0 items-center justify-center order-1 border border-gray-100 dark:border-transparent">
                        <Clock
                          size={12}
                          className="text-gray-600 dark:text-gray-400"
                        />
                      </div>
                      <div className="flex flex-col min-w-0 overflow-hidden order-0">
                        <span className="text-[7px] sm:text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                          Tempo restante
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-800 dark:text-gray-200 whitespace-nowrap overflow-visible leading-none truncate">
                          {(() => {
                            if (!activeJob.deadlineDate) return "Não definido";
                            const diffMs =
                              new Date(activeJob.deadlineDate).getTime() -
                              new Date().getTime();
                            if (diffMs <= 0) return "Vencido";
                            const d = Math.floor(
                              diffMs / (1000 * 60 * 60 * 24),
                            );
                            const h = Math.floor(
                              (diffMs / (1000 * 60 * 60)) % 24,
                            );
                            const m = Math.floor((diffMs / 1000 / 60) % 60);
                            return `${d} dias - ${h}h - ${m}min`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-[#1A1F26] border border-slate-200/80 dark:border-white/5 border-dashed rounded-[24px] p-8 text-center shadow-sm">
                  <p className="text-[14px] text-slate-500 dark:text-slate-400 font-medium">
                    Nenhuma operação em andamento
                  </p>
                </div>
              )}
            </div>

            {/* Job History */}
            <div className="pb-6">
              <h3 className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa] mb-3 px-1">
                Histórico
              </h3>
              {filteredHistoryJobs.length > 0 ? (
                <div className="space-y-3">
                  {filteredHistoryJobs.map((job) => {
                    const contract = contractsMap.get(job.contractId);
                    const jobTrailerId = job.trailerId || contract?.trailerId;
                    const vehicle = vehiclesMap.get(job.vehicleId);
                    const trailer = jobTrailerId ? trailersMap.get(jobTrailerId) : null;

                    const parseDateSafe = (d: any): Date | null => {
                      if (!d) return null;
                      if (d.toDate && typeof d.toDate === "function")
                        return d.toDate();
                      if (d.seconds) return new Date(d.seconds * 1000);
                      const date = new Date(d);
                      if (isNaN(date.getTime())) return null;
                      return date;
                    };

                    const rawCompletedAt = parseDateSafe(job.completedAt);
                    const rawDeadline = parseDateSafe(
                      job.dueAt || job.deadlineDate,
                    );
                    const rawAssignedAt = parseDateSafe(
                      job.assignedAt || job.createdAt,
                    );
                    const isExpanded = expandedJobId === job.id;

                    const jobTrips = historicoTrips.filter((t) => {
                      if (t.jobId && t.jobId === job.id) return true;
                      if (t.contratoId !== job.contractId) return false;
                      if (t.motoristaId !== currentUser.id) return false;

                      const rawTripDate = parseDateSafe(
                        t.createdAt || t.dataLancamento,
                      );
                      const tripTime = rawTripDate ? rawTripDate.getTime() : 0;
                      const assignedTime = rawAssignedAt
                        ? rawAssignedAt.getTime()
                        : 0;
                      const completedTime = rawCompletedAt
                        ? rawCompletedAt.getTime()
                        : Date.now() + 86400000;

                      return (
                        tripTime >= assignedTime && tripTime <= completedTime
                      );
                    });

                    const totalGanhos = jobTrips.reduce((acc, curr) => {
                      let v = Number(curr.valor);
                      if (isNaN(v) && typeof curr.valor === "string") {
                        v = parseFloat(curr.valor.replace(/\D/g, "")) / 100;
                      }
                      return acc + (isNaN(v) ? 0 : v);
                    }, 0);

                    let tempoExecucao = "-";
                    let tempoRestanteOuAtraso = "-";
                    let isAtrasado = false;
                    let prazoTotal = "-";

                    if (rawAssignedAt && rawDeadline) {
                      const diffTotalMs =
                        rawDeadline.getTime() - rawAssignedAt.getTime();
                      const totalDays = Math.floor(
                        diffTotalMs / (1000 * 60 * 60 * 24),
                      );
                      prazoTotal = `${totalDays} dia${totalDays > 1 ? "s" : ""}`;
                    }

                    if (rawAssignedAt && rawCompletedAt) {
                      const diffExecMs =
                        rawCompletedAt.getTime() - rawAssignedAt.getTime();
                      const execD = Math.floor(
                        diffExecMs / (1000 * 60 * 60 * 24),
                      );
                      const execH = Math.floor(
                        (diffExecMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
                      );
                      const execM = Math.floor(
                        (diffExecMs % (1000 * 60 * 60)) / (1000 * 60),
                      );
                      tempoExecucao =
                        execD > 0
                          ? `${execD}d ${execH}h ${execM}min`
                          : `${execH}h ${execM}min`;
                    }

                    if (rawCompletedAt && rawDeadline) {
                      const diffRestMs =
                        rawDeadline.getTime() - rawCompletedAt.getTime();
                      isAtrasado = diffRestMs < 0;
                      const absRest = Math.abs(diffRestMs);
                      const restD = Math.floor(absRest / (1000 * 60 * 60 * 24));
                      const restH = Math.floor(
                        (absRest % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
                      );
                      const restM = Math.floor(
                        (absRest % (1000 * 60 * 60)) / (1000 * 60),
                      );
                      tempoRestanteOuAtraso =
                        restD > 0
                          ? `${restD}d ${restH}h ${restM}min`
                          : `${restH}h ${restM}min`;
                    }

                    return (
                      <div
                        key={job.id}
                        className={cn(
                          "bg-slate-50 dark:bg-[#1A1F26] border rounded-2xl transition-all shadow-sm overflow-hidden",
                          isExpanded
                            ? "border-slate-300 dark:border-white/20 ring-1 ring-slate-200 dark:ring-white/10"
                            : "border-slate-200/80 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10",
                        )}
                      >
                        <button
                          className="w-full flex flex-col p-4 focus:outline-none"
                          onClick={() =>
                            setExpandedJobId(isExpanded ? null : job.id)
                          }
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Check / Cross */}
                              <div
                                className={cn(
                                  "w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0 border shadow-inner",
                                  isAtrasado
                                    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50"
                                    : "bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/50",
                                )}
                              >
                                {isAtrasado ? (
                                  <X
                                    size={16}
                                    className="text-amber-600 dark:text-amber-400"
                                    strokeWidth={2.5}
                                  />
                                ) : (
                                  <Check
                                    size={16}
                                    className="text-teal-600 dark:text-teal-400"
                                    strokeWidth={2.5}
                                  />
                                )}
                              </div>

                              {/* Name and Badge */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <h4 className="text-[15px] sm:text-[16px] font-bold text-slate-900 dark:text-white truncate tracking-tight">
                                  {getNomeContratoHistorico(job, contract)}
                                </h4>
                                <span
                                  className={cn(
                                    "h-[18px] px-2 text-[9px] font-bold tracking-wide rounded-md uppercase flex items-center justify-center shrink-0 leading-none border",
                                    isAtrasado
                                      ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20"
                                      : "bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200/50 dark:border-teal-500/20",
                                  )}
                                >
                                  {isAtrasado
                                    ? "O prazo expirou"
                                    : "Dentro do prazo"}
                                </span>
                              </div>
                            </div>
                            <div className="text-slate-400 dark:text-slate-500 shrink-0 ml-2">
                              <ChevronRight
                                size={18}
                                className={cn(
                                  "transition-transform duration-300",
                                  isExpanded ? "rotate-90" : "",
                                )}
                              />
                            </div>
                          </div>

                          {/* Divider */}
                          <div className="h-px w-full bg-slate-200/80 dark:bg-white/5 my-3"></div>

                          {/* Info row */}
                          <div className="flex items-center justify-start w-full gap-x-2 sm:gap-x-4 gap-y-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Package
                                size={13}
                                className="text-gray-500 dark:text-gray-400 shrink-0"
                              />
                              <span className="text-[11px] sm:text-[11.5px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {job.progress}{" "}
                                {job.progress === 1 ? "viagem" : "viagens"}
                              </span>
                            </div>

                            <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700/60 shrink-0"></div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <Truck
                                size={13}
                                className="text-gray-500 dark:text-gray-400 shrink-0"
                              />
                              <span className="text-[11px] sm:text-[11.5px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {trailer?.name || "Nenhum"}
                              </span>
                            </div>

                            <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700/60 shrink-0"></div>

                            <div className="flex items-center gap-1.5 shrink-0 pr-1">
                              <Truck
                                size={13}
                                className="text-gray-500 dark:text-gray-400 shrink-0"
                              />
                              <span className="text-[11px] sm:text-[11.5px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {vehicle?.name || "Nenhum"}
                              </span>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="bg-gray-50 dark:bg-[#202024] rounded-xl border border-gray-100 dark:border-gray-800/60 p-2.5 mb-3 space-y-2">
                              {/* Total de Ganhos */}
                              <div className="flex items-center gap-2">
                                <Banknote
                                  size={11}
                                  className="text-green-500 dark:text-green-400 shrink-0"
                                  strokeWidth={2.5}
                                />
                                <div className="flex items-center gap-2 min-w-0 w-full">
                                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 shrink-0">
                                    Total de ganhos:
                                  </span>
                                  <span className="text-[11.5px] font-semibold text-green-600 dark:text-green-400 truncate">
                                    {formatCurrency(totalGanhos)}
                                  </span>
                                </div>
                              </div>

                              {/* Prazo total */}
                              <div className="flex items-center gap-2">
                                <CalendarDays
                                  size={11}
                                  className="text-gray-400 dark:text-gray-500 shrink-0"
                                  strokeWidth={2.5}
                                />
                                <div className="flex items-center gap-2 min-w-0 w-full">
                                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 shrink-0">
                                    Prazo total:
                                  </span>
                                  <span className="text-[11.5px] font-semibold text-gray-900 dark:text-[#fafafa] truncate">
                                    {prazoTotal}
                                  </span>
                                </div>
                              </div>

                              {/* Execução */}
                              <div className="flex items-center gap-2">
                                <Clock
                                  size={11}
                                  className="text-gray-400 dark:text-gray-500 shrink-0"
                                  strokeWidth={2.5}
                                />
                                <div className="flex items-center gap-2 min-w-0 w-full">
                                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 shrink-0">
                                    Execução:
                                  </span>
                                  <span className="text-[11.5px] font-semibold text-gray-900 dark:text-[#fafafa] truncate">
                                    {tempoExecucao}
                                  </span>
                                </div>
                              </div>

                              {/* Tempo restante / Atraso */}
                              <div className="flex items-center gap-2">
                                <Hourglass
                                  size={11}
                                  className={cn(
                                    "shrink-0",
                                    isAtrasado
                                      ? "text-red-500 dark:text-red-400"
                                      : "text-gray-400 dark:text-gray-500",
                                  )}
                                  strokeWidth={2.5}
                                />
                                <div className="flex items-center gap-2 min-w-0 w-full">
                                  <span
                                    className={cn(
                                      "text-[10px] font-medium shrink-0",
                                      isAtrasado
                                        ? "text-red-600/80 dark:text-red-400/80"
                                        : "text-gray-500 dark:text-gray-400",
                                    )}
                                  >
                                    {isAtrasado ? "Atraso:" : "Tempo restante:"}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[11.5px] font-semibold truncate",
                                      isAtrasado
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-gray-900 dark:text-[#fafafa]",
                                    )}
                                  >
                                    {tempoRestanteOuAtraso}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Result Message */}
                            <div
                              className={cn(
                                "flex items-center gap-2 rounded-xl px-3 py-2 border",
                                isAtrasado
                                  ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20"
                                  : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20",
                              )}
                            >
                              <div
                                className={cn(
                                  "shrink-0 w-[17px] h-[17px] rounded-full flex items-center justify-center",
                                  isAtrasado
                                    ? "bg-amber-200/50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                    : "bg-emerald-200/50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
                                )}
                              >
                                {isAtrasado ? (
                                  <X size={10} strokeWidth={3} />
                                ) : (
                                  <Check size={10} strokeWidth={3} />
                                )}
                              </div>
                              <div className="flex flex-col justify-center">
                                <h4
                                  className={cn(
                                    "text-[12px] font-semibold mb-0.5 tracking-tight leading-none",
                                    isAtrasado
                                      ? "text-amber-800 dark:text-amber-500"
                                      : "text-emerald-800 dark:text-emerald-500",
                                  )}
                                >
                                  Resultado da operação
                                </h4>
                                <p
                                  className={cn(
                                    "text-[10px] font-normal leading-tight",
                                    isAtrasado
                                      ? "text-amber-700/80 dark:text-amber-400/80"
                                      : "text-emerald-700/80 dark:text-emerald-400/80",
                                  )}
                                >
                                  {isAtrasado
                                    ? "Não foi concluído no prazo estabelecido."
                                    : "Dentro do prazo estabelecido."}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-[#1A1F26] border border-slate-200/80 dark:border-white/5 border-dashed rounded-[24px] p-8 text-center shadow-sm">
                  <p className="text-[14px] text-slate-500 dark:text-slate-400 font-medium">
                    Nenhum histórico disponível
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "dashboard" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Dashboard isIntegrated={true} />
          </div>
        )}

        <ProfileModal
          isOpen={isEditProfileOpen}
          onClose={() => setIsEditProfileOpen(false)}
        />
      </div>
    </div>
  );
}
