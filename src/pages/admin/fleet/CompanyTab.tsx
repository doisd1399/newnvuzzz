import React, { useState, useMemo, useRef } from 'react';
import { useAppStore } from '../../../context/AppContext';
import { Button } from '../../../components/ui/Button';
import { Pencil, Calendar, ChevronDown, Check, Trash2, AlertTriangle, RefreshCw, Camera } from 'lucide-react';
import { PeriodSelector, DateRange } from './PeriodSelector';
import { parseISO, isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import { convertFileToBase64, compressImage } from '../../../lib/utils';

export default function CompanyTab() {
  const { companies, currentUser, activeCompanyId, updateCompany, createCompany, deleteCompany, jobs, contracts, memberships } = useAppStore();
  const activeCompany = companies.find(c => c.id === activeCompanyId);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: subDays(new Date(), 6), to: new Date() });
  const fileInputRef = useRef<HTMLInputElement>(null);

  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    companyName: '',
    fleetName: '',
    simulatorName: '',
    ownerName: '',
    whatsapp: '',
    logoUrl: '',
  });

  React.useEffect(() => {
    if (activeCompany) {
      setFormData({
        companyName: activeCompany.companyName,
        fleetName: activeCompany.fleetName,
        simulatorName: activeCompany.simulatorName,
        ownerName: activeCompany.ownerName || '',
        whatsapp: activeCompany.whatsapp || '',
        logoUrl: activeCompany.logoUrl || '',
      });
      setIsAddingNew(false);
      setIsEditing(false);
    } else {
      const hasAnyCompany = activeCompanyId || currentUser?.companyId || (memberships && memberships.length > 0);
      if (!hasAnyCompany) {
        setIsAddingNew(true);
      }
    }
  }, [activeCompany, activeCompanyId, currentUser, memberships]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && activeCompany && !isAddingNew) {
      await updateCompany(activeCompany.id, formData);
      setIsEditing(false);
    } else if (isAddingNew) {
      await createCompany(formData);
      setIsAddingNew(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('A imagem é muito grande. Tamanho máximo 10MB.');
        return;
      }
      try {
        const base64 = await convertFileToBase64(file);
        const compressed = await compressImage(base64, 400, 400, 0.8);
        setFormData(prev => ({ ...prev, logoUrl: compressed }));
      } catch (err) {
        console.error('Error compressing logo:', err);
        alert('Erro ao processar imagem.');
      }
    }
  };

  const handleDelete = async () => {
    if (!activeCompany) return;
    setIsDeleting(true);
    try {
      await deleteCompany(activeCompany.id);
      setShowDeleteConfirm(false);
    } catch (e: any) {
      alert('Erro ao excluir frota: ' + e.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const isDateInRange = (dateStr?: string) => {
    if (!dateStr || !dateRange || !dateRange.from) return true;
    try {
      const date = parseISO(dateStr);
      const start = startOfDay(dateRange.from);
      const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      return isWithinInterval(date, { start, end });
    } catch (e) {
      return true; // Fallback to true if date is unparseable
    }
  };

  const companyJobs = useMemo(() => jobs.filter(j => j.companyId === activeCompanyId && isDateInRange(j.createdAt)), [jobs, activeCompanyId, dateRange]);
  const companyContracts = useMemo(() => contracts.filter(c => c.companyId === activeCompanyId && isDateInRange((c as any).createdAt)), [contracts, activeCompanyId, dateRange]);

  if (isEditing || isAddingNew) {
    return (
      <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[20px] shadow-sm p-5 mt-4">
        <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:border-[#2A2F3A] pb-4">
           <h3 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">
             {isEditing ? 'Editar Empresa' : 'Nova Empresa'}
           </h3>
           <Button type="button" onClick={() => handleSubmit({ preventDefault: () => {} } as any)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-9 text-[14px] font-semibold px-4 flex items-center gap-1.5">
             <Check size={16} /> Salvar
           </Button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div>
              <label className="block text-[14px] font-medium text-slate-700 dark:text-[#a1a1aa] mb-1.5 ml-1">Nome da Empresa</label>
              <input 
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                className="w-full bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-4 h-12 text-[15px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-white transition-all shadow-sm"
                required
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-slate-700 dark:text-[#a1a1aa] mb-1.5 ml-1">Nome da Frota</label>
              <input 
                name="fleetName"
                value={formData.fleetName}
                onChange={handleChange}
                className="w-full bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-4 h-12 text-[15px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-white transition-all shadow-sm"
                required
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-slate-700 dark:text-[#a1a1aa] mb-1.5 ml-1">Simulador Padrão</label>
              <div className="relative">
                <select 
                  name="simulatorName"
                  value={formData.simulatorName}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#2A2F3A] rounded-xl pl-4 pr-10 h-12 text-[15px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-white transition-all shadow-sm appearance-none"
                  required
                >
                  <option value="" disabled>Selecione um simulador</option>
                  <option value="Wtds">Wtds</option>
                  <option value="Wbds">Wbds</option>
                  <option value="Gto">Gto</option>
                  <option value="Toe 3">Toe 3</option>
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[14px] font-medium text-slate-700 dark:text-[#a1a1aa] mb-1.5 ml-1">Proprietário (Responsável)</label>
              <input 
                name="ownerName"
                value={formData.ownerName}
                onChange={handleChange}
                className="w-full bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-4 h-12 text-[15px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-white transition-all shadow-sm"
                required
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-slate-700 dark:text-[#a1a1aa] mb-1.5 ml-1">WhatsApp</label>
              <input 
                name="whatsapp"
                value={formData.whatsapp}
                onChange={handleChange}
                placeholder="(00) 00000-0000"
                className="w-full bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-4 h-12 text-[15px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-white transition-all shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-slate-700 dark:text-[#a1a1aa] mb-1.5 ml-1">Logo da Empresa</label>
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-[#2A2F3A] border border-slate-200 dark:border-[#3A3F4A] overflow-hidden flex flex-col items-center justify-center relative cursor-pointer group shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {formData.logoUrl ? (
                    <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="text-slate-400 group-hover:text-blue-500 transition-colors" size={24} />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="text-white" size={20} />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] text-slate-500 dark:text-slate-400">Clique para enviar uma imagem</span>
                  <span className="text-[12px] text-slate-400 dark:text-slate-500">Tamanho máximo: 10MB</span>
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-6 mt-4 border-t border-slate-100 dark:border-[#2A2F3A]">
            {activeCompany && isEditing ? (
              <button 
                type="button" 
                onClick={() => setShowDeleteConfirm(true)}
                className="text-rose-600 dark:text-rose-400 flex items-center gap-1.5 text-[14px] font-semibold p-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
              >
                <Trash2 size={16} /> Excluir
              </button>
            ) : <div />}
            {activeCompany && (
              <button type="button" onClick={() => { setIsEditing(false); setIsAddingNew(false); }} className="text-slate-500 dark:text-slate-400 font-semibold px-4 py-2 hover:bg-slate-100 dark:hover:bg-[#2A2F3A] rounded-xl transition-colors">
                Cancelar
              </button>
            )}
          </div>
        </form>

        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1A1F26] rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
              <div className="flex justify-center mb-5">
                <div className="w-14 h-14 bg-rose-100 dark:bg-rose-500/10 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={28} />
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 text-center tracking-tight">Excluir Empresa</h3>
              <p className="text-slate-600 dark:text-slate-400 text-[14px] text-center mb-8 leading-relaxed">
                Tem certeza que deseja excluir <b>{activeCompany?.fleetName}</b>? Esta ação removerá tudo.
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1 font-semibold border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-300 h-12 rounded-xl" 
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleDelete}
                  className="flex-1 font-semibold bg-rose-600 hover:bg-rose-700 text-white border-0 h-12 rounded-xl"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Progresso...' : 'Sim, excluir'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isStillLoading = !activeCompany && (activeCompanyId || currentUser?.companyId || (memberships && memberships.length > 0));

  if (isStillLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[20px] shadow-sm mt-4">
        <RefreshCw className="animate-spin text-blue-500 mb-3" size={32} />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Carregando dados da frota...</p>
      </div>
    );
  }

  if (!activeCompany) return null;

  return (
    <div className="space-y-4">
      {/* Period Filter */}
      <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[20px] shadow-sm">
        <div className="p-4 flex flex-wrap items-center justify-between gap-4">
          <span className="text-[15px] text-slate-700 dark:text-slate-300 font-medium ml-1">Período</span>
          <PeriodSelector onPeriodChange={setDateRange} />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[20px] shadow-sm flex h-28">
        <div className="flex-1 px-4 flex flex-col justify-center items-center relative">
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-1.5 tracking-tight">
            {companyJobs.length.toLocaleString('pt-BR')}
          </h3>
          <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Total de viagens</p>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-[60%] bg-slate-100 dark:bg-[#2A2F3A]"></div>
        </div>
        <div className="flex-1 px-4 flex flex-col justify-center items-center">
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-1.5 tracking-tight">
            {companyContracts.length.toLocaleString('pt-BR')}
          </h3>
          <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Total de contratos</p>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[20px] shadow-sm p-5">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight ml-1">Informações da Empresa</h3>
          <button 
            onClick={() => setIsEditing(true)} 
            className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 px-3.5 py-2 rounded-xl transition-colors border border-blue-200 dark:border-blue-500/20 active:scale-95"
          >
            <Pencil size={15} />
            <span className="text-[14px] font-semibold">Editar</span>
          </button>
        </div>
        
        <div className="space-y-0 text-[14px]">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2A2F3A] py-3.5">
            <span className="text-slate-500 dark:text-slate-400 px-1">Nome da Frota</span>
            <span className="font-semibold text-slate-900 dark:text-white text-right ml-4">{activeCompany.fleetName || '-'}</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2A2F3A] py-3.5">
            <span className="text-slate-500 dark:text-slate-400 px-1">Proprietário</span>
            <span className="font-semibold text-slate-900 dark:text-white text-right break-all ml-4">{activeCompany.ownerName || '-'}</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2A2F3A] py-3.5">
            <span className="text-slate-500 dark:text-slate-400 px-1">Email</span>
            <span className="font-semibold text-slate-900 dark:text-white text-right break-all ml-4">{currentUser?.email || '-'}</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2A2F3A] py-3.5">
            <span className="text-slate-500 dark:text-slate-400 px-1">WhatsApp</span>
            <span className="font-semibold text-slate-900 dark:text-white text-right ml-4">{activeCompany.whatsapp || '-'}</span>
          </div>
          <div className="flex items-center justify-between py-3.5 pb-1">
            <span className="text-slate-500 dark:text-slate-400 px-1">Simulador Padrão</span>
            <span className="font-semibold text-slate-900 dark:text-white text-right ml-4">{activeCompany.simulatorName || 'Global Truck'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
