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

// Monta o payload de evento a partir da reunião do Farol
function reuniaoToEvent(reuniao, tipoNome) {
  const start = reuniao.horario_inicio || reuniao.data_hora;
  const end =
    reuniao.horario_fim ||
    (start ? new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString() : null);

  const titulo = reuniao.titulo || tipoNome || "Reunião";
  const descricao = [
    tipoNome ? `Tipo: ${tipoNome}` : null,
    reuniao.responsavel ? `Responsável: ${reuniao.responsavel}` : null,
    reuniao.ata ? `\nATA:\n${reuniao.ata}` : null,
    `\nSincronizado do Farol Tático (ID: ${reuniao.id})`,
  ]
    .filter(Boolean)
    .join("\n");

  const event = {
    summary: titulo,
    description: descricao,
    start: { dateTime: new Date(start).toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: new Date(end).toISOString(), timeZone: "America/Sao_Paulo" },
    source: { title: "Farol Tático", url: window.location.origin },
    extendedProperties: {
      private: {
        farol_reuniao_id: String(reuniao.id),
      },
    },
  };
  return event;
}

// Cria 1 evento. Retorna { ok, eventId, error }
export async function createCalendarEvent(reuniao, tipoNome) {
  try {
    const token = await ensureGoogleToken();
    const event = reuniaoToEvent(reuniao, tipoNome);
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
    return { ok: true, eventId: created.id };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// Sincroniza um lote. Chama onProgress({ done, total, titulo, ok }) a cada item.
export async function syncReunioesToGoogle(reunioes, tiposById, onProgress) {
  const total = reunioes.length;
  let done = 0;
  let okCount = 0;
  let errCount = 0;
  const errors = [];

  await ensureGoogleToken();

  for (const r of reunioes) {
    const tipoNome = tiposById?.[r.tipo_reuniao_id]?.nome || r.tipos_reuniao?.nome || "";
    const res = await createCalendarEvent(r, tipoNome);
    done++;
    if (res.ok) okCount++;
    else {
      errCount++;
      errors.push({ titulo: r.titulo, error: res.error });
    }
    if (typeof onProgress === "function") {
      onProgress({ done, total, titulo: r.titulo, ok: res.ok });
    }
  }

  return { total, okCount, errCount, errors };
}
