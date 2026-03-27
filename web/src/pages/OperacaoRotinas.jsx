// src/pages/OperacaoRotinas.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import ConfiguracaoGeral from "../components/tatico/ConfiguracaoGeral";
import { Settings, Download, ChevronDown } from "lucide-react";
import html2canvas from "html2canvas";

// IDs fixos das áreas (PCO e Gestão de Motoristas)
const ID_PCO = 4;
const ID_MOTORISTAS = 5;

// ✅ UNID (somente leitura na tela Rotinas, igual Metas)
const UNIDADES = [
  { value: "kml", label: "km/l" },
  { value: "currency", label: "R$" },
  { value: "pct", label: "%" },
  { value: "numero", label: "Número (123)" },
  { value: "binario", label: "Binário (Sim/Não)" },
];

function getUnidadeLabel(v) {
  const key = String(v ?? "").trim().toLowerCase();
  const opt = UNIDADES.find((u) => u.value === key);
  return opt?.label || (v ? String(v) : "");
}

// ✅ adiciona ACUMULADO (mes=13) + MÉDIA 25 (mes=14, manual, sem meta azul)
const MESES = [
  { id: 1, label: "jan/26" },
  { id: 2, label: "fev/26" },
  { id: 3, label: "mar/26" },
  { id: 4, label: "abr/26" },
  { id: 5, label: "mai/26" },
  { id: 6, label: "jun/26" },
  { id: 7, label: "jul/26" },
  { id: 8, label: "ago/26" },
  { id: 9, label: "set/26" },
  { id: 10, label: "out/26" },
  { id: 11, label: "nov/26" },
  { id: 12, label: "dez/26" },
  { id: 13, label: "acum/26" }, // ✅ tem alvo/meta azul + realizado
  { id: 14, label: "média 25" }, // ✅ só realizado (manual), sem meta azul, sem score
];

function normBoolLabel(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "sim" || s === "true" || s === "ok") return "Sim";
  if (s === "0" || s === "nao" || s === "não" || s === "false") return "Não";
  return "";
}

function boolToNum(v) {
  const label = normBoolLabel(v);
  if (label === "Sim") return 1;
  if (label === "Não") return 0;
  return null;
}

function numToBoolLabel(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return n === 1 ? "Sim" : "Não";
}

/** ✅ Parser único: aceita vírgula ou ponto (PT-BR) */
function parseNumberPtBr(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  let t = s.replace(/\s+/g, "");

  // "." e "," juntos -> BR: "." milhar, "," decimal
  if (t.includes(".") && t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else {
    // só "," -> decimal
    t = t.replace(",", ".");
  }

  // remove lixo
  t = t.replace(/[^0-9.\-]/g, "");

  // remove pontos extras
  const idx = t.indexOf(".");
  if (idx !== -1) {
    t = t.slice(0, idx + 1) + t.slice(idx + 1).replace(/\./g, "");
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const OperacaoRotinas = () => {
  const [areas, setAreas] = useState([]);
  const [areaSelecionada, setAreaSelecionada] = useState(null);
  const [rotinas, setRotinas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  // ✅ filtro por responsável (padrão, igual Manutenção/Moov)
  const [responsavelFiltro, setResponsavelFiltro] = useState("");

  // ✅ Export igual padrão
  const [openExport, setOpenExport] = useState(false);
  const tableWrapRef = useRef(null);

  useEffect(() => {
    fetchAreas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (areaSelecionada) fetchRotinasData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaSelecionada]);

  const fetchAreas = async () => {
    try {
      const { data, error } = await supabase
        .from("areas")
        .select("*")
        .eq("ativa", true)
        .order("id");

      if (error) throw error;

      if (data && data.length > 0) {
        const filtered = data.filter((a) => a.id == ID_PCO || a.id == ID_MOTORISTAS);
        const lista = filtered.length > 0 ? filtered : data;
        setAreas(lista);
        setAreaSelecionada(lista[0].id);
      }
    } catch (e) {
      console.error("Erro ao buscar áreas:", e);
    } finally {
      if (!areaSelecionada) setLoading(false);
    }
  };

  // ✅ Fonte da verdade do binário: rotinas_indicadores.unidade
  const isBinaryRotina = (row) => {
    const unidade = String(row?.unidade ?? "").trim().toLowerCase();
    if (unidade === "binario" || unidade === "binário" || unidade === "boolean") return true;
    return false;
  };

  // ✅ Cálculo (numérico + binário) — padrão (peso = Number(pesoTotal) || 0)
  const calculateScore = (meta, realizado, tipo, pesoTotal, isBinary) => {
    const peso = Number(pesoTotal) || 0;

    if (isBinary) {
      const m = meta === null || meta === undefined ? 1 : Number(meta);
      const r =
        realizado === "" || realizado === null || realizado === undefined ? null : Number(realizado);

      if (r === null || Number.isNaN(r)) {
        return { score: 0, multiplicador: 0, color: "bg-white" };
      }

      const ok = r === m;
      return {
        score: ok ? peso : 0,
        multiplicador: ok ? 1 : 0,
        color: ok ? "bg-green-300" : "bg-red-200",
      };
    }

    if (meta === null || realizado === "" || realizado === null || isNaN(parseFloat(realizado))) {
      return { score: 0, multiplicador: 0, color: "bg-white" };
    }

    const r = parseFloat(realizado);
    const m = parseFloat(meta);

    // ✅ meta = 0 (blindado)
    if (m === 0) {
      let multiplicador = 0;
      let cor = "bg-red-200";

      if (tipo === "<=" || tipo === "menor") {
        if (r === 0) {
          multiplicador = 1.0;
          cor = "bg-green-300";
        } else {
          multiplicador = 0.0;
          cor = "bg-red-200";
        }
      } else {
        if (r >= 0) {
          multiplicador = 1.0;
          cor = "bg-green-300";
        } else {
          multiplicador = 0.0;
          cor = "bg-red-200";
        }
      }

      return { score: peso * multiplicador, multiplicador, color: cor };
    }

    let atingimento = 0;
    if (tipo === ">=" || tipo === "maior") atingimento = r / m;
    else atingimento = 1 + (m - r) / m;

    let multiplicador = 0;
    let cor = "bg-red-200";

    if (atingimento >= 1.0) {
      multiplicador = 1.0;
      cor = "bg-green-300";
    } else if (atingimento >= 0.99) {
      multiplicador = 0.75;
      cor = "bg-green-100";
    } else if (atingimento >= 0.98) {
      multiplicador = 0.5;
      cor = "bg-yellow-100";
    } else if (atingimento >= 0.97) {
      multiplicador = 0.25;
      cor = "bg-orange-100";
    } else {
      multiplicador = 0.0;
      cor = "bg-red-200";
    }

    return { score: peso * multiplicador, multiplicador, color: cor };
  };

  const fetchRotinasData = async () => {
    setLoading(true);
    try {
      // 1) Definições das Rotinas
      const { data: defs, error: err1 } = await supabase
        .from("rotinas_indicadores")
        .select("*")
        .eq("area_id", areaSelecionada)
        .order("ordem", { ascending: true });

      if (err1) throw err1;

      // 2) Valores mensais
      const { data: valores, error: err2 } = await supabase
        .from("rotinas_mensais")
        .select("*")
        .eq("ano", 2026);

      if (err2) throw err2;

      // 3) Cruzamento (padrão)
      const combined = (defs || []).map((r) => {
        const row = { ...r, meses: {}, _isBinary: isBinaryRotina(r) };

        MESES.forEach((mes) => {
          const valObj = valores?.find((v) => v.rotina_id === r.id && v.mes === mes.id);

          // ✅ realizado
          let real = "";
          if (valObj && valObj.valor_realizado !== null && valObj.valor_realizado !== "") {
            const parsed = parseNumberPtBr(valObj.valor_realizado);
            real = parsed === null ? "" : parsed;
          }

          // ✅ mes=14 (manual): sem meta azul e sem score
          if (mes.id === 14) {
            row.meses[mes.id] = {
              alvo: null,
              realizado: real,
              score: 0,
              multiplicador: 0,
              color: "bg-white",
            };
            return;
          }

          // ✅ meta/alvo
          let alvo = null;
          if (valObj && valObj.valor_meta !== null && valObj.valor_meta !== "") {
            const parsed = parseNumberPtBr(valObj.valor_meta);
            alvo = parsed === null ? null : parsed;
          }

          const alvoEfetivo = row._isBinary ? (alvo === null ? 1 : alvo) : alvo;

          row.meses[mes.id] = {
            alvo: alvoEfetivo,
            realizado: real,
            ...calculateScore(
              alvoEfetivo,
              real,
              r.tipo_comparacao,
              parseNumberPtBr(r.peso) ?? 0,
              row._isBinary
            ),
          };
        });

        return row;
      });

      setRotinas(combined);
    } catch (error) {
      console.error("Erro ao carregar rotinas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (rotinaId, mesId, valor, rotinaRow) => {
    const isBinary = !!rotinaRow?._isBinary;

    let valorNum = null;
    if (isBinary) valorNum = boolToNum(valor);
    else valorNum = parseNumberPtBr(valor);

    // Atualiza UI (padrão)
    setRotinas((prev) =>
      prev.map((r) => {
        if (r.id !== rotinaId) return r;

        const novoMeses = { ...r.meses };
        const alvoAtual = novoMeses[mesId]?.alvo ?? null;

        // ✅ mes=14: sem score
        if (mesId === 14) {
          novoMeses[mesId] = {
            ...novoMeses[mesId],
            realizado: valorNum === null ? "" : valorNum,
            score: 0,
            multiplicador: 0,
            color: "bg-white",
          };
          return { ...r, meses: novoMeses };
        }

        novoMeses[mesId] = {
          ...novoMeses[mesId],
          realizado: valorNum === null ? "" : valorNum,
          ...calculateScore(
            alvoAtual,
            valorNum,
            r.tipo_comparacao,
            parseNumberPtBr(r.peso) ?? 0,
            r._isBinary
          ),
        };

        return { ...r, meses: novoMeses };
      })
    );

    // ✅✅✅ Salva no banco (UPSERT) — cria a linha se não existir (igual Moov/Manutenção ajustados)
    try {
      const payload = {
        rotina_id: rotinaId,
        ano: 2026,
        mes: mesId,
        valor_realizado: valorNum, // null apaga
      };

      const { error } = await supabase
        .from("rotinas_mensais")
        .upsert(payload, { onConflict: "rotina_id,ano,mes" });

      if (error) console.error("Erro ao salvar realizado:", error);
    } catch (e) {
      console.error("Erro inesperado ao salvar:", e);
    }
  };

  // ✅ responsáveis únicos (para filtro)
  const responsaveisUnicos = useMemo(() => {
    return Array.from(
      new Set(
        (rotinas || [])
          .map((r) => r.responsavel)
          .filter((r) => r && String(r).trim() !== "")
      )
    );
  }, [rotinas]);

  const rotinasFiltradas = useMemo(() => {
    return responsavelFiltro ? rotinas.filter((r) => r.responsavel === responsavelFiltro) : rotinas;
  }, [rotinas, responsavelFiltro]);

  const totalPeso = useMemo(() => {
    return rotinasFiltradas.reduce((acc, r) => acc + (parseNumberPtBr(r.peso) ?? 0), 0);
  }, [rotinasFiltradas]);

  const getTotalScore = (mesId) => {
    if (mesId === 14) return "-";
    const total = rotinasFiltradas.reduce((acc, r) => acc + (r.meses[mesId]?.score || 0), 0);
    return total.toFixed(1);
  };

  const exportFarol = async (format = "png") => {
    try {
      setOpenExport(false);

      const el = tableWrapRef.current;
      if (!el) return;

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const mime = format === "jpg" ? "image/jpeg" : "image/png";
      const ext = format === "jpg" ? "jpg" : "png";

      const dataUrl = canvas.toDataURL(mime, format === "jpg" ? 0.92 : undefined);
      const a = document.createElement("a");

      const areaName = areas.find((a) => a.id === areaSelecionada)?.nome || "Operacao";
      a.href = dataUrl;
      a.download = `FarolRotinas_${areaName}_2026.${ext}`;
      a.click();
    } catch (e) {
      console.error("Erro ao exportar farol:", e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded shadow-sm overflow-hidden font-sans">
      {/* Cabeçalho (padrão) */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-800">Farol de Rotinas — Operação</h2>

          {/* Baixar Farol */}
          <div className="relative">
            <button
              onClick={() => setOpenExport((s) => !s)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
              title="Baixar Farol"
            >
              <Download size={16} />
              Baixar Farol
              <ChevronDown size={16} />
            </button>

            {openExport && (
              <div className="absolute left-0 mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden z-50">
                <button
                  onClick={() => exportFarol("png")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Baixar PNG
                </button>
                <button
                  onClick={() => exportFarol("jpg")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Baixar JPG
                </button>
              </div>
            )}
          </div>

          {/* ✅ Filtro de Responsável (igual padrão das outras Rotinas) */}
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-gray-500 font-semibold">Responsável:</span>
            <select
              value={responsavelFiltro}
              onChange={(e) => setResponsavelFiltro(e.target.value)}
              className="text-xs bg-white border border-gray-300 rounded-md px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              {responsaveisUnicos.map((resp) => (
                <option key={resp} value={resp}>
                  {resp}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Config */}
          <div className="flex items-center gap-2 mr-2">
            <button
              onClick={() => setShowConfig(true)}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-200 rounded-full transition-colors"
              title="Configurações"
            >
              <Settings size={18} />
            </button>
          </div>

          {/* Seletor de Áreas */}
          <div className="flex space-x-2">
            {areas.map((area) => (
              <button
                key={area.id}
                onClick={() => setAreaSelecionada(area.id)}
                className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-all border-b-2 ${
                  areaSelecionada === area.id
                    ? "border-blue-600 text-blue-700 bg-blue-50"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                {area.nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-center py-10 text-gray-500 animate-pulse">Carregando dados...</div>
        ) : (
          <div className="border border-gray-300 rounded-xl shadow-sm overflow-x-auto overflow-y-hidden">
            <div ref={tableWrapRef} className="min-w-max">
              <table className="table-fixed text-[11px] border-collapse">
                <thead>
                  <tr className="bg-[#d0e0e3] text-gray-800 text-center font-bold">
                    <th className="px-2 py-1 border border-gray-300 w-[260px] sticky left-0 bg-[#d0e0e3] z-20 text-left">
                      Indicador
                    </th>

                    <th className="px-2 py-1 border border-gray-300 w-[64px]">UNID.</th>

                    <th className="px-2 py-1 border border-gray-300 w-[120px] text-left">
                      Responsável
                    </th>
                    <th className="px-2 py-1 border border-gray-300 w-[48px]">Peso</th>
                    <th className="px-2 py-1 border border-gray-300 w-[48px]">Tipo</th>

                    {MESES.map((mes) => (
                      <th
                        key={mes.id}
                        className="px-2 py-1 border border-gray-300 w-[78px] whitespace-nowrap"
                      >
                        {mes.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rotinasFiltradas.map((row, idx) => (
                    <tr key={row.id || idx} className="hover:bg-gray-50 text-center">
                      <td className="px-2 py-1 border border-gray-300 w-[260px] sticky left-0 bg-white z-10 text-left font-semibold text-gray-800">
                        {row.indicador}
                      </td>

                      <td className="px-2 py-1 border border-gray-300 w-[64px]">
                        <div className="text-[10px] font-semibold text-gray-700 leading-3">
                          {getUnidadeLabel(row.unidade) || "-"}
                        </div>
                        <div className="text-[9px] text-gray-400 font-normal text-left mt-0.5 leading-3">
                          {String(row.unidade || "").trim().toLowerCase()}
                        </div>
                      </td>

                      <td className="px-2 py-1 border border-gray-300 w-[120px] text-[10px] text-gray-700 text-left">
                        {row.responsavel || "-"}
                      </td>

                      <td className="px-2 py-1 border border-gray-300 w-[48px] bg-gray-50">
                        {parseInt(parseNumberPtBr(row.peso) ?? 0, 10)}
                      </td>

                      <td className="px-2 py-1 border border-gray-300 w-[48px] font-mono text-gray-500">
                        {row.tipo_comparacao}
                      </td>

                      {MESES.map((mes) => {
                        const dados = row.meses[mes.id];

                        // ✅ MÉDIA 25 (mes=14) — só realizado, sem score
                        if (mes.id === 14) {
                          const valorRealizado =
                            dados?.realizado === null ||
                            dados?.realizado === "" ||
                            Number.isNaN(dados?.realizado)
                              ? ""
                              : dados.realizado;

                          return (
                            <td
                              key={mes.id}
                              className="border border-gray-300 p-0 relative h-10 align-middle bg-white w-[78px]"
                            >
                              <div className="flex flex-col h-full justify-center">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="w-full text-center bg-transparent font-bold text-gray-800 text-[11px] focus:outline-none h-full focus:bg-white/50 transition-colors"
                                  placeholder="-"
                                  defaultValue={valorRealizado === "" ? "" : String(valorRealizado)}
                                  onBlur={(e) => handleSave(row.id, 14, e.target.value, row)}
                                />
                              </div>
                            </td>
                          );
                        }

                        // ✅ Binário
                        if (row._isBinary) {
                          const alvoLabel = numToBoolLabel(dados?.alvo ?? 1);
                          const realLabel = numToBoolLabel(dados?.realizado);

                          return (
                            <td
                              key={mes.id}
                              className={`border border-gray-300 p-0 relative h-10 align-middle w-[78px] ${
                                dados?.color || "bg-white"
                              }`}
                            >
                              <div className="flex flex-col h-full justify-between">
                                <div className="text-[10px] text-blue-700 font-semibold text-right px-1 pt-0.5 bg-white/40 leading-3">
                                  {alvoLabel || "Sim"}
                                </div>

                                <select
                                  className="w-full text-center bg-transparent font-bold text-gray-800 text-[11px] focus:outline-none h-full focus:bg-white/50 transition-colors"
                                  value={realLabel || ""}
                                  onChange={(e) => handleSave(row.id, mes.id, e.target.value, row)}
                                >
                                  <option value="">-</option>
                                  <option value="Sim">Sim</option>
                                  <option value="Não">Não</option>
                                </select>
                              </div>
                            </td>
                          );
                        }

                        // ✅ Numérico
                        const valorRealizado =
                          dados?.realizado === null ||
                          dados?.realizado === "" ||
                          Number.isNaN(dados?.realizado)
                            ? ""
                            : dados.realizado;

                        return (
                          <td
                            key={mes.id}
                            className={`border border-gray-300 p-0 relative h-10 align-middle w-[78px] ${
                              dados?.color || "bg-white"
                            }`}
                          >
                            <div className="flex flex-col h-full justify-between">
                              <div className="text-[10px] text-blue-700 font-semibold text-right px-1 pt-0.5 bg-white/40 leading-3">
                                {dados?.alvo !== null && dados?.alvo !== undefined
                                  ? Number(dados.alvo).toFixed(2)
                                  : ""}
                              </div>

                              <input
                                type="text"
                                inputMode="decimal"
                                className="w-full text-center bg-transparent font-bold text-gray-800 text-[11px] focus:outline-none h-full focus:bg-white/50 transition-colors"
                                placeholder="-"
                                defaultValue={valorRealizado === "" ? "" : String(valorRealizado)}
                                onBlur={(e) => handleSave(row.id, mes.id, e.target.value, row)}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* TOTAL SCORE */}
                  <tr className="bg-red-600 text-white font-bold border-t-2 border-black">
                    <td className="px-2 py-1 sticky left-0 bg-red-600 z-10 border-r border-red-500 text-right pr-4">
                      TOTAL SCORE
                    </td>

                    <td className="px-2 py-1 border-r border-red-500"></td>
                    <td className="px-2 py-1 border-r border-red-500"></td>

                    <td className="px-2 py-1 border-r border-red-500 text-center">
                      {Number(totalPeso || 0).toFixed(0)}
                    </td>

                    <td className="px-2 py-1 border-r border-red-500"></td>

                    {MESES.map((mes) => (
                      <td key={mes.id} className="px-2 py-1 text-center border-r border-red-500">
                        {getTotalScore(mes.id)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showConfig && (
        <ConfiguracaoGeral
          areasContexto={areas}
          onClose={() => {
            setShowConfig(false);
            fetchRotinasData();
          }}
        />
      )}
    </div>
  );
};

export default OperacaoRotinas;
