import React, { useState } from "react";
import { X, Megaphone, Loader2 } from "lucide-react";
import { Button } from "../ui/Button";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "../../lib/firebase";
import { useSessionStore } from "../../context/AppContext";


function buildNewsSearchTokens(...values: unknown[]): string[] {
  const tokens = new Set<string>();
  values.forEach((value) => {
    const normalized = String(value || "")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return;
    if (normalized.length <= 120) tokens.add(normalized);
    normalized.split(" ").filter(Boolean).forEach((word) => {
      tokens.add(word);
      for (let length = 3; length <= word.length && length <= 18; length += 1) {
        tokens.add(word.slice(0, length));
      }
    });
  });
  return Array.from(tokens).slice(0, 120);
}

interface CreateNewsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateNewsModal({ isOpen, onClose }: CreateNewsModalProps) {
  const { currentUser } = useSessionStore();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("Atualização");
  const [visibility, setVisibility] = useState("publico");
  const [targetAudience, setTargetAudience] = useState("geral");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setError("Título e mensagem são obrigatórios.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await addDoc(collection(db, "noticias"), {
        tipo: "manual",
        categoria: category,
        titulo: title.trim(),
        mensagem: message.trim(),
        dataCriacao: serverTimestamp(),
        status: "publicado",
        origem: "senior",
        visibilidade: visibility,
        publicoAlvo: targetAudience,
        curtidasCount: 0,
        comentariosCount: 0,
        empresaId: "",
        empresaNome: "NVU Sênior",
        empresaLogo: "",
        autorId: currentUser?.id || "",
        autorNome: currentUser?.name || "Painel Sênior NVU",
        searchTokens: buildNewsSearchTokens(
          title.trim(),
          message.trim(),
          category,
          currentUser?.name,
          "NVU Sênior",
        ),
      });
      toast.success("Comunicado publicado na NVU News.");
      setTitle("");
      setMessage("");
      setCategory("Atualização");
      setVisibility("publico");
      setTargetAudience("geral");
      onClose();
    } catch (err: any) {
      console.error("[NVU NEWS] Erro ao criar comunicado:", err);
      setError("Não foi possível publicar o comunicado. Verifique as regras do Firestore.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={!isSubmitting ? onClose : undefined}
      />
      
      <div className="relative w-full max-w-lg bg-white dark:bg-[#18181b] rounded-2xl shadow-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <Megaphone size={20} className="text-blue-600 dark:text-blue-500" />
            <h2 className="text-lg font-semibold">Novo Comunicado</h2>
          </div>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[13px] rounded-lg">
              {error}
            </div>
          )}

          <form id="news-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Título
              </label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Nova atualização disponível"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#09090b] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Mensagem
              </label>
              <textarea 
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Detalhes do comunicado..."
                rows={4}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#09090b] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#09090b] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                >
                  <option value="Atualização">Atualização</option>
                  <option value="Comunicado">Comunicado Oficial</option>
                  <option value="Destaque">Destaque</option>
                </select>
              </div>
              
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Visibilidade
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#09090b] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                >
                  <option value="publico">Público</option>
                  <option value="privado">Privado</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Público-alvo
              </label>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#09090b] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
              >
                <option value="geral">Geral (Todos)</option>
                <option value="empresas">Apenas Empresas (Admins)</option>
                <option value="motoristas">Apenas Motoristas</option>
              </select>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900/20 flex justify-end gap-3">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            disabled={isSubmitting}
            className="border-slate-200 dark:border-slate-700"
          >
            Cancelar
          </Button>
          <Button 
            type="submit" 
            form="news-form"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "Publicar"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
