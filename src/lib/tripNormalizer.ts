export interface RawTrip {
  id: string;
  status?: string;
  cancelado?: boolean;
  deleted?: boolean;
  completedAt?: any;
  createdAt?: any;
  dataFechamento?: any;
  dataLancamento?: any;
  date?: any;
  valor?: string | number;
  empresaId?: string;
  empresaNome?: string;
  motoristaId?: string;
  motoristaNome?: string;
  placa?: string;
  [key: string]: any;
}

export interface NormalizedTrip extends RawTrip {
  isValid: boolean;
  metricDate: Date;
  normalizedValor: number;
}

export function normalizeTrip(trip: RawTrip): NormalizedTrip {
  const status = (trip.status || "").toLowerCase();
  
  // Rule 2: Viagens com status "cancelado", "cancelada", "canceled" ou marcadas como deleted/softDeleted NÃO devem ser contabilizadas.
  const isCanceled = 
    status === "cancelado" || 
    status === "cancelada" || 
    status === "canceled" || 
    trip.cancelado === true || 
    trip.deleted === true;

  // Rule 1: Apenas viagens com status "concluida" são válidas para métricas.
  const isCompletedStatus = status === "concluida" || status === "concluída" || status === "completed";
  
  const isValid = !isCanceled && isCompletedStatus;

  // Rule 5: A data oficial para métricas deve ser completedAt (ou equivalente de conclusão), nunca createdAt.
  const dateStr =
    trip.completedAt?.toDate?.() ||
    trip.completedAt ||
    trip.dataFechamento ||
    trip.date ||
    trip.dataLancamento ||
    trip.createdAt;

  let metricDate = new Date(0);
  if (dateStr) {
    if (typeof dateStr.toDate === "function") {
      metricDate = dateStr.toDate();
    } else if (typeof dateStr === "string" || typeof dateStr === "number") {
      metricDate = new Date(dateStr);
    } else if (dateStr instanceof Date) {
      metricDate = dateStr;
    } else if (dateStr.seconds) { // Firestore Timestamp fallback
      metricDate = new Date(dateStr.seconds * 1000);
    }
  }

  return {
    ...trip,
    isValid,
    metricDate,
    normalizedValor: parseFloat(String(trip.valor)) || 0,
  };
}
