// src/components/tatico/DetalhesReuniao.jsx
import React, { useMemo, useEffect, useState } from "react";
import AgendaDatePlanner from "./AgendaDatePlanner";
import PrettyTimePicker from "./PrettyTimePicker";
import {
  Clock,
  AlignLeft,
  FileText,
  Paperclip,
  Loader2,
  Plus,
  Trash2,
  Download,
  ImageIcon,
  ShieldAlert,
  User,
  X,
  Users,
  UserPlus,
  Mail,
} from "lucide-react";
import { format, isValid } from "date-fns";
import { supabase, supabaseInove } from "../../supabaseClient";
import { sincronizarReuniaoGoogle } from "../../services/googleCalendarSync";

// Helper robusto para extrair HH:mm
function extractTime(dateString) {
  if (!dateString) return "";
  if (String(dateString).length <= 8 && String(dateString).includes(":")) {
    return String(dateString).substring(0, 5);
  }
  try {
    const date = new Date(dateString);
    if (isValid(date)) {
      return format(date, "HH:mm");
    }
  } catch (e) {
    console.warn("Data inválida:", dateString);
  }
  return "";
}

// Helper para nome completo
function buildNomeSobrenome(u) {
  const nome = String(u?.nome || "").trim();
  const sobrenome = String(u?.sobrenome || "").trim();
  const nomeCompleto = String(u?.nome_completo || "").trim();
  if (nome && sobrenome) return `${nome} ${sobrenome}`;
  if (nomeCompleto) return nomeCompleto;
  if (nome) return nome;
  return "-";
}

export default function DetalhesReuniao({
  formData,
  setFormData,
  editingReuniao,
  tipos = [],
  salas = [],
  isRealizada = false,
  onDeleteRequest,
  onCancelRequest, // ✅ NOVO
  onAplicarHorarioSerie,
}) {
  const [uploadingMaterial, setUploadingMaterial] = useState(false);

  // Estados para Responsáveis e Autocomplete Geral
  const [listaResponsaveis, setListaResponsaveis] = useState([]);
  const [showSugestoesResp, setShowSugestoesResp] = useState(false); // Para Organizador

  // ✅ Participantes do TIPO (Padrão - Somente Leitura)
  const [participantesTipo, setParticipantesTipo] = useState([]);
  const [loadingParticipantesTipo, setLoadingParticipantesTipo] = useState(false);

  // ✅ Participantes MANUAIS (Adicionais)
  const [participantesManuais, setParticipantesManuais] = useState([]);
  const [loadingManuais, setLoadingManuais] = useState(false);
  const [novoParticipante, setNovoParticipante] = useState({ nome: "", email: "" });
  const [addingPart, setAddingPart] = useState(false);

  // ✅ Estado que faltava: Sugestões para Participante Manual
  const [showSugestoesPart, setShowSugestoesPart] = useState(false);

  // Estados para Exclusão de Material
  const [showAuthMaterial, setShowAuthMaterial] = useState(false);
  const [authLoginMat, setAuthLoginMat] = useState("");
  const [authSenhaMat, setAuthSenhaMat] = useState("");
  const [validatingAuthMat, setValidatingAuthMat] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState(null);

  const handleChange = (name, value) =>
    setFormData((prev) => ({ ...prev, [name]: value }));

  const selectedTipo = useMemo(() => {
    return (
      tipos.find((t) => String(t.id) === String(formData.tipo_reuniao_id)) || null
    );
  }, [tipos, formData.tipo_reuniao_id]);

  // Carregar lista de usuários (aprovadores) do Inove
  useEffect(() => {
    const fetchResponsaveis = async () => {
      const { data, error } = await supabaseInove
        .from("usuarios_aprovadores")
        .select("id, nome, sobrenome, nome_completo, ativo, email, login")
        .eq("ativo", true)
        .order("nome");

      if (error) console.error("Erro ao buscar usuários:", error);
      setListaResponsaveis(data || []);
    };
    fetchResponsaveis();
  }, []);

  // Nome do responsável padrão (Organizador) vindo do tipo
  const responsavelPadraoNome = useMemo(() => {
    const rid = selectedTipo?.responsavel_id;
    if (!rid) return "";
    const u = (listaResponsaveis || []).find(
      (x) => String(x.id) === String(rid)
    );
    return u ? buildNomeSobrenome(u) : "";
  }, [selectedTipo?.responsavel_id, listaResponsaveis]);

  // Auto-preencher Organizador
  useEffect(() => {
    if (
      !isRealizada &&
      !String(formData.responsavel || "").trim() &&
      responsavelPadraoNome
    ) {
      setFormData((prev) => ({ ...prev, responsavel: responsavelPadraoNome }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responsavelPadraoNome, selectedTipo?.id]);

  // Carregar participantes padrão do TIPO
  useEffect(() => {
    const loadParticipantesTipo = async () => {
      const tipoId = selectedTipo?.id;
      if (!tipoId) {
        setParticipantesTipo([]);
        return;
      }

      setLoadingParticipantesTipo(true);
      try {
        const { data, error } = await supabase
          .from("participantes_tipo_reuniao")
          .select("id, usuario_id, nome, email, cargo")
          .eq("tipo_reuniao_id", tipoId)
          .order("nome", { ascending: true });

        if (error) throw error;
        setParticipantesTipo(data || []);
      } catch (err) {
        console.warn("Erro participantes_tipo_reuniao:", err.message);
        setParticipantesTipo([]);
      } finally {
        setLoadingParticipantesTipo(false);
      }
    };

    loadParticipantesTipo();
  }, [selectedTipo?.id]);

  // Carregar participantes MANUAIS da reunião (se for edição)
  useEffect(() => {
    const loadParticipantesManuais = async () => {
      if (editingReuniao?.id) {
        setLoadingManuais(true);
        try {
          const { data, error } = await supabase
            .from("participantes_reuniao")
            .select("*")
            .eq("reuniao_id", editingReuniao.id)
            .order("nome", { ascending: true });

          if (error) throw error;
          setParticipantesManuais(data || []);
        } catch (err) {
          console.warn("Erro participantes_reuniao:", err.message);
        } finally {
          setLoadingManuais(false);
        }
      } else {
        if (formData.participantes_manuais) {
          setParticipantesManuais(formData.participantes_manuais);
        } else {
          setParticipantesManuais([]);
        }
      }
    };

    loadParticipantesManuais();
  }, [editingReuniao?.id]);

  useEffect(() => {
    if (editingReuniao) {
      const horaIni =
        extractTime(editingReuniao.horario_inicio) ||
        extractTime(editingReuniao.data_hora) ||
        "09:00";
      const horaFim = extractTime(editingReuniao.horario_fim) || "10:00";

      const materiaisSeguros = Array.isArray(editingReuniao.materiais)
        ? editingReuniao.materiais
        : [];

      setFormData((prev) => ({
        ...prev,
        hora_inicio: prev.hora_inicio || horaIni,
        hora_fim: prev.hora_fim || horaFim,
        materiais:
          prev.materiais && prev.materiais.length > 0
            ? prev.materiais
            : materiaisSeguros,
      }));
    }
  }, [editingReuniao, setFormData]);

  const usarAtaDoTipo = () => {
    const guia = selectedTipo?.ata_principal || "";
    if (!guia) return;
    handleChange("ata", guia);
  };

  // ✅ ADICIONAR PARTICIPANTE MANUAL
  const handleAddParticipante = async () => {
    if (!novoParticipante.nome.trim())
      return alert("Informe o nome do participante.");

    setAddingPart(true);
    try {
      if (editingReuniao?.id) {
        const { data, error } = await supabase
          .from("participantes_reuniao")
          .insert({
            reuniao_id: editingReuniao.id,
            nome: novoParticipante.nome,
            email: novoParticipante.email,
            presente: false,
          })
          .select()
          .single();

        if (error) throw error;
        setParticipantesManuais((prev) => [...prev, data]);
        void sincronizarReuniaoGoogle(editingReuniao.id);
      } else {
        const tempId = `temp-${Date.now()}`;
        const novo = { ...novoParticipante, id: tempId, is_temp: true };
        const novaLista = [...participantesManuais, novo];
        setParticipantesManuais(novaLista);
        handleChange("participantes_manuais", novaLista);
      }
      setNovoParticipante({ nome: "", email: "" });
      setShowSugestoesPart(false);
    } catch (err) {
      alert("Erro ao adicionar participante: " + err.message);
    } finally {
      setAddingPart(false);
    }
  };

  const handleRemoveParticipante = async (id) => {
    try {
      if (editingReuniao?.id && !String(id).startsWith("temp-")) {
        const { error } = await supabase
          .from("participantes_reuniao")
          .delete()
          .eq("id", id);
        if (error) throw error;
        void sincronizarReuniaoGoogle(editingReuniao.id);
      }

      const novaLista = participantesManuais.filter((p) => p.id !== id);
      setParticipantesManuais(novaLista);

      if (!editingReuniao?.id) {
        handleChange("participantes_manuais", novaLista);
      }
    } catch (err) {
      alert("Erro ao remover participante: " + err.message);
    }
  };

  // Upload Material
  const handleUploadMaterial = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingMaterial(true);
    try {
      const novosMateriais = [];
      for (const file of files) {
        const fileExt = file.name.split(".").pop();
        const baseId = editingReuniao?.id || "nova";
        const fileName = `${baseId}-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 5)}.${fileExt}`;
        const filePath = `anexos/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("materiais")
          .upload(filePath, file);
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from("materiais")
          .getPublicUrl(filePath);
        if (urlData?.publicUrl) {
          novosMateriais.push({
            name: file.name,
            url: urlData.publicUrl,
            type: file.type,
            path: filePath,
          });
        }
      }

      const listaAtual = Array.isArray(formData.materiais) ? formData.materiais : [];
      const listaFinal = [...listaAtual, ...novosMateriais];
      handleChange("materiais", listaFinal);

      if (editingReuniao?.id) {
        const { error: dbError } = await supabase
          .from("reunioes")
          .update({ materiais: listaFinal })
          .eq("id", editingReuniao.id);
        if (dbError) throw dbError;
      }
    } catch (err) {
      console.error("Erro upload:", err);
      alert("Erro ao enviar arquivo: " + err.message);
    } finally {
      setUploadingMaterial(false);
      e.target.value = null;
    }
  };

  const handleRequestDeleteMaterial = (index) => {
    setMaterialToDelete(index);
    setAuthLoginMat("");
    setAuthSenhaMat("");
    setShowAuthMaterial(true);
  };

  const confirmDeleteMaterial = async () => {
    if (!authLoginMat || !authSenhaMat) return alert("Informe Login e Senha.");
    setValidatingAuthMat(true);
    try {
      const { data: usuario, error } = await supabaseInove
        .from("usuarios_aprovadores")
        .select("nivel, ativo")
        .eq("login", authLoginMat)
        .eq("senha", authSenhaMat)
        .eq("ativo", true)
        .maybeSingle();

      if (error) throw error;
      if (!usuario) {
        alert("Credenciais inválidas.");
        return;
      }
      if (usuario.nivel !== "Gestor" && usuario.nivel !== "Administrador") {
        alert("Apenas Gestores/ADM podem excluir anexos.");
        return;
      }

      const listaAtual = Array.isArray(formData.materiais) ? formData.materiais : [];
      const novaLista = listaAtual.filter((_, i) => i !== materialToDelete);
      handleChange("materiais", novaLista);

      if (editingReuniao?.id) {
        const { error: dbError } = await supabase
          .from("reunioes")
          .update({ materiais: novaLista })
          .eq("id", editingReuniao.id);
        if (dbError) throw dbError;
      }

      setShowAuthMaterial(false);
      setMaterialToDelete(null);
    } catch (err) {
      console.error(err);
      alert("Erro: " + err.message);
    } finally {
      setValidatingAuthMat(false);
    }
  };

  // ✅ [ORGANIZADOR] Autocomplete logic
  const filteredResponsaveis = useMemo(() => {
    const termo = (formData.responsavel || "").toLowerCase();
    return listaResponsaveis
      .filter((u) => buildNomeSobrenome(u).toLowerCase().includes(termo))
      .slice(0, 8);
  }, [listaResponsaveis, formData.responsavel]);

  const selectResponsavel = (u) => {
    const nome = buildNomeSobrenome(u);
    handleChange("responsavel", nome);
    setShowSugestoesResp(false);
  };

  // ✅ [PARTICIPANTE MANUAL] Autocomplete logic
  const filteredParticipantesAdd = useMemo(() => {
    const termo = (novoParticipante.nome || "").toLowerCase();
    if (termo.length < 1) return [];
    return listaResponsaveis
      .filter((u) => buildNomeSobrenome(u).toLowerCase().includes(termo))
      .slice(0, 6);
  }, [listaResponsaveis, novoParticipante.nome]);

  const selectParticipanteAdd = (u) => {
    const nome = buildNomeSobrenome(u);
    setNovoParticipante({
      nome: nome,
      email: u.email || "",
    });
    setShowSugestoesPart(false);
  };

  // ✅ NOVO: detectar cancelada (pra travar tudo, igual Realizada)
  const isCancelada = String(formData.status || "").toLowerCase().includes("cancel");
  const agendaMode = formData.agenda_mode || "unica";
  const agendaDates = Array.isArray(formData.datas_selecionadas)
    ? formData.datas_selecionadas
    : formData.data
    ? [formData.data]
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
      {/* Modal Auth Material */}
      {showAuthMaterial && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-white border border-slate-200 shadow-2xl rounded-xl p-6 text-center relative">
            <button
              onClick={() => setShowAuthMaterial(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 text-red-600">
              <ShieldAlert size={20} />
            </div>
            <h4 className="text-base font-bold text-slate-800 mb-1">
              Autorização Necessária
            </h4>
            <div className="space-y-2 text-left my-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">
                  Login
                </label>
                <input
                  type="text"
                  autoFocus
                  className="w-full border p-2 rounded text-sm"
                  value={authLoginMat}
                  onChange={(e) => setAuthLoginMat(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">
                  Senha
                </label>
                <input
                  type="password"
                  className="w-full border p-2 rounded text-sm"
                  value={authSenhaMat}
                  onChange={(e) => setAuthSenhaMat(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAuthMaterial(false)}
                className="flex-1 py-2 border rounded text-xs font-bold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteMaterial}
                disabled={validatingAuthMat}
                className="flex-1 py-2 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700"
              >
                {validatingAuthMat ? "..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ESQUERDA - CONFIGURAÇÕES */}
      <div className="lg:col-span-4 space-y-8 flex flex-col">
        <section className="space-y-4 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">
              Configurações
            </h3>

            {isRealizada && (
              <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded border border-green-200">
                🔒 Realizada
              </span>
            )}

            {!isRealizada && isCancelada && (
              <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded border border-red-200">
                ✖ Cancelada
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Título
            </label>
            <input
              required
              disabled={isRealizada || isCancelada}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
              value={formData.titulo}
              onChange={(e) => handleChange("titulo", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hora (início)
              </label>
              <PrettyTimePicker
                value={formData.hora_inicio}
                onChange={(v) => handleChange("hora_inicio", v)}
              />
            </div>
          </div>

          {editingReuniao && onAplicarHorarioSerie && (
            <button
              type="button"
              onClick={onAplicarHorarioSerie}
              disabled={isRealizada || isCancelada}
              className="w-full text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-2 flex items-center justify-center gap-2 transition disabled:opacity-50"
              title="Aplica este horário a todas as próximas reuniões deste tipo"
            >
              ⏱ Aplicar horário às próximas reuniões da série
            </button>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hora (término)
              </label>
              <PrettyTimePicker
                value={formData.hora_fim}
                onChange={(v) => handleChange("hora_fim", v)}
              />
            </div>
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Organizador
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={16}
                />
                <input
                  disabled={isRealizada || isCancelada}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                  value={formData.responsavel}
                  onChange={(e) => {
                    handleChange("responsavel", e.target.value);
                    setShowSugestoesResp(true);
                  }}
                  onFocus={() => setShowSugestoesResp(true)}
                  onBlur={() => setTimeout(() => setShowSugestoesResp(false), 200)}
                  placeholder="Buscar responsável..."
                />
              </div>
              {!!selectedTipo?.responsavel_id && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Responsável padrão do tipo:{" "}
                  <b>{responsavelPadraoNome || "—"}</b>
                </p>
              )}
              {showSugestoesResp &&
                !(isRealizada || isCancelada) &&
                filteredResponsaveis.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-100 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {filteredResponsaveis.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectResponsavel(u);
                        }}
                        className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 text-slate-700 border-b border-slate-50 last:border-0"
                      >
                        {buildNomeSobrenome(u)}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {/* PARTICIPANTES DO TIPO */}
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                <Users size={14} /> Padrão do Tipo
              </p>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">
                {participantesTipo.length}
              </span>
            </div>
            {loadingParticipantesTipo ? (
              <div className="text-slate-400 text-xs flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Carregando...
              </div>
            ) : participantesTipo.length === 0 ? (
              <div className="text-slate-400 text-xs italic">
                Nenhum participante padrão.
              </div>
            ) : (
              <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                {participantesTipo.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 opacity-80"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {String(p.nome || "?").charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {p.nome || "-"}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {p.email || ""}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PARTICIPANTES MANUAIS */}
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                <UserPlus size={14} /> Adicionais / Manuais
              </p>
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">
                {participantesManuais.length}
              </span>
            </div>

            {!(isRealizada || isCancelada) && (
              <div className="flex gap-2 mb-3 items-center">
                <div className="relative flex-1">
                  <input
                    placeholder="Nome do participante"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
                    value={novoParticipante.nome}
                    onChange={(e) => {
                      setNovoParticipante((prev) => ({
                        ...prev,
                        nome: e.target.value,
                      }));
                      setShowSugestoesPart(true);
                    }}
                    onFocus={() => setShowSugestoesPart(true)}
                    onBlur={() => setTimeout(() => setShowSugestoesPart(false), 200)}
                  />
                  {showSugestoesPart && filteredParticipantesAdd.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-slate-100 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {filteredParticipantesAdd.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectParticipanteAdd(u);
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 border-b border-slate-50 last:border-0"
                        >
                          <div className="font-bold">{buildNomeSobrenome(u)}</div>
                          <div className="text-[10px] text-slate-400">{u.email}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <input
                  placeholder="Email (opcional)"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
                  value={novoParticipante.email}
                  onChange={(e) =>
                    setNovoParticipante((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={handleAddParticipante}
                  disabled={addingPart}
                  className="bg-blue-600 text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                  title="Adicionar"
                >
                  {addingPart ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                </button>
              </div>
            )}

            {loadingManuais ? (
              <div className="text-slate-400 text-xs flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Carregando...
              </div>
            ) : participantesManuais.length === 0 ? (
              <div className="text-slate-400 text-xs italic">
                Nenhum participante adicional.
              </div>
            ) : (
              <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                {participantesManuais.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {String(p.nome || "?").charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {p.nome || "-"}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {p.email || ""}
                        </div>
                      </div>
                    </div>
                    {!(isRealizada || isCancelada) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipante(p.id)}
                        className="text-slate-300 hover:text-red-500 p-1 rounded-md transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tipo
            </label>
            <select
              disabled={isRealizada || isCancelada}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none font-semibold disabled:opacity-60"
              value={formData.tipo_reuniao_id || ""}
              onChange={(e) => handleChange("tipo_reuniao_id", e.target.value)}
            >
              <option value="">Selecione...</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sala (opcional)
            </label>
            <select
              disabled={isRealizada || isCancelada}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none font-semibold disabled:opacity-60"
              value={formData.sala_id || ""}
              onChange={(e) => handleChange("sala_id", e.target.value)}
            >
              <option value="">Sem sala</option>
              {(salas || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}{s.capacidade ? ` (${s.capacidade}p)` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-xs font-semibold text-slate-700">Cor</span>
            <input
              type="color"
              disabled={isRealizada || isCancelada}
              className="w-10 h-8 rounded cursor-pointer border-none bg-transparent disabled:opacity-60"
              value={formData.cor}
              onChange={(e) => handleChange("cor", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Status
            </label>
            <select
              disabled={isRealizada || isCancelada}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none font-semibold disabled:opacity-60"
              value={formData.status}
              onChange={(e) => handleChange("status", e.target.value)}
            >
              <option value="Agendada">Agendada</option>
              <option value="Realizada">Realizada</option>
              <option value="Nao Realizada">Não realizada</option>
              <option value="Cancelada">Cancelada</option> {/* ✅ NOVO */}
            </select>
          </div>
        </section>

        {editingReuniao && (
          <div className="pt-4 border-t border-slate-100 mt-auto space-y-2">
            {/* ✅ NOVO: Cancelar Reunião (mantém histórico) */}
            <button
              type="button"
              onClick={onCancelRequest}
              disabled={isRealizada || isCancelada}
              className="text-red-700 font-bold text-xs flex items-center gap-2 hover:bg-red-50 px-3 py-2 rounded-lg w-full justify-center transition-colors border border-red-100 disabled:opacity-60"
            >
              ✖ Cancelar Reunião (Manter no histórico)
            </button>

            <button
              type="button"
              onClick={onDeleteRequest}
              className="text-red-500 font-bold text-xs flex items-center gap-2 hover:bg-red-50 px-3 py-2 rounded-lg w-full justify-center transition-colors"
            >
              <Trash2 size={16} /> Excluir Reunião (Área Restrita)
            </button>
          </div>
        )}
      </div>

      {/* MEIO - ATA */}
      <div className="lg:col-span-4 flex flex-col space-y-4">
        <h3 className="text-[11px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
          <AlignLeft size={16} /> ATA da Reunião
        </h3>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-slate-400" />
              <p className="text-xs font-bold text-slate-700">ATA guia</p>
            </div>
            <button
              type="button"
              onClick={usarAtaDoTipo}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 hover:bg-white disabled:opacity-50"
              disabled={!selectedTipo?.ata_principal || isRealizada || isCancelada}
            >
              Usar ATA principal
            </button>
          </div>
          <div className="mt-3 text-xs text-slate-600 whitespace-pre-line max-h-28 overflow-y-auto">
            {selectedTipo?.ata_principal || "Selecione um tipo."}
          </div>
        </div>
        <textarea
          disabled={isRealizada || isCancelada}
          className="flex-1 w-full min-h-[250px] bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 shadow-inner resize-none font-mono disabled:opacity-60"
          placeholder="Descreva a ATA..."
          value={formData.ata}
          onChange={(e) => handleChange("ata", e.target.value)}
        />
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
              <Paperclip size={14} /> Anexos
            </div>
            <label
              className={`cursor-pointer text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 flex items-center gap-2 transition-all ${
                uploadingMaterial || isRealizada || isCancelada
                  ? "opacity-50 pointer-events-none"
                  : ""
              }`}
            >
              {uploadingMaterial ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}{" "}
              {uploadingMaterial ? "Enviando..." : "Anexar"}
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleUploadMaterial}
                disabled={uploadingMaterial || isRealizada || isCancelada}
              />
            </label>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 min-h-[80px]">
            {formData.materiais && formData.materiais.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {formData.materiais.map((item, idx) => {
                  const isImage = item.type?.startsWith("image");
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-white border border-slate-100 p-2 rounded-lg shadow-sm"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isImage
                              ? "bg-purple-100 text-purple-600"
                              : "bg-blue-100 text-blue-600"
                          }`}
                        >
                          {isImage ? <ImageIcon size={16} /> : <FileText size={16} />}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-xs font-bold text-slate-700 truncate"
                            title={item.name}
                          >
                            {item.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md"
                        >
                          <Download size={16} />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRequestDeleteMaterial(idx)}
                          className={`p-1.5 text-slate-400 hover:text-red-600 rounded-md ${
                            isRealizada || isCancelada ? "opacity-50 pointer-events-none" : ""
                          }`}
                          disabled={isRealizada || isCancelada}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-slate-400 text-xs italic">
                Nenhum anexo.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DIREITA - AGENDA */}
      <div className="lg:col-span-4 flex flex-col space-y-4">
        <h3 className="text-[11px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
          <Users size={16} /> Agenda
        </h3>
        <AgendaDatePlanner
          label="Data e recorrência"
          helperText="Escolha uma data mais elegante, ou transforme a reunião em uma agenda múltipla."
          mode={agendaMode}
          onModeChange={(value) => handleChange("agenda_mode", value)}
          singleDate={formData.data || ""}
          onSingleDateChange={(value) => handleChange("data", value)}
          selectedDates={agendaDates}
          onSelectedDatesChange={(values) => handleChange("datas_selecionadas", values)}
          recurrenceRule={formData.recurrence_rule || "semanal"}
          onRecurrenceRuleChange={(value) => handleChange("recurrence_rule", value)}
          disabled={isRealizada || isCancelada}
        />
      </div>
    </div>
  );
}
