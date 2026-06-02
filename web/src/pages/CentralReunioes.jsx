// src/pages/CentralReunioes.jsx
import React, { useState, useEffect, useMemo } from "react";
import Layout from "../components/tatico/Layout";
import { supabase, supabaseInove } from "../supabaseClient";
import { useLocation } from "react-router-dom";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalIcon,
  List,
  X,
  Save,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { salvarReuniao, atualizarReuniao } from "../services/agendaService";
import { parseSafeDate } from "../services/agendaDates";
import { sortUniqueDates } from "../services/agendaDates";
import DetalhesReuniao from "../components/tatico/DetalhesReuniao";
import ModalSincronizarGoogle from "../components/tatico/ModalSincronizarGoogle";

const SENHA_EXCLUSAO = "KM2026";

// ✅ 1. FUNÇÃO "LITERAL" PARA EXTRAIR HORA (IGNORA FUSO)
function extractTime(dateString) {
  if (!dateString) return "";
  const str = String(dateString);

  // Se for ISO completa (tem T), pega o trecho da hora
  if (str.includes("T")) {
    return str.split("T")[1].substring(0, 5);
  }

  // Se já for hora simples (09:00:00)
  if (str.includes(":")) {
    return str.substring(0, 5);
  }

  return "";
}

// ✅ 2. FORMATAR INTERVALO VISUAL
function formatTimeRange(reuniao) {
  try {
    const status = String(reuniao?.status || "").toLowerCase();
    const horaInicioFonte = status.includes("realiz")
      ? reuniao.gravacao_inicio || reuniao.horario_inicio || reuniao.data_hora
      : reuniao.horario_inicio || reuniao.data_hora || reuniao.gravacao_inicio;
    const horaFimFonte = status.includes("realiz")
      ? reuniao.gravacao_fim || reuniao.horario_fim || reuniao.data_hora
      : reuniao.horario_fim || reuniao.gravacao_fim;

    const horaIni =
      extractTime(horaInicioFonte) ||
      extractTime(reuniao.data_hora) ||
      "--:--";
    let horaFim = extractTime(horaFimFonte);

    if (!horaFim || horaFim === "") {
      if (reuniao.duracao_segundos) {
        const [h, m] = horaIni.split(":").map(Number);
        const totalMin = h * 60 + m + reuniao.duracao_segundos / 60;
        const novoH = Math.floor(totalMin / 60) % 24;
        const novoM = totalMin % 60;
        horaFim = `${String(novoH).padStart(2, "0")}:${String(novoM).padStart(
          2,
          "0"
        )}`;
      }
    }
    return horaFim ? `${horaIni} - ${horaFim}` : horaIni;
  } catch {
    return "--:--";
  }
}

function parseDataLocal(dataString) {
  return parseSafeDate(dataString);
}

function statusBadge(status) {
  const s = String(status || "").toLowerCase();

  if (s.includes("realiz")) return { text: "✅", title: "Realizada", kind: "done" };

  // ✅ NOVO: Cancelada explícito (X vermelho)
  if (s.includes("cancel")) return { text: "✖ Cancelada", title: "Cancelada", kind: "cancel" };

  if (s.includes("nao") || s.includes("não"))
    return { text: "✖", title: "Não realizada", kind: "no" };

  return { text: "●", title: "Agendada", kind: "scheduled" };
}

function calcDuracaoSegundos(inicioHHMM, fimHHMM) {
  try {
    if (!inicioHHMM || !fimHHMM) return null;
    const [hi, mi] = inicioHHMM.split(":").map(Number);
    const [hf, mf] = fimHHMM.split(":").map(Number);
    const ini = hi * 60 + mi;
    const fim = hf * 60 + mf;
    const diff = Math.max(0, fim - ini);
    return diff * 60;
  } catch {
    return null;
  }
}

function sameSeriesCandidate(a, b) {
  if (!a || !b) return false;
  return (
    String(a.titulo || "").trim().toLowerCase() ===
      String(b.titulo || "").trim().toLowerCase() &&
    String(a.tipo_reuniao_id || "") === String(b.tipo_reuniao_id || "") &&
    String(a.tipo_reuniao_legacy || "").trim().toLowerCase() ===
      String(b.tipo_reuniao_legacy || "").trim().toLowerCase() &&
    String(a.responsavel || "").trim().toLowerCase() ===
      String(b.responsavel || "").trim().toLowerCase() &&
    String(a.area_id || "") === String(b.area_id || "")
  );
}

// ✅ NOVO: salvar participantes manuais após criar a reunião (para não sumir)
async function salvarParticipantesManuais(reuniaoId, participantes) {
  const lista = Array.isArray(participantes) ? participantes : [];
  const payload = lista
    .filter((p) => String(p?.nome || "").trim())
    .map((p) => ({
      reuniao_id: reuniaoId,
      nome: String(p.nome || "").trim(),
      email: String(p.email || "").trim(),
      presente: false,
    }));

  if (!payload.length) return;

  const { error } = await supabase.from("participantes_reuniao").insert(payload);
  if (error) throw error;
}

export default function CentralReunioes() {
  const location = useLocation();
  const editId = new URLSearchParams(location.search).get("editId");
  const newParam = new URLSearchParams(location.search).get("new");
  const [view, setView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reunioes, setReunioes] = useState([]);
  const [tipos, setTipos] = useState([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReuniao, setEditingReuniao] = useState(null);
  const [queryEditHandledId, setQueryEditHandledId] = useState("");
  const [queryNewHandled, setQueryNewHandled] = useState(false);
  const [showGoogleSync, setShowGoogleSync] = useState(false);

  // Estados para Exclusão Segura
  const [showDeleteAuth, setShowDeleteAuth] = useState(false);
  const [delLogin, setDelLogin] = useState("");
  const [delSenha, setDelSenha] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [salasList, setSalasList] = useState([]);
  const [formData, setFormData] = useState({
    titulo: "",
    tipo_reuniao_id: "",
    sala_id: "",
    data: "",
    hora_inicio: "09:00",
    hora_fim: "09:15",
    cor: "#3B82F6",
    responsavel: "",
    ata: "",
    status: "Agendada",
    materiais: [],
    participantes_manuais: [], // ✅ NOVO
    agenda_mode: "unica",
    datas_selecionadas: [],
    recurrence_rule: "semanal",
  });

  const [draggingReuniao, setDraggingReuniao] = useState(null);

  useEffect(() => {
    fetchTipos();
    fetchSalas();
  }, []);

  const fetchSalas = async () => {
    const { data } = await supabase.from("salas").select("*").order("nome");
    setSalasList(data || []);
  };

  useEffect(() => {
    fetchReunioes();
  }, [currentDate]);

  const fetchTipos = async () => {
    const { data, error } = await supabase
      .from("tipos_reuniao")
      .select("*")
      .order("nome");
    if (error) {
      console.error(error);
      alert("Erro ao carregar tipos.");
      return;
    }
    setTipos(data || []);
  };

  const fetchReunioes = async () => {
    const { data, error } = await supabase
      .from("reunioes")
      .select(`*, tipos_reuniao:tipo_reuniao_id ( id, nome, ata_principal, cor )`)
      .order("data_hora");
    if (error) console.error(error);
    setReunioes(data || []);
  };

  const getTipoById = (id) =>
    tipos.find((t) => String(t.id) === String(id)) || null;

  const onDateClick = (day) => {
    setEditingReuniao(null);
    const dateKey = format(day, "yyyy-MM-dd");
    setFormData({
      titulo: "",
      tipo_reuniao_id: "",
      data: dateKey,
      hora_inicio: "09:00",
      hora_fim: "10:00",
      cor: "#3B82F6",
      responsavel: "",
      ata: "",
      status: "Agendada",
      materiais: [],
      participantes_manuais: [], // ✅ NOVO
      agenda_mode: "unica",
      datas_selecionadas: [dateKey],
      recurrence_rule: "semanal",
    });
    setIsModalOpen(true);
  };

  const handleEdit = (reuniao) => {
    const dt = parseDataLocal(reuniao.data_hora);
    const baseDateKey = format(dt, "yyyy-MM-dd");
    const seriesDates = reunioes
      .filter(
        (r) =>
          String(r.id) !== String(reuniao.id) &&
          sameSeriesCandidate(r, reuniao) &&
          parseDataLocal(r.data_hora) >= dt
      )
      .sort((a, b) => parseDataLocal(a.data_hora) - parseDataLocal(b.data_hora))
      .map((r) => format(parseDataLocal(r.data_hora), "yyyy-MM-dd"));
    const hhmmIni =
      extractTime(reuniao.horario_inicio) ||
      extractTime(reuniao.gravacao_inicio) ||
      extractTime(reuniao.data_hora) ||
      "09:00";
    let hhmmFim =
      extractTime(reuniao.horario_fim) ||
      extractTime(reuniao.gravacao_fim);

    if (!hhmmFim) {
      hhmmFim = "10:00";
    }

    setFormData({
      titulo: reuniao.titulo || "",
      tipo_reuniao_id: reuniao.tipo_reuniao_id || "",
      sala_id: reuniao.sala_id || "",
      data: baseDateKey,
      hora_inicio: hhmmIni,
      hora_fim: hhmmFim,
      cor: reuniao.cor || "#3B82F6",
      responsavel: reuniao.responsavel || "",
      ata: reuniao.ata || "",
      status: reuniao.status || "Agendada",
      materiais: reuniao.materiais || [],
      participantes_manuais: [],
      agenda_mode: seriesDates.length > 0 ? "multipla" : "unica",
      datas_selecionadas: [baseDateKey, ...seriesDates],
      recurrence_rule: "semanal",
    });

    setEditingReuniao(reuniao);
    setIsModalOpen(true);
  };

  // ✅ NOVO: Cancelar reunião (não some; mantém histórico)
  useEffect(() => {
    if (!editId || isModalOpen || editId === queryEditHandledId || reunioes.length === 0) return;
    const target = reunioes.find((r) => String(r.id) === String(editId));
    if (target) {
      handleEdit(target);
      setQueryEditHandledId(editId);
    }
  }, [editId, reunioes, isModalOpen, queryEditHandledId]);

  useEffect(() => {
    if (!newParam || queryNewHandled || isModalOpen) return;
    onDateClick(new Date());
    setQueryNewHandled(true);
  }, [newParam, queryNewHandled, isModalOpen]);

  const cancelarReuniao = async () => {
    if (!editingReuniao?.id) return;

    const ok = window.confirm(
      "Cancelar esta reunião? Ela continuará no histórico como Cancelada."
    );
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("reunioes")
        .update({ status: "Cancelada" })
        .eq("id", editingReuniao.id);

      if (error) throw error;

      setFormData((prev) => ({ ...prev, status: "Cancelada" }));
      await fetchReunioes();
      alert("Reunião cancelada (mantida no histórico).");
    } catch (err) {
      console.error(err);
      alert("Erro ao cancelar: " + (err?.message || ""));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const tipo = getTipoById(formData.tipo_reuniao_id);
    const tipoNome = tipo?.nome || "Geral";

    const dataHoraIso = `${formData.data}T${formData.hora_inicio}:00`;
    const horaFimIso = `${formData.data}T${formData.hora_fim}:00`;
    const duracao_segundos = calcDuracaoSegundos(
      formData.hora_inicio,
      formData.hora_fim
    );
    const agendaMode = formData.agenda_mode || "unica";
    const rawDates =
      Array.isArray(formData.datas_selecionadas) &&
      formData.datas_selecionadas.length > 0
        ? formData.datas_selecionadas
        : [formData.data];
    const datasSelecionadas =
      agendaMode === "multipla"
        ? sortUniqueDates(rawDates)
        : [formData.data];

    const dados = {
      titulo: formData.titulo,
      data_hora: dataHoraIso,
      tipo_reuniao_id: formData.tipo_reuniao_id || null,
      sala_id: formData.sala_id ? Number(formData.sala_id) : null,
      tipo_reuniao_legacy: tipoNome,
      duracao_segundos,
      cor: formData.cor,
      responsavel: formData.responsavel,
      ata: formData.ata,
      status: formData.status,
      horario_inicio: dataHoraIso,
      horario_fim: horaFimIso,
      area_id: 4,
      materiais: formData.materiais || [],
    };

    try {
      if (editingReuniao) {
        const { error } = await atualizarReuniao(editingReuniao.id, dados, {
          mode: agendaMode,
          selectedDates: datasSelecionadas,
          rule: formData.recurrence_rule || "semanal",
          count: 6,
          timeValue: formData.hora_inicio,
        });
        if (error) throw error;
      } else {
        // ✅ precisa retornar data com id (select().single()) no agendaService
        const { data, error } = await salvarReuniao(dados, {
          mode: agendaMode,
          selectedDates: datasSelecionadas,
          rule: formData.recurrence_rule || "semanal",
          count: 6,
          timeValue: formData.hora_inicio,
        });
        if (error) throw error;

        const reunioesCriadas = Array.isArray(data) ? data : [data];
        for (const item of reunioesCriadas) {
          if (item?.id) {
            await salvarParticipantesManuais(
              item.id,
              formData.participantes_manuais
            );
          }
        }
      }

      setIsModalOpen(false);
      setEditingReuniao(null);
      await fetchReunioes();
    } catch (err) {
      console.error(err);
      alert(err?.message ? `Erro ao salvar: ${err.message}` : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteAuth(true);
    setDelLogin("");
    setDelSenha("");
  };

  const confirmarExclusao = async () => {
    if (!delLogin || !delSenha) return alert("Informe Login e Senha.");
    setDeleting(true);

    try {
      const { data: usuario, error: errAuth } = await supabaseInove
        .from("usuarios_aprovadores")
        .select("id, login, senha, nivel, ativo")
        .eq("login", delLogin)
        .eq("senha", delSenha)
        .eq("ativo", true)
        .maybeSingle();

      if (errAuth) throw errAuth;

      if (!usuario) {
        alert("Credenciais inválidas.");
        setDeleting(false);
        return;
      }

      if (usuario.nivel !== "Administrador" && usuario.nivel !== "Gestor") {
        alert(
          "Permissão negada. Apenas Gestores e Administradores podem excluir reuniões."
        );
        setDeleting(false);
        return;
      }

      const { error: errDel } = await supabase
        .from("reunioes")
        .delete()
        .eq("id", editingReuniao.id);
      if (errDel) throw errDel;

      alert("Reunião excluída com sucesso.");
      setShowDeleteAuth(false);
      setIsModalOpen(false);
      setEditingReuniao(null);
      fetchReunioes();
    } catch (error) {
      console.error("Erro exclusão:", error);
      alert("Erro ao excluir: " + error.message);
    } finally {
      setDeleting(false);
    }
  };

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  });

  const weekDays = eachDayOfInterval({
    start: startOfWeek(currentDate),
    end: endOfWeek(currentDate),
  });

  const handleDragStart = (e, reuniao) => {
    setDraggingReuniao(reuniao);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOverDay = (e) => e.preventDefault();

  const handleDropOnDay = async (e, day) => {
    e.preventDefault();
    if (!draggingReuniao) return;
    try {
      const horaOrig = extractTime(draggingReuniao.horario_inicio) || "09:00";
      const novaDataHora = `${format(day, "yyyy-MM-dd")}T${horaOrig}:00`;

      let novoFim = null;
      const horaFimOrig = extractTime(draggingReuniao.horario_fim);
      if (horaFimOrig) {
        novoFim = `${format(day, "yyyy-MM-dd")}T${horaFimOrig}:00`;
      }

      const { error } = await supabase
        .from("reunioes")
        .update({
          data_hora: novaDataHora,
          horario_inicio: novaDataHora,
          horario_fim: novoFim,
        })
        .eq("id", draggingReuniao.id);
      if (error) throw error;
      await fetchReunioes();
    } catch (err) {
      console.error(err);
      alert("Erro ao mover: " + (err?.message || ""));
    } finally {
      setDraggingReuniao(null);
    }
  };

  const reunioesAgrupadas = useMemo(() => {
    return reunioes.reduce((acc, r) => {
      const day = format(parseDataLocal(r.data_hora), "yyyy-MM-dd");
      if (!acc[day]) acc[day] = [];
      acc[day].push(r);
      return acc;
    }, {});
  }, [reunioes]);

  const tipoLabel = (r) =>
    r.tipos_reuniao?.nome || r.tipo_reuniao_legacy || "Geral";

  return (
    <Layout>
      <div className="flex flex-col h-screen p-6 bg-slate-50 font-sans overflow-hidden relative">
        {/* ✅ OVERLAY DE EXCLUSÃO (LOGIN/SENHA) - CORRIGIDO Z-INDEX */}
        {showDeleteAuth && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white border border-red-100 shadow-2xl rounded-2xl p-6 text-center relative">
              <button
                onClick={() => setShowDeleteAuth(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                <ShieldAlert size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Área Restrita</h3>
              <p className="text-sm text-slate-500 mb-6">
                Exclusão permitida apenas para <b>Gestores</b> ou{" "}
                <b>Administradores</b>.
              </p>
              <div className="space-y-3 text-left">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase">
                    Login
                  </label>
                  <input
                    type="text"
                    autoFocus
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    value={delLogin}
                    onChange={(e) => setDelLogin(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase">
                    Senha
                  </label>
                  <input
                    type="password"
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    value={delSenha}
                    onChange={(e) => setDelSenha(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowDeleteAuth(false)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarExclusao}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "Verificando..." : "Confirmar Exclusão"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Calendário Tático</h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm font-bold text-red-600">
              Escolha a melhor visualização para voce
            </p>
            <div className="bg-white border p-1 rounded-lg flex shadow-sm">
              <button
                onClick={() => setView("week")}
                className={`p-2 rounded ${
                  view === "week" ? "bg-blue-100 text-blue-700" : "text-slate-500"
                }`}
                title="Semanal"
              >
                S
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-2 rounded ${
                  view === "list" ? "bg-blue-100 text-blue-700" : "text-slate-500"
                }`}
                title="Lista"
              >
                <List size={18} />
              </button>
              <button
                onClick={() => setView("calendar")}
                className={`p-2 rounded ${
                  view === "calendar"
                    ? "bg-blue-100 text-blue-700"
                    : "text-slate-500"
                }`}
                title="Calendário"
              >
                <CalIcon size={18} />
              </button>
            </div>
            <button
              onClick={() => setShowGoogleSync(true)}
              className="bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 px-3 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm active:scale-95 transition-all"
              title="Sincronizar com Google Agenda"
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5c3.3 6.4 10 10 17.8 10z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2C40.9 35.6 44 30.3 44 24c0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
              <span className="hidden md:inline">Google Agenda</span>
            </button>
            <button
              onClick={() => onDateClick(new Date())}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md active:scale-95 transition-all"
            >
              <Plus size={18} /> Nova
            </button>
          </div>
        </div>

        {view === "week" && (
          <div className="flex-1 bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-bold text-slate-700 capitalize">
                {format(startOfWeek(currentDate), "dd MMM", { locale: ptBR })} -{" "}
                {format(endOfWeek(currentDate), "dd MMM yyyy", { locale: ptBR })}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <ChevronLeft />
                </button>
                <button
                  onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <ChevronRight />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 flex-1">
              {weekDays.map((day) => (
                <div
                  key={day.toString()}
                  className="border-r p-4 bg-white overflow-y-auto"
                  onDragOver={handleDragOverDay}
                  onDrop={(e) => handleDropOnDay(e, day)}
                >
                  <h3
                    className={`text-sm font-bold mb-4 uppercase ${
                      isSameDay(day, new Date()) ? "text-blue-600" : "text-slate-400"
                    }`}
                  >
                    {format(day, "EEE dd/MM", { locale: ptBR })}
                  </h3>
                  {reunioes
                    .filter((r) => isSameDay(parseDataLocal(r.data_hora), day))
                    .sort((a, b) => {
                      const ha = extractTime(a.horario_inicio) || extractTime(a.data_hora) || "";
                      const hb = extractTime(b.horario_inicio) || extractTime(b.data_hora) || "";
                      return ha.localeCompare(hb);
                    })
                    .map((m) => {
                      const badge = statusBadge(m.status);
                      const timeRange = formatTimeRange(m);
                      return (
                        <div
                          key={m.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, m)}
                          onClick={() => handleEdit(m)}
                          className="p-3 mb-2 rounded-xl border border-slate-100 shadow-sm cursor-pointer hover:shadow-md transition-shadow flex items-start justify-between gap-2 bg-white"
                          style={{ borderLeft: `4px solid ${m.cor}` }}
                        >
                          <div>
                            <p className="text-[10px] font-bold text-slate-400">
                              {timeRange}
                            </p>
                            <p className="text-xs font-bold text-slate-700 leading-tight">
                              {m.titulo}
                            </p>
                            <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">
                              {tipoLabel(m)}
                            </p>
                          </div>
                          <span
                            className={`text-sm font-black ${
                              badge.kind === "done"
                                ? "text-green-600"
                                : badge.kind === "cancel"
                                ? "text-red-600"
                                : badge.kind === "no"
                                ? "text-slate-500"
                                : "text-yellow-500"
                            }`}
                            title={badge.title}
                          >
                            {badge.text}
                          </span>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "list" && (
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-y-auto p-6">
            {Object.entries(reunioesAgrupadas)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, meetings]) => (
                <div key={day} className="mb-8">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
                    {format(parseISO(day), "dd 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {meetings.map((m) => {
                      const badge = statusBadge(m.status);
                      const timeRange = formatTimeRange(m);
                      return (
                        <div
                          key={m.id}
                          onClick={() => handleEdit(m)}
                          className="p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-white hover:shadow-md transition-all flex items-center gap-4 justify-between"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className="w-2 h-10 rounded-full"
                              style={{ backgroundColor: m.cor }}
                            />
                            <div>
                              <p className="text-xs font-bold text-blue-600">
                                {timeRange}
                              </p>
                              <h4 className="font-bold text-slate-800">
                                {m.titulo}
                              </h4>
                              <p className="text-[10px] text-slate-500 uppercase font-bold">
                                {tipoLabel(m)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-sm font-black ${
                              badge.kind === "done"
                                ? "text-green-600"
                                : badge.kind === "cancel"
                                ? "text-red-600"
                                : badge.kind === "no"
                                ? "text-slate-500"
                                : "text-yellow-500"
                            }`}
                            title={badge.title}
                          >
                            {badge.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}

        {view === "calendar" && (
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-bold text-slate-700 capitalize">
                {format(currentDate, "MMMM yyyy", { locale: ptBR })}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <ChevronLeft />
                </button>
                <button
                  onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <ChevronRight />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 flex-1 overflow-y-auto">
              {calendarDays.map((day) => (
                <div
                  key={day.toString()}
                  onClick={() => onDateClick(day)}
                  onDragOver={handleDragOverDay}
                  onDrop={(e) => handleDropOnDay(e, day)}
                  className={`border-r border-b min-h-[120px] p-2 hover:bg-blue-50/20 transition-colors ${
                    !isSameMonth(day, currentDate) ? "opacity-30" : ""
                  }`}
                >
                  <span
                    className={`text-xs font-bold ${
                      isSameDay(day, new Date())
                        ? "bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center"
                        : ""
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {reunioes
                    .filter((r) => isSameDay(parseDataLocal(r.data_hora), day))
                    .sort((a, b) => {
                      const ha = extractTime(a.horario_inicio) || extractTime(a.data_hora) || "";
                      const hb = extractTime(b.horario_inicio) || extractTime(b.data_hora) || "";
                      return ha.localeCompare(hb);
                    })
                    .map((m) => {
                      const badge = statusBadge(m.status);
                      const timeRange = formatTimeRange(m);
                      return (
                        <div
                          key={m.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, m)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(m);
                          }}
                          className="text-[10px] truncate p-1 mt-1 rounded border-l-2 font-medium cursor-pointer flex items-center justify-between gap-2"
                          style={{
                            borderLeftColor: m.cor,
                            backgroundColor: (m.cor || "#3B82F6") + "15",
                          }}
                          title={m.titulo}
                        >
                          <span className="truncate">
                            {timeRange} {m.titulo}
                          </span>
                          <span
                            className={`text-[10px] font-black ${
                              badge.kind === "done"
                                ? "text-green-600"
                                : badge.kind === "cancel"
                                ? "text-red-600"
                                : badge.kind === "no"
                                ? "text-slate-500"
                                : "text-yellow-500"
                            }`}
                            title={badge.title}
                          >
                            {badge.text}
                          </span>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL DETALHES */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-[min(98vw,1800px)] h-[94vh] flex flex-col overflow-hidden">
            <div className="bg-white px-6 sm:px-8 py-4 sm:py-5 border-b flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-slate-800">
                {editingReuniao ? "Editar Reunião" : "Nova Reunião"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <form
              id="form-reuniao"
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto p-6 sm:p-8 bg-white"
            >
              <DetalhesReuniao
                formData={formData}
                setFormData={setFormData}
                editingReuniao={editingReuniao}
                tipos={tipos}
                salas={salasList}
                isRealizada={formData.status === "Realizada"}
                onDeleteRequest={handleDeleteClick}
                onCancelRequest={cancelarReuniao} // ✅ NOVO
              />
            </form>

            <div className="bg-slate-50 p-4 sm:p-5 border-t flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2 text-slate-500 font-bold disabled:opacity-50"
                type="button"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="form-reuniao"
                disabled={saving}
                className="px-10 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Save size={18} /> Salvar Alterações
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalSincronizarGoogle
        aberto={showGoogleSync}
        onClose={() => setShowGoogleSync(false)}
        reunioes={reunioes}
        tipos={tipos}
      />
    </Layout>
  );
}
