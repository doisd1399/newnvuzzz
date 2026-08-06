import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "../context/AppContext";
import { useCompanyStore } from "../context/CompanyContext";
import { resolveProfilePhoto } from "../lib/resolveProfilePhoto";
import { resolveRecruitmentPhoto } from "../lib/recruitmentPhoto";
import {
  ChevronRight,
  ShieldCheck,
  Building2,
  ChevronDown,
  Check,
  User,
  Truck,
  Briefcase,
  Edit,
} from "lucide-react";
import { auth } from "../lib/firebase";
import { ProfileModal } from "../components/ProfileModal";
import { StableImage } from "../components/common/StableImage";
import { preloadFleetPanel, preloadRoute } from "../lib/routePreload";
import { prepareAndCommitNavigation } from "../lib/navigationTransition";
import { resolveMembershipRoles } from "../lib/membershipRoles";

const ProfileSelectionTransition = () => (
  <div
    className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center"
    role="status"
    aria-live="polite"
  >
    <div className="flex flex-col items-center gap-2 opacity-70">
      <span className="text-lg font-bold tracking-[0.22em] text-slate-800 dark:text-white">
        NVU
      </span>
      <span className="h-0.5 w-10 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <span className="block h-full w-1/2 rounded-full bg-blue-500 motion-safe:animate-[nvu-progress_900ms_ease-in-out_infinite]" />
      </span>
    </div>
    <span className="sr-only">Preparando seus perfis</span>
  </div>
);

export default function SelectProfile() {
  const {
    currentUser,
    switchRole,
    authInitialized,
    membershipsLoaded,
    sessionReady,
    activeRole,
    logOutApp,
    setSeniorCompanyId,
    setIsSeniorAuthenticated,
  } = useSessionStore();
  const {
    companies,
    allCompanies,
    companyCatalogLoaded,
    loadCompanyCatalog,
    activeCompanyId,
    memberships,
    recruitmentApplications,
  } = useCompanyStore();
  const navigate = useNavigate();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  );
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const switchingRoleRef = useRef(false);

  useEffect(() => {
    if (sessionReady && !currentUser) {
      navigate("/", { replace: true });
    }
  }, [sessionReady, currentUser, navigate]);

  const availableCompanies = useMemo(() => {
    const list: { companyId: string; companyName: string; roles: string[] }[] =
      [];
    if (memberships && memberships.length > 0) {
      memberships.forEach((membership) => {
        if (membership.status === "active") {
          const comp = companies.find((c) => c.id === membership.companyId);
          if (companies.length > 0 && !comp) return; // Ghost company
          const cName = comp ? comp.companyName : "Carregando...";
          let simName = comp?.simulatorName || "";
          if (simName.length > 0 && simName.length <= 4) {
            simName = simName.charAt(0).toUpperCase() + simName.slice(1).toLowerCase();
          }
          const displayName = simName ? `${cName} - ${simName}` : cName;
          const roles = new Set(resolveMembershipRoles(membership, currentUser));
          const isOwner = Boolean(
            comp &&
              (comp.ownerId === currentUser?.id ||
                comp.userId === currentUser?.id),
          );
          if (isOwner) roles.add("admin");
          list.push({
            companyId: membership.companyId,
            companyName: displayName,
            roles: Array.from(roles),
          });
        }
      });
    }
    return list;
  }, [memberships, companies, currentUser?.id]);

  const latestPendingApplication = useMemo(() => {
    if (!currentUser?.id && !currentUser?.email) return null;

    const pendingApplications = recruitmentApplications.filter((application) => {
      if (application.status !== "pending") return false;
      if (application.isCurrent === false) return false;
      if (application.type === "company_registration") return false;

      const matchesUserId =
        currentUser?.id && application.userId === currentUser.id;
      const matchesEmail =
        currentUser?.email &&
        application.email?.toLowerCase() === currentUser.email.toLowerCase();

      return Boolean(matchesUserId || matchesEmail);
    });

    if (pendingApplications.length === 0) return null;

    return [...pendingApplications].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    })[0];
  }, [currentUser?.email, currentUser?.id, recruitmentApplications]);

  useEffect(() => {
    if (
      availableCompanies.length === 0 &&
      latestPendingApplication?.companyId &&
      (!companyCatalogLoaded ||
        !allCompanies.some(
          (company) => company.id === latestPendingApplication.companyId,
        ))
    ) {
      void loadCompanyCatalog();
    }
  }, [
    allCompanies,
    availableCompanies.length,
    companyCatalogLoaded,
    latestPendingApplication?.companyId,
    loadCompanyCatalog,
  ]);

  const pendingApplicationCompany = useMemo(() => {
    if (!latestPendingApplication?.companyId) return null;
    return (
      allCompanies.find((company) => company.id === latestPendingApplication.companyId) ||
      companies.find((company) => company.id === latestPendingApplication.companyId) ||
      null
    );
  }, [allCompanies, companies, latestPendingApplication?.companyId]);

  const pendingApplicationUserName = useMemo(() => {
    return (
      currentUser?.name?.trim() ||
      latestPendingApplication?.fullName?.trim() ||
      currentUser?.email?.split("@")[0] ||
      "Usuário"
    );
  }, [currentUser?.email, currentUser?.name, latestPendingApplication?.fullName]);

  const pendingApplicationUserPhoto = useMemo(
    () =>
      resolveRecruitmentPhoto(latestPendingApplication, currentUser) ||
      resolveProfilePhoto(currentUser) ||
      null,
    [currentUser, latestPendingApplication],
  );

  const pendingApplicationCompanyName = useMemo(() => {
    return (
      pendingApplicationCompany?.companyName?.trim() ||
      pendingApplicationCompany?.fleetName?.trim() ||
      "Empresa em análise"
    );
  }, [pendingApplicationCompany]);

  const pendingApplicationCompanyLogo = useMemo(() => {
    return (
      pendingApplicationCompany?.logoUrl ||
      pendingApplicationCompany?.logoURL ||
      pendingApplicationCompany?.companyLogoURL ||
      null
    );
  }, [pendingApplicationCompany]);

  const pendingApplicationDateTime = useMemo(() => {
    const rawValue = latestPendingApplication?.createdAt;
    if (!rawValue) return "Data indisponível";

    const parsedDate = new Date(rawValue);
    if (Number.isNaN(parsedDate.getTime())) return "Data indisponível";

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsedDate);
  }, [latestPendingApplication?.createdAt]);

  useEffect(() => {
    if (!membershipsLoaded || availableCompanies.length === 0) return;

    const availableRoles = new Set(
      availableCompanies.flatMap((company) => company.roles || []),
    );
    if (availableRoles.has("admin")) {
      void preloadRoute("/admin/fleet");
      void preloadFleetPanel("company");
    }
    if (availableRoles.has("driver")) void preloadRoute("/driver/profile");
    void preloadRoute("/ranking");
  }, [availableCompanies, membershipsLoaded]);

  // Handle default company selection
  useEffect(() => {
    if (availableCompanies.length > 0 && !selectedCompanyId) {
      const lastUsed =
        availableCompanies.find((c) => c.companyId === activeCompanyId) ||
        availableCompanies.find((c) => c.companyId === currentUser?.companyId);
      setSelectedCompanyId(
        lastUsed ? lastUsed.companyId : availableCompanies[0].companyId,
      );
    }
  }, [availableCompanies, selectedCompanyId, activeCompanyId, currentUser]);

  const activeCompany = availableCompanies.find(
    (c) => c.companyId === selectedCompanyId,
  );
  const profilesToSelect = activeCompany ? activeCompany.roles || [] : [];
  const totalProfilesCount = availableCompanies.reduce(
    (acc, comp) => acc + comp.roles.length,
    0,
  );

  const handleSelect = (role: "admin" | "driver", companyId: string) => {
    if (switchingRoleRef.current) return;
    switchingRoleRef.current = true;

    const target = role === "admin" ? "/admin/fleet" : "/driver/profile";
    // Commit the authenticated role/company context first. The action is
    // synchronous up to its background Firestore write, so ProtectedRoute
    // can authorize the destination in the same render as the navigation.
    // Keeping storage cleanup after this commit avoids an extra context update
    // before the visible route change.
    void switchRole(role, companyId);
    navigate(target, { replace: true });
    try {
      sessionStorage.removeItem("seniorAccess");
      sessionStorage.removeItem("seniorCompanyId");
      sessionStorage.removeItem("seniorPanelPasswordUnlocked");
      sessionStorage.removeItem("seniorPanelPasswordUid");
    } catch {
      // O estado React continua sendo a fonte ativa em previews restritos.
    }
    setSeniorCompanyId(null);
    setIsSeniorAuthenticated(false);

    switchingRoleRef.current = false;
    // Warm after the visible acknowledgement; a cold module cannot hold the
    // previous screen during the click.
    void preloadRoute(target).catch(() => undefined);
  };

  const handleLogout = async () => {
    try {
      await logOutApp();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleBackToStart = () => {
    navigate("/", { replace: true });
  };

  // Auto enter if exactly 1 profile available globally
  useEffect(() => {
    if (totalProfilesCount === 1 && availableCompanies.length === 1) {
      const comp = availableCompanies[0];
      if (comp && comp.roles && comp.roles.length === 1) {
        const role = comp.roles[0] as "admin" | "driver";
        if (activeRole === role && activeCompanyId === comp.companyId) {
          const target = role === "admin" ? "/admin/fleet" : "/driver/profile";
          void prepareAndCommitNavigation(
            () => preloadRoute(target),
            () => navigate(target, { replace: true }),
          );
        } else {
          handleSelect(role, comp.companyId);
        }
      }
    }
  }, [
    totalProfilesCount,
    availableCompanies,
    activeRole,
    activeCompanyId,
    navigate,
  ]);

  if (!sessionReady || !currentUser || !membershipsLoaded) {
    return <ProfileSelectionTransition />;
  }

  // Handle empty state (no companies/memberships)
  if (availableCompanies.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-white dark:bg-[#18181b] p-6 sm:p-8 rounded-3xl shadow-xl dark:shadow-none border border-slate-100 dark:border-[#2A2F3A] text-center">
          <div className="w-14 h-14 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Building2 size={28} />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Sem vínculos
          </h2>
          <p className="text-sm text-slate-500 dark:text-[#a1a1aa] mb-6 leading-relaxed px-1">
            {latestPendingApplication
              ? "Você ainda não possui vínculos ativos. Acompanhe sua última inscrição."
              : "Sua conta não possui vínculos ativos com nenhuma empresa no momento."}
          </p>
          {latestPendingApplication && (
            <div className="mb-6 rounded-2xl border border-slate-200 dark:border-[#2A2F3A] bg-slate-50/80 dark:bg-[#111318] p-3.5 sm:p-4 text-left">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3 mb-4">
                <div>
                  <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-[#71717a]">
                    Última inscrição
                  </p>
                  <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-0.5">
                    {pendingApplicationDateTime}
                  </p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full bg-amber-50 dark:bg-amber-500/10 px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20 whitespace-nowrap">
                  Em avaliação
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#2A2F3A] px-3 py-2">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 dark:bg-[#27272a] flex items-center justify-center shrink-0">
                    {pendingApplicationUserPhoto ? (
                      <StableImage
                        src={pendingApplicationUserPhoto}
                        alt={pendingApplicationUserName}
                        wrapperClassName="w-full h-full"
                        className="object-cover"
                        fallback={
                          <User
                            size={16}
                            className="text-slate-400 dark:text-[#a1a1aa]"
                          />
                        }
                      />
                    ) : (
                      <User size={16} className="text-slate-400 dark:text-[#a1a1aa]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-[#71717a] mb-0.5">
                      Motorista
                    </p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {pendingApplicationUserName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#2A2F3A] px-3 py-2">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 dark:bg-[#27272a] flex items-center justify-center shrink-0">
                    {pendingApplicationCompanyLogo ? (
                      <StableImage
                        src={pendingApplicationCompanyLogo}
                        alt={pendingApplicationCompanyName}
                        wrapperClassName="w-full h-full"
                        className="object-cover"
                        fallback={
                          <Building2
                            size={16}
                            className="text-slate-400 dark:text-[#a1a1aa]"
                          />
                        }
                      />
                    ) : (
                      <Building2
                        size={16}
                        className="text-slate-400 dark:text-[#a1a1aa]"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-[#71717a] mb-0.5">
                      Empresa
                    </p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {pendingApplicationCompanyName}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {latestPendingApplication && (
            <p className="text-[11px] sm:text-xs text-slate-400 dark:text-[#a1a1aa] leading-relaxed mb-5 px-1">
              Você será notificado(a) assim que houver resposta (se as notificações estiverem ativas).
            </p>
          )}
          <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3">
            {showLogoutConfirm ? (
              <div className="sm:col-span-2 flex flex-col gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
                <p className="text-[12px] sm:text-[13px] font-medium text-red-800 dark:text-red-200 leading-relaxed text-center">
                  Ao desconectar, você não receberá a notificação da resposta. Continuar?
                </p>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="w-full py-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-red-200 dark:border-red-500/30 text-slate-700 dark:text-slate-300 font-semibold text-sm transition-colors hover:bg-slate-50 dark:hover:bg-[#22252d]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors"
                  >
                    Desconectar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full py-3 sm:py-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 font-semibold text-sm sm:text-base transition-colors"
                >
                  Desconectar
                </button>
                <button
                  onClick={handleBackToStart}
                  className="w-full py-3 sm:py-3.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-white font-semibold text-sm sm:text-base transition-colors"
                >
                  Ir para o início
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex flex-col items-center justify-center p-4 sm:p-6 font-sans selection:bg-blue-100 dark:selection:bg-blue-900">
      <div className="w-full max-w-[420px] flex flex-col relative z-10">
        {/* Header Section */}
        <div className="text-center mb-8 relative">
          <button
            onClick={() => setIsEditProfileOpen(true)}
            className="absolute -top-2 right-0 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#2A2F3A] rounded-full shadow-sm"
            title="Editar Perfil"
          >
            <Edit size={16} />
          </button>
          <p className="text-slate-500 dark:text-[#a1a1aa] text-[13px] font-medium mb-1.5 opacity-80 uppercase tracking-wider">
            Bem-vindo(a) de volta
          </p>
          <h1 className="text-2xl sm:text-[26px] font-semibold text-slate-900 dark:text-white tracking-tight">
            Selecionar Perfil
          </h1>
        </div>

        {/* Company Selector Area */}
        {availableCompanies.length > 1 && (
          <div className="flex justify-center mb-6 relative z-50">
            <button
              onClick={() => setIsSelectorOpen(!isSelectorOpen)}
              className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#2A2F3A] rounded-full shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-all focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-[#2A2F3A]"
            >
              <Building2
                size={16}
                className="text-slate-400 text-opacity-80 dark:text-[#71717a]"
              />
              <span className="text-[14px] font-medium text-slate-700 dark:text-[#e4e4e7] truncate max-w-[240px] sm:max-w-[280px]">
                {activeCompany?.companyName}
              </span>
              <ChevronDown
                size={14}
                className={`text-slate-400 transition-transform ${isSelectorOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isSelectorOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsSelectorOpen(false)}
                ></div>
                <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[280px] bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="max-h-[300px] overflow-y-auto p-1.5">
                    {availableCompanies.map((comp) => (
                      <button
                        key={comp.companyId}
                        onClick={() => {
                          setSelectedCompanyId(comp.companyId);
                          setIsSelectorOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] transition-colors ${selectedCompanyId === comp.companyId ? "bg-slate-50 dark:bg-[#27272a] text-slate-900 dark:text-white font-medium" : "text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-50 dark:hover:bg-[#27272a] font-normal"}`}
                      >
                        <span className="truncate">{comp.companyName}</span>
                        {selectedCompanyId === comp.companyId && (
                          <Check
                            size={16}
                            className="text-slate-600 dark:text-[#a1a1aa] shrink-0 ml-2"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Profiles Section */}
        <div className="flex flex-col gap-3">
          {profilesToSelect.includes("admin") && (
            <button
              onClick={() => handleSelect("admin", activeCompany!.companyId)}
              className="group relative flex items-center justify-between bg-white dark:bg-[#121214] border border-slate-200 dark:border-[#27272A] hover:border-slate-300 dark:hover:border-[#3F3F46] rounded-[20px] p-4 sm:p-5 hover:shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] dark:hover:shadow-none transition-all duration-200 text-left outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:focus-visible:ring-[#3F3F46]"
            >
              <div className="flex items-center gap-4">
                <div className="w-[46px] h-[46px] rounded-[14px] bg-slate-50 dark:bg-[#18181B] border border-slate-100 dark:border-[#27272A] flex items-center justify-center text-slate-500 dark:text-[#A1A1AA] group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-500/10 dark:group-hover:text-indigo-400 group-hover:border-indigo-100 dark:group-hover:border-indigo-500/20 transition-all duration-300 overflow-hidden">
                  {companies.find((c) => c.id === activeCompany?.companyId)
                    ?.logoUrl ? (
                    <StableImage
                      src={
                        companies.find(
                          (c) => c.id === activeCompany?.companyId,
                        )!.logoUrl
                      }
                      alt="Empresa"
                      loading="eager"
                      decoding="async"
                      wrapperClassName="w-full h-full"
                      className="object-cover"
                      fallback={<Briefcase size={22} strokeWidth={1.8} />}
                    />
                  ) : (
                    <Briefcase size={22} strokeWidth={1.8} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-[15px] sm:text-base font-semibold text-slate-900 dark:text-[#FAFAFA] tracking-tight">
                      Administrador
                    </h3>
                    {activeRole === "admin" &&
                      activeCompanyId === activeCompany?.companyId && (
                        <span className="flex items-center px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] uppercase font-bold tracking-wide">
                          Atual
                        </span>
                      )}
                  </div>
                  <p className="text-[13px] text-slate-500 dark:text-[#A1A1AA]">
                    Gestão e controle operacional
                  </p>
                </div>
              </div>
              <ChevronRight
                size={18}
                className="text-slate-300 dark:text-[#52525B] group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all duration-300"
              />
            </button>
          )}

          {profilesToSelect.includes("driver") && (
            <button
              onClick={() => handleSelect("driver", activeCompany!.companyId)}
              className="group relative flex items-center justify-between bg-white dark:bg-[#121214] border border-slate-200 dark:border-[#27272A] hover:border-slate-300 dark:hover:border-[#3F3F46] rounded-[20px] p-4 sm:p-5 hover:shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] dark:hover:shadow-none transition-all duration-200 text-left outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:focus-visible:ring-[#3F3F46]"
            >
              <div className="flex items-center gap-4">
                <div className="w-[46px] h-[46px] rounded-[14px] bg-slate-50 dark:bg-[#18181B] border border-slate-100 dark:border-[#27272A] flex items-center justify-center text-slate-500 dark:text-[#A1A1AA] group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-500/10 dark:group-hover:text-blue-400 group-hover:border-blue-100 dark:group-hover:border-blue-500/20 transition-all duration-300 overflow-hidden">
                  {resolveProfilePhoto(currentUser) || null ? (
                    <StableImage
                      src={resolveProfilePhoto(currentUser) || null}
                      alt="Motorista"
                      loading="eager"
                      decoding="async"
                      wrapperClassName="w-full h-full"
                      className="object-cover"
                      referrerPolicy="no-referrer"
                      fallback={<Truck size={22} strokeWidth={1.8} />}
                    />
                  ) : (
                    <Truck size={22} strokeWidth={1.8} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-[15px] sm:text-base font-semibold text-slate-900 dark:text-[#FAFAFA] tracking-tight">
                      Motorista
                    </h3>
                    {activeRole === "driver" &&
                      activeCompanyId === activeCompany?.companyId && (
                        <span className="flex items-center px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] uppercase font-bold tracking-wide">
                          Atual
                        </span>
                      )}
                  </div>
                  <p className="text-[13px] text-slate-500 dark:text-[#A1A1AA]">
                    Rotas, entregas e checklist
                  </p>
                </div>
              </div>
              <ChevronRight
                size={18}
                className="text-slate-300 dark:text-[#52525B] group-hover:text-blue-500 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all duration-300"
              />
            </button>
          )}
        </div>

        {/* Security / Footer Area */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-slate-400 dark:text-[#71717A] opacity-90">
          <div className="flex items-center gap-1.5">
            <ShieldCheck
              size={14}
              strokeWidth={2}
              className="text-emerald-500/70"
            />
            <span className="text-[12px] font-medium tracking-wide border-b border-transparent">
              Sessão segura
            </span>
          </div>
          <span className="hidden sm:inline text-slate-300 dark:text-[#3F3F46]">
            •
          </span>
          <button
            onClick={handleLogout}
            className="text-[12px] font-medium tracking-wide border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
          >
            Sair desta conta
          </button>
        </div>
      </div>
      <ProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
      />
    </div>
  );
}
