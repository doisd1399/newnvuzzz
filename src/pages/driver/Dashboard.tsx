import React, { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../../context/AppContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/utils";
import {
  FileText,
  Calendar,
  Clock,
  Star,
  Play,
  Square,
  CheckCircle,
  Circle,
  MapPin,
  Building2,
  Search,
  ArrowRight,
  UserCog,
  Loader2,
  Eye,
  X,
  Navigation,
  Pencil,
  LayoutDashboard,
  User as UserIcon,
  ChevronDown,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

import ErrorBoundary from "../../components/ErrorBoundary";

function DashboardComponent({
  isIntegrated = false,
}: {
  isIntegrated?: boolean;
}) {
  const {
    currentUser,
    jobs,
    jobDemands,
    requestNewJobDemand,
    cancelJobDemand,
    contracts,
    vehicles,
    trailers,
    startJob,
    finishJob,
    markDeliveryComplete,
    updateDeliveryRoute,
    unmarkDelivery,
    companies,
    requestJoinCompany,
    cancelRequestJoinCompany,
    users,
    driverRequests,
    updateUserOnlineStatus,
    activeCompanyId,
    allCompanyMembers,
  } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");

  const [isRequestingId, setIsRequestingId] = useState<string | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isSubmittingDemand, setIsSubmittingDemand] = useState(false);
  const [demandSuccess, setDemandSuccess] = useState(false);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [routeModalTarget, setRouteModalTarget] = useState<number>(-1);
  const [routeOrigin, setRouteOrigin] = useState("");
  const [routeDestination, setRouteDestination] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const [isPageSelectorOpen, setIsPageSelectorOpen] = useState(false);

  // --- MOVED HOOKS TO TOP ---
  const myJob = useMemo(() => {
    const validJobs = jobs.filter(
      (j) =>
        j.driverId === currentUser?.id &&
        j.status === "active" &&
        contracts.some((c) => c.id === j.contractId),
    );

    // Prioritize active, then sort by newest
    validJobs.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return validJobs[0];
  }, [jobs, currentUser?.id, contracts]);

  const pendingDriverJobs = useMemo(() => {
    const valid = jobs.filter(
      (j) => 
        j.driverId === currentUser?.id && 
        j.status === "pending" && 
        contracts.some((c) => c.id === j.contractId)
    );
    valid.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA; // Oldest first? Actually dateA - dateB means oldest is first.
    });
    return valid;
  }, [jobs, currentUser?.id, contracts]);

  const contract = useMemo(
    () => (myJob ? contracts.find((c) => c.id === myJob.contractId) : null),
    [myJob, contracts],
  );

  const vehicle = useMemo(
    () => (myJob ? vehicles.find((v) => v.id === myJob.vehicleId) : null),
    [myJob, vehicles],
  );

  const trailer = useMemo(
    () => {
      const tId = myJob?.trailerId || contract?.trailerId;
      const foundTrailer = tId ? trailers.find((t) => t.id === tId) : null;
      console.log("[Driver Dashboard] Contrato recebido/carregado na tela:", { 
        jobId: myJob?.id,
        contractId: contract?.id,
        vehicleId: myJob?.vehicleId,
        trailerId: tId,
        foundTrailer
      });
      return foundTrailer;
    },
    [myJob, contract, trailers],
  );

  const unassignedContracts = useMemo(
    () =>
      contracts.filter(
        (c) =>
          c.companyId === activeCompanyId &&
          !jobs.some((j) => j.contractId === c.id),
      ),
    [contracts, jobs, activeCompanyId],
  );

  const completedJobs = useMemo(
    () =>
      jobs
        .filter(
          (j) => j.driverId === currentUser?.id && j.status === "completed",
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime(),
        ),
    [jobs, currentUser?.id],
  );
  // -------------------------

  const pageOptions = [
    { id: "/driver", label: "Painel", icon: LayoutDashboard },
    { id: "/driver/profile", label: "Meu Perfil", icon: UserIcon },
  ];

  const activePageDetails =
    pageOptions.find((p) => p.id === location.pathname) || pageOptions[0];
  const ActiveIcon = activePageDetails.icon;

  // --- LOGS TEMPORÁRIOS CONFORME SOLICITADO ---
  console.log("================== DASHBOARD CARREGADO ==================");
  console.log("- Empresa Ativa ID:", activeCompanyId);
  console.log(
    "- Empresa Nome:",
    companies.find((c) => c.id === activeCompanyId)?.companyName,
  );
  console.log(
    "- Simulador:",
    companies.find((c) => c.id === activeCompanyId)?.simulatorName,
  );
  console.log("- Componente quebra?: validando renderização do Dashboard");

  const renderPageSelector = () => (
    <div className="relative z-20 mb-4">
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
                    navigate(opt.id);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-[#2A2F3A] last:border-0 hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors text-left",
                    location.pathname === opt.id
                      ? "bg-slate-50 dark:bg-[#2A2F3A]"
                      : "",
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                      location.pathname === opt.id
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                        : "bg-slate-100 dark:bg-[#2A2F3A] text-slate-600 dark:text-slate-400",
                    )}
                  >
                    <Icon size={18} />
                  </div>
                  <span
                    className={cn(
                      "text-[15px] font-semibold",
                      location.pathname === opt.id
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

  const handleCopyPaintCode = (paintCode?: string) => {
    if (paintCode) {
      navigator.clipboard.writeText(paintCode);
      setCopiedCode("Código copiado: " + paintCode);
      setTimeout(() => setCopiedCode(null), 3000);
    } else {
      setCopiedCode("Nenhum código de pintura cadastrado");
      setTimeout(() => setCopiedCode(null), 3000);
    }
  };

  const handleRequestDemand = async () => {
    try {
      setIsSubmittingDemand(true);
      await requestNewJobDemand();
      setDemandSuccess(true);
      setTimeout(() => setDemandSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmittingDemand(false);
    }
  };

  // Check if there is an active request
  const myPendingRequest = driverRequests.find(
    (r) => r.motoristaId === currentUser?.id && r.status === "pendente",
  );

  if (myPendingRequest) {
    const company = companies.find((c) => c.id === myPendingRequest.empresaId);
    return (
      <div className="max-w-[720px] mx-auto py-6 sm:py-10 px-4 sm:px-6">
        {!isIntegrated && renderPageSelector()}
        <div className="flex flex-col items-center justify-center h-[60vh] text-center max-w-md mx-auto">
          <div className="w-24 h-24 bg-orange-50 dark:bg-orange-500/10 rounded-full flex items-center justify-center mb-6 text-orange-500">
            <UserCog size={40} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-[#fafafa] mb-2">
            Aguardando Aprovação
          </h2>
          <p className="text-gray-500 dark:text-[#a1a1aa] mb-8">
            Seu convite para a empresa{" "}
            <strong className="text-gray-900 dark:text-[#fafafa]">
              {company?.companyName || "Carregando..."}
            </strong>{" "}
            foi enviado. O administrador da frota precisa aprovar seu acesso.
          </p>
          <Button
            variant="outline"
            onClick={() => cancelRequestJoinCompany(myPendingRequest.id)}
            className="text-gray-500 dark:text-[#a1a1aa] hover:text-gray-900 dark:hover:text-[#f4f4f5]"
          >
            Cancelar Convite
          </Button>
        </div>
      </div>
    );
  }

  // 1. Not linked to any company yet
  if (!activeCompanyId && !currentUser?.roles?.includes("admin")) {
    const handleRequest = async (companyId: string) => {
      setIsRequestingId(companyId);
      await new Promise((resolve) => setTimeout(resolve, 800)); // slight UI delay for feedback
      await requestJoinCompany(companyId);
      setIsRequestingId(null);
    };

    // Calculate member counts
    const companiesWithCount = companies
      .map((c) => ({
        ...c,
        memberCount:
          allCompanyMembers?.filter((m) => m.companyId === c.id).length || 0,
      }))
      .sort(
        (a, b) =>
          b.memberCount - a.memberCount ||
          a.companyName.localeCompare(b.companyName),
      );

    const filteredCompanies = companiesWithCount.filter(
      (c) =>
        c.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.fleetName.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const isSearching = searchTerm.length > 0;

    return (
      <div className="max-w-[720px] mx-auto py-6 sm:py-10 px-4 sm:px-6">
        {!isIntegrated && renderPageSelector()}
        {/* HERO */}
        {!isSearching && (
          <div className="text-center mb-10 transition-all duration-300">
            <div className="w-16 h-16 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/40 rounded-2xl flex items-center justify-center mx-auto mb-5 text-blue-600 shadow-sm dark:shadow-none border border-blue-100 dark:border-blue-500/20/50">
              <Building2 size={28} strokeWidth={2} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#fafafa] tracking-tight">
              Encontre sua Frota
            </h1>
            <p className="text-[15px] text-gray-500 dark:text-[#a1a1aa] mt-2 max-w-[280px] sm:max-w-md mx-auto leading-relaxed">
              Pesquise o nome da empresa ou frota e envie sua solicitação de
              acesso.
            </p>
          </div>
        )}

        {/* SEARCH INPUT */}
        <div className="relative mb-8 group">
          <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
            <Search
              className="text-gray-400 group-focus-within:text-blue-500 transition-colors"
              size={20}
            />
          </div>
          <input
            type="text"
            placeholder="Buscar empresa ou frota..."
            autoFocus
            className="w-full pl-14 pr-4 h-14 bg-white dark:bg-[#1A1F26] rounded-2xl border border-gray-200 dark:border-[#2A2F3A] focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-[15px] font-medium text-gray-900 dark:text-[#fafafa] placeholder:text-gray-400 dark:placeholder:text-[#71717a] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* LIST */}
        <div className="space-y-3">
          {filteredCompanies.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-gray-200 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#1A1F26]">
              <Search size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-[15px] font-medium text-gray-900 dark:text-[#fafafa]">
                Nenhuma empresa encontrada
              </p>
              <p className="text-sm text-gray-500 dark:text-[#a1a1aa] mt-1">
                Verifique a ortografia ou tente outro termo.
              </p>
            </div>
          ) : (
            filteredCompanies.map((company) => (
              <div
                key={company.id}
                className="flex items-center p-3 sm:p-4 bg-white dark:bg-[#1A1F26] rounded-2xl border border-gray-100 dark:border-[#2A2F3A] hover:border-blue-200 dark:border-blue-500/30 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.05)] transition-all group"
              >
                <div className="flex-1 flex items-center gap-3 sm:gap-4 min-w-0 pr-4">
                  {/* AVATAR */}
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    {company.logoUrl ? (
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-gray-100 dark:border-[#2A2F3A] overflow-hidden shrink-0">
                        <img
                          src={company.logoUrl}
                          alt="Logo"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 border border-blue-100 dark:border-blue-500/20/50 flex items-center justify-center font-bold text-blue-700 dark:text-blue-400 text-sm sm:text-base group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        {company.companyName.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="sm:hidden px-1.5 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded-md text-[9px] font-bold tracking-wide truncate max-w-[60px]">
                      {company.simulatorName}
                    </span>
                  </div>
                  {/* INFO */}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-[#fafafa] text-[15px] truncate leading-tight mb-1">
                      {company.companyName}
                    </h3>
                    <div className="flex items-center text-[13px] text-gray-500 dark:text-[#a1a1aa] truncate">
                      <span className="truncate font-medium text-gray-700 dark:text-[#d4d4d8]">
                        {company.fleetName}
                      </span>
                      <span className="hidden sm:inline mx-1.5 min-w-[4px] opacity-40">
                        •
                      </span>
                      <span className="hidden sm:inline truncate">
                        {company.simulatorName}
                      </span>
                    </div>
                  </div>
                </div>
                {/* BOTÃO */}
                <div className="shrink-0">
                  <Button
                    disabled={isRequestingId === company.id}
                    onClick={() => handleRequest(company.id)}
                    className={cn(
                      "h-9 sm:h-10 px-4 sm:px-5 rounded-xl font-bold text-[13px] sm:text-sm transition-all sm:min-w-[100px]",
                      isRequestingId === company.id
                        ? "bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 text-blue-600 hover:bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 cursor-default"
                        : "bg-blue-600 hover:bg-blue-700 text-white hover:scale-[1.02] active:scale-[0.98]",
                    )}
                  >
                    {isRequestingId === company.id ? (
                      <Loader2 size={18} className="animate-spin mx-auto" />
                    ) : (
                      "Solicitar"
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (!myJob || !contract) {
    const lastJob = completedJobs[0];

    // Calculate days since last job
    let daysSinceLastJob = 0;
    if (lastJob?.createdAt) {
      // As a proxy since we don't have completedAt in some old records
      daysSinceLastJob = differenceInDays(
        new Date(),
        new Date(lastJob.createdAt),
      );
    }

    const myDemand = jobDemands.find(
      (d) =>
        d.driverId === currentUser?.id &&
        d.status === "pending" &&
        d.companyId === activeCompanyId,
    );

    return (
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 space-y-4 sm:space-y-5 pb-20 pt-4 sm:pt-6">
        {!isIntegrated && renderPageSelector()}
        
        {/* Central Operacional Header */}
        <header className="flex flex-col sm:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#1A1F26] p-4 sm:px-5 sm:py-4 rounded-[18px] border border-gray-100 dark:border-[#2A2F3A] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center shrink-0">
              <UserCog size={20} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-[#fafafa] tracking-tight leading-none mb-1">
                Central Operacional
              </h1>
              <p className="text-xs font-medium text-gray-500 dark:text-[#a1a1aa] leading-none">
                Nenhum contrato ativo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <a
              href="https://cts-gestao-vtc.base44.app/Viagens"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center h-10 w-10 sm:w-auto sm:px-4 shrink-0 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-xs rounded-xl transition-colors border border-blue-100 dark:border-blue-500/20"
              title="Lançamento de Viagem"
            >
              <Navigation size={18} className="sm:mr-2" />
              <span className="hidden sm:inline">Viagens</span>
            </a>
            <div className="flex-1 sm:w-auto flex items-center justify-between gap-3 bg-gray-50 dark:bg-[#11141A] px-4 py-2 rounded-xl border border-gray-100 dark:border-[#2A2F3A]">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="relative flex h-2 w-2">
                    {currentUser?.isOnline && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    )}
                    <span className={cn("relative inline-flex rounded-full h-2 w-2", currentUser?.isOnline ? "bg-[#32D74B]" : "bg-gray-300 dark:bg-[#52525b]")}></span>
                  </span>
                  <h3 className="font-bold text-xs text-gray-900 dark:text-[#fafafa] leading-none">
                    Status
                  </h3>
                </div>
                <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-[#a1a1aa] leading-none">
                  {currentUser?.isOnline ? "Disponível" : "Indisponível"}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={currentUser?.isOnline || false}
                  onChange={(e) => updateUserOnlineStatus(e.target.checked)}
                />
                <div className="w-10 h-5 bg-gray-200 dark:bg-[#18181b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:after:bg-gray-300 after:border-gray-200 dark:after:border-transparent after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#32D74B] shadow-inner dark:shadow-none"></div>
              </label>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Solicitação Card */}
          <div className="md:col-span-2">
            <Card className="h-full border border-blue-100 dark:border-blue-500/20 shadow-sm bg-white dark:bg-[#1A1F26]">
              <CardContent className="p-4 sm:p-5 flex flex-col h-full justify-between">
                <div>
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                    <CheckCircle size={16} />
                    <h3 className="font-bold text-xs uppercase tracking-wider">
                      Fila de Disponibilidade
                    </h3>
                  </div>
                  <p className="text-gray-500 dark:text-[#a1a1aa] text-xs mb-4 leading-relaxed">
                    Sinalize estar pronto para receber demandas. O seu pedido será posicionado na fila de prioridade da operação.
                  </p>
                </div>

                <div>
                  {myDemand ? (
                    <div className="bg-yellow-50 dark:bg-amber-500/10 border border-yellow-100 dark:border-yellow-500/20 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 flex items-center justify-center shrink-0">
                          <Clock size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-yellow-900 dark:text-yellow-300 text-xs text-left">Na fila aguardando</p>
                          <p className="text-[10px] text-yellow-700 dark:text-yellow-400 font-medium">Às {format(new Date(myDemand.createdAt), "HH:mm")}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cancelJobDemand}
                        className="h-8 text-xs bg-white dark:bg-[#1A1F26] border-yellow-200 text-yellow-700 w-full sm:w-auto"
                      >
                        Cancelar Pedido
                      </Button>
                    </div>
                  ) : demandSuccess ? (
                    <div className="bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 rounded-xl p-3 flex items-center gap-3 text-green-700 dark:text-green-400">
                      <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center shrink-0">
                        <CheckCircle size={16} />
                      </div>
                      <div>
                        <p className="font-bold text-xs">Solicitação enviada</p>
                        <p className="text-[10px] font-medium">Administração notificada com sucesso.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Button
                        onClick={handleRequestDemand}
                        disabled={!currentUser?.isOnline || isSubmittingDemand}
                        className={cn(
                          "w-full h-10 text-sm font-bold shadow-sm dark:shadow-none transition-all",
                          currentUser?.isOnline
                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                            : "bg-gray-100 dark:bg-[#18181b] text-gray-400 cursor-not-allowed"
                        )}
                      >
                        {isSubmittingDemand ? (
                          <><Loader2 className="animate-spin mr-2" size={16} /> Enviando...</>
                        ) : (
                          "Solicitar Novo Trabalho"
                        )}
                      </Button>
                      {!currentUser?.isOnline && (
                        <p className="text-center text-[10px] text-gray-400 font-medium">
                          Fique online para enviar solicitação
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Status Operacional Card */}
          <div className="md:col-span-1">
            <Card className="h-full bg-gray-50 dark:bg-[#11141A] border border-gray-100 dark:border-[#2A2F3A] shadow-none flex flex-col justify-center items-center text-center p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Clock size={12} /> Tempo Ocioso
              </p>
              <div className="flex items-baseline gap-1">
                <p className="text-4xl font-black text-gray-900 dark:text-[#fafafa] leading-none">
                  {daysSinceLastJob}
                </p>
                <p className="text-xs font-bold text-gray-500 dark:text-[#a1a1aa]">
                  dias
                </p>
              </div>
              <p className="text-[10px] text-gray-400 font-medium mt-1">
                Desde a última rota
              </p>
            </Card>
          </div>
        </div>

        {/* Fila Operacional (Radar) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-900 dark:text-[#fafafa] px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
            <h2 className="text-sm font-bold uppercase tracking-wider">Fila Operacional</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingDriverJobs.length > 0 ? (
              pendingDriverJobs.map((job, idx) => {
                const c = contracts.find(ct => ct.id === job.contractId);
                if (!c) return null;
                const positionLabels = ["Próximo contrato", "Segundo na fila", "Terceiro na fila"];
                const positionLabel = positionLabels[idx] || `${idx + 1}º na fila`;
                
                return (
                  <Card key={job.id} className="border border-gray-200 dark:border-[#3f3f46] shadow-sm bg-white dark:bg-[#1A1F26] overflow-hidden group hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors">
                    <CardContent className="p-0">
                      <div className="px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-[#11141A] border-b border-gray-100 dark:border-[#2A2F3A]">
                        <span className="text-[10px] font-bold text-gray-500 dark:text-[#a1a1aa] uppercase tracking-widest">
                          {positionLabel}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                          </span>
                          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                            Atribuído
                          </span>
                        </div>
                      </div>
                      <div className="px-4 py-4 space-y-4">
                        <div>
                          <p className="font-bold text-sm text-gray-900 dark:text-[#fafafa] mb-1 leading-tight">
                            {c.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-[#a1a1aa] font-medium leading-relaxed">
                            {c.totalDeliveries} entregas previstas na rota do contrato selecionado.
                          </p>
                        </div>
                        <Button 
                          onClick={() => startJob(job.id)}
                          className="w-full h-9 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-none rounded-lg flex items-center justify-center gap-2"
                        >
                          <Play size={14} className="fill-current" />
                          Iniciar Operação
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="md:col-span-2 bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-sm">
                <FileText size={20} className="text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-xs text-gray-500 dark:text-[#a1a1aa] font-medium max-w-sm">
                  Não há contratos atribuídos para você neste momento. Solicite um novo trabalho ou aguarde a administração enviar.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Central de Avisos e Histórico - Agora em linha única no desktop se possível */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-0 shadow-sm bg-blue-600 dark:bg-blue-900/50 text-white overflow-hidden relative">
            <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full blur-2xl transform translate-x-10 -translate-y-10"></div>
            <CardContent className="p-4 flex items-center gap-3 h-full">
              <div className="w-8 h-8 rounded-full bg-white/20 flex flex-col items-center justify-center shrink-0">
                <Circle size={14} className="fill-current text-white" />
              </div>
              <p className="text-xs font-medium text-white/90 leading-relaxed">
                Mantenha-se <strong className="text-white">Disponível</strong> para receber prioridade na atribuição.
              </p>
            </CardContent>
          </Card>

          {lastJob && (
            <Card className="border border-gray-100 dark:border-[#2A2F3A] shadow-sm bg-white dark:bg-[#1A1F26]">
              <CardContent className="p-4 flex items-center gap-3 h-full">
                <div className="w-8 h-8 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center shrink-0 text-green-600 dark:text-green-400">
                  <CheckCircle size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Última Operação</p>
                  <p className="font-bold text-xs text-gray-900 dark:text-[#fafafa] truncate">
                    {contracts.find((c) => c.id === lastJob.contractId)?.name || "Concluída"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  const isPending = myJob.status === "pending";
  const isActive = myJob.status === "active";
  const progressPercent = Math.round(
    (myJob.progress / contract.totalDeliveries) * 100,
  );

  const deadlineDate = new Date(myJob.deadlineDate);
  const daysLeft = differenceInDays(deadlineDate, new Date());

  const createdAtDate = (myJob as any).createdAt
    ? new Date((myJob as any).createdAt)
    : new Date();
  const calculatedTotalDays = differenceInDays(deadlineDate, createdAtDate);
  const totalDays =
    calculatedTotalDays > 0
      ? calculatedTotalDays
      : contract.deadlineDays > 0
        ? contract.deadlineDays
        : 1;
  const daysElapsed = Math.max(0, totalDays - daysLeft);

  const expectedDeliveries =
    (daysElapsed / totalDays) * contract.totalDeliveries;

  let currentRating = 5.0;
  if (expectedDeliveries > 0) {
    const ratio = myJob.progress / expectedDeliveries;
    currentRating = Math.min(5.0, Math.max(1.0, 5.0 * ratio));
  } else if (daysElapsed > 0 && myJob.progress === 0) {
    currentRating = 4.0;
  }

  let ratingText = "";
  if (currentRating >= 4.5) ratingText = "Excelente";
  else if (currentRating >= 4.0) ratingText = "Muito bom";
  else if (currentRating >= 3.0) ratingText = "Bom";
  else if (currentRating >= 2.0) ratingText = "Regular";
  else ratingText = "Ruim";

  // Generate simple array for deliveries if simple mode
  const deliveriesList =
    contract.mode === "detailed" && contract.deliveries
      ? contract.deliveries
      : Array.from({ length: contract.totalDeliveries }).map((_, i) => {
          const completedRoute = myJob.completedRoutes?.[i];
          return {
            id: `dd-${i}`,
            origin: completedRoute ? completedRoute.origin : "Ponto de Coleta",
            destination: completedRoute
              ? completedRoute.destination
              : `Destino ${i + 1}`,
            _isCustom: !!completedRoute,
          };
        });

  const handleOpenMarcarEntrega = () => {
    if (contract.mode === "simple") {
      setRouteModalTarget(-1);
      setRouteOrigin("");
      setRouteDestination("");
      setIsRouteModalOpen(true);
    } else {
      markDeliveryComplete(myJob.id);
    }
  };

  const handleEditRoute = (index: number) => {
    const existing = myJob.completedRoutes?.[index];
    setRouteModalTarget(index);
    setRouteOrigin(existing?.origin || "");
    setRouteDestination(existing?.destination || "");
    setIsRouteModalOpen(true);
  };

  const handleSaveRoute = () => {
    if (routeModalTarget === -1) {
      markDeliveryComplete(myJob.id, {
        origin: routeOrigin,
        destination: routeDestination,
      });
    } else {
      updateDeliveryRoute(myJob.id, routeModalTarget, {
        origin: routeOrigin,
        destination: routeDestination,
      });
    }
    setIsRouteModalOpen(false);
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto px-4 sm:px-6 pb-20">
      {!isIntegrated && renderPageSelector()}
      <header className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <Card className="w-full sm:w-auto shrink-0 border border-gray-100 dark:border-[#2A2F3A] shadow-sm rounded-2xl bg-white dark:bg-[#1A1F26] flex-1 sm:max-w-xs">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="pr-3 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="relative flex h-2 w-2">
                    {currentUser?.isOnline && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    )}
                    <span
                      className={cn(
                        "relative inline-flex rounded-full h-2 w-2",
                        currentUser?.isOnline
                          ? "bg-[#32D74B]"
                          : "bg-gray-300 dark:bg-[#52525b]",
                      )}
                    ></span>
                  </span>
                  <h3 className="font-bold text-[13px] text-gray-900 dark:text-white leading-none">
                    Status
                  </h3>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-[#a1a1aa] leading-tight mt-0.5">
                  {currentUser?.isOnline
                    ? "Disponível para fretes"
                    : "Indisponível no momento"}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={currentUser?.isOnline || false}
                  onChange={(e) => updateUserOnlineStatus(e.target.checked)}
                />
                <div className="w-10 h-5 bg-gray-200 dark:bg-[#18181b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:after:bg-gray-300 after:border-gray-200 dark:after:border-transparent after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#32D74B] dark:peer-checked:bg-[#32D74B] shadow-inner dark:shadow-none"></div>
              </label>
            </div>
          </CardContent>
        </Card>

        <a
          href="https://cts-gestao-vtc.base44.app/Viagens"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[13px] sm:text-sm rounded-2xl sm:rounded-xl transition-all shadow-sm group w-full sm:w-auto"
        >
          <Navigation
            size={16}
            className="group-hover:scale-110 transition-transform"
          />
          Lançar Viagem
        </a>
      </header>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="min-h-[110px] w-full">
          <CardContent className="p-4 flex flex-col justify-between h-full items-start text-left">
            <div className="flex w-full items-start justify-between mb-2">
              <p className="text-[12px] sm:text-[13px] font-semibold text-gray-500 dark:text-[#a1a1aa] leading-tight">
                Entregas
                <br />
                Concluídas
              </p>
              <div className="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-500/10 dark:border-green-500/20 text-green-600 dark:text-green-400 flex items-center justify-center shrink-0">
                <FileText size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-1 mt-auto">
              <span className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#fafafa] tracking-tight">
                {myJob.progress}
              </span>
              <span className="text-[13px] sm:text-sm text-gray-500 dark:text-[#a1a1aa] font-medium">
                / {contract.totalDeliveries}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-[110px] w-full">
          <CardContent className="p-4 flex flex-col justify-between h-full items-start text-left">
            <div className="flex w-full items-start justify-between mb-2">
              <p className="text-[12px] sm:text-[13px] font-semibold text-gray-500 dark:text-[#a1a1aa] leading-tight">
                Prazo
                <br />
                Restante
              </p>
              <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Calendar size={16} />
              </div>
            </div>
            <div className="flex flex-col mt-auto">
              <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#fafafa] tracking-tight">
                {daysLeft}
                <span className="text-[13px] sm:text-sm font-medium text-gray-500 dark:text-[#a1a1aa] tracking-normal ml-1">
                  dias
                </span>
              </div>
              <p className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                Até {format(deadlineDate, "dd/MM")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 sm:col-span-1 w-full min-h-[110px]">
          <CardContent className="p-4 flex flex-col justify-between h-full items-start text-left">
            <div className="flex w-full items-start justify-between mb-2">
              <p className="text-[12px] sm:text-[13px] font-semibold text-gray-500 dark:text-[#a1a1aa]">
                Progresso Atual
              </p>
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <CheckCircle size={16} />
              </div>
            </div>
            <div className="w-full mt-auto">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#fafafa] tracking-tight">
                  {progressPercent}%
                </span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-[#27272a] rounded-full h-1.5 sm:h-2">
                <div
                  className="bg-[#00D1FF] shadow-[0_0_10px_rgba(0,209,255,0.4)] h-1.5 sm:h-2 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 sm:col-span-1 w-full min-h-[110px]">
          <CardContent className="p-4 flex flex-col justify-between h-full items-start text-left">
            <div className="flex w-full items-start justify-between mb-2">
              <p className="text-[12px] sm:text-[13px] font-semibold text-gray-500 dark:text-[#a1a1aa]">
                Avaliação do Trabalho
              </p>
              <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                <Star size={16} />
              </div>
            </div>
            <div className="mt-auto flex flex-col">
              <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#fafafa] tracking-tight">
                {currentRating.toFixed(1)}
              </div>
              <p className="text-[11px] text-orange-600 dark:text-orange-400 font-medium truncate">
                {ratingText}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Job Card */}
      <Card className="border-2 border-green-50 shadow-sm dark:shadow-none relative overflow-hidden">
        <CardContent className="p-4 sm:p-6 relative z-10">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 sm:p-3 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
                    <FileText size={20} className="sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-[#fafafa] tracking-tight truncate">
                      {contract.name}
                    </h2>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 sm:w-auto sm:px-3 text-xs shrink-0"
                  onClick={() => setIsContractModalOpen(true)}
                >
                  <Eye size={16} className="sm:mr-1" />
                  <span className="hidden sm:inline">Ver Contrato</span>
                </Button>
              </div>

              <p className="text-sm text-gray-600 dark:text-[#d4d4d8] max-w-md mb-6 leading-relaxed hidden sm:block">
                Execute as entregas conforme planejado. Marque cada uma no
                sistema ao finalizar.
              </p>

              <div className="flex flex-col gap-3 mb-6">
                <div className="flex items-center justify-between sm:justify-start gap-4">
                  <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider w-16 sm:w-32 shrink-0">
                    Veículo
                  </p>
                  <button
                    onClick={() => handleCopyPaintCode(vehicle?.paintCode)}
                    title={
                      vehicle?.paintCode
                        ? `Código da pintura: ${vehicle.paintCode} (Clique para copiar)`
                        : "Nenhum código de pintura"
                    }
                    className="text-sm sm:text-base font-semibold text-gray-900 dark:text-[#fafafa] bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] hover:bg-gray-50 dark:hover:bg-[#27272a] shadow-sm dark:shadow-none transition-colors px-3 py-1.5 rounded-lg text-center flex-1 sm:flex-none sm:min-w-[120px] truncate cursor-pointer"
                  >
                    {vehicle?.name}
                  </button>
                </div>
                {trailer && (
                  <div className="flex items-center justify-between sm:justify-start gap-4">
                    <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider w-16 sm:w-32 shrink-0">
                      Reboque
                    </p>
                    <button
                      onClick={() => handleCopyPaintCode(trailer.paintCode)}
                      title={
                        trailer.paintCode
                          ? `Código da pintura: ${trailer.paintCode} (Clique para copiar)`
                          : "Nenhum código de pintura"
                      }
                      className="text-sm sm:text-base font-semibold text-gray-900 dark:text-[#fafafa] bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] hover:bg-gray-50 dark:hover:bg-[#27272a] shadow-sm dark:shadow-none transition-colors px-3 py-1.5 rounded-lg text-center flex-1 sm:flex-none sm:min-w-[120px] truncate cursor-pointer"
                    >
                      {trailer.name}
                    </button>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100 dark:border-[#2A2F3A]">
                {isPending ? (
                  <Button
                    size="lg"
                    className="gap-2 w-full sm:w-auto h-12 text-sm sm:text-base bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => startJob(myJob.id)}
                  >
                    <Play size={18} className="fill-current" />
                    Iniciar Trabalho
                  </Button>
                ) : (
                  <div className="flex items-center justify-center gap-2 px-3 py-2 text-gray-500 dark:text-[#a1a1aa] rounded-lg font-medium w-full sm:w-auto text-xs sm:text-sm bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] shadow-sm dark:shadow-none">
                    Trabalho Ativo
                  </div>
                )}
                {progressPercent === 100 && (
                  <Button
                    variant="danger"
                    size="lg"
                    className="gap-2 w-full sm:w-auto h-12 text-sm sm:text-base"
                    onClick={() => finishJob(myJob.id)}
                  >
                    <Square size={18} className="fill-current" />
                    Finalizar Trabalho
                  </Button>
                )}
              </div>
            </div>

            {/* Vertical Divider */}
            <div className="hidden md:block w-px bg-gray-100 dark:bg-[#18181b]"></div>

            {/* Progress Area */}
            <div className="md:w-64 flex flex-col items-center justify-center bg-gray-50 dark:bg-[#1A1F26] p-6 rounded-2xl border border-gray-100 dark:border-[#2A2F3A]">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-6">
                Progresso
              </p>

              {/* Simplified Circular Progress Lookalike */}
              <div className="relative w-40 h-40 flex items-center justify-center mb-8">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    className="text-gray-100"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    className="text-[#00D1FF] transition-all duration-500 ease-out drop-shadow-[0_0_8px_rgba(0,209,255,0.4)]"
                    strokeDasharray={2 * Math.PI * 70}
                    strokeDashoffset={
                      2 * Math.PI * 70 * (1 - progressPercent / 100)
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-gray-900 dark:text-[#fafafa]">
                      {myJob.progress}
                    </span>
                    <span className="text-lg font-medium text-gray-500 dark:text-[#a1a1aa]">
                      /{contract.totalDeliveries}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-500 dark:text-[#a1a1aa]">
                    Entregas
                  </span>
                </div>
              </div>

              <Button
                disabled={progressPercent === 100}
                className="w-full bg-green-600 dark:bg-green-600 hover:bg-green-700 text-white shadow-sm dark:shadow-none border-none gap-2 font-bold h-12"
                onClick={handleOpenMarcarEntrega}
              >
                Marcar Entrega
              </Button>

              {myJob.progress > 0 && (
                <button
                  onClick={() => unmarkDelivery(myJob.id)}
                  className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-[#a1a1aa] dark:hover:text-[#fafafa] underline"
                >
                  Desfazer última dev
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List of Deliveries */}
      <Card className="border border-gray-100 dark:border-[#2A2F3A] shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-[16px] sm:text-lg font-bold text-gray-900 dark:text-[#fafafa] tracking-tight mb-4">
            Próximas Entregas
          </h3>
          <div className="space-y-3">
            {deliveriesList.map((del, idx) => {
              const isCompleted = idx < myJob.progress;
              const isCurrent = idx === myJob.progress;

              return (
                <div
                  key={del.id || idx}
                  className={cn(
                    "p-4 rounded-xl border transition-all duration-200 flex flex-col gap-3",
                    isCompleted
                      ? "border-green-100 bg-green-50 dark:bg-green-500/10 dark:border-green-500/20"
                      : isCurrent
                        ? "border-blue-200 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 shadow-sm dark:shadow-none ring-1 ring-blue-100/50"
                        : "border-gray-200 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26]",
                  )}
                >
                  {/* Header: Title + Status + Action */}
                  <div className="flex items-start justify-between w-full gap-2">
                    <h4
                      className={cn(
                        "font-bold text-sm sm:text-base pr-2",
                        isCompleted
                          ? "text-gray-500 dark:text-[#a1a1aa] line-through decoration-green-400/30"
                          : "text-gray-900 dark:text-[#fafafa]",
                      )}
                    >
                      {(del as any)._isCustom
                        ? `Entrega ${idx + 1}`
                        : `${del.destination}`}
                    </h4>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {contract.mode === "simple" && isCompleted && (
                        <button
                          onClick={() => handleEditRoute(idx)}
                          className="p-1 sm:p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 rounded-lg transition-colors"
                          title="Editar Rota"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 bg-green-100 text-green-800 dark:text-green-400 rounded-full text-[10px] sm:text-xs font-bold ring-1 ring-inset ring-green-600/10">
                          <CheckCircle
                            size={12}
                            className="fill-current text-green-600 dark:text-green-400 hidden sm:block"
                          />
                          Concluída
                        </span>
                      ) : isCurrent ? (
                        <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-400 rounded-full text-[10px] sm:text-xs font-bold ring-1 ring-inset ring-blue-600/10">
                          <Circle
                            size={12}
                            className="fill-current hidden sm:block"
                          />
                          Ativa
                        </span>
                      ) : (
                        <span className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-[#a1a1aa] px-2.5 py-1 bg-gray-100 dark:bg-[#27272a] rounded-full border border-gray-200 dark:border-[#2A2F3A]/60">
                          Pendente
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Vertical Route Block */}
                  <div className="relative pl-1.5 mt-1">
                    {/* Vertical Path Line */}
                    <div className="absolute left-[11px] top-3 bottom-4 w-[2px] bg-gray-200 dark:bg-white/10 rounded-full"></div>

                    {/* Origin */}
                    <div className="relative flex items-start gap-4 mb-3 sm:mb-4">
                      <div className="relative z-10 w-[10px] h-[10px] mt-1 rounded-full ring-4 ring-white bg-gray-300 dark:bg-[#52525b]"></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 leading-none">
                          Origem
                        </p>
                        <p
                          className={cn(
                            "text-xs sm:text-sm font-medium truncate",
                            isCompleted
                              ? "text-gray-400"
                              : "text-gray-600 dark:text-[#d4d4d8]",
                          )}
                        >
                          {del.origin}
                        </p>
                      </div>
                    </div>

                    {/* Destination */}
                    <div className="relative flex items-start gap-4">
                      <div
                        className={cn(
                          "relative z-10 w-[10px] h-[10px] mt-1 rounded-full ring-4 ring-white",
                          isCompleted
                            ? "bg-green-500"
                            : isCurrent
                              ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                              : "bg-gray-300 dark:bg-[#52525b]",
                        )}
                      ></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 leading-none">
                          Destino
                        </p>
                        <p
                          className={cn(
                            "text-xs sm:text-sm font-semibold truncate",
                            isCompleted
                              ? "text-gray-400"
                              : "text-gray-900 dark:text-[#fafafa]",
                          )}
                        >
                          {del.destination}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {isContractModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 min-h-[100dvh]">
          <div className="bg-white dark:bg-[#1A1F26] rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-[#2A2F3A]">
              <h3 className="text-xl font-bold text-gray-900 dark:text-[#fafafa]">
                Detalhes do Contrato
              </h3>
              <button
                onClick={() => setIsContractModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-[#d4d4d8] dark:hover:text-[#a1a1aa] hover:bg-gray-100 dark:bg-[#27272a] dark:hover:bg-[#3f3f46]/50 rounded-full transition-colors"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-[#a1a1aa] mb-1">
                  Nome do Contrato
                </p>
                <p className="text-base font-semibold text-gray-900 dark:text-[#fafafa]">
                  {contract.name}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-[#a1a1aa] mb-1">
                    ID do Contrato
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[#fafafa] truncate">
                    {contract.id}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-[#a1a1aa] mb-1">
                    Prazo Restante
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[#fafafa]">
                    {daysLeft} dias
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-[#a1a1aa] mb-1">
                    Total de Entregas
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[#fafafa]">
                    {contract.totalDeliveries}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-[#a1a1aa] mb-1">
                    Status
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isActive
                        ? "text-green-600 dark:text-green-400"
                        : "text-yellow-600 dark:text-yellow-400",
                    )}
                  >
                    {isActive ? "Em andamento" : "Pendente"}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-[#a1a1aa] mb-2">
                  Simulador
                </p>
                <div className="bg-gray-50 dark:bg-[#1A1F26] p-3 rounded-lg border border-gray-100 dark:border-[#2A2F3A]">
                  <p className="font-medium text-gray-900 dark:text-[#fafafa]">
                    {contract.simulator}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-[#1A1F26] px-6 py-4 flex justify-end border-t border-gray-100 dark:border-[#2A2F3A]">
              <Button onClick={() => setIsContractModalOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {isRouteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 min-h-[100dvh]">
          <div className="bg-white dark:bg-[#1A1F26] rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-[#2A2F3A]">
              <h3 className="text-xl font-bold text-gray-900 dark:text-[#fafafa]">
                {routeModalTarget === -1
                  ? "Marcar Nova Entrega"
                  : "Editar Rota da Entrega"}
              </h3>
              <button
                onClick={() => setIsRouteModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-[#d4d4d8] dark:hover:text-[#a1a1aa] hover:bg-gray-100 dark:bg-[#27272a] dark:hover:bg-[#3f3f46]/50 rounded-full transition-colors"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold text-gray-500 dark:text-[#a1a1aa] uppercase tracking-widest mb-1.5">
                  Origem
                </label>
                <input
                  type="text"
                  className="w-full bg-gray-100 dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-xl px-4 py-3 text-[15px] text-gray-900 dark:text-[#fafafa] font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-[#71717a]"
                  value={routeOrigin}
                  onChange={(e) => setRouteOrigin(e.target.value)}
                  placeholder="Ex: São Paulo"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-extrabold text-gray-500 dark:text-[#a1a1aa] uppercase tracking-widest mb-1.5">
                  Destino
                </label>
                <input
                  type="text"
                  className="w-full bg-gray-100 dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-xl px-4 py-3 text-[15px] text-gray-900 dark:text-[#fafafa] font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-[#71717a]"
                  value={routeDestination}
                  onChange={(e) => setRouteDestination(e.target.value)}
                  placeholder="Ex: Rio de Janeiro"
                />
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-[#1A1F26] px-6 py-4 flex justify-end gap-3 border-t border-gray-100 dark:border-[#2A2F3A]">
              <Button
                variant="outline"
                onClick={() => setIsRouteModalOpen(false)}
                className="bg-white dark:bg-[#1A1F26]"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveRoute}
                disabled={!routeOrigin.trim() || !routeDestination.trim()}
              >
                Salvar Rota
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Snackbar for Copied Paint Code */}
      {copiedCode && (
        <div className="fixed bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5">
          <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg dark:shadow-none font-medium text-sm flex items-center gap-2">
            <CheckCircle size={16} className="text-green-400" />
            {copiedCode}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard(props: { isIntegrated?: boolean }) {
  return (
    <ErrorBoundary>
      <DashboardComponent {...props} />
    </ErrorBoundary>
  );
}
