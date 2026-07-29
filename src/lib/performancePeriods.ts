import {
  getMonthlyRange,
  getTodayRange,
  getWeeklyRange,
} from "./metricsEngine";

export type PerformancePeriodPreset =
  | "Semana atual"
  | "Mês atual"
  | "Hoje"
  | "Personalizado";

export type ClassificationPeriodView = "Semanal" | "Mensal";

export interface DateInterval {
  start: Date;
  end: Date;
}

export interface OptionalDateRange {
  from?: Date;
  to?: Date;
}

export interface ClassificationPeriod extends DateInterval {
  id: number;
  label: string;
}

const startOfLocalDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfLocalDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const addLocalDays = (value: Date, amount: number) => {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
};

const addLocalMonths = (value: Date, amount: number) =>
  new Date(value.getFullYear(), value.getMonth() + amount, 1);

const inclusiveCalendarDays = (start: Date, end: Date) => {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((endUtc - startUtc) / 86_400_000) + 1);
};

export function resolvePerformanceInterval(
  preset: PerformancePeriodPreset,
  customRange: OptionalDateRange | undefined,
  referenceDate = new Date(),
): DateInterval {
  if (preset === "Hoje") {
    const range = getTodayRange(referenceDate);
    return { start: range.start, end: range.end };
  }

  if (preset === "Mês atual") {
    const range = getMonthlyRange(referenceDate);
    return { start: range.start, end: range.end };
  }

  if (preset === "Personalizado" && customRange?.from) {
    const rawStart = new Date(customRange.from);
    const rawEnd = new Date(customRange.to || customRange.from);
    const first = rawStart <= rawEnd ? rawStart : rawEnd;
    const last = rawStart <= rawEnd ? rawEnd : rawStart;
    return { start: startOfLocalDay(first), end: endOfLocalDay(last) };
  }

  const range = getWeeklyRange(referenceDate);
  return { start: range.start, end: range.end };
}

/**
 * Returns the immediately preceding comparable interval.
 * Calendar presets use the previous calendar day/week/month. A custom range
 * uses the immediately preceding interval with the same inclusive day count.
 */
export function resolvePreviousPerformanceInterval(
  preset: PerformancePeriodPreset,
  current: DateInterval,
  referenceDate = new Date(),
): DateInterval {
  if (preset === "Hoje") {
    const range = getTodayRange(addLocalDays(referenceDate, -1));
    return { start: range.start, end: range.end };
  }

  if (preset === "Semana atual") {
    const range = getWeeklyRange(addLocalDays(referenceDate, -7));
    return { start: range.start, end: range.end };
  }

  if (preset === "Mês atual") {
    const range = getMonthlyRange(addLocalMonths(referenceDate, -1));
    return { start: range.start, end: range.end };
  }

  const days = inclusiveCalendarDays(current.start, current.end);
  const previousEnd = endOfLocalDay(addLocalDays(current.start, -1));
  const previousStart = startOfLocalDay(addLocalDays(previousEnd, -(days - 1)));
  return { start: previousStart, end: previousEnd };
}

export function buildClassificationPeriods(
  view: ClassificationPeriodView,
  referenceDate = new Date(),
  count = 5,
): ClassificationPeriod[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    if (view === "Semanal") {
      const range = getWeeklyRange(addLocalDays(referenceDate, index * -7));
      return {
        id: index,
        start: range.start,
        end: range.end,
        label: `${range.start.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        })} a ${range.end.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        })}`,
      };
    }

    const range = getMonthlyRange(addLocalMonths(referenceDate, -index));
    const formattedMonth = range.start
      .toLocaleDateString("pt-BR", { month: "short" })
      .replace(".", "");
    return {
      id: index,
      start: range.start,
      end: range.end,
      label: `${formattedMonth.charAt(0).toUpperCase() + formattedMonth.slice(1)} ${range.start.getFullYear()}`,
    };
  });
}

export function getClassificationHistoryInterval(
  periods: ClassificationPeriod[],
): DateInterval {
  if (periods.length === 0) {
    const fallback = getWeeklyRange();
    return { start: fallback.start, end: fallback.end };
  }

  return {
    start: new Date(Math.min(...periods.map((period) => period.start.getTime()))),
    end: new Date(Math.max(...periods.map((period) => period.end.getTime()))),
  };
}
