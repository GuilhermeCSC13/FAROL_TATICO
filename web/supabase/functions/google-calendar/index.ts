// supabase/functions/google-calendar/index.ts
//
// Edge Function que sincroniza reunioes do Farol com o Google Agenda
// da conta admin (refresh_token guardado como secret), enviando convite
// pra cada participante por email.
//
// Body JSON:
//   { action: "upsert", reuniao: { ... }, emails: ["a@b.com", ...] }
//   { action: "delete", reuniaoId: 123, googleEventId?: "..." }
//
// Secrets necessarios:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REFRESH_TOKEN   <- dono da agenda (admin)
//   GOOGLE_CALENDAR_ID     <- "primary" ou ID especifico

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const REFRESH_TOKEN = Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "";
const CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID") ?? "primary";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getAccessToken(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!r.ok) {
    throw new Error(`Google token error: ${r.status} ${await r.text()}`);
  }
  const data = await r.json();
  return data.access_token as string;
}

function toIso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildEvent(reuniao: any, emails: string[]) {
  // data_hora vem como "YYYY-MM-DDTHH:MM:SS" (sem offset) — Farol grava em
  // wall-clock local (America/Sao_Paulo). Mantemos isso e passamos timeZone.
  const inicio = String(reuniao.data_hora || "").slice(0, 19);
  const inicioDate = new Date(inicio.replace(" ", "T"));
  const duracaoSeg = Number(reuniao.duracao_segundos || 3600) || 3600;
  const fimDate = new Date(inicioDate.getTime() + duracaoSeg * 1000);

  const descricaoLinhas = [
    reuniao.tipo_reuniao_nome ? `Tipo: ${reuniao.tipo_reuniao_nome}` : null,
    reuniao.area_nome ? `Area: ${reuniao.area_nome}` : null,
    reuniao.responsavel ? `Responsavel: ${reuniao.responsavel}` : null,
    reuniao.sala_nome ? `Sala: ${reuniao.sala_nome}` : null,
    "",
    reuniao.ata ? `Ata/Notas:\n${reuniao.ata}` : null,
    "",
    `Sincronizado do Farol (reuniao_id: ${reuniao.id || "—"})`,
  ].filter((l) => l !== null).join("\n");

  return {
    summary: reuniao.titulo || "Reuniao",
    description: descricaoLinhas,
    location: reuniao.sala_nome || reuniao.location || "",
    start: { dateTime: toIso(inicioDate), timeZone: "America/Sao_Paulo" },
    end: { dateTime: toIso(fimDate), timeZone: "America/Sao_Paulo" },
    colorId: reuniao.colorId || "9",
    attendees: (emails || [])
      .map((e) => String(e || "").trim())
      .filter((e) => e && e.includes("@"))
      .map((email) => ({ email })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 30 },
        { method: "email", minutes: 24 * 60 },
      ],
    },
    extendedProperties: {
      private: { farol_reuniao_id: String(reuniao.id || "") },
    },
  };
}

async function findExisting(accessToken: string, reuniaoId: string | number) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
  );
  url.searchParams.set("privateExtendedProperty", `farol_reuniao_id=${reuniaoId}`);
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "false");
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data?.items?.[0]?.id || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Use POST", { status: 405, headers: CORS });
  }
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Google secrets nao configurados no Supabase." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const accessToken = await getAccessToken();

    if (body.action === "upsert") {
      const reuniao = body.reuniao;
      const emails = body.emails || [];
      const existingId = reuniao.google_event_id
        ? reuniao.google_event_id
        : await findExisting(accessToken, reuniao.id);
      const ev = buildEvent(reuniao, emails);

      const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
      const url = existingId
        ? `${base}/${encodeURIComponent(existingId)}?sendUpdates=all`
        : `${base}?sendUpdates=all`;
      const method = existingId ? "PATCH" : "POST";

      const r = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ev),
      });
      if (!r.ok) {
        return new Response(JSON.stringify({ error: await r.text() }), {
          status: r.status,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      const created = await r.json();
      return new Response(
        JSON.stringify({
          ok: true,
          eventId: created.id,
          action: existingId ? "updated" : "created",
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    if (body.action === "delete") {
      const id =
        body.googleEventId ||
        (await findExisting(accessToken, body.reuniaoId));
      if (!id) {
        return new Response(JSON.stringify({ ok: true, deleted: false }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      const r = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(id)}?sendUpdates=all`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (r.ok || r.status === 410) {
        return new Response(JSON.stringify({ ok: true, deleted: true }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: await r.text() }), {
        status: r.status,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "action invalida" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
