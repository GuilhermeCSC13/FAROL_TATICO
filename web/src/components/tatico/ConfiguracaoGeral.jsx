import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { X, Plus, Trash2, Target, List, Settings, ShieldAlert } from "lucide-react";

/* ✅ inclui ACUM (mes=13) para configurar meta do acumulado também */
const MESES = [
  { id: 1, label: "Jan" },
  { id: 2, label: "Fev" },
  { id: 3, label: "Mar" },
  { id: 4, label: "Abr" },
  { id: 5, label: "Mai" },
  { id: 6, label: "Jun" },
  { id: 7, label: "Jul" },
  { id: 8, label: "Ago" },
  { id: 9, label: "Set" },
  { id: 10, label: "Out" },
  { id: 11, label: "Nov" },
  { id: 12, label: "Dez" },
  { id: 13, label: "Acum" },
];

// ✅ UNID dropdown
const UNIDADES = [
  { value: "currency", label: "R$" },
  { value: "pct", label: "%" },
  { value: "numero", label: "Número (123)" },
  { value: "binario", label: "Binário (Sim/Não)" },
];

const AREAS_PADRAO = [
  { id: 4, nome: "PCO" },
  { id: 5, nome: "Gestão de Motoristas" },
];

function parseNumberPtBr(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return 0;

  let t = s.replace(/\s+/g, "");

  if (t.includes(".") && t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else {
    t = t.replace(",", ".");
  }

  t = t.replace(/[^0-9.\-]/g, "");

  const idx = t.indexOf(".");
  if (idx !== -1) {
    t = t.slice(0, idx + 1) + t.slice(idx + 1).replace(/\./g, "");
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

const ConfiguracaoGeral = ({ onClose, areasContexto }) => {
  const areasDisponiveis =
    areasContexto && areasContexto.length > 0 ? areasContexto : AREAS_PADRAO;

  const [tipo, setTipo] = useState("metas");
  const [areaId, setAreaId] = useState(areasDisponiveis[0].id);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [autorizado, setAutorizado] = useState(null);

  const totalPesos = useMemo(() => {
    return items.reduce((acc, item) => acc + parseNumberPtBr(item.peso), 0);
  }, [items]);

  const faltandoPara100 = useMemo(() => {
    return 100 - totalPesos;
  }, [totalPesos]);

  const statusPeso = useMemo(() => {
    if (totalPesos === 100) {
      return {
        label: "Total de pesos: 100",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    }

    if (totalPesos < 100) {
      return {
        label: `Total de pesos: ${totalPesos} • Faltam ${faltandoPara100}`,
        className: "bg-amber-50 text-amber-700 border-amber-200",
      };
    }

    return {
      label: `Total de pesos: ${totalPesos} • Excedeu ${Math.abs(faltandoPara100)}`,
      className: "bg-red-50 text-red-700 border-red-200",
    };
  }, [totalPesos, faltandoPara100]);

  useEffect(() => {
    const verificarAcesso = () => {
      try {
        const stored = localStorage.getItem("usuario_externo");
        if (!stored) {
          setAutorizado(false);
          return;
        }
        const usuario = JSON.parse(stored);
        const nivel = String(usuario.nivel || "").trim();

        if (nivel === "Administrador" || nivel === "Gestor") {
          setAutorizado(true);
        } else {
          setAutorizado(false);
        }
      } catch (e) {
        console.error("Erro ao verificar permissão:", e);
        setAutorizado(false);
      }
    };
    verificarAcesso();
  }, []);

  useEffect(() => {
    if (autorizado) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, areaId, autorizado]);

  const fetchData = async () => {
    setLoading(true);
    let dataItems = [];
    let dataMetas = [];

    try {
      if (tipo === "metas") {
        const { data: rows, error: errRows } = await supabase
          .from("metas_farol")
          .select("*")
          .eq("area_id", areaId)
          .order("peso", { ascending: false });

        if (errRows) throw errRows;

        const { data: values, error: errVals } = await supabase
          .from("metas_farol_mensal")
          .select("*")
          .eq("ano", 2026);

        if (errVals) throw errVals;

        dataItems = rows || [];
        dataMetas = values || [];
      } else {
        const { data: rows, error: errRows } = await supabase
          .from("rotinas_indicadores")
          .select("*")
          .eq("area_id", areaId)
          .order("peso", { ascending: false });

        if (errRows) throw errRows;

        const { data: values, error: errVals } = await supabase
          .from("rotinas_mensais")
          .select("*")
          .eq("ano", 2026);

        if (errVals) throw errVals;

        dataItems = rows || [];
        dataMetas = values || [];
      }

      const combined = dataItems
        .map((item) => {
          const row = { ...item, valores_mensais: {} };
          MESES.forEach((mes) => {
            const fkId = item.id;
            const fkColumn = tipo === "metas" ? "meta_id" : "rotina_id";
            const found = dataMetas.find(
              (v) => v[fkColumn] === fkId && v.mes === mes.id
            );
            row.valores_mensais[mes.id] = found ? found.valor_meta : "";
          });
          return row;
        })
        .sort((a, b) => parseNumberPtBr(b.peso) - parseNumberPtBr(a.peso));

      setItems(combined);
    } catch (error) {
      console.error("Erro ao carregar configuração geral:", error);
      alert("Erro ao carregar dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    const nome = prompt("Nome do novo Indicador:");
    if (!nome) return;

    try {
      if (tipo === "metas") {
        const { error } = await supabase.from("metas_farol").insert({
          area_id: areaId,
          indicador: nome,
          nome_meta: nome,
          peso: 0,
          unidade: "",
          tipo_comparacao: ">=",
          responsavel: "",
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rotinas_indicadores").insert({
          area_id: areaId,
          indicador: nome,
          ordem: items.length + 1,
          tipo_comparacao: ">=",
          peso: 0,
          unidade: "",
          responsavel: "",
        });
        if (error) throw error;
      }

      fetchData();
    } catch (err) {
      alert("Erro ao criar indicador: " + err.message);
    }
  };

  const handleDelete = async (id) => {
    const senha = prompt(
      "ATENÇÃO: isso vai apagar o INDICADOR e todo o histórico vinculado.\n\n" +
        "Para confirmar, digite APAGAR em letras maiúsculas:"
    );

    if (senha !== "APAGAR") {
      alert("Exclusão cancelada.");
      return;
    }

    const confirmar = confirm("Tem certeza absoluta?");
    if (!confirmar) return;

    const tableMain = tipo === "metas" ? "metas_farol" : "rotinas_indicadores";
    const tableMensal = tipo === "metas" ? "metas_farol_mensal" : "rotinas_mensais";
    const fkCol = tipo === "metas" ? "meta_id" : "rotina_id";

    try {
      if (tipo === "metas") {
        await supabase.from("resultados_farol").delete().eq("meta_id", id);
      }
      await supabase.from(tableMensal).delete().eq(fkCol, id);
      const { error: errMain } = await supabase.from(tableMain).delete().eq("id", id);
      if (errMain) throw errMain;

      fetchData();
    } catch (err) {
      alert("Erro ao excluir indicador.");
    }
  };

  const updateRowProp = async (id, field, value) => {
    const table = tipo === "metas" ? "metas_farol" : "rotinas_indicadores";
    let normalizedValue = value;

    if (field === "peso") {
      if (value === "" || value === null || value === undefined) {
        normalizedValue = 0;
      } else {
        const parsed = Number(String(value).replace(",", "."));
        normalizedValue = isNaN(parsed) ? 0 : parsed;
      }
    }

    if (field === "unidade") {
      normalizedValue = String(value ?? "").trim().toLowerCase();
    }

    setItems((prev) => {
      const updated = prev.map((i) =>
        i.id === id ? { ...i, [field]: normalizedValue } : i
      );

      if (field === "peso") {
        return [...updated].sort(
          (a, b) => parseNumberPtBr(b.peso) - parseNumberPtBr(a.peso)
        );
      }

      return updated;
    });

    try {
      const { error } = await supabase
        .from(table)
        .update({ [field]: normalizedValue })
        .eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error("Erro update:", err);
    }
  };

  const upsertValorMensal = async (table, fkColumn, itemId, mesId, valorNum) => {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq(fkColumn, itemId)
      .eq("ano", 2026)
      .eq("mes", mesId);

    if (error) throw error;

    if (data && data.length > 0) {
      const id = data[0].id;
      const { error: updError } = await supabase
        .from(table)
        .update({ valor_meta: valorNum })
        .eq("id", id);
      if (updError) throw updError;
    } else {
      const { error: insError } = await supabase.from(table).insert({
        [fkColumn]: itemId,
        ano: 2026,
        mes: mesId,
        valor_meta: valorNum,
      });
      if (insError) throw insError;
    }
  };

  const saveMonthlyTarget = async (itemId, mesId, valor) => {
    const valorNum =
      valor === "" || valor === null
        ? null
        : parseFloat(String(valor).replace(",", "."));

    const table = tipo === "metas" ? "metas_farol_mensal" : "rotinas_mensais";
    const fkColumn = tipo === "metas" ? "meta_id" : "rotina_id";

    try {
      await upsertValorMensal(table, fkColumn, itemId, mesId, valorNum);
    } catch (err) {
      console.error("Erro saveMonthlyTarget:", err);
    }
  };

  const handleMonthlyChange = (itemId, mesId, valor) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== itemId) return i;
        const newVals = { ...i.valores_mensais, [mesId]: valor };
        return { ...i, valores_mensais: newVals };
      })
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    const table = tipo === "metas" ? "metas_farol_mensal" : "rotinas_mensais";
    const fkColumn = tipo === "metas" ? "meta_id" : "rotina_id";

    try {
      const promises = [];
      items.forEach((item) => {
        MESES.forEach((mes) => {
          const rawVal = item.valores_mensais[mes.id];
          if (rawVal === "" || rawVal === undefined) return;
          const parsed = parseFloat(String(rawVal).replace(",", "."));
          const valorNum = isNaN(parsed) ? null : parsed;
          promises.push(upsertValorMensal(table, fkColumn, item.id, mes.id, valorNum));
        });
      });

      if (promises.length === 0) {
        alert("Nenhum valor para salvar.");
        setSaving(false);
        return;
      }

      await Promise.all(promises);
      alert("Salvo com sucesso.");
      fetchData();
    } catch (err) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (autorizado === null) {
    return null;
  }

  if (autorizado === false) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 backdrop-blur-sm font-sans animate-in fade-in zoom-in duration-200">
        <div className="bg-white rounded-2xl p-8 shadow-2xl text-center max-w-sm border border-red-100 relative">
          <div className="mx-auto w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-5 shadow-sm">
            <ShieldAlert size={40} strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">Acesso Restrito</h2>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            Esta área de configuração é exclusiva para <b>Gestores</b> e <b>Administradores</b>.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
          >
            <X size={18} /> Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm font-sans">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] h-[90vh] flex flex-col border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-center p-5 border-b bg-gray-50 rounded-t-xl gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Settings size={24} /> Configuração de Metas
            </h2>

            <div className="flex bg-gray-200 rounded-lg p-1">
              <button
                onClick={() => setTipo("metas")}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${
                  tipo === "metas" ? "bg-white shadow text-blue-700" : "text-gray-600"
                }`}
              >
                <Target size={16} /> Metas
              </button>
              <button
                onClick={() => setTipo("rotinas")}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${
                  tipo === "rotinas" ? "bg-white shadow text-green-700" : "text-gray-600"
                }`}
              >
                <List size={16} /> Rotinas
              </button>
            </div>

            <div
              className={`px-3 py-2 rounded-lg border text-sm font-bold ${statusPeso.className}`}
            >
              {statusPeso.label}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <select
              value={areaId}
              onChange={(e) => setAreaId(Number(e.target.value))}
              className="bg-white border border-gray-300 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 font-semibold"
              disabled={areasDisponiveis.length === 1}
            >
              {areasDisponiveis.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome || a.label}
                </option>
              ))}
            </select>

            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-gray-50/50">
          {loading ? (
            <div className="text-center py-20 text-gray-400">Carregando dados...</div>
          ) : (
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 text-gray-600 uppercase font-bold sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="p-3 w-64 border-r">Indicador</th>
                    <th className="p-3 w-16 text-center border-r">Peso</th>
                    <th className="p-3 w-28 text-center border-r">Unid.</th>
                    <th className="p-3 w-24 text-center border-r">Resp.</th>
                    <th className="p-3 w-16 text-center border-r">Tipo</th>
                    {MESES.map((m) => (
                      <th
                        key={m.id}
                        className="p-3 text-center min-w-[60px] border-r bg-yellow-50 text-blue-800"
                        title="Meta (Alvo)"
                      >
                        {m.label}
                      </th>
                    ))}
                    <th className="p-3 text-center w-10"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="p-2 border-r">
                        <input
                          value={item.nome_meta || item.indicador}
                          onChange={(e) =>
                            updateRowProp(
                              item.id,
                              tipo === "metas" ? "nome_meta" : "indicador",
                              e.target.value
                            )
                          }
                          className="w-full font-semibold bg-transparent focus:outline-none focus:text-blue-600"
                        />
                      </td>

                      <td className="p-1 border-r">
                        <input
                          type="number"
                          step="0.01"
                          value={item.peso ?? 0}
                          onChange={(e) => updateRowProp(item.id, "peso", e.target.value)}
                          className="w-full text-center bg-transparent font-bold"
                        />
                      </td>

                      <td className="p-1 border-r">
                        <select
                          value={String(item.unidade || "").trim().toLowerCase()}
                          onChange={(e) => updateRowProp(item.id, "unidade", e.target.value)}
                          className="w-full text-center bg-transparent text-[11px] font-semibold"
                        >
                          <option value="">-</option>
                          {UNIDADES.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-1 border-r">
                        <input
                          value={item.responsavel || ""}
                          onChange={(e) => updateRowProp(item.id, "responsavel", e.target.value)}
                          className="w-full text-center bg-transparent"
                        />
                      </td>

                      <td className="p-1 border-r">
                        <select
                          value={item.tipo_comparacao}
                          onChange={(e) => updateRowProp(item.id, "tipo_comparacao", e.target.value)}
                          className="w-full text-center bg-transparent text-[10px]"
                        >
                          <option value=">=">{">="}</option>
                          <option value="<=">{"<="}</option>
                        </select>
                      </td>

                      {MESES.map((mes) => (
                        <td key={mes.id} className="p-0 border-r bg-yellow-50/10">
                          <input
                            value={item.valores_mensais[mes.id] || ""}
                            onChange={(e) => handleMonthlyChange(item.id, mes.id, e.target.value)}
                            onBlur={(e) => saveMonthlyTarget(item.id, mes.id, e.target.value)}
                            className="w-full h-9 text-center bg-transparent text-blue-700 font-semibold focus:bg-yellow-100 focus:outline-none"
                            placeholder="-"
                          />
                        </td>
                      ))}

                      <td className="p-2 text-center">
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>

                <tfoot>
                  <tr className="bg-slate-900 text-white font-bold">
                    <td className="p-3 border-r">TOTAL DE PESOS</td>
                    <td className="p-3 text-center border-r">{totalPesos}</td>
                    <td className="p-3 border-r"></td>
                    <td className="p-3 border-r"></td>
                    <td className="p-3 border-r"></td>
                    {MESES.map((mes) => (
                      <td key={mes.id} className="p-3 border-r"></td>
                    ))}
                    <td className="p-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t rounded-b-xl flex justify-between items-center gap-4">
          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all font-semibold"
            >
              <Plus size={18} /> Novo Indicador
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all ${
                saving
                  ? "bg-gray-300 text-gray-700 cursor-not-allowed"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200"
              }`}
            >
              {saving ? "Salvando..." : "Salvar Metas / Rotinas"}
            </button>
          </div>

          <p className="text-xs text-gray-400">
            <span className="font-bold text-gray-600">Nota:</span> Use a coluna amarela para definir a{" "}
            <span className="font-bold text-blue-700">META</span> de cada mês (inclui{" "}
            <span className="font-bold">Acum</span>).
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConfiguracaoGeral;
