// src/components/tatico/ModalNovaAcao.jsx
// Cria uma ação a partir da Central de Ações, já alocada em uma reunião.
// Grava no mesmo formato do Copiloto, para a ação aparecer lá (na reunião e
// nas pendências do tipo de reunião).
import React, { useEffect, useMemo, useState } from "react";
import { supabase, supabaseInove } from "../../supabaseClient";
import { X, Search, Calendar, User, Paperclip, Loader2 } from "lucide-react";

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

  useEffect(() => {
    if (!aberto) return;

    setForm(FORM_VAZIO);
    setArquivos([]);
    setResponsavel(null);
    setRespQuery("");
    setReuniao(null);
    setReuniaoQuery("");

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

  // Próximas reuniões primeiro; as que já passaram vão para o fim (mais recentes antes)
  const reunioesFiltradas = useMemo(() => {
    const q = reuniaoQuery.trim().toLowerCase();
    const agora = nowIso();
    const lista = reunioes.filter((r) => {
      if (!q) return true;
      return (
        String(r.titulo || "").toLowerCase().includes(q) ||
        String(nomeTipo(r)).toLowerCase().includes(q)
      );
    });
    const futuras = lista.filter((r) => String(r.data_hora || "") >= agora);
    const passadas = lista.filter((r) => String(r.data_hora || "") < agora).reverse();
    return [...futuras, ...passadas];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reunioes, reuniaoQuery, tiposMap]);

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
    if (!responsavel) return alert("Selecione o responsável.");
    if (!vencimento) return alert("Informe o vencimento.");
    if (!reuniao) return alert("Selecione a reunião onde a ação será alocada.");

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

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Nova Ação</h2>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nome da ação *</label>
            <input
              className={inputCls}
              value={form.descricao}
              onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
              placeholder="O que precisa ser feito"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Observação</label>
            <textarea
              className={inputCls}
              rows={3}
              value={form.observacao}
              onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Responsável *</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className={`${inputCls} pl-8`}
                  value={respQuery}
                  onChange={(e) => {
                    setRespQuery(e.target.value);
                    setResponsavel(null);
                    setRespOpen(true);
                  }}
                  onFocus={() => setRespOpen(true)}
                  onBlur={() => setTimeout(() => setRespOpen(false), 150)}
                  placeholder="Digite 2 letras para buscar"
                />
              </div>
              {respOpen && responsaveisFiltrados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
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
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                    >
                      <div className="font-semibold">{buildNomeSobrenome(u)}</div>
                      <div className="text-xs text-gray-500">{u.login || u.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Vencimento *</label>
              <input
                type="date"
                className={inputCls}
                value={form.vencimento}
                onChange={(e) => setForm((p) => ({ ...p, vencimento: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Reunião *</label>
            {reuniao ? (
              <div className="flex items-center justify-between border border-blue-300 bg-blue-50 rounded-lg px-3 py-2">
                <div className="text-sm">
                  <div className="font-semibold text-gray-800">{reuniao.titulo || "(sem título)"}</div>
                  <div className="text-xs text-gray-600 flex items-center gap-1">
                    <Calendar size={12} /> {toBRDateTime(reuniao.data_hora)}
                    {nomeTipo(reuniao) && <span>· {nomeTipo(reuniao)}</span>}
                  </div>
                </div>
                <button type="button" onClick={() => setReuniao(null)} className="text-xs font-bold text-blue-700 hover:underline">
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className={`${inputCls} pl-8`}
                    value={reuniaoQuery}
                    onChange={(e) => setReuniaoQuery(e.target.value)}
                    placeholder="Buscar por título ou tipo de reunião"
                  />
                </div>
                <div className="border border-gray-200 rounded-lg max-h-56 overflow-auto divide-y divide-gray-100">
                  {loadingReunioes ? (
                    <div className="p-4 text-sm text-gray-500 flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Carregando reuniões...
                    </div>
                  ) : reunioesFiltradas.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">Nenhuma reunião encontrada.</div>
                  ) : (
                    reunioesFiltradas.map((r) => {
                      const passada = String(r.data_hora || "") < nowIso();
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setReuniao(r)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50"
                        >
                          <div className="text-sm font-semibold text-gray-800">{r.titulo || "(sem título)"}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Calendar size={12} /> {toBRDateTime(r.data_hora)}
                            {nomeTipo(r) && <span>· {nomeTipo(r)}</span>}
                            {passada && <span className="ml-1 text-gray-400">(já realizada)</span>}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Mostrando reuniões dos últimos {DIAS_PASSADO} dias e dos próximos {DIAS_FUTURO} dias.
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Evidências (opcional)</label>
            <label className="flex items-center gap-2 text-sm text-blue-700 font-semibold cursor-pointer w-fit">
              <Paperclip size={14} /> Anexar arquivos
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setArquivos((p) => [...p, ...files]);
                  e.target.value = "";
                }}
              />
            </label>
            {arquivos.length > 0 && (
              <ul className="mt-2 space-y-1">
                {arquivos.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setArquivos((p) => p.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-60 flex items-center gap-2"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            {salvando ? "Salvando..." : "Criar ação"}
          </button>
        </div>
      </div>
    </div>
  );
}
