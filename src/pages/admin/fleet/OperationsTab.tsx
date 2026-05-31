import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../../context/AppContext';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Activity, FileText, UserPlus, Users, ArrowRight, Package, TrendingUp, Bell, ChevronRight, Container, Box, ChevronDown, ChevronUp, MapPin, CheckCircle2, Clock, Truck, User, Car, Trash2, Filter, Star, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../../lib/utils';
import DriverProfileModal from './DriverProfileModal';
import ContractDetailsModal from './ContractDetailsModal';

export default function OperationsTab() {
  const { users, contracts, jobs, vehicles, trailers, companies, currentUser, cancelJob, activeCompanyId, allCompanyMembers, jobDemands, rejectJobDemand } = useAppStore();
  const navigate = useNavigate();
  
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [activeMobileSection, setActiveMobileSection] = useState<string | null>(null);
  const [activeJobsFilter, setActiveJobsFilter] = useState<'all' | 'pending' | 'attention' | 'late'>('all');
  const [viewingDriverId, setViewingDriverId] = useState<string | null>(null);
  const [viewingContractId, setViewingContractId] = useState<string | null>(null);
  const [cancelingJobId, setCancelingJobId] = useState<string | null>(null);
  const [isDemandsExpanded, setIsDemandsExpanded] = useState(false);

  type SummaryPeriodOption = 'today' | '7d' | '15d' | 'thisMonth' | 'all';
  const [summaryPeriod, setSummaryPeriod] = useState<SummaryPeriodOption>(() => {
    return (localStorage.getItem('nvu_ops_summary_period') as SummaryPeriodOption) || '7d';
  });
  const [isSummaryPeriodOpen, setIsSummaryPeriodOpen] = useState(false);

  const periodLabels: Record<SummaryPeriodOption, string> = {
    today: 'Hoje',
    '7d': 'Últimos 7 dias',
    '15d': 'Últimos 15 dias',
    thisMonth: 'Este mês',
    all: 'Todo o período'
  };

  const handlePeriodChange = (p: SummaryPeriodOption) => {
    setSummaryPeriod(p);
    localStorage.setItem('nvu_ops_summary_period', p);
    setIsSummaryPeriodOpen(false);
  };

  const isJobInSummaryPeriod = (dateStr?: string) => {
    if (!dateStr || summaryPeriod === 'all') return true;
    try {
      const date = parseISO(dateStr);
      const today = new Date();
      if (summaryPeriod === 'today') return date >= startOfDay(today) && date <= endOfDay(today);
      if (summaryPeriod === '7d') return date >= startOfDay(subDays(today, 6)) && date <= endOfDay(today);
      if (summaryPeriod === '15d') return date >= startOfDay(subDays(today, 14)) && date <= endOfDay(today);
      if (summaryPeriod === 'thisMonth') return date >= startOfMonth(today) && date <= endOfMonth(today);
      return false;
    } catch {
      return false;
    }
  };

  const summaryJobs = useMemo(() => {
    return jobs.filter(j => 
       j.companyId === activeCompanyId && 
       j.status !== 'cancelled' &&
       isJobInSummaryPeriod(j.createdAt)
    );
  }, [jobs, activeCompanyId, summaryPeriod]);

  const activeDriverIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of allCompanyMembers) {
      if (m.companyId === activeCompanyId && m.status === 'active' && m.roles?.includes('driver')) {
        ids.add(m.userId);
      }
    }
    return ids;
  }, [allCompanyMembers, activeCompanyId]);

  const drivers = useMemo(() => users.filter(u => activeDriverIds.has(u.id)), [users, activeDriverIds]);

  const {
    summaryActiveDriversCount,
    summaryActiveCompleted,
    summaryActiveRequired,
    summaryContractsCompleted,
    summaryContractsCreated,
    summaryEfficiency,
  } = useMemo(() => {
    const activeSummaryDriverIds = new Set<string>();
    let comp = 0;
    let req = 0;
    let contractsComp = 0;
    let contractsCreated = summaryJobs.length;

    for (const job of summaryJobs) {
      if (job.driverId && activeDriverIds.has(job.driverId)) {
        activeSummaryDriverIds.add(job.driverId);
      }

      if (job.status === 'completed') {
        contractsComp++;
      }

      const contract = contracts.find(c => c.id === job.contractId);
      req += (contract?.totalDeliveries || 0);
      comp += (job.progress || 0);
    }

    let eff: number | string = 0;
    if (req === 0) {
      eff = '--';
    } else {
      eff = Math.min(100, Math.max(0, Math.round((comp / req) * 100)));
    }

    return {
       summaryActiveDriversCount: activeSummaryDriverIds.size,
       summaryActiveCompleted: comp,
       summaryActiveRequired: req,
       summaryContractsCompleted: contractsComp,
       summaryContractsCreated: contractsCreated,
       summaryEfficiency: eff,
    };
  }, [summaryJobs, contracts, activeDriverIds]);

  const pendingDemands = useMemo(() => {
    return jobDemands.filter(d => d.companyId === activeCompanyId && d.status === 'pending');
  }, [jobDemands, activeCompanyId]);

  const activeDriversCount = useMemo(() => drivers.filter(u => u.status === 'active' && u.isOnline).length, [drivers]);
  const activeDrivers = activeDriversCount;

  const activeContractsCount = contracts.length;

  // Computed data for Active Jobs
  const getJobStatusDetails = (job: any, contract: any) => {
    if (job.status === 'completed') return { text: 'Concluído', color: 'bg-green-500', bg: 'bg-green-50 dark:bg-green-500/10 dark:border-green-500/20', icon: CheckCircle2 };
    if (job.status === 'cancelled') return { text: 'Cancelado', color: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-500/10 dark:border-red-500/20' };
    
    const daysLeft = differenceInDays(new Date(job.deadlineDate), new Date());
    
    if (daysLeft < 0) return { text: 'Atrasado', color: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-500/10 dark:border-red-500/20' };
    if (daysLeft <= 2) return { text: 'Atenção', color: 'bg-amber-50 dark:bg-amber-500/100', bg: 'bg-amber-50 dark:bg-amber-500/10' };
    if (job.status === 'active') return { text: 'Em Andamento', color: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20' };
    
    return { text: 'Não Iniciado', color: 'bg-gray-400', bg: 'bg-gray-50 dark:bg-[#1A1F26]' };
  };

  const activeJobsList = useMemo(() => {
    return jobs.map(job => {
      const contract = contracts.find(c => c.id === job.contractId);
      const driver = users.find(u => u.id === job.driverId);
      const vehicle = vehicles.find(v => v.id === job.vehicleId);
      const effectiveTrailerId = job.trailerId || contract?.trailerId;
      const trailer = trailers.find(t => t.id === effectiveTrailerId);
      const company = companies.find(c => c.id === job.companyId);
      
      const statusDetails = getJobStatusDetails(job, contract);
      const daysLeft = differenceInDays(new Date(job.deadlineDate), new Date());

      return {
        ...job,
        contract,
        driver,
        vehicle,
        trailer,
        company,
        statusDetails,
        daysLeft
      };
    }).filter(j => j.contract && j.driver && !['completed', 'cancelled'].includes(j.status));
  }, [jobs, contracts, users, vehicles, trailers, companies]);

  const filteredActiveJobsList = useMemo(() => {
    return activeJobsList.filter(job => {
      if (activeJobsFilter === 'late') return job.daysLeft < 0;
      if (activeJobsFilter === 'attention') return job.daysLeft >= 0 && job.daysLeft <= 2;
      if (activeJobsFilter === 'pending') return job.status === 'pending';
      return true;
    });
  }, [activeJobsList, activeJobsFilter]);

  // Detailed Operation Status
  const { pendingJobs, inProgressJobs, warningJobs, delayedJobs } = useMemo(() => {
    let p = 0, i = 0, w = 0, d = 0;
    for (const j of activeJobsList) {
      if (j.status === 'pending') p++;
      if (j.status === 'active' && j.daysLeft > 2) i++;
      if (['active', 'pending'].includes(j.status)) {
        if (j.daysLeft >= 0 && j.daysLeft <= 2) w++;
        if (j.daysLeft < 0) d++;
      }
    }
    return { pendingJobs: p, inProgressJobs: i, warningJobs: w, delayedJobs: d };
  }, [activeJobsList]);
  
  const totalActiveList = activeJobsList.length || 1; // avoid div by 0

  return (
    <div className="space-y-6">
      {/* --- SOLICITAÇÕES DE TRABALHO (NVU) --- */}
      {pendingDemands.length > 0 && (
        <div className="bg-white dark:bg-[#1A1F26] rounded-[20px] shadow-sm border border-gray-100 dark:border-[#2A2F3A] overflow-hidden">
          <button 
            onClick={() => setIsDemandsExpanded(!isDemandsExpanded)}
            className="w-full h-[56px] flex items-center justify-between px-4 sm:px-5 bg-white dark:bg-[#1A1F26] hover:bg-gray-50/50 dark:hover:bg-[#202630] transition-colors"
          >
            <div className="flex items-center min-w-0">
              <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0"></div>
              <div className="h-5 w-px bg-gray-200 dark:bg-[#2A2F3A] mx-3 sm:mx-4 shrink-0"></div>
              <span className="font-semibold text-gray-900 dark:text-[#fafafa] text-sm sm:text-[15px] whitespace-nowrap">
                Solicitações de Trabalho
              </span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 pl-4 shrink-0">
              <div className="bg-[#f4f4f5] dark:bg-[#2A2F3A] text-gray-900 dark:text-[#fafafa] min-w-[24px] h-6 px-2 rounded-full flex items-center justify-center shrink-0">
                <span className="font-semibold text-xs sm:text-sm leading-none">{pendingDemands.length}</span>
              </div>
              {isDemandsExpanded ? (
                <ChevronUp size={20} className="text-gray-400 shrink-0" />
              ) : (
                <ChevronDown size={20} className="text-gray-400 shrink-0" />
              )}
            </div>
          </button>
          
          <div className={cn("transition-all duration-200 ease-in-out border-t border-gray-100 dark:border-[#2A2F3A]", isDemandsExpanded ? "opacity-100" : "max-h-0 opacity-0 overflow-hidden border-t-0")}>
             <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4 bg-gray-50/50 dark:bg-[#1A1F26]">
               {pendingDemands.map(demand => {
                 const driver = users.find(u => u.id === demand.driverId);
                 const driverJobs = jobs.filter(j => j.driverId === demand.driverId && j.status === 'completed');
                 const totalJobs = driverJobs.length;
                 const rating = driver?.rating?.toFixed(1) || '5.0';
                 
                 return (
                   <div key={demand.id} className="bg-white dark:bg-[#1A1F26] rounded-2xl p-4 border border-gray-200 dark:border-[#2A2F3A]/60 shadow-sm relative group hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                      <div className="flex items-center justify-between mb-4">
                         <div className="flex items-center gap-3 min-w-0">
                            {driver?.photoURL || driver?.avatar ? (
                              <img src={driver?.photoURL || driver?.avatar} alt={driver?.name} className="w-11 h-11 rounded-full object-cover shrink-0 border border-gray-100 dark:border-[#2A2F3A]" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-11 h-11 rounded-full bg-gray-50 dark:bg-[#1A1F26] text-gray-600 dark:text-[#d4d4d8] flex items-center justify-center font-bold text-sm shrink-0 border border-gray-200 dark:border-[#2A2F3A]">
                                {driver?.name?.substring(0, 2).toUpperCase() || 'M'}
                              </div>
                            )}
                            <div className="min-w-0">
                               <p className="font-bold text-gray-900 dark:text-[#fafafa] text-[14px] truncate">{driver?.name}</p>
                               <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-[#a1a1aa] mt-0.5">
                                  <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400"><Star size={11} className="fill-current" /> {rating}</span>
                                  <span className="text-gray-300">•</span>
                                  <span className="truncate">{totalJobs} trabalhos</span>
                               </div>
                            </div>
                         </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          onClick={() => navigate('/admin/operations', { state: { preselectedDriverId: demand.driverId, isAssigning: true } })}
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white h-8 font-semibold text-xs shadow-none"
                        >
                           Encaminhar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setViewingDriverId(demand.driverId)}
                          className="px-3 h-8 text-xs font-semibold text-gray-600 dark:text-[#d4d4d8] border-gray-200 dark:border-[#2A2F3A]"
                        >
                           Perfil
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => rejectJobDemand(demand.id)}
                          className="px-2 h-8 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg shrink-0"
                          title="Recusar solicitação"
                        >
                           <X size={16} />
                        </Button>
                      </div>
                   </div>
                 );
               })}
             </div>
          </div>
        </div>
      )}

      {/* --- MOBILE DASHBOARD --- */}
      <div className="md:hidden space-y-4">
         {/* 1. Resumo Operacional (Sempre expandido) */}
         <div className="bg-white dark:bg-[#1A1F26] border text-gray-900 dark:text-[#fafafa] border-gray-200 dark:border-[#2A2F3A] rounded-xl overflow-hidden shadow-sm dark:shadow-none">
           <div className="relative group/period w-full flex items-start justify-between p-3 bg-white dark:bg-[#1A1F26] border-b border-gray-100 dark:border-[#2A2F3A] cursor-pointer" onClick={() => setIsSummaryPeriodOpen(!isSummaryPeriodOpen)}>
             <div className="flex flex-col text-left">
               <span className="font-bold text-[15px] text-gray-900 dark:text-[#fafafa]">Resumo Operacional</span>
               <span className="text-[12px] text-gray-500 dark:text-[#a1a1aa] font-medium">{periodLabels[summaryPeriod]}</span>
             </div>
             <ChevronDown size={16} className="text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
             
             {isSummaryPeriodOpen && (
                <div className="absolute right-3 top-full mt-1 w-44 bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-xl shadow-lg z-50 py-1" onClick={e => e.stopPropagation()}>
                   {(Object.entries(periodLabels) as [SummaryPeriodOption, string][]).map(([key, label]) => (
                     <button
                        key={key}
                        className={cn("w-full text-left px-4 py-2 text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-[#2A2F3A] transition-colors", summaryPeriod === key ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-[#d4d4d8]")}
                        onClick={() => handlePeriodChange(key)}
                     >
                       {label}
                     </button>
                   ))}
                </div>
             )}
           </div>
           <div>
             <div className="p-3 grid grid-cols-2 gap-2">
                <div className="bg-gray-50 dark:bg-[#1A1F26] rounded-lg p-3 flex flex-col justify-center border border-gray-100 dark:border-[#2A2F3A] h-[70px]">
                   <span className="text-[11px] text-gray-500 dark:text-[#a1a1aa] font-bold uppercase tracking-wider mb-1">Motoristas</span>
                   <span className="text-[18px] font-bold text-gray-900 dark:text-[#fafafa] leading-none">{Math.min(summaryActiveDriversCount, drivers.length)}<span className="text-[12px] text-gray-400 ml-1">/{drivers.length}</span></span>
                </div>
                <div className="bg-gray-50 dark:bg-[#1A1F26] rounded-lg p-3 flex flex-col justify-center border border-gray-100 dark:border-[#2A2F3A] h-[70px]">
                   <span className="text-[11px] text-gray-500 dark:text-[#a1a1aa] font-bold uppercase tracking-wider mb-1">Entregas</span>
                   <span className="text-[18px] font-bold text-gray-900 dark:text-[#fafafa] leading-none">{summaryActiveCompleted}<span className="text-[12px] text-gray-400 ml-1">/{summaryActiveRequired}</span></span>
                </div>
                <div className="bg-gray-50 dark:bg-[#1A1F26] rounded-lg p-3 flex flex-col justify-center border border-gray-100 dark:border-[#2A2F3A] h-[70px]">
                   <span className="text-[11px] text-gray-500 dark:text-[#a1a1aa] font-bold uppercase tracking-wider mb-1">Contratos</span>
                   <span className="text-[18px] font-bold text-gray-900 dark:text-[#fafafa] leading-none">{summaryContractsCompleted}<span className="text-[12px] text-gray-400 ml-1">/{summaryContractsCreated}</span></span>
                </div>
                <div className="bg-gray-50 dark:bg-[#1A1F26] rounded-lg p-3 flex flex-col justify-center border border-gray-100 dark:border-[#2A2F3A] h-[70px]">
                   <span className="text-[11px] text-gray-500 dark:text-[#a1a1aa] font-bold uppercase tracking-wider mb-1">Eficiência</span>
                   <span className={`text-[18px] font-bold leading-none ${summaryEfficiency === '--' ? 'text-gray-400' : (Number(summaryEfficiency) >= 80 ? 'text-green-600 dark:text-green-400' : (Number(summaryEfficiency) >= 50 ? 'text-amber-500' : 'text-red-500'))}`}>{summaryEfficiency}{summaryEfficiency !== '--' && '%'}</span>
                </div>
             </div>
           </div>
         </div>

         {/* 2. Ações Rápidas (Recolhido) */}
         <div className="bg-white dark:bg-[#1A1F26] border text-gray-900 dark:text-[#fafafa] border-gray-200 dark:border-[#2A2F3A] rounded-xl overflow-hidden shadow-sm dark:shadow-none">
           <button 
             onClick={() => setActiveMobileSection(activeMobileSection === 'actions' ? null : 'actions')}
             className="w-full flex items-center justify-between p-3 bg-white dark:bg-[#1A1F26]"
           >
             <span className="font-bold text-[15px]">Ações Rápidas</span>
             {activeMobileSection === 'actions' ? <ChevronUp size={18} className="text-gray-500 dark:text-[#a1a1aa]" /> : <ChevronDown size={18} className="text-gray-500 dark:text-[#a1a1aa]" />}
           </button>
           <div className={cn("transition-all duration-200 ease-in-out", activeMobileSection === 'actions' ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0 overflow-hidden")}>
             <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-[#2A2F3A] space-y-1.5">
               <button onClick={() => navigate('/admin/operations', { state: { filter: 'ongoing' } })} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-[#1A1F26] active:bg-gray-50 dark:bg-[#1A1F26] transition-colors">
                 <div className="flex items-center gap-3 text-[13px] font-bold text-gray-800 dark:text-[#d4d4d8]"><Activity size={18} className="text-green-600 dark:text-green-400"/> <span>Operações</span></div><ChevronRight size={16} className="text-gray-400" />
               </button>
               <button onClick={() => navigate('/admin/fleet', { state: { activeTab: 'contracts' } })} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-[#1A1F26] active:bg-gray-50 dark:bg-[#1A1F26] transition-colors">
                 <div className="flex items-center gap-3 text-[13px] font-bold text-gray-800 dark:text-[#d4d4d8]"><FileText size={18} className="text-indigo-600 dark:text-indigo-400"/> <span>Contratos</span></div><ChevronRight size={16} className="text-gray-400" />
               </button>
               <button onClick={() => navigate('/admin/operations', { state: { isAssigning: true } })} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-[#1A1F26] active:bg-gray-50 dark:bg-[#1A1F26] transition-colors">
                 <div className="flex items-center gap-3 text-[13px] font-bold text-gray-800 dark:text-[#d4d4d8]"><UserPlus size={18} className="text-orange-600 dark:text-orange-400"/> <span>Designar Trabalho</span></div><ChevronRight size={16} className="text-gray-400" />
               </button>
               <button onClick={() => navigate('/admin/fleet', { state: { activeTab: 'drivers' } })} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-[#1A1F26] active:bg-gray-50 dark:bg-[#1A1F26] transition-colors">
                 <div className="flex items-center gap-3 text-[13px] font-bold text-gray-800 dark:text-[#d4d4d8]"><Users size={18} className="text-blue-600 dark:text-blue-400"/> <span>Aprovar Motoristas</span></div><ChevronRight size={16} className="text-gray-400" />
               </button>
             </div>
           </div>
         </div>

         {/* 3. Trabalhos Ativos (Sempre expandido) */}
         <div className="bg-white dark:bg-[#1A1F26] border text-gray-900 dark:text-[#fafafa] border-gray-200 dark:border-[#2A2F3A] rounded-xl overflow-hidden shadow-sm dark:shadow-none">
           <div className="w-full flex items-center justify-between p-3 bg-white dark:bg-[#1A1F26] border-b border-gray-100 dark:border-[#2A2F3A]">
             <span className="font-bold text-[15px]">Trabalhos Ativos</span>
             <div className="relative inline-flex items-center">
                <Filter size={14} className="absolute left-2 text-gray-500 dark:text-[#a1a1aa]" />
                <select 
                   className="pl-7 pr-6 py-1 text-[12px] font-medium bg-gray-50 dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A] rounded-lg text-gray-700 dark:text-[#a1a1aa] appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm dark:shadow-none cursor-pointer"
                   value={activeJobsFilter}
                   onChange={(e) => setActiveJobsFilter(e.target.value as any)}
                >
                   <option value="all">Em aberto</option>
                   <option value="pending">Não iniciados</option>
                   <option value="attention">Próximos do prazo</option>
                   <option value="late">Vencidos</option>
                </select>
                <ChevronDown size={14} className="absolute right-2 text-gray-500 pointer-events-none" />
             </div>
           </div>
           <div>
             <div className="p-3 space-y-1.5 overflow-hidden">
                {filteredActiveJobsList.slice(0, 5).map(job => {
                  const isExpanded = expandedJobId === job.id;
                  const progressPct = Math.round((job.progress / Math.max(1, job.contract!.totalDeliveries)) * 100) || 0;
                  const deliveriesLeft = job.contract!.totalDeliveries - job.progress;
                  const isOverdue = job.daysLeft < 0;

                  return (
                    <div key={job.id} className={cn("relative flex flex-col border rounded-[24px] transition-all overflow-hidden bg-white dark:bg-[#1A1F26]", isExpanded ? "border-blue-500 shadow-md dark:shadow-none ring-1 ring-blue-500/20" : "border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md dark:shadow-none")}>
                      <button onClick={() => setExpandedJobId(isExpanded ? null : job.id)} className="w-full text-left p-4 flex flex-col gap-4">
                        <div className="flex justify-between items-start gap-4 pr-6 relative w-full">
                          <div className="flex-1 min-w-0 pr-4">
                             <h3 className="font-semibold text-gray-900 dark:text-[#fafafa] text-[15px] sm:text-[16px] truncate tracking-tight mb-1">{job.driver!.name}</h3>
                             <div className="flex flex-col gap-1 text-[12px] text-gray-500 dark:text-[#a1a1aa] mt-1 mb-2 sm:mb-0">
                               <span className="font-medium text-gray-800 dark:text-[#d4d4d8] truncate">{job.contract!.name}</span>
                               {job.vehicle ? <span className="flex items-center gap-1.5 truncate"><Car size={13} className="shrink-0 text-gray-400"/>{job.vehicle.name}</span> : <span className="flex items-center gap-1.5"><Car size={13} className="shrink-0 text-gray-400"/>S/ Veículo</span>}
                               {job.trailer ? <span className="flex items-center gap-1.5 truncate"><Truck size={13} className="shrink-0 text-gray-400"/>{job.trailer.name}</span> : <span className="flex items-center gap-1.5"><Truck size={13} className="shrink-0 text-gray-400"/>S/ Reboque</span>}
                             </div>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-2">
                            {/* Status de On e Off */}
                            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-lg px-2 py-1 cursor-default" title={job.driver!.isOnline ? "Online" : "Offline"}>
                               <span className={cn("text-[10px] font-bold tracking-tight uppercase", job.driver!.isOnline ? "text-green-600" : "text-gray-500 dark:text-[#a1a1aa]")}>
                                  {job.driver!.isOnline ? 'On' : 'Off'}
                               </span>
                               <div className="relative inline-flex items-center shrink-0">
                                  <div className={cn("w-[24px] h-[14px] rounded-full shadow-inner dark:shadow-none relative transition-colors", job.driver!.isOnline ? "bg-[#32D74B]" : "bg-gray-200 dark:bg-white/10")}>
                                    <div className={cn("absolute top-[2px] transition-all bg-white dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-full h-[10px] w-[10px]", job.driver!.isOnline ? "left-[12px] border-white" : "left-[2px]")}></div>
                                  </div>
                               </div>
                            </div>
                          </div>
                          <div className="absolute right-0 top-[0px] text-gray-400 mt-1">
                            {isExpanded ? <ChevronUp size={22} strokeWidth={2} /> : <ChevronDown size={22} strokeWidth={2} />}
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-3 w-full">
                          {/* Card progress */}
                          <div className="w-full shrink-0 border border-gray-200 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#1A1F26] rounded-2xl p-4 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                              <div className="flex flex-col items-start leading-tight">
                                <span className="text-[15px] text-blue-600 dark:text-blue-400 font-medium tracking-tight mb-0.5">{job.progress}/{job.contract!.totalDeliveries}</span>
                                <span className="text-[12px] text-gray-500 dark:text-[#a1a1aa]">entregas realizadas</span>
                              </div>
                              <div className="flex flex-col items-end leading-tight">
                                <span className="text-[15px] text-blue-600 dark:text-blue-400 font-medium tracking-tight mb-0.5">{deliveriesLeft}</span>
                                <span className="text-[12px] text-gray-500 dark:text-[#a1a1aa]">faltam</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-gray-200 dark:bg-white/10/70 dark:bg-[#27272a] rounded-full h-[5px] overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500 bg-[#00D1FF] shadow-[0_0_10px_rgba(0,209,255,0.4)]" style={{ width: `${Math.max(3, progressPct)}%` }}></div>
                              </div>
                              <span className="text-[12px] font-medium text-blue-600 dark:text-blue-400 shrink-0 min-w-[28px] text-right">{progressPct}%</span>
                            </div>
                          </div>
                          
                          {/* Prazo */}
                          <div className="flex px-1 pt-1 items-center gap-2">
                             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Prazo limite:</span>
                             <span className={cn("font-medium flex items-center gap-1.5 text-[12px]", isOverdue && job.status === 'active' ? "text-red-600 font-bold" : "text-gray-900 dark:text-[#fafafa]")}>
                                <Clock size={13} className={cn(isOverdue && job.status === 'active' ? "text-red-500" : "text-gray-400")} /> 
                                {format(new Date(job.deadlineDate), "dd/MM/yyyy")}
                             </span>
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-gray-100 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#1A1F26] p-3 sm:p-4 flex gap-2">
                             <Button 
                               onClick={(e) => { e.stopPropagation(); setViewingDriverId(job.driver!.id); }}
                               className="flex-1 h-9 text-[12px] font-semibold text-gray-700 dark:text-[#d4d4d8] bg-white dark:bg-[#1A1F26] hover:bg-gray-50 dark:hover:bg-[#3f3f46] border border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none rounded-xl" 
                             >
                               <User size={14} className="mr-1.5" /> Perfil
                             </Button>
                            
                            {job.status !== 'completed' && job.status !== 'cancelled' && (
                              <Button 
                                className="flex-1 h-9 px-4 text-[12px] font-semibold text-red-600 bg-white dark:bg-[#1A1F26] hover:bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 border border-red-200 shadow-sm dark:shadow-none rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={cancelingJobId === job.id}
                                onClick={(e) => {
                                   e.stopPropagation();
                                   {
                                      setCancelingJobId(job.id);
                                      cancelJob(job.id).finally(() => { setCancelingJobId(null); setExpandedJobId(null); });
                                   }
                                }}
                              >
                                {cancelingJobId === job.id ? 'Cancelando...' : 'Cancelar'}
                              </Button>
                            )}
                          </div>
                      )}
                    </div>
                  )
               })}
               <Button onClick={() => navigate('/admin/operations')} variant="ghost" className="w-full text-[13px] h-10 mt-2 font-bold text-blue-600 dark:text-blue-400">Ver operação completa</Button>
             </div>
           </div>
         </div>

         {/* 4. Desempenho da Rede (Sempre expandido) */}
         <div className="bg-white dark:bg-[#1A1F26] border text-gray-900 dark:text-[#fafafa] border-gray-200 dark:border-[#2A2F3A] rounded-xl overflow-hidden shadow-sm dark:shadow-none">
           <div className="w-full flex items-center justify-between p-3 bg-white dark:bg-[#1A1F26] border-b border-gray-100 dark:border-[#2A2F3A]">
             <span className="font-bold text-[15px]">Desempenho da Rede</span>
           </div>
           <div>
             <div className="p-4 space-y-3.5">
                   <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-[#52525b]"></div>
                          <span className="text-[13px] font-bold text-gray-700 dark:text-[#d4d4d8]">Não iniciados</span>
                       </div>
                       <div className="flex items-center gap-3">
                          <span className="font-bold text-[13px]">{pendingJobs}</span>
                          <span className="text-gray-400 text-[11px] w-7 text-right">{Math.round((pendingJobs / totalActiveList) * 100)}%</span>
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-50 dark:bg-blue-500/100"></div>
                          <span className="text-[13px] font-bold text-gray-700 dark:text-[#d4d4d8]">Em andamento</span>
                       </div>
                       <div className="flex items-center gap-3">
                          <span className="font-bold text-[13px]">{inProgressJobs}</span>
                          <span className="text-gray-400 text-[11px] w-7 text-right">{Math.round((inProgressJobs / totalActiveList) * 100)}%</span>
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>
                          <span className="text-[13px] font-bold text-gray-700 dark:text-[#d4d4d8]">Próximos do prazo</span>
                       </div>
                       <div className="flex items-center gap-3">
                          <span className="font-bold text-[13px]">{warningJobs}</span>
                          <span className="text-gray-400 text-[11px] w-7 text-right">{Math.round((warningJobs / totalActiveList) * 100)}%</span>
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                          <span className="text-[13px] font-bold text-gray-700 dark:text-[#d4d4d8]">Vencidos</span>
                       </div>
                       <div className="flex items-center gap-3">
                          <span className="font-bold text-[13px]">{delayedJobs}</span>
                          <span className="text-gray-400 text-[11px] w-7 text-right">{Math.round((delayedJobs / totalActiveList) * 100)}%</span>
                       </div>
                    </div>
             </div>
           </div>
         </div>
      </div>

      {/* --- DESKTOP DASHBOARD (Hidden on mobile) --- */}
      <div className="hidden md:block space-y-6">
        {/* Quick Actions (White Card background) */}
      <Card className="rounded-2xl border-none shadow-sm dark:shadow-none">
        <CardContent className="p-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-[#fafafa] mb-4">Ações Rápidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button onClick={() => navigate('/admin/operations', { state: { filter: 'ongoing' } })} className="flex items-center justify-between p-4 rounded-xl bg-green-50 dark:bg-green-500/10 dark:border-green-500/20 hover:bg-green-100 dark:bg-green-500/20 transition-colors text-left group">
               <div className="flex items-center gap-4">
                 <div className="text-green-600 dark:text-green-400">
                    <Activity size={24} strokeWidth={1.5} />
                 </div>
                 <div>
                   <p className="font-bold text-gray-900 dark:text-[#fafafa] text-sm">1. Operações</p>
                   <p className="text-[11px] text-gray-500 dark:text-[#a1a1aa]">Ver trabalhos ativos</p>
                 </div>
               </div>
               <div className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center">
                  <ArrowRight size={14} />
               </div>
            </button>

            <button onClick={() => navigate('/admin/fleet', { state: { activeTab: 'contracts' } })} className="flex items-center justify-between p-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:bg-indigo-500/20 transition-colors text-left group">
               <div className="flex items-center gap-4">
                 <div className="text-indigo-600 dark:text-indigo-400">
                    <FileText size={24} strokeWidth={1.5} />
                 </div>
                 <div>
                   <p className="font-bold text-gray-900 dark:text-[#fafafa] text-sm">2. Contratos</p>
                   <p className="text-[11px] text-gray-500 dark:text-[#a1a1aa]">Abrir seção de contratos</p>
                 </div>
               </div>
               <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                  <ArrowRight size={14} />
               </div>
            </button>

            <button onClick={() => navigate('/admin/operations', { state: { isAssigning: true } })} className="flex items-center justify-between p-4 rounded-xl bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:bg-orange-500/20 transition-colors text-left group">
               <div className="flex items-center gap-4">
                 <div className="text-orange-600 dark:text-orange-400">
                    <UserPlus size={24} strokeWidth={1.5} />
                 </div>
                 <div>
                   <p className="font-bold text-gray-900 dark:text-[#fafafa] text-sm">3. Designar</p>
                   <p className="text-[11px] text-gray-500 dark:text-[#a1a1aa]">Designar trabalho para motorista</p>
                 </div>
               </div>
               <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center">
                  <ArrowRight size={14} />
               </div>
            </button>

             <button onClick={() => navigate('/admin/fleet', { state: { activeTab: 'drivers' } })} className="flex items-center justify-between p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 hover:bg-blue-100 dark:bg-blue-500/20 transition-colors text-left group">
               <div className="flex items-center gap-4">
                 <div className="text-blue-600 dark:text-blue-400">
                    <Users size={24} strokeWidth={1.5} />
                 </div>
                 <div>
                   <p className="font-bold text-gray-900 dark:text-[#fafafa] text-sm">4. Aprovar</p>
                   <p className="text-[11px] text-gray-500 dark:text-[#a1a1aa]">Aprovar motoristas</p>
                 </div>
               </div>
               <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                  <ArrowRight size={14} />
               </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Resumo Operacional Card (Desktop) */}
      <Card className="rounded-2xl border-none shadow-sm dark:shadow-none bg-white dark:bg-[#1A1F26] border-gray-200 dark:border-[#2A2F3A] overflow-visible">
         <CardContent className="p-6">
            <div className="relative group/period flex items-start justify-between mb-6 cursor-pointer" onClick={() => setIsSummaryPeriodOpen(!isSummaryPeriodOpen)}>
              <div className="flex flex-col text-left">
                <h2 className="text-base font-bold text-gray-900 dark:text-[#fafafa]">Resumo Operacional</h2>
                <span className="text-[12px] text-gray-500 dark:text-[#a1a1aa] font-medium">{periodLabels[summaryPeriod]}</span>
              </div>
              <ChevronDown size={16} className="text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
              
              {isSummaryPeriodOpen && (
                 <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-xl shadow-lg z-50 py-1" onClick={e => e.stopPropagation()}>
                    {(Object.entries(periodLabels) as [SummaryPeriodOption, string][]).map(([key, label]) => (
                      <button
                         key={key}
                         className={cn("w-full text-left px-4 py-2 text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-[#2A2F3A] transition-colors", summaryPeriod === key ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-[#d4d4d8]")}
                         onClick={() => handlePeriodChange(key as SummaryPeriodOption)}
                      >
                        {label}
                      </button>
                    ))}
                 </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
               <div className="bg-gray-50 dark:bg-[#1A1F26] rounded-xl p-4 flex flex-col justify-center border border-gray-100 dark:border-[#2A2F3A] h-[90px]">
                  <span className="text-[12px] text-gray-500 dark:text-[#a1a1aa] font-bold uppercase tracking-wider mb-2">Motoristas</span>
                  <span className="text-[24px] font-bold text-gray-900 dark:text-[#fafafa] leading-none">{Math.min(summaryActiveDriversCount, drivers.length)}<span className="text-[14px] text-gray-400 ml-1">/{drivers.length}</span></span>
               </div>
               <div className="bg-gray-50 dark:bg-[#1A1F26] rounded-xl p-4 flex flex-col justify-center border border-gray-100 dark:border-[#2A2F3A] h-[90px]">
                  <span className="text-[12px] text-gray-500 dark:text-[#a1a1aa] font-bold uppercase tracking-wider mb-2">Entregas</span>
                  <span className="text-[24px] font-bold text-gray-900 dark:text-[#fafafa] leading-none">{summaryActiveCompleted}<span className="text-[14px] text-gray-400 ml-1">/{summaryActiveRequired}</span></span>
               </div>
               <div className="bg-gray-50 dark:bg-[#1A1F26] rounded-xl p-4 flex flex-col justify-center border border-gray-100 dark:border-[#2A2F3A] h-[90px]">
                  <span className="text-[12px] text-gray-500 dark:text-[#a1a1aa] font-bold uppercase tracking-wider mb-2">Contratos</span>
                  <span className="text-[24px] font-bold text-gray-900 dark:text-[#fafafa] leading-none">{summaryContractsCompleted}<span className="text-[14px] text-gray-400 ml-1">/{summaryContractsCreated}</span></span>
               </div>
               <div className="bg-gray-50 dark:bg-[#1A1F26] rounded-xl p-4 flex flex-col justify-center border border-gray-100 dark:border-[#2A2F3A] h-[90px]">
                  <span className="text-[12px] text-gray-500 dark:text-[#a1a1aa] font-bold uppercase tracking-wider mb-2">Eficiência</span>
                  <span className={`text-[24px] font-bold leading-none ${summaryEfficiency === '--' ? 'text-gray-400' : (Number(summaryEfficiency) >= 80 ? 'text-green-600 dark:text-green-400' : (Number(summaryEfficiency) >= 50 ? 'text-amber-500' : 'text-red-500'))}`}>{summaryEfficiency}{summaryEfficiency !== '--' && '%'}</span>
               </div>
            </div>
         </CardContent>
      </Card>

      {/* Main Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Jobs List (Left, 2 columns wide) */}
        <div className="lg:col-span-2 space-y-4">
           <div className="flex items-center justify-between px-1">
             <h2 className="text-base font-bold text-gray-900 dark:text-[#fafafa]">Trabalhos Ativos</h2>
             <div className="flex items-center gap-3">
               <div className="relative inline-flex items-center hidden sm:inline-flex">
                  <Filter size={14} className="absolute left-2 text-gray-500 dark:text-[#a1a1aa]" />
                  <select 
                     className="pl-7 pr-6 py-1 text-[12px] font-medium bg-gray-50 dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A] rounded-lg text-gray-700 dark:text-[#a1a1aa] appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm dark:shadow-none cursor-pointer"
                     value={activeJobsFilter}
                     onChange={(e) => setActiveJobsFilter(e.target.value as any)}
                  >
                     <option value="all">Em aberto</option>
                     <option value="pending">Não iniciados</option>
                     <option value="attention">Próximos do prazo</option>
                     <option value="late">Vencidos</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2 text-gray-500 pointer-events-none" />
               </div>
               <button onClick={() => navigate('/admin/operations')} className="text-sm text-green-600 font-bold hover:text-green-700 dark:text-green-400">Ver todos</button>
             </div>
           </div>
           
           <div className="space-y-3">
              {filteredActiveJobsList.length === 0 ? (
                 <div className="bg-white dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A] border-dashed rounded-2xl p-10 text-center">
                   <p className="text-gray-500 dark:text-[#a1a1aa] font-medium">Nenhum trabalho ativo no momento.</p>
                 </div>
              ) : (
                filteredActiveJobsList.map(job => {
                  const isExpanded = expandedJobId === job.id;
                  const progressPct = Math.round((job.progress / Math.max(1, job.contract!.totalDeliveries)) * 100) || 0;
                  const deliveriesLeft = job.contract!.totalDeliveries - job.progress;
                  const isOverdue = job.daysLeft < 0;
                  
                  return (
                    <div key={job.id} className={cn("relative flex flex-col border rounded-[24px] transition-all overflow-hidden bg-white dark:bg-[#1A1F26]", isExpanded ? "border-blue-500 shadow-md dark:shadow-none ring-1 ring-blue-500/20" : "border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md dark:shadow-none")}>
                      <button onClick={() => setExpandedJobId(isExpanded ? null : job.id)} className="w-full text-left p-4 flex flex-col gap-4">
                        <div className="flex justify-between items-start gap-4 pr-6 relative w-full">
                          <div className="flex-1 min-w-0 pr-4">
                             <h3 className="font-semibold text-gray-900 dark:text-[#fafafa] text-[15px] sm:text-[16px] truncate tracking-tight mb-1">{job.driver!.name}</h3>
                             <div className="flex flex-col gap-1 text-[12px] text-gray-500 dark:text-[#a1a1aa] mt-1 mb-2 sm:mb-0">
                               <span className="font-medium text-gray-800 dark:text-[#d4d4d8] truncate">{job.contract!.name}</span>
                               {job.vehicle ? <span className="flex items-center gap-1.5 truncate"><Car size={13} className="shrink-0 text-gray-400"/>{job.vehicle.name}</span> : <span className="flex items-center gap-1.5"><Car size={13} className="shrink-0 text-gray-400"/>S/ Veículo</span>}
                               {job.trailer ? <span className="flex items-center gap-1.5 truncate"><Truck size={13} className="shrink-0 text-gray-400"/>{job.trailer.name}</span> : <span className="flex items-center gap-1.5"><Truck size={13} className="shrink-0 text-gray-400"/>S/ Reboque</span>}
                             </div>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-2">
                            {/* Status de On e Off */}
                            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-lg px-2 py-1 cursor-default" title={job.driver!.isOnline ? "Online" : "Offline"}>
                               <span className={cn("text-[10px] font-bold tracking-tight uppercase", job.driver!.isOnline ? "text-green-600" : "text-gray-500 dark:text-[#a1a1aa]")}>
                                  {job.driver!.isOnline ? 'On' : 'Off'}
                               </span>
                               <div className="relative inline-flex items-center shrink-0">
                                  <div className={cn("w-[24px] h-[14px] rounded-full shadow-inner dark:shadow-none relative transition-colors", job.driver!.isOnline ? "bg-[#32D74B]" : "bg-gray-200 dark:bg-white/10")}>
                                    <div className={cn("absolute top-[2px] transition-all bg-white dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-full h-[10px] w-[10px]", job.driver!.isOnline ? "left-[12px] border-white" : "left-[2px]")}></div>
                                  </div>
                               </div>
                            </div>
                          </div>
                          <div className="absolute right-0 top-[0px] text-gray-400 mt-1">
                            {isExpanded ? <ChevronUp size={22} strokeWidth={2} /> : <ChevronDown size={22} strokeWidth={2} />}
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-3 w-full">
                          {/* Card progress */}
                          <div className="w-full shrink-0 border border-gray-200 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#1A1F26] rounded-2xl p-4 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                              <div className="flex flex-col items-start leading-tight">
                                <span className="text-[15px] text-blue-600 dark:text-blue-400 font-medium tracking-tight mb-0.5">{job.progress}/{job.contract!.totalDeliveries}</span>
                                <span className="text-[12px] text-gray-500 dark:text-[#a1a1aa]">entregas realizadas</span>
                              </div>
                              <div className="flex flex-col items-end leading-tight">
                                <span className="text-[15px] text-blue-600 dark:text-blue-400 font-medium tracking-tight mb-0.5">{deliveriesLeft}</span>
                                <span className="text-[12px] text-gray-500 dark:text-[#a1a1aa]">faltam</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-gray-200 dark:bg-white/10/70 dark:bg-[#27272a] rounded-full h-[5px] overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500 bg-[#00D1FF] shadow-[0_0_10px_rgba(0,209,255,0.4)]" style={{ width: `${Math.max(3, progressPct)}%` }}></div>
                              </div>
                              <span className="text-[12px] font-medium text-blue-600 dark:text-blue-400 shrink-0 min-w-[28px] text-right">{progressPct}%</span>
                            </div>
                          </div>
                          
                          {/* Prazo */}
                          <div className="flex px-1 pt-1 items-center gap-2">
                             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Prazo limite:</span>
                             <span className={cn("font-medium flex items-center gap-1.5 text-[12px]", isOverdue && job.status === 'active' ? "text-red-600 font-bold" : "text-gray-900 dark:text-[#fafafa]")}>
                                <Clock size={13} className={cn(isOverdue && job.status === 'active' ? "text-red-500" : "text-gray-400")} /> 
                                {format(new Date(job.deadlineDate), "dd/MM/yyyy")}
                             </span>
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-gray-100 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#1A1F26] p-3 sm:p-4 flex gap-2">
                             <Button 
                               onClick={(e) => { e.stopPropagation(); setViewingDriverId(job.driver!.id); }}
                               className="flex-1 h-9 text-[12px] font-semibold text-gray-700 dark:text-[#d4d4d8] bg-white dark:bg-[#1A1F26] hover:bg-gray-50 dark:hover:bg-[#3f3f46] border border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none rounded-xl" 
                             >
                               <User size={14} className="mr-1.5" /> Perfil
                             </Button>
                            
                            {job.status !== 'completed' && job.status !== 'cancelled' && (
                              <Button 
                                className="flex-1 h-9 px-4 text-[12px] font-semibold text-red-600 bg-white dark:bg-[#1A1F26] hover:bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 border border-red-200 shadow-sm dark:shadow-none rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={cancelingJobId === job.id}
                                onClick={(e) => {
                                   e.stopPropagation();
                                   {
                                      setCancelingJobId(job.id);
                                      cancelJob(job.id).finally(() => { setCancelingJobId(null); setExpandedJobId(null); });
                                   }
                                }}
                              >
                                {cancelingJobId === job.id ? 'Cancelando...' : 'Cancelar'}
                              </Button>
                            )}
                          </div>
                      )}
                    </div>
                  )
                })
              )}
           </div>
        </div>

           <div className="space-y-6">
           {/* Info Block */}
           <div className="bg-green-50 dark:bg-green-500/10 dark:border-green-500/20 border border-green-100 dark:border-green-500/20 rounded-2xl p-6 flex items-start gap-4 shadow-[0_2px_10px_rgba(34,197,94,0.05)]">
              <div className="bg-white dark:bg-[#1A1F26] p-2 rounded-xl shrink-0 text-green-600 shadow-sm dark:shadow-none border border-green-100 dark:border-green-500/20">
                 <FileText size={20} />
              </div>
              <div>
                 <h3 className="font-bold text-sm text-gray-900 dark:text-[#fafafa] mb-1 leading-tight">Clique em um trabalho para ver os detalhes do contrato e da operação.</h3>
                 <p className="text-xs text-gray-600 dark:text-[#d4d4d8]">Você verá todas as informações relevantes em uma única visão.</p>
              </div>
           </div>
        </div>

      </div>
      </div>
      {/* --- END DESKTOP DASHBOARD --- */}

      {viewingDriverId && (
        <DriverProfileModal
          driverId={viewingDriverId}
          onClose={() => setViewingDriverId(null)}
          onAssignJob={() => {
             setViewingDriverId(null);
             navigate('/admin/operations', { state: { isAssigning: true, preselectedDriverId: viewingDriverId } });
          }}
          onViewJob={(jobId) => {
             setViewingDriverId(null);
             navigate('/admin/operations', { state: { preselectedJobId: jobId } });
          }}
        />
      )}

      {viewingContractId && (
        <ContractDetailsModal
          contractId={viewingContractId}
          onClose={() => setViewingContractId(null)}
          onEdit={() => {
             // Basic edit mapping -> redirect
             setViewingContractId(null);
             navigate('/admin/fleet', { state: { activeTab: 'contracts', editContractId: viewingContractId } });
          }}
        />
      )}

    </div>
  );
}
