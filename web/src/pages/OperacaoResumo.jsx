import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { AlertTriangle, TrendingUp, CheckCircle, Target, Settings } from 'lucide-react';
import ConfiguracaoGeral from '../components/tatico/ConfiguracaoGeral';
import { useSearchParams } from 'react-router-dom';
import { getMesAtualFarol } from '../utils/farolUtils';

// Meses usados no seletor e nos textos
const MESES = [
  { id: 1, label: 'Jan/26' },
  { id: 2, label: 'Fev/26' },
  { id: 3, label: 'Mar/26' },
  { id: 4, label: 'Abr/26' },
  { id: 5, label: 'Mai/26' },
  { id: 6, label: 'Jun/26' },
  { id: 7, label: 'Jul/26' },
  { id: 8, label: 'Ago/26' },
  { id: 9, label: 'Set/26' },
  { id: 10, label: 'Out/26' },
  { id: 11, label: 'Nov/26' },
  { id: 12, label: 'Dez/26' }
];

const OperacaoResumo = () => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  // Novo: filtro de mês e de área
  const [mesSelecionado, setMesSelecionado] = useState(getMesAtualFarol())
  const [areaFiltro, setAreaFiltro] = useState(searchParams.get("area") || '4');          // '4' | '5'

  const [metrics, setMetrics] = useState({
    scoreAtual: 0,
    metasBatidas: 0,
    criticos: 0,
    totalMetas: 0,
    totalPeso: 0
  });
  const [chartData, setChartData] = useState([]);
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    fetchDashboardData();
    // Recarrega sempre que mudar mês ou área filtrada
  }, [mesSelecionado, areaFiltro]);

  useEffect(() => {
    const areaParam = searchParams.get("area");
    if (areaParam && areaParam !== areaFiltro) {
      setAreaFiltro(areaParam);
    }
  }, [searchParams, areaFiltro]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Busca Metas (Definições) filtrando por área
      let queryMetas = supabase.from('metas_farol').select('*');

      queryMetas = queryMetas.eq('area_id', Number(areaFiltro));

      const { data: metas, error: errMetas } = await queryMetas;
      if (errMetas) throw errMetas;

      // 2. Busca Metas Mensais (Alvos)
      const { data: alvos, error: errAlvos } = await supabase
        .from('metas_farol_mensal')
        .select('*')
        .eq('ano', 2026);
      if (errAlvos) throw errAlvos;

      // 3. Busca Resultados (Realizado)
      const { data: realizados, error: errReal } = await supabase
        .from('resultados_farol')
        .select('*')
        .eq('ano', 2026);
      if (errReal) throw errReal;

      if (!metas || metas.length === 0) {
        setMetrics({
          scoreAtual: 0,
          metasBatidas: 0,
          criticos: 0,
          totalMetas: 0,
          totalPeso: 0
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

      // Soma total de pesos das metas consideradas (denominador do score global)
      const totalPesoMeta = metas.reduce(
        (acc, meta) => acc + (Number(meta.peso) || 0),
        0
      );

      // --- PROCESSAMENTO DO MÊS SELECIONADO (KPIs + Alertas) ---
      metas.forEach(meta => {
        const alvo = alvos.find(
          a => a.meta_id === meta.id && a.mes === MES_ATUAL
        )?.valor_meta;

        const real = realizados.find(
          r => r.meta_id === meta.id && r.mes === MES_ATUAL
        )?.valor_realizado;

        const { score, faixa } = calculateScore(
          alvo,
          real,
          meta.tipo_comparacao,
          meta.peso
        );

        somaScore += score;

        if (faixa === 1) countBatidas++;
        if (faixa === 5) {
          countCriticas++;
          listaAlertas.push({
            nome: meta.nome_meta || meta.indicador,
            alvo: alvo,
            real: real,
            unidade: meta.unidade
          });
        }
      });

      // --- Dados para o Gráfico (1º semestre) ---
      const historico = [1, 2, 3, 4, 5, 6].map(mesId => {
        let scoreMes = 0;
        metas.forEach(meta => {
          const alvo = alvos.find(
            a => a.meta_id === meta.id && a.mes === mesId
          )?.valor_meta;

          const real = realizados.find(
            r => r.meta_id === meta.id && r.mes === mesId
          )?.valor_realizado;

          const { score } = calculateScore(
            alvo,
            real,
            meta.tipo_comparacao,
            meta.peso
          );
          scoreMes += score;
        });

        const mesesLabel = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
        return {
          name: mesesLabel[mesId - 1],
          score: Number(scoreMes.toFixed(1))
        };
      });

      setMetrics({
        scoreAtual: Number(somaScore.toFixed(1)),
        metasBatidas: countBatidas,
        criticos: countCriticas,
        totalMetas: metas.length,
        totalPeso: totalPesoMeta
      });
      setChartData(historico);
      setAlertas(listaAlertas);
    } catch (error) {
      console.error('Erro Dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateScore = (meta, realizado, tipo, pesoTotal) => {
    if (
      meta === null ||
      meta === undefined ||
      realizado === null ||
      realizado === '' ||
      isNaN(parseFloat(realizado))
    ) {
      return { score: 0, faixa: 0 };
    }

    const r = parseFloat(realizado);
    const m = parseFloat(meta);
    if (isNaN(r) || isNaN(m) || m === 0) return { score: 0, faixa: 0 };

    let atingimento = 0;
    if (tipo === '>=' || tipo === 'maior') {
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

    return { score: parseFloat(pesoTotal) * multiplicador, faixa };
  };

  const mesLabel =
    MESES.find(m => m.id === mesSelecionado)?.label || 'Jan/26';

  const areaLabel =
    areaFiltro === '4'
      ? 'PCO'
      : 'Gestão de Motoristas';

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            Visão Geral — {areaLabel}
          </h2>
          <p className="text-sm text-gray-500">
            Acompanhamento consolidado de performance —{' '}
            <span className="font-semibold">{mesLabel}</span>{' '}
            <span className="text-gray-400">({areaLabel})</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro de Área */}
          <select
            value={areaFiltro}
            onChange={e => setAreaFiltro(e.target.value)}
            className="hidden"
          >
            <option value="4">PCO</option>
            <option value="5">Gestão de Motoristas</option>
          </select>

          {/* Filtro de Mês */}
          <select
            value={mesSelecionado}
            onChange={e => setMesSelecionado(Number(e.target.value))}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {MESES.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          {/* Botão Configuração */}
          <button
            onClick={() => setShowConfig(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-700"
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
          Carregando indicadores...
        </div>
      ) : (
        <>
          {/* CARDS DE KPI */}
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
                  {Number(metrics.scoreAtual || 0).toFixed(1)}{' '}
                  {metrics.totalPeso > 0 && (
                    <span className="text-xs text-gray-400 font-normal">
                      / {metrics.totalPeso}
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
                  {metrics.metasBatidas}{' '}
                  <span className="text-xs text-gray-400 font-normal">
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
              <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                <TrendingUp size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">
                  Tendência
                </p>
                <h3 className="text-sm font-bold text-purple-700">
                  Estável
                </h3>
              </div>
            </div>
          </div>

          {/* ÁREA PRINCIPAL */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">
            {/* GRÁFICO */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
              <h3 className="font-bold text-gray-700 mb-6">
                Evolução do Score (1º Semestre)
              </h3>
              <div className="flex-1 w-full h-full min-h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f0f0f0"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#9ca3af', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#9ca3af', fontSize: 12 }}
                    />
                    <Tooltip
                      cursor={{ fill: '#f3f4f6' }}
                      contentStyle={{
                        borderRadius: '8px',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                      formatter={(value) => [`${value} pts`, 'Score']}
                    />
                    <Bar
                      dataKey="score"
                      radius={[4, 4, 0, 0]}
                      barSize={40}
                    >
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.score >= 90
                              ? '#4ade80'
                              : entry.score >= 70
                              ? '#facc15'
                              : '#f87171'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* LISTA DE ALERTAS */}
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
                          Meta:{' '}
                          <strong>
                            {item.alvo != null
                              ? Number(item.alvo).toFixed(2)
                              : '-'}
                          </strong>
                        </span>
                        <span>
                          Real:{' '}
                          <strong>
                            {item.real != null
                              ? Number(item.real).toFixed(2)
                              : '-'}
                          </strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* MODAL DE CONFIGURAÇÃO */}
          {showConfig && (
            <ConfiguracaoGeral
              onClose={() => {
                setShowConfig(false);
                fetchDashboardData(); // Recarrega com metas atualizadas
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default OperacaoResumo;
