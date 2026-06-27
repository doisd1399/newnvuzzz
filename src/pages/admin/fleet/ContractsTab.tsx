import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../../context/AppContext";
import { Card, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import {
  FileText,
  Plus,
  X,
  MapPin,
  Trash2,
  Pencil,
  Search,
  MoreVertical,
  PlayCircle,
  Edit2,
  Trash,
  Truck,
  Filter,
} from "lucide-react";

interface ContractsTabProps {
  editContractId?: string | null;
  onEditComplete?: () => void;
}

export default function ContractsTab({
  editContractId,
  onEditComplete,
}: ContractsTabProps = {}) {
  const {
    contracts,
    createContract,
    updateContract,
    deleteContract,
    trailers,
    companies,
    activeCompanyId,
  } = useAppStore();
  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [trailerFilter, setTrailerFilter] = useState("all");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [contractToDelete, setContractToDelete] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState("");

  const filteredContracts = contracts
    .filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.simulator.toLowerCase().includes(search.toLowerCase());
      const matchesTrailer =
        trailerFilter === "all" ||
        (trailerFilter === "none" && !c.trailerId) ||
        c.trailerId === trailerFilter;

      return matchesSearch && matchesTrailer;
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="bg-green-50 dark:bg-green-500/10 dark:border-green-500/20 border border-green-200 text-green-800 dark:text-green-400 rounded-xl p-4 flex justify-between items-center shadow-sm dark:shadow-none">
          <span className="font-medium text-sm">{successMsg}</span>
          <button
            onClick={() => setSuccessMsg("")}
            className="text-green-600 hover:text-green-800 dark:text-green-400"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 flex-1">
          <div className="relative flex-1 max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Search size={16} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-9 pr-3 h-9 border border-gray-200 dark:border-[#2A2F3A] rounded-lg leading-5 bg-white dark:bg-[#1A1F26] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[13px] transition-colors"
              placeholder="Buscar contrato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative min-w-[180px]">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Filter size={14} className="text-gray-400" />
            </div>
            <select
              className="block w-full pl-8 pr-8 h-9 border border-gray-200 dark:border-[#2A2F3A] rounded-lg bg-white dark:bg-[#1A1F26] text-gray-700 dark:text-[#d4d4d8] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[13px] transition-colors appearance-none"
              value={trailerFilter}
              onChange={(e) => setTrailerFilter(e.target.value)}
            >
              <option value="all">Todos os reboques</option>
              <option value="none">Qualquer reboque</option>
              {trailers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-gray-400">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>
        </div>
        <Button
          onClick={() => {
            navigate("/admin/contract/new");
          }}
          className="gap-1.5 h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm dark:shadow-none shrink-0 px-4 rounded-lg text-[13px] font-medium transition-all"
        >
          <Plus size={16} />
          Novo Contrato
        </Button>
      </div>

      {filteredContracts.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-[#1A1F26] rounded-2xl border border-gray-200 dark:border-[#2A2F3A] border-dashed">
          <div className="mx-auto w-16 h-16 bg-gray-50 dark:bg-[#1A1F26] rounded-full flex items-center justify-center text-gray-400 mb-4">
            <FileText size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-[#fafafa]">
            Nenhum contrato encontrado
          </h3>
          <p className="text-gray-500 dark:text-[#a1a1aa] mt-1 max-w-sm mx-auto">
            Tente ajustar sua busca ou crie um novo contrato.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
          {filteredContracts.map((contract) => {
            const contractTrailer = trailers.find(
              (t) => t.id === contract.trailerId,
            );

            return (
              <Card
                key={contract.id}
                className="rounded-2xl border border-gray-200 dark:border-[#2A2F3A]/80 shadow-sm dark:shadow-none relative overflow-hidden bg-white dark:bg-[#1A1F26] hover:border-gray-300 dark:border-[#52525b] hover:shadow-md dark:shadow-none transition-all cursor-pointer group"
                onClick={() => navigate(`/admin/contract/${contract.id}`)}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div className="pr-8">
                      <h3 className="font-bold text-gray-900 dark:text-[#fafafa] text-[15px] sm:text-[16px] leading-tight mb-1 line-clamp-2">
                        {contract.name}
                      </h3>
                      <p className="text-[13px] font-medium text-gray-500 dark:text-[#a1a1aa] truncate flex items-center gap-1.5">
                        <Truck size={14} className="text-gray-400" />
                        {contractTrailer
                          ? contractTrailer.name
                          : "Qualquer reboque"}
                      </p>
                    </div>

                    <div
                      className="absolute top-3 right-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() =>
                          setOpenDropdownId(
                            openDropdownId === contract.id ? null : contract.id,
                          )
                        }
                        className="p-1.5 text-gray-400 hover:text-gray-700 dark:text-[#d4d4d8] dark:hover:text-[#d4d4d8] hover:bg-gray-100 dark:bg-[#27272a] dark:hover:bg-[#3f3f46]/50 rounded-full transition-colors"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {openDropdownId === contract.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent backdrop-blur-[1px] sm:backdrop-blur-none transition-opacity"
                            onClick={() => setOpenDropdownId(null)}
                          ></div>
                          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] max-w-[300px] sm:absolute sm:right-0 sm:left-auto sm:top-8 sm:bottom-auto sm:-translate-x-0 sm:-translate-y-0 sm:w-48 bg-white dark:bg-[#1A1F26] border border-gray-200 dark:border-[#2A2F3A] rounded-2xl sm:rounded-xl shadow-2xl sm:shadow-lg dark:shadow-none z-50 py-2 sm:py-1 origin-center sm:origin-top-right animate-in fade-in zoom-in-95 duration-200 sm:duration-100">
                            <button
                              onClick={() => {
                                setOpenDropdownId(null);
                                navigate("/admin/assign", {
                                  state: {
                                    preselectedContractId: contract.id,
                                  },
                                });
                              }}
                              className="w-full text-left px-5 py-3.5 sm:px-4 sm:py-2 text-[15px] sm:text-[13px] font-medium text-gray-700 dark:text-[#d4d4d8] hover:bg-gray-50 dark:bg-[#1A1F26] dark:hover:bg-[#3f3f46] flex items-center gap-3 sm:gap-2"
                            >
                              <PlayCircle size={14} className="text-blue-500" />
                              Designar Trabalho
                            </button>
                            <button
                              onClick={() => {
                                setOpenDropdownId(null);
                                navigate(`/admin/contract/${contract.id}/edit`);
                              }}
                              className="w-full text-left px-5 py-3.5 sm:px-4 sm:py-2 text-[15px] sm:text-[13px] font-medium text-gray-700 dark:text-[#d4d4d8] hover:bg-gray-50 dark:bg-[#1A1F26] dark:hover:bg-[#3f3f46] flex items-center gap-3 sm:gap-2"
                            >
                              <Edit2
                                size={14}
                                className="text-gray-500 dark:text-[#a1a1aa]"
                              />
                              Editar Contrato
                            </button>
                            <div className="h-px w-full bg-gray-100 dark:bg-[#18181b] my-1"></div>
                            <button
                              onClick={() => {
                                setOpenDropdownId(null);
                                setContractToDelete(contract.id);
                              }}
                              className="w-full text-left px-5 py-3.5 sm:px-4 sm:py-2 text-[15px] sm:text-[13px] font-medium text-red-600 hover:bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 flex items-center gap-3 sm:gap-2"
                            >
                              <Trash size={14} className="text-red-500" />
                              Excluir Contrato
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 dark:text-[#fafafa] bg-gray-50 dark:bg-[#1A1F26]/80 p-2.5 rounded-lg border border-gray-100 dark:border-[#2A2F3A]">
                    <span>{contract.totalDeliveries} entregas</span>
                    <span className="text-gray-300">•</span>
                    <span>{contract.deadlineDays} dias</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {contractToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1A1F26] rounded-2xl shadow-xl w-full max-w-[320px] p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-500/20 text-red-600 rounded-full flex items-center justify-center mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-[#fafafa] mb-2">Excluir Contrato?</h3>
            <p className="text-[13px] text-gray-500 dark:text-[#a1a1aa] mb-6">
              Esta ação não pode ser desfeita e todas as informações vinculadas serão removidas.
            </p>
            <div className="flex items-center gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1 h-10 border-gray-200 dark:border-[#2A2F3A] hover:bg-gray-50 dark:hover:bg-[#3f3f46] text-gray-700 dark:text-[#d4d4d8] font-semibold text-[13px]"
                onClick={() => setContractToDelete(null)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white font-semibold text-[13px]"
                onClick={() => {
                  deleteContract(contractToDelete);
                  setContractToDelete(null);
                  setSuccessMsg("Contrato excluído com sucesso.");
                  setTimeout(() => setSuccessMsg(""), 3000);
                }}
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
