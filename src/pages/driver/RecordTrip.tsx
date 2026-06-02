import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../context/AppContext";
import {
  ArrowLeft,
} from "lucide-react";

import { db, storage } from "../../lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";

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
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;

  const currentCompany = companies.find(
    (c) => c.id === activeCompanyId
  );

  const activeJob = jobs.find(
    (j) =>
      j.driverId === currentUser.id &&
      ["pending", "active", "delayed"].includes(j.status)
  );

  const activeContract = activeJob
    ? contracts.find((c) => c.id === activeJob.contractId)
    : null;

  const activeVehicle = activeJob
    ? vehicles.find((v) => v.id === activeJob.vehicleId)
    : null;

  const activeTrailer = activeJob
    ? trailers.find((t) => t.id === activeJob.trailerId)
    : null;

  // ==============================
  // UPLOAD FIREBASE STORAGE (100% CLIENT SIDE)
  // ==============================
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Máximo 5MB");
      return;
    }

    try {
      setIsUploading(true);

      const path = `trips/${activeCompanyId}/${currentUser.id}/${Date.now()}_${file.name}`;

      const storageRef = ref(storage, path);

      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        null,
        (error) => {
          console.error(error);
          alert("Erro no upload");
          setIsUploading(false);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setImagePreview(url);
          setIsUploading(false);
        }
      );
    } catch (err) {
      console.error(err);
      setIsUploading(false);
    }
  };

  // ==============================
  // SALVAR VIAGEM NO FIRESTORE
  // ==============================
  const handleLancarViagem = async () => {
    if (!origem || !destino || !valor || !imagePreview) {
      alert("Preencha tudo");
      return;
    }

    try {
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

      await addDoc(collection(db, "trips"), tripData);

      alert("Viagem salva!");

      setOrigem("");
      setDestino("");
      setValor("");
      setImagePreview(null);
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar viagem");
    }
  };

  const formatCurrency = (value: string) => {
    let digits = value.replace(/\D/g, "");
    if (!digits) return "";

    const numberValue = parseInt(digits, 10) / 100;

    return numberValue.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
    });
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      {/* HEADER */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft />
        </button>

        <h1 className="font-bold">Lançar Viagem</h1>
      </div>

      {/* FORM */}
      <input
        placeholder="Origem"
        value={origem}
        onChange={(e) => setOrigem(e.target.value)}
        className="w-full border p-2 mb-2"
      />

      <input
        placeholder="Destino"
        value={destino}
        onChange={(e) => setDestino(e.target.value)}
        className="w-full border p-2 mb-2"
      />

      {/* UPLOAD */}
      <input
        type="file"
        hidden
        ref={fileInputRef}
        onChange={handleImageUpload}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        className="bg-blue-500 text-white p-2 w-full mb-2"
      >
        {isUploading ? "Enviando..." : "Upload comprovante"}
      </button>

      {imagePreview && (
        <img src={imagePreview} className="w-full mb-2" />
      )}

      <input
        placeholder="Valor"
        value={valor}
        onChange={(e) => setValor(formatCurrency(e.target.value))}
        className="w-full border p-2 mb-2 text-right"
      />

      <button
        onClick={handleLancarViagem}
        className="bg-green-600 text-white w-full p-3"
      >
        LANÇAR VIAGEM
      </button>
    </div>
  );
}
