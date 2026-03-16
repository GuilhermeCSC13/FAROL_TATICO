// src/pages/Copiloto.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/tatico/Layout";
import { supabase, supabaseInove } from "../supabaseClient";
import {
  Bot,
  Search,
  Calendar,
  Lock,
  FileText,
  ClipboardList,
  StickyNote,
  Plus,
  Save,
  X,
  RefreshCw,
  UploadCloud,
  File as FileIcon,
  Check,
  Loader2,
  Trash2,
  User,
  Clock,
  Image,
  MessageSquare,
  Paperclip,
  Download,
  Crown,
  UserCheck,
  CheckCircle2,
  XCircle,
  Mail,
} from "lucide-react";
import { useRecording } from "../context/RecordingContext";
import ModalDetalhesAcao from "../components/tatico/ModalDetalhesAcao";

/* =========================
   Helpers
========================= */

function nowIso() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 19);
}

function todayISODate() {
  return nowIso().slice(0, 10);
}

function toBRDate(dt) {
  try {
    if (!dt) return "-";
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  } catch {
    return "-";
  }
}

function toBRDateTime(dt) {
  try {
    if (!dt) return "-";
    return new Date(dt).toLocaleString("pt-BR", { timeZone: "UTC" });
  } catch {
    return "-";
  }
}

function norm(s) {
  return String(s || "").trim().toUpperCase();
}

function secondsToMMSS(s) {
  const mm = Math.floor((s || 0) / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor((s || 0) % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

function buildNomeSobrenome(u) {
  if (!u) return "";
  const nomeCompleto = String(u?.nome_completo || "").trim();
  const nome = String(u?.nome || "").trim();
  const sobrenome = String(u?.sobrenome || "").trim();

  if (nomeCompleto) return nomeCompleto;
  if (nome && sobrenome) return `${nome} ${sobrenome}`;
  if (nome) return nome;
  return u.email || "-";
}

function sanitizeFileName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9.]/g, "");
}

function fileKind(file) {
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

function extractTime(dateString) {
  if (!dateString) return "";
  const s = String(dateString);
  if (s.length <= 8 && s.includes(":")) return s.substring(0, 5);

  try {
    const d = new Date(dateString);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString("pt-BR", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } catch {
    // ignore
  }
  return "";
}

function meetingInicioFimLabel(r) {
  const data = toBRDate(r?.data_hora);
  const ini = extractTime(r?.horario_inicio) || extractTime(r?.data_hora);
  const fim = extractTime(r?.horario_fim);
  if (!r?.data_hora && !ini && !fim) return "-";
  const parts = [];
  if (data && data !== "-") parts.push(data);
  if (ini) parts.push(`Início ${ini}`);
  if (fim) parts.push(`Término ${fim}`);
  return parts.join(" • ") || "-";
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

/* =========================
   Page
========================= */
export default function Copiloto() {
  const { isRecording, isProcessing, timer, startRecording, stopRecording, current } =
    useRecording();

  const [dataFiltro, setDataFiltro] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [busca, setBusca] = useState("");

  const [reunioes, setReunioes] = useState([]);
  const [selecionada, setSelecionada] = useState(null);
  const [nomeTipoReuniao, setNomeTipoReuniao] = useState("");

  const [participantesLista, setParticipantesLista] = useState([]);
  const [organizadorDetalhes, setOrganizadorDetalhes] = useState(null);
  const [loadingParticipantes, setLoadingParticipantes] = useState(false);

  const [tab, setTab] = useState("presenca");

  const [ataPrincipal, setAtaPrincipal] = useState("");
  const [ataManual, setAtaManual] = useState("");
  const [editAtaManual, setEditAtaManual] = useState(false);

  const [loadingAcoes, setLoadingAcoes] = useState(false);
  const [acoesDaReuniao, setAcoesDaReuniao] = useState([]);
  const [acoesPendentesTipo, setAcoesPendentesTipo] = useState([]);
  const [acoesConcluidasDesdeUltima, setAcoesConcluidasDesdeUltima] = useState([]);
  const [acaoTab, setAcaoTab] = useState("reuniao");

  const [novaAcao, setNovaAcao] = useState({
    descricao: "",
    observacao: "",
    responsavelId: "",
    vencimento: "",
  });
  const [novasEvidenciasAcao, setNovasEvidenciasAcao] = useState([]);
  const [creatingAcao, setCreatingAcao] = useState(false);

  const [listaResponsaveis, setListaResponsaveis] = useState([]);
  const [loadingResponsaveis, setLoadingResponsaveis] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);

  const [responsavelQuery, setResponsavelQuery] = useState("");
  const [respOpen, setRespOpen] = useState(false);

  const [acaoSelecionada, setAcaoSelecionada] = useState(null);

  const [showUnlock, setShowUnlock] = useState(false);
  const [senhaAdm, setSenhaAdm] = useState("");

  const isMountedRef = useRef(false);
  const safeSet = (fn) => {
    if (isMountedRef.current) fn();
  };

  /* =========================
     Lifecycle & CTRL+V LISTENER
  ========================= */

  useEffect(() => {
    const handlePaste = (e) => {
      if (!selecionada?.id || tab !== "acoes" || acaoSelecionada) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const files = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          const file = new File([blob], `print_${Date.now()}.png`, { type: blob.type });
          files.push(file);
        }
      }

      if (files.length > 0) {
        setNovasEvidenciasAcao((prev) => [...(prev || []), ...files]);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [selecionada, tab, acaoSelecionada]);

  useEffect(() => {
    isMountedRef.current = true;

    fetchReunioes();

    (async () => {
      try {
        safeSet(() => setLoadingResponsaveis(true));

        const storedUser = localStorage.getItem("usuario_externo");
        if (storedUser) {
          safeSet(() => setCurrentUser(JSON.parse(storedUser)));
        }

        const { data, error } = await supabaseInove
          .from("usuarios_aprovadores")
          .select("id, nome, sobrenome, nome_completo, login, email, ativo, nivel, status_cadastro")
          .eq("ativo", true)
          .order("nome_completo", { ascending: true });

        if (error) {
          console.error("carregarResponsaveis (usuarios_aprovadores):", error);
        } else {
          safeSet(() => setListaResponsaveis(data || []));
        }
      } finally {
        safeSet(() => setLoadingResponsaveis(false));
      }
    })();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchReunioes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataFiltro]);

  useEffect(() => {
    if (!selecionada?.id) return;

    setTab("presenca");

    carregarAtas(selecionada);
    fetchAcoes(selecionada);
    fetchParticipantesEOrganizador(selecionada);

    setAcaoTab("reuniao");

    setNovaAcao({
      descricao: "",
      observacao: "",
      responsavelId: "",
      vencimento: "",
    });
    setResponsavelQuery("");
    setNovasEvidenciasAcao([]);
    setRespOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionada?.id]);

  /* =========================
     Fetch Reuniões (do dia)
  ========================= */
  const fetchReunioes = async () => {
    const { data, error } = await supabase
      .from("reunioes")
      .select("*")
      .gte("data_hora", `${dataFiltro}T00:00:00`)
      .lte("data_hora", `${dataFiltro}T23:59:59`)
      .order("data_hora", { ascending: true });

    if (error) {
      console.error("fetchReunioes:", error);
      return;
    }

    const rows = data || [];
    safeSet(() => setReunioes(rows));

    if (selecionada?.id) {
      const atualizada = rows.find((r) => r.id === selecionada.id) || null;
      if (atualizada) safeSet(() => setSelecionada(atualizada));
      else safeSet(() => setSelecionada(null));
    }

    if (isRecording && current?.reuniaoId) {
      const found = rows.find((r) => r.id === current.reuniaoId);
      if (found) safeSet(() => setSelecionada(found));
    }
  };

  /* =========================
     Fetch Participantes e Organizador
  ========================= */
  const fetchParticipantesEOrganizador = async (r) => {
    if (!r?.id) return;
    setLoadingParticipantes(true);
    setParticipantesLista([]);
    setOrganizadorDetalhes(null);

    try {
      let orgId = r.responsavel_id;
      let orgManual = r.responsavel;

      if (!orgId && r.tipo_reuniao_id) {
        const { data: tp } = await supabase
          .from("tipos_reuniao")
          .select("responsavel_id")
          .eq("id", r.tipo_reuniao_id)
          .maybeSingle();
        if (tp?.responsavel_id) orgId = tp.responsavel_id;
      }

      if (orgId) {
        const { data: org, error: errOrg } = await supabaseInove
          .from("usuarios_aprovadores")
          .select("id, nome, sobrenome, email")
          .eq("id", orgId)
          .maybeSingle();
        if (!errOrg && org) setOrganizadorDetalhes(org);
      } else if (orgManual) {
        setOrganizadorDetalhes({ nome: orgManual, sobrenome: "", email: "-" });
      }

      const { data: salvosReuniao } = await supabase
        .from("participantes_reuniao")
        .select("*")
        .eq("reuniao_id", r.id);

      let padraoTipo = [];
      if (r.tipo_reuniao_id) {
        const { data: defs } = await supabase
          .from("participantes_tipo_reuniao")
          .select("*")
          .eq("tipo_reuniao_id", r.tipo_reuniao_id);
        padraoTipo = defs || [];
      }

      const listaFinal = [];
      const salvosMap = new Map();

      (salvosReuniao || []).forEach((p) => {
        listaFinal.push(p);
        if (p.usuario_id) {
          salvosMap.set(String(p.usuario_id), true);
        }
      });

      padraoTipo.forEach((padrao) => {
        if (!salvosMap.has(String(padrao.usuario_id))) {
          listaFinal.push({
            id: `temp_${padrao.usuario_id}`,
            reuniao_id: r.id,
            usuario_id: padrao.usuario_id,
            nome: padrao.nome,
            email: padrao.email,
            presente: false,
            is_temp: true,
          });
        }
      });

      listaFinal.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
      setParticipantesLista(listaFinal);
    } finally {
      setLoadingParticipantes(false);
    }
  };

  const togglePresenca = async (participante) => {
    if (!selecionada?.id) return;

    const reuniaoFinalizada =
      String(selecionada?.status || "").trim().toUpperCase() === "REALIZADA";
    if (reuniaoFinalizada) return;

    const novoStatus = !participante.presente;

    setParticipantesLista((prev) =>
      prev.map((p) =>
        p.id === participante.id || (p.is_temp && p.usuario_id === participante.usuario_id)
          ? { ...p, presente: novoStatus }
          : p
      )
    );

    if (participante.is_temp) {
      const payload = {
        reuniao_id: selecionada.id,
        usuario_id: participante.usuario_id,
        nome: participante.nome,
        email: participante.email,
        presente: novoStatus,
        created_at: nowIso(),
      };

      const { data, error } = await supabase
        .from("participantes_reuniao")
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error("Erro insert participante", error);
        setParticipantesLista((prev) =>
          prev.map((p) =>
            p.usuario_id === participante.usuario_id ? { ...p, presente: !novoStatus } : p
          )
        );
      } else {
        setParticipantesLista((prev) =>
          prev.map((p) =>
            p.usuario_id === participante.usuario_id ? { ...data, is_temp: false } : p
          )
        );
      }
    } else {
      const { error } = await supabase
        .from("participantes_reuniao")
        .update({ presente: novoStatus })
        .eq("id", participante.id);

      if (error) {
        console.error("Erro update participante", error);
        setParticipantesLista((prev) =>
          prev.map((p) => (p.id === participante.id ? { ...p, presente: !novoStatus } : p))
        );
      }
    }
  };

  /* =========================
     Atas
  ========================= */
  const carregarAtas = async (r) => {
    safeSet(() => {
      setAtaManual(String(r?.ata_manual || "").trim());
      setEditAtaManual(false);
      setAtaPrincipal("");
      setNomeTipoReuniao("");
    });

    if (r?.tipo_reuniao_id) {
      const { data } = await supabase
        .from("tipos_reuniao")
        .select("ata_principal, nome")
        .eq("id", r.tipo_reuniao_id)
        .maybeSingle();

      if (data) {
        safeSet(() => setAtaPrincipal(String(data.ata_principal || "").trim()));
        safeSet(() => setNomeTipoReuniao(data.nome || ""));
      }
    } else if (r?.tipo_reuniao) {
      safeSet(() => setNomeTipoReuniao(r.tipo_reuniao));
    }
  };

  const salvarAtaManual = async () => {
    if (!selecionada?.id) return;

    const { error } = await supabase
      .from("reunioes")
      .update({ ata_manual: ataManual, updated_at: nowIso() })
      .eq("id", selecionada.id);

    if (error) {
      alert("Erro ao salvar Ata Manual: " + (error.message || error));
      return;
    }

    setEditAtaManual(false);
    fetchReunioes();
  };

  /* =========================
     Gravação
  ========================= */
  const onStart = async () => {
    if (!selecionada?.id) return alert("Selecione uma reunião.");
    if (isRecording) return;

    if (String(selecionada?.status || "").trim() === "Realizada") {
      return alert(
        "Essa reunião já está como REALIZADA. Para gravar novamente, use 'Reabrir (ADM)'."
      );
    }

    try {
      await startRecording({
        reuniaoId: selecionada.id,
        reuniaoTitulo: selecionada.titulo,
      });

      await fetchReunioes();
    } catch (e) {
      console.error("startRecording (Copiloto):", e);
      alert("Erro ao iniciar. Verifique permissões de tela e áudio.");
    }
  };

  const onStop = async () => {
    try {
      await stopRecording();

      if (selecionada?.id) {
        await supabase.from("reunioes").update({ status: "Realizada" }).eq("id", selecionada.id);
      }

      if (selecionada?.id) {
        const bucket = current?.storageBucket || "gravacoes";
        const prefix = current?.storagePrefix || `reunioes/${selecionada.id}`;

        const { error: qErr } = await supabase.from("reuniao_processing_queue").insert([
          {
            reuniao_id: selecionada.id,
            job_type: "BACKFILL_COMPILE_ATA",
            status: "PENDENTE",
            attempts: 0,
            next_run_at: nowIso(),
            storage_bucket: bucket,
            storage_prefix: prefix,
            result: {},
          },
        ]);

        if (qErr) {
          console.error("enqueue reuniao_processing_queue:", qErr);
          alert(
            "Gravação encerrada, mas falhou ao enfileirar processamento: " +
              (qErr.message || qErr)
          );
        }
      }

      await fetchReunioes();
      if (selecionada?.id) await fetchAcoes(selecionada);
    } catch (e) {
      console.error("stopRecording (Copiloto):", e);
      alert("Erro ao encerrar a gravação.");
    }
  };

  /* =========================
     Reabrir (senha ADM)
  ========================= */
  const validarSenhaAdm = async () => {
    if (!selecionada?.id) return;

    const senha = String(senhaAdm || "").trim();
    if (!senha) return alert("Informe a senha.");

    const { data, error } = await supabaseInove
      .from("usuarios_aprovadores")
      .select("id, nivel, ativo")
      .eq("senha", senha)
      .eq("nivel", "Administrador")
      .eq("ativo", true)
      .maybeSingle();

    if (error) {
      console.error("validarSenhaAdm:", error);
      return alert("Erro ao validar senha.");
    }

    if (!data?.id) return alert("Senha inválida.");

    const { error: e2 } = await supabase
      .from("reunioes")
      .update({ status: "Pendente" })
      .eq("id", selecionada.id);

    if (e2) {
      console.error("reabrir reuniao:", e2);
      return alert("Erro ao reabrir reunião.");
    }

    setShowUnlock(false);
    setSenhaAdm("");
    await fetchReunioes();
  };

  /* =========================
     Upload Evidências
  ========================= */
  const uploadEvidencias = async (acaoId, files) => {
    const urls = [];

    for (const file of files) {
      const fileName = `acao-${acaoId}-${Date.now()}-${sanitizeFileName(file.name)}`;

      const { error } = await supabase.storage
        .from("evidencias")
        .upload(fileName, file, { upsert: false });

      if (error) {
        console.error("Erro upload evidência:", error);
        continue;
      }

      const { data: urlData } = supabase.storage.from("evidencias").getPublicUrl(fileName);
      if (urlData?.publicUrl) urls.push(urlData.publicUrl);
    }

    return urls;
  };

  /* =========================
     AÇÕES
  ========================= */
  const fetchAcoes = async (r) => {
    if (!r?.id) return;

    safeSet(() => setLoadingAcoes(true));

    try {
      const { data: daReuniao, error: e1 } = await supabase
        .from("acoes")
        .select("*")
        .eq("reuniao_id", r.id)
        .order("created_at", { ascending: false });

      if (e1) throw e1;

      const tipoId = r.tipo_reuniao_id;

      let pendTipo = [];
      if (tipoId) {
        const { data: pend, error: e2 } = await supabase
          .from("acoes")
          .select("*")
          .eq("tipo_reuniao_id", tipoId)
          .in("status", ["Aberta", "Pendente", "PENDENTE"])
          .or(`reuniao_id.is.null,reuniao_id.neq.${r.id}`)
          .order("created_at", { ascending: false })
          .limit(500);

        if (e2) throw e2;
        pendTipo = pend || [];
      }

      let concluidasDesde = [];
      if (tipoId && r.data_hora) {
        const { data: ultima, error: e3 } = await supabase
          .from("reunioes")
          .select("id, data_hora")
          .eq("tipo_reuniao_id", tipoId)
          .lt("data_hora", r.data_hora)
          .order("data_hora", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (e3) throw e3;

        if (ultima?.data_hora) {
          const { data: concl, error: e4 } = await supabase
            .from("acoes")
            .select("*")
            .eq("tipo_reuniao_id", tipoId)
            .in("status", ["Concluída", "Concluida"])
            .not("data_conclusao", "is", null)
            .gt("data_conclusao", ultima.data_hora)
            .order("data_conclusao", { ascending: false })
            .limit(500);

          if (e4) throw e4;
          concluidasDesde = concl || [];
        } else {
          concluidasDesde = [];
        }
      }

      safeSet(() => {
        setAcoesDaReuniao(daReuniao || []);
        setAcoesPendentesTipo(pendTipo || []);
        setAcoesConcluidasDesdeUltima(concluidasDesde || []);
      });
    } catch (e) {
      console.error("fetchAcoes:", e);
      safeSet(() => {
        setAcoesDaReuniao([]);
        setAcoesPendentesTipo([]);
        setAcoesConcluidasDesdeUltima([]);
      });
    } finally {
      safeSet(() => setLoadingAcoes(false));
    }
  };

  const salvarAcao = async () => {
    if (!selecionada?.id) return;
    if (creatingAcao) return;

    const descricao = String(novaAcao.descricao || "").trim();
    const observacao = String(novaAcao.observacao || "").trim();
    const responsavelId = String(novaAcao.responsavelId || "").trim();
    const vencimento = String(novaAcao.vencimento || "").trim();

    if (!descricao) return alert("Informe o Nome da Ação (Descrição).");
    if (!responsavelId) return alert("Selecione o responsável.");
    if (!vencimento) return alert("Informe o vencimento.");

    setCreatingAcao(true);

    try {
      const respRow =
        (listaResponsaveis || []).find((u) => String(u.login || "") === responsavelId) ||
        (listaResponsaveis || []).find((u) => String(u.id) === responsavelId) ||
        null;

      const responsavelNome = buildNomeSobrenome(respRow);

      let criadorFinalId = null;
      let criadorFinalNome = "Sistema";

      const storedUser = localStorage.getItem("usuario_externo");
      if (storedUser) {
        try {
          const u = JSON.parse(storedUser);
          criadorFinalId = u.id;
          criadorFinalNome = buildNomeSobrenome(u) || u.login || u.email || "Usuário";
        } catch (e) {
          console.error("Erro ao ler criador do localStorage", e);
        }
      }

      const payloadCriacao = {
        descricao,
        observacao,
        status: "Aberta",
        reuniao_id: selecionada.id,
        tipo_reuniao_id: selecionada.tipo_reuniao_id || null,
        tipo_reuniao: nomeTipoReuniao || selecionada.tipo_reuniao || "Geral",

        responsavel_id: null,
        responsavel_aprovador_id: respRow?.id ?? null,
        responsavel_nome: responsavelNome,

        criado_por_aprovador_id: criadorFinalId,
        criado_por_nome: criadorFinalNome,

        data_vencimento: vencimento,
        data_abertura: todayISODate(),

        created_at: nowIso(),
        data_criacao: nowIso(),

        fotos_acao: [],
        fotos: [],
        evidencia_url: null,
      };

      const { data, error } = await supabase.from("acoes").insert([payloadCriacao]).select("*");

      if (error) {
        console.error("salvarAcao insert:", error);
        throw new Error("Erro ao criar ação: " + (error.message || error));
      }

      const inserted = data?.[0];
      const acaoId = inserted?.id;
      if (!acaoId) throw new Error("Erro: ação criada sem ID.");

      if ((novasEvidenciasAcao || []).length > 0) {
        const urls = await uploadEvidencias(acaoId, novasEvidenciasAcao);

        if (!urls.length) {
          alert("A ação foi criada, mas não foi possível enviar as evidências.");
        } else {
          const payloadUpdate = {
            fotos_acao: urls,
            fotos: urls,
            evidencia_url: urls[0] || null,
          };

          const { error: e2 } = await supabase.from("acoes").update(payloadUpdate).eq("id", acaoId);

          if (e2) {
            console.error("salvarAcao update evidencias:", e2);
            alert("Ação criada, mas houve erro ao vincular os arquivos: " + e2.message);
          }
        }
      }

      setNovaAcao({ descricao: "", observacao: "", responsavelId: "", vencimento: "" });
      setResponsavelQuery("");
      setNovasEvidenciasAcao([]);
      setRespOpen(false);

      setTab("acoes");
      setAcaoTab("reuniao");

      await fetchAcoes(selecionada);
      alert("Ação criada com sucesso!");
    } catch (err) {
      alert(err.message);
    } finally {
      setCreatingAcao(false);
    }
  };

  /* =========================
     Responsável autocomplete
  ========================= */
  const responsaveisFiltrados = useMemo(() => {
    const q = String(responsavelQuery || "").trim().toLowerCase();
    if (q.length < 2) return [];
    return (listaResponsaveis || [])
      .filter((u) => {
        const nome = buildNomeSobrenome(u).toLowerCase();
        const login = String(u?.login || "").toLowerCase();
        const email = String(u?.email || "").toLowerCase();
        return nome.includes(q) || login.includes(q) || (email && email.includes(q));
      })
      .slice(0, 10);
  }, [responsavelQuery, listaResponsaveis]);

  const selecionarResponsavel = (u) => {
    const nome = buildNomeSobrenome(u);
    const login = String(u?.login || "").trim();
    const fallback = String(u?.id != null ? u.id : "").trim();
    const idText = login || fallback;

    setNovaAcao((p) => ({ ...p, responsavelId: idText }));
    setResponsavelQuery(nome);
    setRespOpen(false);
  };

  const onAddEvidencias = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setNovasEvidenciasAcao((prev) => [...(prev || []), ...files]);
  };

  const removerEvidencia = (id) => {
    setNovasEvidenciasAcao((prev) => {
      const arr = prev || [];
      const idx = arr.findIndex((f, i) => `${i}-${f.name}-${f.size}` === id);
      if (idx < 0) return arr;
      return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
    });
  };

  const previews = useMemo(() => {
    return (novasEvidenciasAcao || []).map((f, idx) => {
      const kind = fileKind(f);
      const needsUrl = kind === "image" || kind === "video";
      const url = needsUrl ? URL.createObjectURL(f) : null;
      return {
        id: `${idx}-${f.name}-${f.size}`,
        file: f,
        name: f.name,
        kind,
        url,
      };
    });
  }, [novasEvidenciasAcao]);

  useEffect(() => {
    return () => {
      (previews || []).forEach((p) => {
        if (p?.url) URL.revokeObjectURL(p.url);
      });
    };
  }, [previews]);

  /* =========================
     UI computed
  ========================= */
  const reunioesFiltradas = useMemo(() => {
    const q = (busca || "").toLowerCase();
    return (reunioes || []).filter((r) => (r.titulo || "").toLowerCase().includes(q));
  }, [reunioes, busca]);

  const statusLabel = (r) => {
    const st = String(r?.status || "").trim();
    return st || "Pendente";
  };

  const statusBadgeClass = (lbl) => {
    const v = norm(lbl);
    if (v === "REALIZADA") return "bg-emerald-600/15 text-emerald-700 border border-emerald-200";
    if (v === "EM ANDAMENTO") return "bg-blue-600/15 text-blue-700 border border-blue-200";
    if (v === "AGENDADA") return "bg-slate-600/10 text-slate-700 border border-slate-200";
    if (v === "PENDENTE") return "bg-slate-600/10 text-slate-700 border border-slate-200";
    return "bg-slate-600/10 text-slate-700 border border-slate-200";
  };

  const listaAtiva =
    acaoTab === "reuniao"
      ? acoesDaReuniao
      : acaoTab === "backlog"
      ? acoesPendentesTipo
      : acoesConcluidasDesdeUltima;

  const materiaisReuniao = safeArray(selecionada?.materiais);

  const reuniaoFinalizada =
    String(selecionada?.status || "").trim().toUpperCase() === "REALIZADA";

  return (
    <Layout>
      <div className="h-screen bg-[#f6f8fc] text-slate-900 flex overflow-hidden">
        {/* COLUNA ESQUERDA */}
        <div className="w-[420px] min-w-[380px] max-w-[460px] flex flex-col p-5 border-r border-slate-200 bg-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Bot size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-extrabold">
                Assistente
              </div>
              <h1 className="text-lg font-black tracking-tight truncate">
                Copiloto de Reuniões
              </h1>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Calendar size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="date"
                autoComplete="off"
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:ring-2 ring-blue-500/30"
                value={dataFiltro}
                onChange={(e) => setDataFiltro(e.target.value)}
              />
            </div>

            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                autoComplete="off"
                placeholder="Buscar..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:ring-2 ring-blue-500/30"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 bg-white border border-slate-200 rounded-2xl overflow-y-auto">
            {reunioesFiltradas.map((r) => {
              const lbl = statusLabel(r);

              return (
                <button
                  key={r.id}
                  onClick={() => !isRecording && setSelecionada(r)}
                  className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    selecionada?.id === r.id
                      ? "bg-blue-50 border-l-4 border-l-blue-600"
                      : "border-l-4 border-l-transparent"
                  } ${isRecording ? "opacity-80 cursor-not-allowed" : ""}`}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-xs truncate">
                        {r.titulo || "Sem título"}
                      </div>

                      <div className="text-[11px] text-slate-500 mt-1">
                        {meetingInicioFimLabel(r)}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-1 rounded-lg font-extrabold uppercase whitespace-nowrap ${statusBadgeClass(
                        lbl
                      )}`}
                    >
                      {lbl}
                    </span>
                  </div>
                </button>
              );
            })}

            {reunioesFiltradas.length === 0 && (
              <div className="p-6 text-xs text-slate-500">
                Nenhuma reunião nesta data.
              </div>
            )}
          </div>

          <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-500 font-extrabold uppercase">
                Tempo de sessão
              </div>
              <div className="text-lg font-black font-mono leading-none">
                {secondsToMMSS(timer)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {isRecording && current?.reuniaoTitulo
                  ? `Gravando: ${current.reuniaoTitulo}`
                  : "Pronto para gravar"}
              </div>
            </div>

            {isProcessing ? (
              <div className="text-blue-700 font-extrabold text-xs animate-pulse">
                FINALIZANDO...
              </div>
            ) : isRecording ? (
              <button
                onClick={onStop}
                className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-slate-800 transition-all"
                type="button"
              >
                ENCERRAR
              </button>
            ) : (
              <button
                onClick={onStart}
                disabled={!selecionada || String(selecionada?.status || "").trim() === "Realizada"}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-blue-500 disabled:opacity-30 transition-all shadow-sm"
                title={
                  String(selecionada?.status || "").trim() === "Realizada"
                    ? "Reunião está REALIZADA. Use Reabrir (ADM) para gravar novamente."
                    : ""
                }
                type="button"
              >
                INICIAR GRAVAÇÃO
              </button>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Header direita */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xl font-black tracking-tight truncate">
                  {selecionada?.titulo || "Selecione uma reunião à esquerda"}
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  {selecionada?.id ? meetingInicioFimLabel(selecionada) : "-"}
                </div>

                {selecionada?.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`text-[10px] px-2 py-1 rounded-lg font-extrabold uppercase whitespace-nowrap ${statusBadgeClass(
                        statusLabel(selecionada)
                      )}`}
                    >
                      {statusLabel(selecionada)}
                    </span>

                    {isRecording && (
                      <span className="text-[10px] px-2 py-1 rounded-lg font-extrabold bg-blue-600/10 border border-blue-200 text-blue-800">
                        EM GRAVAÇÃO
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selecionada?.id && String(selecionada?.status || "").trim() === "Realizada" && (
                  <button
                    onClick={() => setShowUnlock(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 bg-red-600/10 text-red-700 font-black text-xs hover:bg-red-600/15"
                    type="button"
                    title="Reabrir reunião (exige senha do Administrador)"
                  >
                    <Lock size={16} />
                    Reabrir (ADM)
                  </button>
                )}

                {selecionada?.id && (
                  <button
                    onClick={() => {
                      fetchReunioes();
                      fetchAcoes(selecionada);
                      carregarAtas(selecionada);
                      fetchParticipantesEOrganizador(selecionada);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-black text-xs hover:bg-slate-50"
                    type="button"
                    title="Atualizar"
                  >
                    <RefreshCw size={16} />
                    Atualizar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tabs principais */}
          <div className="flex flex-wrap gap-2 mb-4">
            <TabButton
              active={tab === "presenca"}
              onClick={() => setTab("presenca")}
              icon={<UserCheck size={16} />}
            >
              Lista de Presença
            </TabButton>

            <TabButton
              active={tab === "acoes"}
              onClick={() => setTab("acoes")}
              icon={<ClipboardList size={16} />}
            >
              Ações
            </TabButton>

            <TabButton
              active={tab === "ata_principal"}
              onClick={() => setTab("ata_principal")}
              icon={<FileText size={16} />}
            >
              Pauta
            </TabButton>

            <TabButton
              active={tab === "ata_manual"}
              onClick={() => setTab("ata_manual")}
              icon={<StickyNote size={16} />}
            >
              Pauta Manual
            </TabButton>

            <TabButton
              active={tab === "materiais"}
              onClick={() => setTab("materiais")}
              icon={<Paperclip size={16} />}
            >
              Material da Reunião
            </TabButton>
          </div>

          {/* Conteúdo */}
          {!selecionada?.id ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-sm text-slate-600">
              Selecione uma reunião na coluna da esquerda para visualizar ações e atas.
            </div>
          ) : tab === "presenca" ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500 text-center italic">
              {selecionada?.id && (
                <div className="mb-4 flex flex-col xl:flex-row gap-4">
                  {/* Organizador */}
                  <div className="w-full xl:w-1/3 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <Crown size={16} className="text-amber-500" />
                      <span className="text-xs font-black uppercase text-slate-500">
                        Organizador (Responsável)
                      </span>
                    </div>
                    {organizadorDetalhes ? (
                      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm border border-blue-200 shrink-0 uppercase">
                          {organizadorDetalhes.nome.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-800 truncate">
                            {organizadorDetalhes.nome} {organizadorDetalhes.sobrenome}
                          </div>
                          <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                            <Mail size={10} /> {organizadorDetalhes.email}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic">Organizador não definido.</div>
                    )}
                  </div>

                  {/* Participantes / Chamada */}
                  <div className="w-full xl:w-2/3 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <UserCheck size={16} className="text-blue-600" />
                        <span className="text-xs font-black uppercase text-slate-500">
                          Participantes (Chamada)
                        </span>
                      </div>
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                        {participantesLista.filter((p) => p.presente).length} /{" "}
                        {participantesLista.length} presentes
                      </span>
                    </div>

                    {loadingParticipantes ? (
                      <div className="text-xs text-slate-400">Carregando chamada...</div>
                    ) : participantesLista.length === 0 ? (
                      <div className="text-xs text-slate-400 italic p-4 border border-dashed rounded-xl text-center">
                        Nenhum participante vinculado.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-1">
                        {participantesLista.map((p) => (
                          <button
                            key={p.id || `manual-${p.nome}-${p.usuario_id || "x"}`}
                            type="button"
                            disabled={reuniaoFinalizada}
                            title={
                              reuniaoFinalizada
                                ? "Reunião finalizada: presença bloqueada."
                                : "Clique para marcar presença"
                            }
                            onClick={() => {
                              if (reuniaoFinalizada) return;
                              togglePresenca(p);
                            }}
                            className={[
                              "flex items-center justify-between p-2 rounded-xl border transition-all group",
                              p.presente
                                ? "bg-green-50 border-green-200"
                                : "bg-white border-slate-100 hover:bg-slate-50",
                              reuniaoFinalizada ? "opacity-60 cursor-not-allowed" : "",
                            ].join(" ")}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={[
                                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase shrink-0 border",
                                  p.presente
                                    ? "bg-green-100 text-green-700 border-green-200"
                                    : "bg-slate-100 text-slate-500 border-slate-200",
                                ].join(" ")}
                              >
                                {p.nome ? p.nome.charAt(0) : "?"}
                              </div>

                              <div className="min-w-0 text-left">
                                <div
                                  className={`text-xs font-bold truncate ${
                                    p.presente ? "text-green-800" : "text-slate-700"
                                  }`}
                                >
                                  {p.nome || "Sem nome"}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {p.email || "-"}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 ml-2">
                              {reuniaoFinalizada ? (
                                <Lock size={16} className="text-slate-400" />
                              ) : p.presente ? (
                                <CheckCircle2 size={18} className="text-green-500" />
                              ) : (
                                <XCircle
                                  size={18}
                                  className="text-slate-200 group-hover:text-slate-300"
                                />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : tab === "acoes" ? (
            <div className="space-y-4">
              {/* Subtabs ações */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex flex-wrap gap-2">
                  <Pill active={acaoTab === "reuniao"} onClick={() => setAcaoTab("reuniao")}>
                    Da reunião ({(acoesDaReuniao || []).length})
                  </Pill>

                  <Pill active={acaoTab === "backlog"} onClick={() => setAcaoTab("backlog")}>
                    Pendências do tipo ({(acoesPendentesTipo || []).length})
                  </Pill>

                  <Pill
                    active={acaoTab === "desde_ultima"}
                    onClick={() => setAcaoTab("desde_ultima")}
                  >
                    Concluídas desde a última ({(acoesConcluidasDesdeUltima || []).length})
                  </Pill>
                </div>
              </div>

              {/* Lista ações */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-black text-sm">
                    {acaoTab === "reuniao"
                      ? "Ações da reunião"
                      : acaoTab === "backlog"
                      ? "Pendências do tipo"
                      : "Concluídas desde a última"}
                  </div>
                  {loadingAcoes && (
                    <div className="text-xs font-extrabold text-blue-700 animate-pulse">
                      CARREGANDO...
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {(listaAtiva || []).length > 0 ? (
                    (listaAtiva || []).map((a) => (
                      <AcaoCard key={a.id} acao={a} onClick={() => setAcaoSelecionada(a)} />
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">
                      Nenhuma ação encontrada nesta aba.
                    </div>
                  )}
                </div>
              </div>

              {/* Criar ação */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-2xl bg-blue-600/10 border border-blue-200 text-blue-800 flex items-center justify-center">
                    <Plus size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-black">Criar nova ação</div>
                    <div className="text-xs text-slate-500">
                      Criado por:{" "}
                      <strong>{currentUser ? buildNomeSobrenome(currentUser) : "..."}</strong>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="lg:col-span-2">
                    <label className="text-xs font-extrabold text-slate-600">
                      Nome da Ação (Descrição Curta)
                    </label>
                    <input
                      type="text"
                      autoComplete="off"
                      value={novaAcao.descricao}
                      onChange={(e) => setNovaAcao((p) => ({ ...p, descricao: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 ring-blue-500/30"
                      placeholder="Ex: Ajustar o relatório financeiro"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-xs font-extrabold text-slate-600">
                      Observação (Detalhes da Ação)
                    </label>
                    <textarea
                      autoComplete="off"
                      value={novaAcao.observacao}
                      onChange={(e) => setNovaAcao((p) => ({ ...p, observacao: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 ring-blue-500/30"
                      rows={3}
                      placeholder="Descreva detalhadamente o que precisa ser feito..."
                    />
                  </div>

                  <div className="relative">
                    <label className="text-xs font-extrabold text-slate-600">Responsável</label>
                    <input
                      value={responsavelQuery}
                      autoComplete="off"
                      onChange={(e) => {
                        setResponsavelQuery(e.target.value);
                        setRespOpen(true);
                      }}
                      onFocus={() => setRespOpen(true)}
                      onBlur={() => setTimeout(() => setRespOpen(false), 120)}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 ring-blue-500/30"
                      placeholder={loadingResponsaveis ? "Carregando..." : "Digite o nome..."}
                      disabled={loadingResponsaveis}
                    />

                    {respOpen && responsaveisFiltrados.length > 0 && (
                      <div className="absolute z-50 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                        {responsaveisFiltrados.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selecionarResponsavel(u);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                          >
                            <div className="font-semibold">{buildNomeSobrenome(u)}</div>
                            <div className="text-xs text-slate-500">
                              {u?.login ? `Login: ${u.login}` : null}
                              {u?.email ? ` • ${u.email}` : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-extrabold text-slate-600">Vencimento</label>
                    <input
                      type="date"
                      autoComplete="off"
                      value={novaAcao.vencimento}
                      onChange={(e) => setNovaAcao((p) => ({ ...p, vencimento: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 ring-blue-500/30"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-xs font-extrabold text-slate-600">
                      Evidências (opcional)
                    </label>

                    <div className="mt-2 flex items-center gap-3">
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-sm font-black transition-colors hover:border-blue-300">
                        <UploadCloud size={16} className="text-blue-600" />
                        <span>Clique, arraste ou Cole (Ctrl+V) se quiser anexar</span>
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => onAddEvidencias(e.target.files)}
                        />
                      </label>

                      <div className="text-xs text-slate-500">
                        {(novasEvidenciasAcao || []).length} arquivo(s)
                      </div>
                    </div>

                    {previews.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {previews.map((p) => (
                          <MiniaturaArquivo
                            key={p.id}
                            preview={p}
                            onRemove={() => removerEvidencia(p.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={salvarAcao}
                    disabled={creatingAcao}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creatingAcao ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    {creatingAcao ? "Salvando..." : "Salvar ação"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNovaAcao({
                        descricao: "",
                        observacao: "",
                        responsavelId: "",
                        vencimento: "",
                      });
                      setResponsavelQuery("");
                      setNovasEvidenciasAcao([]);
                      setRespOpen(false);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-black text-sm"
                  >
                    <X size={16} />
                    Limpar
                  </button>
                </div>
              </div>
            </div>
          ) : tab === "ata_principal" ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={18} className="text-slate-600" />
                <div className="font-black">Pauta (somente leitura)</div>
              </div>

              <div className="text-sm text-slate-700 whitespace-pre-wrap">
                {ataPrincipal || "Sem ata principal configurada para este tipo de reunião."}
              </div>
            </div>
          ) : tab === "ata_manual" ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <StickyNote size={18} className="text-slate-600" />
                  <div className="font-black">Pauta Manual</div>
                </div>

                <div className="flex gap-2">
                  {!editAtaManual ? (
                    <button
                      type="button"
                      onClick={() => setEditAtaManual(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-black text-xs"
                    >
                      Editar
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={salvarAtaManual}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs"
                      >
                        <Check size={16} />
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAtaManual(String(selecionada?.ata_manual || "").trim());
                          setEditAtaManual(false);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-black text-xs"
                      >
                        <X size={16} />
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editAtaManual ? (
                <textarea
                  value={ataManual}
                  onChange={(e) => setAtaManual(e.target.value)}
                  autoComplete="off"
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 ring-blue-500/30"
                  rows={14}
                  placeholder="Escreva a ata manual..."
                />
              ) : (
                <div className="text-sm text-slate-700 whitespace-pre-wrap">
                  {ataManual || "Nenhuma ata manual ainda."}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip size={18} className="text-slate-600" />
                <div className="font-black">Material da Reunião</div>
                <div className="text-xs text-slate-500 ml-2">
                  ({materiaisReuniao.length} item(ns))
                </div>
              </div>

              {materiaisReuniao.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Nenhum material anexado nesta reunião.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {materiaisReuniao.map((m, idx) => (
                    <div
                      key={`${idx}-${m?.url || m?.name || "mat"}`}
                      className="flex items-center justify-between border border-slate-200 rounded-xl p-3 bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div
                          className="text-sm font-black text-slate-800 truncate"
                          title={m?.name || "Arquivo"}
                        >
                          {m?.name || "Arquivo"}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate" title={m?.type || ""}>
                          {m?.type || "—"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {m?.url ? (
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-black text-xs"
                            title="Abrir/baixar"
                          >
                            <Download size={16} />
                            Abrir
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">Sem URL</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal detalhes ação (Central) */}
      {acaoSelecionada && (
        <ModalDetalhesAcao
          aberto={!!acaoSelecionada}
          acao={acaoSelecionada}
          status={acaoSelecionada?.status}
          onClose={() => setAcaoSelecionada(null)}
          onAfterSave={() => fetchAcoes(selecionada)}
          onAfterDelete={() => fetchAcoes(selecionada)}
          onConcluir={async () => {
            await supabase
              .from("acoes")
              .update({ status: "Concluída", data_conclusao: new Date().toISOString() })
              .eq("id", acaoSelecionada.id);

            await fetchAcoes(selecionada);
          }}
        />
      )}

      {/* Reabrir ADM */}
      {showUnlock && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl w-[360px]">
            <div className="font-black mb-2">Senha do Administrador</div>
            <input
              type="password"
              autoComplete="off"
              value={senhaAdm}
              onChange={(e) => setSenhaAdm(e.target.value)}
              className="w-full border rounded-xl p-3"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={validarSenhaAdm}
                className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-black"
                type="button"
              >
                Liberar
              </button>
              <button
                onClick={() => setShowUnlock(false)}
                className="border px-4 py-2 rounded-xl text-xs"
                type="button"
              >
                Cancelar
              </button>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              Validação feita no <b>SUPABASE INOVE</b> (usuarios_aprovadores).
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

/* =========================
   UI small components
========================= */
function TabButton({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-2 transition-colors ${
        active
          ? "bg-blue-600/10 border-blue-200 text-blue-800"
          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-[12px] px-3 py-2 rounded-xl font-extrabold border transition-colors ${
        active
          ? "bg-blue-600/10 border-blue-200 text-blue-800"
          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
      type="button"
    >
      {children}
    </button>
  );
}

function MiniaturaArquivo({ preview, onRemove }) {
  const { kind, url, name } = preview;

  const box =
    "w-16 h-16 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center relative";
  const caption = "max-w-[64px] text-[9px] text-slate-600 truncate mt-1";

  const RemoveBtn = () => (
    <button
      type="button"
      onClick={onRemove}
      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center justify-center text-[12px] font-black"
      title="Remover"
    >
      ×
    </button>
  );

  if (kind === "image") {
    return (
      <div className="flex flex-col items-center">
        <div className={box} title={name}>
          <img src={url} alt={name} className="w-full h-full object-cover" />
          <RemoveBtn />
        </div>
        <div className={caption}>{name}</div>
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className="flex flex-col items-center">
        <div className={box} title={name}>
          <video src={url} className="w-full h-full object-cover" muted playsInline />
          <RemoveBtn />
        </div>
        <div className={caption}>{name}</div>
      </div>
    );
  }

  const Icon = kind === "pdf" ? FileText : FileIcon;

  const label =
    kind === "pdf"
      ? { t: "PDF", cls: "text-red-600" }
      : kind === "doc"
      ? { t: "DOC", cls: "text-blue-700" }
      : kind === "xls"
      ? { t: "XLS", cls: "text-emerald-700" }
      : kind === "ppt"
      ? { t: "PPT", cls: "text-orange-700" }
      : { t: "ARQ", cls: "text-slate-700" };

  return (
    <div className="flex flex-col items-center">
      <div className={box} title={name}>
        <div className="flex flex-col items-center justify-center">
          <div className={`text-[10px] font-black ${label.cls}`}>{label.t}</div>
          <Icon size={18} className="text-slate-500 mt-1" />
        </div>
        <RemoveBtn />
      </div>
      <div className={caption}>{name}</div>
    </div>
  );
}

function AcaoCard({ acao, onClick }) {
  const st = String(acao?.status || "").toLowerCase();
  const done = st === "concluída" || st === "concluida";
  const excluded = st === "excluída" || st === "excluida";

  const resp = acao?.responsavel_nome || acao?.responsavel || "Geral";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border shadow-sm transition-colors ${
        excluded
          ? "bg-gray-50 border-gray-200 opacity-60 grayscale"
          : "bg-white border-slate-200 hover:bg-slate-50"
      }`}
      type="button"
    >
      <div className="flex items-start gap-3">
        <div className="mt-1">
          {excluded ? (
            <Trash2 size={14} className="text-gray-400" />
          ) : (
            <div className={`w-2.5 h-2.5 rounded-full ${done ? "bg-emerald-500" : "bg-blue-500"}`} />
          )}
        </div>

        <div className="flex-1">
          <div
            className={`text-sm font-semibold ${
              done || excluded ? "line-through text-slate-400" : "text-slate-900"
            }`}
          >
            {acao?.descricao || "-"}
            {excluded && (
              <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded uppercase font-black no-underline inline-block border border-red-200">
                EXCLUÍDA
              </span>
            )}
          </div>

          <div className="text-[12px] text-slate-600 mt-1 flex flex-wrap gap-2 items-center">
            <span className="font-semibold bg-slate-100 px-1.5 py-0.5 rounded flex items-center gap-1">
              <User size={10} /> {resp}
            </span>

            {acao?.data_vencimento ? (
              <span className="text-slate-500 flex items-center gap-1">
                <Clock size={10} /> Venc.: {new Date(acao.data_vencimento).toLocaleDateString("pt-BR")}
              </span>
            ) : null}

            {acao?.data_conclusao ? (
              <span className="text-green-600 flex items-center gap-1">
                <Check size={10} /> {toBRDateTime(acao.data_conclusao)}
              </span>
            ) : null}

            {(acao?.fotos?.length > 0 || acao?.fotos_acao?.length > 0) && (
              <Image size={12} className="text-blue-400" />
            )}

            {acao?.observacao && <MessageSquare size={12} className="text-amber-400" />}
          </div>
        </div>
      </div>
    </button>
  );
}
