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
  Activity,
} from "lucide-react";
import OperationsTab from "./fleet/OperationsTab";
import CompanyTab from "./fleet/CompanyTab";
import VehiclesTab from "./fleet/VehiclesTab";
import TrailersTab from "./fleet/TrailersTab";
import DriversTab from "./fleet/DriversTab";
import ContractsTab from "./fleet/ContractsTab";
import RecruitmentTab from "./fleet/RecruitmentTab";
import TripHistory from "../driver/TripHistory";
import { toast } from "sonner";

type Tab = "operations" | "company" | "fleet" | "hr" | "history" | "reports";

type FleetTab = "drivers" | "contracts" | "vehicles" | "trailers";

const tabOptions = [
  { id: "operations", label: "Painel Operacional", icon: LayoutDashboard },
  { id: "company", label: "Visão Geral", icon: LayoutGrid },
  { id: "hr", label: "Recursos Humanos", icon: Building2 },
  { id: "fleet", label: "Frota", icon: Truck },
  { id: "history", label: "Histórico de Viagens", icon: FileText },
  { id: "reports", label: "Relatórios", icon: Activity },
];

const fleetOptions = [
  { id: "drivers", label: "Funcionários", icon: Users },
  { id: "contracts", label: "Contratos", icon: FileText },
  { id: "vehicles", label: "Veículos", icon: Truck },
  { id: "trailers", label: "Reboques", icon: Container },
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
  const [activeFleetTab, setActiveFleetTab] = useState<FleetTab>("drivers");
  const [editContractId, setEditContractId] = useState<string | null>(null);
  const [preselectedDriverId, setPreselectedDriverId] = useState<string | null>(null);
  const [preselectedContractId, setPreselectedContractId] = useState<string | null>(null);
  const [isTabMenuOpen, setIsTabMenuOpen] = useState(false);
  const [isFleetMenuOpen, setIsFleetMenuOpen] = useState(false);
  const [isSimulatorMenuOpen, setIsSimulatorMenuOpen] = useState(false);
  const [isRecruitmentFormOpen, setIsRecruitmentFormOpen] = useState(false);
  const [isTripDetailsOpen, setIsTripDetailsOpen] = useState(false);

  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const unreadCount = notifications.filter((n) => !n.lida).length;

  const isStillLoading =
    !activeCompany &&
    (activeCompanyId ||
      currentUser?.companyId ||
      (memberships && memberships.length > 0));

  useEffect(() => {
    if (location.state && Object.keys(location.state).length > 0) {
      if (location.state.activeTab) {
        const tab = location.state.activeTab;
        if (["drivers", "contracts", "vehicles", "trailers"].includes(tab)) {
          setActiveTab("fleet");
          setActiveFleetTab(tab as FleetTab);
        } else {
          setActiveTab(tab as Tab);
        }
      }
      if (location.state.editContractId) {
        setEditContractId(location.state.editContractId);
      }
      navigate(location.pathname, { replace: true, state: undefined });
    }
  }, [location.state, location.pathname, navigate]);

  const activeTabDetails =
    tabOptions.find((t) => t.id === activeTab) || tabOptions[0];
  const ActiveIcon = activeTabDetails.icon;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#09090b] font-sans pb-8 w-full box-border">
      <div className="max-w-3xl mx-auto flex flex-col gap-4 pt-4 sm:pt-6 w-full px-4 sm:px-4 md:px-0 box-border">
        {/* Company Main Card */}
        {activeCompany && !isRecruitmentFormOpen && !isTripDetailsOpen && (
          <div className="bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-[14px] sm:rounded-[16px] flex flex-col shadow-sm relative z-30 w-full box-border">
            <div className="p-3 sm:p-4 flex items-start sm:items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-900 dark:bg-[#2A2F3A] rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-[#3A3F4A] shadow-sm relative">
                  {activeCompany.logoUrl ? (
                    <img
                      src={activeCompany.logoUrl}
                      alt="Logo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-base sm:text-lg font-bold text-white tracking-tighter">
                      {activeCompany.companyName?.substring(0, 2).toUpperCase() || "NV"}
                    </span>
                  )}
                </div>
                <div className="flex flex-col flex-1 min-w-0 justify-center">
                  <div className="flex items-center gap-1.5 w-full">
                    <h2 className="text-[11px] sm:text-[13px] font-bold text-slate-900 dark:text-white leading-none whitespace-nowrap">
                      {activeCompany.companyName}
                    </h2>
                    <ShieldCheck
                      size={14}
                      className="text-blue-500 shrink-0"
                      fill="currentColor"
                    />
                  </div>
                  <p className="text-[9px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-1 whitespace-nowrap">
                    CNPJ {activeCompany.cnpj || "12.345.678/0001-90"}
                  </p>
                </div>
              </div>

              <div className="flex items-center pl-3 sm:pl-4 border-l border-slate-200 dark:border-[#2A2F3A] shrink-0 w-auto">
                <div className="flex flex-col w-auto min-w-0 justify-center">
                  <span className="text-[8px] sm:text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-0.5 px-0.5 whitespace-nowrap">
                    Simulador
                  </span>
                  <button
                    onClick={() => setIsSimulatorMenuOpen(!isSimulatorMenuOpen)}
                    className="flex items-center justify-between gap-1.5 bg-slate-50 dark:bg-[#1A1F26] hover:bg-slate-100 dark:hover:bg-[#2A2F3A] transition-colors border border-slate-200 dark:border-[#2A2F3A] shadow-sm rounded-md px-1.5 py-1 w-auto active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Truck
                        size={10}
                        className="text-slate-500 dark:text-slate-400 shrink-0"
                      />
                      <span className="text-[9px] sm:text-[10px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {activeCompany.simulatorName || "G. Truck"}
                      </span>
                    </div>
                    <ChevronDown
                      size={10}
                      className={cn(
                        "text-slate-400 shrink-0 transition-transform ml-1",
                        isSimulatorMenuOpen && "rotate-180",
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>

            {isSimulatorMenuOpen && (
              <div className="border-t border-slate-100 dark:border-[#2A2F3A] p-2 sm:p-3 bg-slate-50/50 dark:bg-[#1A1F26]/50 rounded-b-[14px] sm:rounded-b-[16px] animate-in fade-in slide-in-from-top-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-2">Selecione o Simulador:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {companies
                    .filter((c) =>
                      memberships?.some(
                        (m) =>
                          m.companyId === c.id &&
                          (m.roles?.includes("admin") || m.roles?.includes("owner" as any)),
                      ),
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
                            "w-full flex items-center justify-between px-3 py-2 border border-transparent rounded-md transition-colors text-left",
                            isSelected
                              ? "bg-white dark:bg-[#2A2F3A] border-slate-200 dark:border-[#3A3F4A] shadow-sm"
                              : "hover:bg-white dark:hover:bg-[#2A2F3A] hover:border-slate-200 dark:hover:border-[#3A3F4A]",
                          )}
                        >
                          <span
                            className={cn(
                              "text-[11px] sm:text-[12px] font-semibold truncate mr-2",
                              isSelected
                                ? "text-slate-900 dark:text-white"
                                : "text-slate-600 dark:text-slate-300",
                            )}
                          >
                            {c.simulatorName || "Global Truck"}
                          </span>
                          {isSelected && (
                            <Check
                              size={14}
                              className="text-blue-600 dark:text-blue-400 shrink-0"
                            />
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Custom Tab Selector */}
        {activeCompany && !isRecruitmentFormOpen && !isTripDetailsOpen && (
          <div className="w-full flex flex-col gap-2 sm:gap-3 mb-4 z-20">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Primary Tab Selector */}
              <div className="min-w-0 flex-1 sm:flex-none">
                <button
                  onClick={() => setIsTabMenuOpen(!isTabMenuOpen)}
                  className="w-full sm:w-auto h-9 bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg px-3 flex items-center justify-center sm:justify-start gap-2 shadow-sm focus:outline-none transition-colors hover:bg-slate-50 dark:hover:bg-[#2A2F3A]"
                >
                  <ActiveIcon
                    size={14}
                    className="text-slate-600 dark:text-slate-400 shrink-0"
                  />
                    <span className="text-[11px] sm:text-[12px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {activeTabDetails.label}
                    </span>
                  <ChevronDown
                    size={14}
                    className={cn(
                      "text-slate-400 shrink-0 transition-transform",
                      isTabMenuOpen && "rotate-180",
                    )}
                  />
                </button>
              </div>

              {/* Sub-selector for Fleet */}
              {activeTab === "fleet" && (
                <div className="min-w-0 flex-1 sm:flex-none animate-in fade-in slide-in-from-left-2">
                  <button
                    onClick={() => setIsFleetMenuOpen(!isFleetMenuOpen)}
                    className="w-full sm:w-auto h-9 bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg px-3 flex items-center justify-center sm:justify-start gap-2 shadow-sm focus:outline-none transition-colors hover:bg-slate-50 dark:hover:bg-[#2A2F3A]"
                  >
                    {fleetOptions.find((o) => o.id === activeFleetTab)?.icon &&
                      React.createElement(
                        fleetOptions.find((o) => o.id === activeFleetTab)!.icon,
                        {
                          size: 14,
                          className:
                            "text-slate-600 dark:text-slate-400 shrink-0",
                        },
                      )}
                    <span className="text-[11px] sm:text-[12px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {fleetOptions.find((o) => o.id === activeFleetTab)?.label}
                    </span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        "text-slate-400 shrink-0 transition-transform",
                        isFleetMenuOpen && "rotate-180",
                      )}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Dropdown in normal document flow for Tab Menu */}
            {isTabMenuOpen && (
              <div className="w-full bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2">
                {tabOptions.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (tab.id === "reports") {
                          navigate("/admin/reports");
                        } else {
                          setActiveTab(tab.id as Tab);
                        }
                        setIsTabMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-100 dark:border-[#2A2F3A]/60 last:border-0 hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors text-left",
                        activeTab === tab.id
                          ? "bg-slate-50 dark:bg-[#2A2F3A]"
                          : "",
                      )}
                    >
                      <Icon
                        size={14}
                        className={cn(
                          activeTab === tab.id
                            ? "text-blue-600"
                            : "text-slate-500",
                        )}
                      />
                      <span
                        className={cn(
                          "text-[12px] font-semibold whitespace-nowrap",
                          activeTab === tab.id
                            ? "text-blue-700 dark:text-blue-400"
                            : "text-slate-600 dark:text-slate-300",
                        )}
                      >
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Dropdown in normal document flow for Fleet Menu */}
            {isFleetMenuOpen && activeTab === "fleet" && (
              <div className="w-full bg-white dark:bg-[#1A1F26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2">
                {fleetOptions.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = activeFleetTab === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setActiveFleetTab(opt.id as FleetTab);
                        setIsFleetMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-100 dark:border-[#2A2F3A]/60 last:border-0 hover:bg-slate-50 dark:hover:bg-[#2A2F3A] transition-colors text-left",
                        isSelected ? "bg-slate-50 dark:bg-[#2A2F3A]" : "",
                      )}
                    >
                      <Icon
                        size={14}
                        className={cn(
                          isSelected ? "text-blue-600" : "text-slate-500",
                        )}
                      />
                      <span
                        className={cn(
                          "text-[12px] font-semibold whitespace-nowrap",
                          isSelected
                            ? "text-blue-700 dark:text-blue-400"
                            : "text-slate-600 dark:text-slate-300",
                        )}
                      >
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="relative z-10">
          {activeTab === "operations" && <OperationsTab />}
          {activeTab === "company" && <CompanyTab />}
          {activeTab === "hr" && <RecruitmentTab onFormOpen={setIsRecruitmentFormOpen} />}
          {activeTab === "history" && <TripHistory isInsideAdminTab={true} onTripDetailsOpen={setIsTripDetailsOpen} />}

          {activeTab === "fleet" && (
            <div className="space-y-4">
              {activeFleetTab === "drivers" && <DriversTab />}
              {activeFleetTab === "contracts" && (
                <ContractsTab
                  editContractId={editContractId}
                  onEditComplete={() => setEditContractId(null)}
                />
              )}
              {activeFleetTab === "vehicles" && <VehiclesTab />}
              {activeFleetTab === "trailers" && <TrailersTab />}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
