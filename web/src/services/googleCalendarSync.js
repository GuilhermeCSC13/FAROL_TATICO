// Helpers que disparam a sincronizacao automatica com o Google Agenda via
// Edge Function `google-calendar` do Farol. Falhas sao logadas mas nao
// interrompem o fluxo principal da UI (a reuniao ja foi salva no banco).

import { supabase } from "../supabaseClient";

async function buildReuniaoPayload(reuniaoId) {
  const { data: reuniao, error } = await supabase
    .from("reunioes")
    .select(
      "id, titulo, data_hora, duracao_segundos, status, responsavel, ata, google_event_id, tipo_reuniao_id, area_id"
    )
    .eq("id", reuniaoId)
    .maybeSingle();
  if (error || !reuniao) return null;

  const [{ data: tipo }, { data: area }, { data: participantes }] = await Promise.all([
    reuniao.tipo_reuniao_id
      ? supabase.from("tipos_reuniao").select("nome").eq("id", reuniao.tipo_reuniao_id).maybeSingle()
      : Promise.resolve({ data: null }),
    reuniao.area_id
      ? supabase.from("areas").select("nome").eq("id", reuniao.area_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("participantes_reuniao").select("nome, email").eq("reuniao_id", reuniaoId),
  ]);

  const emails = (participantes || [])
    .map((p) => String(p?.email || "").trim())
    .filter((e) => e && e.includes("@"));

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
  if (!reuniaoId) return;
  try {
    const payload = await buildReuniaoPayload(reuniaoId);
    if (!payload) return;

    const status = String(payload.reuniao.status || "").toLowerCase();
    if (status.includes("cancel")) {
      await excluirReuniaoGoogle(reuniaoId, payload.reuniao.google_event_id);
      return;
    }

    const { data, error } = await supabase.functions.invoke("google-calendar", {
      body: { action: "upsert", ...payload },
    });
    if (error) {
      console.warn("[googleCalendarSync] upsert falhou:", error.message || error);
      return;
    }
    if (data?.eventId && data.eventId !== payload.reuniao.google_event_id) {
      await supabase
        .from("reunioes")
        .update({ google_event_id: data.eventId })
        .eq("id", reuniaoId);
    }
  } catch (e) {
    console.warn("[googleCalendarSync] erro inesperado:", e?.message || e);
  }
}

export async function excluirReuniaoGoogle(reuniaoId, googleEventId = null) {
  if (!reuniaoId && !googleEventId) return;
  try {
    await supabase.functions.invoke("google-calendar", {
      body: { action: "delete", reuniaoId, googleEventId },
    });
  } catch (e) {
    console.warn("[googleCalendarSync] delete falhou:", e?.message || e);
  }
}

// Sincroniza um lote (ex: ao criar serie). Tolerante a falhas.
export async function sincronizarLoteReunioesGoogle(ids = []) {
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    await sincronizarReuniaoGoogle(id);
  }
}
