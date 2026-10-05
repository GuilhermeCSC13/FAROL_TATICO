// src/components/tatico/ModalNovaAcao.jsx
// Cria uma ação a partir da Central de Ações, já alocada em uma reunião.
// Grava no mesmo formato do Copiloto, para a ação aparecer lá (na reunião e
// nas pendências do tipo de reunião). Visual segue o ModalDetalhesAcao.
import React, { useEffect, useMemo, useState } from "react";
import { supabase, supabaseInove } from "../../supabaseClient";
import {
  X,
  Search,
  Calendar,
  User,
  Loader2,
  UploadCloud,
  Clipboard,
  FileText,
  ChevronDown,
  CheckCircle,
} from "lucide-react";

const DIAS_PASSADO = 30;
const DIAS_FUTURO = 60;

function nowIso() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 19);
}

function isoDateOffset(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// reunioes.data_hora é gravado como horário local sem fuso (mesma leitura do Copiloto)
function toBRDateTime(dt) {
  try {
    if (!dt) return "-";
    return new Date(dt).toLocaleString("pt-BR", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
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

const FORM_VAZIO = { descricao: "", observacao: "", vencimento: "" };

export default function ModalNovaAcao({ aberto, onClose, onCreated }) {
  const [form, setForm] = useState(FORM_VAZIO);
  const [arquivos, setArquivos] = useState([]);
  const [salvando, setSalvando] = useState(false);

  // Responsável
  const [listaResponsaveis, setListaResponsaveis] = useState([]);
  const [responsavel, setResponsavel] = useState(null);
  const [respQuery, setRespQuery] = useState("");
  const [respOpen, setRespOpen] = useState(false);

  // Reunião
  const [reunioes, setReunioes] = useState([]);
  const [tiposMap, setTiposMap] = useState({});
  const [loadingReunioes, setLoadingReunioes] = useState(false);
  const [reuniaoQuery, setReuniaoQuery] = useState("");
  const [reuniao, setReuniao] = useState(null);
  const [reuniaoOpen, setReuniaoOpen] = useState(false);

  useEffect(() => {
    if (!aberto) return;

    setForm(FORM_VAZIO);
    setArquivos([]);
    setResponsavel(null);
    setRespQuery("");
    setReuniao(null);
    setReuniaoQuery("");
    setReuniaoOpen(false);

    (async () => {
      const { data, error } = await supabaseInove
        .from("usuarios_aprovadores")
        .select("id, nome, sobrenome, nome_completo, login, email, ativo")
        .eq("ativo", true)
        .order("nome_completo", { ascending: true });
      if (error) console.error("ModalNovaAcao responsaveis:", error);
      setListaResponsaveis(data || []);
    })();

    (async () => {
      setLoadingReunioes(true);
      try {
        const { data, error } = await supabase
          .from("reunioes")
          .select("id, titulo, data_hora, status, tipo_reuniao_id, tipo_reuniao")
          .gte("data_hora", `${isoDateOffset(-DIAS_PASSADO)}T00:00:00`)
          .lte("data_hora", `${isoDateOffset(DIAS_FUTURO)}T23:59:59`)
          .order("data_hora", { ascending: true });
        if (error) throw error;
        setReunioes(data || []);

        const { data: tipos } = await supabase.from("tipos_reuniao").select("id, nome");
        const map = {};
        (tipos || []).forEach((t) => {
          map[t.id] = t.nome;
        });
        setTiposMap(map);
      } catch (e) {
        console.error("ModalNovaAcao reunioes:", e);
        setReunioes([]);
      } finally {
        setLoadingReunioes(false);
      }
    })();
  }, [aberto]);

  const responsaveisFiltrados = useMemo(() => {
    const q = respQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return listaResponsaveis
      .filter((u) => {
        const nome = buildNomeSobrenome(u).toLowerCase();
        const login = String(u?.login || "").toLowerCase();
        const email = String(u?.email || "").toLowerCase();
        return nome.includes(q) || login.includes(q) || (email && email.includes(q));
      })
      .slice(0, 10);
  }, [respQuery, listaResponsaveis]);

  const nomeTipo = (r) => (r?.tipo_reuniao_id && tiposMap[r.tipo_reuniao_id]) || r?.tipo_reuniao || "";

  // Próximas (mais perto primeiro) e já realizadas (mais recentes primeiro)
  const { futuras, passadas } = useMemo(() => {
    const q = reuniaoQuery.trim().toLowerCase();
    const agora = nowIso();
    const lista = reunioes.filter((r) => {
      if (!q) return true;
      return (
        String(r.titulo || "").toLowerCase().includes(q) ||
        String(nomeTipo(r)).toLowerCase().includes(q)
      );
    });
    return {
      futuras: lista.filter((r) => String(r.data_hora || "") >= agora),
      passadas: lista.filter((r) => String(r.data_hora || "") < agora).reverse(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reunioes, reuniaoQuery, tiposMap]);

  const previews = useMemo(
    () =>
      arquivos.map((f, idx) => ({
        idx,
        name: f.name,
        url: String(f.type || "").startsWith("image/") ? URL.createObjectURL(f) : null,
      })),
    [arquivos]
  );

  useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews]);

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        files.push(new File([blob], `print_${Date.now()}_${i}.png`, { type: blob.type }));
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      setArquivos((p) => [...p, ...files]);
    }
  };

  const uploadEvidencias = async (acaoId, files) => {
    const urls = [];
    for (const file of files) {
      const fileName = `acao-${acaoId}-${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error } = await supabase.storage.from("evidencias").upload(fileName, file, { upsert: false });
      if (error) {
        console.error("Erro upload evidência:", error);
        continue;
      }
      const { data: urlData } = supabase.storage.from("evidencias").getPublicUrl(fileName);
      if (urlData?.publicUrl) urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const salvar = async () => {
    if (salvando) return;

    const descricao = form.descricao.trim();
    const observacao = form.observacao.trim();
    const vencimento = form.vencimento.trim();

    if (!descricao) return alert("Informe o Nome da Ação (Descrição).");
    if (!reuniao) return alert("Selecione a reunião onde a ação será alocada.");
    if (!responsavel) return alert("Selecione o responsável.");
    if (!vencimento) return alert("Informe o vencimento.");

    setSalvando(true);
    try {
      let criadorId = null;
      let criadorNome = "Sistema";
      const storedUser = localStorage.getItem("usuario_externo");
      if (storedUser) {
        try {
          const u = JSON.parse(storedUser);
          criadorId = u.id;
          criadorNome = buildNomeSobrenome(u) || u.login || u.email || "Usuário";
        } catch (e) {
          console.error("Erro ao ler criador do localStorage", e);
        }
      }

      const responsavelNome = buildNomeSobrenome(responsavel);

      const payload = {
        descricao,
        observacao,
        status: "Aberta",
        reuniao_id: reuniao.id,
        tipo_reuniao_id: reuniao.tipo_reuniao_id || null,
        tipo_reuniao: nomeTipo(reuniao) || "Geral",

        responsavel_id: null,
        responsavel_aprovador_id: responsavel.id ?? null,
        responsavel_nome: responsavelNome,
        responsavel: responsavelNome,

        criado_por_aprovador_id: criadorId,
        criado_por_nome: criadorNome,

        data_vencimento: vencimento,
        data_abertura: nowIso().slice(0, 10),

        created_at: nowIso(),
        data_criacao: nowIso(),

        fotos_acao: [],
        fotos: [],
        evidencia_url: null,
      };

      const { data, error } = await supabase.from("acoes").insert([payload]).select("*");
      if (error) throw new Error("Erro ao criar ação: " + (error.message || error));

      const acaoId = data?.[0]?.id;
      if (!acaoId) throw new Error("Erro: ação criada sem ID.");

      if (arquivos.length > 0) {
        const urls = await uploadEvidencias(acaoId, arquivos);
        if (!urls.length) {
          alert("A ação foi criada, mas não foi possível enviar as evidências.");
        } else {
          const { error: e2 } = await supabase
            .from("acoes")
            .update({ fotos_acao: urls, fotos: urls, evidencia_url: urls[0] || null })
            .eq("id", acaoId);
          if (e2) alert("Ação criada, mas houve erro ao vincular os arquivos: " + e2.message);
        }
      }

      onCreated?.(acaoId);
      onClose?.();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;

  const inputInfo =
    "border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 w-full";

  const LinhaReuniao = ({ r }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        setReuniao(r);
        setReuniaoOpen(false);
        setReuniaoQuery("");
      }}
      className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0"
    >
      <div className="text-sm font-semibold text-gray-800 truncate">{r.titulo || "(sem título)"}</div>
      <div className="text-[11px] text-gray-500 flex items-center gap-1">
        <Calendar size={11} /> {toBRDateTime(r.data_hora)}
        {nomeTipo(r) && nomeTipo(r) !== r.titulo && <span className="truncate">· {nomeTipo(r)}</span>}
      </div>
    </button>
  );

  const GrupoTitulo = ({ children }) => (
    <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase bg-gray-50 sticky top-0">
      {children}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
          <div className="flex-1">
            <label className="text-xs font-semibold uppercase text-gray-400 block mb-1">Nova ação</label>
            <input
              type="text"
              autoFocus
              value={form.descricao}
              onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
              placeholder="Digite o nome da ação..."
              className="w-full text-sm sm:text-base font-semibold text-gray-800 bg-blue-50/40 border border-slate-200 hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all rounded-lg px-3 py-2"
            />
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-6 bg-gray-50">
          {/* INFO */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm space-y-4">
            {/* Reunião */}
            <div className="flex flex-col relative">
              <span className="text-[11px] font-bold text-gray-400 uppercase mb-1">Reunião</span>
              {reuniao ? (
                <div className="flex items-center justify-between gap-3 border border-blue-200 bg-blue-50/60 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{reuniao.titulo || "(sem título)"}</div>
                    <div className="text-[11px] text-gray-500 flex items-center gap-1">
                      <Calendar size={11} /> {toBRDateTime(reuniao.data_hora)}
                      {nomeTipo(reuniao) && nomeTipo(reuniao) !== reuniao.titulo && (
                        <span className="truncate">· {nomeTipo(reuniao)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReuniao(null);
                      setReuniaoOpen(true);
                    }}
                    className="text-[11px] font-semibold text-blue-700 hover:bg-blue-100 px-2 py-1 rounded-md shrink-0"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={reuniaoQuery}
                      onChange={(e) => {
                        setReuniaoQuery(e.target.value);
                        setReuniaoOpen(true);
                      }}
                      onFocus={() => setReuniaoOpen(true)}
                      onBlur={() => setTimeout(() => setReuniaoOpen(false), 150)}
                      placeholder={loadingReunioes ? "Carregando reuniões..." : "Selecione ou busque a reunião..."}
                      className={`${inputInfo} pl-8 pr-8`}
                    />
                    <ChevronDown
                      size={14}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    />
                  </div>
                  {reuniaoOpen && (
                    <div className="absolute top-[58px] left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                      {loadingReunioes ? (
                        <div className="p-3 text-xs text-gray-500 flex items-center gap-2">
                          <Loader2 size={12} className="animate-spin" /> Carregando...
                        </div>
                      ) : futuras.length + passadas.length === 0 ? (
                        <div className="p-3 text-xs text-gray-500">Nenhuma reunião encontrada.</div>
                      ) : (
                        <>
                          {futuras.length > 0 && <GrupoTitulo>Próximas</GrupoTitulo>}
                          {futuras.map((r) => (
                            <LinhaReuniao key={r.id} r={r} />
                          ))}
                          {passadas.length > 0 && <GrupoTitulo>Já realizadas</GrupoTitulo>}
                          {passadas.map((r) => (
                            <LinhaReuniao key={r.id} r={r} />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col relative">
                <span className="text-[11px] font-bold text-gray-400 uppercase mb-1">Responsável</span>
                <div className="relative">
                  <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={respQuery}
                    onChange={(e) => {
                      setRespQuery(e.target.value);
                      setResponsavel(null);
                      setRespOpen(true);
                    }}
                    onFocus={() => setRespOpen(true)}
                    onBlur={() => setTimeout(() => setRespOpen(false), 150)}
                    placeholder="Nome do responsável..."
                    className={`${inputInfo} pl-8`}
                  />
                </div>
                {respOpen && responsaveisFiltrados.length > 0 && (
                  <div className="absolute top-[58px] left-0 w-full bg-white border border-gray-200 rounded shadow-lg z-20 max-h-48 overflow-y-auto">
                    {responsaveisFiltrados.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setResponsavel(u);
                          setRespQuery(buildNomeSobrenome(u));
                          setRespOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <div className="font-semibold text-gray-800">{buildNomeSobrenome(u)}</div>
                        {(u.login || u.email) && <div className="text-[10px] text-gray-400">{u.login || u.email}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-gray-400 uppercase mb-1">Vencimento</span>
                <input
                  type="date"
                  value={form.vencimento}
                  onChange={(e) => setForm((p) => ({ ...p, vencimento: e.target.value }))}
                  className={inputInfo}
                />
              </div>
            </div>
          </div>

          {/* DESCRIÇÃO E EVIDÊNCIAS */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Descrição e Evidências Iniciais</h3>
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 shadow-sm">
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase">Observações da Ação</span>
                <textarea
                  className="mt-1 w-full border border-gray-300 rounded-lg text-sm p-3 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  rows={3}
                  value={form.observacao}
                  onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
                  placeholder="Descreva detalhes..."
                />
              </div>

              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase block mb-2">Anexos (Abertura)</span>
                <div className="space-y-2">
                  <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed border-blue-200 rounded-lg cursor-pointer bg-blue-50/50 hover:bg-blue-50 transition-colors group">
                    <div className="flex flex-row items-center gap-2">
                      <UploadCloud className="w-5 h-5 text-blue-400 group-hover:text-blue-600" />
                      <p className="text-xs text-gray-500">
                        <span className="font-semibold text-blue-600">Carregar arquivo do PC</span>
                      </p>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.html,.htm"
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setArquivos((p) => [...p, ...files]);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  <div className="relative">
                    <textarea
                      rows={1}
                      value=""
                      onChange={() => {}}
                      onPaste={handlePaste}
                      className="w-full border border-dashed border-slate-300 rounded-lg p-2 text-xs text-center focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none placeholder:text-slate-400"
                      placeholder="Clique aqui e pressione Ctrl+V para colar um print..."
                    />
                    <Clipboard className="absolute right-3 top-2.5 text-slate-300 pointer-events-none" size={14} />
                  </div>

                  {previews.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Prontos para envio:</div>
                      <div className="flex flex-wrap gap-3">
                        {previews.map((p) => (
                          <div
                            key={`${p.idx}-${p.name}`}
                            className="relative w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden"
                            title={p.name}
                          >
                            {p.url ? (
                              <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1">
                                <FileText size={20} className="text-gray-400" />
                                <span className="text-[9px] text-gray-500 truncate w-full text-center">{p.name}</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setArquivos((prev) => prev.filter((_, j) => j !== p.idx))}
                              className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-gray-500 hover:text-red-600 shadow"
                              title="Remover"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[11px] text-amber-600 font-medium">
            ! Nome, reunião, responsável e vencimento são obrigatórios.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="px-6 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all transform hover:-translate-y-0.5 disabled:opacity-60 disabled:transform-none"
            >
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {salvando ? "Criando..." : "Criar Ação"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
