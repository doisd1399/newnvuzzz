import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../context/AppContext";
import { ArrowLeft, MapPin, UploadCloud, Send, Clock, CheckCircle2, User, ClipboardList, Truck, Package } from "lucide-react";
import { cn } from "../../lib/utils";
import { db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function RecordTrip() {
  const navigate = useNavigate();
  const {
    currentUser,
    companies,
    activeCompanyId,
    jobs,
    contracts,
    vehicles,
    trailers,
  } = useAppStore();

  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;

  const currentCompany = companies.find((c) => c.id === activeCompanyId);
  
  // Find active job
  const validActiveJobs = jobs.filter(
    (j) =>
      j.driverId === currentUser.id &&
      ["pending", "active", "delayed"].includes(j.status) &&
      contracts.some((c) => c.id === j.contractId)
  );

  validActiveJobs.sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  const activeJob = validActiveJobs[0];
  const activeContract = activeJob
    ? contracts.find((c) => c.id === activeJob.contractId)
    : null;
  const activeVehicle =
    activeJob && activeJob.vehicleId
      ? vehicles.find((v) => v.id === activeJob.vehicleId)
      : null;
  const activeTrailerId = activeJob?.trailerId || activeContract?.trailerId;
  const activeTrailer = activeTrailerId
    ? trailers.find((t) => t.id === activeTrailerId)
    : null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("A imagem deve ter no máximo 5MB.");
        return;
      }
      
      setIsUploading(true);

      try {
        const sysDoc = await getDoc(doc(db, "settings", "system"));
        const refreshToken = sysDoc.data()?.driveRefreshToken;

        if (!refreshToken) {
          throw new Error("O Google Drive do proprietário não está conectado no Painel Senior.");
        }

        const formData = new FormData();
        formData.append("image", file);
        formData.append("refreshToken", refreshToken);

        const response = await fetch("/api/upload-drive", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
           const errData = await response.json().catch(() => ({}));
           throw new Error(errData.error || "Erro no servidor ao enviar arquivo.");
        }
        
        const data = await response.json();
        
        if (data.webContentLink) {
          setImagePreview(data.webContentLink);
        } else {
           setImagePreview(data.webViewLink);
        }
      } catch (err: any) {
        console.error("Upload error:", err);
        alert(`Ocorreu um erro ao enviar a imagem: ${err.message}. Tente novamente.`);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    }
  };

  const handleLancarViagem = () => {
    if (!origem || !destino || !valor || !imagePreview) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    // Lógica para salvar a viagem (mocked)
    alert("Viagem lançada com sucesso!");
    setOrigem("");
    setDestino("");
    setValor("");
    setImagePreview(null);
  };

  const formatCurrency = (value: string) => {
    // Keep only digits
    let digits = value.replace(/\D/g, "");
    if (!digits) return "";
    
    // Convert to number and format as BRL
    const numberValue = parseInt(digits, 10) / 100;
    return numberValue.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setValor(formatCurrency(rawValue));
  };

  const currentDeliveries = activeJob ? activeJob.progress : 0;
  const totalDeliveries = activeContract ? activeContract.totalDeliveries : 6; // fallback 6 as per mockup
  const driverName = currentUser.name || "Motorista não identificado";
  const contractName = activeContract?.name || "Nenhum contrato ativo";
  const vehicleName = activeVehicle?.name || "Nenhum";
  const trailerName = activeTrailer?.name || "Nenhum";
  const companyLogo = currentCompany?.logoUrl || "";
  const companyName = currentCompany?.fleetName || currentCompany?.companyName || "Empresa";
  const cnpj = currentCompany?.cnpj || "00.000.000/0000-00";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 pb-10 px-0 sm:px-4 text-gray-900 font-sans tracking-[-0.01em]">
      {/* Top Header */}
      <div className="flex items-center gap-2 py-1 px-2">
        <button 
          onClick={() => navigate(-1)}
          className="p-1 -ml-1 text-gray-600 hover:text-gray-900 transition-colors bg-transparent border-none outline-none appearance-none cursor-pointer flex items-center justify-center shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex flex-col min-w-0">
          <h1 className="text-[16px] sm:text-[17px] font-bold text-gray-900 tracking-tight leading-none mb-0.5">
            Lançar Viagem
          </h1>
          <p className="text-[11px] sm:text-[12px] text-gray-500 font-medium leading-none">
            Registre os dados da entrega realizada.
          </p>
        </div>
      </div>

      {/* Main Info Card */}
      <div className="bg-white border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] sm:rounded-[20px] rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5">
          {/* Company Header */}
          <div className="flex items-center gap-3.5 mb-5">
            <div className="w-[44px] h-[44px] bg-[#1BACB3] font-bold text-white tracking-tighter text-lg rounded-[14px] flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} className="w-full h-full object-cover" />
              ) : (
                companyName.substring(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 leading-tight">
                <h2 className="text-[15px] sm:text-[16px] font-bold text-gray-900 truncate">
                  {companyName}
                </h2>
                <div className="text-blue-600 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10.603 2.5029L12.0005 1L13.3981 2.5029L15.4223 2.76632L16.2928 4.63665L18.2568 5.43859L18.4237 7.49479L20.0076 8.86874L19.5539 10.8711L20.5962 12.5693L19.5539 14.2675L20.0076 16.2699L18.4237 17.6439L18.2568 19.7001L16.2928 20.502L15.4223 22.3723L13.3981 22.6357L12.0005 24.1386L10.603 22.6357L8.5788 22.3723L7.70823 20.502L5.74426 19.7001L5.57732 17.6439L3.99346 16.2699L4.44716 14.2675L3.40483 12.5693L4.44716 10.8711L3.99346 8.86874L5.57732 7.49479L5.74426 5.43859L7.70823 4.63665L8.5788 2.76632L10.603 2.5029ZM11.085 14.9453L16.3263 9.70404L14.9121 8.28983L11.085 12.1169L9.00694 10.0388L7.59273 11.453L11.085 14.9453Z" />
                  </svg>
                </div>
              </div>
              <p className="text-[12px] text-gray-500 font-medium mt-0.5 truncate">CNPJ {cnpj}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-3.5 gap-x-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-gray-400">
                <User size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-400 font-medium leading-none mb-1">Motorista</p>
                <p className="text-[13px] font-semibold text-gray-800 truncate leading-none">{driverName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-gray-400">
                <ClipboardList size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-400 font-medium leading-none mb-1">Contrato</p>
                <p className="text-[13px] font-semibold text-gray-800 truncate leading-none">{contractName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-gray-400">
                <Truck size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-400 font-medium leading-none mb-1">Veículo</p>
                <p className="text-[13px] font-semibold text-gray-800 truncate leading-none">{vehicleName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-gray-400">
                <Package size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-400 font-medium leading-none mb-1">Reboque</p>
                <p className="text-[13px] font-semibold text-gray-800 truncate leading-none">{trailerName}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Card Section */}
        <div className="px-4 py-3 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-blue-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
            </div>
            <span className="font-semibold text-[13px] text-gray-800">
              Viagens
            </span>
          </div>
          <div className="font-bold text-[14px] text-gray-900">
            <span className="text-blue-600">{currentDeliveries}</span>
            <span className="text-gray-400">/{totalDeliveries}</span>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white border border-gray-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.02)] sm:rounded-[20px] rounded-2xl p-4 sm:p-5 relative">
        <div className="space-y-4">
          {/* 1. Origem */}
          <div>
            <label className="text-[13px] font-semibold text-gray-800 mb-1.5 block">
              1. Origem*
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <MapPin size={16} />
              </div>
              <input
                type="text"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                className="w-full bg-white border border-gray-200 text-gray-800 text-[14px] rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block pl-9 pr-3 py-2 sm:py-2.5 transition-colors outline-none"
                placeholder="Ex.: Curitiba - PR"
              />
            </div>
          </div>

          {/* 2. Destino */}
          <div>
            <label className="text-[13px] font-semibold text-gray-800 mb-1.5 block">
              2. Destino*
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <MapPin size={16} />
              </div>
              <input
                type="text"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="w-full bg-white border border-gray-200 text-gray-800 text-[14px] rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block pl-9 pr-3 py-2 sm:py-2.5 transition-colors outline-none"
                placeholder="Ex.: São Paulo - SP"
              />
            </div>
          </div>

          {/* 3. Comprovante */}
          <div>
            <label className="text-[13px] font-semibold text-gray-800 mb-1.5 block">
              3. Comprovante da Entrega*
            </label>
            <div className="flex items-center flex-wrap gap-3 mb-2.5">
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
              <button
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className={cn("flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 text-[13px] font-semibold py-1.5 px-3.5 rounded-[10px] transition-colors", isUploading ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]")}
              >
                <UploadCloud size={16} className={isUploading ? "animate-pulse" : ""} />
                {isUploading ? "Enviando..." : "Enviar imagem"}
              </button>
              <span className="text-[12px] text-gray-500 font-medium">
                PNG, JPG ou WEBP (Máx. 5MB)
              </span>
            </div>

            {imagePreview && (
              <div className="w-full rounded-xl overflow-hidden border border-gray-200 shadow-sm relative mt-2">
                <img
                  src={imagePreview}
                  alt="Prévia do comprovante"
                  className="w-full h-auto max-h-[300px] object-cover sm:object-contain rounded-[10px]"
                />
              </div>
            )}
          </div>

          {/* 4. Valor */}
          <div className="pt-1">
            <label className="text-[13px] font-semibold text-gray-800 mb-1.5 block">
              4. Valor ganho (R$)*
            </label>
            <div className="relative flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-shadow">
              <div className="px-3 py-2 sm:py-2.5 border-r border-gray-100 bg-gray-50/50 text-gray-600 font-medium text-[14px] shrink-0">
                R$
              </div>
              <input
                type="text"
                value={valor}
                onChange={handleValorChange}
                className="w-full bg-transparent text-gray-900 text-right font-semibold text-[14px] sm:text-[15px] block pr-3 py-2 sm:py-2.5 outline-none"
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-4 space-y-2.5">
            <button
              onClick={handleLancarViagem}
              className="w-full flex items-center justify-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white py-3 sm:py-3.5 rounded-[12px] font-bold text-[13px] sm:text-[14px] transition-all active:scale-[0.99] shadow-[0_4px_14px_rgba(37,99,235,0.25)]"
            >
              <Send size={16} className="-mt-0.5" />
              LANÇAR VIAGEM
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-center gap-2 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 py-3 sm:py-3.5 rounded-[12px] font-bold text-[13px] sm:text-[14px] transition-all active:scale-[0.99]"
            >
              <Clock size={16} />
              HISTÓRICO DE VIAGENS
            </button>
          </div>
        </div>
      </div>
      
      {/* Historico Modal-like or expanded section */}
      {showHistory && (
        <div className="bg-white border border-gray-200 shadow-sm sm:rounded-[20px] rounded-2xl p-4 sm:p-5 mt-4">
           <h3 className="text-[13px] font-bold text-gray-900 mb-3 flex items-center gap-2 border-b border-gray-100 pb-2.5">
             <Clock size={16} className="text-gray-400" /> Histórico
           </h3>
           <div className="text-[13px] text-gray-500 text-center py-5 font-medium">
             Sem histórico disponível nesta sessão (Mocked)
           </div>
        </div>
      )}
    </div>
  );
}
