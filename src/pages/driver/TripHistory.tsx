import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Filter, Eye, Truck, Package, FileText, File, X } from 'lucide-react';
import { cn } from "../../lib/utils";
import { db } from "../../lib/firebase";
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc } from "firebase/firestore";
import { useAppStore } from "../../context/AppContext";

export interface TripRecord {
  id: string;
  empresaId: string;
  empresaNome: string;
  motoristaId: string;
  motoristaNome: string;
  
  contratoId: string;
  contratoNumero: string;
  contratoDescricao?: string;
  
  veiculoId: string;
  veiculoNome: string;
  veiculoPlaca?: string;
  
  reboqueId: string;
  reboqueNome: string;
  
  origem: string;
  destino: string;
  valor: number;
  comprovanteUrl: string;
  status: string;
  criadoPor: string;
  dataLancamento: any;
  createdAt: any;
}

export default function TripHistory() {
  const navigate = useNavigate();
  const { currentUser, activeCompanyId, activeRole } = useAppStore();
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    empresa: "",
    motorista: "",
    periodoInicio: "",
    periodoFim: ""
  });

  // Backfill for old records
  useEffect(() => {
    const runBackfill = async () => {
      if (!activeCompanyId) return;
      try {
        const qTrips = query(collection(db, "historico_viagens"), where("empresaId", "==", activeCompanyId));
        const tripsSnap = await getDocs(qTrips);
        
        let needsMigration = false;
        for (const docSnap of tripsSnap.docs) {
          const t = docSnap.data();
          if (!t.veiculoNome || t.veiculoNome === "-" || !t.contratoNumero || t.contratoNumero === "-") {
            needsMigration = true;
            break;
          }
        }
        
        if (!needsMigration) return;

        const [vSnap, cSnap, tSnap] = await Promise.all([
          getDocs(query(collection(db, "vehicles"), where("companyId", "==", activeCompanyId))),
          getDocs(query(collection(db, "contracts"), where("companyId", "==", activeCompanyId))),
          getDocs(query(collection(db, "trailers"), where("companyId", "==", activeCompanyId)))
        ]);

        const vMap = new Map(vSnap.docs.map(d => [d.id, d.data()]));
        const cMap = new Map(cSnap.docs.map(d => [d.id, d.data()]));
        const tMap = new Map(tSnap.docs.map(d => [d.id, d.data()]));

        const updates = tripsSnap.docs.map(async (docSnap) => {
          const tData = docSnap.data();
          if (!tData.veiculoNome || tData.veiculoNome === "-" || !tData.contratoNumero || tData.contratoNumero === "-") {
            const v = vMap.get(tData.veiculoId);
            const c = cMap.get(tData.contratoId);
            const t = tMap.get(tData.reboqueId);
            
            const veiculoNome = v ? `${v.name || ""}`.trim() : "Veículo não encontrado";
            const veiculoPlaca = v?.plate || "";
            const contratoNumero = c ? c.name : "Contrato não encontrado";
            const contratoDescricao = "";
            const reboqueNome = t ? `${t.name || ""}`.trim() : "Reboque não encontrado";
            
            await updateDoc(doc(db, "historico_viagens", docSnap.id), {
              veiculoNome,
              veiculoPlaca,
              contratoNumero,
              contratoDescricao,
              reboqueNome
            });
          }
        });
        
        await Promise.all(updates);
      } catch (err) {
        console.error("Backfill failed:", err);
      }
    };
    
    runBackfill();
  }, [activeCompanyId]);

  useEffect(() => {
    if (!currentUser || !activeCompanyId) return;

    let q = query(
      collection(db, "historico_viagens"),
      where("empresaId", "==", activeCompanyId)
    );

    if (activeRole === "driver") {
      q = query(
        collection(db, "historico_viagens"),
        where("empresaId", "==", activeCompanyId),
        where("motoristaId", "==", currentUser.id)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTrips = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TripRecord[];
      
      // Sort client-side to avoid composite index requirements in Firestore
      fetchedTrips.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : (a.dataLancamento?.toDate ? a.dataLancamento.toDate().getTime() : new Date(a.dataLancamento || 0).getTime()));
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : (b.dataLancamento?.toDate ? b.dataLancamento.toDate().getTime() : new Date(b.dataLancamento || 0).getTime()));
        return dateB - dateA;
      });

      setTrips(fetchedTrips);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao buscar histórico de viagens:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, activeCompanyId, activeRole]);

  // Client-side filtering
  const filteredTrips = trips.filter((trip) => {
    if (filters.empresa && !trip.empresaNome.toLowerCase().includes(filters.empresa.toLowerCase())) {
      return false;
    }
    if (filters.motorista && !trip.motoristaNome.toLowerCase().includes(filters.motorista.toLowerCase())) {
      return false;
    }
    if (filters.periodoInicio) {
      const tripDate = trip.createdAt?.toDate ? trip.createdAt.toDate() : new Date(trip.createdAt || trip.dataLancamento);
      const startDate = new Date(filters.periodoInicio);
      if (tripDate < startDate) return false;
    }
    if (filters.periodoFim) {
      const tripDate = trip.createdAt?.toDate ? trip.createdAt.toDate() : new Date(trip.createdAt || trip.dataLancamento);
      const endDate = new Date(filters.periodoFim);
      endDate.setHours(23, 59, 59, 999);
      if (tripDate > endDate) return false;
    }
    return true;
  });

  const totalViagens = filteredTrips.length;
  const faturamentoTotal = filteredTrips.reduce((acc, current) => acc + (current.valor || 0), 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('. de ', ' ').replace(' de ', ' ');
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const getTripEntities = (trip: TripRecord) => {
    return {
      contractName: trip.contratoNumero || "Contrato não encontrado",
      vehicleName: trip.veiculoNome || "Veículo não encontrado",
      trailerName: trip.reboqueNome || "Reboque não encontrado"
    };
  };

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-[#09090b] min-h-[calc(100vh-3.5rem)] pb-24 md:pb-28 max-w-2xl mx-auto w-full relative">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-6 pt-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)}
              className="p-1 -ml-1 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ArrowLeft size={22} className="stroke-[2.5]" />
            </button>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              Histórico de Viagens
            </h1>
          </div>
          <p className="text-[13px] md:text-sm text-gray-500 dark:text-gray-400 pl-[34px]">
            Acompanhe todas as suas entregas realizadas.
          </p>
        </div>
        <button 
          onClick={() => setShowFilters(true)}
          className="flex justify-center items-center h-9 w-12 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Filter size={18} className="text-gray-700 dark:text-gray-300 stroke-[2]" />
        </button>
      </div>

      {/* List Section */}
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="text-center p-8 text-gray-500 bg-white dark:bg-[#121213] rounded-2xl border border-gray-100 dark:border-gray-800">
            Nenhum histórico de viagens encontrado.
          </div>
        ) : (
          filteredTrips.map((trip) => {
            const entities = getTripEntities(trip);
            return (
            <div 
              key={trip.id} 
              className="bg-white dark:bg-[#121213] p-4 md:p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:shadow-none flex flex-col gap-4"
            >
              {/* Top Row: Date & Eye Icon */}
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">
                  {formatDate(trip.createdAt || trip.dataLancamento)} &bull; {formatTime(trip.createdAt || trip.dataLancamento)}
                </span>
                <button 
                  onClick={() => setSelectedTrip(trip)}
                  className="p-1 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <Eye size={18} className="stroke-[2]" />
                </button>
              </div>

              {/* Middle Row: Route & Value */}
              <div className="flex items-center justify-between pl-1">
                <div className="flex flex-col gap-3 relative">
                  {/* Vertical dash line */}
                  <div className="absolute left-[5px] top-[14px] bottom-[14px] w-[1px] border-l border-dashed border-gray-300 dark:border-gray-700"></div>
                  
                  {/* Origin */}
                  <div className="flex items-center gap-3">
                    <div className="w-[11px] h-[11px] rounded-full border-2 border-green-500 bg-white dark:bg-[#121213] relative z-10" />
                    <span className="text-[15px] font-medium text-gray-800 dark:text-gray-200">{trip.origem}</span>
                  </div>
                  
                  {/* Destination */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-[11px] h-[11px] relative z-10">
                      <div className="w-[11px] h-[11px] rounded-full bg-blue-500 flex items-center justify-center">
                         <div className="w-[3px] h-[3px] bg-white rounded-full"></div>
                      </div>
                    </div>
                    <span className="text-[15px] font-medium text-gray-800 dark:text-gray-200">{trip.destino}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {formatCurrency(trip.valor)}
                  </span>
                </div>
              </div>

              {/* Bottom Row: Metadata */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                <div className="flex items-center gap-2">
                  <Truck size={14} className="text-gray-400 stroke-[2] shrink-0" />
                  <span className="text-[13px] font-medium text-gray-600 dark:text-gray-400 truncate">{entities.vehicleName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-gray-400 stroke-[2] shrink-0" />
                  <span className="text-[13px] font-medium text-gray-600 dark:text-gray-400 truncate">{entities.trailerName}</span>
                </div>
                <div className="flex items-center justify-end gap-2 pr-1">
                   <FileText size={14} className="text-gray-400 stroke-[2] shrink-0" />
                   <span className="text-[13px] font-medium text-gray-600 dark:text-gray-400 truncate">{entities.contractName}</span>
                </div>
              </div>
            </div>
          )
        })
        )}
      </div>

      {/* Fixed Bottom Summary Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-6 md:pb-4 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md border-t border-gray-100 dark:border-gray-800 md:left-64 z-40">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-[#121213] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] dark:shadow-none p-4 flex items-center justify-around h-[72px]">
            {/* Left Box */}
            <div className="flex items-center gap-4 flex-1">
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <File size={22} className="text-blue-500 fill-blue-100/50 dark:fill-blue-500/20 stroke-[1.5]" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{totalViagens}</span>
                <span className="text-[12px] font-medium text-gray-500 dark:text-gray-400 leading-tight">Viagens</span>
              </div>
            </div>
            
            {/* Divider */}
            <div className="w-[1px] h-10 bg-gray-100 dark:bg-gray-800 mx-4"></div>

            {/* Right Box */}
            <div className="flex items-center gap-4 flex-1">
              <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-500/10 flex items-center justify-center">
                <span className="text-green-500 text-xl font-bold">$</span>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{formatCurrency(faturamentoTotal)}</span>
                <span className="text-[12px] font-medium text-gray-500 dark:text-gray-400 leading-tight">Faturamento Total</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Modal */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 md:p-4 bg-gray-900/40 backdrop-blur-sm sm:pb-8">
          <div className="bg-white dark:bg-[#121213] w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white text-[15px]">Filtrar Histórico</h3>
              <button 
                onClick={() => setShowFilters(false)}
                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Empresa</label>
                <input 
                  type="text" 
                  value={filters.empresa}
                  onChange={(e) => setFilters({...filters, empresa: e.target.value})}
                  className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-gray-900 dark:text-white outline-none"
                  placeholder="Nome da empresa..."
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Motorista / Simulador</label>
                <input 
                  type="text" 
                  value={filters.motorista}
                  onChange={(e) => setFilters({...filters, motorista: e.target.value})}
                  className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-gray-900 dark:text-white outline-none"
                  placeholder="Nome do motorista..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Período Início</label>
                  <input 
                    type="date" 
                    value={filters.periodoInicio}
                    onChange={(e) => setFilters({...filters, periodoInicio: e.target.value})}
                    className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-gray-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Período Fim</label>
                  <input 
                    type="date" 
                    value={filters.periodoFim}
                    onChange={(e) => setFilters({...filters, periodoFim: e.target.value})}
                    className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-gray-900 dark:text-white outline-none"
                  />
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 bg-gray-50 dark:bg-[#09090b]">
              <button 
                onClick={() => {
                  setFilters({ empresa: "", motorista: "", periodoInicio: "", periodoFim: "" });
                  setShowFilters(false);
                }}
                className="flex-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                Limpar
              </button>
              <button 
                onClick={() => setShowFilters(false)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                Aplicar Filtro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detailed View */}
      {selectedTrip && (() => {
        const selectedEntities = getTripEntities(selectedTrip);
        return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 md:p-4 bg-gray-900/40 backdrop-blur-sm sm:pb-8">
          <div className="bg-white dark:bg-[#121213] w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#121213] z-10">
              <h3 className="font-bold text-gray-900 dark:text-white text-[15px]">Detalhes da Viagem</h3>
              <button 
                onClick={() => setSelectedTrip(null)}
                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto w-full">
              {/* Trip General Information */}
              <div className="space-y-4 mb-6">
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-500 dark:text-gray-400 font-medium">Data</span>
                   <span className="text-gray-900 dark:text-white font-semibold">{formatDate(selectedTrip.createdAt || selectedTrip.dataLancamento)} às {formatTime(selectedTrip.createdAt || selectedTrip.dataLancamento)}</span>
                 </div>
                 <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-500 dark:text-gray-400 font-medium">Motorista</span>
                   <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[200px] text-right">{selectedTrip.motoristaNome}</span>
                 </div>
                 <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-500 dark:text-gray-400 font-medium">Empresa</span>
                   <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[200px] text-right">{selectedTrip.empresaNome}</span>
                 </div>
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-500 dark:text-gray-400 font-medium">Contrato</span>
                   <span className="text-gray-900 dark:text-white font-semibold text-right">{selectedEntities.contractName}</span>
                 </div>
                 <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-500 dark:text-gray-400 font-medium">Veículo</span>
                   <span className="text-gray-900 dark:text-white font-semibold text-right">{selectedEntities.vehicleName}</span>
                 </div>
                 <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-500 dark:text-gray-400 font-medium">Reboque</span>
                   <span className="text-gray-900 dark:text-white font-semibold text-right">{selectedEntities.trailerName}</span>
                 </div>
                 <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-500 dark:text-gray-400 font-medium">Origem</span>
                   <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[200px] text-right">{selectedTrip.origem}</span>
                 </div>
                 <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-500 dark:text-gray-400 font-medium">Destino</span>
                   <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[200px] text-right">{selectedTrip.destino}</span>
                 </div>
                 <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-500 dark:text-gray-400 font-medium">Valor Recebido</span>
                   <span className="text-green-600 dark:text-green-500 font-bold text-base text-right">{formatCurrency(selectedTrip.valor)}</span>
                 </div>
              </div>
              
              {/* Receipt Image */}
              {selectedTrip.comprovanteUrl && (
                <div className="mt-6 mb-4">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 block mb-3">Comprovante de Entrega</span>
                  <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <img 
                      src={selectedTrip.comprovanteUrl} 
                      alt="Comprovante" 
                      className="w-full h-auto object-contain max-h-[350px]"
                    />
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#09090b]">
              <button 
                onClick={() => setSelectedTrip(null)}
                className="w-full bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
