import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "../context/AppContext";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { auth, db } from "../lib/firebase";
import { unifyUserDocument } from "../services/userIdentityService";
import { GoogleAuthProvider, signInWithPopup, signInWithCredential } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  query,
  collection,
  where,
  getDocs,
} from "firebase/firestore";

export default function Login() {
  const { setCurrentUser, currentUser, authInitialized } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const checkAccess = async () => {
      if (loading) return;

      try {
        if (authInitialized && currentUser?.id) {
          const dest = sessionStorage.getItem("loginRedirect");
          if (dest) {
            sessionStorage.removeItem("loginRedirect");
            if (active) navigate(dest, { replace: true });
            return;
          }

          // 1. Check companyMembers for active membership
          const memQuery = query(
            collection(db, "companyMembers"),
            where("userId", "==", currentUser.id),
            where("status", "==", "active")
          );
          const memSnap = await getDocs(memQuery);

          if (!memSnap.empty) {
            if (active) navigate("/select-profile", { replace: true });
            return;
          }

          // 2. Sem vínculo ativo, somente uma inscrição realmente pendente
          // deve bloquear o usuário na tela de status. Registros aprovados ou
          // recusados antigos não podem redirecionar o login indefinidamente.
          const reqQuery = query(
            collection(db, "recruitment_applications"),
            where("userId", "==", currentUser.id),
          );
          const reqSnap = await getDocs(reqQuery);
          const hasPendingApplication = reqSnap.docs.some(
            (applicationDocument) =>
              applicationDocument.data().status === "pending",
          );

          if (hasPendingApplication) {
            if (active) navigate("/status", { replace: true });
            return;
          }

          // 3. No membership and no applications, return to portal
          if (active) navigate("/", { replace: true });
        }
      } catch (err) {
        console.error("Error in checkAccess:", err);
        if (active) {
           setError("Erro ao verificar acesso. Retornando ao portal inicial.");
           setTimeout(() => navigate("/", { replace: true }), 2000);
        }
      }
    };

    checkAccess();

    return () => {
      active = false;
    };
  }, [authInitialized, currentUser, loading, navigate]);

  if (
    !authInitialized ||
    (currentUser && !sessionStorage.getItem("loginRedirect"))
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#18181b]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800"></div>
      </div>
    );
  }

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    try {
      // Allow passing destination from external via state
      if (location.state?.from) {
        sessionStorage.setItem("loginRedirect", location.state.from);
      }
      
      let user;
      
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        const credential = GoogleAuthProvider.credential(result.credential?.idToken);
        const userCredential = await signInWithCredential(auth, credential);
        user = userCredential.user;
      } else {
        const result = await signInWithPopup(auth, provider);
        user = result.user;
      }
      
      const finalUserData = await unifyUserDocument(user);

      setCurrentUser(finalUserData as any);
      // Let useEffect handle navigation based on status or redirect
    } catch (err: any) {
      sessionStorage.removeItem("loginRedirect");
      
      const errStr = `${err.message || ""} ${err.code || ""} ${err.name || ""} ${err?.cause?.message || ""} ${err?.cause?.name || ""}`.toLowerCase();
      
      const isCancel = 
        err.code === "auth/popup-closed-by-user" || 
        err.code === "auth/cancelled-popup-request" ||
        errStr.includes("12501") || 
        errStr.includes("cancel") || 
        errStr.includes("fechar");

      const isCredentialManager = 
        errStr.includes("credential manager") ||
        errStr.includes("credentialmanager") ||
        errStr.includes("getcredentialunsupportedexception") ||
        errStr.includes("createcredentialexception") ||
        errStr.includes("unsupportedoperationexception") ||
        errStr.includes("provider configuration") ||
        errStr.includes("no credential provider") ||
        errStr.includes("play services") ||
        errStr.includes("not supported");

      if (isCancel) {
        // User cancelled, do nothing, just stop loading
        console.log("[Login] Cancelado pelo usuário");
      } else if (isCredentialManager) {
        console.error("[Login] Credential Manager error:", { name: err.name, code: err.code, message: err.message, cause: err.cause });
        setError("Não foi possível abrir o login com Google neste dispositivo. Atualize os Serviços do Google Play e tente novamente.");
      } else if (err.code === "auth/unauthorized-domain") {
        console.error("[Login] Domain error:", { name: err.name, code: err.code, message: err.message });
        setError(
          `Erro: Domínio não autorizado. Adicione o domínio da aplicação atual nas configurações de "Authorized domains" da aba "Authentication > Settings" do seu Console do Firebase.`,
        );
      } else {
        console.error("[Login] Generic error:", { name: err.name, code: err.code, message: err.message });
        setError("Erro ao fazer login com Google: " + (err.message || "Erro desconhecido"));
      }
    } finally {
      // A autenticação pode permanecer válida mesmo quando a unificação do
      // documento falha. O botão nunca deve ficar preso em loading.
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-[#fafafa] tracking-tight mb-2">
            NVU
          </h1>
          <p className="text-slate-500 dark:text-[#a1a1aa] text-sm font-medium">
            Gestão Operacional de Logística
          </p>
        </div>

        <Card className="rounded-3xl border border-slate-200/60 dark:border-[#2A2F3A] shadow-xl dark:shadow-none overflow-hidden bg-white dark:bg-[#1A1F26]">
          <CardContent className="p-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-[#fafafa] mb-6 text-center">
              Fazer Login
            </h2>

            {error && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-transparent dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl mb-6 text-center">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <Button
                onClick={() => handleGoogleLogin()}
                disabled={loading}
                className="w-full h-12 bg-white dark:bg-[#27272a]/50 hover:bg-slate-50 dark:hover:bg-[#27272a] text-slate-700 dark:text-[#e4e4e7] border border-slate-200 dark:border-[#2A2F3A]/50 shadow-sm dark:shadow-none transition-all rounded-xl relative flex justify-center items-center"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-800 dark:border-slate-400"></div>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5 absolute left-4"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span className="font-semibold text-[15px]">
                      Entrar com Google
                    </span>
                  </>
                )}
              </Button>
            </div>
            
            <div className="mt-6 text-center">
              <button
                onClick={() => navigate('/')}
                className="text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-[#a1a1aa] dark:hover:text-[#e4e4e7] transition-colors"
              >
                Voltar
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs font-semibold text-slate-400 dark:text-[#71717a] mt-8">
          NVU © {new Date().getFullYear()} — Plataforma Operacional
        </p>
      </div>
    </div>
  );
}
