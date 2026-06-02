// Integração com Google Calendar via Google Identity Services (GIS)
// Fluxo: carrega o script, pede token OAuth via popup, usa o token pra
// chamar a Google Calendar API REST.
//
// Client ID configurável por env (VITE_GOOGLE_CLIENT_ID) com fallback.

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "85423703623-eera05msl4ggnkdngccoqq4f7qablu5s.apps.googleusercontent.com";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const TOKEN_STORAGE_KEY = "google_calendar_token";

let gisLoadPromise = null;

function loadGisScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar GIS")));
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar Google Identity Services"));
    document.head.appendChild(s);
  });
  return gisLoadPromise;
}

function readStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token || !parsed?.expires_at) return null;
    if (Date.now() >= parsed.expires_at - 30_000) return null; // 30s de folga
    return parsed;
  } catch {
    return null;
  }
}

function storeToken(token) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  } catch {
    /* ignore */
  }
}

export function clearGoogleToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getStoredGoogleEmail() {
  const t = readStoredToken();
  return t?.email || null;
}

export function isGoogleConnected() {
  return !!readStoredToken();
}

// Solicita um access_token via popup. Se já houver um válido em cache, reusa.
export async function ensureGoogleToken({ forcePrompt = false } = {}) {
  const cached = readStoredToken();
  if (cached && !forcePrompt) return cached;

  await loadGisScript();

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPE,
        prompt: forcePrompt ? "consent" : "",
        callback: async (resp) => {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          const expiresIn = Number(resp.expires_in || 3600);
          let email = null;
          try {
            const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${resp.access_token}` },
            });
            if (r.ok) {
              const u = await r.json();
              email = u.email || null;
            }
          } catch {
            /* email é opcional */
          }
          const token = {
            access_token: resp.access_token,
            expires_at: Date.now() + expiresIn * 1000,
            email,
          };
          storeToken(token);
          resolve(token);
        },
      });
      tokenClient.requestAccessToken({ prompt: forcePrompt ? "consent" : "" });
    } catch (e) {
      reject(e);
    }
  });
}

// ── Helpers de data/hora ───────────────────────────────────────────────
// O Farol grava `data_hora` como uma string ISO mas exibe sempre o trecho
// após o "T" como wall-clock local de SP (ignora qualquer offset). Pra ficar
// idêntico no Google, extraímos data e hora como strings e enviamos com
// timeZone=America/Sao_Paulo (sem deixar o JS converter pra UTC).
function splitDataHora(value) {
  if (!value) return null;
  const s = String(value);
  if (s.includes("T")) {
    const [datePart, timeFull = "00:00:00"] = s.split("T");
    const timePart = timeFull.substring(0, 8).padEnd(8, "0:00:00".slice(timeFull.length, 8));
    return { date: datePart, time: timePart.length === 5 ? `${timePart}:00` : timePart };
  }
  if (s.includes(" ")) {
    const [datePart, timeFull = "00:00:00"] = s.split(" ");
    return { date: datePart, time: timeFull.substring(0, 8) };
  }
  return null;
}

// Extrai apenas "HH:MM:SS" de qualquer formato (time-only, ISO, com Z, etc.)
function extractTimeOnly(value) {
  if (!value) return null;
  const s = String(value);
  let core = s;
  if (core.includes("T")) core = core.split("T")[1] || "";
  if (core.includes(" ")) core = core.split(" ").pop() || "";
  // remove offset/zona se vier junto
  core = core.replace(/Z$/i, "").split(/[+\-]/)[0].trim();
  if (!core.includes(":")) return null;
  const segs = core.split(":");
  if (segs.length < 2) return null;
  const pad = (v) => String(v).padStart(2, "0").slice(0, 2);
  const hh = pad(segs[0]);
  const mm = pad(segs[1]);
  const ss = segs[2] ? pad(segs[2].split(".")[0]) : "00";
  if (Number.isNaN(Number(hh)) || Number.isNaN(Number(mm))) return null;
  return `${hh}:${mm}:${ss}`;
}

function combinarDataHora(dataISO, horaStr) {
  // dataISO ex.: "2026-06-03T09:00:00+00:00"  → pega só a data
  // horaStr  ex.: "09:00", "09:00:00", "2026-06-03T09:00:00"
  const parts = splitDataHora(dataISO);
  if (!parts) return null;
  const hora = extractTimeOnly(horaStr);
  if (!hora) return null;
  return `${parts.date}T${hora}`;
}

function addMinutosWallClock(dateTimeLocal, minutos) {
  // Suma minutos mantendo SP como referência (evita problemas de DST etc.)
  const [datePart, timePart] = String(dateTimeLocal).split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss = "00"] = timePart.split(":");
  const base = new Date(Date.UTC(y, m - 1, d, Number(hh), Number(mm), Number(ss)));
  base.setUTCMinutes(base.getUTCMinutes() + minutos);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}` +
    `T${pad(base.getUTCHours())}:${pad(base.getUTCMinutes())}:${pad(base.getUTCSeconds())}`
  );
}

function resolveStartEnd(reuniao) {
  // Tenta na ordem: combinar data_hora + horario_inicio; só data_hora;
  // se nada disso, tenta extrair direto do horario_inicio (caso ele seja ISO).
  let start = null;
  const parts = splitDataHora(reuniao.data_hora);

  if (parts) {
    const horaIni = extractTimeOnly(reuniao.horario_inicio) || parts.time;
    start = `${parts.date}T${horaIni}`;
  } else if (reuniao.horario_inicio) {
    const fallback = splitDataHora(reuniao.horario_inicio);
    if (fallback) start = `${fallback.date}T${fallback.time}`;
  }

  let end = null;
  if (start) {
    if (reuniao.horario_fim) {
      const hf = extractTimeOnly(reuniao.horario_fim);
      const dateOnly = start.split("T")[0];
      if (hf) end = `${dateOnly}T${hf}`;
    }
    if (!end) end = addMinutosWallClock(start, 60);
  }
  return { start, end };
}

// ── Mapeamento de cor do Farol → colorId do Google Calendar ─────────────
// Paleta oficial do Google (event colors). Aproximamos pela menor distância
// no espaço RGB.
const GOOGLE_EVENT_COLORS = [
  { id: "1", hex: "#7986cb" }, // Lavender
  { id: "2", hex: "#33b679" }, // Sage
  { id: "3", hex: "#8e24aa" }, // Grape
  { id: "4", hex: "#e67c73" }, // Flamingo
  { id: "5", hex: "#f6c026" }, // Banana
  { id: "6", hex: "#f5511d" }, // Tangerine
  { id: "7", hex: "#039be5" }, // Peacock
  { id: "8", hex: "#616161" }, // Graphite
  { id: "9", hex: "#3f51b5" }, // Blueberry
  { id: "10", hex: "#0b8043" }, // Basil
  { id: "11", hex: "#d50000" }, // Tomato
];

function hexToRgb(hex) {
  if (!hex) return null;
  let h = String(hex).replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function nearestGoogleColorId(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;
  let best = null;
  let bestDist = Infinity;
  for (const c of GOOGLE_EVENT_COLORS) {
    const t = hexToRgb(c.hex);
    const dr = rgb.r - t.r;
    const dg = rgb.g - t.g;
    const db = rgb.b - t.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = c.id;
    }
  }
  return best;
}

// Monta o payload de evento a partir da reunião do Farol
function reuniaoToEvent(reuniao, tipoNome, tipoCor) {
  const { start, end } = resolveStartEnd(reuniao);
  if (!start || !end) {
    const err = new Error(
      `Reunião sem data/hora válida (id=${reuniao.id}, data_hora=${reuniao.data_hora}, inicio=${reuniao.horario_inicio})`
    );
    err.code = "INVALID_DATETIME";
    throw err;
  }

  const titulo = reuniao.titulo || tipoNome || "Reunião";
  const descricao = [
    tipoNome ? `Tipo: ${tipoNome}` : null,
    reuniao.responsavel ? `Responsável: ${reuniao.responsavel}` : null,
    reuniao.ata ? `\nATA:\n${reuniao.ata}` : null,
    `\nSincronizado do Farol Tático (ID: ${reuniao.id})`,
  ]
    .filter(Boolean)
    .join("\n");

  const colorId = nearestGoogleColorId(tipoCor || reuniao.cor);

  const event = {
    summary: titulo,
    description: descricao,
    start: { dateTime: start, timeZone: "America/Sao_Paulo" },
    end: { dateTime: end, timeZone: "America/Sao_Paulo" },
    source: { title: "Farol Tático", url: window.location.origin },
    extendedProperties: {
      private: {
        farol_reuniao_id: String(reuniao.id),
      },
    },
  };
  if (colorId) event.colorId = colorId;
  return event;
}

// Busca um evento já criado pra essa reunião. Retorna o eventId ou null.
async function findExistingEventId(accessToken, reuniaoId) {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
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

// Cria ou atualiza 1 evento. Retorna { ok, eventId, action, error }
export async function upsertCalendarEvent(reuniao, tipoNome, tipoCor) {
  try {
    const token = await ensureGoogleToken();
    const existingId = await findExistingEventId(token.access_token, reuniao.id);
    const event = reuniaoToEvent(reuniao, tipoNome, tipoCor);

    if (existingId) {
      const r = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existingId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        }
      );
      if (!r.ok) {
        const text = await r.text();
        return { ok: false, error: `HTTP ${r.status}: ${text}` };
      }
      return { ok: true, eventId: existingId, action: "updated" };
    }

    const r = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );
    if (!r.ok) {
      const text = await r.text();
      return { ok: false, error: `HTTP ${r.status}: ${text}` };
    }
    const created = await r.json();
    return { ok: true, eventId: created.id, action: "created" };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// compat: createCalendarEvent agora é alias do upsert
export const createCalendarEvent = (r, t, c) => upsertCalendarEvent(r, t, c);

// Tenta apagar o evento do Google Calendar correspondente a uma reunião do Farol.
// Silencioso se o usuário não está conectado ou se o evento não existir.
// Retorna { ok, deleted: boolean, error? }
export async function deleteCalendarEventByReuniaoId(reuniaoId) {
  try {
    if (!isGoogleConnected()) return { ok: true, deleted: false };
    const token = await ensureGoogleToken();
    const existingId = await findExistingEventId(token.access_token, reuniaoId);
    if (!existingId) return { ok: true, deleted: false };

    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existingId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token.access_token}` },
      }
    );
    // 204 = sucesso, 410 = já apagado (considera ok)
    if (r.ok || r.status === 410) return { ok: true, deleted: true };
    const text = await r.text();
    return { ok: false, deleted: false, error: `HTTP ${r.status}: ${text}` };
  } catch (e) {
    return { ok: false, deleted: false, error: e.message || String(e) };
  }
}

// Sincroniza um lote. Chama onProgress({ done, total, titulo, ok }) a cada item.
export async function syncReunioesToGoogle(reunioes, tiposById, onProgress) {
  const total = reunioes.length;
  let done = 0;
  let okCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let errCount = 0;
  const errors = [];

  await ensureGoogleToken();

  for (const r of reunioes) {
    const tipo = tiposById?.[r.tipo_reuniao_id] || r.tipos_reuniao || {};
    const tipoNome = tipo?.nome || "";
    const tipoCor = tipo?.cor || r.cor || null;
    const res = await upsertCalendarEvent(r, tipoNome, tipoCor);
    done++;
    if (res.ok) {
      okCount++;
      if (res.action === "updated") updatedCount++;
      else createdCount++;
    } else {
      errCount++;
      errors.push({ titulo: r.titulo, error: res.error });
    }
    if (typeof onProgress === "function") {
      onProgress({ done, total, titulo: r.titulo, ok: res.ok });
    }
  }

  return { total, okCount, createdCount, updatedCount, errCount, errors };
}
