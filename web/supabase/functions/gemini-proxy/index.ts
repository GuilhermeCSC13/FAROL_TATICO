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

  // Upload de arquivo grande via Files API (ate 2GB). Usado quando o caller
  // manda `{ mediaUrl, mimeType }` em vez de inlineData (que estoura o
  // limite de body das Edge Functions com audios/videos longos).
  async function uploadFromUrl(mediaUrl: string, mimeType: string) {
    const r = await fetch(mediaUrl);
    if (!r.ok) throw new Error(`Falha ao baixar mediaUrl (${r.status})`);
    const bytes = await r.arrayBuffer();
    const up = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=media&key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": mimeType, "X-Goog-Upload-Protocol": "raw" },
        body: bytes,
      },
    );
    if (!up.ok) throw new Error(`Files API ${up.status}: ${await up.text()}`);
    const data = await up.json();
    const uri = data?.file?.uri;
    if (!uri) throw new Error("Files API nao retornou uri");
    return uri as string;
  }

  // Aceita atalho `prompt: string` ou `contents` direto da REST API.
  let contents = body?.contents;
  if (!Array.isArray(contents)) {
    if (typeof body?.prompt === "string") {
      const parts: any[] = [{ text: body.prompt }];
      if (body?.mediaUrl && body?.mimeType) {
        try {
          const uri = await uploadFromUrl(String(body.mediaUrl), String(body.mimeType));
          parts.push({ file_data: { file_uri: uri, mime_type: String(body.mimeType) } });
        } catch (e) {
          return json({ error: String((e as Error)?.message || e) }, 502);
        }
      }
      contents = [{ role: "user", parts }];
    } else if (Array.isArray(body?.prompt)) {
      // formato do SDK: array misto de string, { inlineData } e { mediaUrl, mimeType }
      const parts: any[] = [];
      for (const p of body.prompt) {
        if (typeof p === "string") {
          parts.push({ text: p });
        } else if (p?.mediaUrl && p?.mimeType) {
          try {
            const uri = await uploadFromUrl(String(p.mediaUrl), String(p.mimeType));
            parts.push({ file_data: { file_uri: uri, mime_type: String(p.mimeType) } });
          } catch (e) {
            return json({ error: String((e as Error)?.message || e) }, 502);
          }
        } else if (p?.inlineData) {
          parts.push({
            inline_data: {
              mime_type: p.inlineData.mimeType,
              data: p.inlineData.data,
            },
          });
        } else {
          parts.push(p);
        }
      }
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
