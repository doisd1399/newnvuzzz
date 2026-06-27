import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAppStore } from "../../context/AppContext";
import { Button } from "../../components/ui/Button";
import { DriverPerformanceCard } from "../../components/DriverPerformanceCard";
import { getJobRealTimestamp } from "../../lib/utils";
import { getDriverLevelData } from "../../lib/levelUtils";
import {
  ArrowLeft,
  CheckCircle,
  Truck,
  Car,
  Info,
  Phone,
  Mail,
  Building2,
  Gamepad2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  ShieldCheck,
  Package,
  Trash2,
  Trophy,
  Navigation,
  Wallet,
  Award,
  Sparkles,
  AlertTriangle,
  Banknote,
  CalendarDays,
  Hourglass,
  X,
  Check,
} from "lucide-react";
import { cn } from "../../lib/utils";

export default function DriverProfileIsolated() {
  const { id: driverId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (location.state && location.state.returnUrl) {
      navigate(location.state.returnUrl, { state: location.state.returnState });
    } else {
      navigate(-1);
    }
  };

  const {
    users,
    jobs,
    contracts,
    vehicles,
    trailers,
    companies,
    activeCompanyId,
    allCompanyMembers,
    deleteJob,
    historicoTrips,
  } = useAppStore();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);

  const driver = users.find((u) => u.id === driverId);
  if (!driver) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Motorista não encontrado.</p>
          <Button onClick={handleBack} variant="outline">
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  // Find which company this driver belongs to
  const driverMembership = allCompanyMembers?.find(
    (m) => m.userId === driverId && m.status === "active",
  );

  const driverCompany = driverMembership
    ? companies.find((c) => c.id === driverMembership.companyId)
    : null;

  const resolvedCompany =
    driverCompany ||
    (driver?.companyId
      ? companies.find((c) => c.id === driver.companyId)
      : null) ||
    (activeCompanyId ? companies.find((c) => c.id === activeCompanyId) : null);

  // Active job logic
  const validActiveJobs = jobs.filter(
    (j) =>
      j.driverId === driverId &&
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

  // Historical jobs logic (only completed ones)
  const allDriverJobs = jobs.filter(
    (j) => j.driverId === driverId && j.id !== activeJob?.id,
  );
  const pastJobs = allDriverJobs.filter((j) => j.status === "completed").sort((a, b) => {
    const tsA = getJobRealTimestamp(a, historicoTrips);
    const tsB = getJobRealTimestamp(b, historicoTrips);
    
    if (tsB !== tsA) {
      return tsB - tsA;
    }
    
    const contractA = contracts.find((c) => c.id === a.contractId)?.name || "";
    const contractB = contracts.find((c) => c.id === b.contractId)?.name || "";
    return contractA.localeCompare(contractB);
  });

  const levelData = getDriverLevelData(driverId as string, jobs, contracts, historicoTrips);
  const displayLevel = levelData.displayLevel;
  const currentLevelXp = levelData.currentLevelXp;
  const xpProgress = levelData.xpProgress;

  const totalGanhos = historicoTrips
    .filter((t) => t.motoristaId === driverId)
    .reduce((acc, t) => acc + (Number(t.valor) || 0), 0);
  
  const totalViagens = historicoTrips.filter((t) => t.motoristaId === driverId).length;

  const [globalRank, setGlobalRank] = useState<{ position: number; total: number } | null>(null);

  useEffect(() => {
    if (!resolvedCompany?.simulatorName || !driverId) return;

    const targetSimulator = resolvedCompany.simulatorName || "Global Truck";
    const simulatorCompanies = new Set(
      companies.filter((c) => (c.simulatorName || "Global Truck") === targetSimulator).map((c) => c.id)
    );

    const q = query(collection(db, "historico_viagens"));
    const membersQ = query(collection(db, "companyMembers"));

    let unsubTrips: () => void;
    let unsubMembers: () => void;

    unsubTrips = onSnapshot(q, (snap) => {
      const earningsByDriver: Record<string, number> = {};
      
      snap.docs.forEach((doc) => {
        const data = doc.data();
        if (simulatorCompanies.has(data.empresaId)) {
          const mId = data.motoristaId;
          const valor = Number(data.valor) || 0;
          earningsByDriver[mId] = (earningsByDriver[mId] || 0) + valor;
        }
      });

      unsubMembers = onSnapshot(membersQ, (memSnap) => {
        const driversInSimulator = new Set<string>();
        memSnap.docs.forEach((md) => {
          const mData = md.data();
          if (simulatorCompanies.has(mData.companyId)) {
            driversInSimulator.add(mData.userId);
          }
        });

        Object.keys(earningsByDriver).forEach((dId) => driversInSimulator.add(dId));
        driversInSimulator.add(driverId!);

        const leaderboard = Array.from(driversInSimulator).map((dId) => ({
          id: dId,
          ganhos: earningsByDriver[dId] || 0,
        }));

        leaderboard.sort((a, b) => b.ganhos - a.ganhos);

        const pos = leaderboard.findIndex((item) => item.id === driverId);
        if (pos !== -1) {
          setGlobalRank({
            position: pos + 1,
            total: leaderboard.length,
          });
        } else {
          setGlobalRank(null);
        }
      });
    });

    return () => {
      if (unsubTrips) unsubTrips();
      if (unsubMembers) unsubMembers();
    };
  }, [resolvedCompany, companies, driverId]);

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return "-";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  const isDriverActive = driver.status === "active";

  const onAssignJob = () => {
    navigate("/admin/assign", {
      state: {
        preselectedDriverId: driverId,
      },
    });
  };

  const onViewJob = (jobId: string) => {
    navigate("/admin/fleet", {
      state: { preselectedJobId: jobId },
    });
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6 w-full animate-in fade-in duration-300 pb-8">
      {/* Header com Botão Voltar */}
      <div className="flex items-center gap-3 border-b border-slate-100 dark:border-[#2A2F3A] pb-3">
        <button
          onClick={handleBack}
          className="w-8 h-8 rounded-lg bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-[#a1a1aa] dark:hover:text-[#fafafa] hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-all shadow-sm shrink-0"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex flex-col justify-center translate-y-[1px]">
          <h1 className="text-[16px] font-bold text-slate-900 dark:text-[#fafafa] tracking-tight leading-none mb-1">
            Perfil do Motorista
          </h1>
          <p className="text-[12px] text-slate-500 dark:text-[#a1a1aa] font-medium leading-none">
            Visão geral e desempenho
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Profile Header (Corp Card Style) */}
        <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[16px] p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-3 shadow-sm relative z-30 w-full box-border overflow-visible">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto flex-1">
            <div className="w-12 h-12 bg-slate-900 dark:bg-[#2A2F3A] rounded-xl overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-[#3A3F4A] shadow-sm relative">
              {driver.avatar || driver.photoURL ? (
                <img
                  src={driver.avatar || driver.photoURL}
                  alt={driver.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-xl font-bold text-white tracking-tighter">
                  {driver.name.substring(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5 w-full">
                <h2 className="text-[15px] sm:text-[16px] font-bold text-slate-900 dark:text-white leading-tight truncate">
                  {driver.name}
                </h2>
                <ShieldCheck
                  size={14}
                  className="text-blue-500 shrink-0"
                  fill="currentColor"
                />
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate">
                {driver.roles?.includes("admin")
                  ? "Administrador"
                  : "Motorista Parceiro"}
              </p>
            </div>
          </div>

          <div className="flex items-center sm:pl-4 sm:border-l border-slate-200 dark:border-[#2A2F3A] shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 mt-2 sm:mt-0 relative z-20">
            <div className="flex flex-col relative w-full sm:w-[180px]">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1">
                Empresa
              </span>
              <div
                className="flex items-center justify-between gap-1.5 bg-slate-50 dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] shadow-sm rounded-[10px] px-2.5 py-1.5 w-full cursor-default"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building2
                    size={14}
                    className="text-slate-500 dark:text-slate-400 shrink-0"
                  />
                  <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {resolvedCompany
                      ? `${resolvedCompany.companyName} * ${resolvedCompany.simulatorName || "Global Truck"}`
                      : "Nenhuma"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DriverPerformanceCard 
          historicoTrips={historicoTrips}
          driverId={driverId as string}
          activeCompanyId={activeCompanyId}
          allCompanyMembers={allCompanyMembers}
          posicaoRanking={globalRank?.position || "--"}
          totalRanking={globalRank?.total || "--"}
          currentUser={driver}
        />

        {/* Premium Dashboard Stats Card */}
        <div className="relative w-full rounded-[24px] p-4 sm:p-5 bg-white/60 dark:bg-[#0A0D14]/80 backdrop-blur-3xl border border-white/40 dark:border-[#1E2336]/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          
          {/* Layered Lighting Effects */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent"></div>
          <div className="absolute top-[-100px] left-[-100px] w-64 h-64 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-[80px] pointer-events-none"></div>

          {/* Ranking Global Row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                {/* Premium Trophy Glow */}
                <div className="absolute inset-0 bg-amber-500 blur-[12px] opacity-20 dark:opacity-30 rounded-full"></div>
                <div className="relative w-[42px] h-[42px] rounded-[12px] bg-gradient-to-b from-amber-50 to-white dark:from-[#211B10] dark:to-[#120E08] border border-amber-200/60 dark:border-amber-700/30 flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0px_rgba(255,255,255,0.05)]">
                  <Trophy className="w-[20px] h-[20px] text-amber-500 dark:text-amber-400 [filter:drop-shadow(0_2px_4px_rgba(245,158,11,0.4))]" />
                </div>
              </div>
              <div className="flex flex-col">
                <h3 className="text-[16px] font-semibold text-slate-800 dark:text-[#E2E8F0] tracking-tight">Ranking Global</h3>
                <span className="text-[12px] font-normal text-slate-500 dark:text-[#8B91A3]">Baseado em ganhos acumulados</span>
              </div>
            </div>
            
            <div className="relative group">
              <div className="relative flex items-baseline px-3 py-1.5 bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-[#181A20] dark:to-[#111317] border border-slate-200/60 dark:border-[#272B36] shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] rounded-[10px]">
                <span className="text-[18px] font-bold text-amber-600 dark:text-[#FBBF24] tabular-nums tracking-tight">
                  {globalRank ? `${globalRank.position}º` : "--"}
                </span>
                <span className="text-[13px] font-medium text-slate-400 dark:text-[#646A7E] ml-1">
                  / {globalRank ? new Intl.NumberFormat("pt-BR").format(globalRank.total) : "--"}
                </span>
                <Sparkles className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 text-amber-400 dark:text-[#FBBF24] opacity-80" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 mb-4">
            {/* Total Viagens Block */}
            <div className="flex items-center justify-between px-3.5 py-3 bg-slate-50/50 dark:bg-[#12141A] border border-slate-200/50 dark:border-white/[0.04] rounded-[14px] shadow-sm dark:shadow-none hover:bg-slate-50 dark:hover:bg-[#15171E] transition-colors">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-[10px] bg-indigo-50/80 dark:bg-[#1A1C29] border border-indigo-100/50 dark:border-indigo-500/10 flex items-center justify-center shadow-inner">
                  <Navigation className="w-[18px] h-[18px] text-indigo-600 dark:text-[#818CF8]" />
                </div>
                <span className="text-[14px] font-semibold tracking-tight text-slate-700 dark:text-[#D1D5DB]">Total de Viagens</span>
              </div>
              <div className="px-3 py-1.5 rounded-[10px] bg-white/80 dark:bg-[#0B0C10] border border-slate-200/50 dark:border-white/[0.03] shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)] dark:shadow-[inset_0_1px_1px_rgba(0,0,0,0.2)]">
                <span className="text-[16px] font-bold text-indigo-600 dark:text-[#A5B4FC] tabular-nums tracking-tight">{totalViagens}</span>
              </div>
            </div>

            {/* Total Ganhos Block */}
            <div className="flex items-center justify-between px-3.5 py-3 bg-slate-50/50 dark:bg-[#12141A] border border-slate-200/50 dark:border-white/[0.04] rounded-[14px] shadow-sm dark:shadow-none hover:bg-slate-50 dark:hover:bg-[#15171E] transition-colors">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-[10px] bg-emerald-50/80 dark:bg-[#121D18] border border-emerald-100/50 dark:border-emerald-500/10 flex items-center justify-center shadow-inner">
                  <Wallet className="w-[18px] h-[18px] text-emerald-600 dark:text-[#34D399]" />
                </div>
                <span className="text-[14px] font-semibold tracking-tight text-slate-700 dark:text-[#D1D5DB]">Total de Ganhos</span>
              </div>
              <div className="px-3 py-1.5 rounded-[10px] bg-[#F0FDF4]/80 dark:bg-[#061B12] border border-emerald-200/30 dark:border-emerald-500/20 shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)] dark:shadow-[inset_0_1px_1px_rgba(0,0,0,0.2)]">
                <span className="text-[15px] font-semibold tracking-tight text-emerald-700 dark:text-[#34D399] tabular-nums">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalGanhos)}
                </span>
              </div>
            </div>
          </div>
          
          {/* Nível Block */}
          <div className="relative p-4 sm:p-5 bg-gradient-to-b from-slate-50 to-slate-100/30 dark:from-[#13151D] dark:to-[#0F1118] border border-slate-200/60 dark:border-purple-500/10 rounded-[20px] overflow-hidden shadow-sm dark:shadow-none">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-100/40 via-transparent to-transparent dark:from-purple-900/10 dark:via-transparent dark:to-transparent pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-3.5">
                {/* Holographic Medal Icon */}
                <div className="relative w-[46px] h-[46px]">
                  <div className="absolute inset-0 bg-purple-500/20 blur-[10px] rounded-[14px]"></div>
                  <div className="relative w-full h-full bg-gradient-to-tr from-white to-purple-50 dark:from-[#1E1935] dark:to-[#161226] border border-purple-200/60 dark:border-purple-500/30 rounded-[14px] flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0px_rgba(255,255,255,0.05)]">
                     <Award className="w-6 h-6 text-purple-600 dark:text-[#C084FC] [filter:drop-shadow(0_1px_2px_rgba(192,132,252,0.4))]" />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-slate-800 dark:text-[#F3F4F6] tracking-tight">Nível do Motorista</span>
                  <div className="inline-flex w-fit items-center px-2 py-0.5 rounded-[6px] bg-purple-100/60 dark:bg-purple-900/30 border border-purple-200/50 dark:border-purple-500/20">
                    <span className="text-[11px] font-bold text-purple-700 dark:text-[#D8B4FE] tracking-wider">
                      NÍVEL {displayLevel}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Circular Progress Indicator - Refined */}
              <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                {/* Background Ring */}
                <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                  <circle cx="28" cy="28" r="26" fill="none" strokeWidth="2.5" className="stroke-slate-200/60 dark:stroke-white/[0.04]" />
                  <circle 
                    cx="28" cy="28" r="26" fill="none" strokeWidth="2.5" 
                    strokeDasharray="163.36" 
                    strokeDashoffset={163.36 - (163.36 * Math.max(0, Math.min(100, xpProgress))) / 100} 
                    strokeLinecap="round" 
                    className="stroke-purple-500 dark:stroke-[#A855F7] transition-all duration-1000 ease-out drop-shadow-[0_0_3px_rgba(168,85,247,0.4)] dark:drop-shadow-[0_0_5px_rgba(168,85,247,0.6)]" 
                  />
                </svg>
                <div className="flex flex-col items-center justify-center z-10 text-center">
                  <span className="text-[14px] font-bold text-slate-800 dark:text-[#F3F4F6] tracking-tight">{Math.round(xpProgress)}%</span>
                </div>
              </div>
            </div>
            
            <div className="relative z-10 flex flex-col gap-2">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[12px] font-medium text-slate-500 dark:text-[#A1A1AA]">
                  <span className="font-bold text-purple-700 dark:text-[#D8B4FE] tracking-tight">{Math.floor(currentLevelXp)} XP</span> de 1000 XP
                </span>
              </div>
              
              {/* XP Bar (Thinner & Rounded) */}
              <div className="w-full h-[6px] bg-slate-200/70 dark:bg-[#1A1C27] rounded-full overflow-hidden shadow-[inset_0_1px_1px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_1px_rgba(0,0,0,0.2)]">
                <div 
                  className="h-full bg-gradient-to-r from-[#9333EA] to-[#6366F1] dark:from-[#A855F7] dark:to-[#818CF8] relative transition-all duration-1000 ease-out rounded-full" 
                  style={{ width: `${Math.max(2, xpProgress)}%` }}
                >
                  <div className="absolute top-0 bottom-0 right-0 w-6 bg-white/40 blur-[1px] rounded-full"></div>
                </div>
              </div>

              {/* Minimalist target text replacing the bottom box */}
              <div className="flex items-center gap-1.5 mt-1.5 px-0.5">
                <Award className="w-[12px] h-[12px] text-purple-400 dark:text-[#C084FC]" />
                <span className="text-[12px] font-medium text-slate-500 dark:text-[#8B91A3]">
                  Faltam <strong className="text-purple-600 dark:text-[#D8B4FE] font-semibold">{1000 - Math.floor(currentLevelXp)} XP</strong> para o Nível {displayLevel + 1}
                </span>
              </div>
            </div>
            
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              className="flex items-center justify-center gap-2 py-2.5 bg-gray-100 dark:bg-[#2A2F3A] hover:bg-gray-200 dark:hover:bg-[#3A3F4A] text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-[13px] transition-colors shadow-sm"
              onClick={() => setIsInfoOpen(!isInfoOpen)}
            >
              <Info size={16} />
              {isInfoOpen ? "Ocultar Info" : "Ver Informações"}
            </button>
            <button
              disabled={!!activeJob || !isDriverActive}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-[13px] transition-colors shadow-sm w-full",
                !activeJob && isDriverActive
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-100 dark:bg-[#18181b] text-gray-400 cursor-not-allowed"
              )}
              onClick={onAssignJob}
            >
              <Package size={16} />
              Designar Operação
            </button>
          </div>
        </div>

        {/* Driver Details Info Card */}
        {isInfoOpen && (
          <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[16px] p-4 sm:p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
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
                    {driver.email || "Não informado"}
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
                    {driver.whatsapp || "Não informado"}
                  </p>
                </div>
              </div>
              {resolvedCompany && (
                <div className="flex items-center gap-3 sm:col-span-2">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 dark:border-purple-500/20 flex items-center justify-center shrink-0">
                    <Building2
                      size={16}
                      className="text-purple-600 dark:text-purple-400"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Vínculo Ativo
                    </p>
                    <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                      {resolvedCompany.companyName || "Carregando..."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Job Section */}
        <div>
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-[#fafafa] mb-3 px-1">
            Operação Ativa
          </h3>
          {activeJob && activeContract ? (
            <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-[20px] p-5 shadow-sm dark:shadow-none">
              <div className="flex justify-between items-start mb-5 gap-4">
                <div className="min-w-0">
                  <h4 className="font-bold text-[16px] text-gray-900 dark:text-[#fafafa] tracking-tight truncate">
                    {activeContract.name}
                  </h4>
                  <div className="flex items-center flex-wrap gap-2 mt-2">
                    {activeVehicle && (
                      <span className="text-[13px] font-medium text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5">
                        <Car size={14} className="text-gray-400" />{" "}
                        {activeVehicle.name}
                      </span>
                    )}
                    {activeTrailer && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600">
                          •
                        </span>
                        <span className="text-[13px] font-medium text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5">
                          <Truck size={14} className="text-gray-400" />{" "}
                          {activeTrailer.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onViewJob(activeJob.id)}
                  className="h-9 px-4 bg-gray-50 dark:bg-[#2A2F3A] hover:bg-gray-100 dark:hover:bg-[#3f3f46] text-gray-700 dark:text-[#d4d4d8] text-[13px] font-bold border border-gray-200 dark:border-[#3A3F4A] rounded-xl shrink-0"
                >
                  Detalhes
                </Button>
              </div>

              <div className="pt-2">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-[14px] font-bold text-gray-900 dark:text-[#fafafa]">
                    {activeJob.progress}{" "}
                    <span className="text-gray-400 font-semibold">
                      / {activeContract.totalDeliveries} entregas
                    </span>
                  </span>
                  <span className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa]">
                    {activeContract.totalDeliveries > 0
                      ? Math.round(
                          (activeJob.progress /
                            activeContract.totalDeliveries) *
                            100,
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-[#27272a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#00D1FF] shadow-[0_0_10px_rgba(0,209,255,0.4)] rounded-full"
                    style={{
                      width: `${activeContract.totalDeliveries > 0 ? Math.round((activeJob.progress / activeContract.totalDeliveries) * 100) : 0}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] border-dashed rounded-[20px] p-8 text-center shadow-sm dark:shadow-none">
              <p className="text-[15px] text-gray-500 dark:text-[#a1a1aa] font-medium">
                Nenhuma operação em andamento
              </p>
            </div>
          )}
        </div>

        {/* Job History */}
        <div>
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-[#fafafa] mb-3 px-1">
            Histórico
          </h3>
          {pastJobs.length > 0 ? (
            <div className="space-y-3">
              {pastJobs.map((job) => {
                  const contract = contracts.find(
                    (c) => c.id === job.contractId,
                  );
                  const jobTrailerId = job.trailerId || contract?.trailerId;
                  const vehicle = vehicles.find((v) => v.id === job.vehicleId);
                  const trailer = jobTrailerId
                    ? trailers.find((t) => t.id === jobTrailerId)
                    : null;

                  const parseDateSafe = (d: any): Date | null => {
                    if (!d) return null;
                    if (d.toDate && typeof d.toDate === "function") return d.toDate();
                    if (d.seconds) return new Date(d.seconds * 1000);
                    const date = new Date(d);
                    if (isNaN(date.getTime())) return null;
                    return date;
                  };

                  const rawCompletedAt = parseDateSafe(job.completedAt);
                  const rawDeadline = parseDateSafe(job.dueAt || job.deadlineDate);
                  const rawAssignedAt = parseDateSafe(job.assignedAt || job.createdAt);
                  const isExpanded = expandedJobId === job.id;

                  const jobTrips = historicoTrips.filter(t => {
                    if (t.jobId && t.jobId === job.id) return true;
                    if (t.contratoId !== job.contractId) return false;
                    if (t.motoristaId !== driverId) return false;
                    
                    const rawTripDate = parseDateSafe(t.createdAt || t.dataLancamento);
                    const tripTime = rawTripDate ? rawTripDate.getTime() : 0;
                    const assignedTime = rawAssignedAt ? rawAssignedAt.getTime() : 0;
                    const completedTime = rawCompletedAt ? rawCompletedAt.getTime() : Date.now() + 86400000;
                    
                    return tripTime >= assignedTime && tripTime <= completedTime;
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
                    const diffTotalMs = rawDeadline.getTime() - rawAssignedAt.getTime();
                    const totalDays = Math.floor(diffTotalMs / (1000 * 60 * 60 * 24));
                    prazoTotal = `${totalDays} dia${totalDays > 1 ? "s" : ""}`;
                  }
                  
                  if (rawAssignedAt && rawCompletedAt) {
                    const diffExecMs = rawCompletedAt.getTime() - rawAssignedAt.getTime();
                    const execD = Math.floor(diffExecMs / (1000 * 60 * 60 * 24));
                    const execH = Math.floor((diffExecMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const execM = Math.floor((diffExecMs % (1000 * 60 * 60)) / (1000 * 60));
                    tempoExecucao = execD > 0 ? `${execD}d ${execH}h ${execM}min` : `${execH}h ${execM}min`;
                  }
                  
                  if (rawCompletedAt && rawDeadline) {
                    const diffRestMs = rawDeadline.getTime() - rawCompletedAt.getTime();
                    isAtrasado = diffRestMs < 0;
                    const absRest = Math.abs(diffRestMs);
                    const restD = Math.floor(absRest / (1000 * 60 * 60 * 24));
                    const restH = Math.floor((absRest % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const restM = Math.floor((absRest % (1000 * 60 * 60)) / (1000 * 60));
                    tempoRestanteOuAtraso = restD > 0 ? `${restD}d ${restH}h ${restM}min` : `${restH}h ${restM}min`;
                  }

                  return (
                    <div
                      key={job.id}
                      className={cn(
                        "bg-white dark:bg-[#1A1F26] border rounded-2xl transition-all shadow-sm dark:shadow-none overflow-hidden",
                        isExpanded
                          ? "border-gray-300 dark:border-gray-600 ring-1 ring-gray-200 dark:ring-gray-700 block"
                          : "border-gray-100 dark:border-[#2A2F3A] hover:border-gray-200 dark:hover:border-gray-700",
                      )}
                    >
                      <button
                        className="w-full flex flex-col p-3 focus:outline-none"
                        onClick={() =>
                          setExpandedJobId(isExpanded ? null : job.id)
                        }
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Check / Cross */}
                            <div className={cn(
                              "w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0",
                              isAtrasado
                                ? "bg-amber-100 dark:bg-amber-500/20"
                                : "bg-emerald-100 dark:bg-emerald-500/20"
                            )}>
                              {isAtrasado 
                                ? <X size={16} className="text-amber-600 dark:text-amber-400" strokeWidth={3} />
                                : <Check size={16} className="text-emerald-600 dark:text-emerald-400" strokeWidth={3} />}
                            </div>
                            
                            {/* Name and Badge */}
                            <div className="flex items-center gap-2.5 min-w-0">
                              <h4 className="text-[15px] sm:text-[16px] font-semibold text-gray-900 dark:text-[#fafafa] truncate">
                                {contract?.name || "Contrato"}
                              </h4>
                              <span className={cn(
                                "h-[16px] px-1.5 text-[9px] font-bold tracking-wide rounded uppercase flex items-center justify-center shrink-0 leading-none",
                                isAtrasado 
                                  ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400" 
                                  : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                              )}>
                                {isAtrasado ? "O prazo expirou" : "Dentro do prazo"}
                              </span>
                            </div>
                          </div>
                          <div className="text-gray-400 dark:text-gray-500 shrink-0 ml-2">
                            {isExpanded ? (
                              <ChevronUp size={18} />
                            ) : (
                              <ChevronDown size={18} />
                            )}
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="h-px w-full bg-gray-100 dark:bg-gray-800/60 my-2.5"></div>

                        {/* Info row */}
                        <div className="flex items-center justify-start w-full gap-x-2 sm:gap-x-4 gap-y-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Package size={13} className="text-gray-500 dark:text-gray-400 shrink-0" />
                            <span className="text-[11px] sm:text-[11.5px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {job.progress} {job.progress === 1 ? "viagem" : "viagens"}
                            </span>
                          </div>
                          
                          <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700/60 shrink-0"></div>
                          
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Truck size={13} className="text-gray-500 dark:text-gray-400 shrink-0" />
                            <span className="text-[11px] sm:text-[11.5px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {trailer?.name || "Nenhum"}
                            </span>
                          </div>
                          
                          <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700/60 shrink-0"></div>
                          
                          <div className="flex items-center gap-1.5 shrink-0 pr-1">
                            <Car size={13} className="text-gray-500 dark:text-gray-400 shrink-0" />
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
                              <Banknote size={11} className="text-green-500 dark:text-green-400 shrink-0" strokeWidth={2.5}/>
                              <div className="flex items-center gap-2 min-w-0 w-full">
                                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 shrink-0">Total de ganhos:</span>
                                <span className="text-[11.5px] font-semibold text-green-600 dark:text-green-400 truncate">
                                  {formatCurrency(totalGanhos)}
                                </span>
                              </div>
                            </div>

                            {/* Prazo total */}
                            <div className="flex items-center gap-2">
                              <CalendarDays size={11} className="text-gray-400 dark:text-gray-500 shrink-0" strokeWidth={2.5}/>
                              <div className="flex items-center gap-2 min-w-0 w-full">
                                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 shrink-0">Prazo total:</span>
                                <span className="text-[11.5px] font-semibold text-gray-900 dark:text-[#fafafa] truncate">
                                  {prazoTotal}
                                </span>
                              </div>
                            </div>

                            {/* Execução */}
                            <div className="flex items-center gap-2">
                              <Clock size={11} className="text-gray-400 dark:text-gray-500 shrink-0" strokeWidth={2.5}/>
                              <div className="flex items-center gap-2 min-w-0 w-full">
                                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 shrink-0">Execução:</span>
                                <span className="text-[11.5px] font-semibold text-gray-900 dark:text-[#fafafa] truncate">
                                  {tempoExecucao}
                                </span>
                              </div>
                            </div>

                            {/* Tempo restante / Atraso */}
                            <div className="flex items-center gap-2">
                              <Hourglass size={11} className={cn("shrink-0", isAtrasado ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-gray-500")} strokeWidth={2.5}/>
                              <div className="flex items-center gap-2 min-w-0 w-full">
                                <span className={cn("text-[10px] font-medium shrink-0", isAtrasado ? "text-red-600/80 dark:text-red-400/80" : "text-gray-500 dark:text-gray-400")}>
                                  {isAtrasado ? 'Atraso:' : 'Tempo restante:'}
                                </span>
                                <span className={cn("text-[11.5px] font-semibold truncate", isAtrasado ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-[#fafafa]")}>
                                  {tempoRestanteOuAtraso}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Result Message */}
                          <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2 border mb-3", isAtrasado ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20" : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20")}>
                            <div className={cn("shrink-0 w-[17px] h-[17px] rounded-full flex items-center justify-center", isAtrasado ? "bg-amber-200/50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-emerald-200/50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400")}>
                              {isAtrasado ? <X size={10} strokeWidth={3} /> : <Check size={10} strokeWidth={3} />}
                            </div>
                            <div className="flex flex-col justify-center">
                              <h4 className={cn("text-[12px] font-semibold mb-0.5 tracking-tight leading-none", isAtrasado ? "text-amber-800 dark:text-amber-500" : "text-emerald-800 dark:text-emerald-500")}>Resultado da operação</h4>
                              <p className={cn("text-[10px] font-normal leading-tight", isAtrasado ? "text-amber-700/80 dark:text-amber-400/80" : "text-emerald-700/80 dark:text-emerald-400/80")}>
                                {isAtrasado 
                                  ? "Não foi concluído no prazo estabelecido."
                                  : "Dentro do prazo estabelecido."}
                              </p>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-gray-100 dark:border-gray-800/60">
                            <button
                              className="w-full h-8 px-4 text-[11px] font-semibold text-red-600 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 hover:bg-red-100 dark:bg-red-500/20 border-none shadow-none rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setJobToDelete(job.id);
                              }}
                            >
                              <Trash2 size={14} />
                              Excluir do Histórico
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-[20px] p-8 text-center shadow-sm dark:shadow-none border-dashed">
              <p className="text-[14px] text-gray-500 dark:text-[#a1a1aa] font-medium">
                Nenhum histórico disponível
              </p>
            </div>
          )}
        </div>
      </div>

      {jobToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1A1F26] rounded-2xl shadow-xl w-full max-w-[320px] p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-500/20 text-red-600 rounded-full flex items-center justify-center mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-[#fafafa] mb-2">Excluir do Histórico?</h3>
            <p className="text-[13px] text-gray-500 dark:text-[#a1a1aa] mb-6">
              Esta ação removerá o contrato do histórico do motorista. Não afetará as estatísticas globais, apenas este registro.
            </p>
            <div className="flex items-center gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1 h-10 border-gray-200 dark:border-[#2A2F3A] hover:bg-gray-50 dark:hover:bg-[#3f3f46] text-gray-700 dark:text-[#d4d4d8] font-semibold text-[13px]"
                onClick={() => setJobToDelete(null)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white font-semibold text-[13px]"
                onClick={() => {
                  deleteJob(jobToDelete);
                  setExpandedJobId(null);
                  setJobToDelete(null);
                }}
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
