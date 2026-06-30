import React, { useMemo, useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import {
  TrendingUp,
  Target,
  Trophy,
  Activity,
  Star,
  Banknote,
  Package,
  ArrowUpRight,
  Award,
  Shield,
  Hexagon,
} from "lucide-react";
import {
  getWeeklyRange,
  getMonthlyRange,
  groupMetricsByDriver,
} from "../lib/metricsEngine";
import { normalizeTrip } from "../lib/tripNormalizer";
import {
  differenceInDays,
  subDays,
  startOfWeek,
  endOfWeek,
  subWeeks,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";

export interface DriverPerformanceCardProps {
  historicoTrips: any[];
  driverId: string;
  activeCompanyId: string | null;
  allCompanyMembers: any[];
  currentUser: any;
  displayLevel?: number;
  currentLevelXp?: number;
  xpProgress?: number;
}

export const DriverPerformanceCard = ({
  historicoTrips,
  driverId,
  activeCompanyId,
  allCompanyMembers,
  currentUser,
  displayLevel = 1,
  currentLevelXp = 0,
  xpProgress = 0,
}: DriverPerformanceCardProps) => {
  const [isPeriodSelectorOpen, setIsPeriodSelectorOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<
    "Semana atual" | "Mês atual" | "Hoje" | "Personalizado"
  >("Semana atual");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(
    { from: getWeeklyRange().start, to: getWeeklyRange().end },
  );

  const { sDate, eDate } = useMemo(() => {
    const now = new Date();
    if (selectedPeriod === "Semana atual") {
      return { sDate: getWeeklyRange().start, eDate: getWeeklyRange().end };
    }
    if (selectedPeriod === "Mês atual") {
      return { sDate: getMonthlyRange().start, eDate: getMonthlyRange().end };
    }
    if (selectedPeriod === "Hoje") {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0,
      );
      const end = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );
      return { sDate: start, eDate: end };
    }
    if (selectedPeriod === "Personalizado" && customDateRange?.from) {
      const start = new Date(customDateRange.from);
      start.setHours(0, 0, 0, 0);
      let end = customDateRange.to
        ? new Date(customDateRange.to)
        : new Date(customDateRange.from);
      end.setHours(23, 59, 59, 999);
      return { sDate: start, eDate: end };
    }
    return { sDate: getWeeklyRange().start, eDate: getWeeklyRange().end };
  }, [selectedPeriod, customDateRange]);

  const periodDays = differenceInDays(eDate, sDate) + 1;
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const periodSelectorRef = useRef<HTMLDivElement>(null);
  const [classificationView, setClassificationView] = useState<
    "Semanal" | "Mensal"
  >("Semanal");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        periodSelectorRef.current &&
        !periodSelectorRef.current.contains(event.target as Node)
      ) {
        setIsPeriodSelectorOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePeriodSelect = (
    period: "Semana atual" | "Mês atual" | "Hoje" | "Personalizado",
  ) => {
    setSelectedPeriod(period);
    setIsPeriodSelectorOpen(false);
    if (period === "Personalizado") {
      setIsCustomDateModalOpen(true);
    }
  };

  const getPeriodLabel = () => {
    if (selectedPeriod === "Personalizado") {
      if (customDateRange?.from && customDateRange?.to) {
        return `${customDateRange.from.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} - ${customDateRange.to.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
      } else if (customDateRange?.from) {
        return customDateRange.from.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        });
      }
      return "Personalizado";
    }
    return selectedPeriod;
  };

  const prevSDate = subDays(sDate, periodDays);
  const prevEDate = subDays(eDate, periodDays);

  const normalizedHistorico = useMemo(() => {
    return historicoTrips.map(normalizeTrip).filter((t) => t.isValid);
  }, [historicoTrips]);

  const userTrips = normalizedHistorico.filter((t) => {
    if (activeCompanyId && t.empresaId && t.empresaId !== activeCompanyId) {
      return false;
    }
    return t.motoristaId === driverId;
  });

  const currentPeriodStatsMap: Record<string, { trips: number; val: number }> =
    {};
  normalizedHistorico.forEach((trip) => {
    if (trip.metricDate >= sDate && trip.metricDate <= eDate) {
      if (
        activeCompanyId &&
        trip.empresaId &&
        trip.empresaId !== activeCompanyId
      ) {
        return;
      }
      const mId = trip.motoristaId;
      if (!mId) return;
      if (!currentPeriodStatsMap[mId])
        currentPeriodStatsMap[mId] = { trips: 0, val: 0 };
      currentPeriodStatsMap[mId].trips += 1;
      currentPeriodStatsMap[mId].val += trip.normalizedValor;
    }
  });

  const currentPeriodStatsArray = Object.keys(currentPeriodStatsMap)
    .map((id) => ({
      id,
      ...currentPeriodStatsMap[id],
    }))
    .sort((a, b) => {
      if (b.val !== a.val) return b.val - a.val;
      return b.trips - a.trips;
    });

  const currentDriverPos = currentPeriodStatsArray.findIndex(
    (d) => d.id === driverId,
  );
  const currentPosition = currentDriverPos >= 0 ? currentDriverPos + 1 : "--";
  const currentTotalDrivers =
    allCompanyMembers && allCompanyMembers.length > 0
      ? allCompanyMembers.length
      : Math.max(currentPeriodStatsArray.length, 1);
  const currentDiffToNext =
    currentDriverPos > 0
      ? currentPeriodStatsArray[currentDriverPos - 1].val -
        (currentDriverPos >= 0
          ? currentPeriodStatsArray[currentDriverPos].val
          : 0)
      : 0;

  const currentTrips = userTrips.filter((t) => {
    return t.metricDate >= sDate && t.metricDate <= eDate;
  });

  const prevTrips = userTrips.filter((t) => {
    return t.metricDate >= prevSDate && t.metricDate <= prevEDate;
  });

  const currentEarnings = currentTrips.reduce(
    (acc, t) => acc + t.normalizedValor,
    0,
  );
  const prevEarnings = prevTrips.reduce((acc, t) => acc + t.normalizedValor, 0);

  let evolution =
    prevEarnings === 0
      ? currentEarnings > 0
        ? 100
        : 0
      : ((currentEarnings - prevEarnings) / prevEarnings) * 100;
  // Let's cap evolution visually if it's too high or weird for UI purposes, or just show it:
  const evolutionText =
    evolution > 0 ? `+${Math.round(evolution)}%` : `${Math.round(evolution)}%`;

  const viagensRealizadas = currentTrips.length;
  const totalViagensGeral = userTrips.length;

  const actualEndDate = eDate > new Date() ? new Date() : eDate;
  const runDays = Math.max(1, differenceInDays(actualEndDate, sDate) + 1);
  const mediaDiaria = viagensRealizadas / runDays;

  const scoreRaw = 15 > 0 ? (viagensRealizadas / 15) * 100 : 0;
  const score = Math.round(scoreRaw);

  const getStatus = (score: number) => {
    if (score >= 120)
      return {
        label: "Extraordinário",
        color: "text-teal-600 dark:text-teal-400",
        bg: "bg-teal-500 dark:bg-teal-400",
        index: 5,
        desc: (
          <>
            Você está acima de 95%
            <br />
            dos motoristas neste período.
          </>
        ),
      };
    if (score >= 100)
      return {
        label: "Excelente",
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-500 dark:bg-emerald-400",
        index: 4,
        desc: (
          <>
            Você está acima de 82%
            <br />
            dos motoristas neste período.
          </>
        ),
      };
    if (score >= 80)
      return {
        label: "Bom",
        color: "text-pink-600 dark:text-pink-400",
        bg: "bg-pink-500 dark:bg-pink-400",
        index: 3,
        desc: (
          <>
            Você está acima de 60%
            <br />
            dos motoristas neste período.
          </>
        ),
      };
    if (score >= 50)
      return {
        label: "Regular",
        color: "text-yellow-600 dark:text-yellow-400",
        bg: "bg-yellow-500 dark:bg-yellow-400",
        index: 2,
        desc: (
          <>
            Seu ritmo está na média
            <br />
            dos motoristas da frota.
          </>
        ),
      };
    if (score >= 20)
      return {
        label: "Baixo",
        color: "text-orange-600 dark:text-orange-400",
        bg: "bg-orange-500 dark:bg-orange-400",
        index: 1,
        desc: (
          <>
            Seu volume de viagens
            <br />
            está abaixo da média.
          </>
        ),
      };
    return {
      label: "Muito baixo",
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-500 dark:bg-red-400",
      index: 0,
      desc: (
        <>
          Você tem um ritmo operacional
          <br />
          crítico no momento.
        </>
      ),
    };
  };

  const status = getStatus(score);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatCurrencyExact = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const classificationHistory = useMemo(() => {
    const history = [];
    const now = new Date();
    const isWeekly = classificationView === "Semanal";
    const numPeriods = 5;

    for (let i = 0; i < numPeriods; i++) {
      let periodStart: Date, periodEnd: Date, periodLabel: string;

      if (isWeekly) {
        const refDate = subWeeks(now, i);
        periodStart = startOfWeek(refDate, { weekStartsOn: 0 }); // Sunday
        periodEnd = endOfWeek(refDate, { weekStartsOn: 0 }); // Saturday
        periodLabel = `${periodStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} a ${periodEnd.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
      } else {
        const refDate = subMonths(now, i);
        periodStart = startOfMonth(refDate);
        periodEnd = endOfMonth(refDate);
        const formattedMonth = periodStart
          .toLocaleDateString("pt-BR", { month: "short" })
          .replace(".", "");
        periodLabel = `${formattedMonth.charAt(0).toUpperCase() + formattedMonth.slice(1)} ${periodStart.getFullYear()}`;
      }

      const driverStatsMap: Record<string, { trips: number; val: number }> = {};

      normalizedHistorico.forEach((trip) => {
        if (trip.metricDate >= periodStart && trip.metricDate <= periodEnd) {
          if (
            activeCompanyId &&
            trip.empresaId &&
            trip.empresaId !== activeCompanyId
          ) {
            return;
          }
          const mId = trip.motoristaId;
          if (!mId) return;
          if (!driverStatsMap[mId]) driverStatsMap[mId] = { trips: 0, val: 0 };
          driverStatsMap[mId].trips += 1;
          driverStatsMap[mId].val += trip.normalizedValor;
        }
      });

      const driverStatsArray = Object.keys(driverStatsMap)
        .map((id) => ({
          id,
          ...driverStatsMap[id],
        }))
        .sort((a, b) => {
          if (b.val !== a.val) return b.val - a.val;
          return b.trips - a.trips;
        });

      const driverPos = driverStatsArray.findIndex((d) => d.id === driverId);
      const position = driverPos >= 0 ? driverPos + 1 : "--";
      const total =
        allCompanyMembers && allCompanyMembers.length > 0
          ? allCompanyMembers.length
          : Math.max(driverStatsArray.length, 1);

      const driverData =
        driverPos >= 0 ? driverStatsArray[driverPos] : { trips: 0, val: 0 };

      history.push({
        id: i,
        label: periodLabel,
        trips: driverData.trips,
        earnings: driverData.val,
        position: position,
        total: total,
      });
    }

    return history;
  }, [
    classificationView,
    normalizedHistorico,
    driverId,
    activeCompanyId,
    allCompanyMembers,
  ]);

  const scales = [
    "Muito baixo",
    "Baixo",
    "Regular",
    "Bom",
    "Excelente",
    "Extraordinário",
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* CARD 1: RITMO OPERACIONAL */}
      <div className="w-full rounded-[24px] flex flex-col relative shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] bg-white dark:bg-[#1A1F26] border border-slate-200/80 dark:border-white/5 p-4 sm:p-5">
        {/* Banner */}
        <div className="relative w-full bg-gradient-to-br from-[#061922] via-[#0A2E38] to-[#041419] rounded-[20px] text-white mb-4 shadow-sm">
          {/* Backgrounds container with overflow-hidden */}
          <div className="absolute inset-0 rounded-[20px] overflow-hidden pointer-events-none">
            {/* Glows and particles */}
            <div className="absolute top-[-30%] left-[-10%] w-[80%] h-[150%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-teal-400/10 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-[-50%] right-[-10%] w-[80%] h-[120%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent pointer-events-none" />

            {/* Fluid lines */}
            <svg
              className="absolute bottom-0 w-full h-auto opacity-40 pointer-events-none mix-blend-screen"
              viewBox="0 0 1440 200"
              fill="none"
              preserveAspectRatio="none"
            >
              <path
                d="M0,200 C320,50 420,150 720,80 C1020,10 1200,120 1440,60 L1440,200 L0,200 Z"
                fill="url(#fluid-grad)"
              />
              <path
                d="M0,200 C200,100 400,20 720,90 C1040,160 1240,40 1440,80 L1440,200 L0,200 Z"
                fill="url(#fluid-grad-2)"
                opacity="0.5"
              />
              <defs>
                <linearGradient id="fluid-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#14B8A6" stopOpacity="0" />
                  <stop offset="50%" stopColor="#14B8A6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="fluid-grad-2" x1="1" y1="0" x2="0" y2="0">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
                  <stop offset="50%" stopColor="#10b981" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Banner Content */}
          <div className="flex flex-col w-full p-4 sm:p-5 md:p-6 relative z-10">
            {/* Header: Title and Period Select */}
            <div className="flex flex-row justify-between items-center w-full mb-3 sm:mb-4 gap-2">
              <h3 className="text-[10px] sm:text-[13px] font-bold text-white uppercase tracking-wider shrink-0">
                1. RITMO OPERACIONAL
              </h3>

              <div className="relative" ref={periodSelectorRef}>
                <div
                  onClick={() => setIsPeriodSelectorOpen(!isPeriodSelectorOpen)}
                  className="flex items-center gap-1 sm:gap-1.5 bg-white/10 hover:bg-white/15 transition-colors border border-white/10 rounded-full px-2 py-1 sm:px-3 sm:py-1.5 cursor-pointer backdrop-blur-md shrink-0"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-white/80 sm:w-[14px] sm:h-[14px]"
                  >
                    <rect
                      x="3"
                      y="4"
                      width="18"
                      height="18"
                      rx="2"
                      ry="2"
                    ></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <span className="text-[9px] sm:text-[11px] font-medium text-white/90">
                    Período: {getPeriodLabel()}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      "text-white/60 ml-0.5 sm:ml-1 sm:w-[14px] sm:h-[14px] transition-transform",
                      isPeriodSelectorOpen && "rotate-180",
                    )}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>

                {isPeriodSelectorOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="p-1">
                      {[
                        "Semana atual",
                        "Mês atual",
                        "Hoje",
                        "Personalizado",
                      ].map((period) => (
                        <button
                          key={period}
                          onClick={() => handlePeriodSelect(period as any)}
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                            selectedPeriod === period
                              ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400"
                              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                          )}
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main Area: Status and Level */}
            <div className="flex flex-row w-full items-center justify-between">
              {/* Left Area - Status */}
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 pr-1 sm:pr-2">
                <div className="relative w-[52px] h-[52px] sm:w-[72px] sm:h-[72px] shrink-0 flex items-center justify-center">
                  <svg
                    className="w-full h-full -rotate-90 drop-shadow-[0_0_12px_rgba(20,184,166,0.4)]"
                    viewBox="0 0 36 36"
                  >
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className="stroke-white/10"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className={cn(
                        "transition-all duration-1000",
                        status.color.replace(/text-/g, "stroke-"),
                      )}
                      strokeWidth="2"
                      strokeDasharray={`${Math.min(100, Math.max(5, score))} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <TrendingUp
                    size={16}
                    className={cn(
                      "absolute sm:w-[20px] sm:h-[20px]",
                      status.color,
                    )}
                    strokeWidth={2.5}
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <span
                    className={cn(
                      "text-[15px] sm:text-[22px] font-bold tracking-tight leading-none mb-0.5 sm:mb-1 truncate",
                      status.color,
                    )}
                  >
                    {status.label}
                  </span>
                  <span className="text-[9px] sm:text-[11px] text-white/80 font-medium leading-[1.2] sm:leading-[1.3]">
                    {status.desc}
                  </span>
                </div>
              </div>

              {/* Separator */}
              <div className="w-[1px] h-12 sm:h-14 bg-white/20 mx-1.5 sm:mx-4 shrink-0" />

              {/* Right Area - Level */}
              <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 pl-1">
                {/* Premium 3D Shield */}
                <div className="relative w-[48px] h-[48px] sm:w-[72px] sm:h-[72px] shrink-0 flex items-center justify-center">
                  <svg
                    viewBox="0 0 100 100"
                    className="w-full h-full drop-shadow-[0_4px_16px_rgba(20,184,166,0.4)]"
                  >
                    <defs>
                      <linearGradient
                        id="chrome1"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stopColor="#ffffff"
                          stopOpacity="0.9"
                        />
                        <stop
                          offset="30%"
                          stopColor="#94a3b8"
                          stopOpacity="0.5"
                        />
                        <stop
                          offset="50%"
                          stopColor="#14B8A6"
                          stopOpacity="0.4"
                        />
                        <stop
                          offset="80%"
                          stopColor="#0f172a"
                          stopOpacity="0.8"
                        />
                        <stop
                          offset="100%"
                          stopColor="#ffffff"
                          stopOpacity="0.7"
                        />
                      </linearGradient>
                      <linearGradient
                        id="chrome2"
                        x1="100%"
                        y1="0%"
                        x2="0%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stopColor="#e2e8f0"
                          stopOpacity="0.8"
                        />
                        <stop
                          offset="50%"
                          stopColor="#0d2a3a"
                          stopOpacity="0.6"
                        />
                        <stop
                          offset="100%"
                          stopColor="#2dd4bf"
                          stopOpacity="0.9"
                        />
                      </linearGradient>
                      <radialGradient id="glassGlow" cx="50%" cy="30%" r="60%">
                        <stop
                          offset="0%"
                          stopColor="#ffffff"
                          stopOpacity="0.3"
                        />
                        <stop
                          offset="100%"
                          stopColor="#0f172a"
                          stopOpacity="0.4"
                        />
                      </radialGradient>
                    </defs>

                    {/* Outer Chrome Border */}
                    <path
                      d="M50 5 L92 22 L92 52 C92 78 50 97 50 97 C50 97 8 78 8 52 L8 22 Z"
                      fill="url(#chrome2)"
                    />

                    {/* Inner Glass Core */}
                    <path
                      d="M50 9 L88 24 L88 51 C88 74 50 92 50 92 C50 92 12 74 12 51 L12 24 Z"
                      fill="url(#glassGlow)"
                      stroke="url(#chrome1)"
                      strokeWidth="1.5"
                    />

                    {/* Highlight reflection */}
                    <path
                      d="M50 11 L85 25 L85 46 C85 66 50 84 50 84 C50 84 50 11 50 11 Z"
                      fill="#ffffff"
                      fillOpacity="0.15"
                    />
                  </svg>

                  {/* The star inside */}
                  <Star
                    size={20}
                    className="absolute text-white drop-shadow-[0_2px_8px_rgba(255,255,255,0.6)] z-10 sm:w-[28px] sm:h-[28px]"
                    fill="currentColor"
                    strokeWidth={1}
                  />
                </div>

                <div className="flex flex-col items-start">
                  <span className="text-[8px] sm:text-[10px] font-bold text-white uppercase tracking-[0.1em] mb-0">
                    NÍVEL
                  </span>
                  <span className="text-[28px] sm:text-[40px] font-bold text-white leading-none drop-shadow-[0_2px_12px_rgba(255,255,255,0.2)] tracking-tighter">
                    {displayLevel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* XP Bar Section (Below Banner) */}
        <div className="w-full flex flex-col gap-1.5 mb-4 px-1">
          <div className="flex justify-between items-end w-full">
            <span className="text-[11px] sm:text-[13px] font-semibold text-slate-600 dark:text-slate-300">
              {Math.floor(currentLevelXp)} / 1.000 XP
            </span>
            <span className="text-[11px] sm:text-[13px] font-bold text-teal-600 dark:text-teal-400">
              {Math.round(xpProgress)}%
            </span>
          </div>
          <div className="w-full h-2 sm:h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-white/5">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-1000"
              style={{ width: `${Math.max(2, xpProgress)}%` }}
            />
          </div>
        </div>

        {/* KPIs Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
          {/* KPI 1: Ganhos */}
          <div className="flex flex-col items-center justify-center py-3 px-2 sm:py-4 sm:px-3 text-center bg-white dark:bg-[#1A1F26] rounded-[16px] border border-slate-200 dark:border-white/10 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Banknote
                size={14}
                className="text-teal-600 dark:text-teal-400"
                strokeWidth={2.5}
              />
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Ganhos
              </span>
            </div>
            <span className="text-[13px] sm:text-[14px] md:text-[15px] font-bold text-slate-900 dark:text-white leading-none mb-1 tracking-tight break-all">
              {formatCurrency(currentEarnings)}
            </span>
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight size={12} strokeWidth={3} />
              <span>{evolutionText}</span>
            </div>
          </div>

          {/* KPI 2: Ranking */}
          <div className="flex flex-col items-center justify-center py-3 px-2 sm:py-4 sm:px-3 text-center bg-white dark:bg-[#1A1F26] rounded-[16px] border border-slate-200 dark:border-white/10 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Trophy
                size={14}
                className="text-teal-600 dark:text-teal-400"
                strokeWidth={2.5}
              />
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Ranking Global
              </span>
            </div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-[17px] md:text-[20px] font-bold text-slate-900 dark:text-white leading-none tracking-tight">
                #{currentPosition}
              </span>
              <span className="text-[11px] md:text-[13px] text-slate-400 font-medium">
                / {currentTotalDrivers}
              </span>
            </div>
            {currentDiffToNext > 0 ? (
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight">
                Faltam{" "}
                <span className="text-teal-600 dark:text-teal-400 font-bold">
                  {formatCurrencyExact(currentDiffToNext)}
                </span>
                <br />
                para o próximo
              </span>
            ) : (
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight opacity-0">
                Faltam <br />
                para o próximo
              </span>
            )}
          </div>

          {/* KPI 3: Viagens */}
          <div className="flex flex-col items-center justify-center py-3 px-2 sm:py-4 sm:px-3 text-center bg-white dark:bg-[#1A1F26] rounded-[16px] border border-slate-200 dark:border-white/10 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Package
                size={14}
                className="text-teal-600 dark:text-teal-400"
                strokeWidth={2.5}
              />
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Viagens
              </span>
            </div>
            <span className="text-[17px] md:text-[20px] font-bold text-slate-900 dark:text-white leading-none mb-1 tracking-tight">
              {viagensRealizadas}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              realizadas
            </span>
          </div>

          {/* KPI 4: Média diária */}
          <div className="flex flex-col items-center justify-center py-3 px-2 sm:py-4 sm:px-3 text-center bg-white dark:bg-[#1A1F26] rounded-[16px] border border-slate-200 dark:border-white/10 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Activity
                size={14}
                className="text-teal-600 dark:text-teal-400"
                strokeWidth={2.5}
              />
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Média Diária
              </span>
            </div>
            <span className="text-[17px] md:text-[20px] font-bold text-slate-900 dark:text-white leading-none mb-1 tracking-tight">
              {mediaDiaria.toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              viagens/dia
            </span>
          </div>
        </div>

        {/* Evolução */}
        <div className="flex items-center justify-between w-full py-3 px-4 sm:py-4 sm:px-5 bg-white dark:bg-[#1A1F26] rounded-[16px] border border-slate-200 dark:border-white/10 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3">
            <TrendingUp
              size={16}
              className="text-teal-600 dark:text-teal-400"
              strokeWidth={2.5}
            />
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Evolução
            </span>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[16px] sm:text-[18px] font-bold text-slate-900 dark:text-white leading-none mb-0.5 tracking-tight">
              {evolutionText}
            </span>
            <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              vs. período anterior
            </span>
          </div>

          <div className="w-[80px] sm:w-[120px] h-[24px] relative">
            <svg
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              viewBox="0 0 100 30"
            >
              <defs>
                <linearGradient id="evolGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#14B8A6" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,30 L0,20 C20,24 35,10 55,14 C75,18 85,4 100,6 L100,30 Z"
                fill="url(#evolGrad2)"
              />
              <path
                d="M0,20 C20,24 35,10 55,14 C75,18 85,4 100,6"
                fill="none"
                stroke="#14B8A6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* CARD 2: CONSISTÊNCIA */}
      <div className="w-full rounded-[24px] flex flex-col relative shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] bg-white dark:bg-[#1A1F26] border border-slate-200/80 dark:border-white/5 p-4 sm:p-5">
        <h3 className="text-[11px] sm:text-[13px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">
          2. CONSISTÊNCIA
        </h3>

        {selectedPeriod === "Mês atual" ||
        selectedPeriod === "Personalizado" ? (
          <div className="w-full mb-4">
            <div className="grid grid-cols-7 gap-1 sm:gap-2 max-w-md mx-auto text-center mb-2">
              {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((day) => (
                <span
                  key={day}
                  className="text-[9px] sm:text-[10px] font-bold text-slate-500"
                >
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2 max-w-md mx-auto">
              {(() => {
                const daysInPeriod: Date[] = [];
                let currDate = new Date(sDate);
                currDate.setHours(0, 0, 0, 0);
                const endOfDay = new Date(eDate);
                endOfDay.setHours(23, 59, 59, 999);
                let maxDays = 365; // hard limit
                while (currDate <= endOfDay && maxDays > 0) {
                  daysInPeriod.push(new Date(currDate));
                  currDate.setDate(currDate.getDate() + 1);
                  maxDays--;
                }
                const firstDayOfWeek =
                  daysInPeriod.length > 0 ? daysInPeriod[0].getDay() : 0;

                return (
                  <>
                    {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="w-7 h-7 sm:w-10 sm:h-10 mx-auto"
                      />
                    ))}
                    {daysInPeriod.map((d) => {
                      const hasTrip = currentTrips.some((t) => {
                        return (
                          t.metricDate.getDate() === d.getDate() &&
                          t.metricDate.getMonth() === d.getMonth() &&
                          t.metricDate.getFullYear() === d.getFullYear()
                        );
                      });
                      return (
                        <div
                          key={d.toISOString()}
                          className={cn(
                            "w-7 h-7 sm:w-10 sm:h-10 mx-auto rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-medium transition-all",
                            hasTrip
                              ? "bg-teal-500 text-white shadow-[0_2px_8px_rgba(20,184,166,0.3)]"
                              : "bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-400",
                          )}
                        >
                          {d.getDate()}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center w-full px-1 sm:px-4 mb-4">
            {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map(
              (day, idx) => {
                const hasTripOnDay = currentTrips.some((t) => {
                  return t.metricDate.getDay() === idx;
                });
                const isChecked = hasTripOnDay;
                return (
                  <div key={day} className="flex flex-col items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                      {day}
                    </span>
                    <div
                      className={cn(
                        "w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all",
                        isChecked
                          ? "bg-teal-500 text-white shadow-[0_4px_10px_rgba(20,184,166,0.3)]"
                          : "bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 border-dashed text-slate-400",
                      )}
                    >
                      {isChecked ? (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      ) : (
                        <div className="w-3 h-0.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
                      )}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        )}

        <div className="w-full text-center">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Período:{" "}
            {sDate.toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
            })}{" "}
            a{" "}
            {eDate.toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* CARD 3: HISTÓRICO DE CLASSIFICAÇÃO */}
      <div className="w-full rounded-[24px] flex flex-col relative shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] bg-white dark:bg-[#1A1F26] border border-slate-200/80 dark:border-white/5 p-4 sm:p-5">
        <div className="flex justify-between items-center w-full mb-3 sm:mb-4">
          <h3 className="text-[11px] sm:text-[13px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            3. HISTÓRICO DE CLASSIFICAÇÃO
          </h3>

          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 border border-slate-200 dark:border-slate-700 shrink-0 ml-1">
            <button
              onClick={() => setClassificationView("Semanal")}
              className={cn(
                "px-2.5 py-1 sm:px-3 rounded-full text-[10px] sm:text-[11px] font-bold shadow-sm transition-all whitespace-nowrap",
                classificationView === "Semanal"
                  ? "bg-teal-500 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              Semanal
            </button>
            <button
              onClick={() => setClassificationView("Mensal")}
              className={cn(
                "px-2.5 py-1 sm:px-3 rounded-full text-[10px] sm:text-[11px] font-bold shadow-sm transition-all whitespace-nowrap",
                classificationView === "Mensal"
                  ? "bg-teal-500 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              Mensal
            </button>
          </div>
        </div>

        <div className="w-full pb-1">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800/60">
                <th className="py-2.5 text-left text-[8px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight sm:tracking-wider w-[28%] whitespace-nowrap">
                  Período
                </th>
                <th className="py-2.5 text-center text-[8px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight sm:tracking-wider w-[18%] whitespace-nowrap">
                  Viagens
                </th>
                <th className="py-2.5 text-center text-[8px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight sm:tracking-wider w-[24%] whitespace-nowrap">
                  Ganhos
                </th>
                <th className="py-2.5 text-right text-[8px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight sm:tracking-wider w-[30%] whitespace-nowrap">
                  Posição no Ranking
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
              {classificationHistory.map((item) => (
                <tr key={item.id}>
                  <td className="py-2.5 sm:py-3 text-[10px] sm:text-[12px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {item.label}
                  </td>
                  <td className="py-2.5 sm:py-3 text-[11px] sm:text-[13px] font-bold text-slate-900 dark:text-white text-center whitespace-nowrap">
                    {item.trips}
                  </td>
                  <td className="py-2.5 sm:py-3 text-[11px] sm:text-[13px] font-bold text-slate-900 dark:text-white text-center whitespace-nowrap">
                    {formatCurrencyExact(item.earnings)}
                  </td>
                  <td className="py-2.5 sm:py-3 text-[11px] sm:text-[13px] font-bold text-slate-900 dark:text-white text-right whitespace-nowrap">
                    {item.position === 1 ||
                    item.position === 2 ||
                    item.position === 3 ? (
                      <span className="text-teal-600 dark:text-teal-400">
                        #{item.position}
                      </span>
                    ) : (
                      <span className="text-slate-900 dark:text-white">
                        #{item.position}
                      </span>
                    )}{" "}
                    <span className="text-slate-400">/ {item.total}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="w-full text-center mt-3 sm:mt-4">
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
            Os dados são atualizados em tempo real.
          </span>
        </div>
      </div>

      {isCustomDateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h4 className="font-bold text-slate-900 dark:text-white">
                Selecionar Período
              </h4>
              <button
                onClick={() => setIsCustomDateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="p-4 flex justify-center overflow-auto max-h-[60vh]">
              <DayPicker
                mode="range"
                selected={customDateRange}
                onSelect={setCustomDateRange}
                className="text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setIsCustomDateModalOpen(false)}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-medium transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
