// supabase/functions/gemini-proxy/index.ts
//
// ⚠️ O nome da função é histórico: desde a migração ela NÃO fala mais com a
// Gemini API do Google — fala com o OPENROUTER. Trocamos para ter o custo de
// cada chamada visível no painel do OpenRouter (usage.cost vem em toda
// resposta) em vez de depender do billing export do Google Cloud.
//
// A chave (OPENROUTER_API_KEY) fica como secret e nunca chega no bundle.
//
// Contrato de ENTRADA — inalterado. O web/src/services/gemini.js continua
// mandando exatamente o mesmo corpo de antes:
//   {
//     model?: string,          // slug OpenRouter; sem "/" recebe "google/"
//     prompt?: string | Array<string | {inlineData} | {mediaUrl, mimeType}>,
//     messages?: ChatMessage[],// formato OpenAI cru, se algum dia precisar
//     systemInstruction?: string | { parts: [{ text }] },
//     generationConfig?: { temperature?, maxOutputTokens?, topP? }
//   }
//
// Contrato de SAÍDA — inalterado:
//   { ok: true, text: string, raw: <resposta crua do OpenRouter> }
//
// A diferença que importa: o OpenRouter NÃO aceita áudio por URL, só base64
// inline. O que antes subia pelo Files API do Gemini (até 2GB) agora é baixado
// aqui e convertido — por isso existe o teto MAX_MEDIA_MB. Estourar o teto
// devolve erro explicando o tamanho, em vez de derrubar a função por memória.
//
// Secrets:
//   OPENROUTER_API_KEY    -> chave criada em https://openrouter.ai/keys
//   OPENROUTER_MODEL      -> opcional, default google/gemini-2.5-pro
//   MAX_MEDIA_MB          -> opcional, default 45
//   OPENROUTER_APP_URL    -> opcional, aparece no ranking/painel do OpenRouter
//   OPENROUTER_APP_TITLE  -> opcional, nome do app no painel do OpenRouter

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
// `||` e não `??`: um secret que existe mas está VAZIO vira "" e o `??` deixaria passar.
const DEFAULT_MODEL = Deno.env.get("OPENROUTER_MODEL")?.trim() || "google/gemini-2.5-pro";
const MAX_MEDIA_MB = Number(Deno.env.get("MAX_MEDIA_MB") ?? "45");
const APP_URL = Deno.env.get("OPENROUTER_APP_URL") ?? "https://faroldemetas.onrender.com";
const APP_TITLE = Deno.env.get("OPENROUTER_APP_TITLE") ?? "Farol Tatico";

const MAX_MEDIA_BYTES = Math.max(1, MAX_MEDIA_MB) * 1024 * 1024;

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

// Erro operacional que o usuário precisa LER (arquivo grande demais, provider
// fora do ar...). Vai como HTTP 200 de propósito: o supabase.functions.invoke
// descarta o corpo da resposta quando o status não é 2xx, e aí a tela mostraria
// só "non-2xx status code" em vez do motivo. O gemini.js já trata `ok: false`.
function falha(msg: string, extra?: Record<string, unknown>) {
  console.error(`[openrouter] ${msg}`);
  return json({ ok: false, error: msg, ...(extra || {}) });
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// O cliente antigo manda "gemini-2.5-pro"; o OpenRouter quer "google/gemini-2.5-pro".
// Normaliza para não quebrar caso algum bundle velho ainda esteja em cache.
function normalizeModel(raw: unknown): string {
  const m = String(raw || "").trim().replace(/^models\//, "");
  if (!m) return DEFAULT_MODEL;
  return m.includes("/") ? m : `google/${m}`;
}

// O OpenRouter espera um token de formato, não o mime completo.
// Lista aceita: wav, mp3, aiff, aac, ogg, flac, m4a, pcm16, pcm24.
function audioFormatFromMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0].trim();
  const tabela: Record<string, string> = {
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/aiff": "aiff",
    "audio/x-aiff": "aiff",
  };
  if (tabela[m]) return tabela[m];
  // Fallback: usa o subtipo cru (ex.: audio/webm -> webm). Se o provider não
  // aceitar, o erro dele é mais útil do que um formato inventado por nós.
  return m.split("/")[1]?.replace(/^x-/, "") || "mp3";
}

// Monta a content part do OpenAI/OpenRouter a partir de bytes já em base64.
function buildMediaPart(mime: string, base64: string, filename?: string) {
  const tipo = mime.toLowerCase().split(";")[0].trim();
  const dataUri = `data:${tipo};base64,${base64}`;

  if (tipo.startsWith("audio/")) {
    // Único caso que NÃO usa data URI: o OpenRouter quer o base64 cru + format.
    return { type: "input_audio", input_audio: { data: base64, format: audioFormatFromMime(tipo) } };
  }
  if (tipo.startsWith("video/")) {
    return { type: "video_url", video_url: { url: dataUri } };
  }
  if (tipo.startsWith("image/")) {
    return { type: "image_url", image_url: { url: dataUri } };
  }
  if (tipo === "application/pdf") {
    return { type: "file", file: { filename: filename || "arquivo.pdf", file_data: dataUri } };
  }
  throw new Error(`Tipo de mídia não suportado pelo proxy: ${tipo}`);
}

// Baixa a mídia e devolve em base64. Recusa cedo se já vier grande demais,
// para não estourar os 256MB de memória da Edge Function.
async function baixarComoBase64(mediaUrl: string, mimeHint: string) {
  const r = await fetch(mediaUrl);
  if (!r.ok) throw new Error(`Falha ao baixar mediaUrl (HTTP ${r.status})`);

  const declarado = Number(r.headers.get("content-length") || "0");
  if (declarado > MAX_MEDIA_BYTES) {
    throw new Error(
      `Arquivo de ${mb(declarado)} excede o limite de ${MAX_MEDIA_MB} MB do proxy. ` +
        `O OpenRouter exige áudio/vídeo em base64 inline, então o arquivo passa inteiro ` +
        `pela memória da Edge Function. Use a faixa de áudio (não o vídeo) ou aumente MAX_MEDIA_MB.`,
    );
  }

  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new Error(
      `Arquivo de ${mb(bytes.byteLength)} excede o limite de ${MAX_MEDIA_MB} MB do proxy. ` +
        `Use a faixa de áudio (não o vídeo) ou aumente MAX_MEDIA_MB.`,
    );
  }

  const mime = mimeHint || r.headers.get("content-type") || "application/octet-stream";
  console.log(`[openrouter] midia baixada: ${mb(bytes.byteLength)} (${mime})`);
  return { base64: encodeBase64(bytes), mime };
}

// Converte o `prompt` do cliente (string ou array misto) nas content parts do
// OpenRouter. Mantém a ordem em que o chamador montou.
async function montarParts(prompt: unknown) {
  const itens = Array.isArray(prompt) ? prompt : [prompt];
  const parts: unknown[] = [];

  for (const p of itens) {
    if (typeof p === "string") {
      if (p) parts.push({ type: "text", text: p });
      continue;
    }
    if (!p || typeof p !== "object") continue;

    const item = p as Record<string, any>;

    if (typeof item.text === "string") {
      parts.push({ type: "text", text: item.text });
      continue;
    }
    if (item.inlineData?.data) {
      parts.push(
        buildMediaPart(
          String(item.inlineData.mimeType || "application/octet-stream"),
          String(item.inlineData.data),
          item.filename,
        ),
      );
      continue;
    }
    if (item.mediaUrl && item.mimeType) {
      const { base64, mime } = await baixarComoBase64(String(item.mediaUrl), String(item.mimeType));
      parts.push(buildMediaPart(mime, base64, item.filename));
      continue;
    }
    throw new Error(`Item de prompt não reconhecido: ${JSON.stringify(Object.keys(item))}`);
  }

  if (!parts.length) throw new Error("prompt vazio");
  return parts;
}

function textoDoSystem(systemInstruction: unknown): string {
  if (!systemInstruction) return "";
  if (typeof systemInstruction === "string") return systemInstruction;
  const si = systemInstruction as Record<string, any>;
  const parts = si?.parts;
  if (Array.isArray(parts)) {
    return parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
  }
  return "";
}

// A resposta do OpenRouter segue o schema da OpenAI, mas `content` pode vir
// como string ou como array de parts dependendo do provider por trás.
function extrairTexto(raw: any): string {
  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
  }
  return "";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  if (!API_KEY) return json({ error: "OPENROUTER_API_KEY ausente" }, 500);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "body invalido" }, 400);
  }

  const model = normalizeModel(body?.model);

  // Aceita `messages` (formato OpenAI cru) ou o `prompt` que o app já manda.
  let messages: unknown[];
  if (Array.isArray(body?.messages)) {
    messages = body.messages;
  } else {
    let parts: unknown[];
    try {
      parts = await montarParts(body?.prompt);
    } catch (e) {
      return falha(String((e as Error)?.message || e));
    }

    messages = [];
    const system = textoDoSystem(body?.systemInstruction);
    if (system) messages.push({ role: "system", content: system });

    // Um único texto vai como string simples — é o formato que todo provider
    // aceita sem ressalva. Só multimodal precisa do array de parts.
    const soTexto = parts.length === 1 && (parts[0] as any)?.type === "text";
    messages.push({ role: "user", content: soTexto ? (parts[0] as any).text : parts });
  }

  const payload: Record<string, unknown> = { model, messages };

  const cfg = body?.generationConfig ?? {};
  if (cfg.temperature != null) payload.temperature = cfg.temperature;
  if (cfg.topP != null) payload.top_p = cfg.topP;
  const maxTokens = cfg.maxOutputTokens ?? cfg.max_tokens;
  if (maxTokens != null) payload.max_tokens = maxTokens;

  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      // Identificam o app no painel do OpenRouter — é o que permite separar
      // o gasto do Farol de qualquer outra coisa na mesma conta.
      "HTTP-Referer": APP_URL,
      "X-OpenRouter-Title": APP_TITLE,
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    return falha(`OpenRouter ${r.status}: ${await r.text().catch(() => "")}`);
  }

  const raw = await r.json();

  // O OpenRouter pode devolver 200 com erro no corpo (ex.: provider caiu).
  if (raw?.error) {
    return falha(String(raw.error?.message || JSON.stringify(raw.error)), { raw });
  }

  const u = raw?.usage ?? {};
  console.log(
    `[openrouter] model=${model} tokens=${u.prompt_tokens ?? "?"}/${u.completion_tokens ?? "?"} ` +
      `custo=${u.cost ?? "?"} id=${raw?.id ?? "?"}`,
  );

  return json({ ok: true, text: extrairTexto(raw), raw });
});
