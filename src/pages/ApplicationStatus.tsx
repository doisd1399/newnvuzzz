import React from "react";
import { useNavigate } from "react-router-dom";
import { useActivityStore, useSessionStore } from "../context/AppContext";
import { Button } from "../components/ui/Button";
import { repairApprovedMembership } from "../services/recruitmentAccessService";
import { toast } from "sonner";
import {
  ShieldAlert,
  CheckCircle2,
  ArrowRight,
  ChevronLeft,
} from "lucide-react";

export default function ApplicationStatus() {
  const {
    currentUser,
    authInitialized,
    membershipsLoaded,
    sessionReady,
    memberships,
    logOutApp,
  } = useSessionStore();
  const { recruitmentApplications } = useActivityStore();
  const navigate = useNavigate();
  const [repairingAccess, setRepairingAccess] = React.useState(false);
  const repairAttemptedRef = React.useRef(false);

  const applicationTimestamp = (application: any) => {
    const raw =
      application.updatedAt ??
      application.createdAt ??
      application.dataHora ??
      application.submittedAt;
    if (!raw) return 0;
    if (typeof raw === "string") {
      const parsed = Date.parse(raw);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof raw?.toMillis === "function") return raw.toMillis();
    if (typeof raw?.seconds === "number") return raw.seconds * 1000;
    return 0;
  };

  // Uma inscrição pendente é sempre a situação operacional relevante. Se não
  // houver pendência, usa o registro mais recente para exibir aprovação/recusa.
  const myApp = React.useMemo(() => {
    const email = currentUser?.email?.trim().toLowerCase();
    const matchingApplications = recruitmentApplications
      .filter((application) => {
        const applicationEmail = application.email?.trim().toLowerCase();
        return (
          application.userId === currentUser?.id ||
          Boolean(email && applicationEmail === email)
        );
      })
      .sort((a, b) => applicationTimestamp(b) - applicationTimestamp(a));

    return (
      matchingApplications.find((application) => application.status === "pending") ??
      matchingApplications[0]
    );
  }, [currentUser?.email, currentUser?.id, recruitmentApplications]);

  const handleLogout = async () => {
    await logOutApp();
    navigate("/");
  };

  const handleApply = () => {
    navigate("/apply");
  };

  const handleContinueApproved = React.useCallback(async () => {
    if (repairingAccess) return;
    setRepairingAccess(true);
    try {
      await repairApprovedMembership();
      toast.success("Acesso sincronizado com sucesso.");
      // Recarrega a sessão para que os listeners de usuário e vínculo partam
      // de um estado limpo antes de entrar na seleção de perfil.
      window.location.replace("/select-profile");
    } catch (error: any) {
      console.error("[NVU Recruitment] Falha ao reparar acesso aprovado:", error);
      toast.error(
        error?.message ||
          "Não foi possível sincronizar seu acesso agora. Tente novamente em instantes.",
      );
      setRepairingAccess(false);
    }
  }, [repairingAccess]);

  React.useEffect(() => {
    if (
      myApp?.status === "approved" &&
      membershipsLoaded &&
      !memberships.some((membership) => membership.status === "active") &&
      !repairAttemptedRef.current
    ) {
      repairAttemptedRef.current = true;
      void handleContinueApproved();
    }
  }, [myApp?.status, membershipsLoaded, memberships, handleContinueApproved]);

  React.useEffect(() => {
    if (authInitialized && !currentUser) {
      navigate("/", { replace: true });
    } else if (sessionReady && currentUser && membershipsLoaded) {
      const hasActiveMembership = memberships.some((m) => m.status === "active");
      if (hasActiveMembership) {
        navigate("/select-profile", { replace: true });
      }
    }
  }, [sessionReady, currentUser, membershipsLoaded, memberships, navigate]);

  if (!sessionReady || !currentUser || !membershipsLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#09090b]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800 dark:border-slate-400"></div>
      </div>
    );
  }

  const isRejected = myApp?.status === "rejected";
  const isPending = myApp?.status === "pending";
  const isApproved = myApp?.status === "approved";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-[#fafafa] tracking-tight mb-2">
            NVU
          </h1>
          <p className="text-slate-500 dark:text-[#a1a1aa] text-sm font-medium">
            Portal do Candidato
          </p>
        </div>

        <div className="bg-white dark:bg-[#1A1F26] rounded-3xl border border-slate-200 dark:border-[#2A2F3A] shadow-xl dark:shadow-none overflow-hidden text-center p-8">
          {isRejected ? (
            // Rejected
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 border border-transparent dark:border-red-500/20 text-red-500 dark:text-red-400 rounded-full flex items-center justify-center mb-6">
                <ShieldAlert size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-[#fafafa] mb-2">
                Inscrição Não Aprovada
              </h2>
              <p className="text-slate-500 dark:text-[#a1a1aa] mb-8 text-sm">
                Seu vínculo foi encerrado pela empresa. Envie uma nova
                inscrição para voltar à análise.
              </p>
              <Button
                onClick={handleApply}
                className="w-full h-12 rounded-xl font-semibold mb-3"
              >
                Enviar Nova Inscrição
              </Button>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full h-12 rounded-xl font-semibold"
              >
                Sair
              </Button>
            </div>
          ) : isApproved ? (
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 bg-emerald-50 dark:bg-green-500/10 border border-emerald-100 dark:border-green-500/20 rounded-2xl flex items-center justify-center mb-6">
                <CheckCircle2
                  size={40}
                  className="text-emerald-500 dark:text-green-400"
                />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-[#fafafa] mb-3 tracking-tight">
                Inscrição aprovada
              </h2>
              <p className="text-slate-500 dark:text-[#a1a1aa] mb-8 text-sm leading-relaxed px-4">
                Sua inscrição foi aprovada. O acesso será liberado assim que o
                vínculo com a empresa terminar de sincronizar.
              </p>
              <Button
                onClick={handleContinueApproved}
                disabled={repairingAccess}
                className="w-full h-12 rounded-xl font-semibold"
              >
                {repairingAccess ? "Sincronizando acesso..." : "Continuar"}
                {!repairingAccess && <ArrowRight size={18} />}
              </Button>
            </div>
          ) : isPending ? (
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 bg-emerald-50 dark:bg-green-500/10 border border-emerald-100 dark:border-green-500/20 rounded-2xl flex items-center justify-center mb-6">
                <CheckCircle2
                  size={40}
                  className="text-emerald-500 dark:text-green-400"
                />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-[#fafafa] mb-3 tracking-tight">
                Sua inscrição foi enviada
              </h2>
              <p className="text-slate-500 dark:text-[#a1a1aa] mb-8 text-sm leading-relaxed px-4">
                Sua inscrição foi enviada com sucesso e está aguardando análise
                da empresa.
                <br />
                <br />
                Você receberá acesso ao sistema após aprovação do RH.
              </p>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full h-12 rounded-xl font-semibold text-slate-600 dark:text-[#f4f4f5] hover:text-slate-900 dark:hover:text-[#fafafa]"
              >
                Sair da Conta
              </Button>
            </div>
          ) : (
            // Hasn't applied yet, just logged in with Google implicitly
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-500/10 border border-transparent dark:border-blue-500/20 text-blue-500 dark:text-blue-400 rounded-full flex items-center justify-center mb-6">
                <ShieldAlert size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-[#fafafa] mb-2">
                Complete seu cadastro
              </h2>
              <p className="text-slate-500 dark:text-[#a1a1aa] mb-8 text-sm">
                Sua conta foi criada, mas você ainda não enviou sua inscrição
                para a avaliação do RH.
              </p>
              <div className="w-full flex justify-center">
                <Button
                  onClick={handleApply}
                  className="w-full h-12 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white rounded-xl font-semibold gap-2 mb-4"
                >
                  Continuar Inscrição
                  <ArrowRight size={18} />
                </Button>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#fafafa] transition-colors"
              >
                <ChevronLeft size={16} /> Voltar para login
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs font-semibold text-slate-400 dark:text-[#71717a] mt-8">
          NVU © {new Date().getFullYear()} — Plataforma Operacional
        </p>
      </div>
    </div>
  );
}
