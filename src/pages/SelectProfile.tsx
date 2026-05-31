import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../context/AppContext";
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

export default function SelectProfile() {
  const {
    currentUser,
    switchRole,
    authInitialized,
    companies,
    setActiveCompanyId,
    activeCompanyId,
    activeRole,
    memberships,
    logOutApp,
  } = useAppStore();
  const navigate = useNavigate();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  );
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  useEffect(() => {
    if (authInitialized && !currentUser) {
      navigate("/login", { replace: true });
    } else if (
      authInitialized &&
      currentUser &&
      currentUser.status !== "active"
    ) {
      navigate("/status", { replace: true });
    }
  }, [authInitialized, currentUser, navigate]);

  const availableCompanies = useMemo(() => {
    const list: { companyId: string; companyName: string; roles: string[] }[] =
      [];
    if (memberships && memberships.length > 0) {
      memberships.forEach((membership) => {
        if (membership.status === "active") {
          const comp = companies.find((c) => c.id === membership.companyId);
          if (companies.length > 0 && !comp) return; // Ghost company
          const cName = comp
            ? comp.fleetName || comp.companyName
            : "Carregando...";
          list.push({
            companyId: membership.companyId,
            companyName: cName,
            roles: membership.roles || ["driver"],
          });
        }
      });
    } else if (currentUser?.memberships) {
      Object.entries(currentUser.memberships).forEach(
        ([compId, membership]) => {
          if (membership.status === "active") {
            const comp = companies.find((c) => c.id === compId);
            if (companies.length > 0 && !comp) return;
            const cName = comp
              ? comp.fleetName || comp.companyName
              : "Carregando...";
            list.push({
              companyId: compId,
              companyName: cName,
              roles: membership.roles || ["driver"],
            });
          }
        },
      );
    } else if (currentUser) {
      const compId = currentUser.companyId || "";
      const comp = companies.find((c) => c.id === compId);
      if (companies.length > 0 && !comp && compId) return;
      const cName = comp ? comp.fleetName || comp.companyName : "Carregando...";
      if (currentUser.status === "active" && compId) {
        list.push({
          companyId: compId,
          companyName: cName,
          roles: currentUser.roles || [currentUser.role || "driver"],
        });
      }
    }
    return list;
  }, [memberships, currentUser, companies]);

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

  const handleSelect = async (role: "admin" | "driver", companyId: string) => {
    if (activeRole !== role || activeCompanyId !== companyId) {
      setActiveCompanyId(companyId);
      await switchRole(role, companyId);
    } else {
      setActiveCompanyId(companyId);
    }
    navigate(role === "admin" ? "/admin" : "/driver");
  };

  const handleLogout = async () => {
    try {
      await logOutApp();
      navigate("/login", { replace: true });
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
          navigate(role === "admin" ? "/admin" : "/driver", { replace: true });
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

  if (!authInitialized || !currentUser || totalProfilesCount === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#09090b]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-300 dark:border-[#2A2F3A]"></div>
      </div>
    );
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
              <span className="text-[14px] font-medium text-slate-700 dark:text-[#e4e4e7] truncate max-w-[180px]">
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
                    <img
                      src={
                        companies.find(
                          (c) => c.id === activeCompany?.companyId,
                        )!.logoUrl
                      }
                      alt="Empresa"
                      className="w-full h-full object-cover"
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
                  {currentUser?.photoURL || currentUser?.avatar ? (
                    <img
                      src={currentUser.photoURL || currentUser.avatar}
                      alt="Motorista"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
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
