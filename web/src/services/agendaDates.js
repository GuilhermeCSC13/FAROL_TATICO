import { addDays, addMonths, format, isValid, parseISO } from "date-fns";

export function parseSafeDate(value) {
  if (!value) return new Date();

  const raw = String(value);
  const normalized = raw.length >= 19 ? raw.substring(0, 19) : raw;
  const date = normalized.includes("T") ? new Date(normalized) : new Date(`${normalized}T00:00:00`);

  if (isValid(date)) return date;

  try {
    const fallback = parseISO(raw);
    return isValid(fallback) ? fallback : new Date();
  } catch {
    return new Date();
  }
}

export function formatDateKey(date) {
  return format(parseSafeDate(date), "yyyy-MM-dd");
}

export function normalizeDateKey(value) {
  if (!value) return "";
  if (value instanceof Date) return format(value, "yyyy-MM-dd");

  const raw = String(value).trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return formatDateKey(raw);
}

export function extractTimeValue(value, fallback = "09:00") {
  if (!value) return fallback;

  const raw = String(value);
  if (raw.includes("T")) return raw.split("T")[1].substring(0, 5);
  if (raw.includes(":")) return raw.substring(0, 5);

  return fallback;
}

export function buildDateTimeValue(dateKey, timeValue = "09:00") {
  const key = normalizeDateKey(dateKey);
  const time = extractTimeValue(timeValue, "09:00");
  return `${key}T${time}:00`;
}

export function sortUniqueDates(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeDateKey).filter(Boolean))].sort();
}

export function generateRecurringDates(baseDate, rule, count = 6) {
  const dates = [];
  let current = parseSafeDate(baseDate);
  const normalizedRule = String(rule || "").toLowerCase();
  const total = Math.max(1, Number(count) || 1);

  for (let i = 0; i < total; i += 1) {
    dates.push(format(current, "yyyy-MM-dd"));

    if (normalizedRule === "semanal") {
      current = addDays(current, 7);
    } else if (normalizedRule === "quinzenal" || normalizedRule === "15 dias") {
      current = addDays(current, 15);
    } else if (normalizedRule === "mensal") {
      current = addMonths(current, 1);
    } else if (normalizedRule === "bissemanal") {
      current = addDays(current, 14);
    } else {
      current = addDays(current, 7);
    }
  }

  return sortUniqueDates(dates);
}
