// src/pages/CentralAtas.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import Layout from "../components/tatico/Layout";
import { supabase, supabaseInove } from "../supabaseClient";
import { getGeminiFlash } from "../services/gemini";
import ModalDetalhesAcao from "../components/tatico/ModalDetalhesAcao";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

import {
  Calendar,
  User,
  CheckCircle,
  Layers,
  Edit3,
  Trash2,
  Plus,
  PlayCircle,
  Headphones,
  ExternalLink,
  Cpu,
  Loader2,
  Clock,
  ImageIcon,
  Play,
  Pause,
  Volume2,
  VolumeX,
  StickyNote,
  Paperclip,
  FileText,
  Download,
  Video,
  Maximize2,
  X,
  RefreshCw,
  FileVideo,
  Hourglass,
} from "lucide-react";

// --- HELPER: Formatar Duração Real ---
const calculateRealDuration = (startStr, endStr) => {
  if (!startStr || !endStr) return null;
  const start = new Date(startStr);
  const end = new Date(endStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const diffMs = end - start;
  if (diffMs < 0) return null;

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((diffMs % 60000) / 1000);

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
};

// ==========================
// ✅ FORMATADOR PROFISSIONAL DE ATA (padrão limpo)
// ==========================
function cleanLeadingSalutation(md) {
  let t = String(md || "").replace(/\r\n/g, "\n").trim();
  t = t.replace(/^(certo|claro)[^\n]*\n+/gim, "");
  t = t.replace(/^(aqui\s+est[aá]\s+a\s+ata[^\n]*)\n+/gim, "");
  t = t.trim();
  return t;
}

function ensureSpacing(md) {
  return String(md || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function boldSectionTitles(md) {
  let t = String(md || "");

  const map = [
    { re: /^\s*(\d+)\s*[\.\)]\s*Resumo\s*$/gim, rep: "## **Resumo**" },
    { re: /^\s*(\d+)\s*[\.\)]\s*Decis(õ|o)es\s*$/gim, rep: "## **Decisões**" },
    { re: /^\s*(\d+)\s*[\.\)]\s*A(ç|c)oes\s*$/gim, rep: "## **Ações**" },

    { re: /^\s*\*\*Resumo\*\*\s*$/gim, rep: "## **Resumo**" },
    { re: /^\s*\*\*Decis(õ|o)es\*\*\s*$/gim, rep: "## **Decisões**" },
    { re: /^\s*\*\*A(ç|c)oes\*\*\s*$/gim, rep: "## **Ações**" },

    { re: /^\s*Resumo\s*$/gim, rep: "## **Resumo**" },
    { re: /^\s*Decis(õ|o)es\s*$/gim, rep: "## **Decisões**" },
    { re: /^\s*A(ç|c)oes\s*$/gim, rep: "## **Ações**" },
  ];

  for (const r of map) t = t.replace(r.re, r.rep);
  return t;
}

function normalizeTitleAndDate(raw, { titulo, dataBR } = {}) {
  let t = String(raw || "").trim();

  const safeTitulo = String(titulo || "").trim();
  const safeData = String(dataBR || "").trim();

  let header = "";
  if (safeTitulo) header += `# ${safeTitulo}\n`;
  if (safeData) header += `**Data:** ${safeData}\n`;

  const lines = t.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const first = (lines[i] || "").trim();

  const startsWithHeading = /^#{1,6}\s+/.test(first);
  const startsWithDBO = /^d\s*b\s*o\s*[\-–—]/i.test(first) || /^dbo\b/i.test(first);

  if (!startsWithHeading) {
    if (startsWithDBO) {
      let cut = i;
      let guard = 0;
      while (cut < lines.length && guard < 10) {
        const s = (lines[cut] || "").trim();
        if (!s) {
          cut++;
          guard++;
          continue;
        }
        if (/^(##\s*)?\*?\*?(1\.)?\s*Resumo/i.test(s)) break;
        if (/^(##\s*)?\*?\*?(2\.)?\s*Decis/i.test(s)) break;
        if (/^(##\s*)?\*?\*?(3\.)?\s*A(ç|c)oes/i.test(s)) break;
        cut++;
        guard++;
      }
      const rest = lines.slice(cut).join("\n").trim();
      t = `${header}\n${rest}`.trim();
    } else {
      const hasEarlyDate = lines.slice(0, Math.min(lines.length, 8)).some((l) => /^\s*data\s*:/i.test(l));
      if (!hasEarlyDate && (safeTitulo || safeData)) {
        t = `${header}\n${t}`.trim();
      }
    }
  }

  t = t.replace(/^\s*data\s*:\s*(.+)$/gim, (_, v) => `**Data:** ${String(v).trim()}`);

  return t.trim();
}

function enforceParagraphBreaks(md) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];

  const isSpecialLine = (s) => {
    const t = s.trim();
    if (!t) return true;
    if (/^#{1,6}\s+/.test(t)) return true;
    if (/^(\-|\*|\+)\s+/.test(t)) return true;
    if (/^\d+\.\s+/.test(t)) return true;
    if (/^>\s+/.test(t)) return true;
    if (/^---$/.test(t)) return true;
    if (/^\*\*Data:\*\*/.test(t)) return true;
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];

    out.push(cur);

    const curTrim = cur.trim();
    const nextTrim = (next || "").trim();

    if (!curTrim) continue;
    if (!nextTrim) continue;
    if (isSpecialLine(cur) || isSpecialLine(next)) continue;

    out.push("");
  }

  return ensureSpacing(out.join("\n"));
}

function negritarPercentuais(md) {
  let t = String(md || "");
  t = t.replace(/(\b\d{1,3})\s*%/g, "**$1%**");
  t = t.replace(/(\b\d{1,3}(?:[.,]\d{1,2})?)\s*%/g, "**$1%**");
  return t;
}

function normalizeSectionsContent(md) {
  let t = String(md || "").trim();

  t = t.replace(/(##\s+\*\*A(ç|c)oes\*\*\s*\n)(\s*\n)+(##\s+\*\*A(ç|c)oes\*\*\s*\n)+/gim, "$1");
  t = t.replace(/(##\s+\*\*Decis(õ|o)es\*\*\s*\n)(\s*\n)+(##\s+\*\*Decis(õ|o)es\*\*\s*\n)+/gim, "$1");
  t = t.replace(/(##\s+\*\*Resumo\*\*\s*\n)(\s*\n)+(##\s+\*\*Resumo\*\*\s*\n)+/gim, "$1");

  return ensureSpacing(t);
}

function ensureMinimumSections(md) {
  let t = String(md || "").trim();
  return ensureSpacing(t);
}

function bulletizeAcoesSection(md) {
  let t = String(md || "");

  const split = t.split(/##\s+\*\*A(ç|c)oes\*\*/i);
  if (split.length < 2) return t;

  const before = split[0];
  const after = "## **Ações**" + split.slice(1).join("## **Ações**");

  const parts = after.split(/\n/);
  const out = [];
  let inAcoes = false;

  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    const trim = line.trim();

    if (/^##\s+\*\*A(ç|c)oes\*\*/i.test(trim)) {
      inAcoes = true;
      out.push(line);
      continue;
    }
    if (inAcoes && /^##\s+\*\*/.test(trim)) {
      inAcoes = false;
      out.push(line);
      continue;
    }

    if (inAcoes) {
      if (!trim) {
        out.push(line);
        continue;
      }
      if (/^(\-|\*|\+)\s+/.test(trim) || /^\d+\.\s+/.test(trim) || /^_/.test(trim) || /^\*/.test(trim)) {
        out.push(line);
        continue;
      }
      out.push(`- ${trim}`);
      continue;
    }

    out.push(line);
  }

  return ensureSpacing(before.trim() + "\n\n" + out.join("\n").trim());
}

function formatAtaMarkdown(raw, { titulo, dataBR } = {}) {
  let t = cleanLeadingSalutation(raw);

  t = normalizeTitleAndDate(t, { titulo, dataBR });
  t = boldSectionTitles(t);
  t = normalizeSectionsContent(t);

  t = enforceParagraphBreaks(t);
  t = negritarPercentuais(t);
  t = ensureMinimumSections(t);
  t = bulletizeAcoesSection(t);

  return ensureSpacing(t);
}

// ✅ HELPERS (NOVO): Agrupamento sidebar
function toBRDayKey(dateStr) {
  if (!dateStr) return "Sem data";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Sem data";
  return d.toLocaleDateString("pt-BR");
}

function inferTipoFromTitulo(titulo) {
  const t = String(titulo || "").toUpperCase();

  // ajuste livre aqui com os nomes que vocês usam
  if (/\bDBO\b/.test(t)) return "DBO";
  if (t.includes("COMITÊ") || t.includes("COMITE")) return "Comitê";
  if (t.includes("CAFÉ") || t.includes("CAFE")) return "Café com Gestão";
  if (t.includes("PCM")) return "PCM";
  if (t.includes("S.O.S") || t.includes("SOS")) return "SOS";
  if (t.includes("TRATATIVA")) return "Tratativas";
  if (t.includes("FAROL")) return "Farol";
  if (t.includes("OPERACIONAL")) return "Operacional";
  if (t.includes("TÁTICO") || t.includes("TATICO")) return "Tático";

  return "Outros";
}

function groupKeyForAta(ata, groupBy) {
  if (groupBy === "DIA") return toBRDayKey(ata?.data_hora || ata?.gravacao_inicio);
  if (groupBy === "TIPO") return String(ata?.tipo_reuniao || "Sem tipo").trim();
  return String(ata?.titulo || "Sem título").trim();
}

// --- COMPONENTE PLAYER DE ÁUDIO ---
const CustomAudioPlayer = ({ src, durationDb }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationDb || 0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(durationDb || 0);
  }, [src, durationDb]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);

    if (Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const d = audioRef.current.duration;
    if (Number.isFinite(d) && d > 0) setDuration(d);
  };

  const handleSeek = (e) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) audioRef.current.currentTime = newTime;
  };

  const formatTime = (time) => {
    if (!time || isNaN(time) || !Number.isFinite(time)) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const safeDuration = duration > 0 ? duration : durationDb || 100;
  const progressPercent = (currentTime / safeDuration) * 100;

  return (
    <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm w-full">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
        preload="metadata"
      />

      <button
        onClick={togglePlay}
        className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow transition-all active:scale-95"
      >
        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
      </button>

      <span className="text-xs font-mono font-bold text-slate-600 w-12 text-right">{formatTime(currentTime)}</span>

      <div className="flex-1 relative h-8 flex items-center group">
        <div className="absolute w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all duration-100 ease-linear" style={{ width: `${Math.min(progressPercent, 100)}%` }} />
        </div>

        <input type="range" min="0" max={safeDuration} value={currentTime} onChange={handleSeek} className="absolute w-full h-full opacity-0 cursor-pointer z-10" />

        <div
          className="absolute h-4 w-4 bg-white border-2 border-blue-600 rounded-full shadow pointer-events-none transition-all duration-100 ease-linear"
          style={{ left: `calc(${Math.min(progressPercent, 100)}% - 8px)` }}
        />
      </div>

      <span className="text-xs font-mono text-slate-400 w-12">{formatTime(safeDuration)}</span>

      <button
        onClick={() => {
          if (!audioRef.current) return;
          audioRef.current.muted = !isMuted;
          setIsMuted(!isMuted);
        }}
        className="text-slate-400 hover:text-slate-600 p-1"
      >
        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
    </div>
  );
};

export default function CentralAtas() {
  const [atas, setAtas] = useState([]);
  const [selectedAta, setSelectedAta] = useState(null);
  const [busca, setBusca] = useState("");

  // ✅ NOVO: organizar lista na sidebar
  const [groupBy, setGroupBy] = useState("DIA"); // "DIA" | "TIPO" | "NOME"
  const [openGroups, setOpenGroups] = useState({}); // { [groupKey]: boolean }

  const [mediaUrls, setMediaUrls] = useState({ video: null, audio: null });

  const [acoesCriadas, setAcoesCriadas] = useState([]);
  const [acoesAnteriores, setAcoesAnteriores] = useState([]);

  const [ataManual, setAtaManual] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editedPauta, setEditedPauta] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [requestingVideo, setRequestingVideo] = useState(false);

  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [acaoParaModal, setAcaoParaModal] = useState(null);
  const pollingRef = useRef(null);

  const [showDeleteAuth, setShowDeleteAuth] = useState(false);
  const [delLogin, setDelLogin] = useState("");
  const [delSenha, setDelSenha] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [uploadingMaterial, setUploadingMaterial] = useState(false);

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const ataExportRef = useRef(null);

  // ✅ PRESENÇA (NOVO)
  const [presenca, setPresenca] = useState({ presentes: [], ausentes: [], total: 0 });
  const [loadingPresenca, setLoadingPresenca] = useState(false);

  // ✅ NOVO: nome do arquivo de áudio para mostrar igual na gravação
  const audioFileName = useMemo(() => {
    if (!selectedAta) return null;
    const p = selectedAta?.gravacao_audio_path || selectedAta?.gravacao_path;
    return p ? p.split("/").pop() : null;
  }, [selectedAta?.id, selectedAta?.gravacao_audio_path, selectedAta?.gravacao_path]);

  const checkUserRole = async () => {
    setIsAdmin(true);
  };

  useEffect(() => {
    fetchAtas();
    checkUserRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ CARREGAR PRESENÇA (NOVO)
  const carregarPresenca = async (ataId) => {
    if (!ataId) {
      setPresenca({ presentes: [], ausentes: [], total: 0 });
      return;
    }
    setLoadingPresenca(true);
    try {
      const { data, error } = await supabase.from("participantes_reuniao").select("reuniao_id, nome, email, presente").eq("reuniao_id", ataId);

      if (error) {
        console.error("Erro carregarPresenca:", error);
        setPresenca({ presentes: [], ausentes: [], total: 0 });
        return;
      }

      const presentes = [];
      const ausentes = [];

      for (const row of data || []) {
        const item = {
          nome: row?.nome || "-",
          email: row?.email || "",
        };
        if (row?.presente) presentes.push(item);
        else ausentes.push(item);
      }

      presentes.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
      ausentes.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));

      setPresenca({
        presentes,
        ausentes,
        total: (data || []).length,
      });
    } catch (e) {
      console.error("Erro carregarPresenca catch:", e);
      setPresenca({ presentes: [], ausentes: [], total: 0 });
    } finally {
      setLoadingPresenca(false);
    }
  };

  useEffect(() => {
    if (selectedAta) {
      carregarDetalhes(selectedAta);
      carregarPresenca(selectedAta.id);

      const dataBR = selectedAta.data_hora ? new Date(selectedAta.data_hora).toLocaleDateString("pt-BR") : "";

      setEditedPauta(
        formatAtaMarkdown(selectedAta.pauta || "", {
          titulo: selectedAta.titulo || "Ata da Reunião",
          dataBR,
        })
      );

      setAtaManual(selectedAta.ata_manual || "");
      setIsEditing(false);

      setShowDeleteAuth(false);
      setDelLogin("");
      setDelSenha("");
      setRequestingVideo(false);
      setIsVideoModalOpen(false);

      hydrateMediaUrls(selectedAta);
      checkAutoRefresh(selectedAta);
    } else {
      setMediaUrls({ video: null, audio: null });
      stopPolling();
      setPresenca({ presentes: [], ausentes: [], total: 0 });
    }

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAta?.id]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const checkAutoRefresh = (ata) => {
    stopPolling();
    const stGravacao = String(ata.gravacao_status || "").toUpperCase();

    const precisaAtualizar =
      stGravacao.includes("PROCESSANDO") || stGravacao === "PENDENTE" || stGravacao === "GRAVANDO" || stGravacao === "PRONTO_PROCESSAR";

    if (precisaAtualizar) {
      pollingRef.current = setInterval(() => {
        refreshSelectedAta(ata.id);
      }, 4000);
    }
  };

  const refreshSelectedAta = async (id) => {
    if (!id) return;
    try {
      const { data, error } = await supabase.from("reunioes").select("*").eq("id", id).single();

      if (!error && data) {
        setSelectedAta((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(data)) return data;
          return prev;
        });
        setAtas((prev) => prev.map((r) => (r.id === data.id ? { ...r, ...data } : r)));

        const stGravacao = String(data.gravacao_status || "").toUpperCase();

        if (!stGravacao.includes("PROCESSANDO") && stGravacao !== "PENDENTE" && stGravacao !== "GRAVANDO") {
          stopPolling();
          hydrateMediaUrls(data);
          carregarDetalhes(data);
          carregarPresenca(data.id);

          if (data.pauta) {
            const dataBR = data.data_hora ? new Date(data.data_hora).toLocaleDateString("pt-BR") : "";
            setEditedPauta(
              formatAtaMarkdown(data.pauta, {
                titulo: data.titulo || "Ata da Reunião",
                dataBR,
              })
            );
          }
        }
      }
    } catch (e) {
      console.error("Erro polling:", e);
    }
  };

  const getSignedOrPublicUrl = async (bucket, filePath) => {
    if (!bucket || !filePath) return null;
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filePath);
    if (pub?.publicUrl) return pub.publicUrl;
    return null;
  };

  const hydrateMediaUrls = async (ata) => {
    try {
      const videoUrl = await getSignedOrPublicUrl(ata.gravacao_bucket, ata.gravacao_path);
      const audioUrl = await getSignedOrPublicUrl(ata.gravacao_audio_bucket || ata.gravacao_bucket, ata.gravacao_audio_path || ata.gravacao_path);
      setMediaUrls({ video: videoUrl, audio: audioUrl });
    } catch (e) {
      console.error("Erro URLs:", e);
    }
  };

  const fetchAtas = async () => {
    const { data, error } = await supabase.from("reunioes").select("*").eq("status", "Realizada").order("data_hora", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    setAtas(data || []);
    if (data && data.length > 0 && !selectedAta) setSelectedAta(data[0]);
  };

  const carregarDetalhes = async (ata) => {
    const { data: criadas } = await supabase.from("acoes").select("*").eq("reuniao_id", ata.id).order("data_criacao", { ascending: false });
    setAcoesCriadas(criadas || []);

    try {
      const tituloBase = (ata.titulo || "").trim();
      if (!tituloBase) {
        setAcoesAnteriores([]);
        return;
      }

      const { data: reunioesAnt } = await supabase
        .from("reunioes")
        .select("id")
        .eq("titulo", tituloBase)
        .neq("id", ata.id)
        .lt("data_hora", ata.data_hora)
        .order("data_hora", { ascending: false })
        .limit(20);

      const listaIds = (reunioesAnt || []).map((r) => r.id);
      if (!listaIds.length) {
        setAcoesAnteriores([]);
        return;
      }

      const { data: anteriores } = await supabase.from("acoes").select("*").eq("status", "Aberta").in("reuniao_id", listaIds);

      setAcoesAnteriores(anteriores || []);
    } catch (err) {
      setAcoesAnteriores([]);
    }
  };

  // ✅ IA
  const handleRegenerateIA = async () => {
    const audioUrl = mediaUrls.audio || mediaUrls.video;
    if (!audioUrl || !window.confirm("Gerar novo resumo a partir do áudio da reunião?")) return;

    setIsGenerating(true);
    try {
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error("Falha ao baixar o arquivo de mídia.");

      const blob = await response.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);

      reader.onloadend = async () => {
        try {
          const base64data = reader.result.split(",")[1];
          const model = getGeminiFlash();

          const titulo = selectedAta.titulo || "Ata da Reunião";
          const dataBR = selectedAta.data_hora ? new Date(selectedAta.data_hora).toLocaleDateString("pt-BR") : "";

          let promptTemplate = `
Você é uma secretária executiva sênior, especializada em reuniões operacionais e táticas.

Utilize EXCLUSIVAMENTE as informações contidas no áudio/vídeo fornecido.
NÃO invente ou presuma dados.

Gere a ATA em Markdown válido, com linguagem profissional, boa organização e parágrafos bem separados.

Estrutura obrigatória:
# {titulo}
**Data:** {data}

## 1. Resumo
(Detalhado, com parágrafos e subtópicos quando fizer sentido)

## 2. Decisões
(Se não houver: "Nenhuma decisão foi formalizada nesta reunião.")

## 3. Ações
(Lista em bullets. Se não houver: "Nenhuma ação foi definida nesta reunião.")
`.trim();

          const { data: promptData } = await supabase.from("app_prompts").select("prompt_text").eq("slug", "ata_reuniao").maybeSingle();
          if (promptData?.prompt_text) promptTemplate = promptData.prompt_text;

          const finalPrompt = promptTemplate.replace(/{titulo}/g, titulo).replace(/{data}/g, dataBR);
          const mimeType = blob.type || "video/mp4";

          const result = await model.generateContent([finalPrompt, { inlineData: { data: base64data, mimeType } }]);
          const textoBruto = result.response.text();
          const textoFormatado = formatAtaMarkdown(textoBruto, { titulo, dataBR });

          await supabase.from("reunioes").update({ pauta: textoFormatado, ata_ia_status: "PRONTA" }).eq("id", selectedAta.id);

          setEditedPauta(textoFormatado);
          setIsEditing(false);
          setSelectedAta((prev) => ({ ...prev, pauta: textoFormatado, ata_ia_status: "PRONTA" }));
          setAtas((prev) => prev.map((a) => (a.id === selectedAta.id ? { ...a, pauta: textoFormatado, ata_ia_status: "PRONTA" } : a)));

          alert("Ata gerada e salva automaticamente!");
        } catch (err) {
          console.error(err);
          alert("Erro na IA: " + err.message);
        } finally {
          setIsGenerating(false);
        }
      };
    } catch (e) {
      alert("Erro download áudio: " + e.message);
      setIsGenerating(false);
    }
  };

  // ✅ PDF
  const handleGerarPDF = async () => {
    try {
      if (!ataExportRef.current) return alert("Área da ATA não encontrada para exportar.");
      setGeneratingPdf(true);

      const el = ataExportRef.current;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 10000,
        removeContainer: true,
      });

      if (!canvas) throw new Error("Falha ao gerar canvas");
      const imgData = canvas.toDataURL("image/png", 1.0);
      if (!imgData || imgData.length < 100) throw new Error("Imagem gerada inválida");

      const pdf = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const imgWidth = usableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let y = margin;
      let remainingHeight = imgHeight;

      pdf.addImage(imgData, "PNG", margin, y, imgWidth, imgHeight);
      remainingHeight -= pageHeight - margin * 2;

      while (remainingHeight > 0) {
        pdf.addPage();
        y = margin - (imgHeight - remainingHeight);
        pdf.addImage(imgData, "PNG", margin, y, imgWidth, imgHeight);
        remainingHeight -= pageHeight - margin * 2;
      }

      const titulo = (selectedAta?.titulo || "Ata").replace(/[\\/:*?"<>|]/g, " ").trim();
      const dataBR = selectedAta?.data_hora ? new Date(selectedAta.data_hora).toLocaleDateString("pt-BR") : "";
      const fileName = `ATA - ${titulo}${dataBR ? " - " + dataBR : ""}.pdf`;

      pdf.save(fileName);
      alert("PDF gerado com sucesso!");
    } catch (e) {
      console.error("Erro ao gerar PDF:", e);
      alert("Erro ao gerar PDF: " + (e?.message || "Falha desconhecida"));
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleSolicitarVideo = async () => {
    if (!selectedAta?.id) return;

    const GITHUB_USER = import.meta.env.VITE_GITHUB_USER;
    const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO;
    const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;

    if (!GITHUB_USER || !GITHUB_REPO || !GITHUB_TOKEN) {
      alert("ERRO DE CONFIGURAÇÃO:\nFaltam as variáveis de ambiente do GitHub no Render (VITE_GITHUB_...).");
      return;
    }

    if (selectedAta.gravacao_status === "CONCLUIDO") {
      if (!window.confirm("ATENÇÃO ADMIN:\nEsta reunião já possui vídeo. Deseja apagar o atual e gerar novamente?")) return;
    }

    setRequestingVideo(true);

    try {
      await supabase.from("reunioes").update({ gravacao_status: "PENDENTE" }).eq("id", selectedAta.id);

      await supabase.from("reuniao_processing_queue").delete().eq("reuniao_id", selectedAta.id).eq("job_type", "RENDER_FIX");

      const { error } = await supabase.from("reuniao_processing_queue").insert([
        {
          reuniao_id: selectedAta.id,
          job_type: "RENDER_FIX",
          status: "FILA_GITHUB",
          log_text: "Solicitado Manualmente (Disparo Imediato)",
        },
      ]);

      if (error) throw error;

      const response = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/actions/workflows/processar_video.yml/dispatches`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${GITHUB_TOKEN}`,
        },
        body: JSON.stringify({ ref: "main" }),
      });

      if (!response.ok) {
        console.error("Falha ao chamar GitHub:", await response.text());
        alert("Salvo na fila! O GitHub iniciará no próximo ciclo (ou tente novamente para forçar o início).");
      } else {
        alert("🚀 Sucesso! O Robô do GitHub foi acionado e já vai começar.");
      }

      setSelectedAta((prev) => ({ ...prev, gravacao_status: "PENDENTE" }));
      setAtas((prev) => prev.map((a) => (a.id === selectedAta.id ? { ...a, gravacao_status: "PENDENTE" } : a)));
      checkAutoRefresh({ ...selectedAta, gravacao_status: "PENDENTE" });
    } catch (e) {
      alert("Erro: " + e.message);
    } finally {
      setRequestingVideo(false);
    }
  };

  const handleNovaAcao = async () => {
    if (!selectedAta?.id) return;
    const { data, error } = await supabase
      .from("acoes")
      .insert([
        {
          reuniao_id: selectedAta.id,
          status: "Aberta",
          descricao: "Nova Ação",
          data_criacao: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    setAcaoParaModal(data);
  };

  const handleSaveAta = async () => {
    const { error } = await supabase.from("reunioes").update({ pauta: editedPauta, ata_manual: ataManual }).eq("id", selectedAta.id);

    if (!error) {
      setIsEditing(false);
      setSelectedAta((prev) => ({ ...prev, pauta: editedPauta, ata_manual: ataManual }));
      setAtas((prev) => prev.map((a) => (a.id === selectedAta.id ? { ...a, pauta: editedPauta, ata_manual: ataManual } : a)));
      alert("Ata salva com sucesso!");
    } else {
      alert("Erro ao salvar ata: " + error.message);
    }
  };

  const handleUploadMaterial = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingMaterial(true);
    try {
      const novosMateriais = [];
      for (const file of files) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${selectedAta.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${fileExt}`;
        const filePath = `anexos/${fileName}`;
        const { error: uploadErr } = await supabase.storage.from("materiais").upload(filePath, file);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("materiais").getPublicUrl(filePath);
        if (urlData?.publicUrl) novosMateriais.push({ name: file.name, url: urlData.publicUrl, type: file.type, path: filePath });
      }
      const listaFinal = [...(selectedAta.materiais || []), ...novosMateriais];
      await supabase.from("reunioes").update({ materiais: listaFinal }).eq("id", selectedAta.id);
      setSelectedAta((p) => ({ ...p, materiais: listaFinal }));
      setAtas((p) => p.map((a) => (a.id === selectedAta.id ? { ...a, materiais: listaFinal } : a)));
      alert("Material anexado!");
    } catch (err) {
      alert(err.message);
    } finally {
      setUploadingMaterial(false);
      e.target.value = null;
    }
  };

  const handleDeleteMaterial = async (indexToDelete) => {
    if (!window.confirm("Remover anexo?")) return;
    try {
      const novaLista = (selectedAta.materiais || []).filter((_, i) => i !== indexToDelete);
      await supabase.from("reunioes").update({ materiais: novaLista }).eq("id", selectedAta.id);
      setSelectedAta((p) => ({ ...p, materiais: novaLista }));
      setAtas((p) => p.map((a) => (a.id === selectedAta.id ? { ...a, materiais: novaLista } : a)));
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDeleteClick = () => setShowDeleteAuth(true);

  const confirmarExclusao = async () => {
    if (!delLogin || !delSenha) return alert("Informe Login e Senha.");
    setDeleting(true);
    try {
      const { data: usuario, error: errAuth } = await supabaseInove
        .from("usuarios_aprovadores")
        .select("*")
        .eq("login", delLogin)
        .eq("senha", delSenha)
        .eq("ativo", true)
        .maybeSingle();
      if (errAuth || !usuario || usuario.nivel !== "Administrador") {
        alert("Apenas Administradores.");
        setDeleting(false);
        return;
      }
      await supabase.from("reunioes").delete().eq("id", selectedAta.id);
      alert("Excluída.");
      window.location.reload();
    } catch (e) {
      alert(e.message);
      setDeleting(false);
    }
  };

  const atasFiltradas = useMemo(() => {
    const q = String(busca || "").toLowerCase().trim();
    if (!q) return atas || [];
    return (atas || []).filter((a) => String(a.titulo || "").toLowerCase().includes(q));
  }, [atas, busca]);

  // ✅ NOVO: grupos para a sidebar
  const groupedAtas = useMemo(() => {
    const map = new Map(); // key -> atas[]
    for (const ata of atasFiltradas) {
      const k = groupKeyForAta(ata, groupBy);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ata);
    }

    // ordena atas dentro do grupo por data desc
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));
    }

    const entries = Array.from(map.entries()).map(([key, items]) => {
      const refDate = items?.[0]?.data_hora ? new Date(items[0].data_hora).getTime() : 0;
      return { key, items, refDate };
    });

    // ordenação dos grupos:
    // DIA: mais recente primeiro
    // TIPO/NOME: alfabético
    if (groupBy === "DIA") entries.sort((a, b) => b.refDate - a.refDate);
    else entries.sort((a, b) => String(a.key).localeCompare(String(b.key), "pt-BR"));

    return entries;
  }, [atasFiltradas, groupBy]);

  const getFileName = (path) => (path ? path.split("/").pop() : "Arquivo desconhecido");

  const getStatusBadge = (status) => {
    const st = String(status || "").toUpperCase();
    if (st === "CONCLUIDO")
      return <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded font-bold border border-green-200">PRONTO</span>;
    if (st.includes("PROCESSANDO") || st.includes("RENDER"))
      return <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold border border-blue-200 animate-pulse">PROCESSANDO</span>;
    if (st === "PENDENTE")
      return <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded font-bold border border-amber-200">NA FILA</span>;
    return <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded font-bold border border-slate-200">AGUARDANDO</span>;
  };

  const iaStatusNorm = String(selectedAta?.ata_ia_status || "").toUpperCase();
  const badgeClass = (tone) =>
    ({
      green: "bg-green-100 text-green-700 border-green-200",
      blue: "bg-blue-100 text-blue-700 border-blue-200",
      red: "bg-red-100 text-red-700 border-red-200",
      gray: "bg-slate-100 text-slate-700 border-slate-200",
    }[tone] || "bg-slate-100 text-slate-700 border-slate-200");

  return (
    <Layout>
      <div className="flex h-screen bg-slate-50 font-sans overflow-hidden relative">
        {/* OVERLAY EXCLUSÃO */}
        {showDeleteAuth && (
          <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur flex items-center justify-center">
            <div className="bg-white p-6 rounded shadow-xl border border-red-200">
              <h3 className="text-lg font-bold text-red-600 mb-4">Confirmar Exclusão</h3>
              <input className="border p-2 w-full mb-2 rounded" placeholder="Login" value={delLogin} onChange={(e) => setDelLogin(e.target.value)} />
              <input className="border p-2 w-full mb-4 rounded" type="password" placeholder="Senha" value={delSenha} onChange={(e) => setDelSenha(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => setShowDeleteAuth(false)} className="flex-1 p-2 bg-slate-100 rounded">
                  Cancelar
                </button>
                <button onClick={confirmarExclusao} className="flex-1 p-2 bg-red-600 text-white rounded" disabled={deleting}>
                  {deleting ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ✅ MODAL CINEMA (VÍDEO) */}
        {isVideoModalOpen && mediaUrls.video && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-in fade-in duration-200">
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
              <div>
                <h2 className="text-white font-bold text-lg drop-shadow-md">{selectedAta?.titulo}</h2>
                <p className="text-white/60 text-xs font-mono">{getFileName(selectedAta?.gravacao_path)}</p>
              </div>
              <button onClick={() => setIsVideoModalOpen(false)} className="text-white hover:text-red-400 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all">
                <X size={24} />
              </button>
            </div>
            <div className="w-full h-full p-4 flex items-center justify-center">
              <video controls autoPlay className="w-full h-full object-contain max-h-screen">
                <source src={mediaUrls.video} type="video/webm" />
              </video>
            </div>
          </div>
        )}

        {/* SIDEBAR */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col z-10 shadow-sm">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Layers size={20} className="text-blue-600" /> Atas
            </h2>

            <input className="mt-4 w-full bg-slate-50 border p-2 rounded text-sm" placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} />

            {/* ✅ NOVO: Organizar por */}
            <div className="mt-3">
              <select
                className="w-full bg-slate-50 border p-2 rounded text-xs text-slate-700"
                value={groupBy}
                onChange={(e) => {
                  setGroupBy(e.target.value);
                  setOpenGroups({});
                }}
              >
                <option value="DIA">Organizar por: Dia</option>
                <option value="TIPO">Organizar por: Tipo</option>
                <option value="NOME">Organizar por: Nome</option>
              </select>
            </div>
          </div>

          {/* ✅ NOVO: lista agrupada */}
          <div className="flex-1 overflow-y-auto">
            {groupedAtas.map((g) => {
              const isOpen = openGroups[g.key] ?? false; // default FECHADO

              return (
                <div key={g.key} className="border-b border-slate-100">
                  <button
                    onClick={() => setOpenGroups((p) => ({ ...p, [g.key]: !isOpen }))}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 border-b border-slate-100"
                    title="Abrir/Fechar"
                  >
                    <div className="text-left min-w-0">
                      <div className="text-[11px] font-black text-slate-700 truncate">{g.key}</div>
                      <div className="text-[10px] text-slate-400">{g.items.length} ata(s)</div>
                    </div>
                    <div className="text-slate-400 text-xs font-black">{isOpen ? "—" : "+"}</div>
                  </button>

                  {isOpen && (
                    <div>
                      {g.items.map((ata) => (
                        <button
                          key={ata.id}
                          onClick={() => setSelectedAta(ata)}
                          className={`w-full text-left p-4 border-b border-slate-100 ${
                            selectedAta?.id === ata.id ? "bg-blue-50 border-l-4 border-l-blue-600" : "hover:bg-slate-50"
                          }`}
                        >
                          <h3 className="font-bold text-sm text-slate-700">{ata.titulo}</h3>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-xs text-slate-400">{ata.data_hora ? new Date(ata.data_hora).toLocaleDateString() : "-"}</span>
                            {getStatusBadge(ata.gravacao_status)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {groupedAtas.length === 0 && <div className="p-4 text-xs text-slate-400 italic">Nenhuma ata encontrada.</div>}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8 custom-scrollbar relative">
          {selectedAta ? (
            <div className="max-w-5xl mx-auto space-y-6">
              {/* HEADER ATA */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-blue-600 font-bold text-xs uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle size={14} /> Ata Oficial
                      </span>
                      {getStatusBadge(selectedAta.gravacao_status)}
                    </div>

                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                      {selectedAta.ata_ia_status && (
                        <span
                          className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase border flex items-center gap-1 w-fit ${
                            iaStatusNorm === "PRONTO" || iaStatusNorm === "PRONTA"
                              ? badgeClass("green")
                              : iaStatusNorm.includes("PROCESSANDO") || iaStatusNorm.includes("PENDENTE")
                              ? badgeClass("blue")
                              : iaStatusNorm === "ERRO"
                              ? badgeClass("red")
                              : badgeClass("gray")
                          }`}
                        >
                          {(iaStatusNorm.includes("PROCESSANDO") || iaStatusNorm.includes("PENDENTE")) && <Loader2 size={10} className="animate-spin" />}
                          IA: {selectedAta.ata_ia_status}
                        </span>
                      )}
                    </div>

                    <h1 className="text-3xl font-bold text-slate-900 mb-2">{selectedAta.titulo}</h1>

                    <div className="flex flex-col gap-1 text-sm text-slate-500 mt-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5">
                          <Calendar size={16} className="text-slate-400" />{" "}
                          {selectedAta.gravacao_inicio ? new Date(selectedAta.gravacao_inicio).toLocaleDateString() : "Data N/A"}
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                          <Clock size={16} className="text-slate-400" />
                          {selectedAta.gravacao_inicio ? new Date(selectedAta.gravacao_inicio).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}{" "}
                          {" - "}
                          {selectedAta.gravacao_fim ? new Date(selectedAta.gravacao_fim).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                        </span>
                      </div>

                      {selectedAta.gravacao_inicio && selectedAta.gravacao_fim && (
                        <div className="text-red-600 font-bold text-xs flex items-center gap-1 mt-1">
                          <span>Essa reunião teve duração de:</span>
                          <span className="text-sm">{calculateRealDuration(selectedAta.gravacao_inicio, selectedAta.gravacao_fim)}</span>
                        </div>
                      )}

                      {/* ✅ LISTA DE PRESENÇA (NOVO) */}
                      <div className="mt-3 bg-white border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                            <User size={14} /> Lista de Presença
                          </div>

                          <div className="text-[10px] font-black px-2 py-1 rounded-lg border bg-slate-50 text-slate-700 border-slate-200">
                            {loadingPresenca ? "Carregando..." : `Presentes: ${presenca.presentes.length}/${presenca.total}`}
                          </div>
                        </div>

                        {loadingPresenca ? (
                          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 size={14} className="animate-spin" /> Carregando presença...
                          </div>
                        ) : presenca.presentes.length === 0 ? (
                          <div className="mt-3 text-xs text-slate-400 italic">Nenhum presente registrado nesta reunião.</div>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {presenca.presentes.map((p, idx) => (
                              <span
                                key={`${p.nome}-${idx}`}
                                className="text-[11px] font-bold px-2 py-1 rounded-full border bg-green-50 text-green-800 border-green-200"
                                title={p.email || ""}
                              >
                                {p.nome}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* ✅ FIM PRESENÇA */}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handleGerarPDF} disabled={generatingPdf} className="p-2 bg-slate-100 rounded hover:bg-slate-200" title="Gerar PDF da ATA">
                      {generatingPdf ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    </button>

                    <button onClick={() => setIsEditing(!isEditing)} className="p-2 bg-slate-100 rounded hover:bg-slate-200" title="Editar">
                      <Edit3 size={18} />
                    </button>
                    <button onClick={handleDeleteClick} className="p-2 bg-slate-100 rounded hover:text-red-600" title="Excluir">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* VÍDEO */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                        <PlayCircle size={14} /> Gravação Compilada
                      </div>
                      {mediaUrls.video && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-500 font-mono border border-slate-200" title="Nome do arquivo no servidor">
                          <FileVideo size={10} /> {getFileName(selectedAta.gravacao_path)}
                        </div>
                      )}
                    </div>

                    {mediaUrls.video && (
                      <button
                        onClick={() => setIsVideoModalOpen(true)}
                        className="text-xs flex items-center gap-1 text-blue-600 font-bold hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-transparent hover:border-blue-100 transition-all"
                      >
                        <Maximize2 size={14} /> Modo Cinema
                      </button>
                    )}
                  </div>

                  {mediaUrls.video ? (
                    <div className="space-y-3">
                      <div className="relative group rounded-xl overflow-hidden bg-black shadow-lg border border-slate-200">
                        <video key={mediaUrls.video} className="w-full max-h-[400px] object-contain bg-black" preload="metadata" controls>
                          <source src={mediaUrls.video} type="video/webm" />
                          <source src={mediaUrls.video} type="video/mp4" />
                          Seu navegador não conseguiu reproduzir este vídeo.
                        </video>
                      </div>

                      <div className="flex justify-between items-center">
                        <a href={mediaUrls.video} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1">
                          <ExternalLink size={12} /> Baixar Vídeo
                        </a>

                        {isAdmin && (
                          <button
                            onClick={handleSolicitarVideo}
                            className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-1 border border-transparent hover:border-red-200 px-2 py-1 rounded transition-colors"
                            title="Admin: Refazer processamento"
                          >
                            <RefreshCw size={10} /> Refazer Compilação
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-center min-h-[200px]">
                        {String(selectedAta.gravacao_status || "").includes("PROCESSANDO") ? (
                          <>
                            <div className="p-4 bg-blue-100 rounded-full text-blue-600 animate-spin">
                              <Loader2 size={32} />
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-700">Processando Vídeo...</h4>
                              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">O GitHub está trabalhando na compressão. Aguarde...</p>
                            </div>
                          </>
                        ) : String(selectedAta.gravacao_status || "").includes("PENDENTE") ? (
                          <>
                            <div className="p-4 bg-amber-100 rounded-full text-amber-600 animate-pulse">
                              <Hourglass size={32} />
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-700">Na Fila de Espera</h4>
                              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">Solicitado! O Robô iniciará no próximo ciclo (máx 10min).</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="p-4 bg-slate-200 rounded-full text-slate-400">
                              <Video size={32} />
                            </div>
                            <p>Vídeo completo não disponível.</p>
                          </>
                        )}
                      </div>

                      {(isAdmin || !selectedAta.gravacao_status || selectedAta.gravacao_status === "ERRO") &&
                        !String(selectedAta.gravacao_status || "").includes("PROCESSANDO") && (
                          <button
                            onClick={handleSolicitarVideo}
                            disabled={requestingVideo || selectedAta.gravacao_status === "PENDENTE"}
                            className={`w-full py-4 rounded-xl shadow-lg flex items-center justify-center gap-3 font-bold text-sm transition-all transform active:scale-[0.98] ${
                              selectedAta.gravacao_status === "PENDENTE"
                                ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
                            }`}
                          >
                            {requestingVideo ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
                            {requestingVideo
                              ? "Solicitando..."
                              : selectedAta.gravacao_status === "PENDENTE"
                              ? "Aguarde o início..."
                              : "Gerar/Refazer Vídeo Completo"}
                          </button>
                        )}
                    </div>
                  )}
                </div>

                {/* ÁUDIO + IA */}
                <div className="mb-6">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                      <Headphones size={14} /> Player de Áudio
                    </div>

                    {/* ✅ NOVO: nome do arquivo do lado do player (igual a gravação) */}
                    {mediaUrls.audio && audioFileName && (
                      <div
                        className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-500 font-mono border border-slate-200"
                        title="Nome do arquivo no servidor"
                      >
                        <FileText size={10} /> {audioFileName}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      {mediaUrls.audio ? (
                        <CustomAudioPlayer src={mediaUrls.audio} durationDb={selectedAta.duracao_segundos} />
                      ) : (
                        <div className="p-3 bg-slate-50 border rounded text-xs text-slate-400">Sem áudio.</div>
                      )}
                    </div>

                    {mediaUrls.audio && !isEditing && (
                      <button
                        onClick={handleRegenerateIA}
                        disabled={isGenerating}
                        className="h-10 text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 disabled:opacity-50 hover:bg-indigo-200 transition-colors"
                      >
                        {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                        Gerar Resumo IA
                      </button>
                    )}
                  </div>
                </div>

                {/* ANEXOS */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                      <Paperclip size={14} /> Materiais e Anexos
                    </div>
                    <label
                      className={`cursor-pointer text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 flex items-center gap-2 transition-all ${
                        uploadingMaterial ? "opacity-50 pointer-events-none" : ""
                      }`}
                    >
                      {uploadingMaterial ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      {uploadingMaterial ? "Enviando..." : "Anexar Material"}
                      <input type="file" multiple className="hidden" onChange={handleUploadMaterial} disabled={uploadingMaterial} />
                    </label>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    {selectedAta.materiais && selectedAta.materiais.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {selectedAta.materiais.map((item, idx) => {
                          const isImage = item.type?.startsWith("image");
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between bg-white border border-slate-100 p-2 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isImage ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"}`}>
                                  {isImage ? <ImageIcon size={16} /> : <FileText size={16} />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate" title={item.name}>
                                    {item.name}
                                  </p>
                                  <p className="text-[10px] text-slate-400 uppercase">Anexo</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                >
                                  <Download size={16} />
                                </a>
                                <button
                                  onClick={() => handleDeleteMaterial(idx)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-slate-400 text-xs italic">Nenhum material anexado.</div>
                    )}
                  </div>
                </div>

                {/* PAUTA MARKDOWN */}
                <div className="mt-2">
                  {isEditing ? (
                    <textarea
                      className="w-full h-64 p-4 border rounded-xl bg-slate-50 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                      value={editedPauta}
                      onChange={(e) => setEditedPauta(e.target.value)}
                    />
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white/60 p-5">
                      {/* ✅ Este bloco é o que vai para o PDF */}
                      <div ref={ataExportRef} className="bg-white p-6">
                        {/* Cabeçalho (Título + Data + Hora + Duração + Presença) */}
                        <div className="mb-4">
                          <h1 className="text-2xl font-bold text-slate-900">{selectedAta.titulo}</h1>

                          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                            <span className="flex items-center gap-1.5">
                              <Calendar size={16} className="text-slate-400" />
                              {selectedAta.gravacao_inicio ? new Date(selectedAta.gravacao_inicio).toLocaleDateString("pt-BR") : "—"}
                            </span>

                            <span className="flex items-center gap-1.5">
                              <Clock size={16} className="text-slate-400" />
                              {selectedAta.gravacao_inicio ? new Date(selectedAta.gravacao_inicio).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}{" "}
                              -{" "}
                              {selectedAta.gravacao_fim ? new Date(selectedAta.gravacao_fim).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                            </span>
                          </div>

                          {selectedAta.gravacao_inicio && selectedAta.gravacao_fim && (
                            <div className="mt-2 text-red-600 font-bold text-sm">
                              Essa reunião teve duração de: {calculateRealDuration(selectedAta.gravacao_inicio, selectedAta.gravacao_fim)}
                            </div>
                          )}

                          {/* ✅ LISTA DE PRESENÇA (entra no PDF) */}
                          <div className="mt-4 bg-white border border-slate-200 rounded-lg p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <User size={14} /> Lista de Presença
                              </div>

                              <div className="text-[10px] font-black px-2 py-1 rounded-lg border bg-slate-50 text-slate-700 border-slate-200">
                                {loadingPresenca ? "Carregando..." : `Presentes: ${presenca.presentes.length}/${presenca.total}`}
                              </div>
                            </div>

                            {loadingPresenca ? (
                              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                                <Loader2 size={14} className="animate-spin" /> Carregando presença...
                              </div>
                            ) : presenca.presentes.length === 0 ? (
                              <div className="mt-3 text-xs text-slate-400 italic">Nenhum presente registrado nesta reunião.</div>
                            ) : (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {presenca.presentes.map((p, idx) => (
                                  <span
                                    key={`${p.nome}-${idx}`}
                                    className="text-[11px] font-bold px-2 py-1 rounded-full border bg-green-50 text-green-800 border-green-200"
                                    title={p.email || ""}
                                  >
                                    {p.nome}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ✅ Pauta / ATA IA (também entra no PDF) */}
                        <div className="mt-6">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-slate-900 mb-4" {...props} />,
                              h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-blue-700 mt-6 mb-3" {...props} />,
                              p: ({ node, ...props }) => <p className="text-slate-700 text-sm leading-relaxed mb-3" {...props} />,
                              ul: ({ node, ...props }) => <ul className="space-y-2 ml-4 mb-4" {...props} />,
                              li: ({ node, ...props }) => (
                                <li className="flex items-start gap-2 text-slate-700 text-sm">
                                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                                  <span {...props} />
                                </li>
                              ),
                            }}
                          >
                            {formatAtaMarkdown(selectedAta.pauta || "", {
                              titulo: selectedAta.titulo || "Ata da Reunião",
                              dataBR: selectedAta.data_hora ? new Date(selectedAta.data_hora).toLocaleDateString("pt-BR") : "",
                            }) || "Sem resumo."}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* AÇÕES / ATA MANUAL */}
              </div>

              {/* AÇÕES / ATA MANUAL (mantive igual ao seu código) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div> Ações Definidas
                    </h3>
                    <button
                      onClick={handleNovaAcao}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-md transition-all active:scale-95"
                    >
                      <Plus size={14} /> Nova Ação
                    </button>
                  </div>
                  <div className="flex-1 space-y-2">
                    {acoesCriadas.map((acao) => (
                      <div
                        key={acao.id}
                        onClick={() => setAcaoParaModal(acao)}
                        className={`p-3 border rounded-lg cursor-pointer hover:shadow-md transition-all group ${
                          acao.status === "Concluída" ? "bg-slate-50 opacity-60" : "bg-white border-slate-200 hover:border-blue-300"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-1.5 w-2 h-2 rounded-full ${acao.status === "Concluída" ? "bg-green-500" : "bg-blue-500"}`} />
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${acao.status === "Concluída" ? "line-through text-slate-400" : "text-slate-800"}`}>{acao.descricao}</p>
                            <div className="flex flex-wrap items-center gap-3 mt-1.5">
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <User size={10} /> {acao.responsavel}
                              </span>
                              {acao.data_vencimento && (
                                <span className="text-[10px] text-red-500 flex items-center gap-1">
                                  <Clock size={10} /> {new Date(acao.data_vencimento).toLocaleDateString()}
                                </span>
                              )}
                              {acao.fotos && acao.fotos.length > 0 && (
                                <span className="text-[10px] text-blue-500 flex items-center gap-1">
                                  <ImageIcon size={10} /> {acao.fotos.length}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {acoesCriadas.length === 0 && <p className="text-center text-xs text-slate-400 py-4 italic">Nenhuma ação criada.</p>}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 bg-amber-500 rounded-full"></div> Pendências Anteriores
                  </h3>
                  <div className="flex-1 space-y-2">
                    {acoesAnteriores.map((acao) => (
                      <div
                        key={acao.id}
                        onClick={() => setAcaoParaModal(acao)}
                        className="p-3 bg-amber-50/30 border border-amber-100 rounded-lg cursor-pointer hover:bg-amber-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-1.5 w-2 h-2 rounded-full bg-amber-500" />
                          <div>
                            <p className="text-sm font-medium text-slate-800">{acao.descricao}</p>
                            <p className="text-[10px] text-amber-600 mt-1">Origem: {acao.data_criacao ? new Date(acao.data_criacao).toLocaleDateString() : "-"}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {acoesAnteriores.length === 0 && <p className="text-center text-xs text-slate-400 py-4 italic">Tudo em dia!</p>}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <StickyNote size={18} /> Ata Manual / Observações
                </h3>
                <textarea
                  className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm outline-none"
                  value={ataManual}
                  onChange={(e) => setAtaManual(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Notas manuais da reunião escritas no Copiloto..."
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Layers size={64} className="opacity-20 mb-4" />
              <p>Selecione uma Ata</p>
            </div>
          )}
        </div>

        {/* MODAL */}
        {acaoParaModal && (
          <ModalDetalhesAcao
            aberto={!!acaoParaModal}
            acao={acaoParaModal}
            status={acaoParaModal.status}
            onClose={() => setAcaoParaModal(null)}
            onAfterSave={() => carregarDetalhes(selectedAta)}
            onAfterDelete={() => carregarDetalhes(selectedAta)}
            onConcluir={async () => {
              await supabase.from("acoes").update({ status: "Concluída", data_conclusao: new Date().toISOString() }).eq("id", acaoParaModal.id);
              carregarDetalhes(selectedAta);
            }}
          />
        )}
      </div>
    </Layout>
  );
}
