import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../context/AppContext';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { FileText, Plus, X, MapPin, Trash2, Pencil, Search, MoreVertical, PlayCircle, Edit2, Trash, Truck, Filter } from 'lucide-react';
import ContractDetailsModal from './ContractDetailsModal';

interface ContractsTabProps {
  editContractId?: string | null;
  onEditComplete?: () => void;
}

export default function ContractsTab({ editContractId, onEditComplete }: ContractsTabProps = {}) {
  const { contracts, createContract, updateContract, deleteContract, trailers, companies, activeCompanyId } = useAppStore();
  const activeCompany = companies.find(c => c.id === activeCompanyId);
  const navigate = useNavigate();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [trailerFilter, setTrailerFilter] = useState('all');
  const [viewingContractId, setViewingContractId] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  
  const [successMsg, setSuccessMsg] = useState('');
  
  // Form state
  const [name, setName] = useState('');
  const [simulator, setSimulator] = useState('Euro Truck Simulator 2');
  const [trailerId, setTrailerId] = useState('');
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [mode, setMode] = useState<'simple' | 'detailed'>('simple');
  const [totalDeliveries, setTotalDeliveries] = useState(1);
  
  // Detailed mode state
  const [deliveries, setDeliveries] = useState<{origin: string, destination: string}[]>([{origin: '', destination: ''}]);

  const handleAddDelivery = () => {
    setDeliveries(prev => [...prev, { origin: '', destination: '' }]);
  };

  const handleUpdateDelivery = (index: number, field: 'origin' | 'destination', value: string) => {
    const updated = [...deliveries];
    updated[index][field] = value;
    setDeliveries(updated);
  };

  const handleRemoveDelivery = (index: number) => {
    setDeliveries(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    const actualTotal = mode === 'detailed' ? deliveries.filter(d => d.origin && d.destination).length : totalDeliveries;
    if (actualTotal === 0) return;

    if (editingId) {
      const updates = {
        name,
        simulator,
        trailerId: trailerId || undefined,
        deadlineDays,
        mode,
        totalDeliveries: actualTotal,
        ...(mode === 'detailed' ? { 
          deliveries: deliveries
            .filter(d => d.origin && d.destination)
            .map((d, i) => ({ id: `d${Date.now()}${i}`, origin: d.origin, destination: d.destination })) 
        } : { deliveries: undefined })
      };
      await updateContract(editingId, updates);
      console.log("[Admin] Contrato atualizado:", { editingId, updates });
      setSuccessMsg('Contrato salvo com sucesso!');
    } else {
      const payload = {
        companyId: activeCompanyId!,
        name,
        simulator,
        trailerId: trailerId || undefined,
        deadlineDays,
        mode,
        totalDeliveries: actualTotal,
        ...(mode === 'detailed' ? { 
          deliveries: deliveries
            .filter(d => d.origin && d.destination)
            .map((d, i) => ({ id: `d${Date.now()}${i}`, origin: d.origin, destination: d.destination })) 
        } : {})
      };
      await createContract(payload);
      console.log("[Admin] Contrato criado:", payload);
      setSuccessMsg('Contrato criado com sucesso!');
    }
    
    setTimeout(() => setSuccessMsg(''), 3000);
    cancelAdding();
  };

  const handleEdit = (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return;

    setEditingId(contract.id);
    setName(contract.name);
    setSimulator(contract.simulator);
    setTrailerId(contract.trailerId || '');
    setDeadlineDays(contract.deadlineDays);
    setMode(contract.mode);
    setTotalDeliveries(contract.totalDeliveries);
    if (contract.deliveries && contract.deliveries.length > 0) {
      setDeliveries(contract.deliveries.map(d => ({ origin: d.origin, destination: d.destination })));
    } else {
      setDeliveries([{ origin: '', destination: '' }]);
    }
    setIsAdding(true);
  };

  const cancelAdding = () => {
    setIsAdding(false);
    setEditingId(null);
    setName('');
    setTrailerId('');
    setDeadlineDays(7);
    setMode('simple');
    setTotalDeliveries(1);
    setDeliveries([{origin: '', destination: ''}]);
  };

  React.useEffect(() => {
    if (editContractId && contracts.length > 0) {
      handleEdit(editContractId);
      if (onEditComplete) onEditComplete();
    }
  }, [editContractId, contracts]);

  const filteredContracts = contracts.filter(c => {
    const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.simulator.toLowerCase().includes(search.toLowerCase());
    const matchesTrailer = trailerFilter === 'all' || 
                           (trailerFilter === 'none' && !c.trailerId) || 
                           c.trailerId === trailerFilter;
    
    return matchesSearch && matchesTrailer;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="bg-green-50 dark:bg-green-500/10 dark:border-green-500/20 border border-green-200 text-green-800 dark:text-green-400 rounded-xl p-4 flex justify-between items-center shadow-sm dark:shadow-none">
          <span className="font-medium text-sm">{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-green-600 hover:text-green-800 dark:text-green-400">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 flex-1">
          <div className="relative flex-1 max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Search size={16} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-9 pr-3 h-9 border border-gray-200 dark:border-[#2A2F3A] rounded-lg leading-5 bg-white dark:bg-[#1A1F26] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[13px] transition-colors"
              placeholder="Buscar contrato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative min-w-[180px]">
             <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
               <Filter size={14} className="text-gray-400" />
             </div>
             <select
               className="block w-full pl-8 pr-8 h-9 border border-gray-200 dark:border-[#2A2F3A] rounded-lg bg-white dark:bg-[#1A1F26] text-gray-700 dark:text-[#d4d4d8] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[13px] transition-colors appearance-none"
               value={trailerFilter}
               onChange={e => setTrailerFilter(e.target.value)}
             >
               <option value="all">Todos os reboques</option>
               <option value="none">Qualquer reboque</option>
               {trailers.map(t => (
                 <option key={t.id} value={t.id}>{t.name}</option>
               ))}
             </select>
             <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-gray-400">
               <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
             </div>
          </div>
        </div>
        <Button onClick={() => { 
          cancelAdding(); 
          if (activeCompany && activeCompany.simulatorName) {
            setSimulator(activeCompany.simulatorName);
          }
          setIsAdding(true); 
        }} className="gap-1.5 h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm dark:shadow-none shrink-0 px-4 rounded-lg text-[13px] font-medium transition-all">
          <Plus size={16} />
          Novo Contrato
        </Button>
      </div>

      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={cancelAdding}></div>
          <Card className="relative w-full max-w-2xl rounded-[20px] shadow-2xl bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex-none px-6 py-4 border-b border-gray-100 dark:border-[#2A2F3A] bg-gray-50/50 dark:bg-[#1A1F26] flex justify-between items-center">
               <h2 className="text-[18px] font-bold text-gray-900 dark:text-[#fafafa] tracking-tight">{editingId ? 'Editar Contrato' : 'Novo Contrato'}</h2>
               <button onClick={cancelAdding} className="p-2 text-gray-400 hover:text-gray-700 dark:text-[#a1a1aa] dark:hover:text-[#fafafa] hover:bg-gray-100 dark:hover:bg-[#2A2F3A] rounded-full transition-colors outline-none focus:ring-2 focus:ring-blue-500">
                 <X size={20}/>
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <form id="contract-form" onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[13px] font-semibold text-gray-700 dark:text-[#d4d4d8] mb-1.5">Título do Contrato</label>
                    <input 
                      type="text" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      placeholder="Ex: Entrega de Grãos Safra 2024"
                      className="w-full bg-white dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-xl px-3.5 py-2.5 text-[14px] text-gray-900 dark:text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-gray-700 dark:text-[#d4d4d8] mb-1.5">Simulador Alvo (Automático)</label>
                    <input 
                      type="text" 
                      value={activeCompany?.simulatorName || simulator} 
                      disabled
                      className="w-full bg-gray-50 dark:bg-[#18181b] border border-gray-200 dark:border-[#2A2F3A] rounded-xl px-3.5 py-2.5 text-[14px] text-gray-500 dark:text-[#a1a1aa] cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[13px] font-semibold text-gray-700 dark:text-[#d4d4d8] mb-1.5">Reboque Padrão (Opcional)</label>
                    <select 
                      value={trailerId} 
                      onChange={e => setTrailerId(e.target.value)}
                      className="w-full bg-white dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-xl px-3.5 py-2.5 text-[14px] text-gray-900 dark:text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-shadow transition-colors"
                    >
                      <option value="">Nenhum reboque</option>
                      {trailers.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-gray-700 dark:text-[#d4d4d8] mb-1.5">Prazo (Dias)</label>
                    <input 
                      type="number" 
                      value={deadlineDays} 
                      onChange={e => setDeadlineDays(Number(e.target.value))} 
                      min={1}
                      className="w-full bg-white dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-xl px-3.5 py-2.5 text-[14px] text-gray-900 dark:text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-[13px] font-semibold text-gray-700 dark:text-[#d4d4d8]">Modo do Contrato</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     <label className="flex items-center gap-3 cursor-pointer bg-white dark:bg-[#09090b] px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2A2F3A] hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-colors shadow-sm dark:shadow-none">
                        <input type="radio" checked={mode === 'simple'} onChange={() => setMode('simple')} className="w-4 h-4 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 border-gray-300 dark:border-[#3f3f46] bg-gray-50 dark:bg-[#18181b]" />
                        <span className="font-medium text-[14px] text-gray-900 dark:text-[#fafafa]">Simples (Qtd)</span>
                     </label>
                     <label className="flex items-center gap-3 cursor-pointer bg-white dark:bg-[#09090b] px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2A2F3A] hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-colors shadow-sm dark:shadow-none">
                        <input type="radio" checked={mode === 'detailed'} onChange={() => setMode('detailed')} className="w-4 h-4 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 border-gray-300 dark:border-[#3f3f46] bg-gray-50 dark:bg-[#18181b]" />
                        <span className="font-medium text-[14px] text-gray-900 dark:text-[#fafafa]">Detalhado</span>
                     </label>
                  </div>
                </div>

                {mode === 'simple' && (
                  <div className="bg-blue-50/50 dark:bg-blue-900/10 p-5 rounded-xl border border-blue-100 dark:border-blue-900/20">
                    <label className="block text-[13px] font-semibold text-blue-900 dark:text-blue-400 mb-2">Quantidade Total de Entregas</label>
                    <input 
                      type="number" 
                      value={totalDeliveries} 
                      onChange={e => setTotalDeliveries(Number(e.target.value))} 
                      min={1}
                      className="w-full sm:max-w-xs bg-white dark:bg-[#09090b] border border-blue-200 dark:border-[#2A2F3A] rounded-xl px-3.5 py-2.5 text-[14px] text-gray-900 dark:text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow transition-colors"
                    />
                    <p className="text-[13px] text-blue-700/80 dark:text-blue-400 mt-2">Basta o motorista completar {totalDeliveries} entregas dentro do prazo.</p>
                  </div>
                )}

                {mode === 'detailed' && (
                  <div className="bg-gray-50/50 dark:bg-[#09090b] p-5 rounded-xl border border-gray-200 dark:border-[#2A2F3A] space-y-4">
                    <div className="flex justify-between items-center mb-3">
                       <label className="text-[13px] font-semibold text-gray-900 dark:text-[#fafafa]">Rotas Específicas ({deliveries.length})</label>
                       <Button type="button" variant="outline" size="sm" onClick={handleAddDelivery} className="gap-1.5 text-[12px] h-8 bg-white dark:bg-[#18181b] border-gray-200 dark:border-[#2A2F3A] text-gray-700 dark:text-[#d4d4d8] hover:bg-gray-50 dark:hover:bg-[#27272a] shadow-sm">
                         <Plus size={14} /> Adicionar Rota
                       </Button>
                    </div>
                    
                    <div className="space-y-3">
                      {deliveries.map((del, i) => (
                      <div key={i} className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-end sm:items-center bg-white dark:bg-[#1A1F26] p-2.5 rounded-[12px] border border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none transition-all focus-within:ring-2 focus-within:ring-blue-500/20">
                         <div className="flex-1 w-full relative">
                           <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
                             <MapPin size={16} className="text-gray-400" />
                           </div>
                           <input 
                             type="text" 
                             placeholder="Origem (Ex: São Paulo)"
                             value={del.origin}
                             onChange={e => handleUpdateDelivery(i, 'origin', e.target.value)}
                             className="w-full bg-transparent border-none pl-8 pr-3 py-1.5 text-[14px] text-gray-900 dark:text-[#fafafa] focus:outline-none focus:ring-0 placeholder:text-gray-400/80 dark:placeholder:text-[#71717a]"
                           />
                         </div>
                         
                         <div className="hidden sm:flex text-gray-300 items-center justify-center">
                            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-0.5"></span>
                            <svg className="w-4 h-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                         </div>

                         <div className="flex-1 w-full relative border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-[#2A2F3A] pt-2 sm:pt-0 sm:pl-3">
                           <div className="absolute inset-y-0 left-2.5 sm:left-5 flex items-center pointer-events-none pt-2 sm:pt-0">
                             <MapPin size={16} className="text-gray-400" />
                           </div>
                           <input 
                             type="text" 
                             placeholder="Destino (Ex: Rio de Janeiro)"
                             value={del.destination}
                             onChange={e => handleUpdateDelivery(i, 'destination', e.target.value)}
                             className="w-full bg-transparent border-none pl-8 pr-3 py-1.5 text-[14px] text-gray-900 dark:text-[#fafafa] focus:outline-none focus:ring-0 placeholder:text-gray-400/80 dark:placeholder:text-[#71717a]"
                           />
                         </div>

                         <div className="pl-2 pt-2 sm:pt-0 w-full sm:w-auto flex justify-end shrink-0">
                           {deliveries.length > 1 && (
                             <button type="button" onClick={() => handleRemoveDelivery(i)} className="text-gray-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                               <Trash2 size={16}/>
                             </button>
                           )}
                         </div>
                      </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            </div>

            <div className="flex-none px-6 py-4 bg-gray-50/50 dark:bg-[#1A1F26] border-t border-gray-100 dark:border-[#2A2F3A] flex justify-end gap-3 rounded-b-[20px]">
              <Button type="button" variant="ghost" onClick={cancelAdding} className="text-[14px] text-gray-600 dark:text-[#d4d4d8] hover:bg-gray-100 dark:hover:bg-[#2A2F3A]">Cancelar</Button>
              <Button type="submit" form="contract-form" className="bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 text-white shadow-sm dark:shadow-none border-none px-6 text-[14px] font-medium">{editingId ? 'Salvar Alterações' : 'Criar Contrato'}</Button>
            </div>
          </Card>
        </div>
      )}

      {filteredContracts.length === 0 ? (
         <div className="text-center py-20 bg-white dark:bg-[#1A1F26] rounded-2xl border border-gray-200 dark:border-[#2A2F3A] border-dashed">
            <div className="mx-auto w-16 h-16 bg-gray-50 dark:bg-[#1A1F26] rounded-full flex items-center justify-center text-gray-400 mb-4">
              <FileText size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-[#fafafa]">Nenhum contrato encontrado</h3>
            <p className="text-gray-500 dark:text-[#a1a1aa] mt-1 max-w-sm mx-auto">Tente ajustar sua busca ou crie um novo contrato.</p>
         </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
          {filteredContracts.map(contract => {
            const contractTrailer = trailers.find(t => t.id === contract.trailerId);
            
            return (
            <Card 
              key={contract.id} 
              className="rounded-2xl border border-gray-200 dark:border-[#2A2F3A]/80 shadow-sm dark:shadow-none relative overflow-hidden bg-white dark:bg-[#1A1F26] hover:border-gray-300 dark:border-[#52525b] hover:shadow-md dark:shadow-none transition-all cursor-pointer group"
              onClick={() => setViewingContractId(contract.id)}
            >
              <CardContent className="p-4 sm:p-5">
                 <div className="flex justify-between items-start mb-3">
                   <div className="pr-8">
                     <h3 className="font-bold text-gray-900 dark:text-[#fafafa] text-[15px] sm:text-[16px] leading-tight mb-1 line-clamp-2">{contract.name}</h3>
                     <p className="text-[13px] font-medium text-gray-500 dark:text-[#a1a1aa] truncate flex items-center gap-1.5">
                        <Truck size={14} className="text-gray-400" />
                        {contractTrailer ? contractTrailer.name : 'Qualquer reboque'}
                     </p>
                   </div>
                   
                   <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
                     <button 
                       onClick={() => setOpenDropdownId(openDropdownId === contract.id ? null : contract.id)}
                       className="p-1.5 text-gray-400 hover:text-gray-700 dark:text-[#d4d4d8] dark:hover:text-[#d4d4d8] hover:bg-gray-100 dark:bg-[#27272a] dark:hover:bg-[#3f3f46]/50 rounded-full transition-colors"
                     >
                       <MoreVertical size={18} />
                     </button>
                     
                     {openDropdownId === contract.id && (
                       <>
                         <div className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent backdrop-blur-[1px] sm:backdrop-blur-none transition-opacity" onClick={() => setOpenDropdownId(null)}></div>
                         <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] max-w-[300px] sm:absolute sm:right-0 sm:left-auto sm:top-8 sm:bottom-auto sm:-translate-x-0 sm:-translate-y-0 sm:w-48 bg-white dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A] rounded-2xl sm:rounded-xl shadow-2xl sm:shadow-lg dark:shadow-none z-50 py-2 sm:py-1 origin-center sm:origin-top-right animate-in fade-in zoom-in-95 duration-200 sm:duration-100">
                           <button 
                             onClick={() => {
                               setOpenDropdownId(null);
                               navigate('/admin/operations', { state: { isAssigning: true, preselectedContractId: contract.id } });
                             }}
                             className="w-full text-left px-5 py-3.5 sm:px-4 sm:py-2 text-[15px] sm:text-[13px] font-medium text-gray-700 dark:text-[#d4d4d8] hover:bg-gray-50 dark:bg-[#1A1F26] dark:hover:bg-[#3f3f46] flex items-center gap-3 sm:gap-2"
                           >
                              <PlayCircle size={14} className="text-blue-500" />
                              Designar Trabalho
                           </button>
                           <button 
                             onClick={() => {
                               setOpenDropdownId(null);
                               handleEdit(contract.id);
                             }}
                             className="w-full text-left px-5 py-3.5 sm:px-4 sm:py-2 text-[15px] sm:text-[13px] font-medium text-gray-700 dark:text-[#d4d4d8] hover:bg-gray-50 dark:bg-[#1A1F26] dark:hover:bg-[#3f3f46] flex items-center gap-3 sm:gap-2"
                           >
                              <Edit2 size={14} className="text-gray-500 dark:text-[#a1a1aa]" />
                              Editar Contrato
                           </button>
                           <div className="h-px w-full bg-gray-100 dark:bg-[#18181b] my-1"></div>
                           <button 
                             onClick={() => {
                               setOpenDropdownId(null);
                               {
                                 deleteContract(contract.id);
                               }
                             }}
                             className="w-full text-left px-5 py-3.5 sm:px-4 sm:py-2 text-[15px] sm:text-[13px] font-medium text-red-600 hover:bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 flex items-center gap-3 sm:gap-2"
                           >
                              <Trash size={14} className="text-red-500" />
                              Excluir Contrato
                           </button>
                         </div>
                       </>
                     )}
                   </div>
                 </div>
                 
                 <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 dark:text-[#fafafa] bg-gray-50 dark:bg-[#1A1F26]/80 p-2.5 rounded-lg border border-gray-100 dark:border-[#2A2F3A]">
                    <span>{contract.totalDeliveries} entregas</span>
                    <span className="text-gray-300">•</span>
                    <span>{contract.deadlineDays} dias</span>
                 </div>
              </CardContent>
            </Card>
          )})}
        </div>
      )}
      
      {viewingContractId && (
        <ContractDetailsModal 
          contractId={viewingContractId} 
          onClose={() => setViewingContractId(null)}
          onEdit={(id) => {
            setViewingContractId(null);
            handleEdit(id);
          }}
        />
      )}
    </div>
  );
}
