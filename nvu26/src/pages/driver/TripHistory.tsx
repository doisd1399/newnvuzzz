import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
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
  ChevronDown,
  ChevronsUpDown,
  ChevronsDownUp,
} from "lucide-react";

import { cn } from "../../lib/utils";
import { doc, runTransaction } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useTripHistory } from "../../hooks/useTripHistory";
import { TripsRepository } from "../../repositories/TripsRepository";
import { useAppStore } from "../../context/AppContext";
import { normalizeTrip, parseTripValue } from "../../lib/tripNormalizer";
import {
  filterAndSortTripHistory,
  getTripDisplayDate,
  summarizeTripHistory,
} from "../../lib/tripHistoryEngine";

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

  simuladorNome?: string;

  origem: string;
  destino: string;
  [key: string]: any;
  valor: number;
  comprovanteUrl: string;
  status: string;
  criadoPor: string;
  dataLancamento: any;
  createdAt: any;
  completedAt?: any;
  dataFechamento?: any;
  date?: any;
}

// --- Image Caching & Preloading Module ---
const MAX_COMPROVANTE_CACHE = 120;
const imageCacheMap = new Map<string, string>();
const imagePreloadPromises = new Map<string, Promise<string>>();

const getCachedComprovante = (url: string) => {
  const cachedUrl = imageCacheMap.get(url);
  if (!cachedUrl) return undefined;

  // Refresh insertion order so frequently opened receipts stay cached.
  imageCacheMap.delete(url);
  imageCacheMap.set(url, cachedUrl);
  return cachedUrl;
};

const cacheComprovante = (url: string) => {
  imageCacheMap.delete(url);
  imageCacheMap.set(url, url);

  while (imageCacheMap.size > MAX_COMPROVANTE_CACHE) {
    const oldestUrl = imageCacheMap.keys().next().value as string | undefined;
    if (!oldestUrl) break;
    imageCacheMap.delete(oldestUrl);
  }
};

export const preloadComprovante = async (url: string): Promise<string> => {
  if (!url) return "";
  const cachedUrl = getCachedComprovante(url);
  if (cachedUrl) return cachedUrl;

  const existingPreload = imagePreloadPromises.get(url);
  if (existingPreload) return existingPreload;

  // Use the browser's native image cache instead of fetching a Blob and
  // creating ObjectURLs. This avoids an extra conversion step and also works
  // when Firebase Storage does not expose CORS headers for fetch().
  const preloadPromise = new Promise<string>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      cacheComprovante(url);
      imagePreloadPromises.delete(url);
      resolve(url);
    };
    image.onerror = () => {
      // Keep the direct URL as a safe fallback. The visible <img> still gets
      // the browser's normal error handling instead of blocking the details.
      cacheComprovante(url);
      imagePreloadPromises.delete(url);
      resolve(url);
    };
    image.src = url;
  });

  imagePreloadPromises.set(url, preloadPromise);
  return preloadPromise;
};

const CachedImageViewer = React.memo(({ url, alt, className }: { url: string; alt?: string; className?: string }) => {
  const [displayUrl, setDisplayUrl] = useState<string>(imageCacheMap.get(url) || url);

  useEffect(() => {
    let active = true;
    if (!getCachedComprovante(url)) {
      preloadComprovante(url).then(cachedObjUrl => {
        if (active && cachedObjUrl) setDisplayUrl(cachedObjUrl);
      });
    } else {
      setDisplayUrl(getCachedComprovante(url)!);
    }
    return () => { active = false; };
  }, [url]);

  return (
    <PhotoProvider>
      <PhotoView src={displayUrl}>
        <img
          src={displayUrl}
          alt={alt || "Comprovante"}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className={className}
        />
      </PhotoView>
    </PhotoProvider>
  );
});
// -----------------------------------------


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

const TripListItem = React.memo(({
  trip,
  comp,
  isExpanded,
  toggleExpand,
  setSelectedTrip,
  setEditingTrip,
  setDeletingTrip,
  canEdit,
  canDelete,
  formatCurrency,
  formatDate,
  formatTime,
  tripNumber,
}: {
  trip: TripRecord;
  comp: any;
  isExpanded: boolean;
  toggleExpand: (id: string) => void;
  setSelectedTrip: (t: TripRecord) => void;
  setEditingTrip: (t: TripRecord) => void;
  setDeletingTrip: (t: TripRecord) => void;
  canEdit: boolean;
  canDelete: boolean;
  formatCurrency: (v: number) => string;
  formatDate: (d: any) => string;
  formatTime: (d: any) => string;
  tripNumber?: number;
}) => {
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

  return (
    <div
      onClick={() => toggleExpand(trip.id)}
      className={cn(
        "group relative bg-white dark:bg-[#121213] p-2 sm:p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-[0_1px_8px_-4px_rgba(0,0,0,0.05)] flex flex-col cursor-pointer transition-all hover:border-gray-200 dark:hover:border-gray-700 w-full"
      )}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between pb-1.5">
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
            <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight break-words whitespace-normal line-clamp-2">
              {trip.empresaNome}
            </span>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              Contrato #
              {trip.contratoNumero ||
                trip.contratoId?.substring(0, 4) ||
                "-"}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end shrink-0 ml-2">
          <CalendarIcon
            size={10}
            className="text-gray-400 shrink-0"
          />
          <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400 ml-1 whitespace-nowrap">
            {formatDate(trip.metricDate)} &bull;{" "}
            {formatTime(trip.metricDate)}
          </span>
        </div>
      </div>

      <div className="w-full h-px bg-gray-50 dark:bg-gray-800/60" />

      {/* Middle Grid Row 1 */}
      <div className="grid grid-cols-2 py-1 sm:py-1.5 relative">
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

        <div className="flex items-center justify-between pl-3 min-w-0 w-full">
          <div className="flex items-center gap-2 min-w-0">
          <Gamepad2
            size={12}
            className="text-gray-500 dark:text-gray-400 shrink-0"
          />
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] text-gray-400 font-medium leading-tight mb-[1px]">
              Simulador
            </span>
            <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
              {trip.simuladorNome || "-"}
            </span>
          </div>
        </div>
          {tripNumber !== undefined && (
            <div className="flex flex-col items-center justify-center shrink-0 ml-1">
              <div className="flex items-center justify-center w-6 h-6 rounded bg-gray-100 dark:bg-gray-800/80 text-[11px] font-bold text-gray-700 dark:text-gray-300">
                {tripNumber.toString().padStart(2, '0')}
              </div>
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="w-full h-px bg-gray-50 dark:bg-gray-800/60" />

          {/* Middle Grid Row 2 */}
          <div className="grid grid-cols-2 py-1 sm:py-1.5 relative">
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
                  {trip.veiculoNome || "-"}
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
                  {trip.reboqueNome || "-"}
                </span>
              </div>
            </div>
          </div>

          <div className="w-full h-px bg-gray-50 dark:bg-gray-800/60" />

          {/* Origin -> Destination */}
          <div className="flex items-center gap-2 py-1 sm:py-1.5">
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
        </div>
      )}

      {/* Bottom Row (Badges & Actions) */}
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100 dark:border-gray-800/60">
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
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-800 mx-1" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (trip.comprovanteUrl) void preloadComprovante(trip.comprovanteUrl);
              setSelectedTrip(trip);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (trip.comprovanteUrl) void preloadComprovante(trip.comprovanteUrl);
            }}
            onMouseEnter={() => {
              if (trip.comprovanteUrl) void preloadComprovante(trip.comprovanteUrl);
            }}
            title="Visualizar Detalhes"
            className="w-7 h-6 rounded-lg border border-blue-100/60 dark:border-gray-800 bg-blue-50/50 dark:bg-[#121213] flex items-center justify-center text-blue-500 hover:bg-blue-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Eye size={12} className="stroke-[2]" />
          </button>
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingTrip(trip);
              }}
              title="Editar Viagem"
              className="w-7 h-6 rounded-lg border border-orange-100/60 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-500/5 flex items-center justify-center text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-500/10 transition-colors"
            >
              <Pencil size={11} className="stroke-[2]" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeletingTrip(trip);
              }}
              title="Excluir Viagem"
              className="w-7 h-6 rounded-lg border border-red-100/60 dark:border-red-900/30 bg-red-50/50 dark:bg-red-500/5 flex items-center justify-center text-red-500 hover:bg-red-100 dark:hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={11} className="stroke-[2]" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(trip.id);
            }}
            className="w-7 h-6 ml-0.5 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
          >
            {isExpanded ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

export default function TripHistory({
  embeddedJob,
  hideHeader = false,
  isInsideAdminTab = false,
  onTripDetailsOpen,
  defaultDriverName,
  defaultDriverId,
  hideDriverFilter = false,
  mode,
  companyId,
}: {
  embeddedJob?: any;
  hideHeader?: boolean;
  isInsideAdminTab?: boolean;
  onTripDetailsOpen?: (isOpen: boolean) => void;
  defaultDriverName?: string;
  defaultDriverId?: string;
  hideDriverFilter?: boolean;
  mode?: "driver" | "company";
  companyId?: string;
} = {}) {
  const navigate = useNavigate();
  const {
    currentUser,
    activeCompanyId: contextActiveCompanyId,
    activeRole,
    companies,
    users,
    allCompanyMembers,
  } = useAppStore();
  const activeCompanyId = companyId || contextActiveCompanyId;
  const {
    historicoTrips: companyHistoryTrips = [],
    loading: historyLoading,
    error: historyError,
  } = useTripHistory(activeCompanyId);
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
  const [editingTrip, setEditingTrip] = useState<TripRecord | null>(null);
  const [deletingTrip, setDeletingTrip] = useState<TripRecord | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [expandedTrips, setExpandedTrips] = useState<Set<string>>(new Set());
  const [visibleTripCount, setVisibleTripCount] = useState(30);
  const observerTarget = React.useRef<HTMLDivElement>(null);

  const toggleExpand = React.useCallback((tripId: string) => {
    setExpandedTrips((prev) => {
      const next = new Set(prev);
      if (next.has(tripId)) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
  }, []);

  const currentCompany = companies.find((c: any) => c.id === activeCompanyId);
  const isSeniorAccess = sessionStorage.getItem("seniorAccess") === "true";
  const isAdminOrSenior = activeRole === "admin" || isSeniorAccess;

  const initialFilters = {
    simulador: currentCompany?.simulatorName || "",
    empresa: currentCompany?.companyName || "",
    motoristaId: mode === "company" ? "" : (defaultDriverId !== undefined 
      ? defaultDriverId 
      : (isAdminOrSenior ? "" : (currentUser?.id || ""))),
    motorista: mode === "company" ? "" : (defaultDriverName !== undefined 
      ? defaultDriverName 
      : (isAdminOrSenior ? "" : (currentUser?.name || ""))),
    periodoPreset: "mes", // 'todos', 'hoje', 'semana', 'mes', 'data'
    periodoInicio: "",
    periodoFim: "",
  };

  const [pendingFilters, setPendingFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);

  // Backfill for old records
  useEffect(() => {
    TripsRepository.runBackfill(activeCompanyId || "");
  }, [activeCompanyId]);

  const canonicalHistoryTrips = React.useMemo(
    () =>
      filterAndSortTripHistory(companyHistoryTrips, {
        periodPreset: embeddedJob ? "todos" : appliedFilters.periodoPreset,
        customStartDate: appliedFilters.periodoInicio,
        customEndDate: appliedFilters.periodoFim,
        driverId: embeddedJob ? undefined : appliedFilters.motoristaId,
        driverName: embeddedJob ? undefined : appliedFilters.motorista,
        embeddedJob,
      }),
    [
      appliedFilters.motorista,
      appliedFilters.motoristaId,
      appliedFilters.periodoFim,
      appliedFilters.periodoInicio,
      appliedFilters.periodoPreset,
      companyHistoryTrips,
      embeddedJob,
    ],
  );

  useEffect(() => {
    setVisibleTripCount(30);
    setExpandedTrips(new Set());
  }, [
    activeCompanyId,
    appliedFilters.motorista,
    appliedFilters.motoristaId,
    appliedFilters.periodoFim,
    appliedFilters.periodoInicio,
    appliedFilters.periodoPreset,
    embeddedJob?.id,
  ]);

  const finalTrips = React.useMemo(
    () => canonicalHistoryTrips.slice(0, visibleTripCount),
    [canonicalHistoryTrips, visibleTripCount],
  );
  const hasMore = visibleTripCount < canonicalHistoryTrips.length;
  const loading = historyLoading;
  const { totalViagens, faturamentoTotal } = React.useMemo(
    () => summarizeTripHistory(canonicalHistoryTrips),
    [canonicalHistoryTrips],
  );

  useEffect(() => {
    const target = observerTarget.current;
    if (!target || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setVisibleTripCount((current) =>
          Math.min(current + 30, canonicalHistoryTrips.length),
        );
      },
      { threshold: 0.1 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [canonicalHistoryTrips.length, hasMore, loading]);

  // Motoristas disponíveis = membros atuais + qualquer motorista que tenha
  // viagem válida no histórico. Assim ex-membros continuam selecionáveis.
  const uniqueMotoristas = React.useMemo(() => {
    const uniqueMap = new Map<string, string>();

    const activeDriverIds = new Set(
      (allCompanyMembers || [])
        .filter((member) => {
          const hasDriverRole =
            member?.roles?.includes?.("driver");
          return (
            member?.companyId === activeCompanyId &&
            member?.status === "active" &&
            hasDriverRole &&
            member?.userId
          );
        })
        .map((member) => member.userId),
    );

    users.forEach((user) => {
      if (activeDriverIds.has(user.id) && user.name) {
        uniqueMap.set(user.id, user.name);
      }
    });

    companyHistoryTrips
      .map((trip) => normalizeTrip(trip as any))
      .filter((trip) => trip.isValid)
      .forEach((trip) => {
        const historyDriverId = String(
          trip.motoristaId ||
            (trip as any).driverId ||
            (trip as any).motorista_id ||
            (trip as any).userId ||
            "",
        ).trim();
        const historyDriverName = String(
          trip.motoristaNome ||
            (trip as any).driverName ||
            (trip as any).motorista_nome ||
            "",
        ).trim();

        if (
          historyDriverId &&
          historyDriverName &&
          historyDriverName !== "-" &&
          !uniqueMap.has(historyDriverId)
        ) {
          uniqueMap.set(historyDriverId, historyDriverName);
        }
      });

    return Array.from(uniqueMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeCompanyId, allCompanyMembers, companyHistoryTrips, users]);

  const companiesMap = React.useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  );

  // --- Image Preloading Logic ---
  useEffect(() => {
    // Notify parent when trip details are opened/closed
    if (onTripDetailsOpen) {
      onTripDetailsOpen(!!selectedTrip);
    }
    // Preload adjacent trips when a trip is selected
    if (selectedTrip) {
      const idx = finalTrips.findIndex(t => t.id === selectedTrip.id);
      if (idx > 0) {
        const prev = finalTrips[idx - 1];
        if (prev.comprovanteUrl) preloadComprovante(prev.comprovanteUrl);
      }
      if (idx !== -1 && idx < finalTrips.length - 1) {
        const next = finalTrips[idx + 1];
        if (next.comprovanteUrl) preloadComprovante(next.comprovanteUrl);
      }
    }
  }, [selectedTrip, finalTrips, onTripDetailsOpen]);
  // ------------------------------

  const formatCurrency = React.useCallback((value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }, []);

  const formatDate = React.useCallback((timestamp: any) => {
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
  }, []);

  const formatTime = React.useCallback((timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const canEditTrip = React.useCallback((trip: TripRecord) => {
    if (!currentUser) return false;
    if (activeRole === "admin") {
      return trip.empresaId === activeCompanyId;
    }
    if (activeRole === "driver") {
      return trip.motoristaId === currentUser.id;
    }
    return false;
  }, [currentUser, activeRole, activeCompanyId]);

  const canDeleteTrip = React.useCallback((trip: TripRecord) => {
    return canEditTrip(trip);
  }, [canEditTrip]);

  const confirmDeleteTrip = async () => {
    if (!deletingTrip) return;
    try {
      console.log(`[DIAGNOSTIC] Ao clicar excluir:`);
      console.log(`- deletingTrip.id: ${deletingTrip.id}`);
      console.log(`- deletingTrip.jobId: ${deletingTrip.jobId || "undefined"}`);
      console.log(`- deletingTrip.contractId: ${deletingTrip.contratoId || "undefined"}`);

      if (deletingTrip.jobId && deletingTrip.contratoId) {
        await runTransaction(db, async (transaction) => {
          const tripRef = doc(db, "historico_viagens", deletingTrip.id);
          transaction.delete(tripRef);
        });

        // Never decrement a cached counter. Rebuild the exact job progress
        // from the remaining valid trips and reconcile its operational status.
        await TripsRepository.syncJobProgress(deletingTrip.jobId);
      } else {
        console.log(`[DIAGNOSTIC] Deletando trip sem transacao de job`);
        await TripsRepository.deleteTrip(deletingTrip.id);
      }

      setDeletingTrip(null);
    } catch (error) {
      console.error("Erro ao deletar viagem:", error);
      alert("Erro ao remover a viagem. Verifique suas permissões.");
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col w-full relative",
        !embeddedJob && !isInsideAdminTab
          ? "w-full max-w-7xl mx-auto min-h-[calc(100vh-64px)] bg-gray-50/50 dark:bg-[#09090b] pb-6"
          : "pb-24" // Extra padding for the fixed footer in tab view
      )}
    >
      {/* Header Section */}
      <div className={cn("flex items-start mb-4 pt-2", hideHeader ? "justify-end" : "justify-between")}>
        {!hideHeader && (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {!isInsideAdminTab && (
                <button
                  onClick={() => navigate(-1)}
                  className="p-1 -ml-1 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <ArrowLeft size={20} className="stroke-[2.5]" />
                </button>
              )}
              <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                Histórico
              </h1>
            </div>
            {!hideDriverFilter && (
              <div className="flex items-center pl-8 mt-1.5">
                <div className="flex items-center bg-transparent border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-0.5 hover:bg-gray-50 dark:hover:bg-[#1A1F26] transition-colors max-w-[160px] sm:max-w-[200px]">
                  <select
                    value={pendingFilters.motoristaId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const selectedMotorista = uniqueMotoristas.find(m => m.id === selectedId);
                      const selectedName = selectedMotorista ? selectedMotorista.name : "";
                      setPendingFilters({ ...pendingFilters, motoristaId: selectedId, motorista: selectedName });
                      setAppliedFilters({ ...appliedFilters, motoristaId: selectedId, motorista: selectedName });
                    }}
                    className="bg-transparent text-[11px] sm:text-[12px] font-semibold text-gray-700 dark:text-gray-300 outline-none cursor-pointer pr-4 appearance-none truncate w-full"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg stroke='currentColor' fill='none' stroke-width='2' viewBox='0 0 24 24' stroke-linecap='round' stroke-linejoin='round' height='1em' width='1em' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right center",
                      backgroundSize: "12px",
                    }}
                  >
                    <option value="" className="bg-white dark:bg-[#121213]">
                      Todos os Motoristas
                    </option>
                    {uniqueMotoristas.map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        className="bg-white dark:bg-[#121213]"
                      >
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-4 mt-1 mr-2">
          <button
            onClick={() => {
              if (expandedTrips.size > 0) {
                setExpandedTrips(new Set());
              } else {
                setExpandedTrips(new Set(finalTrips.map((t) => t.id)));
              }
            }}
            title={expandedTrips.size > 0 ? "Recolher Todos" : "Expandir Todos"}
            className="flex justify-center items-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          >
            {expandedTrips.size > 0 ? (
              <ChevronsDownUp size={18} className="stroke-[2.5]" />
            ) : (
              <ChevronsUpDown size={18} className="stroke-[2.5]" />
            )}
          </button>
          {!embeddedJob && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex justify-center items-center transition-colors",
                showFilters
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
              )}
            >
              <Settings2 size={18} className="stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Card inline */}
      {showFilters && !embeddedJob && (
        <div className="bg-white dark:bg-[#121213] border border-gray-200 dark:border-gray-800 rounded-xl p-3 mb-5 shadow-sm flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
              Período
            </label>
            <div className="flex bg-gray-100/80 dark:bg-gray-800/80 p-0.5 rounded-lg overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {[
                { id: "todos", label: "Tudo" },
                { id: "hoje", label: "Hoje" },
                { id: "semana", label: "Esta Semana" },
                { id: "mes", label: "Esse mês" },
                { id: "data", label: "Data" },
              ].map((preset) => (
                <button
                  key={preset.id}
                  onClick={() =>
                    setPendingFilters({ ...pendingFilters, periodoPreset: preset.id })
                  }
                  className={cn(
                    "flex-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap",
                    pendingFilters.periodoPreset === preset.id
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {pendingFilters.periodoPreset === "data" && (
            <div className="pt-2 animate-in fade-in duration-200 flex justify-center">
              <DateRangeCalendar
                startDate={
                  pendingFilters.periodoInicio
                    ? new Date(pendingFilters.periodoInicio + "T12:00:00")
                    : null
                }
                endDate={
                  pendingFilters.periodoFim
                    ? new Date(pendingFilters.periodoFim + "T12:00:00")
                    : null
                }
                onChange={(start, end) =>
                  setPendingFilters({
                    ...pendingFilters,
                    periodoInicio: start
                      ? start.toISOString().split("T")[0]
                      : "",
                    periodoFim: end ? end.toISOString().split("T")[0] : "",
                  })
                }
              />
            </div>
          )}
          <button
            onClick={() => {
              setAppliedFilters(pendingFilters);
              setShowFilters(false);
            }}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            Aplicar Filtros
          </button>
        </div>
      )}

      {/* List Section */}
      <div
        className={cn(
          "flex flex-col gap-3 w-full",
          !embeddedJob ? "pb-12 px-0" : "pb-4 px-0"
        )}
      >
        {historyError && !loading && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-2 text-[13px] text-red-700 dark:text-red-300">
            Não foi possível sincronizar o histórico completo. Tente atualizar a página.
          </div>
        )}

        {loading && finalTrips.length === 0 ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : finalTrips.length === 0 ? (
          <div className="text-center p-8 text-gray-500 bg-white dark:bg-[#121213] rounded-2xl border border-gray-100 dark:border-gray-800">
            Nenhum histórico de viagens encontrado.
          </div>
        ) : (
          <>
            {loading && (
              <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-1">
                Atualizando viagens…
              </div>
            )}
            {finalTrips.map((trip, index) => {
              const tripCompanyId =
                trip.empresaId ||
                (trip as any).companyId ||
                (trip as any).company_id;
              const comp = companiesMap.get(tripCompanyId);
              const isExpanded = expandedTrips.has(trip.id);

              return (
                <TripListItem
                  key={trip.id}
                  trip={trip as any}
                  comp={comp}
                  isExpanded={isExpanded}
                  toggleExpand={toggleExpand}
                  setSelectedTrip={setSelectedTrip}
                  setEditingTrip={setEditingTrip}
                  setDeletingTrip={setDeletingTrip}
                  canEdit={canEditTrip(trip as any)}
                  canDelete={canDeleteTrip(trip as any)}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                  formatTime={formatTime}
                  tripNumber={embeddedJob ? finalTrips.length - index : undefined}
                />
              );
            })}
          </>
        )}
        <div ref={observerTarget} className="h-10 w-full shrink-0" />
      </div>

      {/* Fixed Bottom Summary Bar */}
      {(!hideHeader || embeddedJob || isInsideAdminTab) && (
        <div className="fixed bottom-6 md:bottom-8 z-30 flex flex-col items-end pointer-events-none right-4 md:right-8 pb-[env(safe-area-inset-bottom,0px)]">
          {/* Expanded Summary Card */}
          <div
            className={cn(
              "bg-white dark:bg-[#20252D] rounded-xl border border-gray-100 dark:border-gray-700 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)] transition-all duration-300 overflow-hidden pointer-events-auto origin-bottom-right mb-3",
              isSummaryExpanded
                ? "max-w-sm max-h-[500px] opacity-100 scale-100"
                : "max-w-0 max-h-0 opacity-0 scale-95",
            )}
          >
            <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-gray-800/80">
              <div className="bg-gray-50/50 dark:bg-[#20252D] p-3 sm:p-3.5 flex flex-col min-w-[120px] sm:min-w-[140px]">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-0.5">
                  Viagens
                </span>
                <span className="text-[16px] font-bold text-gray-900 dark:text-white leading-tight">
                  {totalViagens}
                </span>
              </div>
              <div className="bg-gray-50/50 dark:bg-[#20252D] p-3 sm:p-3.5 flex flex-col min-w-[120px] sm:min-w-[140px]">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-0.5">
                  Ganhos
                </span>
                <span className="text-[16px] font-bold text-green-600 dark:text-green-400 leading-tight">
                  {formatCurrency(faturamentoTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Toggle Button */}
          <button
            onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
            className="w-10 h-10 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.12)] flex items-center justify-center transition-all pointer-events-auto bg-white dark:bg-[#2A313C] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#323945] border border-gray-200/60 dark:border-gray-700"
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
      )}

      {/* Modal Detailed View */}
      {selectedTrip &&
        (() => {
          const selectedIndex = finalTrips.findIndex(t => t.id === selectedTrip.id);
          
          const handlePrevTrip = () => {
            if (selectedIndex > 0) {
              setSelectedTrip(finalTrips[selectedIndex - 1] as any);
            }
          };

          const handleNextTrip = () => {
            if (selectedIndex !== -1 && selectedIndex < finalTrips.length - 1) {
              setSelectedTrip(finalTrips[selectedIndex + 1] as any);
            }
          };

          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 md:p-4 bg-gray-900/40 backdrop-blur-sm sm:pb-8">
              <div className="bg-white dark:bg-[#121213] w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#121213] z-10">
                  <h3 className="font-bold text-gray-900 dark:text-white text-[15px]">
                    Detalhes da Viagem
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center space-x-1 mr-1">
                      <button
                        onClick={handlePrevTrip}
                        disabled={selectedIndex <= 0}
                        className={cn(
                          "p-1.5 rounded-lg border transition-colors",
                          selectedIndex <= 0
                            ? "text-gray-300 border-gray-100 bg-gray-50/50 dark:border-gray-800/50 dark:text-gray-700" 
                            : "text-gray-600 border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        )}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={handleNextTrip}
                        disabled={selectedIndex === -1 || selectedIndex >= finalTrips.length - 1}
                        className={cn(
                          "p-1.5 rounded-lg border transition-colors",
                          selectedIndex === -1 || selectedIndex >= finalTrips.length - 1
                            ? "text-gray-300 border-gray-100 bg-gray-50/50 dark:border-gray-800/50 dark:text-gray-700" 
                            : "text-gray-600 border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        )}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <button
                      onClick={() => setSelectedTrip(null)}
                      className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div className="p-3 sm:p-4 overflow-y-auto w-full">
                  {/* Trip General Information Compact */}
                  <div className="mb-4">
                    {/* Header Row (Company, Driver, Date) */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Building2 size={12} className="text-blue-500" />
                          <span className="text-[12px] font-bold text-gray-900 dark:text-white leading-none">
                            {selectedTrip.empresaNome}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-gray-400" />
                          <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
                            {selectedTrip.motoristaNome}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end">
                        <div className="flex items-center justify-center gap-1 bg-gray-100/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-[10px] font-semibold mb-1 border border-gray-200 dark:border-gray-700">
                          <CalendarIcon size={11} className="shrink-0" />
                          <span className="whitespace-nowrap">
                            {formatDate(getTripDisplayDate(selectedTrip))}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                          {formatTime(getTripDisplayDate(selectedTrip))}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col rounded-lg border border-gray-200 dark:border-gray-800/80 bg-white dark:bg-[#1A1F26] overflow-hidden shadow-sm">
                      {/* Grid details */}
                      <div className="grid grid-cols-2 relative">
                        {/* Contract */}
                        <div className="flex items-center gap-2.5 p-2 sm:p-2.5 min-w-0 bg-slate-50/50 dark:bg-[#1A1F26]">
                          <div className="w-7 h-7 rounded-md bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-500/20">
                            <FileText size={12} className="text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium leading-tight mb-[2px]">
                              Contrato
                            </span>
                            <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">
                              {selectedTrip.contratoNumero || "-"}
                            </span>
                          </div>
                        </div>

                        <div className="absolute left-[50%] top-2 bottom-2 w-px bg-gray-100 dark:bg-gray-800/60" />

                        {/* Simulator */}
                        <div className="flex items-center gap-2.5 p-2 sm:p-2.5 min-w-0 bg-slate-50/50 dark:bg-[#1A1F26]">
                          <div className="w-7 h-7 rounded-md bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-100 dark:border-orange-500/20">
                            <Gamepad2 size={12} className="text-orange-600 dark:text-orange-400" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium leading-tight mb-[2px]">
                              Simulador
                            </span>
                            <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">
                              {selectedTrip.simuladorNome || "-"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="w-full h-px bg-gray-100 dark:bg-gray-800/60" />

                      <div className="grid grid-cols-2 relative">
                        {/* Vehicle */}
                        <div className="flex items-center gap-2.5 p-2 sm:p-2.5 min-w-0 bg-slate-50/50 dark:bg-[#1A1F26]">
                          <div className="w-7 h-7 rounded-md bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-500/20">
                            <Truck size={12} className="text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium leading-tight mb-[2px]">
                              Veículo
                            </span>
                            <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">
                              {selectedTrip.veiculoNome || "-"}
                            </span>
                          </div>
                        </div>

                        <div className="absolute left-[50%] top-2 bottom-2 w-px bg-gray-100 dark:bg-gray-800/60" />

                        {/* Trailer */}
                        <div className="flex items-center gap-2.5 p-2 sm:p-2.5 min-w-0 bg-slate-50/50 dark:bg-[#1A1F26]">
                          <div className="w-7 h-7 rounded-md bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-100 dark:border-purple-500/20">
                            <Package size={12} className="text-purple-600 dark:text-purple-400" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium leading-tight mb-[2px]">
                              Reboque
                            </span>
                            <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">
                              {selectedTrip.reboqueNome || "-"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="w-full h-px bg-gray-100 dark:bg-gray-800/60" />

                      {/* Route */}
                      <div className="flex items-center justify-between p-2 sm:p-2.5 bg-slate-50/50 dark:bg-[#1A1F26]">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <MapPin size={14} className="text-green-500 shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium leading-tight mb-[2px]">Origem</span>
                            <span className="text-[11px] font-semibold text-gray-900 dark:text-gray-100 truncate">{selectedTrip.origem}</span>
                          </div>
                        </div>
                        <ArrowRight size={12} className="text-gray-400 shrink-0 mx-1.5" />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <MapPin size={14} className="text-blue-500 shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium leading-tight mb-[2px]">Destino</span>
                            <span className="text-[11px] font-semibold text-gray-900 dark:text-gray-100 truncate">{selectedTrip.destino}</span>
                          </div>
                        </div>
                      </div>

                      <div className="w-full h-px bg-gray-100 dark:bg-gray-800/60" />

                      {/* Earnings */}
                      <div className="flex items-center justify-between p-2.5 sm:p-3 bg-white dark:bg-[#1A1F26]">
                        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Valor Recebido</span>
                        <div className="flex items-center gap-1 bg-green-50 dark:bg-green-500/10 px-2 py-1.5 rounded-md border border-green-100 dark:border-transparent">
                          <DollarSign size={12} className="stroke-[3] text-green-500" />
                          <span className="text-[13px] font-bold text-gray-900 dark:text-green-400 tracking-tight">
                            {formatCurrency(selectedTrip.valor)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Receipt Image */}
                  {selectedTrip.comprovanteUrl && (
                    <div className="mt-4 mb-2">
                      <span className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 block mb-2">
                        Comprovante de Entrega
                      </span>
                      <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 z-0 relative flex justify-center items-center min-h-[180px]">
                        <CachedImageViewer 
                          url={selectedTrip.comprovanteUrl} 
                          className="w-full h-auto object-contain max-h-[180px] cursor-pointer" 
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121213] w-full max-w-sm rounded-[24px] shadow-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white text-[15px]">
                Confirmar Exclusão
              </h3>
              <button
                onClick={() => setDeletingTrip(null)}
                className="p-1 -mr-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 text-center">
              <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <h4 className="text-[17px] font-semibold text-gray-900 dark:text-white mb-2">
                Excluir Viagem?
              </h4>
              <p className="text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
                Tem certeza que deseja excluir esta viagem? Esta ação não pode
                ser desfeita e os dados serão perdidos permanentemente.
              </p>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 bg-gray-50 dark:bg-[#09090b]">
              <button
                type="button"
                onClick={() => setDeletingTrip(null)}
                className="flex-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white font-semibold py-2 px-3 text-[14px] rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteTrip}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-3 text-[14px] rounded-xl transition-colors"
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
                  const valor = parseTripValue(form.valor.value);

                  await TripsRepository.updateTrip(editingTrip.id, {
                    origem,
                    destino,
                    valor,
                  });

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
