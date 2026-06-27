import React, { useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";
import {
  TrendingUp,
  Target,
  ChevronRight,
  Route,
  X,
  Trophy,
  Activity,
  Star
} from "lucide-react";
import { getWeeklyRange, getMonthlyRange } from "../lib/metricsEngine";
import { differenceInDays } from "date-fns";

export interface DriverPerformanceCardProps {
  historicoTrips: any[];
  driverId: string;
  activeCompanyId: string | null;
  allCompanyMembers: any[];
  posicaoRanking: string | number;
  totalRanking: string | number;
  currentUser: any;
}

export const DriverPerformanceCard = ({
  historicoTrips,
  driverId,
  activeCompanyId,
  allCompanyMembers,
  posicaoRanking,
  totalRanking,
  currentUser,
}: DriverPerformanceCardProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<"semana" | "mes">("semana");

  const sDate = periodPreset === "semana" ? getWeeklyRange().start : getMonthlyRange().start;
  const eDate = periodPreset === "semana" ? getWeeklyRange().end : getMonthlyRange().end;

  const userTrips = historicoTrips.filter((t) => {
    if (t.motoristaId !== driverId) return false;
    const tDate = new Date(t.date || t.completedAt || t.dataFechamento || new Date());
    return tDate >= sDate && tDate <= eDate;
  });

  const viagensRealizadas = userTrips.length;

  const META_SEMANAL = 15;
  const META_MENSAL = 40;
  const metaPorPeriodo = periodPreset === "semana" ? META_SEMANAL : META_MENSAL;

  const periodDays = differenceInDays(eDate, sDate) + 1;
  let propMetaAcumulada = 1;

  if (activeCompanyId) {
    const member = allCompanyMembers.find((m) => m.userId === driverId && m.companyId === activeCompanyId && m.roles?.includes("driver") && m.status === "active");
    if (member && member.joinedAt) {
      const joinDate = new Date(member.joinedAt);
      if (joinDate > eDate) {
        propMetaAcumulada = 0;
      } else {
        const pJoin = joinDate < sDate ? sDate : joinDate;
        const activeDays = differenceInDays(eDate, pJoin) + 1;
        propMetaAcumulada = Math.max(0, Math.min(1, activeDays / periodDays));
      }
    }
  }

  const metaOperacional = Math.round(propMetaAcumulada * metaPorPeriodo);
  const scoreRaw = metaOperacional > 0 ? (viagensRealizadas / metaOperacional) * 100 : 0;
  const score = metaOperacional > 0 ? Math.round(scoreRaw) : viagensRealizadas > 0 ? 100 : 0;
  const viagensRestantes = Math.max(0, metaOperacional - viagensRealizadas);

  const runDays = Math.max(1, differenceInDays(new Date(), sDate) + 1);
  const mediaDiaria = viagensRealizadas / runDays;

  const getClassification = (score: number) => {
    if (score >= 200)
      return {
        text: "👑 Motorista Elite",
        badgeText: "Motorista Elite",
        message: "O motorista demonstra um ritmo operacional extraordinário, dominando a operação.",
        effectClass: "shadow-[0_0_15px_rgba(139,92,246,0.3)] dark:shadow-[0_0_15px_rgba(139,92,246,0.15)]",
        textColor: "text-[#8b5cf6] dark:text-[#a78bfa]",
        iconColor: "text-[#8b5cf6] dark:text-[#a78bfa]",
        bgHover: "hover:bg-violet-50 dark:hover:bg-violet-900/10",
        indicatorColor: "bg-[#8b5cf6]",
        barGradient: "from-violet-400 to-violet-500",
        dotColor: "bg-[#8b5cf6]",
      };
    if (score >= 151)
      return {
        text: "💠 Nível Avançado",
        badgeText: "Nível Avançado",
        message: "O motorista atingiu um padrão de excelência, superando amplamente os objetivos do período.",
        effectClass: "shadow-[0_0_15px_rgba(16,185,129,0.3)] dark:shadow-[0_0_15px_rgba(16,185,129,0.15)]",
        textColor: "text-[#10b981] dark:text-[#34d399]",
        iconColor: "text-[#10b981] dark:text-[#34d399]",
        bgHover: "hover:bg-emerald-50 dark:hover:bg-emerald-900/10",
        indicatorColor: "bg-[#10b981]",
        barGradient: "from-emerald-400 to-emerald-500",
        dotColor: "bg-[#10b981]",
      };
    if (score >= 121)
      return {
        text: "🏅 Além da Meta",
        badgeText: "Além da Meta",
        message: "O motorista superou a meta individual, apresentando excelente volume de viagens.",
        effectClass: "shadow-[0_0_15px_rgba(34,197,94,0.3)] dark:shadow-[0_0_15px_rgba(34,197,94,0.15)]",
        textColor: "text-[#22c55e] dark:text-[#4ade80]",
        iconColor: "text-[#22c55e] dark:text-[#4ade80]",
        bgHover: "hover:bg-green-50 dark:hover:bg-green-900/10",
        indicatorColor: "bg-[#22c55e]",
        barGradient: "from-green-400 to-green-500",
        dotColor: "bg-[#22c55e]",
      };
    if (score >= 100)
      return {
        text: "✅ Meta Cumprida",
        badgeText: "Meta Cumprida",
        message: "O motorista concluiu a meta definida para o período com sucesso.",
        effectClass: "shadow-[0_0_15px_rgba(59,130,246,0.3)] dark:shadow-[0_0_15px_rgba(59,130,246,0.15)]",
        textColor: "text-[#3b82f6] dark:text-[#60a5fa]",
        iconColor: "text-[#3b82f6] dark:text-[#60a5fa]",
        bgHover: "hover:bg-blue-50 dark:hover:bg-blue-900/10",
        indicatorColor: "bg-[#3b82f6]",
        barGradient: "from-blue-400 to-blue-500",
        dotColor: "bg-[#3b82f6]",
      };
    if (score >= 81)
      return {
        text: "🎯 Meta Próxima",
        badgeText: "Meta Próxima",
        message: "Falta pouco para que o motorista alcance seu principal objetivo do período.",
        effectClass: "shadow-[0_0_15px_rgba(234,179,8,0.3)] dark:shadow-[0_0_15px_rgba(234,179,8,0.15)]",
        textColor: "text-[#eab308] dark:text-[#facc15]",
        iconColor: "text-[#eab308] dark:text-[#facc15]",
        bgHover: "hover:bg-yellow-50 dark:hover:bg-yellow-900/10",
        indicatorColor: "bg-[#eab308]",
        barGradient: "from-yellow-400 to-yellow-500",
        dotColor: "bg-[#eab308]",
      };
    if (score >= 61)
      return {
        text: "⚡ Alto Ritmo",
        badgeText: "Alto Ritmo",
        message: "O motorista mantém uma frequência consistente de viagens e segue avançando rumo à meta do período.",
        effectClass: "shadow-[0_0_15px_rgba(14,165,233,0.3)] dark:shadow-[0_0_15px_rgba(14,165,233,0.15)]",
        textColor: "text-[#0ea5e9] dark:text-[#38bdf8]",
        iconColor: "text-[#0ea5e9] dark:text-[#38bdf8]",
        bgHover: "hover:bg-sky-50 dark:hover:bg-sky-900/10",
        indicatorColor: "bg-[#0ea5e9]",
        barGradient: "from-sky-400 to-sky-500",
        dotColor: "bg-[#0ea5e9]",
      };
    if (score >= 41)
      return {
        text: "🚚 Em Atividade",
        badgeText: "Em Atividade",
        message: "O motorista está em ritmo produtivo e contribuindo ativamente para a frota.",
        effectClass: "shadow-[0_0_15px_rgba(99,102,241,0.3)] dark:shadow-[0_0_15px_rgba(99,102,241,0.15)]",
        textColor: "text-[#6366f1] dark:text-[#818cf8]",
        iconColor: "text-[#6366f1] dark:text-[#818cf8]",
        bgHover: "hover:bg-indigo-50 dark:hover:bg-indigo-900/10",
        indicatorColor: "bg-[#6366f1]",
        barGradient: "from-indigo-400 to-indigo-500",
        dotColor: "bg-[#6366f1]",
      };
    if (score >= 21)
      return {
        text: "🛣️ Pegando Ritmo",
        badgeText: "Pegando Ritmo",
        message: "O motorista começou a estabelecer um volume de entregas e está progredindo.",
        effectClass: "shadow-[0_0_15px_rgba(249,115,22,0.3)] dark:shadow-[0_0_15px_rgba(249,115,22,0.15)]",
        textColor: "text-[#f97316] dark:text-[#fdba74]",
        iconColor: "text-[#f97316] dark:text-[#fdba74]",
        bgHover: "hover:bg-orange-50 dark:hover:bg-orange-900/10",
        indicatorColor: "bg-[#f97316]",
        barGradient: "from-orange-400 to-orange-500",
        dotColor: "bg-[#f97316]",
      };
    return {
      text: "🚦 Primeiras Rotas",
      badgeText: "Primeiras Rotas",
      message: "Período no início. O foco agora é estabelecer uma rotina e acumular as primeiras viagens do ciclo.",
      effectClass: "shadow-[0_0_15px_rgba(100,116,139,0.3)] dark:shadow-[0_0_15px_rgba(100,116,139,0.15)]",
      textColor: "text-[#64748b] dark:text-[#94a3b8]",
      iconColor: "text-[#64748b] dark:text-[#94a3b8]",
      bgHover: "hover:bg-slate-50 dark:hover:bg-slate-900/10",
      indicatorColor: "bg-[#64748b]",
      barGradient: "from-slate-400 to-slate-500",
      dotColor: "bg-[#64748b]",
    };
  };

  const cls = getClassification(score);

  return (
    <>
      <div className="bg-white dark:bg-[#1A1F26] rounded-[16px] border border-slate-200 dark:border-slate-800/60 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] overflow-hidden">
        <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-2 border-b border-slate-200 dark:border-slate-800/60 flex items-center justify-center">
          <h3 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Performance</h3>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-all duration-200 group text-left relative flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-teal-500/50 active:scale-[0.99]"
        >
          {/* Subtle teal glow background on hover */}
          <div className="absolute inset-0 bg-teal-50 dark:bg-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          <div className="relative z-10 flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                {score}%
              </span>
              <span className="text-[13px] font-medium text-teal-600 dark:text-teal-400">
                {cls.badgeText}
              </span>
            </div>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
              Ver análise de desempenho
            </p>
          </div>

          <div className="relative z-10 flex items-center justify-center shrink-0">
            <ChevronRight size={18} className="text-slate-400 dark:text-slate-500 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors" />
          </div>
        </button>
      </div>

      {isModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[1500] flex items-end md:items-center justify-center p-0 md:p-6 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 font-sans"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="w-full md:max-w-4xl bg-gray-50 dark:bg-[#12161b] md:rounded-[32px] rounded-t-[32px] shadow-2xl relative flex flex-col md:h-auto overflow-hidden animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 md:zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
              style={{ maxHeight: "95vh" }}
            >
              {/* Top Gradient Accents */}
              <div className="absolute top-0 left-0 right-0 h-1.5 flex transition-all duration-500">
                <div className={cn("h-full w-full opacity-80", cls.indicatorColor)} />
                <div className={cn("h-full w-full opacity-60", cls.indicatorColor)} />
                <div className={cn("h-full w-full opacity-40", cls.indicatorColor)} />
              </div>
              <div className="absolute top-0 left-0 right-0 h-[100px] bg-gradient-to-b from-black/5 dark:from-white/5 to-transparent pointer-events-none" />

              {/* Modal Header */}
              <div className="flex items-start justify-between px-6 pt-8 pb-4 relative">
                <div className="flex items-center gap-4 md:gap-5">
                  <div
                    className={cn(
                      "w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-2xl bg-gradient-to-br border border-white/50 dark:border-white/5 shrink-0",
                      cls.effectClass,
                      cls.indicatorColor
                    )}
                  >
                    <TrendingUp size={28} className="text-white drop-shadow-sm md:w-[32px] md:h-[32px]" strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-[11px] md:text-[12px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.1em] mb-1">
                      Desempenho Individual
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn("font-black text-[22px] tracking-tight leading-none", cls.textColor)}>
                        {score}%
                      </span>
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <div className={cn("flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap", cls.textColor)}>
                        {cls.badgeText}
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-[#2A2F3A] transition-colors text-gray-400 dark:text-gray-500 z-10 relative"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="w-full px-6 py-5 overflow-y-auto z-10 custom-scrollbar flex flex-col gap-5">
                
                <div className="flex items-center p-1 bg-gray-100 dark:bg-[#1A1F26] rounded-lg w-full max-w-[280px] mx-auto border border-gray-200/50 dark:border-[#2A2F3A]">
                  <button
                    onClick={() => setPeriodPreset("semana")}
                    className={cn(
                      "flex-1 px-4 py-1.5 text-sm font-semibold rounded-md transition-all duration-200",
                      periodPreset === "semana"
                        ? "bg-white dark:bg-[#2A2F3A] text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                  >
                    Semana
                  </button>
                  <button
                    onClick={() => setPeriodPreset("mes")}
                    className={cn(
                      "flex-1 px-4 py-1.5 text-sm font-semibold rounded-md transition-all duration-200",
                      periodPreset === "mes"
                        ? "bg-white dark:bg-[#2A2F3A] text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                  >
                    Mensal
                  </button>
                </div>

                <div className={cn("rounded-xl p-4 border flex items-start gap-3 text-sm font-medium transition-all shadow-sm", "bg-current/5 border-current/20", cls.textColor)}>
                  <Activity size={18} className="mt-0.5 shrink-0" />
                  <div className="leading-relaxed">{cls.message}</div>
                </div>

                {/* Grid Responsivo e Mais Compacto */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                  {/* Bloco 1: Viagens Realizadas */}
                  <div className="bg-white dark:bg-[#1A1F26] rounded-xl p-4 md:p-5 border border-gray-100 dark:border-[#2A2F3A] shadow-sm flex flex-col justify-center hover:shadow-md transition-shadow">
                    <span className="text-gray-500 dark:text-gray-400 text-[13px] font-medium mb-1.5 leading-none">Viagens Realizadas</span>
                    <span className="text-gray-900 dark:text-white text-2xl leading-none font-bold">{viagensRealizadas}</span>
                  </div>

                  {/* Bloco 2: Meta Individual */}
                  <div className="bg-white dark:bg-[#1A1F26] rounded-xl p-4 md:p-5 border border-gray-100 dark:border-[#2A2F3A] shadow-sm flex flex-col justify-center hover:shadow-md transition-shadow">
                    <span className="text-gray-500 dark:text-gray-400 text-[13px] font-medium mb-1.5 leading-none">Meta Individual</span>
                    <span className="text-gray-900 dark:text-white text-2xl leading-none font-bold">{metaOperacional}</span>
                  </div>

                  {/* Bloco 3: Faltam para Meta */}
                  <div className="bg-white dark:bg-[#1A1F26] rounded-xl p-4 md:p-5 border border-gray-100 dark:border-[#2A2F3A] shadow-sm flex flex-col justify-center hover:shadow-md transition-shadow">
                    <span className="text-gray-500 dark:text-gray-400 text-[13px] font-medium mb-1.5 leading-none">Faltam para Meta</span>
                    <span className="text-gray-900 dark:text-white text-2xl leading-none font-bold">
                      {viagensRestantes > 0 ? viagensRestantes : "Atingida"}
                    </span>
                  </div>

                  {/* Bloco 4: Posição no Ranking */}
                  <div className="bg-white dark:bg-[#1A1F26] rounded-xl p-4 md:p-5 border border-gray-100 dark:border-[#2A2F3A] shadow-sm flex flex-col justify-center hover:shadow-md transition-shadow">
                    <span className="text-gray-500 dark:text-gray-400 text-[13px] font-medium mb-1.5 leading-none">Posição no Ranking</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-gray-900 dark:text-white text-2xl leading-none font-bold">{posicaoRanking}º</span>
                      {totalRanking !== "--" && <span className="text-gray-400 font-medium text-[13px]">/ {totalRanking}</span>}
                    </div>
                  </div>

                  {/* Bloco 5: Média de Viagens */}
                  <div className="bg-white dark:bg-[#1A1F26] rounded-xl p-4 md:p-5 border border-gray-100 dark:border-[#2A2F3A] shadow-sm flex flex-col justify-center hover:shadow-md transition-shadow">
                    <span className="text-gray-500 dark:text-gray-400 text-[13px] font-medium mb-1.5 leading-none">Média Diária</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-gray-900 dark:text-white text-2xl leading-none font-bold">{mediaDiaria.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                      <span className="text-xs font-medium text-gray-400">viagens/dia</span>
                    </div>
                  </div>

                  {/* Bloco 6: Percentual de Desempenho */}
                  <div className="bg-white dark:bg-[#1A1F26] rounded-xl p-4 md:p-5 border border-gray-100 dark:border-[#2A2F3A] shadow-sm flex flex-col justify-center hover:shadow-md transition-shadow">
                    <span className="text-gray-500 dark:text-gray-400 text-[13px] font-medium mb-1.5 leading-none">Percentual de Desempenho</span>
                    <span className={cn("text-2xl leading-none font-bold", cls.textColor)}>{score}%</span>
                  </div>
                </div>

                {/* Bloco 7 & 8: Capacidade Operacional */}
                <div className="bg-white dark:bg-[#1A1F26] rounded-xl p-5 border border-gray-100 dark:border-[#2A2F3A] shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3">
                  <div className="flex flex-col gap-2.5">
                    <span className="text-gray-900 dark:text-white font-bold text-[14px]">Capacidade Operacional</span>
                    <div className="flex">
                      <div className={cn("inline-flex items-center px-3 py-1.5 rounded-lg text-[13px] font-semibold border whitespace-nowrap", "bg-current/5 border-current/10", cls.textColor)}>
                        {cls.text}
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <div className="flex justify-between items-end mb-2">
                      <div className="flex items-center gap-1.5">
                        <Route size={16} className="text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {viagensRealizadas} <span className="text-gray-400 font-medium">/ {metaOperacional} viagens</span>
                        </span>
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{Math.min(100, score)}%</span>
                    </div>

                    <div className="w-full h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden border border-gray-200/50 dark:border-gray-700">
                      <div
                        className={cn("h-full transition-all duration-1000 ease-out bg-gradient-to-r", cls.barGradient)}
                        style={{ width: `${Math.min(100, score)}%` }}
                      >
                        <div className="w-full h-full opacity-20 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.5)_50%,transparent_75%)] bg-[length:20px_20px] animate-[slide_2s_linear_infinite]" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress Metric Explanation */}
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl p-4 flex gap-3 text-[13px] text-blue-700 dark:text-blue-400">
                  <Target size={16} className="shrink-0 mt-0.5" />
                  <p>
                    <strong>Meta Proporcional:</strong> A meta operacional é calculada considerando apenas os dias de atividade do motorista dentro do período atual da empresa.
                  </p>
                </div>

              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
