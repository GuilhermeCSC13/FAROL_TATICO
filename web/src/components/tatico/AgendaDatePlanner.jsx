import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  generateRecurringDates,
  parseSafeDate,
  sortUniqueDates,
  formatDateKey,
  normalizeDateKey,
} from "../../services/agendaDates";

const SHORTCUTS = [
  { label: "Semanal", rule: "semanal" },
  { label: "Quinzenal", rule: "quinzenal" },
  { label: "Mensal", rule: "mensal" },
];

function summarizeDate(dateKey) {
  const d = parseSafeDate(dateKey);
  return format(d, "dd/MM/yyyy", { locale: ptBR });
}

export default function AgendaDatePlanner({
  mode = "unica",
  onModeChange,
  singleDate,
  onSingleDateChange,
  selectedDates = [],
  onSelectedDatesChange,
  recurrenceRule = "semanal",
  onRecurrenceRuleChange,
  disabled = false,
  label = "Data da reunião",
  helperText = "Selecione uma data bonita e, se quiser, transforme em recorrência.",
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => parseSafeDate(singleDate || selectedDates[0] || new Date()));

  const normalizedDates = useMemo(
    () => sortUniqueDates(selectedDates),
    [selectedDates]
  );

  const primaryDate = normalizeDateKey(singleDate || normalizedDates[0] || new Date());

  useEffect(() => {
    const next = normalizeDateKey(singleDate || normalizedDates[0] || new Date());
    setCursor(parseSafeDate(next));
  }, [singleDate, normalizedDates]);

  useEffect(() => {
    if (mode === "multipla") {
      if (!normalizedDates.length && singleDate) {
        onSelectedDatesChange?.([normalizeDateKey(singleDate)]);
      }
      if (!singleDate && normalizedDates.length > 0) {
        onSingleDateChange?.(normalizedDates[0]);
      }
    }
  }, [mode, normalizedDates, singleDate, onSelectedDatesChange, onSingleDateChange]);

  useEffect(() => {
    if (!open) return undefined;

    const onClickOutside = (event) => {
      if (event.target?.closest?.("[data-agenda-picker]")) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { locale: ptBR });
    const end = endOfWeek(endOfMonth(cursor), { locale: ptBR });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const updateDates = (dates) => {
    const next = sortUniqueDates(dates);
    onSelectedDatesChange?.(next);
    if (mode === "multipla" && next.length > 0) {
      onSingleDateChange?.(next[0]);
    }
    if (mode === "unica" && next[0]) {
      onSingleDateChange?.(next[0]);
    }
  };

  const handlePickDate = (dateKey) => {
    const normalized = normalizeDateKey(dateKey);
    if (mode === "unica") {
      onSingleDateChange?.(normalized);
      onSelectedDatesChange?.([normalized]);
      setOpen(false);
      return;
    }

    const already = normalizedDates.includes(normalized);
    const next = already
      ? normalizedDates.filter((item) => item !== normalized)
      : [...normalizedDates, normalized];
    updateDates(next);
  };

  const applyShortcut = (rule) => {
    const base = primaryDate || formatDateKey(new Date());
    const generated = generateRecurringDates(base, rule, 6);
    const merged = sortUniqueDates([...normalizedDates, ...generated]);
    onRecurrenceRuleChange?.(rule);
    onModeChange?.("multipla");
    if (!singleDate) onSingleDateChange?.(base);
    updateDates(merged);
    setCursor(parseSafeDate(base));
  };

  const clearDates = () => {
    onSelectedDatesChange?.([]);
    onSingleDateChange?.("");
  };

  const selectedLabel =
    mode === "multipla"
      ? `${normalizedDates.length} data${normalizedDates.length === 1 ? "" : "s"} selecionada${normalizedDates.length === 1 ? "" : "s"}`
      : summarizeDate(primaryDate);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-sky-50/60 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-sky-700">
              {label}
            </p>
            <p className="mt-1 text-[11px] font-bold text-red-600">
              Escolha a melhor visualização para voce
            </p>
            <p className="mt-1 text-xs text-slate-500">{helperText}</p>
          </div>

          <div className="flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onModeChange?.("unica")}
              className={`px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                mode === "unica"
                  ? "bg-sky-600 text-white shadow"
                  : "text-slate-500 hover:bg-slate-50"
              } ${disabled ? "opacity-50" : ""}`}
            >
              Única
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onModeChange?.("multipla")}
              className={`px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                mode === "multipla"
                  ? "bg-sky-600 text-white shadow"
                  : "text-slate-500 hover:bg-slate-50"
              } ${disabled ? "opacity-50" : ""}`}
            >
              Múltipla
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="relative" data-agenda-picker="true">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((prev) => !prev)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-all hover:border-sky-300 hover:bg-white disabled:opacity-60"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 shadow-sm">
                  <CalendarDays size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    {mode === "multipla" ? "Agenda com várias datas" : "Data principal"}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {mode === "multipla"
                      ? selectedLabel
                      : summarizeDate(primaryDate)}
                  </p>
                </div>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                {mode === "multipla" ? "Editar datas" : "Abrir calendário"}
              </div>
            </div>
          </button>

          {open && !disabled && (
            <div className="absolute left-0 right-0 top-[calc(100%+12px)] z-30 rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="flex items-center justify-between gap-2 mb-4">
                <button
                  type="button"
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                  onClick={() => setCursor((prev) => addMonths(prev, -1))}
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="text-center">
                  <p className="text-sm font-black text-slate-800 capitalize">
                    {format(cursor, "MMMM yyyy", { locale: ptBR })}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Clique para {mode === "multipla" ? "adicionar ou remover datas" : "selecionar a data"}
                  </p>
                </div>

                <button
                  type="button"
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                  onClick={() => setCursor((prev) => addMonths(prev, 1))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((dia) => (
                  <div key={dia} className="py-2">
                    {dia}
                  </div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {monthDays.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const selected =
                    mode === "unica"
                      ? key === primaryDate
                      : normalizedDates.includes(key);
                  const today = isSameDay(day, new Date());
                  const outMonth = !isSameMonth(day, cursor);

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePickDate(key)}
                      className={`h-11 rounded-2xl text-sm font-bold transition-all ${
                        selected
                          ? "bg-sky-600 text-white shadow"
                          : today
                          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                          : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                      } ${outMonth ? "opacity-35" : ""}`}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {SHORTCUTS.map((item) => (
                  <button
                    key={item.rule}
                    type="button"
                    onClick={() => applyShortcut(item.rule)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-sky-50 hover:text-sky-700"
                  >
                    <Sparkles size={13} />
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handlePickDate(format(new Date(), "yyyy-MM-dd"))}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"
                >
                  <WandSparkles size={13} />
                  Hoje
                </button>
              </div>

              {mode === "multipla" && normalizedDates.length > 0 && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                      Datas selecionadas
                    </p>
                    <button
                      type="button"
                      onClick={clearDates}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-red-600"
                    >
                      <Trash2 size={12} />
                      Limpar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {normalizedDates.map((dateKey) => (
                      <span
                        key={dateKey}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
                      >
                        {summarizeDate(dateKey)}
                        <button
                          type="button"
                          onClick={() =>
                            updateDates(normalizedDates.filter((item) => item !== dateKey))
                          }
                          className="rounded-full text-slate-400 hover:text-red-500"
                          aria-label={`Remover ${dateKey}`}
                        >
                          <Plus size={12} className="rotate-45" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {mode === "multipla" && (
          <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-sky-700">
              <Sparkles size={14} />
              Atalhos rápidos
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Use os atalhos para criar as próximas reuniões sem precisar clicar uma por uma.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SHORTCUTS.map((item) => (
                <button
                  key={`quick-${item.rule}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => applyShortcut(item.rule)}
                  className="rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:ring-sky-300 hover:text-sky-700 disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              A integração com o Google Agenda pode entrar depois, quando o cadastro da pessoa estiver revisado.
            </p>
          </div>
        )}

        {mode === "unica" && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <span className="font-bold text-slate-700">Google Agenda:</span> a integração vai depender da revisão do cadastro da pessoa. Por enquanto estamos organizando o fluxo visual e de recorrência.
          </div>
        )}
      </div>
    </section>
  );
}
