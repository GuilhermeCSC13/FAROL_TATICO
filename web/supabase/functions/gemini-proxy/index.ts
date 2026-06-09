// supabase/functions/gemini-proxy/index.ts
//
// Proxy server-side para a Gemini API. Mantem a chave (GEMINI_API_KEY)
// fora do bundle do frontend. Aceita o mesmo formato que o JS SDK gera
// internamente, ou um `prompt` simples (string).
//
// Body JSON:
//   {
//     model?: string,                 // default: gemini-2.5-pro
//     prompt?: string,                // atalho — vira contents = [{role:user, parts:[{text}]}]
//     contents?: GenerativeContent[], // formato cru da REST API do Google
//     generationConfig?: object,
//     systemInstruction?: object | string
//   }
//
// Resposta:
//   { ok: true, text: string, raw: <resposta crua do Google> }
//
// Secret necessario:
//   GEMINI_API_KEY  -> chave criada em https://aistudio.google.com/apikey

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const DEFAULT_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-pro";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function extractText(raw: any): string {
  try {
    const parts = raw?.candidates?.[0]?.content?.parts ?? [];
    return parts
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
  } catch {
    return "";
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  if (!API_KEY) return json({ error: "GEMINI_API_KEY ausente" }, 500);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "body invalido" }, 400);
  }

  const model = String(body?.model || DEFAULT_MODEL);

  // Aceita atalho `prompt: string` ou `contents` direto da REST API.
  let contents = body?.contents;
  if (!Array.isArray(contents)) {
    if (typeof body?.prompt === "string") {
      contents = [{ role: "user", parts: [{ text: body.prompt }] }];
    } else if (Array.isArray(body?.prompt)) {
      // formato do SDK: array misto de string e { inlineData }
      const parts = body.prompt.map((p: any) => {
        if (typeof p === "string") return { text: p };
        if (p?.inlineData) {
          return {
            inline_data: {
              mime_type: p.inlineData.mimeType,
              data: p.inlineData.data,
            },
          };
        }
        return p;
      });
      contents = [{ role: "user", parts }];
    } else {
      return json({ error: "envie `prompt` ou `contents`" }, 400);
    }
  }

  const payload: Record<string, unknown> = { contents };
  if (body?.generationConfig) payload.generationConfig = body.generationConfig;
  if (body?.systemInstruction) {
    payload.systemInstruction =
      typeof body.systemInstruction === "string"
        ? { role: "system", parts: [{ text: body.systemInstruction }] }
        : body.systemInstruction;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${API_KEY}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    return json({ error: `Gemini ${r.status}: ${await r.text()}` }, r.status);
  }
  const raw = await r.json();
  return json({ ok: true, text: extractText(raw), raw });
});
