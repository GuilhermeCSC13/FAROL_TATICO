// src/pages/SalasReuniao.jsx
import { useEffect, useMemo, useState } from "react";
import Layout from "../components/tatico/Layout";
import { supabase } from "../supabaseClient";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Trash2,
  Pencil,
  X,
  Save,
  DoorOpen,
  Users,
} from "lucide-react";
import {
  addDays,
  startOfWeek,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";

// ─────────────────────────────────────────────────────────────────────────
// Util helpers
// ─────────────────────────────────────────────────────────────────────────
const DEFAULT_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
];

function getMeuNome() {
  try {
    const raw = localStorage.getItem("usuario_externo");
    if (!raw) return "";
    const u = JSON.parse(raw);
    return String(u?.nome_completo || u?.nome || "").trim();
  } catch {
    return "";
  }
}

function parseDataLocal(s) {
  if (!s) return null;
  try {
    const str = String(s);
    if (str.includes("T")) return parseISO(str);
    return parseISO(str + "T00:00:00");
  } catch {
    return null;
  }
}

function extractTime(s) {
  if (!s) return "";
  const str = String(s);
  if (str.includes("T")) return str.split("T")[1].substring(0, 5);
  if (str.includes(":")) return str.substring(0, 5);
  return "";
}

function combinaDataHora(dateStr, hora) {
  // dateStr "yyyy-MM-dd", hora "HH:mm" → "yyyy-MM-ddTHH:mm:00"
  const t = String(hora || "").substring(0, 5);
  return `${dateStr}T${t.length === 5 ? t : "00:00"}:00`;
}

// ─────────────────────────────────────────────────────────────────────────
// Modal: criar/editar reserva
// ─────────────────────────────────────────────────────────────────────────
function ModalReserva({ aberto, reserva, salas, salaIdInicial, dataInicial, onClose, onSaved }) {
  const [form, setForm] = useState({
    sala_id: "",
    titulo: "",
    responsavel: "",
    data: format(new Date(), "yyyy-MM-dd"),
    hora_inicio: "09:00",
    hora_fim: "10:00",
    observacoes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    if (reserva) {
      const dt = parseDataLocal(reserva.data_hora_inicio);
      setForm({
        sala_id: String(reserva.sala_id || ""),
        titulo: reserva.titulo || "",
        responsavel: reserva.responsavel || "",
        data: dt ? format(dt, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        hora_inicio: extractTime(reserva.data_hora_inicio) || "09:00",
        hora_fim: extractTime(reserva.data_hora_fim) || "10:00",
        observacoes: reserva.observacoes || "",
      });
    } else {
      setForm({
        sala_id: salaIdInicial ? String(salaIdInicial) : "",
        titulo: "",
        responsavel: getMeuNome(),
        data: dataInicial ? format(dataInicial, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        hora_inicio: "09:00",
        hora_fim: "10:00",
        observacoes: "",
      });
    }
  }, [aberto, reserva, salaIdInicial, dataInicial]);

  const handleSave = async () => {
    if (!form.sala_id) return alert("Selecione a sala.");
    if (!form.titulo.trim()) return alert("Informe o título da reserva.");
    if (!form.responsavel.trim()) return alert("Informe o responsável.");
    if (form.hora_fim <= form.hora_inicio) return alert("Horário final precisa ser maior que o inicial.");

    setSaving(true);
    const payload = {
      sala_id: Number(form.sala_id),
      titulo: form.titulo.trim(),
      responsavel: form.responsavel.trim(),
      data_hora_inicio: combinaDataHora(form.data, form.hora_inicio),
      data_hora_fim: combinaDataHora(form.data, form.hora_fim),
      observacoes: form.observacoes || null,
    };

    let error;
    if (reserva?.id) {
      ({ error } = await supabase.from("reservas_salas").update(payload).eq("id", reserva.id));
    } else {
      ({ error } = await supabase.from("reservas_salas").insert(payload));
    }
    setSaving(false);
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    onSaved?.();
  };

  const handleDelete = async () => {
    if (!reserva?.id) return;
    if (!confirm("Excluir essa reserva?")) return;
    setSaving(true);
    const { error } = await supabase.from("reservas_salas").delete().eq("id", reserva.id);
    setSaving(false);
    if (error) return alert("Erro: " + error.message);
    onSaved?.();
  };

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-black text-slate-800">
            {reserva ? "Editar reserva" : "Nova reserva de sala"}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm">
          <div>
            <label className="text-xs font-extrabold uppercase text-slate-500 block mb-1">Sala</label>
            <select
              value={form.sala_id}
              onChange={(e) => setForm((p) => ({ ...p, sala_id: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700"
            >
              <option value="">Selecione...</option>
              {salas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} {s.capacidade ? `(${s.capacidade}p)` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-extrabold uppercase text-slate-500 block mb-1">Título</label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
              placeholder="Reunião com gestão, treinamento, gravação..."
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="text-xs font-extrabold uppercase text-slate-500 block mb-1">Responsável</label>
            <input
              type="text"
              value={form.responsavel}
              onChange={(e) => setForm((p) => ({ ...p, responsavel: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-extrabold uppercase text-slate-500 block mb-1">Data</label>
              <input
                type="date"
                value={form.data}
                onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-extrabold uppercase text-slate-500 block mb-1">Início</label>
              <input
                type="time"
                value={form.hora_inicio}
                onChange={(e) => setForm((p) => ({ ...p, hora_inicio: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-extrabold uppercase text-slate-500 block mb-1">Fim</label>
              <input
                type="time"
                value={form.hora_fim}
                onChange={(e) => setForm((p) => ({ ...p, hora_fim: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-extrabold uppercase text-slate-500 block mb-1">Observações</label>
            <textarea
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div>
            {reserva?.id && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="text-xs font-bold text-red-600 hover:text-red-800 flex items-center gap-1"
              >
                <Trash2 size={14} /> Excluir
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={14} /> {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Modal: gerenciar salas (CRUD)
// ─────────────────────────────────────────────────────────────────────────
function ModalGerenciarSalas({ aberto, salas, onClose, onChanged }) {
  const [edits, setEdits] = useState({});
  const [novaSala, setNovaSala] = useState({ nome: "", capacidade: "", cor: DEFAULT_COLORS[0] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (aberto) {
      setEdits({});
      setNovaSala({ nome: "", capacidade: "", cor: DEFAULT_COLORS[0] });
    }
  }, [aberto]);

  const handleSaveEdit = async (sala) => {
    const e = edits[sala.id];
    if (!e) return;
    setSaving(true);
    const { error } = await supabase
      .from("salas")
      .update({
        nome: e.nome ?? sala.nome,
        capacidade: e.capacidade !== undefined ? Number(e.capacidade) || null : sala.capacidade,
        cor: e.cor ?? sala.cor,
      })
      .eq("id", sala.id);
    setSaving(false);
    if (error) return alert("Erro: " + error.message);
    setEdits((prev) => ({ ...prev, [sala.id]: undefined }));
    onChanged?.();
  };

  const handleDelete = async (sala) => {
    if (!confirm(`Excluir a sala "${sala.nome}"? Reservas existentes nessa sala serão removidas.`))
      return;
    setSaving(true);
    const { error } = await supabase.from("salas").delete().eq("id", sala.id);
    setSaving(false);
    if (error) return alert("Erro: " + error.message);
    onChanged?.();
  };

  const handleAdd = async () => {
    if (!novaSala.nome.trim()) return alert("Informe o nome da sala.");
    setSaving(true);
    const { error } = await supabase.from("salas").insert({
      nome: novaSala.nome.trim(),
      capacidade: novaSala.capacidade ? Number(novaSala.capacidade) : null,
      cor: novaSala.cor,
      ativa: true,
    });
    setSaving(false);
    if (error) return alert("Erro: " + error.message);
    setNovaSala({ nome: "", capacidade: "", cor: DEFAULT_COLORS[0] });
    onChanged?.();
  };

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-black text-slate-800 flex items-center gap-2">
            <DoorOpen size={18} className="text-blue-600" /> Gerenciar Salas
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Lista */}
          {salas.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-6">Nenhuma sala cadastrada ainda.</div>
          ) : (
            <div className="space-y-2">
              {salas.map((sala) => {
                const ed = edits[sala.id] || {};
                return (
                  <div key={sala.id} className="border border-slate-200 rounded-xl p-3 flex items-center gap-3">
                    <input
                      type="color"
                      value={ed.cor ?? sala.cor ?? DEFAULT_COLORS[0]}
                      onChange={(e) => setEdits((p) => ({ ...p, [sala.id]: { ...ed, cor: e.target.value } }))}
                      className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={ed.nome ?? sala.nome}
                      onChange={(e) => setEdits((p) => ({ ...p, [sala.id]: { ...ed, nome: e.target.value } }))}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold"
                    />
                    <input
                      type="number"
                      placeholder="Cap."
                      value={ed.capacidade ?? sala.capacidade ?? ""}
                      onChange={(e) => setEdits((p) => ({ ...p, [sala.id]: { ...ed, capacidade: e.target.value } }))}
                      className="w-20 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => handleSaveEdit(sala)}
                      disabled={saving || !edits[sala.id]}
                      className="text-blue-600 hover:text-blue-800 disabled:opacity-30"
                      title="Salvar"
                    >
                      <Save size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(sala)}
                      disabled={saving}
                      className="text-red-600 hover:text-red-800 disabled:opacity-30"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Adicionar nova */}
          <div className="border-t border-slate-200 pt-4">
            <div className="text-xs font-extrabold uppercase text-slate-500 mb-2">Adicionar nova sala</div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={novaSala.cor}
                onChange={(e) => setNovaSala((p) => ({ ...p, cor: e.target.value }))}
                className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
              />
              <input
                type="text"
                placeholder="Nome (ex.: Sala Diretoria)"
                value={novaSala.nome}
                onChange={(e) => setNovaSala((p) => ({ ...p, nome: e.target.value }))}
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Cap."
                value={novaSala.capacidade}
                onChange={(e) => setNovaSala((p) => ({ ...p, capacidade: e.target.value }))}
                className="w-20 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={handleAdd}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-1"
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────
export default function SalasReuniao() {
  const [salas, setSalas] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [salaSelecionada, setSalaSelecionada] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const [showReserva, setShowReserva] = useState(false);
  const [reservaEdit, setReservaEdit] = useState(null);
  const [reservaDataInicial, setReservaDataInicial] = useState(null);
  const [showGerenciar, setShowGerenciar] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  const carregar = async () => {
    setLoading(true);
    const [{ data: ds }, { data: dr }] = await Promise.all([
      supabase.from("salas").select("*").order("nome"),
      supabase.from("reservas_salas").select("*").order("data_hora_inicio"),
    ]);
    setSalas(ds || []);
    setReservas(dr || []);
    if (!salaSelecionada && ds?.length) setSalaSelecionada(String(ds[0].id));
    setLoading(false);
  };

  const semanaInicio = startOfWeek(currentDate, { weekStartsOn: 0 });
  const semanaFim = endOfWeek(currentDate, { weekStartsOn: 0 });
  const diasSemana = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => addDays(semanaInicio, i)),
    [semanaInicio]
  );

  const salaAtual = salas.find((s) => String(s.id) === String(salaSelecionada));

  const reservasFiltradas = useMemo(() => {
    if (!salaSelecionada) return [];
    return reservas.filter((r) => String(r.sala_id) === String(salaSelecionada));
  }, [reservas, salaSelecionada]);

  const reservasPorDia = useMemo(() => {
    const m = new Map();
    reservasFiltradas.forEach((r) => {
      const d = parseDataLocal(r.data_hora_inicio);
      if (!d) return;
      const key = format(d, "yyyy-MM-dd");
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    });
    // ordena por hora
    for (const arr of m.values()) {
      arr.sort((a, b) =>
        (extractTime(a.data_hora_inicio) || "").localeCompare(extractTime(b.data_hora_inicio) || "")
      );
    }
    return m;
  }, [reservasFiltradas]);

  const abrirNova = (dia = new Date()) => {
    setReservaEdit(null);
    setReservaDataInicial(dia);
    setShowReserva(true);
  };

  const abrirEdit = (r) => {
    setReservaEdit(r);
    setReservaDataInicial(null);
    setShowReserva(true);
  };

  return (
    <Layout>
      <div className="p-6 h-full flex flex-col bg-gray-50">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <DoorOpen className="text-blue-600" size={26} /> Salas de Reunião
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-0.5">
              Reservas semanais por sala
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={salaSelecionada}
              onChange={(e) => setSalaSelecionada(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
            >
              {salas.length === 0 ? (
                <option value="">Nenhuma sala cadastrada</option>
              ) : (
                salas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))
              )}
            </select>

            <button
              onClick={() => setShowGerenciar(true)}
              className="bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 px-3 py-2 rounded-lg flex items-center gap-2 text-sm text-slate-700 shadow-sm"
              title="Gerenciar salas"
            >
              <Settings size={16} /> <span className="hidden md:inline">Gerenciar</span>
            </button>

            <button
              onClick={() => abrirNova(new Date())}
              disabled={salas.length === 0}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md active:scale-95"
            >
              <Plus size={18} /> Nova reserva
            </button>
          </div>
        </div>

        {/* Sala info */}
        {salaAtual && (
          <div className="mb-3 px-3 py-2 rounded-xl border border-slate-200 bg-white flex items-center gap-3 text-sm">
            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: salaAtual.cor || "#3B82F6" }} />
            <b className="text-slate-800">{salaAtual.nome}</b>
            {salaAtual.capacidade ? (
              <span className="text-slate-500 flex items-center gap-1">
                <Users size={12} /> {salaAtual.capacidade} pessoas
              </span>
            ) : null}
            <span className="ml-auto text-xs text-slate-500">
              {reservasFiltradas.length} reserva{reservasFiltradas.length === 1 ? "" : "s"} no total
            </span>
          </div>
        )}

        {/* Grade semanal */}
        <div className="flex-1 bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-bold text-slate-700 capitalize">
              {format(semanaInicio, "dd MMM", { locale: ptBR })} - {format(semanaFim, "dd MMM yyyy", { locale: ptBR })}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentDate(addDays(currentDate, -7))}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50"
              >
                Hoje
              </button>
              <button
                onClick={() => setCurrentDate(addDays(currentDate, 7))}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-7 divide-x divide-slate-100 overflow-auto">
            {diasSemana.map((dia) => {
              const key = format(dia, "yyyy-MM-dd");
              const lista = reservasPorDia.get(key) || [];
              const ehHoje = isSameDay(dia, new Date());
              return (
                <div key={key} className="flex flex-col min-w-[140px]">
                  <div
                    className={`px-3 py-2 border-b sticky top-0 bg-white z-10 ${
                      ehHoje ? "text-blue-700 font-black" : "text-slate-500 font-bold"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wide">
                      {format(dia, "EEEE", { locale: ptBR })}
                    </div>
                    <div className="text-sm">{format(dia, "dd/MM")}</div>
                  </div>
                  <div
                    className="flex-1 p-2 space-y-2 hover:bg-blue-50/30 transition-colors cursor-pointer"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) abrirNova(dia);
                    }}
                  >
                    {lista.length === 0 && (
                      <div className="text-[11px] text-slate-300 italic text-center pt-2 select-none">
                        Livre
                      </div>
                    )}
                    {lista.map((r) => (
                      <div
                        key={r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirEdit(r);
                        }}
                        className="rounded-lg border border-l-4 bg-white shadow-sm p-2 hover:shadow-md transition cursor-pointer"
                        style={{ borderLeftColor: salaAtual?.cor || "#3B82F6" }}
                      >
                        <div className="text-[10px] text-slate-500 font-bold">
                          {extractTime(r.data_hora_inicio)} - {extractTime(r.data_hora_fim)}
                        </div>
                        <div className="text-xs font-bold text-slate-800 truncate">{r.titulo}</div>
                        <div className="text-[10px] text-slate-500 truncate">{r.responsavel}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {loading && (
          <div className="text-center text-slate-400 text-sm mt-2">Carregando...</div>
        )}
      </div>

      <ModalReserva
        aberto={showReserva}
        reserva={reservaEdit}
        salas={salas}
        salaIdInicial={salaSelecionada}
        dataInicial={reservaDataInicial}
        onClose={() => setShowReserva(false)}
        onSaved={() => {
          setShowReserva(false);
          carregar();
        }}
      />

      <ModalGerenciarSalas
        aberto={showGerenciar}
        salas={salas}
        onClose={() => setShowGerenciar(false)}
        onChanged={carregar}
      />
    </Layout>
  );
}
