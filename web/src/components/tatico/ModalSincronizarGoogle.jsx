import { useEffect, useMemo, useState } from "react";
import { X, Check, AlertCircle, Mail, Loader2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { sincronizarLoteReunioesGoogle } from "../../services/googleCalendarSync";

function GoogleLogo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5c3.3 6.4 10 10 17.8 10z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2C40.9 35.6 44 30.3 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function InoveMark() {
  return (
    <div className="h-9 px-3 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
      <span className="text-[11px] font-black tracking-[0.18em]">INOVE</span>
    </div>
  );
}

function getUsuarioLogado() {
  try {
    const raw = localStorage.getItem("usuario_externo");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function agoraLocalIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function ModalSincronizarGoogle({ aberto, onClose, tipos = [] }) {
  const usuario = useMemo(() => getUsuarioLogado(), [aberto]);
  const usuarioId = usuario?.id;

  const [email, setEmail] = useState("");
  const [tiposMarcados, setTiposMarcados] = useState({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  useEffect(() => {
    if (!aberto || !usuarioId) return;
    let cancel = false;
    setCarregando(true);
    setMensagem(null);
    (async () => {
      const { data, error } = await supabase
        .from("agenda_assinantes_google")
        .select("tipo_reuniao_id, google_email")
        .eq("usuario_id", usuarioId);
      if (cancel) return;
      if (!error && data?.length) {
        setEmail(data[0].google_email || "");
        const marcados = {};
        data.forEach((r) => {
          marcados[String(r.tipo_reuniao_id)] = true;
        });
        setTiposMarcados(marcados);
      } else if (!error) {
        setEmail(usuario?.email || "");
        setTiposMarcados({});
      }
      setCarregando(false);
    })();
    return () => {
      cancel = true;
    };
  }, [aberto, usuarioId, usuario?.email]);

  const tiposOrdenados = useMemo(
    () =>
      [...(tipos || [])].sort((a, b) =>
        String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR")
      ),
    [tipos]
  );

  const toggle = (id) =>
    setTiposMarcados((cur) => ({ ...cur, [String(id)]: !cur[String(id)] }));

  const marcarTodos = () => {
    const next = {};
    tiposOrdenados.forEach((t) => {
      next[String(t.id)] = true;
    });
    setTiposMarcados(next);
  };

  const desmarcarTodos = () => setTiposMarcados({});

  const salvar = async () => {
    setMensagem(null);
    if (!usuarioId) {
      setMensagem({ tipo: "erro", texto: "Usuário não identificado. Faça login de novo." });
      return;
    }
    const emailLimpo = String(email || "").trim().toLowerCase();
    if (!emailLimpo.includes("@")) {
      setMensagem({ tipo: "erro", texto: "Informe um email Google válido." });
      return;
    }
    const ids = Object.keys(tiposMarcados).filter((k) => tiposMarcados[k]);

    setSalvando(true);
    try {
      // limpa assinaturas que o usuário tirou
      const { error: errDel } = await supabase
        .from("agenda_assinantes_google")
        .delete()
        .eq("usuario_id", usuarioId);
      if (errDel) throw errDel;

      let reunioesSincronizadas = 0;
      let reunioesFalhas = 0;
      let erroSincronizacao = "";
      if (ids.length) {
        const rows = ids.map((tipoId) => ({
          usuario_id: usuarioId,
          google_email: emailLimpo,
          tipo_reuniao_id: tipoId,
        }));
        const { error: errIns } = await supabase
          .from("agenda_assinantes_google")
          .insert(rows);
        if (errIns) throw errIns;

        const { data: futuras, error: errFuturas } = await supabase
          .from("reunioes")
          .select("id")
          .in("tipo_reuniao_id", ids)
          .gte("data_hora", agoraLocalIso())
          .order("data_hora", { ascending: true });
        if (errFuturas) throw errFuturas;

        const idsParaSync = (futuras || []).map((r) => r.id);
        if (idsParaSync.length) {
          const resultado = await sincronizarLoteReunioesGoogle(idsParaSync);
          reunioesSincronizadas = resultado.synced;
          reunioesFalhas = resultado.failed;
          erroSincronizacao = resultado.firstError || "";
        }
      }

      setMensagem({
        tipo: "ok",
        texto: ids.length
          ? `Assinatura salva. ${reunioesSincronizadas} reunião(ões) futura(s) enviada(s) para ${emailLimpo}.${reunioesFalhas ? ` ${reunioesFalhas} falharam: ${erroSincronizacao || "tente de novo em instantes"}.` : ""} Próximas mudanças também chegam por convite.`
          : "Você se desinscreveu de todos os tipos.",
      });
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e?.message || String(e) });
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                <GoogleLogo size={22} />
              </div>
              <div className="h-px w-5 bg-slate-300" />
              <InoveMark />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                Integração
              </div>
              <div className="text-base font-black text-slate-800">
                Sincronizar com Google Agenda
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={salvando}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <label className="text-[11px] uppercase font-bold text-slate-500 flex items-center gap-2 mb-1.5">
            <Mail size={12} /> Seu email do Google
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@gmail.com"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[11px] text-slate-500 mt-1.5">
            Vamos enviar convite para esse email toda vez que uma reunião dos
            tipos marcados for criada, editada ou cancelada.
          </p>
        </div>

        <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-sm font-extrabold text-slate-700">
            Tipos de reunião que quero receber
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={marcarTodos}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
            >
              Marcar todos
            </button>
            <button
              type="button"
              onClick={desmarcarTodos}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
            >
              Desmarcar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {carregando ? (
            <div className="text-sm text-slate-500 text-center py-6">Carregando…</div>
          ) : tiposOrdenados.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-6">
              Nenhum tipo de reunião cadastrado ainda.
            </div>
          ) : (
            tiposOrdenados.map((t) => {
              const marcado = !!tiposMarcados[String(t.id)];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition ${
                    marcado
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                      marcado
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-slate-300"
                    }`}
                  >
                    {marcado && <Check size={14} />}
                  </span>
                  <span className="flex-1 text-sm font-bold text-slate-800">
                    {t.nome || `Tipo ${t.id}`}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {mensagem && (
          <div
            className={`mx-6 mb-3 rounded-xl px-3 py-2 text-xs flex items-start gap-2 ${
              mensagem.tipo === "ok"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                : "bg-rose-50 border border-rose-200 text-rose-900"
            }`}
          >
            {mensagem.tipo === "ok" ? (
              <Check size={14} className="mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            )}
            <span>{mensagem.texto}</span>
          </div>
        )}

        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/60">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="px-4 py-2 rounded-xl text-sm font-black bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-80 inline-flex items-center gap-2"
          >
            {salvando && <Loader2 size={15} className="animate-spin" />}
            {salvando ? "Sincronizando..." : "Salvar"}
          </button>
        </div>

        {salvando && (
          <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-sm flex items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl p-5 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm">
                  <GoogleLogo size={28} />
                </div>
                <Loader2 size={20} className="animate-spin text-emerald-600" />
                <InoveMark />
              </div>
              <div className="text-sm font-black text-slate-800">
                Sincronizando agenda
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Criando eventos no Google Agenda e vinculando ao Farol.
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full w-1/2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
