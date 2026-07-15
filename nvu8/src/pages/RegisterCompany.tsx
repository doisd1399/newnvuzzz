import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../context/AppContext";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { db, storage, auth } from "../lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { toast } from "sonner";
import { Upload, ImageIcon, X, ArrowLeft, CheckCircle2 } from "lucide-react";

const generateCNPJ = () => {
  const randomNum = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;
  return `${randomNum(10, 99)}.${randomNum(100, 999)}.${randomNum(100, 999)}/0001-${randomNum(10, 99)}`;
};

export default function RegisterCompany() {
  const navigate = useNavigate();
  const { currentUser, logOutApp } = useAppStore();

  const [formData, setFormData] = useState({
    companyName: "",
    ownerName: "",
    email: "",
    whatsapp: "",
    cnpj: "",
    simulatorName: "",
    photoURL: "", // This will be logoUrl in SeniorPanel mapping
    ownerPhotoUrl: "",
  });

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [ownerPhotoPreview, setOwnerPhotoPreview] = useState<string | null>(
    null,
  );
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setFormData((prev) => ({
        ...prev,
        ownerName: prev.ownerName || currentUser.name || "",
        email: prev.email || currentUser.email || "",
        whatsapp: prev.whatsapp || currentUser.whatsapp || "",
        cnpj: prev.cnpj || generateCNPJ(),
        ownerPhotoUrl:
          prev.ownerPhotoUrl ||
          currentUser.photoURL ||
          currentUser.avatar ||
          "",
      }));
      setOwnerPhotoPreview(currentUser.photoURL || currentUser.avatar || null);
    } else {
      setFormData((prev) => ({ ...prev, cnpj: prev.cnpj || generateCNPJ() }));
    }
  }, [currentUser]);

  const handleImageSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    isOwnerPhoto: boolean = false,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 500;
        const MAX_HEIGHT = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        if (isOwnerPhoto) {
          setOwnerPhotoPreview(dataUrl);
        } else {
          setPhotoPreview(dataUrl);
        }
      };
    };
  };

  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let uploadedPhotoUrl = formData.photoURL;
      let uploadedOwnerPhotoUrl = formData.ownerPhotoUrl;

      if (photoPreview && photoPreview.startsWith("data:image")) {
        setUploadingImage(true);
        try {
          const imageRef = ref(
            storage,
            `empresas/company_registrations/recruitment_photos/${Date.now()}_logo.jpg`,
          );
          const uploadPromise = uploadString(
            imageRef,
            photoPreview,
            "data_url",
          );
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 8000),
          );
          await Promise.race([uploadPromise, timeoutPromise]);
          uploadedPhotoUrl = await getDownloadURL(imageRef);
        } catch (uploadError) {
          console.warn(
            "Falha no upload da foto. Usando foto padrão.",
            uploadError,
          );
          uploadedPhotoUrl = formData.photoURL;
        } finally {
          setUploadingImage(false);
        }
      }

      if (ownerPhotoPreview && ownerPhotoPreview.startsWith("data:image")) {
        setUploadingImage(true);
        try {
          const imageRef = ref(
            storage,
            `empresas/company_registrations/recruitment_photos/${Date.now()}_owner.jpg`,
          );
          const uploadPromise = uploadString(
            imageRef,
            ownerPhotoPreview,
            "data_url",
          );
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 8000),
          );
          await Promise.race([uploadPromise, timeoutPromise]);
          uploadedOwnerPhotoUrl = await getDownloadURL(imageRef);
        } catch (uploadError) {
          console.warn(
            "Falha no upload da foto do proprietário. Usando foto padrão.",
            uploadError,
          );
          uploadedOwnerPhotoUrl = formData.ownerPhotoUrl;
        } finally {
          setUploadingImage(false);
        }
      }

      await addDoc(collection(db, "recruitment_applications"), {
        ...formData,
        userId: currentUser?.id || auth.currentUser?.uid || "",
        type: "company_registration",
        photoURL: uploadedPhotoUrl || "",
        ownerPhotoUrl:
          uploadedOwnerPhotoUrl ||
          currentUser?.photoURL ||
          currentUser?.avatar ||
          "",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      setIsSubmitted(true);
    } catch (error: any) {
      toast.error("Erro ao enviar solicitação: " + error.message);
    } finally {
      setSubmitting(false);
      setUploadingImage(false);
    }
  };

  const handleCancel = async () => {
    if (auth.currentUser) {
      await logOutApp();
    }
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex flex-col items-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-[440px] my-auto py-8">
        <div className="relative mb-6">
          {!isSubmitted && (
            <button
              type="button"
              onClick={handleCancel}
              className="absolute left-0 top-1/2 -translate-y-1/2 p-2 w-10 h-10 text-slate-500 hover:text-slate-900 dark:text-[#a1a1aa] dark:hover:text-white transition-colors bg-white dark:bg-[#1A1F26] rounded-full border border-slate-200 dark:border-[#2A2F3A] shadow-sm flex items-center justify-center group"
              title="Voltar para a tela anterior"
            >
              <ArrowLeft
                size={18}
                className="group-hover:-translate-x-0.5 transition-transform"
              />
            </button>
          )}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-[#fafafa] tracking-tight mb-1">
              NVU
            </h1>
            <p className="text-slate-500 dark:text-[#a1a1aa] text-sm font-medium">
              Cadastro de Nova Empresa
            </p>
          </div>
        </div>

        <Card className="rounded-[24px] border border-slate-200/60 dark:border-[#2A2F3A] shadow-xl shadow-slate-200/40 dark:shadow-none bg-white dark:bg-[#1A1F26] overflow-hidden">
          <CardContent className="p-5 sm:p-7">
            {isSubmitted ? (
              <div className="flex flex-col items-center text-center py-8">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-2xl flex items-center justify-center mb-6">
                  <CheckCircle2
                    size={36}
                    className="text-emerald-500 dark:text-emerald-400"
                  />
                </div>
                <h2 className="text-[20px] font-bold text-slate-900 dark:text-[#fafafa] mb-3 tracking-tight">
                  Cadastro Enviado
                </h2>
                <p className="text-slate-500 dark:text-[#a1a1aa] mb-8 text-[15px] leading-relaxed">
                  Sua solicitação de cadastro foi enviada com sucesso e está
                  aguardando aprovação.
                  <br />
                  <br />
                  Você receberá um contato assim que sua empresa for aprovada.
                </p>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className="w-full h-12 rounded-xl text-[15px] font-semibold text-slate-600 dark:text-[#f4f4f5] hover:text-slate-900 dark:hover:text-[#fafafa]"
                >
                  Voltar para o Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center gap-4 bg-slate-50/50 dark:bg-[#18181b] p-3.5 rounded-2xl border border-slate-200 dark:border-[#2A2F3A]/60 w-full mb-1">
                  <div className="relative group shrink-0">
                    {photoPreview ? (
                      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white dark:border-[#2A2F3A] shadow-sm relative">
                        <img
                          src={photoPreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <label className="cursor-pointer text-white p-2">
                            <Upload size={16} />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleImageSelect(e, false)}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="w-14 h-14 rounded-full bg-slate-100 dark:bg-[#2A2F3A] border border-dashed border-slate-300 dark:border-[#3f3f46] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-200 dark:hover:bg-[#3f3f46] transition-colors">
                        <ImageIcon
                          size={18}
                          className="text-slate-400 dark:text-[#71717a]"
                        />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageSelect(e, false)}
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[14px] font-semibold text-slate-800 dark:text-[#d4d4d8] mb-0.5">
                      Logo da Empresa
                    </label>
                    {photoPreview ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoPreview(null);
                          setFormData((f) => ({ ...f, photoURL: "" }));
                        }}
                        className="text-rose-500 hover:text-rose-600 text-[12px] font-medium flex items-center gap-1 transition-colors"
                      >
                        Remover foto
                      </button>
                    ) : (
                      <p className="text-[12px] text-slate-500 dark:text-[#a1a1aa] truncate">
                        Envie uma imagem opcional
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-slate-50/50 dark:bg-[#18181b] p-3.5 rounded-2xl border border-slate-200 dark:border-[#2A2F3A]/60 w-full mb-1">
                  <div className="relative group shrink-0">
                    {ownerPhotoPreview ? (
                      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white dark:border-[#2A2F3A] shadow-sm relative">
                        <img
                          src={ownerPhotoPreview}
                          alt="Owner Preview"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <label className="cursor-pointer text-white p-2">
                            <Upload size={16} />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleImageSelect(e, true)}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="w-14 h-14 rounded-full bg-slate-100 dark:bg-[#2A2F3A] border border-dashed border-slate-300 dark:border-[#3f3f46] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-200 dark:hover:bg-[#3f3f46] transition-colors">
                        <ImageIcon
                          size={18}
                          className="text-slate-400 dark:text-[#71717a]"
                        />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageSelect(e, true)}
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[14px] font-semibold text-slate-800 dark:text-[#d4d4d8] mb-0.5">
                      Foto do Proprietário
                    </label>
                    {ownerPhotoPreview ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOwnerPhotoPreview(null);
                          setFormData((f) => ({ ...f, ownerPhotoUrl: "" }));
                        }}
                        className="text-rose-500 hover:text-rose-600 text-[12px] font-medium flex items-center gap-1 transition-colors"
                      >
                        Remover foto
                      </button>
                    ) : (
                      <p className="text-[12px] text-slate-500 dark:text-[#a1a1aa] truncate">
                        Entrará no seu perfil de motorista
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-[#d4d4d8] mb-1.5 ml-0.5">
                    Nome da Empresa
                  </label>
                  <input
                    required
                    value={formData.companyName}
                    onChange={(e) =>
                      setFormData({ ...formData, companyName: e.target.value })
                    }
                    className="w-full bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-4 h-12 text-[15px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-[#fafafa] transition-all shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-[#d4d4d8] mb-1.5 ml-0.5">
                    Nome do Proprietário
                  </label>
                  <input
                    required
                    value={formData.ownerName}
                    onChange={(e) =>
                      setFormData({ ...formData, ownerName: e.target.value })
                    }
                    className="w-full bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-4 h-12 text-[15px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-[#fafafa] transition-all shadow-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 dark:text-[#d4d4d8] mb-1.5 ml-0.5">
                      Email
                    </label>
                    <input
                      required
                      type="email"
                      inputMode="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="w-full bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-4 h-12 text-[15px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-[#fafafa] transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 dark:text-[#d4d4d8] mb-1.5 ml-0.5">
                      WhatsApp
                    </label>
                    <input
                      required
                      type="tel"
                      inputMode="tel"
                      value={formData.whatsapp}
                      onChange={(e) =>
                        setFormData({ ...formData, whatsapp: e.target.value })
                      }
                      className="w-full bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-4 h-12 text-[15px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-[#fafafa] transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 dark:text-[#d4d4d8] mb-1.5 ml-0.5">
                      CNPJ{" "}
                      <span className="font-normal opacity-70">
                        (Automático)
                      </span>
                    </label>
                    <input
                      required
                      disabled
                      value={formData.cnpj}
                      onChange={(e) =>
                        setFormData({ ...formData, cnpj: e.target.value })
                      }
                      className="w-full bg-slate-50 dark:bg-[#09090b]/50 border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-4 h-12 text-[15px] text-slate-500 dark:text-[#a1a1aa] cursor-not-allowed shadow-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 dark:text-[#d4d4d8] mb-1.5 ml-0.5">
                      Simulador
                    </label>
                    <select
                      required
                      value={formData.simulatorName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          simulatorName: e.target.value,
                        })
                      }
                      className="w-full bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-4 h-12 text-[15px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-[#fafafa] transition-all shadow-sm appearance-none cursor-pointer"
                    >
                      <option value="" disabled>
                        Selecione...
                      </option>
                      <option value="Wtds">Wtds</option>
                      <option value="Wbds">Wbds</option>
                      <option value="Gto">Gto</option>
                      <option value="Toe 3">Toe 3</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <Button
                    type="button"
                    onClick={handleCancel}
                    variant="outline"
                    className="w-full sm:w-1/3 rounded-xl h-12 text-[15px] font-semibold border-slate-200 dark:border-[#2A2F3A]"
                  >
                    Cancelar
                  </Button>
                  <Button
                    disabled={submitting}
                    type="submit"
                    className="w-full sm:w-2/3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl h-12 text-[15px] font-bold shadow-sm transition-all"
                  >
                    {submitting ? "Enviando..." : "Enviar Solicitação"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
