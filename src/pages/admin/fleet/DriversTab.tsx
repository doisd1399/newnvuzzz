import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../context/AppContext';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { CheckCircle, ShieldAlert, Star, UserCircle, Users, Eye, Trash2, Crown, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import DriverProfileModal from './DriverProfileModal';
import { toast } from 'sonner';

import { UserPlus, X, Image as ImageIcon } from 'lucide-react';
import { convertFileToBase64, compressImage } from '../../../lib/utils';

export default function DriversTab() {
  const navigate = useNavigate();
  const { users, jobs, contracts, activeCompanyId, approveDriver, rejectDriver, driverRequests, promoteDriverToAdmin, demoteAdminToDriver, removeDriverFromFleet, currentUser, createManualDriver, allCompanyMembers } = useAppStore();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [driverToRemove, setDriverToRemove] = useState<string | null>(null);
  
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverEmail, setNewDriverEmail] = useState('');
  const [newDriverWhatsapp, setNewDriverWhatsapp] = useState('');
  const [newDriverPhoto, setNewDriverPhoto] = useState<string>('');
  const [addDriverLoading, setAddDriverLoading] = useState(false);
  const [addDriverError, setAddDriverError] = useState('');
  const [addDriverSuccess, setAddDriverSuccess] = useState(false);
  const [processingRoleChangeId, setProcessingRoleChangeId] = useState<string | null>(null);

  const getDriverRoles = (driver: any) => {
    const member = allCompanyMembers.find(m => m.userId === driver.id && m.companyId === activeCompanyId);
    if (member && member.status === 'active') return member.roles;
    if (driver.companyId === activeCompanyId && driver.status === 'active') return driver.roles || [driver.role];
    return [];
  };

  const allEmployees = users.filter(u => getDriverRoles(u).length > 0 || (currentUser?.role === 'admin' && u.id === currentUser?.id));
  const pendingRequests = driverRequests.filter(r => r.empresaId === activeCompanyId && r.status === 'pendente');
  const activeEmployees = allEmployees.filter(u => getDriverRoles(u).some((r: string) => r === 'driver' || r === 'admin'));

  const [filterAvailability, setFilterAvailability] = useState<'all' | 'available'>('all');

  const filteredEmployees = activeEmployees.filter(u => {
     if (filterAvailability === 'available') return u.isOnline;
     return true;
  });

  const sortedEmployees = [...filteredEmployees].map(driver => {
    const allDriverJobs = jobs.filter(j => j.driverId === driver.id && j.status === 'completed');
    const activeJob = jobs.find(j => j.driverId === driver.id && ['pending', 'active', 'delayed'].includes(j.status));
    const totalDeliveries = allDriverJobs.reduce((acc, job) => acc + job.progress, 0) + (activeJob ? activeJob.progress : 0);
    return { ...driver, totalDeliveries, allDriverJobs, activeJob };
  }).sort((a, b) => b.totalDeliveries - a.totalDeliveries);

  const handleAssignJob = (driverId: string) => {
    navigate('/admin/operations', { state: { isAssigning: true, preselectedDriverId: driverId } });
  };

  const handleViewJob = (jobId: string) => {
    navigate('/admin/operations', { state: { preselectedJobId: jobId } });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await convertFileToBase64(file);
        const compressed = await compressImage(base64, 800);
        setNewDriverPhoto(compressed);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAddManualDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddDriverError('');
    setAddDriverSuccess(false);

    if (!newDriverName.trim() || !newDriverEmail.trim()) {
      setAddDriverError('Nome e E-mail são obrigatórios.');
      return;
    }

    setAddDriverLoading(true);
    try {
      await createManualDriver({
        name: newDriverName,
        email: newDriverEmail,
        whatsapp: newDriverWhatsapp,
        photoURL: newDriverPhoto
      });
      setAddDriverSuccess(true);
      setTimeout(() => {
        setShowAddDriverModal(false);
        setNewDriverName('');
        setNewDriverEmail('');
        setNewDriverWhatsapp('');
        setNewDriverPhoto('');
        setAddDriverSuccess(false);
      }, 1500);
    } catch (err: any) {
      setAddDriverError(err.message || 'Erro ao cadastrar motorista manual.');
    } finally {
      setAddDriverLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      
      {/* Pendências Section */}
      {pendingRequests.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-gray-500 dark:text-[#a1a1aa] uppercase tracking-widest mb-4">Aprovações Pendentes</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pendingRequests.map(req => {
              const driver = users.find(u => u.id === req.motoristaId);
              if (!driver) return null;
              return (
              <Card key={req.id} className="rounded-2xl border border-yellow-200 shadow-sm dark:shadow-none relative overflow-hidden bg-yellow-50 dark:bg-amber-500/10 dark:border-amber-500/20/10">
                <CardContent className="p-0">
                   <div className="flex flex-col sm:flex-row">
                     <div className="p-6 flex-1 flex items-start gap-4">
                        {driver?.photoURL || driver?.avatar ? (
                          <img src={driver?.photoURL || driver?.avatar} alt={driver?.name} className="w-14 h-14 rounded-full border-2 border-white shadow-sm dark:shadow-none bg-gray-50 dark:bg-[#1A1F26] object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-14 h-14 rounded-full border-2 border-white shadow-sm dark:shadow-none bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">
                            {driver?.name?.substring(0, 2).toUpperCase() || 'M'}
                          </div>
                        )}
                        <div>
                           <h3 className="text-lg font-semibold text-gray-900 dark:text-[#fafafa] flex items-center gap-2">
                             {driver?.name || 'Motorista'}
                             <ShieldAlert size={16} className="text-yellow-500" />
                           </h3>
                           <p className="text-sm text-gray-500 dark:text-[#a1a1aa] flex flex-wrap gap-x-3 gap-y-1">
                             <span>{driver?.email || ''}</span>
                             {driver?.whatsapp && <span className="flex items-center gap-1"><span className="w-1 h-1 bg-gray-300 dark:bg-[#52525b] rounded-full"></span>{driver.whatsapp}</span>}
                           </p>
                           
                             <div className="mt-2 inline-block bg-yellow-100 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-400 text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">
                              Aguardando
                           </div>
                        </div>
                     </div>

                     <div className="bg-white dark:bg-[#1A1F26] p-6 flex flex-col justify-center sm:border-l border-yellow-100 dark:border-yellow-500/20 sm:w-40 shrink-0 border-t sm:border-t-0 gap-3">
                         <Button 
                           onClick={() => approveDriver(req.id)}
                           className="w-full bg-green-500 hover:bg-green-600 text-white shadow-sm dark:shadow-none"
                         >
                           Aprovar
                         </Button>
                         <Button 
                           onClick={() => {
                             if (true) {
                               rejectDriver(req.id);
                             }
                           }}
                           variant="outline"
                           className="w-full text-red-600 bg-white dark:bg-[#1A1F26] hover:bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 border-gray-200 dark:border-[#2A2F3A]"
                         >
                           Recusar
                         </Button>
                         <Button 
                           onClick={() => setSelectedDriverId(driver.id)}
                           variant="ghost"
                           className="w-full text-gray-700 dark:text-[#d4d4d8] bg-white dark:bg-[#1A1F26] hover:bg-gray-50 dark:hover:bg-[#3f3f46] border-gray-200 dark:border-[#2A2F3A] text-sm h-8"
                         >
                           Ver Perfil
                         </Button>
                     </div>
                   </div>
                </CardContent>
              </Card>
            )})}
          </div>
        </section>
      )}

      {/* Lista de Motoristas Ativos */}
      <section>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h2 className="text-sm font-bold text-gray-500 dark:text-[#a1a1aa] uppercase tracking-widest flex items-center gap-2">
            Motoristas Ativos
          </h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
             <div className="flex bg-gray-100 dark:bg-[#18181b] p-1 rounded-lg mr-auto sm:mr-0">
               <button 
                  onClick={() => setFilterAvailability('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${filterAvailability === 'all' ? 'bg-white dark:bg-[#1A1F26] text-gray-900 dark:text-[#fafafa] shadow-sm dark:shadow-none' : 'text-gray-500 dark:text-[#a1a1aa] hover:text-gray-700 dark:hover:text-[#d4d4d8]'}`}
               >
                  Todos
               </button>
               <button 
                  onClick={() => setFilterAvailability('available')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${filterAvailability === 'available' ? 'bg-white dark:bg-[#1A1F26] text-green-700 shadow-sm dark:shadow-none' : 'text-gray-500 dark:text-[#a1a1aa] hover:text-gray-700 dark:hover:text-[#d4d4d8]'}`}
               >
                  Disponíveis
               </button>
             </div>
             
             <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                onClick={() => setShowAddDriverModal(true)}
             >
                <UserPlus size={16} />
                <span className="hidden sm:inline">Cadastrar Motorista</span>
             </Button>
          </div>
        </div>
        
        {filteredEmployees.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#1A1F26] rounded-2xl border border-gray-200 dark:border-[#2A2F3A] border-dashed">
            <div className="mx-auto w-16 h-16 bg-gray-50 dark:bg-[#1A1F26] rounded-full flex items-center justify-center text-gray-400 mb-4">
              <Users size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-[#fafafa]">Nenhum motorista {filterAvailability === 'available' ? 'disponível' : 'ativo'}</h3>
            <p className="text-gray-500 dark:text-[#a1a1aa] mt-1 max-w-sm mx-auto">Motoristas aprovados aparecerão nesta lista.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6 max-w-[880px] mx-auto w-full justify-center">
            {sortedEmployees.map(driver => {
              const { allDriverJobs, activeJob, totalDeliveries } = driver;
              
              const xp = totalDeliveries * 150 + (allDriverJobs.length * 50);
              const calculatedLevel = Math.floor(xp / 1000) + 1;
              const displayLevel = driver.level || calculatedLevel;
              const currentLevelXp = xp % 1000;
              const xpProgress = (currentLevelXp / 1000) * 100;
            
              return (
              <Card key={driver.id} className="rounded-[16px] border border-gray-200/80 dark:border-[#2A2F3A] shadow-sm hover:shadow-md dark:shadow-none relative bg-white dark:bg-[#1A1F26] group transition-all duration-200 overflow-hidden flex flex-col h-full w-full">
                <CardContent className="p-5 flex flex-col h-full flex-1">
                  {/* Header */}
                  <div className="flex items-center gap-3.5 mb-5 w-full">
                     <div className="relative shrink-0">
                       {driver.photoURL || driver.avatar ? (
                         <img src={driver.photoURL || driver.avatar} alt={driver.name} className="w-12 h-12 rounded-full border-2 border-white dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#1A1F26] object-cover shadow-sm" referrerPolicy="no-referrer" />
                       ) : (
                         <div className="w-12 h-12 rounded-full border-2 border-white dark:border-[#2A2F3A] bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg shadow-sm">
                           {driver.name.substring(0, 2).toUpperCase()}
                         </div>
                       )}
                     </div>
                     <div className="flex-1 min-w-0 pr-2">
                       <h3 className="font-bold text-gray-900 dark:text-[#fafafa] leading-tight flex items-center gap-1.5 text-[15px] truncate">
                         <span className="truncate">{driver.name}</span>
                         <CheckCircle size={14} className="text-green-500 shrink-0" />
                       </h3>
                       <div className="flex flex-wrap gap-1.5 mt-1.5">
                         {getDriverRoles(driver).includes('admin') && <span className="bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">Admin</span>}
                         {getDriverRoles(driver).includes('driver') && <span className="bg-green-100 text-green-800 dark:text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">Motorista</span>}
                       </div>
                     </div>
                     
                     <div className="shrink-0 flex items-center h-full self-start">
                         <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-[#27272a] border border-gray-200 dark:border-[#2A2F3A] rounded-lg px-2 py-1.5 cursor-default mt-1" title={driver.isOnline ? "Online" : "Offline"}>
                            <span className={cn("text-[10px] font-bold tracking-tight uppercase", driver.isOnline ? "text-green-600" : "text-gray-500 dark:text-[#a1a1aa]")}>
                               {driver.isOnline ? 'On' : 'Off'}
                            </span>
                            <div className="relative inline-flex items-center shrink-0">
                               <div className={cn("w-6 h-3.5 rounded-full shadow-inner dark:shadow-none relative transition-colors", driver.isOnline ? "bg-[#32D74B]" : "bg-gray-200 dark:bg-[#18181b]")}>
                                 <div className={cn("absolute top-[2px] transition-all bg-white dark:bg-gray-300 border border-gray-100 dark:border-transparent rounded-full h-2.5 w-2.5 shadow-sm", driver.isOnline ? "left-[12px] border-white" : "left-[2px]")}></div>
                               </div>
                            </div>
                         </div>
                     </div>
                  </div>
                  
                  {/* Level Progress */}
                  <div className="mb-5 px-1">
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa]">Nível {displayLevel}</span>
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-[#a1a1aa]">{Math.floor(currentLevelXp)} / 1000 XP</span>
                     </div>
                     <div className="h-2 w-full bg-gray-100 dark:bg-[#27272a] rounded-full overflow-hidden">
                        <div className="h-full bg-[#00D1FF] shadow-[0_0_10px_rgba(0,209,255,0.4)] rounded-full transition-all duration-300" style={{ width: `${Math.max(2, xpProgress)}%` }}></div>
                     </div>
                  </div>
                  
                  {/* Stats */}
                  <div className="flex gap-3 mb-6">
                     <div className="flex flex-col flex-1 items-center justify-center bg-gray-50 dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-xl px-2 py-3.5">
                       <span className="text-xl font-bold text-gray-900 dark:text-[#fafafa] leading-none mb-1.5">{totalDeliveries}</span>
                       <span className="text-[10px] text-gray-500 dark:text-[#a1a1aa] font-bold tracking-wider uppercase">Entregas</span>
                     </div>
                     <div className="flex flex-col flex-1 items-center justify-center bg-gray-50 dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-xl px-2 py-3.5">
                       <span className="text-xl font-bold text-gray-900 dark:text-[#fafafa] leading-none mb-1.5">{allDriverJobs.length}</span>
                       <span className="text-[10px] text-gray-500 dark:text-[#a1a1aa] font-bold tracking-wider uppercase">Concluídos</span>
                     </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="pt-4 mt-auto border-t border-gray-100 dark:border-[#2A2F3A] flex items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedDriverId(driver.id)}
                      className="gap-2 text-gray-700 dark:text-[#d4d4d8] hover:text-gray-900 dark:hover:text-[#f4f4f5] border-gray-200 dark:border-[#2A2F3A] hover:bg-gray-50 dark:hover:bg-[#3f3f46] h-10 text-[13px] font-semibold px-4 bg-white dark:bg-[#1A1F26] shadow-sm dark:shadow-none flex-1 rounded-xl transition-colors"
                    >
                      <Eye size={16} /> Ver perfil
                    </Button>
                    <div className="flex items-center gap-2 shrink-0">
                       {getDriverRoles(currentUser).includes('admin') && (
                         <>
                           <button
                             title={getDriverRoles(driver).includes('admin') ? "Remover privilégio de administrador" : "Promover a administrador"}
                             disabled={processingRoleChangeId === driver.id}
                             onClick={async () => {
                               if (processingRoleChangeId) return;
                               if (getDriverRoles(driver).includes('admin')) {
                                   if (driver.id !== currentUser?.id) {
                                       setProcessingRoleChangeId(driver.id);
                                       try {
                                         await demoteAdminToDriver(driver.id);
                                         toast.success("Privilégios de administrador removidos com sucesso.");
                                       } catch (e: any) {
                                         toast.error("Erro ao remover privilégios: " + e.message);
                                       } finally {
                                         setProcessingRoleChangeId(null);
                                       }
                                   } else {
                                       toast.error("Você não pode remover seus próprios privilégios por aqui.");
                                   }
                               } else {
                                   setProcessingRoleChangeId(driver.id);
                                   try {
                                     await promoteDriverToAdmin(driver.id);
                                     toast.success("Promovido a administrador com sucesso.");
                                   } catch (e: any) {
                                     toast.error("Erro ao promover: " + e.message);
                                   } finally {
                                     setProcessingRoleChangeId(null);
                                   }
                               }
                             }}
                             className={`p-2 rounded-xl transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-10 h-10 ${
                                getDriverRoles(driver).includes('admin') 
                                ? 'text-blue-600 hover:bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20' 
                                : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 bg-gray-50 dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A]'
                             }`}
                           >
                             {processingRoleChangeId === driver.id ? <Loader2 size={16} className="animate-spin" /> : <Crown size={16} />}
                           </button>
                           
                           {driver.id !== currentUser.id && (
                             <button
                               title="Remover da frota"
                               onClick={() => setDriverToRemove(driver.id)}
                               className="p-2 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20/50 transition-colors flex items-center justify-center cursor-pointer ml-1 w-10 h-10 border border-red-100 dark:border-red-500/20"
                             >
                               <Trash2 size={16} />
                             </button>
                           )}
                         </>
                       )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )})}
          </div>
        )}
      </section>

      {selectedDriverId && (
        <DriverProfileModal
          driverId={selectedDriverId}
          onClose={() => setSelectedDriverId(null)}
          onAssignJob={handleAssignJob}
          onViewJob={handleViewJob}
        />
      )}

      {driverToRemove && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 min-h-[100dvh]">
          <div className="bg-white dark:bg-[#1A1F26] rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-[#fafafa] mb-2">Remover da frota</h3>
              <p className="text-gray-600 dark:text-[#d4d4d8] text-sm">
                Tem certeza que deseja remover este motorista da frota? Esta ação não pode ser desfeita e ele não terá mais acesso aos trabalhos.
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-[#1A1F26] px-6 py-4 flex gap-3 justify-end items-center border-t border-gray-100 dark:border-[#2A2F3A]">
              <Button variant="outline" onClick={() => setDriverToRemove(null)}>
                Cancelar
              </Button>
              <Button 
                className="bg-red-600 hover:bg-red-700 text-white" 
                onClick={() => {
                  removeDriverFromFleet(driverToRemove);
                  setDriverToRemove(null);
                }}
              >
                Remover
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Registration Modal */}
      {showAddDriverModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1A1F26] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-[#2A2F3A] flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-[#fafafa]">Novo Motorista</h2>
              <button onClick={() => setShowAddDriverModal(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#18181b] text-gray-500 dark:text-[#a1a1aa] flex items-center justify-center hover:bg-gray-200 dark:bg-white/10 transition-colors shrink-0">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleAddManualDriver} className="flex flex-col">
              <div className="p-6 overflow-y-auto max-h-[70vh] space-y-4">
                {addDriverSuccess && (
                  <div className="p-4 bg-green-50 dark:bg-green-500/10 dark:border-green-500/20 text-green-700 dark:text-green-400 rounded-lg text-sm mb-4 font-medium flex items-center gap-2">
                    <CheckCircle size={16} /> Motorista cadastrado com sucesso!
                  </div>
                )}
                {addDriverError && (
                  <div className="p-4 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-sm mb-4 font-medium">
                    {addDriverError}
                  </div>
                )}

                <div className="flex flex-col items-center mb-6">
                  <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-[#18181b] border-2 border-dashed border-gray-300 dark:border-[#52525b] flex items-center justify-center overflow-hidden relative group">
                    {newDriverPhoto ? (
                      <img src={newDriverPhoto} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <ImageIcon className="text-gray-400" size={32} />
                    )}
                    <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-xs font-semibold">
                      Alterar
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={addDriverLoading} />
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-[#a1a1aa] mt-2 font-medium">Foto de perfil (opcional)</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-[#d4d4d8] uppercase tracking-wide mb-1">Nome Completo</label>
                    <input 
                      type="text" 
                      required 
                      disabled={addDriverLoading}
                      value={newDriverName} 
                      onChange={e => setNewDriverName(e.target.value)} 
                      className="w-full p-2.5 border border-gray-300 dark:border-[#52525b] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50" 
                      placeholder="Ex: João da Silva" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-[#d4d4d8] uppercase tracking-wide mb-1">E-mail (Conta Google)</label>
                    <input 
                      type="email" 
                      required 
                      disabled={addDriverLoading}
                      value={newDriverEmail} 
                      onChange={e => setNewDriverEmail(e.target.value)} 
                      className="w-full p-2.5 border border-gray-300 dark:border-[#52525b] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50" 
                      placeholder="joao@gmail.com" 
                    />
                    <p className="text-[11px] text-gray-500 dark:text-[#a1a1aa] mt-1 font-medium">O motorista deverá logar usando "Login com Google" com este e-mail.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-[#d4d4d8] uppercase tracking-wide mb-1">WhatsApp (Opcional)</label>
                    <input 
                      type="tel" 
                      disabled={addDriverLoading}
                      value={newDriverWhatsapp} 
                      onChange={e => setNewDriverWhatsapp(e.target.value)} 
                      className="w-full p-2.5 border border-gray-300 dark:border-[#52525b] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50" 
                      placeholder="(DD) 99999-9999" 
                    />
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-gray-100 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#1A1F26] mt-auto flex justify-end gap-3">
                <Button type="button" variant="outline" className="px-6" disabled={addDriverLoading} onClick={() => setShowAddDriverModal(false)}>Cancelar</Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 shadow-sm dark:shadow-none" disabled={addDriverLoading}>
                  {addDriverLoading ? 'Salvando...' : 'Cadastrar Motorista'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
