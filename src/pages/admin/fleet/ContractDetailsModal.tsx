import React, { useState } from 'react';
import { useAppStore } from '../../../context/AppContext';
import { Button } from '../../../components/ui/Button';
import { X, MapPin, Truck, Calendar, Users, ListTodo, FileText, CheckCircle2, AlertTriangle, PlayCircle, Clock, ChevronDown, ChevronUp, User, Rocket, Pencil, Trash2, MoreVertical } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { cn } from '../../../lib/utils';

import { useNavigate } from 'react-router-dom';
import DriverProfileModal from './DriverProfileModal';

interface Props {
  contractId: string;
  onClose: () => void;
  onEdit: (id: string) => void;
}

export default function ContractDetailsModal({ contractId, onClose, onEdit }: Props) {
  const { contracts, trailers, jobs, users, vehicles, companies, updateContract, deleteContract, cancelJob } = useAppStore();
  const navigate = useNavigate();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [viewingDriverId, setViewingDriverId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const contract = contracts.find(c => c.id === contractId);
  const companyProfile = companies.find(c => c.id === contract?.companyId);
  if (!contract) return null;

  const trailer = contract.trailerId ? trailers.find(t => t.id === contract.trailerId) : null;
  const contractJobs = jobs.filter(j => j.contractId === contractId).sort((a, b) => {
    // Sort active first, then pending, then completed/cancelled
    const statusOrder: Record<string, number> = { active: 1, pending: 2, completed: 3, cancelled: 4 };
    return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
  });
  
  const inProgressCount = contractJobs.filter(j => ['pending', 'active', 'delayed'].includes(j.status)).length;
  const completedCount = contractJobs.filter(j => j.status === 'completed').length;
  const assignedCount = contractJobs.length;

  const handleAssign = () => {
    onClose();
    navigate('/admin/operations', { state: { isAssigning: true, preselectedContractId: contractId } });
  };

  const getJobStatusDetails = (job: any) => {
    if (job.status === 'completed') return { text: 'Concluído', color: 'bg-green-500', bg: 'bg-green-100 dark:bg-green-500/20', icon: CheckCircle2 };
    if (job.status === 'cancelled') return { text: 'Cancelado', color: 'bg-rose-500', bg: 'bg-red-100 dark:bg-red-500/20', icon: X };
    
    const daysLeft = differenceInDays(new Date(job.deadlineDate), new Date());
    
    if (daysLeft < 0) return { text: 'Atrasado', color: 'bg-rose-500', bg: 'bg-red-100 dark:bg-red-500/20', icon: AlertTriangle };
    if (daysLeft <= 2) return { text: 'Atenção', color: 'bg-amber-50 dark:bg-amber-500/100', bg: 'bg-amber-100 dark:bg-amber-500/20', icon: AlertTriangle };
    if (job.status === 'active') return { text: 'Em Andamento', color: 'bg-blue-50 dark:bg-blue-500/100', bg: 'bg-blue-100 dark:bg-blue-500/20', icon: PlayCircle };
    
    return { text: 'Não Iniciado', color: 'bg-gray-400', bg: 'bg-gray-100 dark:bg-[#18181b]', icon: Clock };
  };

  const handleDelete = () => {
    {
      deleteContract(contractId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-gray-900/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1A1F26] rounded-[24px] shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
        <div className="absolute top-5 right-5 z-20">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-[#d4d4d8] dark:hover:text-[#d4d4d8] bg-gray-100 dark:bg-[#18181b] hover:bg-gray-200 dark:bg-white/10 rounded-full p-1.5 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="overflow-y-auto p-0 flex-1 hide-scrollbar">
          {/* Header Section */}
          <div className="px-6 py-6 pr-14 border-b border-gray-100 dark:border-[#2A2F3A] relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                   <span className="px-2 py-0.5 bg-gray-100 dark:bg-[#18181b] text-gray-600 dark:text-[#d4d4d8] rounded text-[10px] uppercase font-bold tracking-wider shrink-0 flex items-center gap-1.5">
                      <Rocket size={12} className="text-gray-400" />
                      {contract.simulator}
                   </span>
                   {companyProfile && (
                     <span className="px-2 py-0.5 bg-gray-100 dark:bg-[#18181b] text-gray-600 dark:text-[#d4d4d8] rounded text-[10px] uppercase font-bold tracking-wider shrink-0 flex items-center gap-1.5">
                       <Truck size={12} className="text-gray-400" />
                       Frota: {companyProfile.fleetName}
                     </span>
                   )}
                </div>
                
                <div className="flex flex-wrap items-baseline gap-2.5 mb-2">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-[#fafafa] leading-tight">{contract.name}</h2>
                  <span className="text-[12px] font-medium text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1 mt-1 sm:mt-0">
                    <Truck size={12} className="text-gray-400" />
                    {trailer ? trailer.name : 'Qualquer Reboque'}
                  </span>
                </div>
                
                <div className="flex flex-wrap items-center gap-3 text-[12px] font-medium text-gray-600 dark:text-[#d4d4d8]">
                   <div className="flex items-center gap-1.5">
                      <ListTodo size={14} className="text-gray-400" />
                      <span>{contract.totalDeliveries} entregas</span>
                   </div>
                   <span className="text-gray-300">•</span>
                   <div className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-gray-400" />
                      <span>{contract.deadlineDays} dias</span>
                   </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 shrink-0 md:self-start">
                <Button onClick={handleAssign} className="hidden sm:inline-flex bg-gray-900 hover:bg-gray-800 text-white h-9 px-4 text-[13px] font-semibold rounded-xl shadow-sm dark:shadow-none">
                   Designar Trabalho
                </Button>
                <Button onClick={handleAssign} className="sm:hidden bg-gray-900 hover:bg-gray-800 text-white h-9 px-4 text-[13px] font-semibold rounded-xl shadow-sm dark:shadow-none">
                   Designar
                </Button>
                
                <div className="relative">
                   <button 
                     onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }} 
                     className="flex items-center justify-center w-9 h-9 text-gray-600 dark:text-[#d4d4d8] bg-white dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A] hover:bg-gray-50 dark:hover:bg-[#3f3f46] rounded-xl shadow-sm dark:shadow-none transition-colors"
                   >
                      <MoreVertical size={16} />
                   </button>

                   {showDropdown && (
                     <>
                        <div className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent backdrop-blur-[1px] sm:backdrop-blur-none transition-opacity" onClick={() => setShowDropdown(false)}></div>
                        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] max-w-[300px] sm:absolute sm:right-0 sm:left-auto sm:top-11 sm:-translate-x-0 sm:-translate-y-0 sm:w-48 bg-white dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A] sm:shadow-xl shadow-2xl rounded-2xl sm:rounded-xl z-50 py-2 sm:py-0 overflow-hidden sm:origin-top-right animate-in fade-in zoom-in-95 duration-200 sm:duration-100">
                           <button 
                              onClick={() => { setShowDropdown(false); onClose(); onEdit(contractId); }} 
                              className="w-full flex items-center gap-3 sm:gap-2 px-5 py-3.5 sm:px-4 sm:py-2.5 text-left text-[15px] sm:text-[13px] font-medium text-gray-700 dark:text-[#d4d4d8] hover:bg-gray-50 dark:bg-[#1A1F26] dark:hover:bg-[#3f3f46] transition-colors"
                           >
                              <Pencil size={14} className="text-gray-400" />
                              Editar Contrato
                           </button>
                           <div className="h-px w-full bg-gray-100 dark:bg-[#18181b]"></div>
                           <button 
                              onClick={() => { setShowDropdown(false); handleDelete(); }} 
                              className="w-full flex items-center gap-3 sm:gap-2 px-5 py-3.5 sm:px-4 sm:py-2.5 text-left text-[15px] sm:text-[13px] font-medium text-red-600 hover:bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 transition-colors"
                           >
                              <Trash2 size={14} className="text-red-500" />
                              Excluir Contrato
                           </button>
                        </div>
                     </>
                   )}
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 space-y-8">
            {/* Rotas */}
            {contract.mode === 'detailed' && contract.deliveries && contract.deliveries.length > 0 && (
              <section>
                <h3 className="text-[14px] font-bold text-gray-900 dark:text-[#fafafa] mb-3 ml-1">Rotas Planejadas</h3>
                <div className="bg-gray-50 dark:bg-[#1A1F26] rounded-2xl border border-gray-100 dark:border-[#2A2F3A] p-2 space-y-1.5">
                  {contract.deliveries.map((del, i) => (
                    <div key={del.id} className="bg-white dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A]/60 rounded-xl p-3 flex items-center gap-3 sm:gap-4 shadow-sm dark:shadow-none hover:shadow-md dark:shadow-none transition-shadow dark:shadow-none">
                      <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-[#18181b] text-gray-500 dark:text-[#a1a1aa] flex items-center justify-center font-bold text-[11px] shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 flex flex-col sm:flex-row sm:items-center text-[13px] gap-1 sm:gap-3">
                        <span className="font-semibold text-gray-900 dark:text-[#fafafa]">{del.origin}</span>
                        <span className="text-gray-400 hidden sm:inline">→</span>
                        <span className="font-semibold text-gray-900 dark:text-[#fafafa]">{del.destination}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Motoristas em Operação */}
            {contractJobs.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                   <h3 className="text-[14px] font-bold text-gray-900 dark:text-[#fafafa]">Motoristas em Operação</h3>
                   <span className="text-[10px] font-bold text-gray-500 dark:text-[#a1a1aa] bg-gray-100 dark:bg-[#18181b] px-2 py-0.5 rounded-full">{contractJobs.length}</span>
                </div>
                
                <div className="flex flex-col gap-3">
                  {contractJobs.map(job => {
                    const driver = users.find(u => u.id === job.driverId);
                    const statusDetails = getJobStatusDetails(job);
                    const progressPct = Math.round((job.progress / Math.max(1, contract.totalDeliveries)) * 100);
                    const deliveriesLeft = contract.totalDeliveries - job.progress;
                    const effectiveTrailerId = job.trailerId || contract.trailerId;
                    const currentTrailer = trailers.find(t => t.id === effectiveTrailerId);

                    const isExpanded = expandedJobId === job.id;
                    const isOverdue = differenceInDays(new Date(job.deadlineDate), new Date()) < 0;

                    return (
                      <div key={job.id} className={cn("relative flex flex-col border rounded-[24px] transition-all overflow-hidden bg-white dark:bg-[#1A1F26]", isExpanded ? "border-blue-500 shadow-md dark:shadow-none ring-1 ring-blue-500/20" : "border-slate-100 shadow-sm dark:shadow-none hover:border-slate-200 hover:shadow-md dark:shadow-none")}>
                        <button onClick={() => setExpandedJobId(isExpanded ? null : job.id)} className="w-full text-left p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
                          <div className="flex-1 min-w-0">
                             <h3 className="font-semibold text-gray-900 dark:text-[#fafafa] text-[18px] sm:text-[19px] truncate tracking-tight">{driver?.name || 'Desconhecido'}</h3>
                             <div className="flex items-center gap-2 text-[14px] text-gray-500 dark:text-[#a1a1aa] whitespace-nowrap overflow-x-auto scrollbar-hide mt-1.5 mb-2 sm:mb-0">
                               <span className="font-medium text-gray-600 dark:text-[#d4d4d8]">{contract.name}</span>
                               <span className="text-gray-300 shrink-0">•</span>
                               <span className="flex items-center gap-1.5"><Truck size={15} className="shrink-0"/>{currentTrailer?.name || 'S/ Reboque'}</span>
                             </div>
                          </div>
                          
                          <div className="w-full sm:w-[320px] shrink-0 border border-slate-100 dark:border-[#2A2F3A]/50 bg-[#f8fafc] rounded-2xl p-4 flex flex-col gap-3 mt-1 sm:mt-0">
                            <div className="flex justify-between items-start">
                              <div className="flex flex-col items-start leading-tight">
                                <span className="text-[15px] text-blue-600 dark:text-blue-400 font-medium tracking-tight mb-0.5">{job.progress}/{contract.totalDeliveries}</span>
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

                          <div className="shrink-0 text-gray-400 absolute sm:static right-4 top-5">
                            {isExpanded ? <ChevronUp size={22} strokeWidth={2} /> : <ChevronDown size={22} strokeWidth={2} />}
                          </div>
                        </button>
                        
                        {isExpanded && (
                          <div className="border-t border-gray-100 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#1A1F26] p-3 sm:p-4 flex flex-col justify-between flex-1">
                             <div className="grid grid-cols-2 gap-3 text-[12px] mb-4">
                                <div className="min-w-0">
                                   <span className="block text-[10px] font-bold text-gray-500 dark:text-[#a1a1aa] uppercase tracking-widest mb-1">Prazo</span>
                                   <span className={cn("font-medium flex items-center gap-1.5", isOverdue && job.status === 'active' ? "text-red-600 font-bold" : "text-gray-900 dark:text-[#fafafa]")}>
                                      <Clock size={12} className={cn(isOverdue && job.status === 'active' ? "text-red-500" : "text-gray-400")} /> 
                                      {format(new Date(job.deadlineDate), "dd/MM/yyyy")}
                                   </span>
                                </div>
                                <div className="min-w-0">
                                   <span className="block text-[10px] font-bold text-gray-500 dark:text-[#a1a1aa] uppercase tracking-widest mb-1">Veículo</span>
                                   <span className="font-medium text-gray-900 dark:text-[#fafafa] truncate block">{vehicles.find(v => v.id === job.vehicleId)?.name || 'Nenhum'}</span>
                                </div>
                             </div>
                             
                             <div className="flex flex-col sm:flex-row items-center gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-[#2A2F3A]">
                                <Button 
                                  onClick={(e) => { 
                                     e.stopPropagation(); 
                                     if (job.driverId) {
                                       setViewingDriverId(job.driverId);
                                     }
                                  }}
                                  className="w-full sm:flex-1 h-8 text-[11px] font-semibold text-gray-700 dark:text-[#d4d4d8] bg-white dark:bg-[#1A1F26] hover:bg-gray-50 dark:hover:bg-[#3f3f46] border border-gray-200 dark:border-[#2A2F3A] shadow-none border-gray-300 dark:border-[#52525b]" 
                                >
                                  <User size={12} className="mr-1.5" /> Perfil
                                </Button>
                               
                               {job.status !== 'completed' && job.status !== 'cancelled' && (
                                 <Button 
                                   className="w-full sm:flex-1 h-8 px-4 text-[11px] font-semibold text-red-600 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 hover:bg-red-100 dark:bg-red-500/20 border-none shadow-none"
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      {
                                         cancelJob(job.id);
                                         setExpandedJobId(null);
                                      }
                                   }}
                                 >
                                    Cancelar
                                 </Button>
                               )}
                             </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

          </div>
        </div>
      
      {viewingDriverId && (
        <DriverProfileModal
          driverId={viewingDriverId}
          onClose={() => setViewingDriverId(null)}
          onAssignJob={() => { setViewingDriverId(null); onClose(); navigate('/admin/operations', { state: { isAssigning: true, preselectedDriverId: viewingDriverId } }); }}
          onViewJob={(jobId) => {}}
        />
      )}
</div>
    </div>
  );
}

