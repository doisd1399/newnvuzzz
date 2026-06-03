import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Filter,
  Settings2,
  Eye,
  Truck,
  Package,
  FileText,
  File,
  X,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  MoreVertical,
  Building2,
  User,
  Gamepad2,
  MapPin,
  ArrowRight,
  DollarSign,
  ChevronUp,
} from "lucide-react";

import { cn } from "../../lib/utils";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { useAppStore } from "../../context/AppContext";

export interface TripRecord {
  id: string;
  empresaId: string;
  empresaNome: string;
  motoristaId: string;
  motoristaNome: string;

  contratoId: string;
  contratoNumero: string;
  contratoDescricao?: string;

  veiculoId: string;
  veiculoNome: string;
  veiculoPlaca?: string;

  reboqueId: string;
  reboqueNome: string;

  origem: string;
  destino: string;
  valor: number;
  comprovanteUrl: string;
  status: string;
  criadoPor: string;
  dataLancamento: any;
  createdAt: any;
}

const DateRangeCalendar = ({
  startDate,
  endDate,
  onChange,
}: {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
}) => {
  const [currentMonth, setCurrentMonth] = useState(startDate || new Date());

  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  ).getDate();
  const firstDayOfMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1,
  ).getDay();

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      day,
    );
    clickedDate.setHours(12, 0, 0, 0); // avoid timezone bugs

    if (!startDate || (startDate && endDate) || clickedDate < startDate) {
      onChange(clickedDate, null);
    } else {
      onChange(startDate, clickedDate);
    }
  };

  const prevMonth = (e: any) => {
    e.preventDefault();
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1),
    );
  };
  const nextMonth = (e: any) => {
    e.preventDefault();
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
    );
  };

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} className="w-8 h-8 md:w-9 md:h-9" />);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      i,
    );
    date.setHours(12, 0, 0, 0);
    const dateMs = date.getTime();

    let startMs = null;
    if (startDate) {
      const startClone = new Date(startDate);
      startClone.setHours(12, 0, 0, 0);
      startMs = startClone.getTime();
    }

    let endMs = null;
    if (endDate) {
      const endClone = new Date(endDate);
      endClone.setHours(12, 0, 0, 0);
      endMs = endClone.getTime();
    }

    const isSelected = startMs === dateMs || endMs === dateMs;
    const isInRange = startMs && endMs && dateMs > startMs && dateMs < endMs;

    let roundedClass = "";
    if (isSelected && !endDate) roundedClass = "rounded-full";
    else if (startMs === dateMs && endMs) roundedClass = "rounded-l-full";
    else if (endMs === dateMs) roundedClass = "rounded-r-full";

    days.push(
      <button
        type="button"
        key={`day-${i}`}
        onClick={() => handleDateClick(i)}
        className={cn(
          "w-8 h-8 md:w-9 md:h-9 text-sm flex items-center justify-center transition-colors relative",
          isInRange ? "bg-blue-50 dark:bg-blue-900/30" : "",
          roundedClass,
          isSelected
            ? "bg-blue-600 text-white font-semibold shadow-sm z-10"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full",
        )}
      >
        {i}
      </button>,
    );
  }

  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  return (
    <div className="bg-white dark:bg-[#121213] border border-gray-200 dark:border-gray-800 rounded-xl p-3 shadow-sm w-full select-none">
      <div className="flex justify-between items-center mb-4">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors hidden sm:block"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={prevMonth}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors sm:hidden"
        >
          <ChevronLeft size={22} />
        </button>
        <span className="font-semibold text-sm text-gray-900 dark:text-white capitalize">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors hidden sm:block"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          onClick={nextMonth}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors sm:hidden"
        >
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 mb-2 place-items-center">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div
            key={`dow-${i}`}
            className="text-center font-medium text-[11px] text-gray-400 w-8 md:w-9"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 place-items-center">{days}</div>
    </div>
  );
};

export default function TripHistory() {
  const navigate = useNavigate();
  const { currentUser, activeCompanyId, activeRole, companies } = useAppStore();
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
  const [editingTrip, setEditingTrip] = useState<TripRecord | null>(null);
  const [deletingTrip, setDeletingTrip] = useState<TripRecord | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  const currentCompany = companies.find((c: any) => c.id === activeCompanyId);

  const [filters, setFilters] = useState({
    simulador: currentCompany?.simulatorName || "",
    empresa: currentCompany?.companyName || "",
    motorista: activeRole === "driver" ? currentUser?.name || "" : "",
    periodoPreset: "mes", // 'todos', 'hoje', '7dias', 'mes', 'data'
    periodoInicio: "",
    periodoFim: "",
  });

  // Backfill for old records
  useEffect(() => {
    const runBackfill = async () => {
      if (!activeCompanyId) return;
      try {
        const qTrips = query(
          collection(db, "historico_viagens"),
          where("empresaId", "==", activeCompanyId),
        );
        const tripsSnap = await getDocs(qTrips);

        let needsMigration = false;
        for (const docSnap of tripsSnap.docs) {
          const t = docSnap.data();
          if (
            !t.veiculoNome ||
            t.veiculoNome === "-" ||
            !t.contratoNumero ||
            t.contratoNumero === "-"
          ) {
            needsMigration = true;
            break;
          }
        }

        if (!needsMigration) return;

        const [vSnap, cSnap, tSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "vehicles"),
              where("companyId", "==", activeCompanyId),
            ),
          ),
          getDocs(
            query(
              collection(db, "contracts"),
              where("companyId", "==", activeCompanyId),
            ),
          ),
          getDocs(
            query(
              collection(db, "trailers"),
              where("companyId", "==", activeCompanyId),
            ),
          ),
        ]);

        const vMap = new Map(vSnap.docs.map((d) => [d.id, d.data()]));
        const cMap = new Map(cSnap.docs.map((d) => [d.id, d.data()]));
        const tMap = new Map(tSnap.docs.map((d) => [d.id, d.data()]));

        const updates = tripsSnap.docs.map(async (docSnap) => {
          const tData = docSnap.data();
          if (
            !tData.veiculoNome ||
            tData.veiculoNome === "-" ||
            !tData.contratoNumero ||
            tData.contratoNumero === "-"
          ) {
            const v = vMap.get(tData.veiculoId);
            const c = cMap.get(tData.contratoId);
            const t = tMap.get(tData.reboqueId);

            const veiculoNome = v
              ? `${v.name || ""}`.trim()
              : "Veículo não encontrado";
            const veiculoPlaca = v?.plate || "";
            const contratoNumero = c ? c.name : "Contrato não encontrado";
            const contratoDescricao = "";
            const reboqueNome = t
              ? `${t.name || ""}`.trim()
              : "Reboque não encontrado";

            await updateDoc(doc(db, "historico_viagens", docSnap.id), {
              veiculoNome,
              veiculoPlaca,
              contratoNumero,
              contratoDescricao,
              reboqueNome,
            });
          }
        });

        await Promise.all(updates);
      } catch (err) {
        console.error("Backfill failed:", err);
      }
    };

    runBackfill();
  }, [activeCompanyId]);

  useEffect(() => {
    if (!currentUser) return;

    let q = query(collection(db, "historico_viagens"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedTrips = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TripRecord[];

        // Sort client-side to avoid composite index requirements in Firestore
        fetchedTrips.sort((a, b) => {
          const dateA = a.createdAt?.toDate
            ? a.createdAt.toDate().getTime()
            : a.createdAt
              ? new Date(a.createdAt).getTime()
              : a.dataLancamento?.toDate
                ? a.dataLancamento.toDate().getTime()
                : new Date(a.dataLancamento || 0).getTime();
          const dateB = b.createdAt?.toDate
            ? b.createdAt.toDate().getTime()
            : b.createdAt
              ? new Date(b.createdAt).getTime()
              : b.dataLancamento?.toDate
                ? b.dataLancamento.toDate().getTime()
                : new Date(b.dataLancamento || 0).getTime();
          return dateB - dateA;
        });

        setTrips(fetchedTrips);
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao buscar histórico de viagens:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser, activeCompanyId, activeRole]);

  // Client-side filtering
  const getTripSimulator = React.useCallback(
    (trip: TripRecord) => {
      const comp = companies.find(
        (c: any) =>
          c.companyName === trip.empresaNome || c.id === trip.empresaId,
      );
      return comp?.simulatorName || "";
    },
    [companies],
  );

  const uniqueEmpresas = React.useMemo(() => {
    const list = trips
      .map((t) => t.empresaNome)
      .filter((v, i, a) => v && v !== "-" && a.indexOf(v) === i)
      .sort((a, b) => a.localeCompare(b));

    // include companies from registry even if no trips yet
    const registryComps = companies
      .map((c: any) => c.companyName)
      .filter(Boolean);
    return Array.from(new Set([...list, ...registryComps])).sort();
  }, [trips, companies]);

  const uniqueMotoristas = React.useMemo(() => {
    if (!filters.empresa) return [];

    const tripDrivers = trips
      .map((t) => {
        if (t.empresaNome === filters.empresa) return t.motoristaNome;
        return null;
      })
      .filter((v, i, a) => v && v !== "-" && a.indexOf(v) === i);

    return tripDrivers.sort((a, b) => a.localeCompare(b));
  }, [trips, filters.empresa]);

  const uniqueSimuladores = React.useMemo(() => {
    // Collect simulators from trips matching current filters
    const matchingTrips = trips.filter((t) => {
      if (filters.empresa && t.empresaNome !== filters.empresa) return false;
      if (filters.motorista && t.motoristaNome !== filters.motorista)
        return false;
      return true;
    });

    let sims = matchingTrips.map((t) => getTripSimulator(t)).filter(Boolean);

    // Also include simulators from companies matching filter
    const matchingComps = companies.filter((c: any) => {
      if (filters.empresa && c.companyName !== filters.empresa) return false;
      return true;
    });
    sims = [
      ...sims,
      ...matchingComps.map((c: any) => c.simulatorName).filter(Boolean),
    ];

    return Array.from(new Set(sims)).sort();
  }, [trips, companies, filters.empresa, filters.motorista, getTripSimulator]);

  const filteredTrips = trips.filter((trip) => {
    if (filters.simulador) {
      const sim = getTripSimulator(trip);
      if (sim.toLowerCase() !== filters.simulador.toLowerCase()) return false;
    }
    if (
      filters.empresa &&
      trip.empresaNome.toLowerCase() !== filters.empresa.toLowerCase()
    ) {
      return false;
    }
    if (
      filters.motorista &&
      trip.motoristaNome.toLowerCase() !== filters.motorista.toLowerCase()
    ) {
      return false;
    }

    let startDate = null;
    let endDate = null;
    const now = new Date();

    if (filters.periodoPreset === "hoje") {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (filters.periodoPreset === "7dias") {
      startDate = new Date();
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (filters.periodoPreset === "mes") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
    } else if (filters.periodoPreset === "data") {
      if (filters.periodoInicio) {
        startDate = new Date(filters.periodoInicio + "T00:00:00");
        if (!filters.periodoFim) {
          endDate = new Date(filters.periodoInicio + "T23:59:59");
        }
      }
      if (filters.periodoFim) {
        endDate = new Date(filters.periodoFim + "T23:59:59");
      }
    }

    if (startDate || endDate) {
      const tripDate = trip.createdAt?.toDate
        ? trip.createdAt.toDate()
        : new Date(trip.createdAt || trip.dataLancamento);
      if (startDate && tripDate < startDate) return false;
      if (endDate && tripDate > endDate) return false;
    }

    return true;
  });

  const totalViagens = filteredTrips.length;
  const faturamentoTotal = filteredTrips.reduce(
    (acc, current) => acc + (current.valor || 0),
    0,
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date
      .toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(". de ", " ")
      .replace(" de ", " ");
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTripEntities = (trip: TripRecord) => {
    return {
      contractName: trip.contratoNumero || "Contrato não encontrado",
      vehicleName: trip.veiculoNome || "Veículo não encontrado",
      trailerName: trip.reboqueNome || "Reboque não encontrado",
    };
  };

  const canEditTrip = (trip: TripRecord) => {
    if (!currentUser) return false;
    if (activeRole === "admin") {
      return trip.empresaId === activeCompanyId;
    }
    if (activeRole === "driver") {
      return trip.motoristaId === currentUser.id;
    }
    return false;
  };

  const canDeleteTrip = (trip: TripRecord) => {
    return canEditTrip(trip);
  };

  const confirmDeleteTrip = async () => {
    if (!deletingTrip) return;
    try {
      await deleteDoc(doc(db, "historico_viagens", deletingTrip.id));
      setDeletingTrip(null);
    } catch (error) {
      console.error("Erro ao deletar viagem:", error);
      alert("Erro ao remover a viagem. Verifique suas permissões.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-[#09090b] min-h-[calc(100vh-3.5rem)] pb-24 md:pb-28 max-w-2xl mx-auto w-full relative">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-4 pt-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-1 -ml-1 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} className="stroke-[2.5]" />
            </button>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              Histórico
            </h1>
          </div>
          <p className="text-[12px] md:text-xs text-gray-500 dark:text-gray-400 pl-8">
            Registro das suas viagens.
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex justify-center items-center h-8 w-11 border rounded-xl shadow-sm transition-colors",
            showFilters
              ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-500/10 dark:border-blue-900 dark:text-blue-400"
              : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800",
          )}
        >
          <Settings2 size={16} className="stroke-[2.5]" />
        </button>
      </div>

      {/* Filter Card inline */}
      {showFilters && (
        <div className="bg-white dark:bg-[#121213] border border-gray-200 dark:border-gray-800 rounded-xl p-3 mb-5 shadow-sm flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Empresa
              </label>
              <select
                value={filters.empresa}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    empresa: e.target.value,
                    motorista: "",
                  })
                }
                className="w-full text-xs font-medium border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors h-8"
              >
                <option value="">Todas</option>
                {uniqueEmpresas.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Motorista
              </label>
              <select
                value={filters.motorista}
                onChange={(e) =>
                  setFilters({ ...filters, motorista: e.target.value })
                }
                disabled={!filters.empresa}
                className="w-full text-xs font-medium border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors h-8 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!filters.empresa ? (
                  <option value="">Selecione uma empresa primeiro</option>
                ) : (
                  <option value="">Todos</option>
                )}
                {filters.empresa &&
                  uniqueMotoristas.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Simulador
              </label>
              <select
                value={filters.simulador}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    simulador: e.target.value,
                  })
                }
                className="w-full text-xs font-medium border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors h-8"
              >
                <option value="">Todos</option>
                {uniqueSimuladores.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
              Período
            </label>
            <div className="flex bg-gray-100/80 dark:bg-gray-800/80 p-0.5 rounded-lg overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {[
                { id: "todos", label: "Tudo" },
                { id: "hoje", label: "Hoje" },
                { id: "7dias", label: "7 Dias" },
                { id: "mes", label: "Esse mês" },
                { id: "data", label: "Data" },
              ].map((preset) => (
                <button
                  key={preset.id}
                  onClick={() =>
                    setFilters({ ...filters, periodoPreset: preset.id })
                  }
                  className={cn(
                    "flex-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap",
                    filters.periodoPreset === preset.id
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {filters.periodoPreset === "data" && (
            <div className="pt-2 animate-in fade-in duration-200 flex justify-center">
              <DateRangeCalendar
                startDate={
                  filters.periodoInicio
                    ? new Date(filters.periodoInicio + "T12:00:00")
                    : null
                }
                endDate={
                  filters.periodoFim
                    ? new Date(filters.periodoFim + "T12:00:00")
                    : null
                }
                onChange={(start, end) =>
                  setFilters({
                    ...filters,
                    periodoInicio: start
                      ? start.toISOString().split("T")[0]
                      : "",
                    periodoFim: end ? end.toISOString().split("T")[0] : "",
                  })
                }
              />
            </div>
          )}
        </div>
      )}

      {/* List Section */}
      <div className="flex flex-col gap-3 pb-32">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="text-center p-8 text-gray-500 bg-white dark:bg-[#121213] rounded-2xl border border-gray-100 dark:border-gray-800">
            Nenhum histórico de viagens encontrado.
          </div>
        ) : (
          filteredTrips.map((trip) => {
            const entities = getTripEntities(trip);

            const getCompanyColor = (name: string) => {
              const colors = [
                "bg-green-500",
                "bg-blue-500",
                "bg-purple-500",
                "bg-orange-500",
                "bg-pink-500",
              ];
              let hash = 0;
              for (let i = 0; i < name.length; i++)
                hash = name.charCodeAt(i) + ((hash << 5) - hash);
              return colors[Math.abs(hash) % colors.length];
            };

            const getInitials = (name: string) => {
              if (!name) return "E";
              const parts = name.trim().split(" ");
              if (parts.length >= 2) {
                return (parts[0][0] + parts[1][0]).toUpperCase();
              }
              return name.slice(0, 2).toUpperCase();
            };

            const comp = companies.find(
              (c: any) =>
                c.companyName === trip.empresaNome || c.id === trip.empresaId,
            );

            return (
              <div
                key={trip.id}
                className="bg-white dark:bg-[#121213] p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-[0_1px_8px_-4px_rgba(0,0,0,0.05)] flex flex-col"
              >
                {/* Top Bar */}
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {comp?.logoUrl ? (
                      <img
                        src={comp.logoUrl}
                        alt={trip.empresaNome || "Empresa"}
                        className="w-7 h-7 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 text-[11px] font-bold tracking-wide",
                          getCompanyColor(trip.empresaNome || "Empresa"),
                        )}
                      >
                        {getInitials(trip.empresaNome || "Empresa")}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight truncate">
                        {trip.empresaNome}
                      </span>
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        Contrato #
                        {entities.contractName
                          .substring(entities.contractName.indexOf("#") + 1)
                          .slice(0, 4) || trip.contratoId?.substring(0, 4)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end shrink-0 ml-2">
                    <CalendarIcon
                      size={10}
                      className="text-gray-400 shrink-0"
                    />
                    <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400 ml-1 whitespace-nowrap">
                      {formatDate(trip.createdAt || trip.dataLancamento)} &bull;{" "}
                      {formatTime(trip.createdAt || trip.dataLancamento)}
                    </span>
                  </div>
                </div>

                <div className="w-full h-px bg-gray-50 dark:bg-gray-800/60" />

                {/* Middle Grid Row 1 */}
                <div className="grid grid-cols-2 py-1.5 relative">
                  <div className="flex items-center gap-2 pr-2 min-w-0">
                    <User
                      size={12}
                      className="text-gray-500 dark:text-gray-400 shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] text-gray-400 font-medium leading-tight mb-[1px]">
                        Motorista
                      </span>
                      <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                        {trip.motoristaNome}
                      </span>
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="absolute left-[50%] top-1.5 bottom-1.5 w-px bg-gray-50 dark:bg-gray-800/60" />

                  <div className="flex items-center gap-2 pl-3 min-w-0">
                    <Gamepad2
                      size={12}
                      className="text-gray-500 dark:text-gray-400 shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] text-gray-400 font-medium leading-tight mb-[1px]">
                        Simulador
                      </span>
                      <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                        {getTripSimulator(trip)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-gray-50 dark:bg-gray-800/60" />

                {/* Middle Grid Row 2 */}
                <div className="grid grid-cols-2 py-1.5 relative">
                  <div className="flex items-center gap-2 pr-2 min-w-0">
                    <Truck
                      size={12}
                      className="text-gray-500 dark:text-gray-400 shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] text-gray-400 font-medium leading-tight mb-[1px]">
                        Veículo
                      </span>
                      <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                        {entities.vehicleName}
                      </span>
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="absolute left-[50%] top-1.5 bottom-1.5 w-px bg-gray-50 dark:bg-gray-800/60" />

                  <div className="flex items-center gap-2 pl-3 min-w-0">
                    <Package
                      size={12}
                      className="text-gray-500 dark:text-gray-400 shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] text-gray-400 font-medium leading-tight mb-[1px]">
                        Reboque
                      </span>
                      <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                        {entities.trailerName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-gray-50 dark:bg-gray-800/60" />

                {/* Origin -> Destination */}
                <div className="flex items-center gap-2 py-1.5">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <MapPin
                      size={12}
                      className="text-green-500 fill-green-500 shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] text-gray-400 font-medium leading-tight mb-[1px]">
                        Origem
                      </span>
                      <span className="text-[11px] font-medium text-gray-900 dark:text-gray-100 truncate">
                        {trip.origem}
                      </span>
                    </div>
                  </div>
                  <ArrowRight
                    size={10}
                    className="text-gray-800 dark:text-gray-400 shrink-0 mx-1"
                  />
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <MapPin
                      size={12}
                      className="text-blue-500 fill-blue-500 shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] text-gray-400 font-medium leading-tight mb-[1px]">
                        Destino
                      </span>
                      <span className="text-[11px] font-medium text-gray-900 dark:text-gray-100 truncate">
                        {trip.destino}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Row (Badges & Actions) */}
                <div className="flex items-center justify-between pt-1.5 mt-auto">
                  <div className="flex items-center gap-1 bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full border border-green-100/50 dark:border-transparent">
                    <div className="w-3 h-3 rounded-full border-[1px] border-green-500 flex items-center justify-center shrink-0">
                      <DollarSign
                        size={8}
                        className="stroke-[3] text-green-500"
                      />
                    </div>
                    <span className="text-[12px] font-bold text-gray-900 dark:text-green-400 tracking-tight">
                      {formatCurrency(trip.valor)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedTrip(trip)}
                      className="w-7 h-6 rounded-lg border border-blue-100/60 dark:border-gray-800 bg-blue-50/50 dark:bg-[#121213] flex items-center justify-center text-blue-500 hover:bg-blue-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Eye size={12} className="stroke-[2]" />
                    </button>
                    {canEditTrip(trip) && (
                      <button
                        onClick={() => setEditingTrip(trip)}
                        className="w-7 h-6 rounded-lg border border-orange-100/60 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-500/5 flex items-center justify-center text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-500/10 transition-colors"
                      >
                        <Pencil size={11} className="stroke-[2]" />
                      </button>
                    )}
                    {canDeleteTrip(trip) && (
                      <button
                        onClick={() => setDeletingTrip(trip)}
                        className="w-7 h-6 rounded-lg border border-red-100/60 dark:border-red-900/30 bg-red-50/50 dark:bg-red-500/5 flex items-center justify-center text-red-500 hover:bg-red-100 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={11} className="stroke-[2]" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Fixed Bottom Summary Bar */}
      <div className="fixed bottom-[env(safe-area-inset-bottom,24px)] left-0 right-0 z-30 flex flex-col items-center pointer-events-none md:left-64">
        {/* Expanded Summary Card */}
        <div
          className={cn(
            "bg-white dark:bg-[#121213] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.12)] transition-all duration-300 overflow-hidden pointer-events-auto",
            isSummaryExpanded
              ? "max-h-[500px] opacity-100 scale-100 mb-3"
              : "max-h-0 opacity-0 scale-95 mb-0",
          )}
        >
          <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-gray-800/50">
            <div className="bg-white dark:bg-[#121213] p-4 flex items-center gap-3 min-w-[150px] sm:min-w-[180px]">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                <File size={18} className="text-blue-500 fill-blue-500/20" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                  Total Realizado
                </span>
                <span className="text-[15px] font-bold text-gray-900 dark:text-white leading-tight truncate">
                  {totalViagens} viag.
                </span>
              </div>
            </div>
            <div className="bg-white dark:bg-[#121213] p-4 flex items-center gap-3 min-w-[150px] sm:min-w-[180px]">
              <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-500/10 flex items-center justify-center shrink-0">
                <DollarSign size={18} className="text-green-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                  Total Faturado
                </span>
                <span className="text-[15px] font-bold text-green-600 dark:text-green-400 leading-tight truncate">
                  {formatCurrency(faturamentoTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
          className="w-12 h-12 bg-white dark:bg-[#121213] rounded-full border border-gray-100 dark:border-gray-800 shadow-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors pointer-events-auto"
        >
          <ChevronUp
            size={20}
            className={cn(
              "transition-transform duration-300",
              isSummaryExpanded && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* Modal Detailed View */}
      {selectedTrip &&
        (() => {
          const selectedEntities = getTripEntities(selectedTrip);
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 md:p-4 bg-gray-900/40 backdrop-blur-sm sm:pb-8">
              <div className="bg-white dark:bg-[#121213] w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#121213] z-10">
                  <h3 className="font-bold text-gray-900 dark:text-white text-[15px]">
                    Detalhes da Viagem
                  </h3>
                  <button
                    onClick={() => setSelectedTrip(null)}
                    className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto w-full">
                  {/* Trip General Information */}
                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">
                        Data
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold">
                        {formatDate(
                          selectedTrip.createdAt || selectedTrip.dataLancamento,
                        )}{" "}
                        às{" "}
                        {formatTime(
                          selectedTrip.createdAt || selectedTrip.dataLancamento,
                        )}
                      </span>
                    </div>
                    <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">
                        Motorista
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[200px] text-right">
                        {selectedTrip.motoristaNome}
                      </span>
                    </div>
                    <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">
                        Empresa
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[200px] text-right">
                        {selectedTrip.empresaNome}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">
                        Contrato
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold text-right">
                        {selectedEntities.contractName}
                      </span>
                    </div>
                    <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">
                        Veículo
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold text-right">
                        {selectedEntities.vehicleName}
                      </span>
                    </div>
                    <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">
                        Reboque
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold text-right">
                        {selectedEntities.trailerName}
                      </span>
                    </div>
                    <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">
                        Origem
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[200px] text-right">
                        {selectedTrip.origem}
                      </span>
                    </div>
                    <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">
                        Destino
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[200px] text-right">
                        {selectedTrip.destino}
                      </span>
                    </div>
                    <div className="w-full h-px bg-gray-100 dark:bg-gray-800"></div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">
                        Valor Recebido
                      </span>
                      <span className="text-green-600 dark:text-green-500 font-bold text-base text-right">
                        {formatCurrency(selectedTrip.valor)}
                      </span>
                    </div>
                  </div>

                  {/* Receipt Image */}
                  {selectedTrip.comprovanteUrl && (
                    <div className="mt-6 mb-4">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 block mb-3">
                        Comprovante de Entrega
                      </span>
                      <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                        <img
                          src={selectedTrip.comprovanteUrl}
                          alt="Comprovante"
                          className="w-full h-auto object-contain max-h-[350px]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#09090b]">
                  <button
                    onClick={() => setSelectedTrip(null)}
                    className="w-full bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white font-semibold py-3 rounded-xl transition-colors"
                  >
                    Fechar Detalhes
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Delete Confirmation Modal */}
      {deletingTrip && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 md:p-4 bg-gray-900/40 backdrop-blur-sm sm:pb-8">
          <div className="bg-white dark:bg-[#121213] w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white text-[15px]">
                Confirmar Exclusão
              </h3>
              <button
                onClick={() => setDeletingTrip(null)}
                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={28} className="text-red-500" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Excluir Viagem?
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Tem certeza que deseja excluir esta viagem? Esta ação não pode
                ser desfeita e os dados serão perdidos permanentemente.
              </p>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 bg-gray-50 dark:bg-[#09090b]">
              <button
                type="button"
                onClick={() => setDeletingTrip(null)}
                className="flex-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteTrip}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                Excluir Viagem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTrip && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 md:p-4 bg-gray-900/40 backdrop-blur-sm sm:pb-8">
          <div className="bg-white dark:bg-[#121213] w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white text-[15px]">
                Editar Viagem
              </h3>
              <button
                onClick={() => setEditingTrip(null)}
                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={async (e: any) => {
                e.preventDefault();
                try {
                  const form = e.target;
                  const origem = form.origem.value;
                  const destino = form.destino.value;
                  const valor = parseFloat(form.valor.value);

                  await updateDoc(
                    doc(db, "historico_viagens", editingTrip.id),
                    {
                      origem,
                      destino,
                      valor,
                    },
                  );

                  setEditingTrip(null);
                } catch (error) {
                  console.error("Erro ao editar viagem:", error);
                  alert("Erro ao editar viagem. Verifique suas permissões.");
                }
              }}
            >
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    Origem
                  </label>
                  <input
                    name="origem"
                    defaultValue={editingTrip.origem}
                    required
                    className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-gray-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    Destino
                  </label>
                  <input
                    name="destino"
                    defaultValue={editingTrip.destino}
                    required
                    className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-gray-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    Valor
                  </label>
                  <input
                    name="valor"
                    type="number"
                    step="0.01"
                    defaultValue={editingTrip.valor}
                    required
                    className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-gray-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 bg-gray-50 dark:bg-[#09090b]">
                <button
                  type="button"
                  onClick={() => setEditingTrip(null)}
                  className="flex-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
