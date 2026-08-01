import React, { useState, useEffect, useRef } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { useSessionStore } from "../context/AppContext";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { auth } from "../lib/firebase";
import { unifyUserDocument } from "../services/userIdentityService";
import { GoogleAuthProvider, signInWithPopup, signInWithCredential } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { preloadRoute } from "../lib/routePreload";

export default function Login() {
  const {
    setCurrentUser,
    currentUser,
    authInitialized,
    sessionReady,
    membershipsLoaded,
    memberships,
  } = useSessionStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const accessCheckInFlightRef = useRef(false);

  useEffect(() => {
    let active = true;

    const checkAccess = async () => {
      if (loading || accessCheckInFlightRef.current) return;

      try {
        if (sessionReady && currentUser?.id) {
          accessCheckInFlightRef.current = true;
          const dest = sessionStorage.getItem("loginRedirect");
          if (dest) {
            sessionStorage.removeItem("loginRedirect");
            if (active) navigate(dest, { replace: true });
            return;
          }

          const hasSeniorRole =
            (currentUser as any).role === "senior" ||
            (Array.isArray((currentUser as any).roles) &&
              (currentUser as any).roles.includes("senior"));
          if (hasSeniorRole) {
            if (active) navigate("/admin/senior", { replace: true });
            return;
          }

          // Memberships are already hydrated by AppContext and cached across
          // sessions. Re-querying the same collection here created the visible
          // delay between clicking Login and opening the profile selector.
          const hasActiveMembership =
            membershipsLoaded && memberships.some((membership) => membership.status === "active");

          if (hasActiveMembership) {
            void preloadRoute("/select-profile");
            if (active) navigate("/select-profile", { replace: true });
            return;
          }

          // Só a inscrição corrente, gravada no documento canônico do usuário,
          // pode abrir o acompanhamento. O histórico por e-mail não decide rota.
          const currentApplicationId = String(
            (currentUser as any).currentRecruitmentApplicationId || "",
          ).trim();
          if (currentApplicationId) {
            if (active) {
              navigate("/status", {
                replace: true,
                state: { applicationId: currentApplicationId },
              });
            }
            return;
          }

          // Sem vínculo e sem uma inscrição corrente, o usuário inicia o fluxo
          // limpo pelo portal, sem ser enviado para uma inscrição antiga.
          if (active) navigate("/", { replace: true });
        }
      } catch (err) {
        console.error("Error in checkAccess:", err);
        if (active) {
          setError("Erro ao verificar acesso. Retornando ao portal inicial.");
          window.setTimeout(() => navigate("/", { replace: true }), 2000);
        }
      } finally {
        accessCheckInFlightRef.current = false;
      }
    };

    checkAccess();

    return () => {
      active = false;
    };
  }, [
    sessionReady,
    currentUser,
    membershipsLoaded,
    memberships,
    loading,
    navigate,
  ]);

  const currentUserHasSeniorRole = Boolean(
    currentUser &&
      ((currentUser as any).role === "senior" ||
        (Array.isArray((currentUser as any).roles) &&
          (currentUser as any).roles.includes("senior"))),
  );
  const currentUserHasActiveMembership = Boolean(
    currentUser &&
      membershipsLoaded &&
      memberships.some((membership) => membership.status === "active"),
  );

  // For a session that is already hydrated, redirect during render instead of
  // painting a progress page and waiting one effect cycle.
  if (
    sessionReady &&
    currentUser &&
    membershipsLoaded &&
    !sessionStorage.getItem("loginRedirect") &&
    (currentUserHasSeniorRole || currentUserHasActiveMembership)
  ) {
    return (
      <Navigate
        to={currentUserHasSeniorRole ? "/admin/senior" : "/select-profile"}
        replace
      />
    );
  }

  if (
    !authInitialized ||
    !sessionReady ||
    (currentUser && !sessionStorage.getItem("loginRedirect"))
  ) {
    return (
      <div
        className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center px-6"
        role="status"
        aria-live="polite"
      >
        <div className="text-center">
          <div className="mx-auto mb-3 h-1 w-28 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-500/10">
            <div className="h-full w-1/3 rounded-full bg-blue-500 motion-safe:animate-[nvu-progress_900ms_ease-in-out_infinite]" />
          </div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Abrindo seus perfis
          </p>
        </div>
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
      
      // Firebase Auth is authoritative for the click acknowledgement. Publish
      // a minimal identity immediately so the session/profile route can start
      // without waiting for the legacy identity merge and reference migration.
      // The full reconciliation remains active in the background and replaces
      // this fallback as soon as it completes.
      setCurrentUser({
        id: user.uid,
        name: user.displayName?.trim() || user.email?.split("@")[0] || "Usuário",
        email: user.email || "",
        authPhotoURL: user.photoURL || undefined,
        profilePhotoURL: user.photoURL || undefined,
        status: "active",
        role: "driver",
        roles: ["driver"],
      } as any);
      void unifyUserDocument(user)
        .then((finalUserData) => {
          // Do not let a slow reconciliation from an older account overwrite
          // a later login/logout session.
          if (auth.currentUser?.uid === user.uid) {
            setCurrentUser(finalUserData as any);
          }
        })
        .catch((reconciliationError) => {
          // AppContext's auth listener still hydrates the canonical document.
          // A background reconciliation failure must not make the login look
          // unsuccessful after Firebase has already authenticated the user.
          console.warn("[NVU Login] Reconciliação de identidade pendente.", reconciliationError);
        });
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
                onClick={handleGoogleLogin}
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
