import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAppStore } from "../../context/AppContext";
import { Button } from "../../components/ui/Button";
import { DriverPerformanceCard } from "../../components/DriverPerformanceCard";
import { getJobRealTimestamp } from "../../lib/utils";
import { getDriverLevelData } from "../../lib/levelUtils";
import TripHistory from "../driver/TripHistory";
import Reports from "./Reports";
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
  LayoutDashboard,
  User as UserIcon,
  History,
  Activity,
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
  const [isPageSelectorOpen, setIsPageSelectorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "profile" | "history" | "operations" | "reports"
  >("profile");

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

  const pageOptions = [
    { id: "profile", label: "Meu Perfil", icon: UserIcon },
    { id: "history", label: "Histórico de Viagens", icon: History },
    { id: "operations", label: "Histórico de Operações", icon: Package },
    { id: "reports", label: "Relatórios", icon: Activity },
  ];

  const activePageDetails =
    pageOptions.find((p) => p.id === activeTab) || pageOptions[0];
  const ActiveIcon = activePageDetails.icon;

  const renderPageSelector = () => (
    <div className="w-full flex flex-col gap-2 sm:gap-3 z-20">
      <div className="w-full flex flex-row items-stretch justify-between gap-2 sm:gap-4">
        <div className="flex bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg sm:rounded-[12px] shadow-sm min-w-0 flex-1 h-9 sm:h-[56px] overflow-hidden">
          <button
            onClick={handleBack}
            className="w-11 sm:w-14 h-full hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors flex items-center justify-center shrink-0 border-r border-slate-200 dark:border-[#2A2F3A]"
          >
            <ArrowLeft
              size={16}
              className="text-slate-600 dark:text-slate-400"
            />
          </button>

          <button
            onClick={() => setIsPageSelectorOpen(!isPageSelectorOpen)}
            className="flex-1 h-full hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors flex items-center justify-center gap-1.5 sm:gap-[12px] px-2 sm:px-4 active:scale-[0.99]"
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
                "text-slate-400 shrink-0 transition-transform duration-200 sm:!w-[18px] sm:!h-[18px]",
                isPageSelectorOpen && "rotate-180",
              )}
            />
          </button>
        </div>
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
                  setActiveTab(
                    opt.id as "profile" | "history" | "operations" | "reports",
                  );
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-3 border-b border-slate-100 dark:border-[#2A2F3A] last:border-0 hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors text-left",
                  activeTab === opt.id ? "bg-slate-50 dark:bg-[#2A2F3A]" : "",
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    activeTab === opt.id ? "text-blue-600 dark:text-[#0cb49f]" : "text-slate-500",
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
                {activeTab === opt.id && (
                  <Check size={14} className="ml-auto text-blue-600 dark:text-[#0cb49f]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

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
  const pastJobs = allDriverJobs
    .filter((j) => j.status === "completed")
    .sort((a, b) => {
      const tsA = getJobRealTimestamp(a, historicoTrips);
      const tsB = getJobRealTimestamp(b, historicoTrips);

      if (tsB !== tsA) {
        return tsB - tsA;
      }

      const contractA =
        contracts.find((c) => c.id === a.contractId)?.name || "";
      const contractB =
        contracts.find((c) => c.id === b.contractId)?.name || "";
      return contractA.localeCompare(contractB);
    });

  const levelData = getDriverLevelData(
    driverId as string,
    jobs,
    contracts,
    historicoTrips,
  );
  const displayLevel = levelData.displayLevel;
  const currentLevelXp = levelData.currentLevelXp;
  const xpProgress = levelData.xpProgress;

  const totalGanhos = historicoTrips
    .filter((t) => t.motoristaId === driverId)
    .reduce((acc, t) => acc + (Number(t.valor) || 0), 0);

  const totalViagens = historicoTrips.filter(
    (t) => t.motoristaId === driverId,
  ).length;

  const [globalRank, setGlobalRank] = useState<{
    position: number;
    total: number;
    diffToNext?: number;
  } | null>(null);

  useEffect(() => {
    if (!resolvedCompany?.simulatorName || !driverId) return;

    const targetSimulator = resolvedCompany.simulatorName || "Global Truck";
    const simulatorCompanies = new Set(
      companies
        .filter((c) => (c.simulatorName || "Global Truck") === targetSimulator)
        .map((c) => c.id),
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

        Object.keys(earningsByDriver).forEach((dId) =>
          driversInSimulator.add(dId),
        );
        driversInSimulator.add(driverId!);

        const leaderboard = Array.from(driversInSimulator).map((dId) => ({
          id: dId,
          ganhos: earningsByDriver[dId] || 0,
        }));

        leaderboard.sort((a, b) => b.ganhos - a.ganhos);

        const pos = leaderboard.findIndex((item) => item.id === driverId);
        if (pos !== -1) {
          let diffToNext = 0;
          if (pos > 0) {
            const nextPerson = leaderboard[pos - 1];
            const currentGanhos = leaderboard[pos].ganhos;
            diffToNext = nextPerson.ganhos - currentGanhos;
          }
          setGlobalRank({
            position: pos + 1,
            total: leaderboard.length,
            diffToNext,
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
    <div className="max-w-2xl mx-auto flex flex-col gap-3 sm:gap-4 w-full animate-in fade-in duration-300 pb-8">
      <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[14px] sm:rounded-[16px] flex flex-col shadow-sm relative z-30 w-full box-border">
        <div className="p-3 sm:p-4 flex items-start sm:items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-900 dark:bg-[#2A2F3A] rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-[#3A3F4A] shadow-sm relative">
              {driver.avatar || driver.photoURL ? (
                <img
                  src={driver.avatar || driver.photoURL}
                  alt={driver.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-base sm:text-lg font-bold text-white tracking-tighter">
                  {driver.name.substring(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col flex-1 min-w-0 justify-center">
              <div className="flex items-center gap-1.5 w-full">
                <h2 className="text-[11px] sm:text-[13px] font-bold text-slate-900 dark:text-white leading-none whitespace-nowrap">
                  {driver.name}
                </h2>
              </div>
              <p className="text-[9px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-1 whitespace-nowrap">
                {driver.roles?.includes("admin")
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
              <div className="flex items-center justify-between gap-1.5 bg-slate-50 dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] shadow-sm rounded-md px-1.5 py-1 w-auto">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Truck
                    size={10}
                    className="text-slate-500 dark:text-slate-400 shrink-0"
                  />
                  <span className="text-[9px] sm:text-[10px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {resolvedCompany?.simulatorName || "G. Truck"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {renderPageSelector()}

      <div className="space-y-3 sm:space-y-4">
        {activeTab === "profile" && (
          <div className="space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <DriverPerformanceCard
              historicoTrips={historicoTrips}
              driverId={driverId as string}
              activeCompanyId={activeCompanyId}
              allCompanyMembers={allCompanyMembers}
              posicaoRanking={globalRank?.position || "--"}
              totalRanking={globalRank?.total || "--"}
              currentUser={driver}
              totalGanhos={totalGanhos}
              displayLevel={displayLevel}
              currentLevelXp={currentLevelXp}
              xpProgress={xpProgress}
              diffToNext={globalRank?.diffToNext}
            />
          </div>
        )}

        {activeTab === "operations" && (
          <div className="space-y-6">
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
                    const vehicle = vehicles.find(
                      (v) => v.id === job.vehicleId,
                    );
                    const trailer = jobTrailerId
                      ? trailers.find((t) => t.id === jobTrailerId)
                      : null;

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
                      if (t.motoristaId !== driverId) return false;

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
                              <div
                                className={cn(
                                  "w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0",
                                  isAtrasado
                                    ? "bg-amber-100 dark:bg-amber-500/20"
                                    : "bg-emerald-100 dark:bg-emerald-500/20",
                                )}
                              >
                                {isAtrasado ? (
                                  <X
                                    size={16}
                                    className="text-amber-600 dark:text-amber-400"
                                    strokeWidth={3}
                                  />
                                ) : (
                                  <Check
                                    size={16}
                                    className="text-emerald-600 dark:text-emerald-400"
                                    strokeWidth={3}
                                  />
                                )}
                              </div>

                              {/* Name and Badge */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <h4 className="text-[15px] sm:text-[16px] font-semibold text-gray-900 dark:text-[#fafafa] truncate">
                                  {contract?.name || "Contrato"}
                                </h4>
                                <span
                                  className={cn(
                                    "h-[16px] px-1.5 text-[9px] font-bold tracking-wide rounded uppercase flex items-center justify-center shrink-0 leading-none",
                                    isAtrasado
                                      ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                      : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
                                  )}
                                >
                                  {isAtrasado
                                    ? "O prazo expirou"
                                    : "Dentro do prazo"}
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
                              <Car
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
                                "flex items-center gap-2 rounded-xl px-3 py-2 border mb-3",
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
        )}

        {activeTab === "history" && (
          <TripHistory
            hideHeader={true}
            hideDriverFilter={true}
            defaultDriverName={driver.name}
            isInsideAdminTab={true}
          />
        )}

        {activeTab === "reports" && (
          <Reports
            hideHeader={true}
            defaultDriverId={driver.id}
            isInsideAdminTab={true}
          />
        )}
      </div>

      {jobToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1A1F26] rounded-2xl shadow-xl w-full max-w-[320px] p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-500/20 text-red-600 rounded-full flex items-center justify-center mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-[#fafafa] mb-2">
              Excluir do Histórico?
            </h3>
            <p className="text-[13px] text-gray-500 dark:text-[#a1a1aa] mb-6">
              Esta ação removerá o contrato do histórico do motorista. Não
              afetará as estatísticas globais, apenas este registro.
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
