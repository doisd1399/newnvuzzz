import React, { useState, useEffect, useMemo } from "react";
import { ChevronLeft, Trophy, ChevronDown, List as ListIcon, Building2, Users, ChevronRight, Crown, Calendar, X } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../context/AppContext";
import { useTripsRealtime } from "../hooks/useTripsRealtime";
import { groupMetricsByCompany, groupMetricsByDriver, getStartOfDay, getEndOfDay, getWeeklyRange, getMonthlyRange, getCustomRange } from "../lib/metricsEngine";
import { cn } from "../lib/utils";

export default function RankingGlobal() {
  const navigate = useNavigate();
  const { 
    activeCompanyId, 
    globalPeriodPreset: periodPreset, 
    setGlobalPeriodPreset: setPeriodPreset, 
    globalStartDateStr: startDateStr, 
    setGlobalStartDateStr: setStartDateStr, 
    globalEndDateStr: endDateStr, 
    setGlobalEndDateStr: setEndDateStr 
  } = useAppStore();

  const { trips } = useTripsRealtime();
  const [companies, setCompanies] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [simulator, setSimulator] = useState("Todos os simuladores");
  const [rankingType, setRankingType] = useState<"entre" | "interno">("entre");
  const [viewType, setViewType] = useState<"podio" | "lista">("podio");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  const [showDatePicker, setShowDatePicker] = useState(false);

  // Initialize with current month for fallback
  useEffect(() => {
    if (!startDateStr && !endDateStr) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const pad = (n: number) => n.toString().padStart(2, '0');
      setStartDateStr(`${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`);
      setEndDateStr(`${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`);
    }
  }, [startDateStr, endDateStr, setStartDateStr, setEndDateStr]);

  const formatDateBR = (isoString: string) => {
    if (!isoString) return "";
    const [year, month, day] = isoString.split("-");
    return `${day}/${month}/${year}`;
  };

  useEffect(() => {
    const unsubCompanies = onSnapshot(collection(db, "frotas"), (snap) => {
      setCompanies(snap.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    });
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    });

    return () => {
      unsubCompanies();
      unsubUsers();
    };
  }, []);

  // When opening, if it's internal ranking, auto-select active company
  useEffect(() => {
    if (rankingType === "interno" && !selectedCompanyId && activeCompanyId) {
      setSelectedCompanyId(activeCompanyId);
    }
  }, [rankingType, activeCompanyId, selectedCompanyId]);

  const uniqueSimulators = useMemo(() => {
    const sims = new Set<string>();
    companies.forEach((c) => {
      if (c.simulatorName) sims.add(c.simulatorName);
    });
    return Array.from(sims).sort();
  }, [companies]);

  const filteredCompaniesForDropdown = useMemo(() => {
    return companies.filter(c => simulator === "Todos os simuladores" || c.simulatorName === simulator);
  }, [companies, simulator]);

  useEffect(() => {
    if (rankingType === "interno" && selectedCompanyId) {
       const isValid = filteredCompaniesForDropdown.some(c => c.id === selectedCompanyId);
       if (!isValid) {
         setSelectedCompanyId(filteredCompaniesForDropdown.length > 0 ? filteredCompaniesForDropdown[0].id : "");
       }
    }
  }, [simulator, rankingType, filteredCompaniesForDropdown, selectedCompanyId]);

  const rankingData = useMemo(() => {
    let sDate, eDate;

    if (periodPreset === "semana") {
      const { start, end } = getWeeklyRange();
      sDate = start;
      eDate = end;
    } else if (periodPreset === "mes") {
      const { start, end } = getMonthlyRange();
      sDate = start;
      eDate = end;
    } else {
      if (startDateStr && endDateStr) {
        const { start, end } = getCustomRange(startDateStr, endDateStr);
        sDate = start;
        eDate = end;
      } else {
        sDate = startDateStr ? getStartOfDay(startDateStr) : undefined;
        eDate = endDateStr ? getEndOfDay(endDateStr) : undefined;
      }
    }

    if (rankingType === "entre") {
      return groupMetricsByCompany(trips, sDate, eDate, simulator, companies);
    } else {
      return groupMetricsByDriver(trips, sDate, eDate, selectedCompanyId, users, simulator, companies);
    }
  }, [periodPreset, rankingType, trips, companies, simulator, selectedCompanyId, users, startDateStr, endDateStr]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const getInitials = (name: string) => {
    return name?.substring(0, 2).toUpperCase() || "UN";
  };

  const renderLogo = (item: any, size: "lg" | "md" | "sm" = "md") => {
    const sizeClasses = {
      lg: "w-14 h-14 sm:w-16 sm:h-16",
      md: "w-11 h-11 sm:w-14 sm:h-14",
      sm: "w-9 h-9 sm:w-12 sm:h-12"
    };

    if (item.logo) {
      return (
        <img src={item.logo} alt={item.name} className={`${sizeClasses[size]} rounded-full object-cover bg-white shrink-0 shadow-sm border border-gray-100 dark:border-gray-800`} />
      );
    }
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-gray-100 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-sm text-gray-400 dark:text-slate-400 font-bold ${size === "lg" ? "text-lg" : "text-base"}`}>
        {getInitials(item.name)}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1115] text-gray-900 dark:text-slate-200 font-sans pb-10 transition-colors">
      {/* Header */}
      <div className="pt-10 pb-4 px-4 flex items-center justify-between sticky top-0 z-20 bg-gray-50/90 dark:bg-[#0F1115]/90 backdrop-blur-md border-b border-gray-200 dark:border-transparent transition-colors">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/5 transition-colors">
          <ChevronLeft size={24} className="text-gray-600 dark:text-slate-300" />
        </button>
        <div className="text-center flex-1">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Ranking Global</h1>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Classificação por ganhos</p>
        </div>
        <div className="p-2">
          <Trophy size={22} className="text-yellow-500" />
        </div>
      </div>

      <div className="px-4 space-y-4 max-w-lg mx-auto pt-6">
        {/* Controls Layout */}
        <div className="flex items-end justify-between gap-3">
          {/* Simulador */}
          <div className="space-y-1.5 flex-1">
            <label className="text-xs font-semibold text-gray-700 dark:text-slate-400 px-1">Simulador</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-slate-400">
                <Building2 size={14} />
              </div>
              <select
                value={simulator}
                onChange={(e) => setSimulator(e.target.value)}
                className="w-full h-10 bg-white dark:bg-[#1A1D24] border border-gray-200 dark:border-[#2A2F3A] text-gray-800 dark:text-slate-200 text-sm rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block pl-9 pr-9 py-1 transition-colors outline-none appearance-none font-medium shadow-sm"
              >
                <option value="Todos os simuladores">Todos os simuladores</option>
                {uniqueSimulators.map(sim => (
                  <option key={sim} value={sim}>{sim}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 dark:text-slate-400">
                <ChevronDown size={14} />
              </div>
            </div>
          </div>

          <button 
            onClick={() => setShowDatePicker(true)}
            className="w-10 h-10 shrink-0 bg-white dark:bg-[#1A1D24] flex items-center justify-center rounded-xl border border-gray-200 dark:border-[#2A2F3A] shadow-sm text-gray-500 dark:text-slate-400 hover:text-blue-500 transition-colors"
          >
            <Calendar size={18} />
          </button>
        </div>

        {/* Date Period Indicator */}
        <div className="flex items-center justify-center px-1">
          <p className="text-[11px] font-medium text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-[#1A1D24] px-3 py-1 rounded-full border border-gray-200 dark:border-[#2A2F3A]">
            Período: {periodPreset === "semana" ? "Semana Atual" : periodPreset === "mes" ? "Mês Atual" : (startDateStr || endDateStr) ? `${startDateStr ? formatDateBR(startDateStr) : "Início"} até ${endDateStr ? formatDateBR(endDateStr) : "Hoje"}` : "Sem filtro de data"}
          </p>
        </div>

        {/* Tipo de Ranking */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-700 dark:text-slate-400 px-1">Tipo de ranking</label>
          <div className="flex bg-white dark:bg-[#1A1D24] border border-gray-200 dark:border-[#2A2F3A] rounded-xl p-1 shadow-sm h-10">
            <button
              onClick={() => setRankingType("entre")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-lg text-xs font-bold transition-all ${
                rankingType === "entre" ? "bg-gray-100 dark:bg-[#283142] text-blue-600 dark:text-blue-400 shadow-sm border border-gray-200 dark:border-transparent" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
              }`}
            >
              <Building2 size={14} />
              Entre empresas
            </button>
            <button
              onClick={() => setRankingType("interno")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-lg text-xs font-bold transition-all ${
                rankingType === "interno" ? "bg-gray-100 dark:bg-[#283142] text-blue-600 dark:text-blue-400 shadow-sm border border-gray-200 dark:border-transparent" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
              }`}
            >
              <Users size={14} />
              Interno
            </button>
          </div>
        </div>

        {/* Selected Company Dropdown when Interno */}
        {rankingType === "interno" && (
          <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
            <label className="text-xs font-semibold text-gray-700 dark:text-slate-400 px-1">Selecione a empresa</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-slate-400">
                <Building2 size={14} />
              </div>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full h-10 bg-white dark:bg-[#1A1D24] border border-gray-200 dark:border-[#2A2F3A] text-gray-800 dark:text-slate-200 text-sm rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block pl-9 pr-9 py-1 transition-colors outline-none appearance-none font-medium shadow-sm"
              >
                <option value="">Selecione...</option>
                {filteredCompaniesForDropdown.map(c => (
                  <option key={c.id} value={c.id}>{c.name || c.companyName}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 dark:text-slate-400">
                <ChevronDown size={14} />
              </div>
            </div>
          </div>
        )}

        {/* Visualização */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-700 dark:text-slate-400 px-1">Visualização</label>
          <div className="flex bg-white dark:bg-[#1A1D24] border border-gray-200 dark:border-[#2A2F3A] rounded-xl p-1 shadow-sm h-10">
            <button
              onClick={() => setViewType("podio")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-lg text-xs font-bold transition-all ${
                viewType === "podio" ? "bg-gray-100 dark:bg-[#283142] text-yellow-600 dark:text-yellow-500 shadow-sm border border-gray-200 dark:border-transparent" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
              }`}
            >
              <Trophy size={16} />
              Pódio
            </button>
            <button
              onClick={() => setViewType("lista")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                viewType === "lista" ? "bg-gray-100 dark:bg-[#283142] text-gray-800 dark:text-slate-200 shadow-sm border border-gray-200 dark:border-transparent" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
              }`}
            >
              <ListIcon size={14} />
              Lista
            </button>
          </div>
        </div>

        <div className="mt-6 sm:mt-8">
          {viewType === "podio" && (
            <div className="relative pt-6 pb-2 w-full max-w-full">
              <div className="absolute inset-0 flex justify-center -translate-y-4 pointer-events-none opacity-20 dark:opacity-40">
                <div className="w-48 h-48 sm:w-64 sm:h-64 bg-yellow-500/30 dark:bg-yellow-500/20 blur-[60px] sm:blur-[80px] rounded-full"></div>
              </div>

              <div className="flex items-end justify-center gap-1.5 sm:gap-3 relative z-10 mx-auto w-full px-1">
                {/* 2nd Place */}
                <div className="flex-1 flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 max-w-[120px] sm:max-w-[140px]">
                  <div className="bg-white dark:bg-[#1C2028] border border-gray-200 dark:border-[#3C475A] rounded-xl sm:rounded-2xl p-2 sm:p-3 w-full flex flex-col items-center shadow-md dark:shadow-lg dark:shadow-blue-900/10 relative overflow-hidden group min-h-[140px] sm:min-h-[160px]">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-slate-300 to-slate-500 opacity-80 dark:opacity-50"></div>
                    <div className="bg-slate-500 dark:bg-slate-700/80 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full mb-2 shadow-[0_0_10px_rgba(100,116,139,0.3)] dark:shadow-[0_0_10px_rgba(200,200,200,0.3)] border border-slate-300 dark:border-slate-500/50">2º</div>
                    
                    {rankingData[1] ? (
                      <>
                        {renderLogo(rankingData[1], "md")}
                        <h3 className="text-gray-900 dark:text-white text-[11px] sm:text-[13px] font-bold mt-2 text-center w-full px-0.5 line-clamp-2 leading-tight">{rankingData[1].name}</h3>
                        <p className="text-blue-600 dark:text-blue-300 font-extrabold text-[12px] sm:text-sm mt-0.5 shrink-0 whitespace-nowrap">{formatCurrency(rankingData[1].val)}</p>
                        <div className="flex items-center gap-1 mt-1.5 bg-gray-50 dark:bg-black/40 border border-gray-100 dark:border-none px-1.5 py-0.5 rounded-md w-full justify-center">
                          <span className="text-[9px] sm:text-[10px] text-gray-500 dark:text-slate-300 whitespace-nowrap font-medium">{rankingData[1].trips} viagens</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center flex-1 py-2 h-full">
                         <span className="text-[10px] sm:text-xs text-gray-400 dark:text-slate-500 font-medium text-center">Sem classificação</span>
                      </div>
                    )}
                  </div>
                  {/* Podium base */}
                  <div className="w-[85%] h-5 sm:h-7 bg-gradient-to-b from-slate-200 to-slate-300 dark:from-slate-400/80 dark:to-slate-600/30 rounded-t-lg sm:rounded-t-xl mt-[-2px] -z-10 dark:shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)] relative">
                     <div className="absolute inset-x-0 top-0 h-[1px] bg-slate-100 dark:bg-slate-200/50"></div>
                  </div>
                </div>

                {/* 1st Place */}
                <div className="flex-[1.1] sm:flex-[1.2] flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-500 z-20 min-w-[110px] sm:min-w-[130px] max-w-[130px] sm:max-w-[160px]">
                  {rankingData[0] ? (
                    <Crown size={36} className="text-yellow-500 dark:text-yellow-400 mb-1 fill-yellow-400/30 dark:fill-yellow-400/20 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)] dark:drop-shadow-[0_0_15px_rgba(250,204,21,0.5)] sm:w-[44px] sm:h-[44px]" strokeWidth={1.5} />
                  ) : (
                    <div className="h-10 sm:h-[48px] w-full invisible"><Crown size={36} /></div>
                  )}
                  <div className="bg-white dark:bg-[#1C2028] border-2 border-yellow-400/50 dark:border-yellow-500/50 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 w-full flex flex-col items-center shadow-xl shadow-yellow-500/20 dark:shadow-yellow-500/10 relative overflow-hidden min-h-[160px] sm:min-h-[190px] z-10">
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-yellow-300 via-yellow-500 to-yellow-600 opacity-90 dark:opacity-80"></div>
                    <div className="absolute inset-0 bg-yellow-500/5 mix-blend-multiply dark:mix-blend-screen pointer-events-none"></div>
                    
                    <div className="bg-gradient-to-b from-yellow-400 to-yellow-600 text-white text-[11px] sm:text-sm font-extrabold px-3 py-0.5 rounded-full mb-2 shadow-[0_0_15px_rgba(234,179,8,0.4)] dark:shadow-[0_0_15px_rgba(250,204,21,0.4)] border border-yellow-300/50">1º</div>
                    
                    {rankingData[0] ? (
                      <>
                        {renderLogo(rankingData[0], "lg")}
                        <h3 className="text-gray-900 dark:text-white text-[12px] sm:text-[14px] font-extrabold mt-2 text-center w-full px-0.5 line-clamp-2 leading-tight">{rankingData[0].name}</h3>
                        <p className="text-yellow-600 dark:text-yellow-400 font-black text-[13px] sm:text-base mt-0.5 shrink-0 drop-shadow-sm dark:drop-shadow-md whitespace-nowrap">{formatCurrency(rankingData[0].val)}</p>
                        <div className="flex items-center gap-1 mt-1.5 bg-yellow-50 dark:bg-black/50 border border-yellow-100 dark:border-none px-1.5 py-0.5 rounded-md w-full justify-center">
                          <span className="text-[10px] sm:text-[11px] text-yellow-800 dark:text-slate-300 whitespace-nowrap font-bold dark:font-medium">{rankingData[0].trips} viagens</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center flex-1 h-full w-full">
                        <span className="text-[11px] sm:text-[13px] text-yellow-600/60 dark:text-yellow-500/50 font-bold text-center">Vaga disponível</span>
                      </div>
                    )}
                  </div>
                  {/* Podium base */}
                  <div className="w-[90%] h-7 sm:h-9 bg-gradient-to-b from-yellow-400 to-yellow-600 dark:from-yellow-600/80 dark:to-yellow-900/30 rounded-t-lg sm:rounded-t-xl mt-[-2px] -z-10 shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)] relative">
                    <div className="absolute inset-x-0 top-0 h-[1px] bg-yellow-100 dark:bg-yellow-200/50"></div>
                  </div>
                </div>

                {/* 3rd Place */}
                <div className="flex-1 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 max-w-[120px] sm:max-w-[140px]">
                  <div className="bg-white dark:bg-[#1C2028] border border-gray-200 dark:border-[#523A28] rounded-xl sm:rounded-2xl p-2 sm:p-3 w-full flex flex-col items-center shadow-md dark:shadow-lg dark:shadow-orange-900/10 relative overflow-hidden group min-h-[110px] sm:min-h-[140px]">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-orange-300 to-orange-500 opacity-80 dark:opacity-40"></div>
                    <div className="bg-orange-600 dark:bg-[#8A5A44]/80 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full mb-2 shadow-[0_0_10px_rgba(234,88,12,0.3)] dark:shadow-[0_0_10px_rgba(138,90,68,0.3)] border border-orange-400 dark:border-orange-500/40">3º</div>
                    
                    {rankingData[2] ? (
                      <>
                        {renderLogo(rankingData[2], "md")}
                        <h3 className="text-gray-900 dark:text-white text-[11px] sm:text-[13px] font-bold mt-2 text-center w-full px-0.5 line-clamp-2 leading-tight">{rankingData[2].name}</h3>
                        <p className="text-orange-600 dark:text-orange-400 font-extrabold text-[12px] sm:text-sm mt-0.5 shrink-0 whitespace-nowrap">{formatCurrency(rankingData[2].val)}</p>
                        <div className="flex items-center gap-1 mt-1.5 bg-gray-50 dark:bg-black/40 border border-gray-100 dark:border-none px-1.5 py-0.5 rounded-md w-full justify-center">
                          <span className="text-[9px] sm:text-[10px] text-gray-500 dark:text-slate-300 whitespace-nowrap font-medium">{rankingData[2].trips} viagens</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center flex-1 py-2 h-full">
                         <span className="text-[10px] sm:text-xs text-gray-400 dark:text-slate-500 font-medium text-center">Sem classificação</span>
                      </div>
                    )}
                  </div>
                  {/* Podium base */}
                  <div className="w-[85%] h-4 sm:h-5 bg-gradient-to-b from-orange-200 to-orange-300 dark:from-orange-800/80 dark:to-orange-950/30 rounded-t-lg sm:rounded-t-xl mt-[-2px] -z-10 dark:shadow-[inset_0_2px_4px_rgba(255,255,255,0.2)] relative">
                     <div className="absolute inset-x-0 top-0 h-[1px] bg-orange-100 dark:bg-orange-300/40"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* List items below Podium or for List View */}
          <div className="mt-8 space-y-3 pb-6">
            {rankingData.slice(viewType === "podio" ? 3 : 0).map((item, index) => {
              const actualRank = viewType === "podio" ? index + 4 : index + 1;
              let rankStyle = "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400";
              let itemBorderColor = "border-gray-100 dark:border-[#2A2F3A]";

              if (actualRank === 1) {
                 rankStyle = "bg-yellow-50 text-yellow-600 border border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-500 dark:border-yellow-500/30 shadow-sm dark:shadow-[0_0_10px_rgba(250,204,21,0.2)]";
                 itemBorderColor = "border-yellow-200/50 dark:border-yellow-500/20";
              } else if (actualRank === 2) {
                 rankStyle = "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-300/20 dark:text-slate-300 dark:border-slate-300/30 shadow-sm";
              } else if (actualRank === 3) {
                 rankStyle = "bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30 shadow-sm";
              }

              return (
                <div key={item.id} className={`flex items-center justify-between gap-3 p-3 sm:p-4 bg-white dark:bg-[#1A1D24] rounded-2xl hover:bg-gray-50 dark:hover:bg-[#1F232B] transition-colors border ${itemBorderColor} hover:border-gray-200 dark:hover:border-[#3A4050] shadow-sm group cursor-pointer animate-in fade-in slide-in-from-bottom-2`} style={{ animationDelay: `${index * 50}ms` }}>
                  <div className="flex items-center gap-3 w-full max-w-[65%]">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[13px] sm:text-sm font-black shrink-0 ${rankStyle}`}>
                      {actualRank}º
                    </div>
                    {renderLogo(item, "sm")}
                    <div className="flex flex-col min-w-0 pr-1">
                      <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight">{item.name}</p>
                      <div className="mt-1">
                        <span className="text-[11px] sm:text-xs text-gray-500 dark:text-slate-400 font-medium bg-gray-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded-md whitespace-nowrap">{item.trips} viagens</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 pl-2">
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold mb-0.5 whitespace-nowrap">Ganhos totais</span>
                    <p className="text-[14px] sm:text-lg font-black text-green-600 dark:text-green-500 tracking-tight">{formatCurrency(item.val)}</p>
                  </div>
                </div>
              );
            })}
            
            {viewType === "lista" && rankingData.length === 0 && (
              <div className="text-center py-10 bg-white dark:bg-[#1A1D24] border border-gray-200 dark:border-[#2A2F3A] rounded-2xl shadow-sm">
                <Trophy size={48} className="mx-auto text-gray-300 dark:text-slate-700 mb-4" />
                <p className="text-gray-500 dark:text-slate-400 font-semibold text-sm">Nenhum dado encontrado para o filtro atual.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1C2028] border border-gray-200 dark:border-[#2A2F3A] p-5 rounded-2xl w-full max-w-sm shadow-2xl relative">
            <button 
              onClick={() => setShowDatePicker(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Filtrar por Período</h3>
            
            <div className="flex bg-gray-50 dark:bg-[#1A1D24] border border-gray-200 dark:border-[#2A2F3A] rounded-xl p-1 shadow-sm h-10 mb-4">
              <button
                onClick={() => setPeriodPreset("semana")}
                className={cn(
                  "flex-1 rounded-[8px] text-[12px] font-bold transition-all hover:shadow-sm",
                  periodPreset === "semana"
                    ? "bg-white dark:bg-[#283142] text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-slate-300 hover:bg-white/50"
                )}
              >
                Semana Atual
              </button>
              <button
                onClick={() => setPeriodPreset("mes")}
                className={cn(
                  "flex-1 rounded-[8px] text-[12px] font-bold transition-all hover:shadow-sm",
                  periodPreset === "mes"
                    ? "bg-white dark:bg-[#283142] text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-slate-300 hover:bg-white/50"
                )}
              >
                Mês Atual
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5 block">Data Inicial</label>
                <input 
                  type="date" 
                  value={startDateStr}
                  onChange={(e) => {
                    setStartDateStr(e.target.value);
                    setPeriodPreset("custom");
                  }}
                  className="w-full h-11 bg-gray-50 dark:bg-[#1A1D24] border border-gray-200 dark:border-[#2A2F3A] text-gray-900 dark:text-white rounded-xl px-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5 block">Data Final</label>
                <input 
                  type="date" 
                  value={endDateStr}
                  onChange={(e) => {
                    setEndDateStr(e.target.value);
                    setPeriodPreset("custom");
                  }}
                  className="w-full h-11 bg-gray-50 dark:bg-[#1A1D24] border border-gray-200 dark:border-[#2A2F3A] text-gray-900 dark:text-white rounded-xl px-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                />
              </div>
              <div className="pt-2">
                <button 
                  onClick={() => setShowDatePicker(false)}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-sm"
                >
                  Aplicar Filtro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
