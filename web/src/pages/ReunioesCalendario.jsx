import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/tatico/Layout';
import { supabase } from '../supabaseClient';
import AgendaDatePlanner from "../components/tatico/AgendaDatePlanner";
import { atualizarReuniao } from "../services/agendaService";
import { sortUniqueDates } from "../services/agendaDates";
import { 
  ChevronLeft, ChevronRight, Calendar as CalIcon, 
  List, Grid, X, Clock, Edit2, ArrowRight 
} from 'lucide-react';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const ReunioesCalendario = () => {
  const navigate = useNavigate();
  const [dataAtual, setDataAtual] = useState(new Date(2026, 0, 1));
  const [reunioes, setReunioes] = useState([]);
  const [loading, setLoading] = useState(true);

  // 'month' = grade mensal, 'week' = grade semanal + lista da semana, 'list' = lista do mês
  const [viewMode, setViewMode] = useState('month');

  // Estado do Modal de Edição Rápida
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editForm, setEditForm] = useState({
    date: '',
    time: '',
    mode: 'unica',
    dates: [],
    rule: 'semanal',
  });

  // Drag & Drop
  const [draggingEvent, setDraggingEvent] = useState(null);

  useEffect(() => {
    fetchReunioesPeriodo();
  }, [dataAtual]);

  const fetchReunioesPeriodo = async () => {
    setLoading(true);

    // Busca do primeiro dia do mês - 7 dias até último dia + 7 dias, para cobrir semanas que cruzam meses
    const ano = dataAtual.getFullYear();
    const mes = dataAtual.getMonth();

    const inicio = new Date(ano, mes, 1);
    inicio.setDate(inicio.getDate() - 7);

    const fim = new Date(ano, mes + 1, 0, 23, 59, 59);
    fim.setDate(fim.getDate() + 7);

    const start = inicio.toISOString();
    const end = fim.toISOString();

    const { data } = await supabase
      .from('reunioes')
      .select('*')
      .gte('data_hora', start)
      .lte('data_hora', end)
      .order('data_hora');

    setReunioes(data || []);
    setLoading(false);
  };

  const mudarMes = (offset) => {
    setDataAtual(new Date(dataAtual.getFullYear(), dataAtual.getMonth() + offset, 1));
  };

  // ---------------------------------
  // EDIÇÃO / DETALHES
  // ---------------------------------
  const handleEventClick = (e, evento) => {
    e.stopPropagation();
    const dt = new Date(evento.data_hora);
    const dateKey = dt.toISOString().split('T')[0];
    setSelectedEvent(evento);
    setEditForm({
      date: dateKey,
      time: dt.toTimeString().substring(0, 5),
      mode: 'unica',
      dates: [dateKey],
      rule: 'semanal',
    });
    setModalOpen(true);
  };

  const salvarAlteracao = async () => {
    if (!selectedEvent) return;

    const novaData = `${editForm.date}T${editForm.time}:00`;
    const agendaMode = editForm.mode || 'unica';
    const rawDates =
      Array.isArray(editForm.dates) && editForm.dates.length > 0
        ? editForm.dates
        : [editForm.date];
    const datasSelecionadas =
      agendaMode === 'multipla'
        ? sortUniqueDates(rawDates)
        : [editForm.date];

    const { error } = await atualizarReuniao(
      selectedEvent.id,
      { data_hora: novaData },
      {
        mode: agendaMode,
        selectedDates: datasSelecionadas,
        rule: editForm.rule || 'semanal',
        count: 6,
        timeValue: editForm.time,
      }
    );

    if (!error) {
      setModalOpen(false);
      await fetchReunioesPeriodo();
    } else {
      alert('Erro ao remarcar.');
    }
  };

  const irParaDetalhes = () => {
    navigate(`/reunioes/${selectedEvent.id}`);
  };

  // ---------------------------------
  // HELPER DE DATAS
  // ---------------------------------
  const getDiasNoMes = () => {
    const ano = dataAtual.getFullYear();
    const mes = dataAtual.getMonth();
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const diasTotal = new Date(ano, mes + 1, 0).getDate();
    const dias = [];
    for (let i = 0; i < primeiroDiaSemana; i++) dias.push(null);
    for (let i = 1; i <= diasTotal; i++) dias.push(new Date(ano, mes, i));
    return dias;
  };

  const getDiasSemanaAtual = () => {
    const base = dataAtual;
    const diaSemana = base.getDay(); // 0 = Dom
    const inicioSemana = new Date(base.getFullYear(), base.getMonth(), base.getDate() - diaSemana);
    const dias = [];
    for (let i = 0; i < 7; i++) {
      dias.push(
        new Date(
          inicioSemana.getFullYear(),
          inicioSemana.getMonth(),
          inicioSemana.getDate() + i
        )
      );
    }
    return dias;
  };

  const eventosDoDia = (diaDate) => {
    if (!diaDate) return [];
    const diaStr = diaDate.toISOString().split('T')[0];
    return reunioes.filter((r) => r.data_hora.startsWith(diaStr));
  };

  const resumoPauta = (pauta) => {
    if (!pauta) return '';
    const clean = pauta.replace(/[#*_>\-]/g, ' ');
    return clean.length > 140 ? clean.slice(0, 140) + '...' : clean;
  };

  // ---------------------------------
  // DRAG & DROP
  // ---------------------------------
  const handleDragStart = (e, evento) => {
    setDraggingEvent(evento);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingEvent(null);
  };

  const handleDropOnDay = async (e, diaDestino) => {
    e.preventDefault();
    if (!draggingEvent) return;

    try {
      const origem = new Date(draggingEvent.data_hora);
      const novaDataHora = new Date(
        diaDestino.getFullYear(),
        diaDestino.getMonth(),
        diaDestino.getDate(),
        origem.getHours(),
        origem.getMinutes(),
        origem.getSeconds()
      );
      const novaIso = novaDataHora.toISOString();

      const { error } = await supabase
        .from('reunioes')
        .update({ data_hora: novaIso })
        .eq('id', draggingEvent.id);

      if (error) throw error;

      setReunioes((prev) =>
        prev.map((r) =>
          r.id === draggingEvent.id ? { ...r, data_hora: novaIso } : r
        )
      );
    } catch (err) {
      console.error(err);
      alert('Erro ao mover reunião.');
    } finally {
      setDraggingEvent(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // ---------------------------------
  // RENDER
  // ---------------------------------
  const diasMes = getDiasNoMes();
  const diasSemana = getDiasSemanaAtual();

  return (
    <Layout>
      <div className="p-6 h-full flex flex-col font-sans bg-gray-50 relative">
        {/* Header e Controles */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200 gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
              <CalIcon size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800 capitalize">
                {MESES[dataAtual.getMonth()]}{' '}
                <span className="text-gray-400">{dataAtual.getFullYear()}</span>
              </h1>
              <p className="text-xs text-gray-500">Agenda Tática Integrada</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Toggle de Visualização */}
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-2 rounded-md flex items-center gap-2 text-sm font-bold transition-all ${
                  viewMode === 'month'
                    ? 'bg-white text-blue-600 shadow'
                    : 'text-gray-500'
                }`}
              >
                <Grid size={16} /> Mensal
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-2 rounded-md flex items-center gap-2 text-sm font-bold transition-all ${
                  viewMode === 'week'
                    ? 'bg-white text-blue-600 shadow'
                    : 'text-gray-500'
                }`}
              >
                <Grid size={16} /> Semanal
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 rounded-md flex items-center gap-2 text-sm font-bold transition-all ${
                  viewMode === 'list'
                    ? 'bg-white text-blue-600 shadow'
                    : 'text-gray-500'
                }`}
              >
                <List size={16} /> Lista
              </button>
            </div>

            <div className="w-px h-8 bg-gray-200"></div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => mudarMes(-1)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <ChevronLeft />
              </button>
              <button
                onClick={() => setDataAtual(new Date())}
                className="px-4 py-1 text-sm bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-100"
              >
                Hoje
              </button>
              <button
                onClick={() => mudarMes(1)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        </div>

        {/* --- CONTEÚDO PRINCIPAL --- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
          {/* MODO MENSAL (GRADE) */}
          {viewMode === 'month' && (
            <>
              <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                {DIAS_SEMANA.map((d) => (
                  <div
                    key={d}
                    className="py-3 text-center text-sm font-bold text-gray-500 uppercase"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 flex-1 auto-rows-fr overflow-y-auto">
                {diasMes.map((dia, idx) => {
                  if (!dia)
                    return (
                      <div
                        key={idx}
                        className="bg-gray-50/50 border-b border-r border-gray-100"
                      ></div>
                    );

                  const eventosDia = eventosDoDia(dia);
                  const isToday =
                    dia.toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={idx}
                      className="border-b border-r border-gray-100 p-1 min-h-[100px] relative hover:bg-blue-50/20 transition-colors group"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnDay(e, dia)}
                    >
                      <span
                        className={`text-sm font-bold ml-1 ${
                          isToday
                            ? 'bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded-full'
                            : 'text-gray-700'
                        }`}
                      >
                        {dia.getDate()}
                      </span>
                      <div className="mt-1 flex flex-col gap-1 overflow-y-auto max-h-[100px] custom-scrollbar">
                        {eventosDia.map((ev) => {
                          const dt = new Date(ev.data_hora);
                          const horaStr = `${String(
                            dt.getHours()
                          ).padStart(2, '0')}:${String(
                            dt.getMinutes()
                          ).padStart(2, '0')}`;

                          return (
                            <div
                              key={ev.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, ev)}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => handleEventClick(e, ev)}
                              className="text-[10px] px-2 py-1 rounded cursor-pointer font-semibold text-gray-800 shadow-sm hover:opacity-80 transition-opacity truncate border-l-4 border-black/10 flex items-center justify-between"
                              style={{ backgroundColor: ev.cor || '#E5E7EB' }}
                              title={ev.titulo}
                            >
                              <span className="truncate">{ev.titulo}</span>
                              <span className="opacity-60 text-[9px]">
                                {horaStr}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* MODO SEMANAL (GRADE + LISTA DA SEMANA) */}
          {viewMode === 'week' && (
            <>
              {/* Grade semanal */}
              <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                {DIAS_SEMANA.map((d) => (
                  <div
                    key={d}
                    className="py-3 text-center text-sm font-bold text-gray-500 uppercase"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 border-b border-gray-200 min-h-[140px]">
                {diasSemana.map((dia, idx) => {
                  const eventosDia = eventosDoDia(dia);
                  const isToday =
                    dia.toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={idx}
                      className="border-r border-gray-100 p-2 hover:bg-blue-50/20 transition-colors"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnDay(e, dia)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-sm font-bold ${
                            isToday ? 'text-blue-700' : 'text-gray-700'
                          }`}
                        >
                          {dia.getDate()}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 max-h-[100px] overflow-y-auto custom-scrollbar">
                        {eventosDia.map((ev) => {
                          const dt = new Date(ev.data_hora);
                          const horaStr = dt.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          });

                          return (
                            <div
                              key={ev.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, ev)}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => handleEventClick(e, ev)}
                              className="text-[11px] px-2 py-1 rounded cursor-pointer font-semibold text-gray-800 shadow-sm hover:opacity-80 transition-opacity border-l-4 border-black/10 truncate"
                              style={{ backgroundColor: ev.cor || '#E5E7EB' }}
                            >
                              <span className="block truncate">
                                {ev.titulo}
                              </span>
                              <span className="text-[10px] text-gray-600">
                                {horaStr}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Lista da semana, separada por dia */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {diasSemana.map((dia) => {
                  const eventosDia = eventosDoDia(dia);
                  if (eventosDia.length === 0) return null;
                  const diaStr = dia.toISOString().split('T')[0];

                  return (
                    <div key={diaStr} className="flex gap-4">
                      <div className="w-24 text-right pt-2">
                        <p className="text-2xl font-bold text-gray-800">
                          {dia.getDate()}
                        </p>
                        <p className="text-sm text-gray-400 uppercase font-bold">
                          {DIAS_SEMANA[dia.getDay()]}
                        </p>
                      </div>
                      <div className="flex-1 space-y-3 pb-6 border-l-2 border-gray-100 pl-6">
                        {eventosDia.map((ev) => (
                          <div
                            key={ev.id}
                            onClick={(e) => handleEventClick(e, ev)}
                            className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col gap-1 group"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: ev.cor || 'gray' }}
                                ></div>
                                <div>
                                  <h3 className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
                                    {ev.titulo}
                                  </h3>
                                  <p className="text-xs text-gray-500 flex items-center gap-1">
                                    <Clock size={12} />{' '}
                                    {new Date(ev.data_hora).toLocaleTimeString(
                                      [],
                                      { hour: '2-digit', minute: '2-digit' }
                                    )}{' '}
                                    • {ev.tipo_reuniao}
                                  </p>
                                </div>
                              </div>
                              <div className="text-gray-300 group-hover:text-blue-500">
                                <Edit2 size={16} />
                              </div>
                            </div>

                            {ev.pauta && (
                              <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                                {resumoPauta(ev.pauta)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* MODO LISTA (AGENDA MENSAL) */}
          {viewMode === 'list' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {diasMes
                .filter((d) => d !== null)
                .map((dia) => {
                  const eventosDia = eventosDoDia(dia);
                  if (eventosDia.length === 0) return null;

                  const diaStr = dia.toISOString().split('T')[0];

                  return (
                    <div key={diaStr} className="flex gap-4">
                      <div className="w-24 text-right pt-2">
                        <p className="text-2xl font-bold text-gray-800">
                          {dia.getDate()}
                        </p>
                        <p className="text-sm text-gray-400 uppercase font-bold">
                          {DIAS_SEMANA[dia.getDay()]}
                        </p>
                      </div>
                      <div className="flex-1 space-y-3 pb-6 border-l-2 border-gray-100 pl-6">
                        {eventosDia.map((ev) => (
                          <div
                            key={ev.id}
                            onClick={(e) => handleEventClick(e, ev)}
                            className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col gap-1 group"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: ev.cor || 'gray' }}
                                ></div>
                                <div>
                                  <h3 className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
                                    {ev.titulo}
                                  </h3>
                                  <p className="text-xs text-gray-500 flex items-center gap-1">
                                    <Clock size={12} />{' '}
                                    {new Date(ev.data_hora).toLocaleTimeString(
                                      [],
                                      { hour: '2-digit', minute: '2-digit' }
                                    )}{' '}
                                    • {ev.tipo_reuniao}
                                  </p>
                                </div>
                              </div>
                              <div className="text-gray-300 group-hover:text-blue-500">
                                <Edit2 size={16} />
                              </div>
                            </div>

                            {ev.pauta && (
                              <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                                {resumoPauta(ev.pauta)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              {reunioes.length === 0 && (
                <p className="text-center text-gray-400 py-20">
                  Nenhuma reunião neste período.
                </p>
              )}
            </div>
          )}
        </div>

        {/* MODAL DE EDIÇÃO RÁPIDA / DETALHES */}
        {modalOpen && selectedEvent && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800">Gerenciar Reunião</h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  {selectedEvent.titulo}
                </h2>

                <div className="space-y-4">
                  <AgendaDatePlanner
                    label="Remarcar agenda"
                    helperText="Use uma data única ou selecione várias datas com atalhos."
                    mode={editForm.mode}
                    onModeChange={(value) => setEditForm((prev) => ({ ...prev, mode: value }))}
                    singleDate={editForm.date}
                    onSingleDateChange={(value) =>
                      setEditForm((prev) => ({ ...prev, date: value }))
                    }
                    selectedDates={editForm.dates}
                    onSelectedDatesChange={(values) =>
                      setEditForm((prev) => ({ ...prev, dates: values }))
                    }
                    recurrenceRule={editForm.rule}
                    onRecurrenceRuleChange={(value) =>
                      setEditForm((prev) => ({ ...prev, rule: value }))
                    }
                  />

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                      Remarcar Horário
                    </label>
                    <input
                      type="time"
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-100 outline-none"
                      value={editForm.time}
                      onChange={(e) =>
                        setEditForm({ ...editForm, time: e.target.value })
                      }
                    />
                  </div>

                  {/* Pautas principais (preview) */}
                  {selectedEvent.pauta && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                        Pautas principais
                      </label>
                      <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-line">
                        {selectedEvent.pauta}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex gap-3">
                  <button
                    onClick={salvarAlteracao}
                    className="flex-1 bg-gray-800 text-white py-2.5 rounded-lg font-bold hover:bg-gray-900 transition-colors text-sm"
                  >
                    Salvar Mudança
                  </button>
                  <button
                    onClick={() => navigate(`/central-reunioes?editId=${selectedEvent.id}`)}
                    className="flex-1 bg-white text-slate-700 border border-slate-200 py-2.5 rounded-lg font-bold hover:bg-slate-50 transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    Edição completa
                  </button>
                  <button
                    onClick={irParaDetalhes}
                    className="flex-1 bg-blue-50 text-blue-700 border border-blue-200 py-2.5 rounded-lg font-bold hover:bg-blue-100 transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    Abrir Ata <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ReunioesCalendario;
