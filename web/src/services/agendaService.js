import { addDays, addMonths } from "date-fns";
import { supabase } from "../supabaseClient";
import {
  buildDateTimeValue,
  extractTimeValue,
  generateRecurringDates,
  parseSafeDate,
  sortUniqueDates,
} from "./agendaDates";

export const gerarDatasRecorrentes = (dataInicialISO, regra, qtd = 12) => {
  const datas = [];
  let dataBase = parseSafeDate(dataInicialISO);

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

function shouldKeepFutureStatus(status) {
  const s = String(status || "").toLowerCase();
  if (!s) return "Agendada";
  if (s.includes("realiz") || s.includes("cancel")) return "Agendada";
  if (s.includes("pend")) return "Pendente";
  return status || "Agendada";
}

function buildSeriesSignature(row) {
  return {
    titulo: String(row?.titulo || "").trim().toLowerCase(),
    tipoReuniaoId: row?.tipo_reuniao_id ? String(row.tipo_reuniao_id) : "",
    tipoLegacy: String(row?.tipo_reuniao_legacy || "").trim().toLowerCase(),
    responsavel: String(row?.responsavel || "").trim().toLowerCase(),
    areaId: row?.area_id ? String(row.area_id) : "",
  };
}

function sameSeries(a, b) {
  const sa = buildSeriesSignature(a);
  const sb = buildSeriesSignature(b);
  return (
    sa.titulo === sb.titulo &&
    sa.tipoReuniaoId === sb.tipoReuniaoId &&
    sa.tipoLegacy === sb.tipoLegacy &&
    sa.responsavel === sb.responsavel &&
    sa.areaId === sb.areaId
  );
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
    return await supabase.from("reunioes").insert([basePayload]).select();
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

  return await supabase.from("reunioes").insert(payloadSerie).select();
};

export const atualizarReuniao = async (id, novosDados, aplicarEmSerie = false) => {
  const config =
    typeof aplicarEmSerie === "object" && aplicarEmSerie !== null
      ? aplicarEmSerie
      : {};
  const modo = String(config.mode || "unica").toLowerCase();

  // 1) Sempre atualiza a reunião atual (por ID)
  const payloadAtual = { ...novosDados };

  if (payloadAtual.materiais === undefined) delete payloadAtual.materiais;

  if (modo === "multipla" || modo === "multiple") {
    const datasSelecionadas = sortUniqueDates(
      config.selectedDates || config.datasSelecionadas || []
    );
    const horaBase = extractTimeValue(
      config.timeValue || payloadAtual.data_hora || "09:00",
      "09:00"
    );
    const { data: original, error: errOrig } = await supabase
      .from("reunioes")
      .select(
        "id, titulo, data_hora, tipo_reuniao_id, tipo_reuniao_legacy, responsavel, area_id"
      )
      .eq("id", id)
      .single();

    if (errOrig || !original) {
      return { error: errOrig || new Error("Original não encontrada") };
    }

    const { data: futureRows, error: errFuture } = await supabase
      .from("reunioes")
      .select(
        "id, titulo, data_hora, tipo_reuniao_id, tipo_reuniao_legacy, responsavel, area_id"
      )
      .neq("id", id)
      .gt("data_hora", original.data_hora)
      .order("data_hora", { ascending: true });

    if (errFuture) return { error: errFuture };

    const seriesRows = (futureRows || []).filter((row) => sameSeries(row, original));
    const allRows = [original, ...seriesRows];
    const baseDate = payloadAtual.data_hora || original.data_hora || new Date();
    let generatedDates =
      datasSelecionadas.length > 0
        ? datasSelecionadas
        : generateRecurringDates(
            baseDate,
            config.rule || config.recurrenceRule || "semanal",
            Math.max(allRows.length, config.count || 6)
          );

    while (generatedDates.length < allRows.length) {
      const lastDate = generatedDates[generatedDates.length - 1] || baseDate;
      const fallbackDates = generateRecurringDates(
        lastDate,
        config.rule || config.recurrenceRule || "semanal",
        2
      );
      const next = fallbackDates[1] || fallbackDates[0];
      if (!next) break;
      generatedDates.push(next);
    }

    const datesForRows = generatedDates.slice(0, allRows.length);

    const payloadPrimeiro = {
      ...payloadAtual,
      data_hora: buildDateTimeValue(datesForRows[0] || original.data_hora, horaBase),
    };

    const { error: errUpdateAtual } = await supabase
      .from("reunioes")
      .update(payloadPrimeiro)
      .eq("id", id);

    if (errUpdateAtual) return { error: errUpdateAtual };

    for (let i = 1; i < allRows.length; i += 1) {
      const row = allRows[i];
      const updatePayload = {
        ...payloadAtual,
        status: shouldKeepFutureStatus(payloadAtual.status),
        data_hora: buildDateTimeValue(datesForRows[i], horaBase),
      };
      delete updatePayload.horario_inicio;
      delete updatePayload.horario_fim;
      if (updatePayload.materiais === undefined) delete updatePayload.materiais;

      const { error: errUpdateFuture } = await supabase
        .from("reunioes")
        .update(updatePayload)
        .eq("id", row.id);

      if (errUpdateFuture) return { error: errUpdateFuture };
    }

    if (datesForRows.length > allRows.length) {
      const extraPayloads = datesForRows.slice(allRows.length).map((dateKey) => ({
        ...payloadAtual,
        status: shouldKeepFutureStatus(payloadAtual.status),
        data_hora: buildDateTimeValue(dateKey, horaBase),
      }));

      const { error: errInsertExtra } = await supabase
        .from("reunioes")
        .insert(extraPayloads);

      if (errInsertExtra) return { error: errInsertExtra };
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
