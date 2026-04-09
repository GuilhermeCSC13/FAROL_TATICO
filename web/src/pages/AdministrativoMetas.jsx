import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import ConfiguracaoGeral from "../components/tatico/ConfiguracaoGeral";
import { Settings, Download, ChevronDown } from "lucide-react";
import html2canvas from "html2canvas";

// IDs fixos Administrativo (Financeiro + Pessoas)
const IDS_ADMIN = [7, 8];

// ✅ UNID (somente leitura na tela Metas)
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

const AdministrativoMetas = () => {
  const [areas, setAreas] = useState([]);
  const [areaSelecionada, setAreaSelecionada] = useState(null);
  const [metas, setMetas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  const [openExport, setOpenExport] = useState(false);
  const tableWrapRef = useRef(null);

  useEffect(() => {
    fetchAreas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (areaSelecionada) fetchMetasData();
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

      if (data?.length) {
        const filtradas = data.filter((a) => IDS_ADMIN.includes(a.id));
        const lista = filtradas.length ? filtradas : data;

        setAreas(lista);
        setAreaSelecionada(lista[0].id);
      }
    } catch (err) {
      console.error("Erro ao buscar áreas:", err);
    } finally {
      if (!areaSelecionada) setLoading(false);
    }
  };

  // ✅ Fonte da verdade do binário: metas_farol.unidade
  const isBinaryMeta = (metaRow) => {
    const unidade = String(metaRow?.unidade ?? "").trim().toLowerCase();
    if (unidade === "binario" || unidade === "binário" || unidade === "boolean")
      return true;
    return false;
  };

  const fetchMetasData = async () => {
    setLoading(true);
    try {
      const { data: metasDef, error: err1 } = await supabase
        .from("metas_farol")
        .select("*")
        .eq("area_id", areaSelecionada)
        .order("peso", { ascending: false });
      if (err1) throw err1;

      const { data: metasMensais, error: err2 } = await supabase
        .from("metas_farol_mensal")
        .select("*")
        .eq("ano", 2026);
      if (err2) throw err2;

      const { data: resultados, error: err3 } = await supabase
        .from("resultados_farol")
        .select("*")
        .eq("ano", 2026);
      if (err3) throw err3;

      const combined = (metasDef || [])
        .map((m) => {
          const row = { ...m, meses: {}, _isBinary: isBinaryMeta(m) };

          MESES.forEach((mes) => {
            const realObj = resultados?.find(
              (x) => x.meta_id === m.id && x.mes === mes.id
            );

            let real = "";
            if (
              realObj &&
              realObj.valor_realizado !== null &&
              realObj.valor_realizado !== ""
            ) {
              const parsed = parseNumberPtBr(realObj.valor_realizado);
              real = parsed === null ? "" : parsed;
            }

            // ✅ MÉDIA 25 (mes=14): só realizado, SEM alvo/meta azul e SEM score
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

            const alvoObj = metasMensais?.find(
              (x) => x.meta_id === m.id && x.mes === mes.id
            );

            let alvo = null;
            if (
              alvoObj &&
              alvoObj.valor_meta !== null &&
              alvoObj.valor_meta !== ""
            ) {
              const parsed = parseNumberPtBr(alvoObj.valor_meta);
              alvo = parsed === null ? null : parsed;
            }

            // ✅ Para binário, se alvo vier null, assume meta "Sim" (1)
            const alvoEfetivo = row._isBinary ? (alvo === null ? 1 : alvo) : alvo;

            row.meses[mes.id] = {
              alvo: alvoEfetivo,
              realizado: real,
              ...calculateScore(
                alvoEfetivo,
                real,
                m.tipo_comparacao,
                parseNumberPtBr(m.peso) ?? 0,
                row._isBinary
              ),
            };
          });

          return row;
        })
        .sort(
          (a, b) =>
            (parseNumberPtBr(b.peso) ?? 0) - (parseNumberPtBr(a.peso) ?? 0)
        );

      setMetas(combined);
    } catch (e) {
      console.error("Erro ao carregar metas:", e);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Cálculo (numérico + binário) — mantém regra especial para meta=0
  const calculateScore = (meta, realizado, tipo, pesoTotal, isBinary) => {
    if (isBinary) {
      const m = meta === null || meta === undefined ? 1 : Number(meta);
      const r =
        realizado === "" || realizado === null || realizado === undefined
          ? null
          : Number(realizado);

      if (r === null || Number.isNaN(r)) {
        return { score: 0, multiplicador: 0, color: "bg-white" };
      }

      const ok = r === m;
      return {
        score: ok ? pesoTotal : 0,
        multiplicador: ok ? 1 : 0,
        color: ok ? "bg-green-300" : "bg-red-200",
      };
    }

    if (
      meta === null ||
      realizado === "" ||
      realizado === null ||
      isNaN(parseFloat(realizado))
    ) {
      return { score: 0, faixa: 0, color: "bg-white" };
    }

    const r = parseFloat(realizado);
    const m = parseFloat(meta);

    // ✅ Tratamento especial para meta = 0
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

      return {
        score: pesoTotal * multiplicador,
        multiplicador,
        color: cor,
      };
    }

    let atingimento = 0;

    if (tipo === ">=" || tipo === "maior") {
      atingimento = r / m;
    } else {
      atingimento = 1 + (m - r) / m;
    }

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

    return {
      score: pesoTotal * multiplicador,
      multiplicador,
      color: cor,
    };
  };

  const handleSave = async (metaId, mesId, valor, metaRow) => {
    const isBinary = !!metaRow?._isBinary;

    let valorNum = null;
    if (isBinary) {
      valorNum = boolToNum(valor);
    } else {
      valorNum = parseNumberPtBr(valor);
    }

    setMetas((prev) =>
      prev.map((m) => {
        if (m.id !== metaId) return m;

        const novoMeses = { ...m.meses };
        const alvoAtual = novoMeses[mesId]?.alvo ?? null;

        // ✅ mes=14: não tem score
        if (mesId === 14) {
          novoMeses[mesId] = {
            ...novoMeses[mesId],
            realizado: valorNum === null ? "" : valorNum,
            score: 0,
            multiplicador: 0,
            color: "bg-white",
          };
          return { ...m, meses: novoMeses };
        }

        novoMeses[mesId] = {
          ...novoMeses[mesId],
          realizado: valorNum === null ? "" : valorNum,
          ...calculateScore(
            alvoAtual,
            valorNum,
            m.tipo_comparacao,
            parseNumberPtBr(m.peso) ?? 0,
            m._isBinary
          ),
        };

        return { ...m, meses: novoMeses };
      })
    );

    const { error } = await supabase
      .from("resultados_farol")
      .upsert(
        {
          meta_id: metaId,
          ano: 2026,
          mes: mesId, // ✅ inclui 14 (média 25)
          valor_realizado: valorNum,
        },
        { onConflict: "meta_id, ano, mes" }
      );

    if (error) console.error("Erro ao salvar:", error);
  };

  const totalPeso = useMemo(() => {
    return metas.reduce((acc, m) => acc + (parseNumberPtBr(m.peso) ?? 0), 0);
  }, [metas]);

  const getTotalScore = (mesId) => {
    if (mesId === 14) return "-";
    const total = metas.reduce(
      (acc, m) => acc + (m.meses[mesId]?.score || 0),
      0
    );
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
      const areaName =
        areas.find((a) => a.id === areaSelecionada)?.nome || "Administrativo";

      a.href = dataUrl;
      a.download = `Farol_${areaName}_2026.${ext}`;
      a.click();
    } catch (e) {
      console.error("Erro ao exportar farol:", e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded shadow-sm overflow-hidden font-sans">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-800">
            Farol de Metas — Administrativo
          </h2>

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
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 mr-4 border-r pr-4">
            <button
              onClick={() => (window.location.hash = "rotinas")}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-gray-200 rounded"
            >
              Ir para Rotinas
            </button>

            <button
              onClick={() => setShowConfig(true)}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-200 rounded-full"
              title="Configurações"
            >
              <Settings size={18} />
            </button>
          </div>

          <div className="flex space-x-2">
            {areas.map((area) => (
              <button
                key={area.id}
                onClick={() => setAreaSelecionada(area.id)}
                className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 ${
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

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-center py-10 text-gray-500 animate-pulse">
            Carregando dados...
          </div>
        ) : (
          <div ref={tableWrapRef} className="border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#d0e0e3] text-center font-bold">
                  <th className="p-2 w-48 sticky left-0 bg-[#d0e0e3] z-10">
                    Indicador
                  </th>

                  {/* ✅ UNID (somente leitura) */}
                  <th className="p-2 w-20">UNID.</th>

                  <th className="p-2 w-32">Responsável</th>
                  <th className="p-2 w-12">Peso</th>
                  <th className="p-2 w-12">Tipo</th>

                  {MESES.map((m) => (
                    <th key={m.id} className="p-2 min-w-[70px]">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {metas.map((meta) => (
                  <tr key={meta.id} className="hover:bg-gray-50 text-center">
                    <td className="p-2 text-left font-semibold sticky left-0 bg-white z-10">
                      {meta.nome_meta || meta.indicador}
                    </td>

                    {/* ✅ UNID somente leitura */}
                    <td className="p-2 border border-gray-300">
                      <div className="text-[11px] font-semibold text-gray-700">
                        {getUnidadeLabel(meta.unidade) || "-"}
                      </div>
                      <div className="text-[9px] text-gray-400 font-normal text-left mt-0.5">
                        {String(meta.unidade || "").trim().toLowerCase()}
                      </div>
                    </td>

                    <td className="p-2 text-left text-[11px]">
                      {meta.responsavel || "-"}
                    </td>

                    <td className="p-2 bg-gray-50">{parseInt(parseNumberPtBr(meta.peso) ?? 0, 10)}</td>

                    <td className="p-2 font-mono text-gray-500">
                      {meta.tipo_comparacao}
                    </td>

                    {MESES.map((mes) => {
                      const dados = meta.meses[mes.id];

                      // ✅ mes=14: input manual, sem alvo e sem score
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
                            className="border border-gray-300 p-0 relative h-12 align-middle bg-white"
                          >
                            <div className="flex flex-col h-full justify-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                className="w-full text-center bg-transparent font-bold text-gray-800 text-xs focus:outline-none h-full pb-1 focus:bg-white/50"
                                placeholder="-"
                                defaultValue={
                                  valorRealizado === "" ? "" : String(valorRealizado)
                                }
                                onBlur={(e) =>
                                  handleSave(meta.id, 14, e.target.value, meta)
                                }
                              />
                            </div>
                          </td>
                        );
                      }

                      // ✅ Binário
                      if (meta._isBinary) {
                        const alvoLabel = numToBoolLabel(dados.alvo ?? 1);
                        const realLabel = numToBoolLabel(dados.realizado);

                        return (
                          <td
                            key={mes.id}
                            className={`border border-gray-300 p-0 relative h-12 align-middle ${dados.color || "bg-white"}`}
                          >
                            <div className="flex flex-col h-full justify-between">
                              <div className="text-[11px] text-blue-700 font-semibold text-right px-1 pt-0.5 bg-white/40">
                                {alvoLabel || "Sim"}
                              </div>

                              <select
                                className="w-full text-center bg-transparent font-bold text-gray-800 text-xs focus:outline-none h-full pb-1 focus:bg-white/50"
                                value={realLabel || ""}
                                onChange={(e) =>
                                  handleSave(meta.id, mes.id, e.target.value, meta)
                                }
                              >
                                <option value="">-</option>
                                <option value="Sim">Sim</option>
                                <option value="Não">Não</option>
                              </select>
                            </div>
                          </td>
                        );
                      }

                      const valorRealizado =
                        dados?.realizado === "" ||
                        dados?.realizado === null ||
                        Number.isNaN(dados?.realizado)
                          ? ""
                          : dados.realizado;

                      return (
                        <td
                          key={mes.id}
                          className={`border p-0 ${dados.color || "bg-white"}`}
                        >
                          <div className="flex flex-col h-full justify-between">
                            <div className="text-[11px] text-blue-700 font-semibold text-right px-1 pt-0.5 bg-white/40">
                              {dados.alvo !== null && dados.alvo !== undefined
                                ? Number(dados.alvo).toFixed(2)
                                : ""}
                            </div>

                            <input
                              type="text"
                              inputMode="decimal"
                              className="w-full text-center bg-transparent font-bold text-xs focus:bg-white/50"
                              placeholder="-"
                              defaultValue={
                                valorRealizado === "" ? "" : String(valorRealizado)
                              }
                              onBlur={(e) =>
                                handleSave(meta.id, mes.id, e.target.value, meta)
                              }
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                <tr className="bg-red-600 text-white font-bold border-t-2">
                  <td className="p-2 sticky left-0 bg-red-600 z-10 text-right pr-4">
                    TOTAL SCORE
                  </td>

                  {/* UNID vazio */}
                  <td className="p-2"></td>

                  <td className="p-2"></td>

                  {/* ✅ soma real dos pesos */}
                  <td className="p-2 text-center">{Number(totalPeso || 0).toFixed(0)}</td>

                  <td className="p-2"></td>

                  {MESES.map((m) => (
                    <td key={m.id} className="p-2 text-center">
                      {m.id === 14 ? "-" : getTotalScore(m.id)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showConfig && (
        <ConfiguracaoGeral
          areasContexto={areas}
          onClose={() => {
            setShowConfig(false);
            fetchMetasData();
          }}
        />
      )}
    </div>
  );
};

export default AdministrativoMetas;
