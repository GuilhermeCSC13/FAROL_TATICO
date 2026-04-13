// src/pages/GestaoAcoes.jsx
import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/tatico/Layout';
import { supabase } from '../supabaseClient';
import { CheckCircle, ExternalLink, Search, Trash2, User, Calendar, Clock, AlertCircle, BarChart2, List } from 'lucide-react';
import ModalDetalhesAcao from '../components/tatico/ModalDetalhesAcao';

const GestaoAcoes = () => {
  const [acoes, setAcoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('lista'); // 'lista' | 'resumo'

  const [acaoSelecionada, setAcaoSelecionada] = useState(null);
  const [showModalDetalhes, setShowModalDetalhes] = useState(false);
  
  // Filtros
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('Todas'); 
  const [filtroResponsavel, setFiltroResponsavel] = useState('Todos'); 
  const [filtroOrigem, setFiltroOrigem] = useState('Todas');

  // Listas para selects
  const [listaResponsaveis, setListaResponsaveis] = useState([]);
  const [listaOrigens, setListaOrigens] = useState([]);

  useEffect(() => {
    fetchAcoes();
  }, []);

  const getStatusAcao = (acao) => {
    if (!acao) return 'Pendente';
    if (acao.status === 'Excluída') return 'Excluída';
    if (acao.status === 'Concluída') return 'Concluída';

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (acao.data_vencimento) {
      const dt = new Date(acao.data_vencimento);
      dt.setHours(0, 0, 0, 0);
      if (dt < hoje) return 'Vencida';
    }
    return 'Pendente';
  };

  const getDiasAtraso = (dataVencimento) => {
    if (!dataVencimento) return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const venc = new Date(dataVencimento);
    venc.setHours(0, 0, 0, 0);

    if (venc >= hoje) return 0;

    const diffTime = Math.abs(hoje - venc);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  };

  const fetchAcoes = async (idParaManterSelecionado = null) => {
    setLoading(true);

    const { data, error } = await supabase
      .from('acoes')
      .select('*')
      .order('data_criacao', { ascending: false });

    if (error) {
      console.error('Erro ao buscar ações:', error);
      setAcoes([]);
      setLoading(false);
      return;
    }

    if (data) {
      setAcoes(data);
      const resps = [...new Set(data.map(item => item.responsavel).filter(Boolean))].sort();
      const origens = [...new Set(data.map(item => item.tipo_reuniao).filter(Boolean))].sort();
      setListaResponsaveis(resps);
      setListaOrigens(origens);

      if (idParaManterSelecionado || acaoSelecionada) {
        const idBusca = idParaManterSelecionado || acaoSelecionada.id;
        const encontrada = data.find(a => a.id === idBusca);
        setAcaoSelecionada(encontrada || null);
      }
    }
    setLoading(false);
  };

  const handleConcluir = async (id) => {
    if (!confirm('Marcar ação como concluída?')) return;
    await supabase
      .from('acoes')
      .update({ status: 'Concluída', data_conclusao: new Date().toISOString() })
      .eq('id', id);
    await fetchAcoes(id);
  };

  const handleAfterSave = (id) => fetchAcoes(id);

  const handleAfterDelete = () => {
    fetchAcoes();
    setAcaoSelecionada(null);
    setShowModalDetalhes(false);
  };

  const acoesFiltradas = useMemo(() => {
    return acoes.filter(acao => {
      const statusCalculado = getStatusAcao(acao);
      const matchTexto = (acao.descricao || '').toLowerCase().includes(filtroTexto.toLowerCase());
      const matchStatus = filtroStatus === 'Todas' ? true : statusCalculado === filtroStatus;
      const matchResp = filtroResponsavel === 'Todos' ? true : acao.responsavel === filtroResponsavel;
      const matchOrigem = filtroOrigem === 'Todas' ? true : acao.tipo_reuniao === filtroOrigem;

      return matchTexto && matchStatus && matchResp && matchOrigem;
    });
  }, [acoes, filtroTexto, filtroStatus, filtroResponsavel, filtroOrigem]);

  const cardsResumo = useMemo(() => {
    let pendente = 0; let vencida = 0; let concluida = 0; let excluida = 0;
    acoesFiltradas.forEach(a => {
      const s = getStatusAcao(a);
      if (s === 'Concluída') concluida++;
      else if (s === 'Vencida') vencida++;
      else if (s === 'Excluída') excluida++;
      else pendente++;
    });
    return { pendente, vencida, concluida, excluida };
  }, [acoesFiltradas]);

  // --------- DADOS DA TELA DE RESUMO ----------
  const dadosDashboard = useMemo(() => {
    const stats = {};
    
    acoesFiltradas.forEach(acao => {
      const s = getStatusAcao(acao);
      if (s === 'Excluída') return;

      const resp = acao.responsavel || 'Sem Responsável';
      if (!stats[resp]) {
        stats[resp] = { total: 0, pendente: 0, vencida: 0, concluida: 0 };
      }
      
      stats[resp].total++;
      if (s === 'Pendente') stats[resp].pendente++;
      if (s === 'Vencida') stats[resp].vencida++;
      if (s === 'Concluída') stats[resp].concluida++;
    });

    const rankingVencidas = Object.entries(stats)
      .map(([nome, dados]) => ({ nome, ...dados }))
      .sort((a, b) => b.vencida - a.vencida || b.total - a.total);

    return rankingVencidas;
  }, [acoesFiltradas]);

  const abrirModalDetalhes = (acao) => {
    setAcaoSelecionada(acao);
    setShowModalDetalhes(true);
  };

  const fecharModalDetalhes = () => {
    setShowModalDetalhes(false);
    setAcaoSelecionada(null);
    fetchAcoes();
  };

  return (
    <Layout>
      <div className="p-8 h-full font-sans flex flex-col bg-gray-50">
        
        {/* Header com Toggle de View */}
        <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-800">Central de Ações e Pendências</h1>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-200 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('lista')}
                className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'lista' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <List size={16} /> Lista
              </button>
              <button
                onClick={() => setViewMode('resumo')}
                className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'resumo' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <BarChart2 size={16} /> Resumo
              </button>
            </div>
            
            {viewMode === 'lista' && (
              <div className="text-sm text-gray-500">
                Total: <b>{acoesFiltradas.length}</b> ações
              </div>
            )}
          </div>
        </div>

        {/* Cards Resumo Gerais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
            <div className="text-xs text-yellow-700 font-bold uppercase">Pendente</div>
            <div className="text-2xl font-bold text-yellow-900">{cardsResumo.pendente}</div>
          </div>
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <div className="text-xs text-red-700 font-bold uppercase">Vencida</div>
            <div className="text-2xl font-bold text-red-900">{cardsResumo.vencida}</div>
          </div>
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
            <div className="text-xs text-green-700 font-bold uppercase">Concluída</div>
            <div className="text-2xl font-bold text-green-900">{cardsResumo.concluida}</div>
          </div>
          <div className="bg-gray-100 border border-gray-300 p-4 rounded-lg">
            <div className="text-xs text-gray-600 font-bold uppercase">Excluída</div>
            <div className="text-2xl font-bold text-gray-800">{cardsResumo.excluida}</div>
          </div>
        </div>

        {viewMode === 'resumo' ? (
          // --------- TELA DE RESUMO ----------
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex-1 overflow-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <AlertCircle className="text-red-500" size={20} />
              Desempenho por Responsável
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold border-b border-gray-200">
                  <tr>
                    <th className="p-3">Responsável</th>
                    <th className="p-3 text-center">Total de Ações</th>
                    <th className="p-3 text-center text-green-600">Concluídas</th>
                    <th className="p-3 text-center text-yellow-600">Pendentes</th>
                    <th className="p-3 text-center text-red-600">Vencidas</th>
                    <th className="p-3 text-center">Taxa de Conclusão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dadosDashboard.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-gray-400">Nenhum dado disponível.</td>
                    </tr>
                  ) : (
                    dadosDashboard.map((row, idx) => {
                      const taxa = row.total > 0 ? Math.round((row.concluida / row.total) * 100) : 0;
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="p-3 font-medium text-gray-800">{row.nome}</td>
                          <td className="p-3 text-center font-bold">{row.total}</td>
                          <td className="p-3 text-center text-green-600 font-semibold">{row.concluida}</td>
                          <td className="p-3 text-center text-yellow-600 font-semibold">{row.pendente}</td>
                          <td className="p-3 text-center text-red-600 font-bold">{row.vencida}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-full bg-gray-200 rounded-full h-2.5 max-w-[100px]">
                                <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${taxa}%` }}></div>
                              </div>
                              <span className="text-xs text-gray-500 w-8">{taxa}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          // --------- TELA DE LISTA ----------
          <>
            {/* Barra de Filtros */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Buscar Descrição</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                  <input 
                    type="text"
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                    placeholder="Digite para buscar..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Status</label>
                <select 
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  <option value="Todas">Todos</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Vencida">Vencida</option>
                  <option value="Concluída">Concluída</option>
                  <option value="Excluída">Excluída</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Responsável</label>
                <select 
                  value={filtroResponsavel}
                  onChange={(e) => setFiltroResponsavel(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  <option value="Todos">Todos</option>
                  {listaResponsaveis.map(resp => (
                    <option key={resp} value={resp}>{resp}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Origem (Reunião)</label>
                <select 
                  value={filtroOrigem}
                  onChange={(e) => setFiltroOrigem(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  <option value="Todas">Todas</option>
                  {listaOrigens.map(origem => (
                    <option key={origem} value={origem}>{origem}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabela de Ações */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
              <div className="overflow-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="p-4 w-24">Status</th>
                      <th className="p-4">Descrição</th>
                      <th className="p-4 w-40">Responsável</th>
                      <th className="p-4 w-32">Abertura</th>
                      <th className="p-4 w-32">Vencimento</th>
                      <th className="p-4 w-32">Origem</th>
                      <th className="p-4 w-24 text-center">Evidência</th>
                      <th className="p-4 w-20 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr><td colSpan="8" className="p-10 text-center text-gray-400">Carregando...</td></tr>
                    ) : acoesFiltradas.length === 0 ? (
                      <tr><td colSpan="8" className="p-10 text-center text-gray-400">Nenhuma ação encontrada.</td></tr>
                    ) : (
                      acoesFiltradas.map(acao => {
                        const statusCalculado = getStatusAcao(acao);
                        const isExcluida = statusCalculado === 'Excluída';
                        const diasAtraso = getDiasAtraso(acao.data_vencimento);

                        const evidenciasAcao = Array.isArray(acao.fotos_acao) ? acao.fotos_acao : Array.isArray(acao.fotos) ? acao.fotos : [];
                        const evidenciasConclusao = Array.isArray(acao.fotos_conclusao) ? acao.fotos_conclusao : [];
                        const primeiraFoto = evidenciasConclusao[0] || evidenciasAcao[0] || null;

                        const quemAbriu = acao.criado_por_nome || 'Sistema';
                        const quandoAbriu = acao.created_at || acao.data_criacao;

                        return (
                          <tr key={acao.id} className={`hover:bg-blue-50/30 transition-colors group cursor-pointer ${isExcluida ? 'opacity-50 bg-gray-50 grayscale' : ''}`} onClick={() => abrirModalDetalhes(acao)}>
                            <td className="p-4">
                              <span className={`px-2.5 py-1 rounded text-[10px] uppercase font-bold border ${statusCalculado === 'Concluída' ? 'bg-green-50 text-green-700 border-green-200' : statusCalculado === 'Vencida' ? 'bg-red-50 text-red-700 border-red-200' : statusCalculado === 'Excluída' ? 'bg-gray-100 text-gray-600 border-gray-300' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                {statusCalculado}
                              </span>
                            </td>
                            <td className={`p-4 font-medium text-gray-800 ${isExcluida ? 'line-through decoration-slate-400' : ''}`}>{acao.descricao}</td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 uppercase border border-gray-200">
                                  {acao.responsavel?.charAt(0)}
                                </div>
                                <span className="text-gray-600 truncate max-w-[120px]" title={acao.responsavel}>{acao.responsavel}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-gray-700 flex items-center gap-1"><User size={10} className="text-blue-500" />{quemAbriu.split(' ')[0]}</span>
                                <span className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5"><Calendar size={10} />{quandoAbriu ? new Date(quandoAbriu).toLocaleDateString() : '-'}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="text-xs text-gray-600 font-medium flex items-center gap-1"><Clock size={12} />{acao.data_vencimento ? new Date(acao.data_vencimento).toLocaleDateString() : '-'}</span>
                                {statusCalculado === 'Vencida' && diasAtraso > 0 && (
                                  <span className="text-[10px] text-red-600 font-bold flex items-center gap-1 mt-0.5 bg-red-50 w-fit px-1 rounded"><AlertCircle size={10} />+{diasAtraso} dias</span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-gray-500 text-xs font-mono">
                              <span className="bg-gray-100 px-2 py-1 rounded border border-gray-200">{acao.tipo_reuniao || 'Geral'}</span>
                            </td>
                            <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                              {primeiraFoto ? <a href={primeiraFoto} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 flex justify-center" title="Ver Evidência"><ExternalLink size={16} /></a> : <span className="text-gray-300">-</span>}
                            </td>
                            <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                              {statusCalculado !== 'Concluída' && statusCalculado !== 'Excluída' && (
                                <button onClick={() => abrirModalDetalhes(acao)} className="p-1.5 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Ver detalhes / concluir"><CheckCircle size={20} /></button>
                              )}
                              {statusCalculado === 'Excluída' && <Trash2 size={16} className="text-gray-300 mx-auto" />}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <ModalDetalhesAcao
          aberto={showModalDetalhes}
          acao={acaoSelecionada}
          status={acaoSelecionada ? getStatusAcao(acaoSelecionada) : 'Pendente'}
          onClose={fecharModalDetalhes}
          onConcluir={() => acaoSelecionada && handleConcluir(acaoSelecionada.id)}
          onAfterSave={handleAfterSave}
          onAfterDelete={handleAfterDelete}
        />
      </div>
    </Layout>
  );
};

export default GestaoAcoes;
