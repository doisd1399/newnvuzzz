import React, { useState } from 'react';
import { useAppStore } from '../../../context/AppContext';
import { Button } from '../../../components/ui/Button';
import { X, CheckCircle, Truck, Car, Info, Phone, Mail, Building2, Gamepad2, AlertCircle, ChevronDown, ChevronUp, Clock, ShieldCheck, Package } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface Props {
  driverId: string;
  onClose: () => void;
  onAssignJob: (driverId: string) => void;
  onViewJob: (jobId: string) => void;
}

export default function DriverProfileModal({ driverId, onClose, onAssignJob, onViewJob }: Props) {
  const { users, jobs, contracts, vehicles, trailers, companies, activeCompanyId, allCompanyMembers } = useAppStore();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  
  const driver = users.find(u => u.id === driverId);
  if (!driver) return null;

  // Find which company this driver belongs to
  const driverMembership = allCompanyMembers?.find(
    (m) => m.userId === driverId && m.status === 'active'
  );
  
  const driverCompany = driverMembership
    ? companies.find((c) => c.id === driverMembership.companyId)
    : null;

  const resolvedCompany = driverCompany || (driver?.companyId ? companies.find(c => c.id === driver.companyId) : null) || (activeCompanyId ? companies.find(c => c.id === activeCompanyId) : null);

  // Active job logic
  const activeJob = jobs.find(j => j.driverId === driverId && ['pending', 'active', 'delayed'].includes(j.status));
  const activeContract = activeJob ? contracts.find(c => c.id === activeJob.contractId) : null;
  const activeVehicle = activeJob && activeJob.vehicleId ? vehicles.find(v => v.id === activeJob.vehicleId) : null;
  const activeTrailerId = activeJob?.trailerId || activeContract?.trailerId;
  const activeTrailer = activeTrailerId ? trailers.find(t => t.id === activeTrailerId) : null;
  
  // Historical jobs logic (only completed ones)
  const allDriverJobs = jobs.filter(j => j.driverId === driverId && j.id !== activeJob?.id);
  const pastJobs = allDriverJobs.filter(j => j.status === 'completed');
  
  const totalDeliveries = pastJobs.reduce((acc, job) => acc + job.progress, 0) + (activeJob ? activeJob.progress : 0);

  const xp = totalDeliveries * 150 + (pastJobs.length * 50);
  const calculatedLevel = Math.floor(xp / 1000) + 1;
  const displayLevel = calculatedLevel;
  const currentLevelXp = xp % 1000;
  const xpProgress = (currentLevelXp / 1000) * 100;

  const isDriverActive = driver.status === 'active';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 md:p-8 bg-black/40 backdrop-blur-sm">
      <div className="bg-gray-50 dark:bg-[#1A1F26] rounded-none sm:rounded-[32px] sm:border border-gray-200 dark:border-[#2A2F3A]/50 shadow-2xl w-full h-full sm:h-auto sm:max-h-[90vh] max-w-xl overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* iOS Style Nav Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-[#1A1F26] border-b border-gray-100 dark:border-[#2A2F3A] z-10 shrink-0">
           <div className="w-10"></div>
           <h2 className="text-[15px] font-semibold text-gray-900 dark:text-[#fafafa] tracking-tight">Perfil</h2>
           <button onClick={onClose} className="w-10 h-10 flex items-center justify-end text-gray-400 hover:text-gray-900 dark:text-[#fafafa] dark:hover:text-[#f4f4f5] transition-colors">
              <X size={22} className="stroke-[2.5]" />
           </button>
        </div>
        
        <div className="overflow-y-auto flex-1 w-full bg-white dark:bg-[#1A1F26] sm:bg-gray-50 dark:bg-[#1A1F26] scrollbar-hide">
           <div className="p-5 sm:p-8 space-y-8">
              
              {/* Profile Header (Corp Card Style) */}
              <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[16px] sm:rounded-[20px] p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-3 shadow-sm relative z-30 w-full box-border overflow-visible">
                <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto flex-1">
                  <div className="w-12 h-12 bg-slate-900 dark:bg-[#2A2F3A] rounded-xl overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-[#3A3F4A] shadow-sm relative">
                    {driver.avatar || driver.photoURL ? (
                      <img src={driver.avatar || driver.photoURL} alt={driver.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-xl font-bold text-white tracking-tighter">{driver.name.substring(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 w-full">
                      <h2 className="text-[15px] sm:text-[16px] font-bold text-slate-900 dark:text-white leading-tight truncate">{driver.name}</h2>
                      <ShieldCheck size={14} className="text-blue-500 shrink-0" fill="currentColor" />
                    </div>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate">
                      {driver.roles?.includes("admin") ? "Administrador" : "Motorista Parceiro"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center sm:pl-4 sm:border-l border-slate-200 dark:border-[#2A2F3A] shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 mt-2 sm:mt-0 relative z-20">
                  <div className="flex flex-col relative w-full sm:w-[150px]">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1">
                      Simulador
                    </span>
                    <div className="flex items-center justify-between gap-1.5 bg-slate-50 dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] shadow-sm rounded-[10px] px-2.5 py-1.5 w-full cursor-default">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Gamepad2
                          size={14}
                          className="text-slate-500 dark:text-slate-400 shrink-0"
                        />
                        <span className="text-[12px] sm:text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {resolvedCompany?.simulatorName || "Nenhum"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Unified Horizontal Stats Card */}
              <div className="flex items-center justify-between bg-white dark:bg-[#121214] border border-slate-200 dark:border-[#27272A] shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] dark:shadow-none rounded-[16px] p-4 relative overflow-hidden">
                <div className="flex-1 flex flex-col items-center justify-center relative">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Truck size={14} className="text-indigo-500 dark:text-indigo-400" />
                    <span className="text-[11px] sm:text-[12px] font-semibold text-slate-500 dark:text-[#A1A1AA] uppercase tracking-wider">Entregas</span>
                  </div>
                  <span className="text-[24px] sm:text-[28px] font-bold text-slate-900 dark:text-[#FAFAFA] leading-none tracking-tight">{totalDeliveries}</span>
                </div>
                <div className="w-px h-12 bg-slate-200 dark:bg-[#27272A]"></div>
                <div className="flex-1 flex flex-col items-center justify-center relative">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CheckCircle size={14} className="text-emerald-500 dark:text-emerald-400" />
                    <span className="text-[11px] sm:text-[12px] font-semibold text-slate-500 dark:text-[#A1A1AA] uppercase tracking-wider">Concluídos</span>
                  </div>
                  <span className="text-[24px] sm:text-[28px] font-bold text-slate-900 dark:text-[#FAFAFA] leading-none tracking-tight">{pastJobs.length}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                 <button 
                   className="flex items-center justify-center gap-2 py-3 bg-gray-100 dark:bg-[#2A2F3A] hover:bg-gray-200 dark:hover:bg-[#3A3F4A] text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-[13px] transition-colors shadow-sm"
                   onClick={() => setIsInfoOpen(!isInfoOpen)}
                 >
                   <Info size={16} />
                   {isInfoOpen ? "Ocultar Info" : "Ver Informações"}
                 </button>

                 {!activeJob && isDriverActive && (
                   <Button 
                     className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 font-bold text-[14px] shadow-sm tracking-tight transition-all" 
                     onClick={() => { onAssignJob(driver.id); onClose(); }}
                   >
                     Designar Operação
                   </Button>
                 )}
              </div>
              
              {/* Driver Details Info Card */}
              {isInfoOpen && (
                <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[16px] p-4 sm:p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2">
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 flex items-center justify-center shrink-0">
                         <Mail size={16} className="text-blue-600 dark:text-blue-400" />
                       </div>
                       <div className="min-w-0 flex-1">
                         <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Email</p>
                         <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate">{driver.email || 'Não informado'}</p>
                       </div>
                     </div>
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-500/10 dark:border-green-500/20 flex items-center justify-center shrink-0">
                         <Phone size={16} className="text-green-600 dark:text-green-400" />
                       </div>
                       <div className="min-w-0 flex-1">
                         <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">WhatsApp</p>
                         <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate">{driver.whatsapp || 'Não informado'}</p>
                       </div>
                     </div>
                     {resolvedCompany && (
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0">
                           <Building2 size={16} className="text-purple-600 dark:text-purple-400" />
                         </div>
                         <div className="min-w-0 flex-1">
                           <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Empresa Ativa / Vínculo</p>
                           <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                             {resolvedCompany.fleetName || resolvedCompany.companyName || 'Carregando...'}
                           </p>
                         </div>
                       </div>
                     )}
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                         <Gamepad2 size={16} className="text-amber-600 dark:text-amber-400" />
                       </div>
                       <div className="min-w-0 flex-1">
                         <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Simulador</p>
                         <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                           {resolvedCompany?.simulatorName || 'Global Truck'}
                         </p>
                       </div>
                     </div>
                   </div>
                </div>
              )}
              
              {/* Level Progress Section iOS Style */}
              <div className="bg-white dark:bg-[#1A1F26] rounded-2xl p-4 sm:p-5 border border-gray-100 dark:border-[#2A2F3A] shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between mb-3">
                   <div className="flex items-baseline gap-2">
                     <h3 className="text-[14px] font-bold text-gray-900 dark:text-[#fafafa] tracking-tight">Nível {displayLevel}</h3>
                     <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 px-1.5 py-0.5 rounded">{Math.floor(currentLevelXp)} / 1000 XP</span>
                   </div>
                   <span className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa]">{Math.round(xpProgress)}%</span>
                </div>
                <div className="h-2 w-full bg-gray-100 dark:bg-[#27272a] rounded-full overflow-hidden">
                   <div className="h-full bg-[#00D1FF] shadow-[0_0_10px_rgba(0,209,255,0.4)] rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.max(2, xpProgress)}%` }}></div>
                </div>
              </div>
              
              {/* Active Job Section */}
              <div>
                 <h3 className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa] mb-3 px-1">Operação Ativa</h3>
                 {activeJob && activeContract ? (
                   <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-none">
                      <div className="flex justify-between items-start mb-4 gap-3">
                         <div className="min-w-0">
                            <h4 className="font-bold text-[15px] text-gray-900 dark:text-[#fafafa] tracking-tight truncate">{activeContract.name}</h4>
                            <div className="flex items-center flex-wrap gap-2 mt-1.5">
                               {activeVehicle && (
                                 <span className="text-[12px] font-medium text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5"><Car size={13} className="text-gray-400"/> {activeVehicle.name}</span>
                               )}
                               {activeTrailer && (
                                 <>
                                   <span className="text-gray-300">•</span>
                                   <span className="text-[12px] font-medium text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5"><Truck size={13} className="text-gray-400"/> {activeTrailer.name}</span>
                                 </>
                               )}
                            </div>
                         </div>
                         <Button 
                           variant="secondary" 
                           size="sm" 
                           onClick={() => { onViewJob(activeJob.id); onClose(); }} 
                           className="h-8 px-3 bg-gray-50 dark:bg-[#1A1F26] hover:bg-gray-100 dark:hover:bg-[#3f3f46]/50 text-gray-700 dark:text-[#d4d4d8] text-[12px] font-semibold border border-gray-200 dark:border-[#2A2F3A] rounded-lg shrink-0"
                         >
                           Detalhes
                         </Button>
                      </div>
                      
                      <div className="pt-1">
                         <div className="flex justify-between items-baseline mb-1.5">
                            <span className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa]">{activeJob.progress} <span className="text-gray-400 font-medium">/ {activeContract.totalDeliveries} entregas</span></span>
                            <span className="text-[12px] font-semibold text-gray-900 dark:text-[#fafafa]">{activeContract.totalDeliveries > 0 ? Math.round((activeJob.progress/activeContract.totalDeliveries)*100) : 0}%</span>
                         </div>
                         <div className="w-full h-1.5 bg-gray-100 dark:bg-[#27272a] rounded-full overflow-hidden">
                            <div className="h-full bg-[#00D1FF] shadow-[0_0_10px_rgba(0,209,255,0.4)] rounded-full" style={{ width: `${activeContract.totalDeliveries > 0 ? Math.round((activeJob.progress/activeContract.totalDeliveries)*100) : 0}%` }}></div>
                         </div>
                      </div>
                   </div>
                 ) : (
                   <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] border-dashed rounded-2xl p-6 text-center shadow-sm dark:shadow-none">
                      <p className="text-[14px] text-gray-500 dark:text-[#a1a1aa] font-medium">Nenhuma operação em andamento</p>
                   </div>
                 )}
              </div>
              
              {/* Job History */}
              <div className="pb-6">
                 <h3 className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa] mb-3 px-1">Histórico</h3>
                 {pastJobs.length > 0 ? (
                   <div className="space-y-3">
                     {pastJobs.slice().reverse().map(job => {
                        const contract = contracts.find(c => c.id === job.contractId);
                        const jobTrailerId = job.trailerId || contract?.trailerId;
                        const vehicle = vehicles.find(v => v.id === job.vehicleId);
                        const trailer = jobTrailerId ? trailers.find(t => t.id === jobTrailerId) : null;
                        
                        const completedAt = job.completedAt ? new Date(job.completedAt) : new Date();
                        const deadline = new Date(job.deadlineDate);
                        const onTime = completedAt <= deadline;
                        const isExpanded = expandedJobId === job.id;

                        return (
                          <div key={job.id} className={cn("bg-white dark:bg-[#1A1F26] border rounded-2xl transition-all shadow-sm dark:shadow-none overflow-hidden", isExpanded ? "border-gray-300 dark:border-gray-600 ring-1 ring-gray-200 dark:ring-gray-700 block" : "border-gray-100 dark:border-[#2A2F3A] hover:border-gray-200 dark:hover:border-gray-700")}>
                              <button 
                               className="w-full flex items-center justify-between p-4 focus:outline-none" 
                               onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
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
                      <p className="text-[14px] text-gray-500 dark:text-[#a1a1aa] font-medium">Nenhum histórico disponível</p>
                   </div>
                 )}
              </div>
              
           </div>
        </div>
      </div>
    </div>
  );
}