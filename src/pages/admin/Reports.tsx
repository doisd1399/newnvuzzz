import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Calendar, 
  Building2, 
  Users, 
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ArrowLeft,
  Info 
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../context/AppContext";
import { normalizeTrip, getFilteredTrips } from "../../lib/metricsEngine";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, getWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTripHistory } from "../../hooks/useTripHistory";

export default function Reports({
  defaultDriverId,
  hideHeader = false,
  isInsideAdminTab = false,
}: {
  defaultDriverId?: string;
  hideHeader?: boolean;
  isInsideAdminTab?: boolean;
} = {}) {
  const navigate = useNavigate();
  const { activeCompanyId, users = [], activeRole, currentUser } = useAppStore();
  const { historicoTrips = [] } = useTripHistory(activeCompanyId);
  const [period, setPeriod] = useState<"semanal" | "mensal">("semanal");
  const [mode, setMode] = useState<"empresa" | "funcionarios">("funcionarios"); // Default to funcionarios if we pass driverId
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(defaultDriverId || null);

  
  const [visibleItems, setVisibleItems] = useState(5);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const validTrips = useMemo(() => {
    const normalizedTrips = historicoTrips.map(t => normalizeTrip(t as any));
    const filtered = getFilteredTrips(normalizedTrips, undefined, undefined, activeCompanyId);
    return filtered.map(t => ({ ...t, parsedDate: t.metricDate, val: t.normalizedValor, fieldUsed: 'metricDate' }));
  }, [historicoTrips, activeCompanyId]);

  const generateHistory = (trips: any[], currentPeriod: "semanal" | "mensal") => {
    const groups: Record<string, {
      id: string;
      title: string;
      subTitle: string;
      totalValue: number;
      tripCount: number;
      sortDate: Date;
    }> = {};

    trips.forEach((trip: any) => {
      const date = trip.parsedDate;
      if (!date || isNaN(date.getTime())) return;
      
      let key = "";
      let subTitle = "";
      let sortDate = date;

      if (currentPeriod === "semanal") {
        const start = startOfWeek(date, { weekStartsOn: 1 });
        const end = endOfWeek(date, { weekStartsOn: 1 });
        key = format(start, "yyyy-MM-dd");
        subTitle = `${format(start, "dd/MM/yyyy")} até ${format(end, "dd/MM/yyyy")}`;
        sortDate = start;
      } else {
        const start = startOfMonth(date);
        key = format(start, "yyyy-MM");
        const monthName = format(date, "MMMM yyyy", { locale: ptBR });
        subTitle = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        sortDate = start;
      }

      if (!groups[key]) {
        groups[key] = { id: key, title: "", subTitle, totalValue: 0, tripCount: 0, sortDate };
      }
      
      groups[key].tripCount += 1;
      groups[key].totalValue += trip.val;
    });

    const sorted = Object.values(groups).sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
    
    const withVariations = sorted.map((item, index) => {
      const avgTicket = item.tripCount > 0 ? item.totalValue / item.tripCount : 0;
      let variation = 0;
      if (index > 0) {
        const prev = sorted[index - 1].totalValue;
        if (prev > 0) {
          variation = ((item.totalValue - prev) / prev) * 100;
        } else if (item.totalValue > 0) {
          variation = 100;
        }
      }
      
      const title = currentPeriod === "semanal" 
        ? `Semana Operacional ${index + 1}` 
        : `Mês Operacional ${index + 1}`;

      return { ...item, title, avgTicket, variation, hasPrevious: index > 0 };
    });

    const reversed = withVariations.reverse();
    
    if (currentPeriod === "semanal") {
      console.log(`[DIAGNÓSTICO 5] Quantidade de grupos semanais encontrados: ${reversed.length}`);
      console.log(`[DIAGNÓSTICO 3] Lista dos períodos semanais gerados:`, reversed.map(r => r.title));
    } else {
      console.log(`[DIAGNÓSTICO 6] Quantidade de grupos mensais encontrados: ${reversed.length}`);
      console.log(`[DIAGNÓSTICO 4] Lista dos períodos mensais gerados:`, reversed.map(r => r.title));
    }
    
    return reversed;
  };

  const diagWeeklyHistory = useMemo(() => generateHistory(validTrips, "semanal"), [validTrips]);
  const diagMonthlyHistory = useMemo(() => generateHistory(validTrips, "mensal"), [validTrips]);

  const diagDateRange = useMemo(() => {
    if (validTrips.length === 0) return null;
    let minDate = validTrips[0].parsedDate;
    let maxDate = validTrips[0].parsedDate;
    validTrips.forEach((t: any) => {
      if (t.parsedDate < minDate) minDate = t.parsedDate;
      if (t.parsedDate > maxDate) maxDate = t.parsedDate;
    });
    return { minDate, maxDate };
  }, [validTrips]);

  const fieldCounts = useMemo(() => {
    return validTrips.reduce((acc: any, trip: any) => {
      acc[trip.fieldUsed] = (acc[trip.fieldUsed] || 0) + 1;
      return acc;
    }, {});
  }, [validTrips]);

  const companyHistory = useMemo(() => {
    if (mode !== "empresa") return [];
    return generateHistory(validTrips, period);
  }, [validTrips, mode, period]);

  const driverHistory = useMemo(() => {
    if (mode !== "funcionarios" || !selectedDriverId) return [];
    const driverTrips = validTrips.filter((t: any) => t.motoristaId === selectedDriverId);
    return generateHistory(driverTrips, period);
  }, [validTrips, mode, selectedDriverId, period]);

  const activeDrivers = useMemo(() => {
    const MapDrivers: Record<string, string> = {};
    validTrips.forEach((trip: any) => {
      if (trip.motoristaId) {
        MapDrivers[trip.motoristaId] = trip.motoristaNome || "Motorista sem nome";
      }
    });

    const driversObj = Object.keys(MapDrivers).map(id => ({
      id,
      name: MapDrivers[id]
    }));

    const sortedDrivers = driversObj.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`[Relatórios] Quantidade de motoristas encontrados: ${sortedDrivers.length}`, sortedDrivers);
    
    if (sortedDrivers.length === 0) {
      console.log(`[Relatórios] Nenhum motorista encontrado. Motivo: Nenhuma viagem válida (status concluída) com motoristaId foi encontrada no histórico da empresa ativa ${activeCompanyId}.`);
    }

    return sortedDrivers;
  }, [validTrips, activeCompanyId]);

  const handleLoadMore = () => {
    setVisibleItems((prev) => prev + 5);
  };

  const handleModeChange = (newMode: "empresa" | "funcionarios") => {
    setMode(newMode);
    setSelectedDriverId(null);
    setVisibleItems(5);
  };

  const handlePeriodChange = (newPeriod: "semanal" | "mensal") => {
    setPeriod(newPeriod);
    setVisibleItems(5);
  };

  const renderHistoryList = (list: any[]) => {
    console.log(`[DIAGNÓSTICO 11] Array enviado para renderização da lista (${period}):`, list.map(item => item.title));
    console.log(`[DIAGNÓSTICO 7] Quantidade de cards efetivamente renderizados: ${Math.min(list.length, visibleItems)} de ${list.length}`);

    if (list.length === 0) {
      return (
        <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[12px] shadow-sm px-4 py-8 flex flex-col items-center justify-center text-center">
          <span className="text-[15px] font-medium text-slate-600 dark:text-slate-400">
            Nenhum dado encontrado para o histórico {period}.
          </span>
        </div>
      );
    }
    
    return (
        <div className="space-y-2.5">
          {list.slice(0, visibleItems).map((item) => (
            <div key={item.id} className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[12px] shadow-sm p-3.5 flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-slate-900 dark:text-white leading-tight">
                  {item.title}
                </span>
                <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 leading-none">
                  {item.subTitle.includes(' até ') ? (
                    `${item.subTitle.split(' até ')[0]} até ${item.subTitle.split(' até ')[1]}`
                  ) : (
                    item.subTitle
                  )}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 dark:bg-black/20 rounded-[8px] p-2 flex flex-col items-center justify-center border border-slate-100 dark:border-[#2A2F3A]/50 text-center">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center leading-none uppercase tracking-wider break-normal">Ganhos</span>
                  <span className="text-[13px] sm:text-[14px] font-bold text-emerald-600 dark:text-emerald-400 leading-tight break-all">
                    {formatCurrency(item.totalValue)}
                  </span>
                </div>
                
                <div className="bg-slate-50 dark:bg-black/20 rounded-[8px] p-2 flex flex-col items-center justify-center border border-slate-100 dark:border-[#2A2F3A]/50 text-center">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center leading-none uppercase tracking-wider break-normal">Viagens</span>
                  <span className="text-[13px] sm:text-[14px] font-bold text-slate-800 dark:text-slate-200 leading-tight break-words flex flex-wrap items-center justify-center">
                    {item.tripCount} <span className="text-[12px] font-medium ml-1">viagens</span>
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-[#2A2F3A] flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-none mt-0.5">Ticket Médio:</span>
                  <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 leading-none">{formatCurrency(item.avgTicket)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-none mt-0.5">Desempenho:</span>
                  {item.hasPrevious ? (
                    <div className={cn("flex items-center gap-0.5 text-[12px] font-semibold leading-none", item.variation > 0 ? "text-emerald-600 dark:text-emerald-400" : item.variation < 0 ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400")}>
                      {item.variation > 0 ? <ArrowUpRight size={14} className="shrink-0" /> : item.variation < 0 ? <ArrowDownRight size={14} className="shrink-0" /> : <Minus size={14} className="shrink-0" />}
                      {Math.abs(item.variation).toFixed(1)}%
                    </div>
                  ) : (
                    <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500 leading-none">-</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {visibleItems < list.length && (
            <button 
              onClick={handleLoadMore}
              className="w-full bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] text-emerald-600 dark:text-emerald-400 font-bold py-2.5 rounded-[12px] flex items-center justify-center gap-2 mt-4 shadow-sm hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors text-[14px]"
            >
              Carregar mais registros
              <ChevronDown size={16} />
            </button>
          )}
        </div>
    );
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#09090b] font-sans pb-8 w-full box-border">
      <div className="max-w-[900px] mx-auto flex flex-col gap-4 pt-4 sm:pt-6 w-full px-4 sm:px-4 md:px-0 box-border">
        
        {/* Header Container */}
        {!hideHeader && (
        <div className="px-1 mb-2 flex items-center gap-2.5">
          <button 
            onClick={() => navigate(activeRole === "admin" ? "/admin" : "/driver")}
            className="w-7 h-7 rounded-full bg-slate-200 dark:bg-[#1A1F26] flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-[#2A2F3A] transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex flex-col justify-center">
            <h1 className="text-[16px] sm:text-[18px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">
              Relatórios
            </h1>
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mt-1 leading-none">
              Fechamento de entregas e ganhos
            </p>
          </div>
        </div>
        )}

        <div className="space-y-3">
          {/* Period Selector */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => handlePeriodChange("semanal")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-1.5 px-3 min-h-[42px] rounded-[10px] border text-[13px] sm:text-[14px] font-bold transition-colors",
                period === "semanal"
                  ? "bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-500/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "bg-white dark:bg-[#1A1F26] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#2A2F3A]"
              )}
            >
              <Calendar size={15} className="shrink-0" />
              Semanal
            </button>
            <button
              onClick={() => handlePeriodChange("mensal")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-1.5 px-3 min-h-[42px] rounded-[10px] border text-[13px] sm:text-[14px] font-bold transition-colors",
                period === "mensal"
                  ? "bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-500/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "bg-white dark:bg-[#1A1F26] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#2A2F3A]"
              )}
            >
              <Calendar size={15} className="shrink-0" />
              Mensal
            </button>
          </div>

          {!defaultDriverId && (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => handleModeChange("empresa")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-1.5 px-3 min-h-[42px] rounded-[10px] border text-[13px] sm:text-[14px] font-bold transition-colors",
                mode === "empresa"
                  ? "bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-500/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "bg-white dark:bg-[#1A1F26] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#2A2F3A]"
              )}
            >
              <Building2 size={15} className="shrink-0" />
              Da Empresa
            </button>
            <button
              onClick={() => handleModeChange("funcionarios")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-1.5 px-3 min-h-[42px] rounded-[10px] border text-[13px] sm:text-[14px] font-bold transition-colors",
                mode === "funcionarios"
                  ? "bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-500/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "bg-white dark:bg-[#1A1F26] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#2A2F3A]"
              )}
            >
              <Users size={15} className="shrink-0" />
              Dos Funcionários
            </button>
          </div>
          )}
        </div>

        {mode === "empresa" && (
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-[3px] h-[16px] bg-emerald-600 rounded-full"></div>
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">Histórico de Fechamento</h2>
            </div>
            {renderHistoryList(companyHistory)}
          </div>
        )}

        {mode === "funcionarios" && !selectedDriverId && (
          <div className="mt-5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 mb-1 px-1">
              <div className="w-[3px] h-[16px] bg-emerald-600 rounded-full"></div>
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">
                Selecione um Motorista
              </h2>
            </div>
            
            {activeDrivers.length === 0 ? (
              <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[12px] shadow-sm px-4 py-8 flex flex-col items-center justify-center text-center">
                <span className="text-[15px] font-medium text-slate-600 dark:text-slate-400">Nenhum motorista ativo encontrado.</span>
              </div>
            ) : (
              <>
                {activeDrivers.map((driver) => (
                  <div 
                    key={driver.id} 
                    onClick={() => { setSelectedDriverId(driver.id); setVisibleItems(5); }}
                    className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[12px] shadow-sm px-4 py-3 flex items-center justify-between cursor-pointer hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors"
                  >
                    <div className="flex flex-col gap-1 w-full">
                      <span className="text-[15px] font-semibold text-slate-900 dark:text-white leading-tight truncate">
                         {driver.name}
                      </span>
                      <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 leading-snug">
                         Acessar relatório financeiro individual
                      </span>
                    </div>
                    <div className="shrink-0 flex items-center">
                      <ChevronRight size={18} className="text-slate-400 dark:text-slate-500" />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {mode === "funcionarios" && selectedDriverId && (
          <div className="mt-5">
            <div className="flex items-center gap-3 mb-4 px-1">
              {!defaultDriverId && (
                <button 
                  onClick={() => setSelectedDriverId(null)}
                  className="w-8 h-8 rounded-full bg-slate-200 dark:bg-[#1A1F26] flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-[#2A2F3A] transition-colors shrink-0"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div className="flex flex-col">
                <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">
                  {activeDrivers.find(d => d.id === selectedDriverId)?.name || "Motorista"}
                </h2>
                <span className="text-[12px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">Histórico financeiro individual</span>
              </div>
            </div>

            {renderHistoryList(driverHistory)}
          </div>
        )}

        {/* Info Notice */}
        <div className="mt-5 mb-4">
          <div className="bg-[#f8fafc] dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-[12px] p-3.5 flex gap-2.5 shadow-sm">
            <Info className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={18} />
            <p className="text-[12px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
              Os dados refletem o histórico oficial e excluem entregas rejeitadas, canceladas ou viagens ainda em andamento.
            </p>
          </div>
        </div>
        
        {/* Painel de Diagnóstico */}
        {false && (
        <div className="mt-8 mb-8 p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/30 rounded-[12px]">
          <h3 className="text-[16px] font-bold text-orange-800 dark:text-orange-400 mb-4 flex items-center gap-2">
            <Info size={18} />
            Diagnóstico dos Relatórios (Temporário)
          </h3>
          
          <div className="space-y-4 text-[13px] text-slate-700 dark:text-slate-300">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                <span className="font-semibold block mb-1">Documentos em historico_viagens:</span>
                {historicoTrips.length}
              </div>
              <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                <span className="font-semibold block mb-1">Viagens concluídas (após filtro):</span>
                {validTrips.length}
              </div>
              <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                <span className="font-semibold block mb-1">Semanas geradas:</span>
                {diagWeeklyHistory.length}
              </div>
              <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                <span className="font-semibold block mb-1">Meses gerados:</span>
                {diagMonthlyHistory.length}
              </div>
              <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                <span className="font-semibold block mb-1">Motoristas encontrados:</span>
                {activeDrivers.length}
              </div>
              <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                <span className="font-semibold block mb-1">Cards renderizados na tela atual:</span>
                {Math.min(period === "semanal" ? (mode === "empresa" ? companyHistory.length : driverHistory.length) : (mode === "empresa" ? companyHistory.length : driverHistory.length), visibleItems)}
              </div>
            </div>

            <div className="bg-white/50 dark:bg-black/20 p-3 rounded space-y-2">
              <div>
                <span className="font-semibold">Primeiro período semanal gerado: </span>
                {diagWeeklyHistory.length > 0 ? diagWeeklyHistory[diagWeeklyHistory.length - 1].title : 'Nenhum'}
              </div>
              <div>
                <span className="font-semibold">Último período semanal gerado: </span>
                {diagWeeklyHistory.length > 0 ? diagWeeklyHistory[0].title : 'Nenhum'}
              </div>
              <div>
                <span className="font-semibold">Primeiro período mensal gerado: </span>
                {diagMonthlyHistory.length > 0 ? diagMonthlyHistory[diagMonthlyHistory.length - 1].title : 'Nenhum'}
              </div>
              <div>
                <span className="font-semibold">Último período mensal gerado: </span>
                {diagMonthlyHistory.length > 0 ? diagMonthlyHistory[0].title : 'Nenhum'}
              </div>
            </div>

            <div className="bg-white/50 dark:bg-black/20 p-3 rounded">
              <span className="font-semibold block mb-2">Campos utilizados para agrupamento temporal (efetivo na bateria atual):</span>
              <ul className="list-disc pl-4">
                {Object.entries(fieldCounts).map(([field, count]) => (
                  <li key={field}>{field}: <span className="font-bold">{count as number} viagens</span></li>
                ))}
              </ul>
            </div>

            <div className="bg-white/50 dark:bg-black/20 p-3 rounded space-y-2">
              <span className="font-semibold block mb-1">Alcance temporal das viagens limitadas (min/max):</span>
              {diagDateRange ? (
                <>
                  <div>
                    <span className="font-medium">Primeira viagem: </span>
                    {format(diagDateRange.minDate, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </div>
                  <div>
                    <span className="font-medium">Última viagem: </span>
                    {format(diagDateRange.maxDate, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </div>
                </>
              ) : (
                "Nenhuma viagem encontrada."
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/50 dark:bg-black/20 p-3 rounded">
                <span className="font-semibold block mb-2">Primeiros 20 períodos semanais gerados:</span>
                <ul className="space-y-1">
                  {diagWeeklyHistory.slice(0, 20).map(w => (
                    <li key={w.id}>{w.title} - {w.tripCount} viagens ({formatCurrency(w.totalValue)})</li>
                  ))}
                  {diagWeeklyHistory.length === 0 && <li>Nenhuma semana.</li>}
                </ul>
              </div>
              <div className="bg-white/50 dark:bg-black/20 p-3 rounded">
                <span className="font-semibold block mb-2">Primeiros 20 períodos mensais gerados:</span>
                <ul className="space-y-1">
                  {diagMonthlyHistory.slice(0, 20).map(m => (
                    <li key={m.id}>{m.title} - {m.tripCount} viagens ({formatCurrency(m.totalValue)})</li>
                  ))}
                  {diagMonthlyHistory.length === 0 && <li>Nenhum mês.</li>}
                </ul>
              </div>
            </div>

          </div>
        </div>
        )}
        
      </div>
    </div>
  );
}
