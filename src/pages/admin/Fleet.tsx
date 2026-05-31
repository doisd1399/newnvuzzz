import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../context/AppContext";
import {
  ChevronLeft,
  Bell,
  ChevronDown,
  LayoutGrid,
  LayoutDashboard,
  FileText,
  Truck,
  Container,
  Users,
  Building2,
  ShieldCheck,
  Gamepad2,
  Check,
  RefreshCw,
} from "lucide-react";
import OperationsTab from "./fleet/OperationsTab";
import CompanyTab from "./fleet/CompanyTab";
import VehiclesTab from "./fleet/VehiclesTab";
import TrailersTab from "./fleet/TrailersTab";
import DriversTab from "./fleet/DriversTab";
import ContractsTab from "./fleet/ContractsTab";
import RecruitmentTab from "./fleet/RecruitmentTab";
import { toast } from "sonner";

type Tab = "operations" | "company" | "contracts" | "vehicles" | "trailers" | "drivers" | "hr";

const tabOptions = [
  { id: "operations", label: "Painel Operacional", icon: LayoutDashboard },
  { id: "company", label: "Visão Geral", icon: LayoutGrid },
  { id: "hr", label: "Recursos Humanos", icon: Building2 },
  { id: "drivers", label: "Funcionários", icon: Users },
  { id: "contracts", label: "Contratos", icon: FileText },
  { id: "vehicles", label: "Veículos", icon: Truck },
  { id: "trailers", label: "Reboques", icon: Container }
];

export default function Fleet() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    activeCompanyId,
    setActiveCompanyId,
    companies,
    currentUser,
    notifications,
    syncCompanyData,
    memberships,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("operations");
  const [editContractId, setEditContractId] = useState<string | null>(null);
  const [isTabMenuOpen, setIsTabMenuOpen] = useState(false);
  const [isSimulatorMenuOpen, setIsSimulatorMenuOpen] = useState(false);

  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const unreadCount = notifications.filter((n) => !n.lida).length;

  const isStillLoading = !activeCompany && (activeCompanyId || currentUser?.companyId || (memberships && memberships.length > 0));

  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab as Tab);
      if (location.state?.editContractId) {
        setEditContractId(location.state.editContractId);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const activeTabDetails =
    tabOptions.find((t) => t.id === activeTab) || tabOptions[0];
  const ActiveIcon = activeTabDetails.icon;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#09090b] font-sans pb-20 w-full box-border">
      <div className="max-w-3xl mx-auto space-y-4 pt-4 sm:pt-0 w-full px-4 sm:px-4 md:px-0 box-border">
        {/* Company Main Card */}
        {activeCompany && (
          <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[16px] sm:rounded-[20px] p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-3 shadow-sm relative z-30 w-full box-border overflow-visible">
            <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto flex-1">
              <div className="w-12 h-12 bg-slate-900 dark:bg-[#2A2F3A] rounded-xl overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-[#3A3F4A] shadow-sm relative">
                {activeCompany.logoUrl ? (
                  <img src={activeCompany.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-white tracking-tighter">
                    {activeCompany.fleetName?.substring(0, 2).toUpperCase() ||
                      "NV"}
                  </span>
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 w-full">
                  <h2 className="text-[15px] sm:text-[16px] font-bold text-slate-900 dark:text-white leading-tight truncate">
                    {activeCompany.fleetName}
                  </h2>
                  <ShieldCheck
                    size={14}
                    className="text-blue-500 shrink-0"
                    fill="currentColor"
                  />
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate">
                  CNPJ {activeCompany.cnpj || "12.345.678/0001-90"}
                </p>
              </div>
            </div>

            <div className="flex items-center sm:pl-4 sm:border-l border-slate-200 dark:border-[#2A2F3A] shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 mt-2 sm:mt-0">
              <div className="flex flex-col relative w-full sm:w-[180px]">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1">
                  Simulador
                </span>
                <button
                  onClick={() => setIsSimulatorMenuOpen(!isSimulatorMenuOpen)}
                  className="flex items-center justify-between gap-1.5 bg-slate-50 dark:bg-[#1A1F26] hover:bg-slate-100 dark:hover:bg-[#2A2F3A] transition-colors border border-slate-200 dark:border-[#2A2F3A] shadow-sm rounded-[10px] px-2.5 py-1.5 w-full active:scale-[0.98]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Truck
                      size={14}
                      className="text-slate-500 dark:text-slate-400 shrink-0"
                    />
                    <span className="text-[12px] sm:text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {activeCompany.simulatorName || "Global Truck"}
                    </span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={cn(
                      "text-slate-400 shrink-0 transition-transform",
                      isSimulatorMenuOpen && "rotate-180",
                    )}
                  />
                </button>

                {isSimulatorMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setIsSimulatorMenuOpen(false)}
                    />
                    <div className="absolute right-0 left-0 sm:left-auto top-[calc(100%+8px)] w-full sm:w-[180px] bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[16px] shadow-xl z-[70] overflow-hidden animate-in fade-in zoom-in-95 origin-top-right">
                      {companies
                        .filter((c) =>
                          currentUser?.roles?.includes("admin") ||
                          memberships?.some(m => m.companyId === c.id && m.roles?.includes("admin"))
                        )
                        .map((c) => {
                          const isSelected = c.id === activeCompanyId;
                          return (
                            <button
                              key={c.id}
                              onClick={() => {
                                setActiveCompanyId(c.id);
                                setIsSimulatorMenuOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-4 py-3 border-b border-slate-50 dark:border-[#2A2F3A]/50 last:border-0 hover:bg-slate-50 dark:hover:bg-[#2A2F3A]/30 transition-colors text-left",
                                isSelected
                                  ? "bg-slate-50 dark:bg-[#2A2F3A]"
                                  : "",
                              )}
                            >
                              <span
                                className={cn(
                                  "text-[13px] sm:text-[14px] font-semibold truncate mr-2",
                                  isSelected
                                    ? "text-slate-900 dark:text-white"
                                    : "text-slate-600 dark:text-slate-300",
                                )}
                              >
                                {c.simulatorName || "Global Truck"}
                              </span>
                              {isSelected && (
                                <Check
                                  size={16}
                                  className="text-blue-600 dark:text-blue-400 shrink-0"
                                />
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Custom Tab Selector */}
        {activeCompany && (
          <div className="relative z-20">
            <button
              onClick={() => setIsTabMenuOpen(!isTabMenuOpen)}
              className="w-full bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[18px] p-4 flex items-center justify-between shadow-sm active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#2A2F3A] text-slate-700 dark:text-slate-300 flex items-center justify-center">
                  <ActiveIcon size={18} />
                </div>
                <span className="text-[16px] font-semibold text-slate-900 dark:text-white">
                  {activeTabDetails.label}
                </span>
              </div>
              <ChevronDown
                size={20}
                className={cn(
                  "text-slate-400 transition-transform",
                  isTabMenuOpen && "rotate-180",
                )}
              />
            </button>

            {isTabMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsTabMenuOpen(false)}
                />
                <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[18px] shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                  {tabOptions.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id as Tab);
                          setIsTabMenuOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-[#2A2F3A] last:border-0 hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors text-left",
                          activeTab === tab.id
                            ? "bg-slate-50 dark:bg-[#2A2F3A]"
                            : "",
                        )}
                      >
                        <div
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                            activeTab === tab.id
                              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                              : "bg-slate-100 dark:bg-[#2A2F3A] text-slate-600 dark:text-slate-400",
                          )}
                        >
                          <Icon size={18} />
                        </div>
                        <span
                          className={cn(
                            "text-[15px] font-semibold",
                            activeTab === tab.id
                              ? "text-slate-900 dark:text-white"
                              : "text-slate-600 dark:text-slate-300",
                          )}
                        >
                          {tab.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="pt-2 relative">
          {activeTab === "operations" && <OperationsTab />}
          {activeTab === "company" && <CompanyTab />}
          {activeTab === "vehicles" && <VehiclesTab />}
          {activeTab === "trailers" && <TrailersTab />}
          {activeTab === "drivers" && <DriversTab />}
          {activeTab === "contracts" && (
            <ContractsTab
              editContractId={editContractId}
              onEditComplete={() => setEditContractId(null)}
            />
          )}
          {activeTab === "hr" && <RecruitmentTab />}
        </div>
      </div>
    </div>
  );
}
