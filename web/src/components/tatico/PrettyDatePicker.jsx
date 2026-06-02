import { useEffect, useMemo, useRef, useState } from "react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

const WEEK_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * Custom date picker
 * Props:
 *  - value: string (yyyy-MM-dd) or ""
 *  - onChange: (yyyy-MM-dd or "") => void
 *  - placeholder
 *  - className: extra classes for the wrapper
 */
export default function PrettyDatePicker({
  value = "",
  onChange,
  placeholder = "Selecionar data",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    if (value) {
      try {
        return parseISO(value);
      } catch {
        return new Date();
      }
    }
    return new Date();
  });
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (value) {
      try {
        setCursor(parseISO(value));
      } catch {
        /* ignore */
      }
    }
  }, [value]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    const arr = [];
    let d = start;
    while (d <= end) {
      arr.push(d);
      d = addDays(d, 1);
    }
    return arr;
  }, [cursor]);

  const selected = value ? parseISO(value) : null;
  const displayText = value ? format(parseISO(value), "dd/MM/yyyy") : "";

  const pick = (day) => {
    onChange?.(format(day, "yyyy-MM-dd"));
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center gap-2 bg-gradient-to-br from-white to-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-xl pl-9 pr-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 relative"
      >
        <CalendarIcon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500"
        />
        <span className={displayText ? "" : "text-slate-400 font-normal"}>
          {displayText || placeholder}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange?.("");
            }}
            className="ml-auto text-slate-400 hover:text-red-500 transition"
          >
            <X size={14} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-2 left-0 w-[280px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setCursor(addMonths(cursor, -1))}
              className="w-7 h-7 rounded-lg hover:bg-blue-50 text-slate-600 hover:text-blue-600 flex items-center justify-center transition"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-black tracking-tight text-slate-800 capitalize">
              {format(cursor, "MMMM yyyy", { locale: ptBR })}
            </div>
            <button
              type="button"
              onClick={() => setCursor(addMonths(cursor, 1))}
              className="w-7 h-7 rounded-lg hover:bg-blue-50 text-slate-600 hover:text-blue-600 flex items-center justify-center transition"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEK_LABELS.map((w, i) => (
              <div
                key={i}
                className="text-[10px] font-bold text-slate-400 text-center py-1"
              >
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const inMonth = isSameMonth(day, cursor);
              const isSel = selected && isSameDay(day, selected);
              const today = isToday(day);
              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  onClick={() => pick(day)}
                  className={[
                    "h-8 w-full rounded-lg text-xs font-semibold transition",
                    isSel
                      ? "bg-blue-600 text-white shadow-sm"
                      : today
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                      : inMonth
                      ? "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                      : "text-slate-300 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                onChange?.("");
                setOpen(false);
              }}
              className="text-[11px] font-bold text-slate-500 hover:text-red-600 transition"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => pick(new Date())}
              className="text-[11px] font-black text-blue-600 hover:text-blue-700 transition"
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
