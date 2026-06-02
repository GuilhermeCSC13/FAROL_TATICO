import { useEffect, useMemo, useState } from "react";
import { X, RefreshCw, LogOut, Check, AlertCircle } from "lucide-react";
import {
  ensureGoogleToken,
  clearGoogleToken,
  getStoredGoogleEmail,
  isGoogleConnected,
  syncReunioesToGoogle,
} from "../../utils/googleCalendar";

const PERIODOS = [
  { id: "30", label: "Próximos 30 dias", days: 30 },
  { id: "60", label: "Próximos 60 dias", days: 60 },
  { id: "90", label: "Próximos 90 dias", days: 90 },
  { id: "365", label: "Próximos 12 meses", days: 365 },
];

// Logo Google em SVG inline
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

export default function ModalSincronizarGoogle({ aberto, onClose, reunioes = [], tipos = [] }) {
  const [conectado, setConectado] = useState(false);
  const [email, setEmail] = useState(null);
  const [conectando, setConectando] = useState(false);
  const [tiposSelecionados, setTiposSelecionados] = useState({});
  const [periodoId, setPeriodoId] = useState("30");
  const [sincronizando, setSincronizando] = useState(false);
  const [progresso, setProgresso] = useState({ done: 0, total: 0 });
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (!aberto) return;
    setConectado(isGoogleConnected());
    setEmail(getStoredGoogleEmail());
    setResultado(null);
    setProgresso({ done: 0, total: 0 });
  }, [aberto]);

  // Contadores por tipo (no período escolhido)
  const periodo = PERIODOS.find((p) => p.id === periodoId) || PERIODOS[0];
  const limite = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + periodo.days);
    return d.getTime();
  }, [periodo.days]);

  const reunioesNoPeriodo = useMemo(() => {
    const agora = Date.now();
    return (reunioes || []).filter((r) => {
      const t = new Date(r.horario_inicio || r.data_hora).getTime();
      if (!t || Number.isNaN(t)) return false;
      return t >= agora && t <= limite && String(r.status || "").toLowerCase() !== "cancelada";
    });
  }, [reunioes, limite]);

  const contagemPorTipo = useMemo(() => {
    const m = new Map();
    reunioesNoPeriodo.forEach((r) => {
      const tid = String(r.tipo_reuniao_id || "");
      m.set(tid, (m.get(tid) || 0) + 1);
    });
    return m;
  }, [reunioesNoPeriodo]);

  const tiposComReunioes = useMemo(() => {
    return (tipos || [])
      .map((t) => ({ ...t, qtd: contagemPorTipo.get(String(t.id)) || 0 }))
      .sort((a, b) => b.qtd - a.qtd || (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  }, [tipos, contagemPorTipo]);

  const totalSelecionado = useMemo(() => {
    return reunioesNoPeriodo.filter((r) => tiposSelecionados[String(r.tipo_reuniao_id)]).length;
  }, [reunioesNoPeriodo, tiposSelecionados]);

  const tiposById = useMemo(() => {
    const o = {};
    (tipos || []).forEach((t) => (o[t.id] = t));
    return o;
  }, [tipos]);

  const handleConectar = async () => {
    setConectando(true);
    try {
      const token = await ensureGoogleToken({ forcePrompt: true });
      setConectado(true);
      setEmail(token.email);
    } catch (e) {
      alert("Falha ao conectar com o Google: " + (e.message || e));
    } finally {
      setConectando(false);
    }
  };

  const handleTrocarConta = () => {
    clearGoogleToken();
    setConectado(false);
    setEmail(null);
  };

  const handleToggleTipo = (id) => {
    setTiposSelecionados((s) => ({ ...s, [String(id)]: !s[String(id)] }));
  };

  const handleSelecionarTodos = () => {
    const next = {};
    tiposComReunioes.forEach((t) => {
      if (t.qtd > 0) next[String(t.id)] = true;
    });
    setTiposSelecionados(next);
  };

  const handleSincronizar = async () => {
    const lista = reunioesNoPeriodo.filter((r) => tiposSelecionados[String(r.tipo_reuniao_id)]);
    if (!lista.length) {
      alert("Selecione pelo menos um tipo de reunião com eventos no período.");
      return;
    }
    setSincronizando(true);
    setProgresso({ done: 0, total: lista.length });
    setResultado(null);
    try {
      const res = await syncReunioesToGoogle(lista, tiposById, (p) => setProgresso(p));
      setResultado(res);
    } catch (e) {
      setResultado({ total: lista.length, okCount: 0, errCount: lista.length, errors: [{ error: e.message }] });
    } finally {
      setSincronizando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GoogleLogo size={22} />
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                Integração
              </div>
              <div className="text-base font-black text-slate-800">Sincronizar com Google Agenda</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        {/* Conta conectada / desconectada */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 text-sm">
          {conectado ? (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <Check size={16} className="text-emerald-600 flex-none" />
                <span className="text-slate-600">Conectado como</span>
                <span className="font-bold text-slate-800 truncate">{email || "Conta Google"}</span>
              </div>
              <button
                onClick={handleTrocarConta}
                className="text-xs font-bold text-slate-500 hover:text-red-600 flex items-center gap-1"
              >
                <LogOut size={12} /> Trocar conta
              </button>
            </>
          ) : (
            <>
              <div className="text-slate-600">Conecte sua conta Google para sincronizar.</div>
              <button
                onClick={handleConectar}
                disabled={conectando}
                className="bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50 rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-2 transition disabled:opacity-60"
              >
                <GoogleLogo size={14} />
                {conectando ? "Conectando..." : "Conectar Google"}
              </button>
            </>
          )}
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Período */}
          <div>
            <label className="text-xs font-extrabold uppercase text-slate-500 block mb-1">Período</label>
            <select
              value={periodoId}
              onChange={(e) => setPeriodoId(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              disabled={sincronizando}
            >
              {PERIODOS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Tipos de reunião */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-extrabold uppercase text-slate-500">
                Tipos de reunião para sincronizar
              </label>
              <button
                type="button"
                onClick={handleSelecionarTodos}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700"
                disabled={sincronizando}
              >
                Selecionar todos
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[280px] overflow-y-auto">
              {tiposComReunioes.length === 0 ? (
                <div className="p-4 text-sm text-slate-500 text-center">Nenhum tipo de reunião encontrado.</div>
              ) : (
                tiposComReunioes.map((t) => {
                  const checked = !!tiposSelecionados[String(t.id)];
                  const desabilitado = t.qtd === 0;
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer ${
                        desabilitado ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={desabilitado || sincronizando}
                        onChange={() => handleToggleTipo(t.id)}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span
                        className="w-3 h-3 rounded-full flex-none"
                        style={{ backgroundColor: t.cor || "#3B82F6" }}
                      />
                      <span className="flex-1 text-sm font-semibold text-slate-700 truncate">
                        {t.nome}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">
                        {t.qtd} reuni{t.qtd === 1 ? "ão" : "ões"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Progresso ou resultado */}
          {sincronizando && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 flex items-center gap-3">
              <RefreshCw size={18} className="text-blue-600 animate-spin" />
              <div className="text-sm text-blue-800 font-semibold">
                Sincronizando {progresso.done} de {progresso.total}...
              </div>
            </div>
          )}

          {resultado && !sincronizando && (
            <div
              className={`rounded-xl border p-3 flex items-start gap-3 ${
                resultado.errCount === 0
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              {resultado.errCount === 0 ? (
                <Check size={20} className="text-emerald-600 mt-0.5" />
              ) : (
                <AlertCircle size={20} className="text-amber-600 mt-0.5" />
              )}
              <div className="text-sm">
                <div className="font-bold text-slate-800">
                  {resultado.okCount} reuni{resultado.okCount === 1 ? "ão" : "ões"} enviada
                  {resultado.okCount === 1 ? "" : "s"} pro Google.
                </div>
                {resultado.errCount > 0 && (
                  <div className="text-amber-700 mt-1">
                    {resultado.errCount} falha{resultado.errCount === 1 ? "" : "s"} —{" "}
                    {resultado.errors?.[0]?.error?.slice(0, 120)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            <b>{totalSelecionado}</b> reuni{totalSelecionado === 1 ? "ão" : "ões"} ser
            {totalSelecionado === 1 ? "á" : "ão"} sincronizada{totalSelecionado === 1 ? "" : "s"}.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleSincronizar}
              disabled={!conectado || sincronizando || totalSelecionado === 0}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-black shadow-sm flex items-center gap-2"
            >
              <RefreshCw size={14} className={sincronizando ? "animate-spin" : ""} />
              {sincronizando ? "Sincronizando..." : "Sincronizar agora"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
