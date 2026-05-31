import React, { useState } from "react";
import { useAppStore } from "../../../context/AppContext";
import { Button } from "../../../components/ui/Button";
import {
  PackageOpen,
  X,
  PlayCircle,
  CheckSquare,
  Square,
  Truck,
  Users,
  CalendarClock,
  Briefcase,
} from "lucide-react";

interface Props {
  onClose: () => void;
  preselectedDriverId?: string;
  preselectedContractId?: string;
}

export default function AssignJobModal({
  onClose,
  preselectedDriverId,
  preselectedContractId,
}: Props) {
  const {
    contracts,
    users,
    vehicles,
    trailers,
    assignJob,
    activeCompanyId,
    currentUser,
    allCompanyMembers,
  } = useAppStore();

  const [selectedContract, setSelectedContract] = useState(
    preselectedContractId || "",
  );
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>(
    preselectedDriverId ? [preselectedDriverId] : [],
  );
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedTrailer, setSelectedTrailer] = useState(() => {
    if (preselectedContractId) {
      const contract = contracts.find(c => c.id === preselectedContractId);
      return contract?.trailerId || "";
    }
    return "";
  });
  const [customDeadlines, setCustomDeadlines] = useState<
    Record<string, number>
  >({});

  const activeContracts = contracts
    .filter((c) => c.status !== "completed" || true) // Allow all contracts to be valid templates
    .sort((a, b) => a.name.localeCompare(b.name));
  const activeDrivers = users.filter((u) => {
    if (u.status !== "active") return false;
    const member = allCompanyMembers?.find(
      (m) => m.userId === u.id && m.companyId === activeCompanyId,
    );
    if (!member) return false;
    return member.status === "active" && member.roles?.includes("driver");
  });
  const availableVehicles = vehicles;

  const handleContractChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const contractId = e.target.value;
    setSelectedContract(contractId);

    // Auto-select trailer
    const contract = contracts.find((c) => c.id === contractId);
    if (contract && contract.trailerId) {
      setSelectedTrailer(contract.trailerId);
    } else {
      setSelectedTrailer("");
    }
  };

  const selectedContractData = contracts.find((c) => c.id === selectedContract);

  const toggleDriver = (id: string) => {
    setSelectedDrivers((prev) =>
      prev.includes(id)
        ? prev.filter((disabledId) => disabledId !== id)
        : [...prev, id],
    );
  };

  const toggleAllDrivers = () => {
    if (selectedDrivers.length === activeDrivers.length) {
      setSelectedDrivers([]);
    } else {
      setSelectedDrivers(activeDrivers.map((d) => d.id));
    }
  };

  const handleCustomDeadlineChange = (driverId: string, value: string) => {
    const days = parseInt(value, 10);
    if (!isNaN(days) && days > 0) {
      setCustomDeadlines((prev) => ({
        ...prev,
        [driverId]: days,
      }));
    } else if (value === "") {
      setCustomDeadlines((prev) => {
        const next = { ...prev };
        delete next[driverId];
        return next;
      });
    }
  };

  const [isAssigning, setIsAssigning] = useState(false);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !selectedContract ||
      selectedDrivers.length === 0 ||
      !selectedVehicle ||
      isAssigning
    )
      return;

    setIsAssigning(true);
    try {
      await Promise.all(
        selectedDrivers.map((driverId) =>
          assignJob(
            selectedContract,
            driverId,
            selectedVehicle,
            selectedTrailer || undefined,
            customDeadlines[driverId],
          ),
        ),
      );
      onClose();
    } catch (e) {
      console.error(e);
      setIsAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1A1F26] rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-[#2A2F3A] shadow-2xl w-full max-w-5xl max-h-[100vh] sm:max-h-[90vh] flex flex-col relative overflow-hidden">
        <div className="h-1.5 w-full shrink-0 bg-green-500"></div>

        {/* Header */}
        <div className="shrink-0 p-5 sm:p-6 border-b border-gray-100 dark:border-[#2A2F3A] flex items-center justify-between bg-white dark:bg-[#1A1F26] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 dark:bg-green-500/10 dark:border-green-500/20 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center shrink-0">
              <PackageOpen size={20} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-[#fafafa]">
              Nova Operação
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-900 dark:text-[#fafafa] dark:hover:text-[#f4f4f5] hover:bg-gray-100 dark:bg-[#27272a] dark:hover:bg-[#3f3f46]/50 rounded-full transition-colors shrink-0"
          >
            <X size={24} />
          </button>
        </div>

        <form
          onSubmit={handleAssign}
          className="flex flex-col flex-1 overflow-hidden"
        >
          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50 dark:bg-[#1A1F26]">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
              {/* Left Column: Contract & Vehicle */}
              <div className="lg:col-span-5 space-y-6">
                {/* 1. Contrato */}
                <div className="bg-white dark:bg-[#1A1F26] p-5 rounded-2xl border border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none">
                  <div className="flex items-center gap-2 mb-4">
                    <Briefcase size={18} className="text-blue-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-[#fafafa]">
                      1. Contrato Operacional
                    </h3>
                  </div>
                  <select
                    value={selectedContract}
                    onChange={handleContractChange}
                    className="w-full bg-gray-50 dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A] rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-[#0a0a0b] appearance-none transition-colors mb-2"
                    required
                  >
                    <option value="" disabled>
                      Selecione um contrato...
                    </option>
                    {activeContracts.map((c) => {
                      const trailer = trailers.find(
                        (t) => t.id === c.trailerId,
                      );
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} ({trailer ? trailer.name : "S/ Reboque"})
                        </option>
                      );
                    })}
                  </select>
                  {activeContracts.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">
                      Nenhum contrato ativo disponível.
                    </p>
                  )}

                  {selectedContractData && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-[#1A1F26]/80 border border-gray-100 dark:border-[#2A2F3A] rounded-xl flex flex-col gap-2 text-[12px] text-gray-600 dark:text-[#d4d4d8]">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Prazo Padrão</span>
                        <span className="font-semibold text-gray-900 dark:text-[#fafafa]">
                          {selectedContractData.deadlineDays}{" "}
                          {selectedContractData.deadlineDays === 1
                            ? "dia"
                            : "dias"}
                        </span>
                      </div>
                      <div className="h-px w-full bg-gray-200 dark:bg-white/10/50"></div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Entregas</span>
                        <span className="font-semibold text-gray-900 dark:text-[#fafafa]">
                          {selectedContractData.totalDeliveries}
                        </span>
                      </div>
                      <div className="h-px w-full bg-gray-200 dark:bg-white/10/50"></div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Modo</span>
                        <span className="font-semibold text-gray-900 dark:text-[#fafafa]">
                          {selectedContractData.mode === "simple"
                            ? "Livres"
                            : "Planejadas"}
                        </span>
                      </div>
                      <div className="h-px w-full bg-gray-200 dark:bg-white/10/50"></div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Reboque</span>
                        <span
                          className="font-semibold text-gray-900 dark:text-[#fafafa] line-clamp-1 text-right max-w-[120px]"
                          title={
                            selectedContractData.trailerId
                              ? trailers.find(
                                  (t) =>
                                    t.id === selectedContractData.trailerId,
                                )?.name
                              : "Nenhum"
                          }
                        >
                          {selectedContractData.trailerId
                            ? trailers.find(
                                (t) => t.id === selectedContractData.trailerId,
                              )?.name || "Desconhecido"
                            : "Nenhum"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Caminhão */}
                <div className="bg-white dark:bg-[#1A1F26] p-5 rounded-2xl border border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none">
                  <div className="flex items-center gap-2 mb-4">
                    <Truck size={18} className="text-amber-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-[#fafafa]">
                      2. Caminhão Vinculado
                    </h3>
                  </div>
                  <select
                    value={selectedVehicle}
                    onChange={(e) => setSelectedVehicle(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A] rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white dark:focus:bg-[#0a0a0b] appearance-none transition-colors"
                    required
                  >
                    <option value="" disabled>
                      Selecione um veículo...
                    </option>
                    {availableVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  {availableVehicles.length === 0 && (
                    <p className="text-xs text-red-500 mt-2 mb-0">
                      Nenhum veículo cadastrado na frota.
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: Drivers & Deadlines */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                {/* 3. Motoristas */}
                <div className="bg-white dark:bg-[#1A1F26] flex flex-col rounded-2xl border border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none overflow-hidden h-[300px] shrink-0">
                  <div className="p-4 border-b border-gray-100 dark:border-[#2A2F3A] flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 dark:bg-[#1A1F26]/80 gap-3">
                    <div className="flex items-center gap-2">
                      <Users size={18} className="text-green-500" />
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-[#fafafa]">
                          3. Seleção de Motoristas
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-[#a1a1aa] mt-0.5">
                          {selectedDrivers.length} motorista(s) selecionado(s)
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleAllDrivers}
                      className="text-xs text-green-700 hover:text-green-800 dark:text-green-400 font-semibold px-3 py-1.5 bg-green-100 dark:bg-green-500/20 rounded-lg hover:bg-green-200 transition-colors w-full sm:w-auto text-center shrink-0"
                    >
                      {selectedDrivers.length === activeDrivers.length
                        ? "Desmarcar Todos"
                        : "Selecionar Todos"}
                    </button>
                  </div>

                  <div className="overflow-y-auto flex-1 p-2 bg-white dark:bg-[#1A1F26]">
                    {activeDrivers.map((d) => {
                      const isSelected = selectedDrivers.includes(d.id);
                      return (
                        <div
                          key={d.id}
                          onClick={() => toggleDriver(d.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors mb-1 select-none ${isSelected ? "bg-green-50 dark:bg-green-500/10 dark:border-green-500/20/80 border border-green-100/50" : "hover:bg-gray-50 dark:hover:bg-[#3f3f46] border border-transparent"}`}
                        >
                          <div className="text-green-600 dark:text-green-400 shrink-0">
                            {isSelected ? (
                              <CheckSquare
                                size={18}
                                fill="currentColor"
                                stroke="white"
                              />
                            ) : (
                              <Square size={18} className="text-gray-300" />
                            )}
                          </div>
                          <div className="flex-1 flex items-center gap-3 min-w-0">
                            {d.photoURL || d.avatar ? (
                              <img
                                src={d.photoURL || d.avatar}
                                alt="."
                                className="w-8 h-8 rounded-full border border-gray-200 dark:border-[#2A2F3A] object-cover shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#18181b] flex items-center justify-center text-gray-600 dark:text-[#d4d4d8] text-xs font-bold border border-gray-200 dark:border-[#2A2F3A] shrink-0">
                                {d.name.substring(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="truncate">
                              <span
                                className={`text-sm font-medium truncate flex items-center gap-1.5 ${isSelected ? "text-gray-900 dark:text-[#fafafa]" : "text-gray-700 dark:text-[#d4d4d8]"}`}
                              >
                                {d.name}
                                <span
                                  title={
                                    d.isOnline
                                      ? "Disponível (Online)"
                                      : "Offline"
                                  }
                                  className={`w-2 h-2 rounded-full shrink-0 ${d.isOnline ? "bg-[#32D74B]" : "bg-gray-300 dark:bg-[#52525b]"}`}
                                ></span>
                              </span>
                              <span className="text-xs text-gray-500 dark:text-[#a1a1aa] truncate block">
                                Nível {d.level}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {activeDrivers.length === 0 && (
                      <div className="p-6 text-center text-sm text-gray-500 dark:text-[#a1a1aa]">
                        Nenhum motorista ativo disponível.
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Prazos Individuais */}
                {selectedDrivers.length > 0 && selectedContractData && (
                  <div className="bg-white dark:bg-[#1A1F26] flex flex-col rounded-2xl border border-gray-200 dark:border-[#2A2F3A] shadow-sm dark:shadow-none overflow-hidden flex-1 min-h-[220px]">
                    <div className="p-4 border-b border-gray-100 dark:border-[#2A2F3A] bg-gray-50 dark:bg-[#1A1F26]/80 shrink-0">
                      <div className="flex items-center gap-2">
                        <CalendarClock size={18} className="text-purple-500" />
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#fafafa]">
                            4. Prazos Individuais
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-[#a1a1aa] mt-0.5">
                            Defina prazos específicos. (Opcional - Padrão:{" "}
                            {selectedContractData.deadlineDays}{" "}
                            {selectedContractData.deadlineDays === 1
                              ? "dia"
                              : "dias"}
                            )
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-y-auto p-4 space-y-3 bg-white dark:bg-[#1A1F26] flex-1">
                      {selectedDrivers.map((driverId) => {
                        const d = users.find((u) => u.id === driverId);
                        if (!d) return null;

                        const currentDays =
                          customDeadlines[driverId] ||
                          selectedContractData.deadlineDays;
                        const expectedDate = new Date();
                        expectedDate.setDate(
                          expectedDate.getDate() + currentDays,
                        );
                        const isCustom =
                          customDeadlines[driverId] !== undefined;

                        return (
                          <div
                            key={driverId}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border transition-colors gap-4 ${isCustom ? "bg-purple-50/30 border-purple-100" : "bg-gray-50 dark:bg-[#1A1F26] border-gray-100 dark:border-[#2A2F3A] hover:bg-gray-50 dark:hover:bg-[#3f3f46]"}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {d.photoURL || d.avatar ? (
                                <img
                                  src={d.photoURL || d.avatar}
                                  alt="."
                                  className="w-8 h-8 rounded-full border border-gray-200 dark:border-[#2A2F3A] object-cover shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 text-xs font-bold border border-blue-200 dark:border-blue-500/30 shrink-0">
                                  {d.name.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <span className="font-medium text-gray-900 dark:text-[#fafafa] text-sm truncate">
                                {d.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="relative">
                                <input
                                  type="number"
                                  min="1"
                                  value={customDeadlines[driverId] || ""}
                                  placeholder={String(
                                    selectedContractData.deadlineDays,
                                  )}
                                  onChange={(e) =>
                                    handleCustomDeadlineChange(
                                      d.id,
                                      e.target.value,
                                    )
                                  }
                                  className="w-28 bg-white dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A] text-sm font-semibold text-gray-900 dark:text-[#fafafa] rounded-lg py-2 pl-3 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-shadow dark:shadow-none shadow-sm dark:shadow-none"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-[#a1a1aa] font-medium">
                                  dias
                                </span>
                              </div>
                              <div className="hidden sm:flex text-xs text-gray-600 dark:text-[#d4d4d8] bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] px-3 py-2 rounded-lg min-w-[130px] justify-center items-center shadow-sm dark:shadow-none">
                                <span className="text-center leading-tight">
                                  Termina em <br />
                                  <strong
                                    className={`text-gray-900 dark:text-[#fafafa] ${isCustom ? "text-purple-700 dark:text-purple-400" : ""}`}
                                  >
                                    {expectedDate.toLocaleDateString("pt-BR")}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer (Actions) */}
          <div className="shrink-0 p-5 sm:p-6 border-t border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26] flex flex-col-reverse sm:flex-row justify-end gap-3 z-10">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="w-full sm:w-auto text-gray-600 dark:text-[#d4d4d8] px-6 py-2.5"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white px-8 py-2.5 gap-2 shadow-sm dark:shadow-none font-medium"
              disabled={
                !selectedContract ||
                selectedDrivers.length === 0 ||
                !selectedVehicle ||
                isAssigning
              }
            >
              <PlayCircle size={18} />
              {isAssigning
                ? "Processando..."
                : `Iniciar ${selectedDrivers.length > 1 ? "Operações" : "Operação"}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
