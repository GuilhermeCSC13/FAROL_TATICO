// Helpers que disparam a sincronizacao automatica com o Google Agenda via
// Edge Function `google-calendar` do Farol. Falhas sao logadas mas nao
// interrompem o fluxo principal da UI (a reuniao ja foi salva no banco).

import { supabase } from "../supabaseClient";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function invokeGoogleCalendar(body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/google-calendar`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    return {
      data,
      error: data?.error || `Erro ${response.status} ao chamar google-calendar`,
    };
  }
  return { data, error: null };
}

async function buildReuniaoPayload(reuniaoId) {
  const { data: reuniao, error } = await supabase
    .from("reunioes")
    .select(
      "id, titulo, data_hora, duracao_segundos, status, responsavel, ata, google_event_id, tipo_reuniao_id, area_id"
    )
    .eq("id", reuniaoId)
    .maybeSingle();
  if (error || !reuniao) return null;

  const [
    { data: tipo },
    { data: area },
    { data: participantes },
    { data: assinantes },
  ] = await Promise.all([
    reuniao.tipo_reuniao_id
      ? supabase.from("tipos_reuniao").select("nome").eq("id", reuniao.tipo_reuniao_id).maybeSingle()
      : Promise.resolve({ data: null }),
    reuniao.area_id
      ? supabase.from("areas").select("nome").eq("id", reuniao.area_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("participantes_reuniao").select("nome, email").eq("reuniao_id", reuniaoId),
    reuniao.tipo_reuniao_id
      ? supabase
          .from("agenda_assinantes_google")
          .select("google_email")
          .eq("tipo_reuniao_id", reuniao.tipo_reuniao_id)
      : Promise.resolve({ data: [] }),
  ]);

  const emailsSet = new Set();
  (participantes || []).forEach((p) => {
    const e = String(p?.email || "").trim().toLowerCase();
    if (e && e.includes("@")) emailsSet.add(e);
  });
  (assinantes || []).forEach((a) => {
    const e = String(a?.google_email || "").trim().toLowerCase();
    if (e && e.includes("@")) emailsSet.add(e);
  });
  const emails = Array.from(emailsSet);

  return {
    reuniao: {
      ...reuniao,
      tipo_reuniao_nome: tipo?.nome || null,
      area_nome: area?.nome || null,
    },
    emails,
  };
}

export async function sincronizarReuniaoGoogle(reuniaoId) {
  if (!reuniaoId) return { ok: false, error: "reuniaoId ausente" };
  try {
    const payload = await buildReuniaoPayload(reuniaoId);
    if (!payload) return { ok: false, error: "Reunião não encontrada" };

    const status = String(payload.reuniao.status || "").toLowerCase();
    if (status.includes("cancel")) {
      await excluirReuniaoGoogle(reuniaoId, payload.reuniao.google_event_id);
      return { ok: true };
    }

    const { data, error } = await invokeGoogleCalendar({ action: "upsert", ...payload });
    if (error) {
      console.warn("[googleCalendarSync] upsert falhou:", error.message || error);
      return { ok: false, error: error.message || String(error) };
    }
    if (data?.error) {
      console.warn("[googleCalendarSync] upsert falhou:", data.error);
      return { ok: false, error: data.error };
    }
    if (data?.eventId && data.eventId !== payload.reuniao.google_event_id) {
      await supabase
        .from("reunioes")
        .update({ google_event_id: data.eventId })
        .eq("id", reuniaoId);
    }
    return { ok: true };
  } catch (e) {
    console.warn("[googleCalendarSync] erro inesperado:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function excluirReuniaoGoogle(reuniaoId, googleEventId = null) {
  if (!reuniaoId && !googleEventId) return;
  try {
    await invokeGoogleCalendar({ action: "delete", reuniaoId, googleEventId });
  } catch (e) {
    console.warn("[googleCalendarSync] delete falhou:", e?.message || e);
  }
}

// Sincroniza um lote (ex: ao criar serie). Tolerante a falhas.
export async function sincronizarLoteReunioesGoogle(ids = []) {
  let synced = 0;
  let failed = 0;
  let firstError = "";
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const resultado = await sincronizarReuniaoGoogle(id);
    if (resultado.ok) synced += 1;
    else {
      failed += 1;
      if (!firstError) firstError = resultado.error || "Erro desconhecido";
    }
  }
  return { total: ids.length, synced, failed, firstError };
}
