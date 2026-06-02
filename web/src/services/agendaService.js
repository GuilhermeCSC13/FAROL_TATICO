import { addDays, addMonths } from "date-fns";
import { supabase } from "../supabaseClient";
import {
  buildDateTimeValue,
  extractTimeValue,
  generateRecurringDates,
  sortUniqueDates,
} from "./agendaDates";

export const gerarDatasRecorrentes = (dataInicialISO, regra, qtd = 12) => {
  const datas = [];
  let dataBase = new Date(dataInicialISO);

  for (let i = 0; i < qtd; i += 1) {
    datas.push(new Date(dataBase));
    if (regra === "semanal") dataBase = addDays(dataBase, 7);
    if (regra === "quinzenal") dataBase = addDays(dataBase, 15);
    if (regra === "mensal") dataBase = addMonths(dataBase, 1);
  }

  return datas;
};

function parseRecurrenceConfig(recorrencia) {
  if (typeof recorrencia === "string") {
    return { mode: recorrencia };
  }

  return recorrencia || {};
}

function buildBasePayload(dados) {
  const {
    titulo,
    data_hora,
    cor,
    area_id,
    responsavel,
    ata,
    status,
    tipo_reuniao_id,
    tipo_reuniao_legacy,
    duracao_segundos,
    materiais,
  } = dados;

  return {
    titulo,
    data_hora,
    cor,
    area_id,
    responsavel,
    ata,
    status: status || "Agendada",
    tipo_reuniao_id: tipo_reuniao_id || null,
    tipo_reuniao_legacy: tipo_reuniao_legacy || "Geral",
    duracao_segundos: duracao_segundos ?? null,
    ...(typeof materiais !== "undefined" ? { materiais } : {}),
  };
}

export const salvarReuniao = async (dados, regraRecorrencia) => {
  const config = parseRecurrenceConfig(regraRecorrencia);
  const modo = String(config.mode || "unica").toLowerCase();
  const basePayload = buildBasePayload(dados);
  const datasSelecionadas = sortUniqueDates(
    config.selectedDates || config.datasSelecionadas || []
  );
  const horaBase = extractTimeValue(
    config.timeValue || basePayload.data_hora || "09:00",
    "09:00"
  );

  if (modo !== "multipla" && modo !== "multiple" && datasSelecionadas.length <= 1) {
    return await supabase.from("reunioes").insert([basePayload]);
  }

  const datas =
    datasSelecionadas.length > 0
      ? datasSelecionadas
      : gerarDatasRecorrentes(
          basePayload.data_hora,
          config.rule || config.recurrenceRule || "semanal",
          config.count || 6
        ).map((dt) => (dt instanceof Date ? dt.toISOString().slice(0, 10) : String(dt)));

  const payloadSerie = datas.map((dateKey) => ({
    ...basePayload,
    data_hora: buildDateTimeValue(dateKey, horaBase),
  }));

  return await supabase.from("reunioes").insert(payloadSerie);
};

export const atualizarReuniao = async (id, novosDados, aplicarEmSerie = false) => {
  const config =
    typeof aplicarEmSerie === "object" && aplicarEmSerie !== null
      ? aplicarEmSerie
      : {};
  const modo = String(config.mode || "unica").toLowerCase();

  // 1) Sempre atualiza a reunião atual (por ID)
  const payloadAtual = { ...novosDados };

  delete payloadAtual.horario_inicio;
  delete payloadAtual.horario_fim;
  if (payloadAtual.materiais === undefined) delete payloadAtual.materiais;

  if (modo === "multipla" || modo === "multiple") {
    const datasSelecionadas = sortUniqueDates(
      config.selectedDates || config.datasSelecionadas || []
    );
    const horaBase = extractTimeValue(
      config.timeValue || payloadAtual.data_hora || "09:00",
      "09:00"
    );
    const datas =
      datasSelecionadas.length > 0
        ? datasSelecionadas
        : generateRecurringDates(
            payloadAtual.data_hora || new Date(),
            config.rule || config.recurrenceRule || "semanal",
            config.count || 6
          );

    const [primeira, ...resto] = datas;
    const payloadPrimeiro = {
      ...payloadAtual,
      data_hora: buildDateTimeValue(primeira || payloadAtual.data_hora, horaBase),
    };

    const { error: errUpdateAtual } = await supabase
      .from("reunioes")
      .update(payloadPrimeiro)
      .eq("id", id);

    if (errUpdateAtual) return { error: errUpdateAtual };

    if (resto.length > 0) {
      const payloadSerie = resto.map((dateKey) => ({
        ...payloadAtual,
        data_hora: buildDateTimeValue(dateKey, horaBase),
      }));

      const { error: errInsertSerie } = await supabase
        .from("reunioes")
        .insert(payloadSerie);

      if (errInsertSerie) return { error: errInsertSerie };
    }

    return { error: null };
  }

  const { error: errUpdateAtual } = await supabase
    .from("reunioes")
    .update(payloadAtual)
    .eq("id", id);

  if (errUpdateAtual) return { error: errUpdateAtual };

  if (!aplicarEmSerie || typeof aplicarEmSerie === "object") {
    return { error: null };
  }

  // 3) Buscar "chave da série" (legacy) para propagação antiga
  const { data: original, error: errOrig } = await supabase
    .from("reunioes")
    .select("tipo_reuniao_legacy, data_hora")
    .eq("id", id)
    .single();

  if (errOrig || !original) {
    return { error: errOrig || new Error("Original não encontrada") };
  }

  const payloadSerie = {
    titulo: novosDados.titulo,
    cor: novosDados.cor,
    responsavel: novosDados.responsavel,
    ata: novosDados.ata,
    status: novosDados.status,
    tipo_reuniao_id: novosDados.tipo_reuniao_id || null,
    tipo_reuniao_legacy:
      novosDados.tipo_reuniao_legacy || original.tipo_reuniao_legacy || "Geral",
    duracao_segundos: novosDados.duracao_segundos ?? null,
  };

  return await supabase
    .from("reunioes")
    .update(payloadSerie)
    .eq("tipo_reuniao_legacy", original.tipo_reuniao_legacy)
    .gte("data_hora", original.data_hora);
};
