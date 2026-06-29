// src/components/tatico/ModalDetalhesAcao.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  X,
  Trash2,
  UploadCloud,
  RotateCw,
  FileText,
  File as FileIcon,
  User,
  Calendar,
  ShieldAlert,
  Clipboard,
  // ✅ ADD (para o botãozinho)
  Maximize2,
  Minimize2,
} from "lucide-react";
import { supabase, supabaseInove } from "../../supabaseClient";

/* =========================
   Helpers
========================= */
function buildNomeSobrenome(u) {
  const nome = String(u?.nome || "").trim();
  const sobrenome = String(u?.sobrenome || "").trim();
  const nomeCompleto = String(u?.nome_completo || "").trim();

  if (nome && sobrenome) return `${nome} ${sobrenome}`;
  if (nomeCompleto) return nomeCompleto;
  if (nome) return nome;
  return "-";
}

function sanitizeFileName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9.]/g, "");
}

function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== "string") return false;
  const regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

function fileKindFromFile(file) {
  const t = String(file?.type || "").toLowerCase();
  const n = String(file?.name || "").toLowerCase();

  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".doc") || n.endsWith(".docx")) return "doc";
  if (n.endsWith(".xls") || n.endsWith(".xlsx")) return "xls";
  if (n.endsWith(".ppt") || n.endsWith(".pptx")) return "ppt";
  return "file";
}

function fileKindFromUrl(url) {
  const u = String(url || "").toLowerCase().split("?")[0];
  if (u.match(/\.(png|jpg|jpeg|webp|gif)$/)) return "image";
  if (u.match(/\.(mp4|mov|webm|mkv)$/)) return "video";
  if (u.endsWith(".pdf")) return "pdf";
  if (u.match(/\.(doc|docx)$/)) return "doc";
  if (u.match(/\.(xls|xlsx)$/)) return "xls";
  if (u.match(/\.(ppt|pptx)$/)) return "ppt";
  return "file";
}

/* =========================
   Miniaturas
========================= */
function IconForKind({ kind }) {
  if (kind === "pdf") return <FileText size={16} className="text-red-600" />;
  return <FileIcon size={16} className="text-slate-500" />;
}

function MiniaturaUrl({ url }) {
  const kind = fileKindFromUrl(url);

  if (kind === "image") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-white hover:shadow"
        title="Abrir evidência"
      >
        <img src={url} alt="evidencia" className="w-full h-full object-cover" />
      </a>
    );
  }

  if (kind === "video") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center w-20 h-20 rounded-lg border border-slate-200 bg-white hover:shadow"
        title="Abrir vídeo"
      >
        <span className="text-[10px] font-bold text-slate-600">VÍDEO</span>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-center gap-2 w-28 h-12 rounded-lg border border-slate-200 bg-white hover:shadow px-2"
      title="Abrir arquivo"
    >
      <IconForKind kind={kind} />
      <span className="text-[10px] font-semibold text-slate-600 truncate">
        ARQUIVO
      </span>
    </a>
  );
}

function MiniaturaArquivo({ preview }) {
  const { name, kind, url } = preview;

  if (kind === "image" && url) {
    return (
      <div className="w-20">
        <div className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-white">
          <img src={url} alt={name} className="w-full h-full object-cover" />
        </div>
        <div className="text-[10px] text-slate-500 mt-1 truncate">{name}</div>
      </div>
    );
  }

  if (kind === "video" && url) {
    return (
      <div className="w-20">
        <div className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-white flex items-center justify-center">
          <span className="text-[10px] font-bold text-slate-600">VÍDEO</span>
        </div>
        <div className="text-[10px] text-slate-500 mt-1 truncate">{name}</div>
      </div>
    );
  }

  return (
    <div className="w-28">
      <div className="w-28 h-12 rounded-lg border border-slate-200 bg-white flex items-center gap-2 px-2">
        <IconForKind kind={kind} />
        <div className="text-[10px] text-slate-600 font-semibold truncate">
          {name}
        </div>
      </div>
    </div>
  );
}

/* =========================
   Component Principal
========================= */
const ModalDetalhesAcao = ({
  aberto,
  acao,
  status,
  onClose,
  onConcluir,
  onAfterSave,
  onAfterDelete,
}) => {
  if (!aberto) return null;

  // ---------------------------------------------------------------------------
  // ESTADOS LOCAIS
  // ---------------------------------------------------------------------------
  const [statusLocal, setStatusLocal] = useState(status || "Aberta");

  const [descricaoAcao, setDescricaoAcao] = useState("");
  const [obsAcao, setObsAcao] = useState("");
  const [resultado, setResultado] = useState("");
  const [fotosAcao, setFotosAcao] = useState([]);
  const [fotosConclusao, setFotosConclusao] = useState([]);

  const [novosArquivosAcao, setNovosArquivosAcao] = useState([]);
  const [novosArquivosConclusao, setNovosArquivosConclusao] = useState([]);

  const [responsavelTexto, setResponsavelTexto] = useState("");
  const [responsavelId, setResponsavelId] = useState(null);
  const [listaResponsaveis, setListaResponsaveis] = useState([]);
  const [loadingResponsaveis, setLoadingResponsaveis] = useState(false);
  const [openSugestoes, setOpenSugestoes] = useState(false);

  const [vencimento, setVencimento] = useState("");

  const [saving, setSaving] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);

  // ✅ NOVO: controle do "expandir observação"
  const [obsExpandida, setObsExpandida] = useState(false);

  // Exclusão (Login/Senha)
  const [showDeleteAuth, setShowDeleteAuth] = useState(false);
  const [delLogin, setDelLogin] = useState("");
  const [delSenha, setDelSenha] = useState("");
  const [deleting, setDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // COLAR PRINT
  // ---------------------------------------------------------------------------
  const handlePasteInput = (e, destino) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        const file = new File([blob], `print_${Date.now()}.png`, {
          type: blob.type,
        });
        files.push(file);
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      if (destino === "conclusao") {
        setNovosArquivosConclusao((prev) => [...prev, ...files]);
      } else {
        setNovosArquivosAcao((prev) => [...prev, ...files]);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // INIT / LOAD
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!acao) return;

    setStatusLocal(status || acao.status || "Aberta");
    setDescricaoAcao(acao.descricao || "");
    setObsAcao(acao.observacao || "");
    setResultado(acao.resultado || "");

    // ✅ ao abrir/trocar ação, volta para o estado "compacto"
    setObsExpandida(false);

    setShowDeleteAuth(false);
    setDelLogin("");
    setDelSenha("");
    setDeleting(false);

    const baseAcao = Array.isArray(acao.fotos_acao)
      ? acao.fotos_acao
      : Array.isArray(acao.fotos)
      ? acao.fotos
      : [];
    const baseConclusao = Array.isArray(acao.fotos_conclusao)
      ? acao.fotos_conclusao
      : [];

    setFotosAcao(baseAcao);
    setFotosConclusao(baseConclusao);
    setNovosArquivosAcao([]);
    setNovosArquivosConclusao([]);

    const respTexto =
      acao.responsavel_nome || acao.responsavel || acao.responsavelName || "";
    setResponsavelTexto(String(respTexto || "").trim());

    const initialRespId = acao.responsavel_id;
    setResponsavelId(isValidUUID(initialRespId) ? initialRespId : null);

    if (acao.data_vencimento) {
      const d = new Date(acao.data_vencimento);
      if (!Number.isNaN(d.getTime())) setVencimento(d.toISOString().split("T")[0]);
      else setVencimento("");
    } else {
      setVencimento("");
    }

    const carregarResponsaveis = async () => {
      try {
        setLoadingResponsaveis(true);

        const { data, error } = await supabaseInove
          .from("usuarios_aprovadores")
          .select("id, nome, sobrenome, nome_completo, ativo, nivel")
          .eq("ativo", true)
          .order("nome", { ascending: true });

        if (error) {
          console.error("Erro ao buscar responsáveis (INOVE):", error);
          setListaResponsaveis([]);
          return;
        }

        setListaResponsaveis(data || []);

        if (!isValidUUID(acao.responsavel_id) && respTexto && (data || []).length) {
          const respNorm = String(respTexto).trim().toLowerCase();
          const found = (data || []).find((u) => {
            const label = buildNomeSobrenome(u).toLowerCase();
            const nc = String(u?.nome_completo || "").trim().toLowerCase();
            return label === respNorm || (nc && nc === respNorm);
          });

          if (found?.id) {
            setResponsavelId(found.id);
            setResponsavelTexto(buildNomeSobrenome(found));
          }
        }
      } finally {
        setLoadingResponsaveis(false);
      }
    };

    carregarResponsaveis();
  }, [acao?.id, status]);

  // ---------------------------------------------------------------------------
  // CRIADO POR
  // ---------------------------------------------------------------------------
  const nomeCriador = useMemo(() => {
    if (!acao) return null;
    if (acao.criado_por_nome) return acao.criado_por_nome;
    if (acao.criado_por && listaResponsaveis.length > 0) {
      const found = listaResponsaveis.find((u) => u.id === acao.criado_por);
      if (found) return buildNomeSobrenome(found);
    }
    return null;
  }, [acao, listaResponsaveis]);

  // ---------------------------------------------------------------------------
  // SUGESTÕES RESPONSÁVEL
  // ---------------------------------------------------------------------------
  const sugestoes = useMemo(() => {
    const q = String(responsavelTexto || "").trim().toLowerCase();

    const listaFormatada = (listaResponsaveis || []).map((u) => ({
      u,
      label: buildNomeSobrenome(u),
    }));

    if (!q) return listaFormatada.slice(0, 12);

    return listaFormatada
      .filter((x) => x.label.toLowerCase().includes(q))
      .slice(0, 12);
  }, [listaResponsaveis, responsavelTexto]);

  const selecionarResponsavel = (u) => {
    setResponsavelId(u?.id || null);
    setResponsavelTexto(buildNomeSobrenome(u));
    setOpenSugestoes(false);
  };

  useEffect(() => {
    const txt = String(responsavelTexto || "").trim().toLowerCase();
    if (!txt) {
      setResponsavelId(null);
      return;
    }
    const exact = (listaResponsaveis || []).find((u) => {
      const label = buildNomeSobrenome(u).toLowerCase();
      const nc = String(u?.nome_completo || "").trim().toLowerCase();
      return label === txt || (nc && nc === txt);
    });

    if (exact?.id) setResponsavelId(exact.id);
    else if (responsavelId) {
      const current = (listaResponsaveis || []).find((u) => u.id === responsavelId);
      const currentName = current ? buildNomeSobrenome(current).toLowerCase() : "";
      if (currentName !== txt) setResponsavelId(null);
    }
  }, [responsavelTexto, listaResponsaveis, responsavelId]);

  // ---------------------------------------------------------------------------
  // UPLOAD
  // ---------------------------------------------------------------------------
  const uploadArquivos = async (files) => {
    const urls = [];
    for (const file of files) {
      const fileName = `acao-${acao.id}-${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error } = await supabase.storage.from("evidencias").upload(fileName, file);
      if (error) {
        console.error("Erro upload evidência:", error);
        continue;
      }
      const { data: urlData } = supabase.storage.from("evidencias").getPublicUrl(fileName);
      if (urlData?.publicUrl) urls.push(urlData.publicUrl);
    }
    return urls;
  };

  // ---------------------------------------------------------------------------
  // SALVAR
  // ---------------------------------------------------------------------------
  const handleSalvar = async (overrideStatus = null) => {
    if (!acao) return;
    setSaving(true);

    const statusDestino = overrideStatus || statusLocal;

    try {
      const novasUrlsAcao =
        novosArquivosAcao.length > 0 ? await uploadArquivos(novosArquivosAcao) : [];
      const novasUrlsConclusao =
        novosArquivosConclusao.length > 0
          ? await uploadArquivos(novosArquivosConclusao)
          : [];

      const userResponsavel = (listaResponsaveis || []).find(
        (u) => String(u.id) === String(responsavelId)
      );
      const nomeResp = responsavelId
        ? buildNomeSobrenome(userResponsavel)
        : String(responsavelTexto || "").trim();
      const safeResponsavelId = isValidUUID(responsavelId) ? responsavelId : null;

      const payload = {
        descricao: descricaoAcao,
        observacao: obsAcao,
        resultado,
        fotos_acao: [...fotosAcao, ...novasUrlsAcao],
        fotos_conclusao: [...fotosConclusao, ...novasUrlsConclusao],
        responsavel_id: safeResponsavelId,
        responsavel: nomeResp || null,
        responsavel_nome: nomeResp || null,
        data_vencimento: vencimento || null,
      };

      if (statusDestino === "Concluída") {
        payload.status = "Concluída";
        if (!acao.data_fechamento) {
          payload.data_fechamento = new Date().toISOString();

          let nomeFinalizador = "Usuário do Sistema";
          const rawUser = localStorage.getItem("usuario_externo");
          if (rawUser) {
            try {
              const u = JSON.parse(rawUser);
              nomeFinalizador = u.nome || u.login || u.email || "Usuário sem nome";
            } catch (e) {
              console.error("Erro ao ler dados do usuário", e);
            }
          }
          payload.fechado_por_nome = nomeFinalizador;
        }
      }

      if (!acao.fotos_acao && !acao.fotos_conclusao) {
        payload.fotos = payload.fotos_acao;
      }

      const { error } = await supabase.from("acoes").update(payload).eq("id", acao.id);
      if (error) throw error;

      setFotosAcao(payload.fotos_acao);
      setFotosConclusao(payload.fotos_conclusao);
      setNovosArquivosAcao([]);
      setNovosArquivosConclusao([]);

      if (typeof onAfterSave === "function") onAfterSave(acao.id);
    } catch (err) {
      alert("Erro ao salvar alterações da ação: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // EXCLUIR
  // ---------------------------------------------------------------------------
  const handleExcluirClick = () => setShowDeleteAuth(true);

  const confirmarExclusao = async () => {
    if (!delLogin || !delSenha) return alert("Informe Login e Senha.");
    setDeleting(true);

    try {
      const { data: _u, error: errAuth } = await supabaseInove.rpc("verify_legacy_login", {
        p_identifier: delLogin,
        p_senha: delSenha,
      });
      const usuario = _u && _u.ativo !== false ? _u : null;

      if (errAuth) throw errAuth;

      if (!usuario) {
        alert("Login ou Senha inválidos (ou usuário inativo).");
        return;
      }

      if (usuario.nivel !== "Gestor" && usuario.nivel !== "Administrador") {
        alert("Permissão negada! Apenas Gestores e Administradores podem excluir ações.");
        return;
      }

      const nomeExcluidor = buildNomeSobrenome(usuario);

      const { error: errUpdate } = await supabase
        .from("acoes")
        .update({
          status: "Excluída",
          fechado_por_nome: nomeExcluidor,
          data_fechamento: new Date().toISOString(),
        })
        .eq("id", acao.id);

      if (errUpdate) throw errUpdate;

      alert("Ação excluída com sucesso por: " + nomeExcluidor);
      if (typeof onAfterDelete === "function") onAfterDelete(acao.id);
      onClose?.();
    } catch (error) {
      console.error("Erro exclusão:", error);
      alert("Erro ao excluir: " + (error?.message || error));
    } finally {
      setDeleting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // REABRIR
  // ---------------------------------------------------------------------------
  const handleReabrir = async () => {
    if (!acao) return;
    if (!window.confirm("Reabrir a ação permitirá novas alterações. Deseja continuar?"))
      return;

    setReabrindo(true);
    try {
      const { error } = await supabase
        .from("acoes")
        .update({
          status: "Aberta",
          data_conclusao: null,
          data_fechamento: null,
          fechado_por_nome: null,
          fechado_por_aprovador_id: null,
        })
        .eq("id", acao.id);

      if (error) throw error;

      setStatusLocal("Aberta");
      if (typeof onAfterSave === "function") onAfterSave(acao.id);
    } catch (err) {
      alert("Erro ao reabrir ação: " + (err?.message || err));
    } finally {
      setReabrindo(false);
    }
  };

  const podeConcluirLocal =
    statusLocal !== "Concluída" &&
    String(resultado || "").trim().length > 0 &&
    fotosConclusao.length + novosArquivosConclusao.length > 0;

  const handleFinalizarClick = async () => {
    if (!podeConcluirLocal) {
      alert("Para finalizar, registre o que foi realizado e anexe pelo menos uma evidência.");
      return;
    }
    await handleSalvar("Concluída");
    if (typeof onConcluir === "function") await onConcluir();
    setStatusLocal("Concluída");
  };

  // ---------------------------------------------------------------------------
  // UI HELPERS
  // ---------------------------------------------------------------------------
  const dataCriacao =
    acao?.data_criacao || acao?.created_at
      ? new Date(acao.data_criacao || acao.created_at).toLocaleString()
      : "-";

  const dataFechamento =
    acao?.data_fechamento || acao?.data_conclusao
      ? new Date(acao.data_fechamento || acao.data_conclusao).toLocaleString()
      : null;

  const inputsDesabilitados = statusLocal === "Concluída";

  const previewsAcao = useMemo(() => {
    return (novosArquivosAcao || []).map((f, idx) => {
      const kind = fileKindFromFile(f);
      const needsUrl = kind === "image" || kind === "video";
      const url = needsUrl ? URL.createObjectURL(f) : null;
      return { id: `a-${idx}-${f.name}`, file: f, name: f.name, kind, url };
    });
  }, [novosArquivosAcao]);

  const previewsConclusao = useMemo(() => {
    return (novosArquivosConclusao || []).map((f, idx) => {
      const kind = fileKindFromFile(f);
      const needsUrl = kind === "image" || kind === "video";
      const url = needsUrl ? URL.createObjectURL(f) : null;
      return { id: `c-${idx}-${f.name}`, file: f, name: f.name, kind, url };
    });
  }, [novosArquivosConclusao]);

  useEffect(() => {
    return () => {
      (previewsAcao || []).forEach((p) => p?.url && URL.revokeObjectURL(p.url));
      (previewsConclusao || []).forEach((p) => p?.url && URL.revokeObjectURL(p.url));
    };
  }, [previewsAcao, previewsConclusao]);

  if (!acao) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">Abrindo ação…</div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
          <div className="text-xs text-slate-500 mt-3">Carregando detalhes…</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* OVERLAY EXCLUSÃO */}
        {showDeleteAuth && (
          <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur flex flex-col items-center justify-center p-8 animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white border border-red-100 shadow-2xl rounded-2xl p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                <ShieldAlert size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Área Restrita</h3>
              <p className="text-sm text-slate-500 mb-6">
                Exclusão permitida apenas para <b>Gestores</b> ou <b>Administradores</b>.
              </p>
              <div className="space-y-3 text-left">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase">Login</label>
                  <input
                    type="text"
                    autoFocus
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    value={delLogin}
                    onChange={(e) => setDelLogin(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase">Senha</label>
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

        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
          <div className="flex-1">
            <label className="text-xs font-semibold uppercase text-gray-400 block mb-1">
              Nome da ação
            </label>
            <input
              type="text"
              value={descricaoAcao}
              onChange={(e) => setDescricaoAcao(e.target.value)}
              disabled={inputsDesabilitados}
              placeholder="Digite o nome da ação..."
              className="w-full text-sm sm:text-base font-semibold text-gray-800 bg-blue-50/40 border border-slate-200 hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all rounded-lg px-3 py-2 disabled:opacity-80"
            />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-6 bg-gray-50">
          {/* INFO */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-gray-400 uppercase mb-1">
                  Status
                </span>
                <span
                  className={`text-sm font-semibold ${
                    statusLocal === "Concluída" ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  {statusLocal}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-gray-400 uppercase mb-1">
                  Criação
                </span>
                <span className="text-sm text-gray-700 flex items-center gap-1">
                  <Calendar size={14} /> {dataCriacao}
                </span>
                {nomeCriador && (
                  <span className="text-[10px] text-blue-600 font-medium mt-0.5 flex items-center gap-1">
                    <User size={10} /> Criado por: {nomeCriador}
                  </span>
                )}
              </div>

              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-gray-400 uppercase mb-1">
                  Vencimento
                </span>
                <input
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  disabled={inputsDesabilitados}
                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 w-full"
                />
              </div>

              <div className="flex flex-col relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-gray-400 uppercase">
                    Responsável
                  </span>
                </div>
                <input
                  value={responsavelTexto}
                  onChange={(e) => {
                    setResponsavelTexto(e.target.value);
                    setOpenSugestoes(true);
                  }}
                  onFocus={() => setOpenSugestoes(true)}
                  onBlur={() => setTimeout(() => setOpenSugestoes(false), 150)}
                  disabled={inputsDesabilitados || loadingResponsaveis}
                  placeholder="Nome do responsável..."
                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 w-full"
                />
                {openSugestoes && !inputsDesabilitados && (sugestoes || []).length > 0 && (
                  <div className="absolute top-[50px] left-0 w-full bg-white border border-gray-200 rounded shadow-lg z-10 max-h-40 overflow-y-auto">
                    {(sugestoes || []).map(({ u, label }) => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => selecionarResponsavel(u)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AÇÃO */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 ml-1">
              Descrição e Evidências Iniciais
            </h3>
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 shadow-sm">
              <div>
                {/* ✅ ajuste aqui: header com botãozinho expandir */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase">
                    Observações da Ação
                  </span>

                  <button
                    type="button"
                    onClick={() => setObsExpandida((v) => !v)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-1 rounded-md hover:bg-slate-100"
                    title={obsExpandida ? "Reduzir" : "Expandir"}
                  >
                    {obsExpandida ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    {obsExpandida ? "Reduzir" : "Expandir"}
                  </button>
                </div>

                <textarea
                  className={`mt-1 w-full border border-gray-300 rounded-lg text-sm p-3 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 ${
                    obsExpandida ? "min-h-[220px]" : ""
                  }`}
                  rows={obsExpandida ? 10 : 3}
                  value={obsAcao}
                  onChange={(e) => setObsAcao(e.target.value)}
                  disabled={inputsDesabilitados}
                  placeholder="Descreva detalhes..."
                />
              </div>

              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase block mb-2">
                  Anexos (Abertura)
                </span>

                {fotosAcao.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-3">
                    {fotosAcao.map((url, idx) => (
                      <MiniaturaUrl key={`${url}-${idx}`} url={url} />
                    ))}
                  </div>
                )}

                {!inputsDesabilitados && (
                  <div className="space-y-2">
                    <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed border-blue-200 rounded-lg cursor-pointer bg-blue-50/50 hover:bg-blue-50 transition-colors group">
                      <div className="flex flex-row items-center gap-2">
                        <UploadCloud className="w-5 h-5 text-blue-400 group-hover:text-blue-600" />
                        <p className="text-xs text-gray-500">
                          <span className="font-semibold text-blue-600">
                            Carregar arquivo do PC
                          </span>
                        </p>
                      </div>
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                        className="hidden"
                        onChange={(e) =>
                          setNovosArquivosAcao(Array.from(e.target.files || []))
                        }
                      />
                    </label>

                    <div className="relative">
                      <textarea
                        rows={1}
                        className="w-full border border-dashed border-slate-300 rounded-lg p-2 text-xs text-center focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none placeholder:text-slate-400"
                        placeholder="Clique aqui e pressione Ctrl+V para colar um print..."
                        onPaste={(e) => handlePasteInput(e, "abertura")}
                      />
                      <Clipboard
                        className="absolute right-3 top-2.5 text-slate-300 pointer-events-none"
                        size={14}
                      />
                    </div>

                    {previewsAcao.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">
                          Prontos para envio:
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {previewsAcao.map((p) => (
                            <MiniaturaArquivo key={p.id} preview={p} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CONCLUSÃO */}
          <div>
            <div className="flex items-center justify-between mb-2 ml-1">
              <h3 className="text-xs font-bold text-gray-500 uppercase">
                Conclusão da ação
              </h3>

              {(statusLocal === "Concluída" || statusLocal === "Excluída") &&
                (acao.fechado_por_nome || dataFechamento) && (
                  <div className="text-right">
                    {acao.fechado_por_nome && (
                      <span
                        className={`text-[10px] font-bold block ${
                          statusLocal === "Excluída" ? "text-red-600" : "text-blue-600"
                        }`}
                      >
                        {statusLocal === "Excluída" ? "Excluído por:" : "Fechado por:"}{" "}
                        {acao.fechado_por_nome}
                      </span>
                    )}
                    {dataFechamento && (
                      <span className="text-[10px] text-gray-400 block">
                        Em: {dataFechamento}
                      </span>
                    )}
                  </div>
                )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 shadow-sm relative overflow-hidden">
              {statusLocal === "Concluída" && (
                <div className="absolute top-0 right-0 p-2">
                  <CheckCircle className="text-green-100 w-24 h-24 -mt-8 -mr-8 opacity-50" />
                </div>
              )}

              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase">
                  O que foi realizado?
                </span>
                <textarea
                  className="mt-1 w-full border border-gray-300 rounded-lg text-sm p-3 focus:outline-none focus:ring-2 focus:ring-green-100 disabled:bg-gray-50"
                  rows={3}
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                  disabled={inputsDesabilitados}
                  placeholder="Descreva a solução..."
                />
              </div>

              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase block mb-2">
                  Anexos (Conclusão)
                </span>

                {fotosConclusao.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-3">
                    {fotosConclusao.map((url, idx) => (
                      <MiniaturaUrl key={`${url}-${idx}`} url={url} />
                    ))}
                  </div>
                )}

                {!inputsDesabilitados && (
                  <div className="space-y-2">
                    <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed border-green-200 rounded-lg cursor-pointer bg-green-50/50 hover:bg-green-50 transition-colors group">
                      <div className="flex flex-row items-center gap-2">
                        <UploadCloud className="w-5 h-5 text-green-400 group-hover:text-green-600" />
                        <p className="text-xs text-gray-500">
                          <span className="font-semibold text-green-600">
                            Carregar arquivo do PC
                          </span>
                        </p>
                      </div>
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                        className="hidden"
                        onChange={(e) =>
                          setNovosArquivosConclusao(Array.from(e.target.files || []))
                        }
                      />
                    </label>

                    <div className="relative">
                      <textarea
                        rows={1}
                        className="w-full border border-dashed border-green-300 rounded-lg p-2 text-xs text-center focus:ring-2 focus:ring-green-200 focus:border-green-400 resize-none placeholder:text-slate-400"
                        placeholder="Clique aqui e pressione Ctrl+V para colar um print..."
                        onPaste={(e) => handlePasteInput(e, "conclusao")}
                      />
                      <Clipboard
                        className="absolute right-3 top-2.5 text-slate-300 pointer-events-none"
                        size={14}
                      />
                    </div>

                    {previewsConclusao.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">
                          Prontos para envio:
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {previewsConclusao.map((p) => (
                            <MiniaturaArquivo key={p.id} preview={p} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col text-[11px] text-gray-500">
            {statusLocal !== "Concluída" && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                ! Obrigatório preencher conclusão e anexos para finalizar.
              </span>
            )}

            <button
              onClick={() => handleSalvar(null)}
              disabled={saving || inputsDesabilitados}
              className="mt-2 self-start px-4 py-2 rounded text-xs font-semibold border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar rascunho"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {statusLocal === "Concluída" && (
              <button
                onClick={handleReabrir}
                disabled={reabrindo}
                className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
              >
                <RotateCw size={16} /> {reabrindo ? "Reabrindo..." : "Reabrir"}
              </button>
            )}

            <button
              onClick={handleExcluirClick}
              disabled={saving || reabrindo}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
            >
              <Trash2 size={16} /> Excluir
            </button>

            {statusLocal !== "Concluída" && (
              <button
                onClick={handleFinalizarClick}
                disabled={!podeConcluirLocal || saving}
                className={`px-6 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${
                  podeConcluirLocal && !saving
                    ? "bg-green-600 text-white hover:bg-green-700 shadow-md transform hover:-translate-y-0.5"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                <CheckCircle size={18} /> Finalizar Ação
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalDetalhesAcao;
