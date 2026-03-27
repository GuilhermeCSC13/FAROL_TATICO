import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  TrendingUp,
  CheckCircle,
  Target,
  Settings,
} from "lucide-react";
import ConfiguracaoGeral from "../components/tatico/ConfiguracaoGeral";

const AREAS_MANUTENCAO = [
  { id: 2, nome: "Manutenção" },
  { id: 9, nome: "PCM" },
];

const MESES = [
  { id: 1, label: "Jan/26" },
  { id: 2, label: "Fev/26" },
  { id: 3, label: "Mar/26" },
  { id: 4, label: "Abr/26" },
  { id: 5, label: "Mai/26" },
  { id: 6, label: "Jun/26" },
  { id: 7, label: "Jul/26" },
  { id: 8, label: "Ago/26" },
  { id: 9, label: "Set/26" },
  { id: 10, label: "Out/26" },
  { id: 11, label: "Nov/26" },
  { id: 12, label: "Dez/26" },
];

function parseNumberPtBr(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

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
  return Number.isFinite(n) ? n : null;
}

const ManutencaoResumo = () => {
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  const [mesSelecionado, setMesSelecionado] = useState(1);
  const [areaFiltro, setAreaFiltro] = useState("ALL"); // ALL | 2 | 9

  const [metrics, setMetrics] = useState({
    scoreAtual: 0,
    metasBatidas: 0,
    criticos: 0,
    totalMetas: 0,
    totalPeso: 0,
  });

  const [chartData, setChartData] = useState([]);
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesSelecionado, areaFiltro]);

  const calculateScore = (meta, realizado, tipo, pesoTotal) => {
    if (
      meta === null ||
      meta === undefined ||
      realizado === null ||
      realizado === undefined ||
      realizado === "" ||
      isNaN(parseFloat(realizado))
    ) {
      return { score: 0, faixa: 0 };
    }

    const r = parseFloat(realizado);
    const m = parseFloat(meta);

    if (isNaN(r) || isNaN(m) || m === 0) {
      return { score: 0, faixa: 0 };
    }

    let atingimento = 0;

    if (tipo === ">=" || tipo === "maior") {
      atingimento = r / m;
    } else {
      atingimento = 1 + (m - r) / m;
    }

    let multiplicador = 0;
    let faixa = 5;

    if (atingimento >= 1.0) {
      multiplicador = 1.0;
      faixa = 1;
    } else if (atingimento >= 0.99) {
      multiplicador = 0.75;
      faixa = 2;
    } else if (atingimento >= 0.98) {
      multiplicador = 0.5;
      faixa = 3;
    } else if (atingimento >= 0.97) {
      multiplicador = 0.25;
      faixa = 4;
    } else {
      multiplicador = 0.0;
      faixa = 5;
    }

    return {
      score: (parseNumberPtBr(pesoTotal) ?? 0) * multiplicador,
      faixa,
    };
  };

  const fetchDashboardData = async () => {
    setLoading(true);

    try {
      let queryMetas = supabase.from("metas_farol").select("*");

      if (areaFiltro === "ALL") {
        queryMetas = queryMetas.in("area_id", [2, 9]);
      } else {
        queryMetas = queryMetas.eq("area_id", Number(areaFiltro));
      }

      const { data: metas, error: errMetas } = await queryMetas;
      if (errMetas) throw errMetas;

      const { data: alvos, error: errAlvos } = await supabase
        .from("metas_farol_mensal")
        .select("*")
        .eq("ano", 2026);

      if (errAlvos) throw errAlvos;

      const { data: realizados, error: errReal } = await supabase
        .from("resultados_farol")
        .select("*")
        .eq("ano", 2026);

      if (errReal) throw errReal;

      if (!metas || metas.length === 0) {
        setMetrics({
          scoreAtual: 0,
          metasBatidas: 0,
          criticos: 0,
          totalMetas: 0,
          totalPeso: 0,
        });
        setChartData([]);
        setAlertas([]);
        setLoading(false);
        return;
      }

      const MES_ATUAL = mesSelecionado;

      let somaScore = 0;
      let countBatidas = 0;
      let countCriticas = 0;
      const listaAlertas = [];

      const totalPesoMeta = metas.reduce(
        (acc, meta) => acc + (parseNumberPtBr(meta.peso) ?? 0),
        0
      );

      metas.forEach((meta) => {
        const alvo = alvos.find(
          (a) => a.meta_id === meta.id && a.mes === MES_ATUAL
        )?.valor_meta;

        const real = realizados.find(
          (r) => r.meta_id === meta.id && r.mes === MES_ATUAL
        )?.valor_realizado;

        const alvoNum = parseNumberPtBr(alvo);
        const realNum = parseNumberPtBr(real);

        const { score, faixa } = calculateScore(
          alvoNum,
          realNum,
          meta.tipo_comparacao,
          meta.peso
        );

        somaScore += score;

        if (faixa === 1) countBatidas++;
        if (faixa >= 4) {
          countCriticas++;
          listaAlertas.push({
            nome: meta.nome_meta || meta.indicador || "Indicador",
            alvo: alvoNum,
            real: realNum,
          });
        }
      });

      const historico = [1, 2, 3, 4, 5, 6].map((mesId) => {
        let scoreMes = 0;

        metas.forEach((meta) => {
          const alvo = alvos.find(
            (a) => a.meta_id === meta.id && a.mes === mesId
          )?.valor_meta;

          const real = realizados.find(
            (r) => r.meta_id === meta.id && r.mes === mesId
          )?.valor_realizado;

          const { score } = calculateScore(
            parseNumberPtBr(alvo),
            parseNumberPtBr(real),
            meta.tipo_comparacao,
            meta.peso
          );

          scoreMes += score;
        });

        const mesesLabel = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];

        return {
          name: mesesLabel[mesId - 1],
          score: Number(scoreMes.toFixed(1)),
        };
      });

      setMetrics({
        scoreAtual: Number(somaScore.toFixed(1)),
        metasBatidas: countBatidas,
        criticos: countCriticas,
        totalMetas: metas.length,
        totalPeso: totalPesoMeta,
      });

      setChartData(historico);
      setAlertas(listaAlertas);
    } catch (error) {
      console.error("Erro Dashboard Manutenção:", error);
    } finally {
      setLoading(false);
    }
  };

  const mesLabel =
    MESES.find((m) => m.id === mesSelecionado)?.label || "Jan/26";

  const areaLabel =
    areaFiltro === "ALL"
      ? "PCM + Manutenção"
      : areaFiltro === "9"
      ? "PCM"
      : "Manutenção";

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            Visão Geral — Manutenção
          </h2>
          <p className="text-sm text-gray-500">
            Acompanhamento consolidado de performance —{" "}
            <span className="font-semibold">{mesLabel}</span>{" "}
            <span className="text-gray-400">({areaLabel})</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={areaFiltro}
            onChange={(e) => setAreaFiltro(e.target.value)}
            className="bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-3 py-2 font-semibold shadow-sm"
          >
            <option value="ALL">Manutenção (PCM + Manutenção)</option>
            <option value="9">PCM</option>
            <option value="2">Manutenção</option>
          </select>

          <select
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(Number(e.target.value))}
            className="bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-3 py-2 font-semibold shadow-sm"
          >
            {MESES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-gray-700 transition-colors shadow-sm"
          >
            <Settings size={16} /> Configurar Metas e Rotinas
          </button>

          <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
            Última atualização: Hoje
          </span>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-gray-400">
          Carregando indicadores.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <Target size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">
                  Score Global
                </p>
                <h3 className="text-2xl font-bold text-gray-800">
                  {metrics.scoreAtual.toFixed(1)}{" "}
                  {metrics.totalPeso > 0 && (
                    <span className="text-xs text-gray-400 font-normal">
                      / {metrics.totalPeso.toFixed(0)}
                    </span>
                  )}
                </h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                <CheckCircle size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">
                  Metas Batidas
                </p>
                <h3 className="text-2xl font-bold text-gray-800">
                  {metrics.metasBatidas}
                  <span className="text-xs text-gray-400 font-normal">
                    {" "}
                    / {metrics.totalMetas}
                  </span>
                </h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">
                  Indicadores Críticos
                </p>
                <h3 className="text-2xl font-bold text-gray-800">
                  {metrics.criticos}
                </h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="p-3 bg-yellow-50 text-yellow-600 rounded-lg">
                <TrendingUp size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">
                  Atingimento
                </p>
                <h3 className="text-2xl font-bold text-gray-800">
                  {metrics.totalMetas > 0
                    ? ((metrics.metasBatidas / metrics.totalMetas) * 100).toFixed(0)
                    : 0}
                  %
                </h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-700 mb-4">
                Evolução do Score — 1º Semestre
              </h3>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.score >= 90
                              ? "#4ade80"
                              : entry.score >= 70
                              ? "#facc15"
                              : "#f87171"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-y-auto">
              <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" />
                Atenção Necessária
              </h3>

              {alertas.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  Nenhum indicador crítico encontrado.
                </div>
              ) : (
                <div className="space-y-3">
                  {alertas.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r-md"
                    >
                      <p className="text-xs font-bold text-red-800 uppercase mb-1">
                        {item.nome}
                      </p>
                      <div className="flex justify-between text-xs text-red-700">
                        <span>
                          Meta:{" "}
                          <strong>
                            {item.alvo != null
                              ? Number(item.alvo).toFixed(2)
                              : "-"}
                          </strong>
                        </span>
                        <span>
                          Real:{" "}
                          <strong>
                            {item.real != null
                              ? Number(item.real).toFixed(2)
                              : "-"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {showConfig && (
            <ConfiguracaoGeral
              onClose={() => {
                setShowConfig(false);
                fetchDashboardData();
              }}
              areasContexto={AREAS_MANUTENCAO}
            />
          )}
        </>
      )}
    </div>
  );
};

export default ManutencaoResumo;
