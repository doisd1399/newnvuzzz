import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { useAppStore } from "../../context/AppContext";
import {
  ArrowLeft,
  MapPin,
  UploadCloud,
  Send,
  Clock,
  CheckCircle2,
  User,
  ClipboardList,
  Truck,
  Package,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { db } from "../../lib/firebase";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot
} from "firebase/firestore";
import { toast } from "sonner";
import { uploadService } from "../../services/uploadService";
import { TripsRepository } from "../../repositories/TripsRepository";

const generateImageHash = async (file: File): Promise<string> => {
  if (!window.crypto || !window.crypto.subtle) {
    return file.name + file.size + file.lastModified;
  }
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

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
    memberships,
  } = useAppStore();

  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [uploadLocation, setUploadLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [uploadCountMinute, setUploadCountMinute] = useState<number[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;

  useEffect(() => {
    let id = localStorage.getItem("deviceId");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      localStorage.setItem("deviceId", id);
    }
    setDeviceId(id);
  }, []);

  const currentCompany = companies.find((c) => c.id === activeCompanyId);

  const driverMembership = memberships?.find(
    (m) =>
      m.companyId === activeCompanyId &&
      m.userId === currentUser?.id &&
      m.status === "active",
  );
  const isAdmin =
    currentUser?.role === "admin" ||
    (driverMembership && driverMembership.roles.includes("admin"));

  // Find active job in the current company context
  const validActiveJobs = jobs.filter(
    (j) =>
      j.driverId === currentUser?.id &&
      j.companyId === activeCompanyId &&
      (j.status === "active" || j.status === "completed" || j.status === "awaiting_completion") &&
      contracts.some(
        (c) => c.companyId === activeCompanyId && c.id === j.contractId,
      ),
  );

  validActiveJobs.sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;

    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  const activeJob = validActiveJobs[0];
  const activeContract = activeJob
    ? contracts.find(
        (c) => c.id === activeJob.contractId && c.companyId === activeCompanyId,
      )
    : null;

  const predefinedRoutes = activeContract?.mode === "detailed" && activeContract.deliveries && activeContract.deliveries.length > 0 ? activeContract.deliveries : null;
  const currentRouteIndex = activeJob ? (activeJob.progress || 0) : 0;
  
  const isContractCompletedState = predefinedRoutes && currentRouteIndex >= predefinedRoutes.length;
  const currentPredefinedRoute = (predefinedRoutes && !isContractCompletedState) ? predefinedRoutes[currentRouteIndex] : null;

  useEffect(() => {
    if (activeJob?.status === "awaiting_completion" && !isUploading) {
      // The operation was marked as awaiting_completion by a recent upload.
      // Redirect to the operational dashboard seamlessly.
      navigate("/driver/profile", { replace: true });
    }
  }, [activeJob?.status, isUploading, navigate]);

  useEffect(() => {
    if (currentPredefinedRoute) {
      if (origem !== currentPredefinedRoute.origin) setOrigem(currentPredefinedRoute.origin);
      if (destino !== currentPredefinedRoute.destination) setDestino(currentPredefinedRoute.destination);
    }
  }, [currentPredefinedRoute, origem, destino]);

  if (!currentUser) return null;

  if (!currentCompany) {
    return (
      <div className="w-full text-center py-10">
        <p className="text-gray-500 dark:text-gray-400">
          Selecione uma empresa e simulador para acessar o lançamento de
          viagens.
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-4 text-blue-600 dark:text-blue-400 underline text-sm hover:text-blue-700 dark:hover:text-blue-300"
        >
          Voltar
        </button>
      </div>
    );
  }

  // Check if user is linked to this context
  if (!driverMembership && !isAdmin) {
    return (
      <div className="w-full text-center py-10">
        <p className="text-gray-500 dark:text-gray-400">
          Você não possui vínculo ativo com esta empresa/simulador.
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-4 text-blue-600 dark:text-blue-400 underline text-sm hover:text-blue-700 dark:hover:text-blue-300"
        >
          Voltar
        </button>
      </div>
    );
  }


  // Protect route
  if ((!activeJob || !activeContract) || ((activeJob.status === "completed" || activeJob.status === "awaiting_completion") && !isUploading && !isNavigating)) {
    // Only admins or something? Wait, admins can't launch trips for themselves unless they have an active contract here.
    return (
      <div className="w-full text-center py-10 px-4">
        <div className="max-w-md mx-auto bg-white dark:bg-[#1A1F26] p-6 rounded-2xl border border-gray-100 dark:border-[#2A2F3A] shadow-sm">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <X size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Acesso Bloqueado
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-left space-y-2">
            <strong>Inicie uma operação para lançar viagens.</strong>
            <br/><br/>
            1. Receba um contrato.<br/>
            2. Inicie o contrato.<br/>
            3. Após iniciar a operação você poderá registrar suas viagens.
          </p>
          <button
            onClick={() => navigate("/driver/profile")}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
          >
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  const activeVehicle =
    activeJob && activeJob.vehicleId
      ? vehicles.find(
          (v) =>
            v.id === activeJob.vehicleId && v.companyId === activeCompanyId,
        )
      : null;
  const activeTrailerId = activeJob?.trailerId || activeContract?.trailerId;
  const activeTrailer = activeTrailerId
    ? trailers.find(
        (t) => t.id === activeTrailerId && t.companyId === activeCompanyId,
      )
    : null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const now = Date.now();
      const recentUploads = uploadCountMinute.filter(time => now - time < 60000);
      
      if (recentUploads.length >= 3) {
        toast.error("Limite de uploads atingido. Aguarde um minuto.");
        return;
      }
      if (recentUploads.length > 0 && now - recentUploads[recentUploads.length - 1] < 5000) {
        toast.error("Aguarde 5 segundos entre envios.");
        return;
      }

      const localPreviewUrl = URL.createObjectURL(file);
      setImagePreview(localPreviewUrl);
      setIsUploading(true);
      setUploadProgress(0);

      try {
        const hash = await generateImageHash(file);
        
        const isDuplicate = await TripsRepository.checkImageHash(hash);
        
        if (isDuplicate) {
          toast.error("Esta imagem já foi utilizada em um lançamento anterior.");
          setIsUploading(false);
          setImagePreview(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        const url = await uploadService.uploadImage({
          file,
          companyId: currentCompany?.id || "Geral",
          userId: currentUser.id,
          folder: "receipts",
          onProgress: (progress) => {
            setUploadProgress(progress);
          }
        });

        setUploadCountMinute([...recentUploads, now]);
        setImageHash(hash);
        setImagePreview(url);
        toast.success("Comprovante pronto para envio!", { position: "top-center" });
      } catch (err: any) {
        console.error("Upload error:", err);
        setImagePreview(null);
        toast.error(
          `Falha no envio da imagem. Tente novamente. ${err.message}`,
        );
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    }
  };

  const handleLancarViagem = async () => {
    if (isContractCompletedState) {
      toast.error("Este contrato já foi 100% concluído. Volte ao painel e finalize a operação.");
      return;
    }
    
    const finalOrigem = currentPredefinedRoute ? currentPredefinedRoute.origin : origem;
    const finalDestino = currentPredefinedRoute ? currentPredefinedRoute.destination : destino;

    if (!finalOrigem || !finalDestino || !valor || !imagePreview) {
      toast.error("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    if (!activeJob) {
      toast.error("Nenhuma operação iniciada encontrada. Inicie uma operação antes de lançar viagens.");
      return;
    }

    setIsUploading(true);

    try {
      // 6. Backend validation check
      const jobDocRef = doc(db, "trabalhos", activeJob.id);
      const jobDocSnap = await getDoc(jobDocRef);
      if (!jobDocSnap.exists() || jobDocSnap.data()?.status !== "active") {
        setIsUploading(false);
        toast.error("Operação não está ativa no servidor. Inicie a operação e tente novamente.");
        return;
      }

      const valorNumerico = parseFloat(valor.replace(/\D/g, "")) / 100;

      const data: any = {
        empresaId: currentCompany?.id || "Geral",
        empresaNome: currentCompany?.companyName || "Geral",
        simuladorNome: currentCompany?.simulatorName || "Geral", // Save simulator
        motoristaId: currentUser.id,
        motoristaNome: currentUser.name,

        contratoId: activeContract?.id || "",
        contratoNumero: activeContract?.name || "",
        contratoDescricao: "",

        veiculoId: activeVehicle?.id || "",
        veiculoNome: activeVehicle ? `${activeVehicle.name || ""}`.trim() : "",
        veiculoPlaca: activeVehicle?.plate || "",

        reboqueId: activeTrailer?.id || "",
        reboqueNome: activeTrailer ? `${activeTrailer.name || ""}`.trim() : "",

        origem: finalOrigem,
        destino: finalDestino,
        valor: valorNumerico,
        comprovanteUrl: imagePreview,
        status: "concluida",
        criadoPor: currentUser.id,
        dataLancamento: new Date(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        
        // Audit fields
        imageHash: imageHash,
        deviceId: deviceId,
        uploadedAt: serverTimestamp(),
        uploadedBy: currentUser.id,
        contractId: activeContract?.id || "",
        jobId: activeJob?.id || "",
      };

      if (uploadLocation) {
        data.uploadLocation = uploadLocation;
      }

      const docRef = await TripsRepository.addTrip(data);
      
      // Save tripId inside doc
      await updateDoc(docRef, { tripId: docRef.id });

      if (activeJob && activeContract) {
        const jobRef = doc(db, "trabalhos", activeJob.id);
        const newProgress = (activeJob.progress || 0) + 1;
        
        const updates: any = { progress: newProgress };
        
        if (activeJob.status === "pending") {
          updates.status = "active";
        }
        
        if (newProgress >= activeContract.totalDeliveries) {
          updates.status = "awaiting_completion"; // Keep the session alive until user confirms
        }
        
        await updateDoc(jobRef, updates);
      }

      toast.success("Viagem lançada com sucesso!");
      setOrigem("");
      setDestino("");
      setValor("");
      setImagePreview(null);
      setImageHash(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setIsNavigating(true);
      // Let the useEffect handle the navigation if the job is awaiting_completion
      if (activeJob && activeContract && (((activeJob.progress || 0) + 1) < activeContract.totalDeliveries)) {
         navigate("/driver/history");
      }
    } catch (err: any) {
      console.error("Erro ao salvar viagem:", err);
      toast.error("Ocorreu um erro ao salvar a viagem. Tente novamente.");
    } finally {
      setIsUploading(false);
    }
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
  const companyName = currentCompany?.companyName || "Empresa";
  const cnpj = currentCompany?.cnpj || "00.000.000/0000-00";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3 pb-6 px-0 sm:px-4 text-gray-900 dark:text-gray-100 font-sans tracking-[-0.01em]">
      {/* Top Header */}
      <div className="flex items-center gap-2 py-1 px-2">
        <button
          onClick={() => navigate(-1)}
          className="p-1 -ml-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors bg-transparent border-none outline-none appearance-none cursor-pointer flex items-center justify-center shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex flex-col min-w-0">
          <h1 className="text-[16px] sm:text-[17px] font-bold text-gray-900 dark:text-white tracking-tight leading-none mb-0.5">
            Lançar Viagem
          </h1>
          <p className="text-[11px] sm:text-[12px] text-gray-500 dark:text-gray-400 font-medium leading-none">
            Registre os dados da entrega realizada.
          </p>
        </div>
      </div>

      {/* Main Info Card */}
      <div className="bg-white dark:bg-[#121213] border border-gray-100 dark:border-gray-800 shadow-[0_2px_12px_rgba(0,0,0,0.03)] sm:rounded-2xl rounded-xl overflow-hidden">
        <div className="p-3 sm:p-4">
          {/* Company Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#1BACB3] font-bold text-white tracking-tighter text-lg rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="w-full h-full object-cover"
                />
              ) : (
                companyName.substring(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 leading-tight">
                <h2 className="text-[14px] sm:text-[15px] font-bold text-gray-900 dark:text-white truncate">
                  {companyName}
                </h2>
                <div className="text-blue-600 dark:text-blue-400 shrink-0">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M10.603 2.5029L12.0005 1L13.3981 2.5029L15.4223 2.76632L16.2928 4.63665L18.2568 5.43859L18.4237 7.49479L20.0076 8.86874L19.5539 10.8711L20.5962 12.5693L19.5539 14.2675L20.0076 16.2699L18.4237 17.6439L18.2568 19.7001L16.2928 20.502L15.4223 22.3723L13.3981 22.6357L12.0005 24.1386L10.603 22.6357L8.5788 22.3723L7.70823 20.502L5.74426 19.7001L5.57732 17.6439L3.99346 16.2699L4.44716 14.2675L3.40483 12.5693L4.44716 10.8711L3.99346 8.86874L5.57732 7.49479L5.74426 5.43859L7.70823 4.63665L8.5788 2.76632L10.603 2.5029ZM11.085 14.9453L16.3263 9.70404L14.9121 8.28983L11.085 12.1169L9.00694 10.0388L7.59273 11.453L11.085 14.9453Z" />
                  </svg>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium mt-0.5 truncate">
                CNPJ {cnpj}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-2.5 gap-x-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-800 flex items-center justify-center shrink-0 text-gray-400 dark:text-gray-500">
                <User size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium leading-none mb-0.5">
                  Motorista
                </p>
                <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate leading-none">
                  {driverName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-800 flex items-center justify-center shrink-0 text-gray-400 dark:text-gray-500">
                <ClipboardList size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium leading-none mb-0.5">
                  Contrato
                </p>
                <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate leading-none">
                  {contractName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-800 flex items-center justify-center shrink-0 text-gray-400 dark:text-gray-500">
                <Truck size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium leading-none mb-0.5">
                  Veículo
                </p>
                <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate leading-none">
                  {vehicleName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-800 flex items-center justify-center shrink-0 text-gray-400 dark:text-gray-500">
                <Package size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium leading-none mb-0.5">
                  Reboque
                </p>
                <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate leading-none">
                  {trailerName}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Card Section */}
        <div className="px-3 py-2 bg-gray-50/80 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="text-blue-500 dark:text-blue-400">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="20" x2="12" y2="10" />
                <line x1="18" y1="20" x2="18" y2="4" />
                <line x1="6" y1="20" x2="6" y2="16" />
              </svg>
            </div>
            <span className="font-semibold text-[12px] text-gray-800 dark:text-gray-200">
              Viagens
            </span>
          </div>
          <div className="font-bold text-[13px] text-gray-900 dark:text-white">
            <span className="text-blue-600 dark:text-blue-400">
              {currentDeliveries}
            </span>
            <span className="text-gray-400 dark:text-gray-500">
              /{totalDeliveries}
            </span>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white dark:bg-[#121213] border border-gray-200/80 dark:border-gray-800 shadow-[0_4px_24px_rgba(0,0,0,0.02)] sm:rounded-2xl rounded-xl p-3 sm:p-4 relative">
        <div className="space-y-3">
          {predefinedRoutes ? (
            <div>
              <label className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 mb-1 block">
                1. Rota*
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500 z-10">
                  <MapPin size={14} />
                </div>
                <div className="w-full min-h-9 px-3 py-1.5 pl-8 bg-gray-50 dark:bg-[#1A1F26]/50 border border-gray-200 dark:border-gray-800 text-[13px] rounded-lg cursor-not-allowed opacity-90 truncate flex items-center">
                  {isContractCompletedState ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">Contrato 100% concluído</span>
                  ) : (
                    currentPredefinedRoute ? (
                      <span className="truncate">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {`Viagem ${currentRouteIndex + 1}/${predefinedRoutes.length}`}
                        </span>
                        <span className="text-gray-600 dark:text-gray-300 font-medium ml-1.5">
                           • {currentPredefinedRoute.origin} ➔ {currentPredefinedRoute.destination}
                        </span>
                      </span>
                    ) : (
                      "Carregando..."
                    )
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 1. Origem */}
              <div>
                <label className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 mb-1 block">
                  1. Origem*
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                    <MapPin size={14} />
                  </div>
                  <input
                    type="text"
                    value={origem}
                    onChange={(e) => setOrigem(e.target.value)}
                    className="w-full h-9 bg-white dark:bg-[#1A1F26] border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-100 text-[13px] rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block pl-8 pr-3 py-1.5 transition-colors outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    placeholder="Ex.: Curitiba - PR"
                  />
                </div>
              </div>

              {/* 2. Destino */}
              <div>
                <label className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 mb-1 block">
                  2. Destino*
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                    <MapPin size={14} />
                  </div>
                  <input
                    type="text"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    className="w-full h-9 bg-white dark:bg-[#1A1F26] border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-100 text-[13px] rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block pl-8 pr-3 py-1.5 transition-colors outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    placeholder="Ex.: São Paulo - SP"
                  />
                </div>
              </div>
            </>
          )}

          {/* Comprovante */}
          <div>
            <label className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 mb-1 block">
              {predefinedRoutes ? "2" : "3"}. Comprovante da Entrega*
            </label>
            <div className="flex items-center flex-wrap gap-2 mb-2">
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
                className={cn(
                  "flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 text-[12px] font-semibold h-8 px-3 rounded-lg transition-colors",
                  isUploading
                    ? "opacity-50 cursor-not-allowed"
                    : "active:scale-[0.98]",
                )}
              >
                <UploadCloud
                  size={14}
                  className={isUploading ? "animate-pulse" : ""}
                />
                {isUploading ? "Enviando..." : "Enviar imagem"}
              </button>
            </div>

            {imagePreview && (
              <div className="mt-2 space-y-1.5 transition-all">
                <div className="flex justify-end">
                  <button
                    disabled={isUploading}
                    onClick={() => {
                      setImagePreview(null);
                      setImageHash(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-medium py-1 px-2 rounded-full transition-colors",
                      isUploading 
                       ? "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed opacity-50"
                       : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                    )}
                  >
                    <X size={10} className="stroke-[2.5]" />
                    <span>Remover</span>
                  </button>
                </div>
                <div className="w-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm relative z-0">
                  <PhotoProvider>
                    <PhotoView src={imagePreview}>
                      <img
                        src={imagePreview}
                        alt="Prévia do comprovante"
                        className={cn("w-full h-auto max-h-[160px] object-cover sm:object-contain rounded-lg cursor-pointer transition-opacity", isUploading ? "opacity-70" : "opacity-100")}
                      />
                    </PhotoView>
                  </PhotoProvider>

                  {isUploading && (
                    <div className="absolute inset-x-0 bottom-0 bg-white/95 dark:bg-[#1A1F26]/95 backdrop-blur-md p-3 border-t border-gray-200/50 dark:border-gray-700/50 flex flex-col gap-1.5">
                       <div className="flex justify-between text-[10px] items-center text-blue-600 dark:text-blue-400 font-bold tracking-widest uppercase">
                         <span className="flex items-center gap-1.5"><UploadCloud size={12} className="animate-pulse" /> Enviando comprovante...</span>
                         <span>{uploadProgress.toFixed(0)}%</span>
                       </div>
                       <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300" 
                            style={{ width: `${Math.max(2, uploadProgress)}%` }}
                          />
                       </div>
                    </div>
                  )}

                  {!isUploading && imageHash && (
                    <div className="absolute bottom-2 right-2 bg-green-500/90 text-white text-[10px] px-2.5 py-1.5 rounded-lg font-semibold shadow-sm backdrop-blur-sm flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="stroke-[2.5]" />
                      Comprovante enviado com sucesso
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Valor */}
          <div className="pt-0.5">
            <label className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 mb-1 block">
              {predefinedRoutes ? "3" : "4"}. Valor ganho (R$)*
            </label>
            <div className="relative flex items-center border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-white dark:bg-[#1A1F26] focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-shadow h-9">
              <div className="px-3 py-1.5 border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 font-medium text-[13px] shrink-0">
                R$
              </div>
              <input
                type="text"
                value={valor}
                onChange={handleValorChange}
                className="w-full bg-transparent text-gray-900 dark:text-white text-right font-semibold text-[13px] block pr-3 py-1.5 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-2 space-y-2">
            <button
              onClick={handleLancarViagem}
              disabled={isContractCompletedState || isUploading}
              className={cn(
                "w-full h-10 flex items-center justify-center gap-1.5 rounded-lg font-bold text-[13px] transition-all active:scale-[0.99]",
                isContractCompletedState
                  ? "bg-gray-400 dark:bg-gray-700 text-white cursor-not-allowed"
                  : "bg-[#1f242d] hover:bg-[#2a303c] active:bg-[#151921] text-white dark:bg-slate-200 dark:hover:bg-slate-300 dark:text-slate-800 shadow-sm dark:shadow-none"
              )}
            >
              <Send size={14} className="-mt-0.5" />
              {isContractCompletedState ? "CONTRATO CONCLUÍDO" : (isUploading ? "ENVIANDO..." : "LANÇAR VIAGEM")}
            </button>
            <button
              onClick={() => navigate("/driver/history")}
              className="w-full h-10 flex items-center justify-center gap-1.5 bg-white dark:bg-[#121213] hover:bg-slate-50 dark:hover:bg-gray-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-gray-800 rounded-lg font-bold text-[13px] transition-all active:scale-[0.99]"
            >
              <Clock size={14} />
              HISTÓRICO DE VIAGENS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
