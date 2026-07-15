import React, { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "../context/AppContext";
import {
  Package,
  LayoutDashboard,
  FileText,
  Activity,
  Users,
  Settings,
  LogOut,
  Truck,
  Container,
  UserCheck,
  ChevronDown,
  Bell,
  Menu,
  User,
  Moon,
  Sun,
  UserPlus,
  Building2,
  Crown,
  ChevronLeft,
  Check,
  Trophy,
} from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { cn } from "../lib/utils";
import { auth } from "../lib/firebase";
import { ProfileModal } from "../components/ProfileModal";

export default function AdminLayout() {
  const {
    currentUser,
    setCurrentUser,
    companies,
    activeCompanyId,
    setActiveCompanyId,
    users,
    notifications,
    markNotificationAsRead,
    switchRole,
    jobDemands,
    recruitmentApplications,
    activeRole,
    memberships,
    logOutApp,
  } = useAppStore();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);
  const [showCompanySwitch, setShowCompanySwitch] = React.useState(false);

  React.useEffect(() => {
    if (!isProfileMenuOpen) setShowCompanySwitch(false);
  }, [isProfileMenuOpen]);

  if (!currentUser) return null;

  const unreadNotifications = notifications.filter((n) => !n.lida);
  const pendingCount = unreadNotifications.length;

  const pendingDemandsCount = React.useMemo(() => {
    return (
      jobDemands?.filter(
        (d) => d.companyId === activeCompanyId && d.status === "pending",
      ).length || 0
    );
  }, [jobDemands, activeCompanyId]);

  const pendingHrCount = React.useMemo(() => {
    return (
      recruitmentApplications?.filter((a) => a.status === "pending").length || 0
    );
  }, [recruitmentApplications]);

  const availableCompanies = React.useMemo(() => {
    const list: { companyId: string; companyName: string; roles: string[] }[] =
      [];
    if (memberships && memberships.length > 0) {
      memberships.forEach((membership) => {
        if (membership.status === "active") {
          const comp = companies.find((c) => c.id === membership.companyId);
          if (companies.length > 0 && !comp) return; // Ghost company ignore
          const cName = comp ? comp.companyName : "Carregando...";
          list.push({
            companyId: membership.companyId,
            companyName: cName,
            roles: membership.roles,
          });
        }
      });
    }
    return list;
  }, [memberships, companies]);

  const handleSwitchRole = (newRole: "admin" | "driver") => {
    setIsProfileMenuOpen(false);
    if (activeRole === newRole) return;

    const currentMember = memberships.find(
      (m) => m.companyId === activeCompanyId,
    );
    const hasRole =
      currentMember?.roles.includes(newRole) ||
      currentUser?.roles?.includes(newRole);

    if (hasRole) {
      switchRole(newRole, activeCompanyId || undefined);
      navigate(newRole === "admin" ? "/admin" : "/driver");
    } else {
      alert(
        newRole === "admin"
          ? "Você não possui permissão de administrador."
          : "Perfil de motorista não disponível.",
      );
    }
  };

  const handleLogout = async () => {
    await logOutApp();
    navigate("/login");
  };

  const navGroups = [
    {
      title: "GESTÃO DA FROTA",
      items: [
        {
          label: "Estrutura da Frota",
          icon: Truck,
          path: "/admin/fleet",
          badge: pendingHrCount,
        },
        {
          label: "Ranking",
          icon: Trophy,
          path: "/ranking",
        },
        {
          label: "Relatórios",
          icon: Activity,
          path: "/admin/reports",
        },
      ],
    },
  ];

  const currentActiveAdminCompany = companies.find(
    (c) => c.id === activeCompanyId,
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] flex flex-col text-gray-900 dark:text-[#fafafa] font-sans">
      {/* Top Bar fixed at the top */}
      <header className="fixed top-0 left-0 right-0 h-11 md:h-12 bg-white dark:bg-[#09090b] border-b border-gray-100 dark:border-[#2A2F3A] flex items-center px-4 md:px-6 justify-between z-50">
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="lg:hidden p-1.5 -ml-1.5 text-gray-600 dark:text-[#d4d4d8] hover:bg-gray-50 dark:bg-[#09090b] dark:hover:bg-[#3f3f46] rounded-lg"
          >
            <Menu size={24} />
          </button>
          <div className="hidden lg:flex items-center gap-2">
            <h1 className="font-bold text-lg text-gray-900 dark:text-[#fafafa] tracking-tight">
              NVU
            </h1>
          </div>
          <div className="lg:hidden font-bold text-lg text-gray-900 dark:text-[#fafafa] leading-none">
            NVU
          </div>
        </div>

        {/* Right Box: Bell and User */}
        <div className="flex items-center gap-1.5 md:gap-4">
          <div className="relative">
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative p-2 text-gray-500 dark:text-[#a1a1aa] hover:bg-gray-50 dark:bg-[#09090b] dark:hover:bg-[#3f3f46] rounded-lg transition-colors"
            >
              <Bell size={20} />
              {pendingCount > 0 && (
                <span className="absolute top-1.5 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-[#09090b] rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-[#2A2F3A] py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-2 border-b border-gray-50 dark:border-[#2A2F3A]">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-[#fafafa]">
                    Notificações
                  </h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {unreadNotifications.length > 0 ? (
                    unreadNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className="px-4 py-3 hover:bg-gray-50 dark:bg-[#09090b] dark:hover:bg-[#3f3f46] cursor-pointer transition-colors border-b border-gray-50 dark:border-[#2A2F3A] last:border-0"
                        onClick={() => {
                          markNotificationAsRead(notification.id);
                          setIsNotificationsOpen(false);
                          if (notification.tipo === "solicitacao") {
                            navigate("/admin/fleet", {
                              state: { activeTab: "drivers" },
                            });
                          }
                        }}
                      >
                        <p className="text-sm font-bold text-gray-900 dark:text-[#fafafa]">
                          {notification.titulo}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-[#d4d4d8] mt-1">
                          {notification.mensagem}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-gray-500 dark:text-[#a1a1aa] text-sm">
                      Nenhuma notificação não lida.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button className="lg:hidden p-1.5 text-gray-500 dark:text-[#a1a1aa] hover:bg-gray-50 dark:bg-[#09090b] dark:hover:bg-[#3f3f46] rounded-lg shrink-0">
            {currentUser?.photoURL || currentUser?.avatar ? (
              <img
                src={currentUser.photoURL || currentUser.avatar}
                alt={currentUser.name}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-white/10 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-[10px]">
                {currentUser?.name?.substring(0, 2).toUpperCase() || "AD"}
              </div>
            )}
          </button>
          <button
            onClick={handleLogout}
            className="hidden lg:flex p-2 text-gray-400 hover:text-gray-600 dark:text-[#d4d4d8] dark:hover:text-[#a1a1aa]"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main wrapper starts below the header */}
      <div className="flex-1 flex pt-11 md:pt-12 max-w-full relative">
        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 top-11 md:top-12 bg-gray-900/50 z-40 lg:hidden overflow-hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "w-64 bg-white dark:bg-[#09090b] border-r border-gray-100 dark:border-[#2A2F3A] flex flex-col fixed top-11 md:top-12 bottom-0 left-0 z-40 shadow-sm dark:shadow-none transition-transform duration-300 ease-in-out lg:translate-x-0 hidden lg:flex",
            isMobileMenuOpen ? "flex translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="p-4 flex flex-col gap-2 relative border-b border-gray-100 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#09090b]">
            {isProfileMenuOpen && (
              <div className="absolute left-4 right-4 top-full mt-2 bg-white dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] shadow-lg dark:shadow-none rounded-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                {showCompanySwitch ? (
                  <>
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#09090b] flex items-center justify-between">
                      <p className="text-[11px] font-bold text-gray-500 dark:text-[#a1a1aa] uppercase tracking-wider">
                        Escolha a Empresa
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCompanySwitch(false);
                        }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <ChevronLeft size={16} />
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                      {availableCompanies.map((comp) => (
                        <button
                          key={comp.companyId}
                          onClick={() => {
                            setActiveCompanyId(comp.companyId);
                            if (
                              comp.roles.length > 0 &&
                              !comp.roles.includes("admin")
                            ) {
                              switchRole("driver", comp.companyId);
                              navigate("/driver");
                            } else {
                              switchRole("admin", comp.companyId);
                            }
                            setIsProfileMenuOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
                            activeCompanyId === comp.companyId
                              ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400"
                              : "hover:bg-gray-50 dark:hover:bg-[#3f3f46] text-gray-700 dark:text-[#d4d4d8]",
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Building2 size={16} className="shrink-0" />
                            <span className="truncate">{comp.companyName}</span>
                          </div>
                          {activeCompanyId === comp.companyId && (
                            <Check
                              size={16}
                              className="shrink-0 text-blue-600 dark:text-blue-400"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#09090b]">
                      <p className="text-[11px] font-bold text-gray-500 dark:text-[#a1a1aa] uppercase tracking-wider">
                        Alternar Perfil
                      </p>
                    </div>
                    <div className="p-1 border-b border-gray-100 dark:border-[#2A2F3A]">
                      <button
                        onClick={() => handleSwitchRole("admin")}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                          activeRole === "admin"
                            ? "bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 text-blue-700"
                            : "hover:bg-gray-50 dark:hover:bg-[#3f3f46] text-gray-700 dark:text-[#d4d4d8]",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <User size={16} />
                          <span>Administrador</span>
                        </div>
                        {activeRole === "admin" && (
                          <UserCheck
                            size={16}
                            className="text-blue-600 dark:text-blue-400"
                          />
                        )}
                      </button>
                      <button
                        onClick={() => handleSwitchRole("driver")}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                          activeRole === "driver"
                            ? "bg-green-50 dark:bg-green-500/10 dark:border-green-500/20 text-green-700"
                            : "hover:bg-gray-50 dark:hover:bg-[#3f3f46] text-gray-700 dark:text-[#d4d4d8]",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Truck size={16} />
                          <span>Motorista</span>
                        </div>
                        {activeRole === "driver" && (
                          <UserCheck
                            size={16}
                            className="text-green-600 dark:text-green-400"
                          />
                        )}
                      </button>
                    </div>
                    <div className="p-1 border-b border-gray-100 dark:border-[#2A2F3A]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCompanySwitch(true);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-[#d4d4d8] hover:bg-gray-50 dark:bg-[#09090b] dark:hover:bg-[#3f3f46] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Building2 size={16} />
                          <span>Trocar de Empresa</span>
                        </div>
                        <ChevronLeft size={16} className="rotate-180" />
                      </button>
                    </div>
                    <div className="p-1">
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setIsProfileModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-[#d4d4d8] hover:bg-gray-50 dark:bg-[#09090b] dark:hover:bg-[#3f3f46] transition-colors"
                      >
                        <Settings size={16} />
                        <span>Editar Perfil</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <div
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className={cn(
                "flex items-center justify-between px-3 py-3 rounded-xl border transition-colors cursor-pointer shadow-sm dark:shadow-none relative",
                isProfileMenuOpen
                  ? "border-blue-200 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20/50"
                  : "border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#09090b] hover:bg-gray-50 dark:hover:bg-[#3f3f46]",
              )}
            >
              <div className="flex items-center gap-3">
                {currentUser?.photoURL || currentUser?.avatar ? (
                  <img
                    src={currentUser.photoURL || currentUser.avatar}
                    alt={currentUser.name}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    className="w-9 h-9 rounded-full bg-gray-200 dark:bg-white/10 object-cover shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {currentUser?.name?.substring(0, 2).toUpperCase() || "AD"}
                  </div>
                )}
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-sm font-bold text-gray-900 dark:text-[#fafafa] truncate">
                    {currentUser?.name}
                  </p>
                  <p className="text-[11px] text-[#0cb49f] dark:text-[#0cb49f] font-semibold truncate leading-tight mt-0.5">
                    Administrador
                  </p>
                </div>
              </div>
              <ChevronDown
                size={16}
                className={cn(
                  "text-gray-400 transition-transform duration-200",
                  isProfileMenuOpen
                    ? "rotate-180 text-[#0cb49f] dark:text-[#0cb49f]"
                    : "",
                )}
              />
            </div>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
            {navGroups.map((group, idx) => (
              <div key={idx}>
                {group.title && (
                  <h3 className="px-4 text-[10px] font-bold text-gray-500 dark:text-[#a1a1aa] uppercase tracking-widest mb-3">
                    {group.title}
                  </h3>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={(item as any).exact}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors",
                          isActive
                            ? "bg-[#0cb49f]/10 dark:bg-[#0cb49f]/10 text-[#0cb49f] dark:text-[#0cb49f]"
                            : "text-gray-600 dark:text-[#d4d4d8] hover:bg-gray-50 dark:hover:bg-[#3f3f46] hover:text-gray-900 dark:hover:text-[#f4f4f5]",
                        )
                      }
                    >
                      <div className="flex items-center gap-3">
                        <item.icon size={18} strokeWidth={2} />
                        {item.label}
                      </div>
                      {item.badge ? (
                        <span className="bg-yellow-100 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      ) : null}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-4 flex flex-col gap-2 relative border-t border-gray-100 dark:border-[#2A2F3A]">
            <div className="mx-2 mb-1 p-3 bg-white dark:bg-[#09090b] border border-gray-100 dark:border-[#2A2F3A]/80 shadow-sm dark:shadow-none rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-50 dark:bg-[#27272a] border border-gray-100 dark:border-[#2A2F3A] flex items-center justify-center text-gray-500 dark:text-[#a1a1aa]">
                  {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
                </div>
                <span className="text-[13px] font-bold text-gray-900 dark:text-[#fafafa]">
                  Modo Escuro
                </span>
              </div>
              <button
                onClick={toggleTheme}
                className={cn(
                  "relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#0cb49f] focus:ring-offset-2 dark:focus:ring-offset-[#121213]",
                  theme === "dark" ? "bg-[#0cb49f]" : "bg-gray-200",
                )}
              >
                <div
                  className={cn(
                    "absolute top-1 left-1 w-4 h-4 rounded-full bg-white dark:bg-[#09090b] shadow-sm transition-transform",
                    theme === "dark" ? "translate-x-4" : "",
                  )}
                />
              </button>
            </div>
            <button
              onClick={() => {
                navigate("/admin/senior");
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-[#d4d4d8] hover:bg-gray-50 dark:bg-[#09090b] dark:hover:bg-[#3f3f46] hover:text-gray-900 dark:hover:text-[#f4f4f5] transition-colors"
            >
              <Crown size={18} />
              Painel Senior
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-[#d4d4d8] hover:bg-gray-50 dark:bg-[#09090b] dark:hover:bg-[#3f3f46] hover:text-gray-900 dark:hover:text-[#f4f4f5] transition-colors"
            >
              <LogOut size={18} />
              Sair
            </button>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 lg:ml-64 flex flex-col min-h-[calc(100vh-3.5rem)] md:min-h-[calc(100vh-4rem)] max-w-full">
          <div className="p-4 sm:p-6 md:p-10 flex-1">
            <div className="max-w-6xl mx-auto">
              {!activeCompanyId &&
              companies.length > 0 &&
              !location.pathname.includes("/admin/fleet") ? (
                <div className="text-center py-12 bg-white dark:bg-[#09090b] rounded-3xl border border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-[#fafafa] mb-2">
                    Selecione uma Frota
                  </h2>
                  <p className="text-gray-500 dark:text-[#a1a1aa] mb-6">
                    Você precisa selecionar uma frota ativa na página de Gestão
                    da Frota para continuar.
                  </p>
                  <button
                    onClick={() =>
                      navigate("/admin/fleet", {
                        state: { activeTab: "operations" },
                      })
                    }
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
                  >
                    Ir para Gestão da Frota
                  </button>
                </div>
              ) : !activeCompanyId &&
                companies.length === 0 &&
                !location.pathname.includes("/admin/fleet") ? (
                <div className="text-center py-12 bg-white dark:bg-[#09090b] rounded-3xl border border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none">
                  <div className="mx-auto w-16 h-16 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 text-blue-500 flex items-center justify-center rounded-full mb-4">
                    <Truck size={32} />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-[#fafafa] mb-2">
                    Nenhuma frota cadastrada
                  </h2>
                  <p className="text-gray-500 dark:text-[#a1a1aa] mb-6">
                    Crie sua primeira empresa/frota para começar a gerenciar.
                  </p>
                  <button
                    onClick={() =>
                      navigate("/admin/fleet", {
                        state: { activeTab: "operations" },
                      })
                    }
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
                  >
                    Criar Primeira Frota
                  </button>
                </div>
              ) : (
                <Outlet />
              )}
            </div>
          </div>
        </main>
      </div>

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </div>
  );
}
