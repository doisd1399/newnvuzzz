import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../context/AppContext";
import {
  ArrowLeft,
  MapPin,
  UploadCloud,
  Send,
  Clock,
  User,
  ClipboardList,
  Truck,
  Package,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { uploadFile } from "../../services/uploadService";

import { db } from "../../lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

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

  // ==============================
  // UPLOAD FIREBASE STORAGE
  // ==============================
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 5MB.");
      return;
    }

    setIsUploading(true);

    try {
      console.log("🔥 UPLOAD FIREBASE START");

      const result = await uploadFile(
        file,
        activeCompanyId || "geral",
        "viagens",
        currentUser.id
      );

      console.log("✅ UPLOAD OK:", result);

      setImagePreview(result.url);
    } catch (err) {
      console.error("❌ Upload error:", err);
      alert("Erro ao enviar imagem. Tente novamente.");
    } finally {
      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // ==============================
  // SALVAR VIAGEM NO FIRESTORE
  // ==============================
  const handleLancarViagem = async () => {
    if (!origem || !destino || !valor || !imagePreview) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    try {
      console.log("🔥 SALVANDO VIAGEM NO FIRESTORE...");

      const tripData = {
        origem,
        destino,
        valor: parseFloat(valor.replace(/\D/g, "")) / 100,
        imageUrl: imagePreview,

        empresaId: activeCompanyId || "geral",
        driverId: currentUser.id,

        contractId: activeJob?.contractId || null,
        vehicleId: activeJob?.vehicleId || null,
        trailerId: activeJob?.trailerId || null,

        status: "pending",

        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "trips"), tripData);

      console.log("✅ VIAGEM SALVA ID:", docRef.id);

      alert("Viagem lançada com sucesso!");

      setOrigem("");
      setDestino("");
      setValor("");
      setImagePreview(null);
    } catch (err) {
      console.error("❌ Erro ao salvar viagem:", err);
      alert("Erro ao lançar viagem. Tente novamente.");
    }
  };

  const formatCurrency = (value: string) => {
    let digits = value.replace(/\D/g, "");
    if (!digits) return "";

    const numberValue = parseInt(digits, 10) / 100;

    return numberValue.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValor(formatCurrency(e.target.value));
  };

  const currentDeliveries = activeJob ? activeJob.progress : 0;
  const totalDeliveries = activeContract
    ? activeContract.totalDeliveries
    : 6;

  const driverName = currentUser.name || "Motorista não identificado";
  const contractName = activeContract?.name || "Nenhum contrato ativo";
  const vehicleName = activeVehicle?.name || "Nenhum";
  const trailerName = activeTrailer?.name || "Nenhum";

  const companyLogo = currentCompany?.logoUrl || "";
  const companyName =
    currentCompany?.fleetName ||
    currentCompany?.companyName ||
    "Empresa";

  const cnpj = currentCompany?.cnpj || "00.000.000/0000-00";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 pb-10 px-0 sm:px-4 text-gray-900 font-sans tracking-[-0.01em]">
      {/* HEADER */}
      <div className="flex items-center gap-2 py-1 px-2">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>

        <div>
          <h1 className="text-[16px] font-bold">Lançar Viagem</h1>
          <p className="text-[12px] text-gray-500">
            Registre os dados da entrega
          </p>
        </div>
      </div>

      {/* FORM */}
      <div className="bg-white border rounded-2xl p-4">

        <input
          placeholder="Origem"
          value={origem}
          onChange={(e) => setOrigem(e.target.value)}
          className="w-full border p-2 rounded mb-3"
        />

        <input
          placeholder="Destino"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          className="w-full border p-2 rounded mb-3"
        />

        {/* UPLOAD */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={handleImageUpload}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="bg-blue-500 text-white px-3 py-2 rounded mb-3"
        >
          {isUploading ? "Enviando..." : "Enviar imagem"}
        </button>

        {imagePreview && (
          <img src={imagePreview} className="w-full rounded mb-3" />
        )}

        <input
          placeholder="Valor"
          value={valor}
          onChange={handleValorChange}
          className="w-full border p-2 rounded mb-3 text-right"
        />

        <button
          onClick={handleLancarViagem}
          className="w-full bg-green-600 text-white p-3 rounded"
        >
          LANÇAR VIAGEM
        </button>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full mt-2 border p-3 rounded"
        >
          HISTÓRICO
        </button>

        {showHistory && (
          <div className="text-sm text-gray-500 mt-3">
            Sem histórico disponível
          </div>
        )}
      </div>
    </div>
  );
}
