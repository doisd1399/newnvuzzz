import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Dashboard from "./Dashboard";
import { useAppStore } from "../../context/AppContext";
import { Button } from "../../components/ui/Button";
import {
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
} from "lucide-react";
import { cn } from "../../lib/utils";
import { ProfileModal } from "../../components/ProfileModal";

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
    memberships,
  } = useAppStore();
  const [isSimulatorMenuOpen, setIsSimulatorMenuOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<
    "all" | "7d" | "15d" | "custom"
  >("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const [isPageSelectorOpen, setIsPageSelectorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "profile">(
    "dashboard",
  );

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

  // Historical jobs logic (only completed ones)
  const allDriverJobs = jobs.filter(
    (j) => j.driverId === currentUser.id && j.id !== activeJob?.id,
  );
  const pastJobs = allDriverJobs.filter((j) => j.status === "completed");

  const filteredPastJobs = pastJobs.filter((job) => {
    if (periodFilter === "all") return true;

    const dateStr =
      job.completedAt || job.createdAt || new Date().toISOString();
    const jobDate = new Date(dateStr);

    if (periodFilter === "7d") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return jobDate >= sevenDaysAgo;
    }

    if (periodFilter === "15d") {
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
      return jobDate >= fifteenDaysAgo;
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
  });

  const displayDeliveries =
    filteredPastJobs.reduce((acc, job) => acc + job.progress, 0) +
    (periodFilter === "all" && activeJob ? activeJob.progress : 0);
  const displayCompleted = filteredPastJobs.length;

  const totalAllTimeDeliveries =
    pastJobs.reduce((acc, job) => acc + job.progress, 0) +
    (activeJob ? activeJob.progress : 0);
  const xp = totalAllTimeDeliveries * 150 + pastJobs.length * 50;
  const calculatedLevel = Math.floor(xp / 1000) + 1;
  const displayLevel = calculatedLevel;
  const currentLevelXp = xp % 1000;
  const xpProgress = (currentLevelXp / 1000) * 100;

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

  const currentActiveCompany = activeCompanyId
    ? companies.find((c) => c.id === activeCompanyId)
    : null;
  const currentMembership = activeCompanyId
    ? currentUser.memberships?.[activeCompanyId] ||
      memberships.find((m) => m.companyId === activeCompanyId)
    : null;
  const currentFormattedDate = (currentMembership as any)?.joinedAt
    ? new Date((currentMembership as any).joinedAt).toLocaleDateString("pt-BR")
    : "Recente";

  const pageOptions = [
    { id: "dashboard", label: "Painel", icon: LayoutDashboard },
    { id: "profile", label: "Meu Perfil", icon: UserIcon },
  ];

  const activePageDetails =
    pageOptions.find((p) => p.id === activeTab) || pageOptions[0];
  const ActiveIcon = activePageDetails.icon;

  const renderPageSelector = () => (
    <div className="relative z-20 mt-4 mb-6">
      <button
        onClick={() => setIsPageSelectorOpen(!isPageSelectorOpen)}
        className="w-full bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[18px] p-4 flex items-center justify-between shadow-sm active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#2A2F3A] text-slate-700 dark:text-slate-300 flex items-center justify-center">
            <ActiveIcon size={18} />
          </div>
          <span className="text-[16px] font-semibold text-slate-900 dark:text-white">
            {activePageDetails.label}
          </span>
        </div>
        <ChevronDown
          size={20}
          className={cn(
            "text-slate-400 transition-transform",
            isPageSelectorOpen && "rotate-180",
          )}
        />
      </button>

      {isPageSelectorOpen && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setIsPageSelectorOpen(false)}
          />
          <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[18px] shadow-xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2">
            {pageOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    setIsPageSelectorOpen(false);
                    setActiveTab(opt.id as "dashboard" | "profile");
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-[#2A2F3A] last:border-0 hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors text-left",
                    activeTab === opt.id ? "bg-slate-50 dark:bg-[#2A2F3A]" : "",
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                      activeTab === opt.id
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                        : "bg-slate-100 dark:bg-[#2A2F3A] text-slate-600 dark:text-slate-400",
                    )}
                  >
                    <Icon size={18} />
                  </div>
                  <span
                    className={cn(
                      "text-[15px] font-semibold",
                      activeTab === opt.id
                        ? "text-slate-900 dark:text-white"
                        : "text-slate-600 dark:text-slate-300",
                    )}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto w-full pb-10">
      {/* iOS Style Nav Bar Content */}
      <div className="flex items-center justify-center px-4 py-3 mb-2 sm:mb-4"></div>

      <div className="space-y-6 sm:space-y-8 px-4 sm:px-6 w-full box-border">
        {/* Action Buttons */}

        {/* Profile Header (Corp Card Style) */}
        <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[16px] sm:rounded-[20px] p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-3 shadow-sm relative z-30 w-full box-border overflow-visible">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto flex-1">
            <div className="w-12 h-12 bg-slate-900 dark:bg-[#2A2F3A] rounded-xl overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-[#3A3F4A] shadow-sm relative">
              {currentUser.avatar || currentUser.photoURL ? (
                <img
                  src={currentUser.avatar || currentUser.photoURL}
                  alt={currentUser.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-xl font-bold text-white tracking-tighter">
                  {currentUser.name.substring(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5 w-full">
                <h2 className="text-[15px] sm:text-[16px] font-bold text-slate-900 dark:text-white leading-tight truncate">
                  {currentUser.name}
                </h2>
                <ShieldCheck
                  size={14}
                  className="text-blue-500 shrink-0"
                  fill="currentColor"
                />
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate">
                {currentUser.roles?.includes("admin")
                  ? "Administrador"
                  : "Motorista Parceiro"}
              </p>
            </div>
          </div>

          <div className="flex items-center sm:pl-4 sm:border-l border-slate-200 dark:border-[#2A2F3A] shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 mt-2 sm:mt-0 relative z-20">
            <div className="flex flex-col relative w-full sm:w-[180px]">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1">
                Simulador
              </span>
              <button
                onClick={() => setIsSimulatorMenuOpen(!isSimulatorMenuOpen)}
                className="flex items-center justify-between gap-1.5 bg-slate-50 dark:bg-[#1A1F26] hover:bg-slate-100 dark:hover:bg-[#2A2F3A] transition-colors border border-slate-200 dark:border-[#2A2F3A] shadow-sm rounded-[10px] px-2.5 py-1.5 w-full active:scale-[0.98]"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Gamepad2
                    size={14}
                    className="text-slate-500 dark:text-slate-400 shrink-0"
                  />
                  <span className="text-[12px] sm:text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {currentActiveCompany?.simulatorName || "Nenhum"}
                  </span>
                </div>
                <ChevronDown
                  size={14}
                  className={cn(
                    "text-slate-400 shrink-0 transition-transform",
                    isSimulatorMenuOpen && "rotate-180",
                  )}
                />
              </button>

              {isSimulatorMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsSimulatorMenuOpen(false)}
                  />
                  <div className="absolute right-0 left-0 sm:left-auto top-[calc(100%+8px)] w-full sm:w-[180px] bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[16px] shadow-xl z-40 overflow-hidden animate-in fade-in zoom-in-95 origin-top-right">
                    {companies
                      .filter(
                        (c) =>
                          currentUser?.roles?.includes("admin") ||
                          memberships?.some((m) => m.companyId === c.id),
                      )
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
                              "w-full flex items-center justify-between px-4 py-3 border-b border-slate-50 dark:border-[#2A2F3A]/50 last:border-0 hover:bg-slate-50 dark:hover:bg-[#2A2F3A]/30 transition-colors text-left",
                              isSelected ? "bg-slate-50 dark:bg-[#2A2F3A]" : "",
                            )}
                          >
                            <span
                              className={cn(
                                "text-[13px] sm:text-[14px] font-semibold truncate mr-2",
                                isSelected
                                  ? "text-slate-900 dark:text-white"
                                  : "text-slate-600 dark:text-slate-300",
                              )}
                            >
                              {c.simulatorName || "Global Truck"}
                            </span>
                            {isSelected && (
                              <Check
                                size={16}
                                className="text-blue-600 dark:text-blue-400 shrink-0"
                              />
                            )}
                          </button>
                        );
                      })}
                    {companies.filter(
                      (c) =>
                        currentUser?.roles?.includes("admin") ||
                        memberships?.some((m) => m.companyId === c.id),
                    ).length === 0 && (
                      <div className="px-4 py-3 text-[13px] text-slate-500 text-center">
                        Nenhum simulador disponível
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {renderPageSelector()}

        {activeTab === "profile" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Unified Horizontal Stats Card */}
            <div className="flex items-center justify-between bg-white dark:bg-[#121214] border border-slate-200 dark:border-[#27272A] shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] dark:shadow-none rounded-[16px] p-4 relative overflow-hidden">
              {/* Entregas */}
              <div className="flex-1 flex flex-col items-center justify-center relative">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Truck
                    size={14}
                    className="text-indigo-500 dark:text-indigo-400"
                  />
                  <span className="text-[11px] sm:text-[12px] font-semibold text-slate-500 dark:text-[#A1A1AA] uppercase tracking-wider">
                    Entregas
                  </span>
                </div>
                <span className="text-[24px] sm:text-[28px] font-bold text-slate-900 dark:text-[#FAFAFA] leading-none tracking-tight">
                  {displayDeliveries}
                </span>
              </div>

              {/* Divider */}
              <div className="w-px h-12 bg-slate-200 dark:bg-[#27272A]"></div>

              {/* Concluídos */}
              <div className="flex-1 flex flex-col items-center justify-center relative">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CheckCircle
                    size={14}
                    className="text-emerald-500 dark:text-emerald-400"
                  />
                  <span className="text-[11px] sm:text-[12px] font-semibold text-slate-500 dark:text-[#A1A1AA] uppercase tracking-wider">
                    Concluídos
                  </span>
                </div>
                <span className="text-[24px] sm:text-[28px] font-bold text-slate-900 dark:text-[#FAFAFA] leading-none tracking-tight">
                  {displayCompleted}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="flex items-center justify-center gap-2 py-3 bg-gray-100 dark:bg-[#2A2F3A] hover:bg-gray-200 dark:hover:bg-[#3A3F4A] text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-[13px] transition-colors shadow-sm"
                  onClick={() => setIsEditProfileOpen(true)}
                >
                  <Edit size={16} />
                  Editar Perfil
                </button>
                <button
                  className="flex items-center justify-center gap-2 py-3 bg-gray-100 dark:bg-[#2A2F3A] hover:bg-gray-200 dark:hover:bg-[#3A3F4A] text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-[13px] transition-colors shadow-sm"
                  onClick={() => setIsInfoOpen(!isInfoOpen)}
                >
                  <Info size={16} />
                  {isInfoOpen ? "Ocultar Info" : "Ver Informações"}
                </button>
              </div>

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
                          {currentActiveCompany?.fleetName ||
                            currentActiveCompany?.companyName ||
                            "Carregando..."}
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

            {/* Date Filter */}
            <div className="flex flex-col gap-3">
              <div className="relative group w-full">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                  <Calendar size={16} />
                </div>
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value as any)}
                  className="w-full appearance-none bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[14px] pl-10 pr-10 py-3 text-[13px] font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors shadow-sm"
                >
                  <option value="all">Ver resumo de todo o período</option>
                  <option value="7d">Ver resumo dos últimos 7 dias</option>
                  <option value="15d">Ver resumo dos últimos 15 dias</option>
                  <option value="custom">
                    Ver resumo de período personalizado
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

            {/* Level Progress Section iOS Style */}
            <div className="bg-white dark:bg-[#1A1F26] rounded-2xl p-4 sm:p-5 border border-gray-100 dark:border-[#2A2F3A] shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-[14px] font-bold text-gray-900 dark:text-[#fafafa] tracking-tight">
                    Nível {displayLevel}
                  </h3>
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 px-1.5 py-0.5 rounded">
                    {Math.floor(currentLevelXp)} / 1000 XP
                  </span>
                </div>
                <span className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa]">
                  {Math.round(xpProgress)}%
                </span>
              </div>
              <div className="h-2 w-full bg-gray-100 dark:bg-[#27272a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00D1FF] shadow-[0_0_10px_rgba(0,209,255,0.4)] rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.max(2, xpProgress)}%` }}
                ></div>
              </div>
            </div>

            {/* Active Job Section */}
            <div>
              <h3 className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa] mb-3 px-1">
                Operação Ativa
              </h3>
              {activeJob && activeContract ? (
                <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-none">
                  <div className="flex justify-between items-start mb-4 gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-[15px] text-gray-900 dark:text-[#fafafa] tracking-tight truncate">
                        {activeContract.name}
                      </h4>
                      <div className="flex items-center flex-wrap gap-2 mt-1.5">
                        {activeVehicle && (
                          <span className="text-[12px] font-medium text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5">
                            <Car size={13} className="text-gray-400" />{" "}
                            {activeVehicle.name}
                          </span>
                        )}
                        {activeTrailer && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span className="text-[12px] font-medium text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5">
                              <Truck size={13} className="text-gray-400" />{" "}
                              {activeTrailer.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-1">
                    <div className="flex justify-between items-baseline mb-1.5">
                      <span className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa]">
                        {activeJob.progress}{" "}
                        <span className="text-gray-400 font-medium">
                          / {activeContract.totalDeliveries} entregas
                        </span>
                      </span>
                      <span className="text-[12px] font-semibold text-gray-900 dark:text-[#fafafa]">
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
                    <div className="w-full h-1.5 bg-gray-100 dark:bg-[#27272a] rounded-full overflow-hidden">
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
                <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] border-dashed rounded-2xl p-6 text-center shadow-sm dark:shadow-none">
                  <p className="text-[14px] text-gray-500 dark:text-[#a1a1aa] font-medium">
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
              {filteredPastJobs.length > 0 ? (
                <div className="space-y-3">
                  {filteredPastJobs
                    .slice()
                    .reverse()
                    .map((job) => {
                      const contract = contracts.find(
                        (c) => c.id === job.contractId,
                      );
                      const jobTrailerId = job.trailerId || contract?.trailerId;
                      const vehicle = vehicles.find(
                        (v) => v.id === job.vehicleId,
                      );
                      const trailer = jobTrailerId
                        ? trailers.find((t) => t.id === jobTrailerId)
                        : null;

                      const completedAt = job.completedAt
                        ? new Date(job.completedAt)
                        : new Date();
                      const deadline = new Date(job.deadlineDate);
                      const onTime = completedAt <= deadline;
                      const isExpanded = expandedJobId === job.id;

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
                            className="w-full flex items-center justify-between p-4 focus:outline-none"
                            onClick={() =>
                              setExpandedJobId(isExpanded ? null : job.id)
                            }
                          >
                            <div className="flex items-start gap-4 min-w-0 pr-4 w-full">
                              <div
                                className={cn(
                                  "w-10 h-10 mt-1 rounded-full flex items-center justify-center shrink-0 border",
                                  onTime
                                    ? "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/30 text-green-600 dark:text-green-400"
                                    : "bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800/30 text-orange-600 dark:text-orange-400",
                                )}
                              >
                                {onTime ? (
                                  <CheckCircle size={18} />
                                ) : (
                                  <AlertCircle size={18} />
                                )}
                              </div>
                              <div className="min-w-0 text-left flex-1">
                                <div className="flex items-center flex-wrap gap-2 mb-1">
                                  <h4 className="font-semibold text-gray-900 dark:text-[#fafafa] text-[14px] tracking-tight truncate">
                                    {contract?.name || "Contrato"}
                                  </h4>
                                  <span
                                    className={cn(
                                      "text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-md",
                                      onTime
                                        ? "bg-green-100/50 dark:bg-green-500/10 text-green-700 dark:text-green-400"
                                        : "bg-orange-100/50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400",
                                    )}
                                  >
                                    {onTime ? "No Prazo" : "Atrasado"}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1 mt-1 text-left">
                                  <div className="text-[12px] text-gray-600 dark:text-[#a1a1aa] font-medium flex items-center gap-1.5 min-w-0">
                                    <Package
                                      size={13}
                                      className="text-gray-400 shrink-0"
                                    />
                                    <span className="truncate">
                                      {job.progress}{" "}
                                      {job.progress === 1
                                        ? "entrega"
                                        : "entregas"}
                                    </span>
                                  </div>
                                  {trailer && (
                                    <div className="text-[12px] text-gray-600 dark:text-[#a1a1aa] flex items-center gap-1.5 min-w-0">
                                      <Truck
                                        size={13}
                                        className="text-gray-400 shrink-0"
                                      />{" "}
                                      <span className="truncate">
                                        {trailer.name}
                                      </span>
                                    </div>
                                  )}
                                  {vehicle && (
                                    <div className="text-[12px] text-gray-600 dark:text-[#a1a1aa] flex items-center gap-1.5 min-w-0">
                                      <Car
                                        size={13}
                                        className="text-gray-400 shrink-0"
                                      />{" "}
                                      <span className="truncate">
                                        {vehicle.name}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-gray-400 dark:text-gray-500 shrink-0 self-start mt-2">
                              {isExpanded ? (
                                <ChevronUp size={18} />
                              ) : (
                                <ChevronDown size={18} />
                              )}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="pt-3 border-t border-gray-100 dark:border-[#2A2F3A] flex flex-col gap-2">
                                <div className="flex justify-between items-center text-[12px]">
                                  <span className="text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5">
                                    <CheckCircle
                                      size={14}
                                      className="text-gray-400"
                                    />{" "}
                                    Conclusão
                                  </span>
                                  <span className="font-medium text-gray-900 dark:text-[#fafafa]">
                                    {completedAt.toLocaleDateString("pt-BR")}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-[12px]">
                                  <span className="text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5">
                                    <Clock
                                      size={14}
                                      className="text-gray-400"
                                    />{" "}
                                    Prazo Base
                                  </span>
                                  <span className="font-medium text-gray-900 dark:text-[#fafafa]">
                                    {deadline.toLocaleDateString("pt-BR")}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-2xl p-6 text-center shadow-sm dark:shadow-none">
                  <p className="text-[14px] text-gray-500 dark:text-[#a1a1aa] font-medium">
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
