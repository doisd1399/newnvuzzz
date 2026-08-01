import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "../context/AppContext";
import { resolveProfilePhoto } from "../lib/resolveProfilePhoto";
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
import { preloadRoute } from "../lib/routePreload";
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
    companies,
    activeCompanyId,
    activeRole,
    memberships,
    logOutApp,
    setSeniorCompanyId,
  } = useSessionStore();
  const navigate = useNavigate();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  );
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const switchingRoleRef = useRef(false);

  useEffect(() => {
    if (sessionReady && !currentUser) {
      navigate("/", { replace: true });
    } else if (sessionReady && currentUser && membershipsLoaded) {
      const hasActiveMembership = memberships.some((m) => m.status === "active");
      if (!hasActiveMembership) {
        const applicationId = String(
          (currentUser as any).currentRecruitmentApplicationId || "",
        ).trim();
        navigate(applicationId ? "/status" : "/apply", {
          replace: true,
          ...(applicationId ? { state: { applicationId } } : {}),
        });
      }
    }
  }, [sessionReady, currentUser, membershipsLoaded, memberships, navigate]);

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

  useEffect(() => {
    if (!membershipsLoaded || availableCompanies.length === 0) return;

    const availableRoles = new Set(
      availableCompanies.flatMap((company) => company.roles || []),
    );
    if (availableRoles.has("admin")) void preloadRoute("/admin/fleet");
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
    } catch {
      // O estado React continua sendo a fonte ativa em previews restritos.
    }
    setSeniorCompanyId(null);

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
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white dark:bg-[#18181b] p-8 rounded-3xl shadow-xl dark:shadow-none border border-slate-100 dark:border-[#2A2F3A] text-center">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Sem vínculos
          </h2>
          <p className="text-slate-500 dark:text-[#a1a1aa] mb-8 leading-relaxed">
            Sua conta não possui vínculos ativos com nenhuma empresa ou frota no
            momento.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate("/apply")}
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
            >
              Buscar Vagas em Frotas
            </button>
            <button
              onClick={() => navigate("/register-company")}
              className="w-full py-3.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-white font-semibold transition-colors"
            >
              Registrar minha Empresa
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="mt-6 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            Sair e voltar ao login
          </button>
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
