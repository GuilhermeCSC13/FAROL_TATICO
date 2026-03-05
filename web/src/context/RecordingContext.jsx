// src/context/RecordingContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

const RecordingContext = createContext(null);

const STORAGE_BUCKET = "gravacoes";
const SEGMENT_MS = 5 * 60 * 1000;
const TIMESLICE_MS = 1000;

// ✅ Blindagem (ajustáveis)
const ROTATE_FLUSH_DELAY_MS = 200; // ajuda MUITO em corte de 5:01
const AUDIO_HEALTH_CHECK_MS = 8000; // watchdog de áudio
const MIN_PART_BYTES_WARN = 80_000; // alerta (não aborta)
const UPLOAD_MAX_TRIES = 8; // não aborta; depois marca como problema e segue
const UPLOAD_BACKOFF_BASE_MS = 600;
const UPLOAD_BACKOFF_MAX_MS = 8000;

function nowIso() {
  return new Date().toISOString();
}
function safeFilePart(n) {
  return String(n).padStart(6, "0");
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function secondsToMMSS(s) {
  const mm = Math.floor((s || 0) / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor((s || 0) % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

async function withRetry(fn, { retries = 3, baseDelayMs = 600 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(baseDelayMs * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr;
}

/* =========================
   Toast Logger (1s)
========================= */
const ToastLogger = ({ message }) => {
  if (!message) return null;

  const isErr = message.includes("❌") || message.includes("⚠️");
  const isOk = message.includes("✅") || message.includes("🎉");

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        zIndex: 99999,
        maxWidth: "520px",
        padding: "10px 12px",
        borderRadius: 12,
        fontSize: 12,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        background: "rgba(15, 23, 42, 0.92)", // slate-900
        color: isErr ? "#fecaca" : isOk ? "#bbf7d0" : "#e2e8f0",
        border: `1px solid ${
          isErr
            ? "rgba(239,68,68,0.35)"
            : isOk
            ? "rgba(34,197,94,0.35)"
            : "rgba(148,163,184,0.25)"
        }`,
        backdropFilter: "blur(6px)",
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
};

export function RecordingProvider({ children }) {
  const [logs, setLogs] = useState([]);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimerRef = useRef(null);

  const shouldToast = (msg) => {
    const s = String(msg || "");
    return s.includes("✅") || s.includes("❌") || s.includes("⚠️") || s.includes("🎉");
  };

  const addLog = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    setLogs((prev) => [...prev, line].slice(-50));

    if (!shouldToast(msg)) return;

    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(""), 1000);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [timer, setTimer] = useState(0);
  const [current, setCurrent] = useState(null);

  const recorderRef = useRef(null);
  const mixedStreamRef = useRef(null);
  const displayStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioCtxRef = useRef(null);

  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const segmentIntervalRef = useRef(null);

  const sessionIdRef = useRef(null);
  const reuniaoIdRef = useRef(null);
  const partNumberRef = useRef(0);

  const stopAllRequestedRef = useRef(false);
  const rotatingRef = useRef(false);

  const uploadQueueRef = useRef([]);
  const uploadWorkerRunningRef = useRef(false);
  const uploadsInFlightRef = useRef(new Set());
  const queueDrainPromiseRef = useRef(null);

  const stopFinalizePromiseRef = useRef(null);
  const finalizeRunningRef = useRef(false);

  const healRunningRef = useRef(false);
  const lastHealAtRef = useRef(0);

  const buildPartPath = (reuniaoId, sessionId, partNumber) =>
    `reunioes/${reuniaoId}/${sessionId}/part_${safeFilePart(partNumber)}.webm`;

  const startTimerFn = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!startTimeRef.current) return;
      setTimer(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };
  const stopTimerFn = () => clearInterval(timerRef.current);

  const cleanupMedia = () => {
    try {
      recorderRef.current = null;

      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      displayStreamRef.current = null;

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      micStreamRef.current = null;

      mixedStreamRef.current = null;

      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close();
      }
      audioCtxRef.current = null;
    } catch (e) {
      addLog(`⚠️ Cleanup: ${e?.message || e}`);
    }
  };

  const createStopPromise = () => {
    if (stopFinalizePromiseRef.current?.promise) return stopFinalizePromiseRef.current.promise;

    let resolve, reject;
    const promise = new Promise((r, j) => {
      resolve = r;
      reject = j;
    });
    stopFinalizePromiseRef.current = { promise, resolve, reject };
    return promise;
  };

  const resolveStopPromise = () => {
    stopFinalizePromiseRef.current?.resolve?.();
    stopFinalizePromiseRef.current = null;
  };

  const rejectStopPromise = (err) => {
    stopFinalizePromiseRef.current?.reject?.(err);
    stopFinalizePromiseRef.current = null;
  };

  /* =========================
     Track Watchdog (log-only)
  ========================= */
  const watchTrack = (track, label) => {
    if (!track) return;
    try {
      track.onended = () => addLog(`⚠️ ${label} ended`);
      track.onmute = () => addLog(`⚠️ ${label} muted`);
      track.onunmute = () => addLog(`✅ ${label} unmuted`);
    } catch {
      // ignore
    }
  };

  const hasLiveAudioInMixed = () => {
    const s = mixedStreamRef.current;
    if (!s?.getAudioTracks) return false;
    const tracks = s.getAudioTracks() || [];
    return tracks.length > 0 && tracks.some((t) => t.readyState === "live");
  };

  /* =========================
     Rebuild Mixed Stream (MIC-first, blindado)
     - NÃO aborta
     - tenta recuperar MIC se caiu
  ========================= */
  const rebuildMixedStream = async () => {
    const displayStream = displayStreamRef.current;
    if (!displayStream) return;

    // ✅ garante mic (fallback principal)
    let micStream = micStreamRef.current;
    if (!micStream || (micStream.getAudioTracks?.() || []).length === 0) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;
        watchTrack(micStream.getAudioTracks?.()[0], "MIC audio");
        addLog("✅ MIC reobtido");
      } catch (e) {
        addLog(`⚠️ Não consegui reobter MIC: ${e?.message || e}`);
      }
    }

    // fecha ctx anterior e cria novo
    try {
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        await audioCtxRef.current.close();
      }
    } catch {
      // ignore
    }

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;

    const dest = audioCtx.createMediaStreamDestination();

    // ✅ MIC primeiro (fallback garantido)
    if (micStream?.getAudioTracks?.().length > 0) {
      try {
        audioCtx.createMediaStreamSource(micStream).connect(dest);
      } catch (e) {
        addLog(`⚠️ Falha ao conectar MIC: ${e?.message || e}`);
      }
    }

    // DISPLAY áudio é bônus (se existir)
    if (displayStream?.getAudioTracks?.().length > 0) {
      try {
        audioCtx.createMediaStreamSource(displayStream).connect(dest);
      } catch (e) {
        addLog(`⚠️ Falha ao conectar DISPLAY áudio: ${e?.message || e}`);
      }
    }

    mixedStreamRef.current = new MediaStream([
      ...(displayStream.getVideoTracks?.() || []),
      ...(dest.stream.getAudioTracks?.() || []),
    ]);

    const aCount = mixedStreamRef.current.getAudioTracks?.().length || 0;
    if (aCount > 0) addLog("✅ Áudio ativo (MIC fallback OK)");
    else addLog("⚠️ Mix sem áudio (seguindo mesmo assim)");
  };

  /* =========================
     Upload Worker (não perde partes)
  ========================= */
  const runUploadWorker = async () => {
    if (uploadWorkerRunningRef.current) return;
    uploadWorkerRunningRef.current = true;

    try {
      while (uploadQueueRef.current.length > 0) {
        const item = uploadQueueRef.current[0];
        if (!item) {
          uploadQueueRef.current.shift();
          continue;
        }

        item.tries = item.tries || 0;

        try {
          await uploadPart(item.blob, item.partNumber, item.reuniaoId, item.sessionId);
          addLog(`✅ Parte ${item.partNumber} enviada`);
          uploadQueueRef.current.shift(); // ✅ só remove se OK
        } catch (err) {
          item.tries += 1;

          addLog(
            `⚠️ Upload falhou Parte ${item.partNumber} (tentativa ${item.tries}): ${
              err?.message || err
            }`
          );

          // ✅ não aborta; re-tenta com backoff
          const backoff = Math.min(
            UPLOAD_BACKOFF_MAX_MS,
            UPLOAD_BACKOFF_BASE_MS * Math.pow(2, item.tries - 1)
          );
          await sleep(backoff);

          // após muitas tentativas, marca como problema e segue (sem abortar)
          if (item.tries >= UPLOAD_MAX_TRIES) {
            addLog(`❌ Parte ${item.partNumber} marcada como PROBLEMA (seguindo sem abortar)`);
            uploadQueueRef.current.shift();

            // opcional (não quebra): registra status no banco
            try {
              await supabase.from("reuniao_gravacao_partes").insert([
                {
                  reuniao_id: item.reuniaoId,
                  session_id: item.sessionId,
                  part_number: item.partNumber,
                  storage_bucket: STORAGE_BUCKET,
                  storage_path: buildPartPath(item.reuniaoId, item.sessionId, item.partNumber),
                  bytes: item.blob?.size || null,
                  status: "FAILED_UPLOAD",
                },
              ]);
            } catch {
              // ignore
            }
          }
        }
      }
    } finally {
      uploadWorkerRunningRef.current = false;

      if (
        queueDrainPromiseRef.current &&
        uploadQueueRef.current.length === 0 &&
        uploadsInFlightRef.current.size === 0
      ) {
        queueDrainPromiseRef.current.resolve?.();
        queueDrainPromiseRef.current = null;
      }
    }
  };

  const enqueueUpload = (blob, partNumber, reuniaoId, sessionId) => {
    if (!reuniaoId || !sessionId) return;
    uploadQueueRef.current.push({
      blob,
      partNumber,
      reuniaoId,
      sessionId,
      tries: 0,
      enqueuedAt: Date.now(),
    });
    runUploadWorker();
  };

  const waitQueueDrain = async () => {
    if (uploadQueueRef.current.length === 0 && uploadsInFlightRef.current.size === 0) return;

    if (!queueDrainPromiseRef.current) {
      let resolve;
      const p = new Promise((r) => (resolve = r));
      queueDrainPromiseRef.current = { promise: p, resolve };
    }

    runUploadWorker();
    await queueDrainPromiseRef.current.promise;
  };

  const uploadPart = async (blob, partNumber, reuniaoId, sessionId) => {
    const path = buildPartPath(reuniaoId, sessionId, partNumber);

    const uploadPromise = (async () => {
      await withRetry(async () => {
        const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
          contentType: "video/webm",
          upsert: false,
        });
        if (error) throw error;
      });

      await withRetry(async () => {
        const { error } = await supabase.from("reuniao_gravacao_partes").insert([
          {
            reuniao_id: reuniaoId,
            session_id: sessionId,
            part_number: partNumber,
            storage_bucket: STORAGE_BUCKET,
            storage_path: path,
            bytes: blob.size,
            status: "UPLOADED",
          },
        ]);
        if (error) throw error;
      });
    })();

    uploadsInFlightRef.current.add(uploadPromise);
    try {
      await uploadPromise;
    } finally {
      uploadsInFlightRef.current.delete(uploadPromise);
    }
  };

  /* =========================
     Recorder
  ========================= */
  const createRecorder = () => {
    const stream = mixedStreamRef.current;
    if (!stream) throw new Error("Stream inválido");

    const a = stream.getAudioTracks?.() || [];
    const v = stream.getVideoTracks?.() || [];
    if (v.length === 0) throw new Error("Sem trilha de vídeo");
    if (a.length === 0) addLog("⚠️ ATENÇÃO: stream sem áudio (part pode sair mudo)");

    const mimeTypes = ["video/webm;codecs=vp8,opus", "video/webm", ""];
    let options = undefined;
    for (const type of mimeTypes) {
      if (type === "") break;
      if (MediaRecorder.isTypeSupported(type)) {
        options = { mimeType: type };
        break;
      }
    }

    return new MediaRecorder(stream, options);
  };

  const finalizeFailClosed = async (reuniaoId, message) => {
    addLog(`❌ Erro Fatal: ${message}`);
    try {
      await supabase
        .from("reunioes")
        .update({
          gravacao_status: "ERRO",
          gravacao_erro: String(message),
          gravacao_fim: nowIso(),
          updated_at: nowIso(),
        })
        .eq("id", reuniaoId);
    } catch {
      // ignore
    }
  };

  const startSegment = (activeReuniaoId, activeSessionId) => {
    try {
      const rec = createRecorder();
      recorderRef.current = rec;

      const chunks = [];

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      rec.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });

          if (blob.size > 0 && blob.size < MIN_PART_BYTES_WARN) {
            addLog(`⚠️ Parte pequena (${blob.size} bytes). Pode estar incompleta.`);
          }

          if (blob.size > 0 && activeReuniaoId && activeSessionId) {
            const part = ++partNumberRef.current;
            enqueueUpload(blob, part, activeReuniaoId, activeSessionId);
          }

          if (!stopAllRequestedRef.current) startSegment(activeReuniaoId, activeSessionId);
        } catch (e) {
          addLog(`⚠️ Erro onstop: ${e?.message || e}`);
        }
      };

      rec.start(TIMESLICE_MS);
    } catch (e) {
      addLog(`⚠️ Erro start: ${e?.message || e}`);
    }
  };

  // ✅ Rotação blindada (flush + delay)
  const rotateSegment = async () => {
    if (rotatingRef.current) return;
    rotatingRef.current = true;
    try {
      const rec = recorderRef.current;
      if (rec && rec.state === "recording") {
        try {
          rec.requestData(); // flush
        } catch {
          // ignore
        }
        await sleep(ROTATE_FLUSH_DELAY_MS); // janela de segurança
        rec.stop();
      }
    } finally {
      rotatingRef.current = false;
    }
  };

  // ✅ Heal áudio: fecha segmento atual, reconstrói mix e segue
  const healAudioIfNeeded = async () => {
    if (!isRecording) return;
    if (stopAllRequestedRef.current) return;
    if (healRunningRef.current) return;

    // evita heal em loop
    const now = Date.now();
    if (now - lastHealAtRef.current < 5000) return;

    const ok = hasLiveAudioInMixed();
    if (ok) return;

    healRunningRef.current = true;
    lastHealAtRef.current = now;
    try {
      addLog("⚠️ Detectei gravação sem áudio. Tentando recuperar (MIC fallback)...");
      await rotateSegment();
      await rebuildMixedStream();
      // o próximo startSegment já vai usar a mixedStream nova
    } catch (e) {
      addLog(`⚠️ Heal áudio falhou: ${e?.message || e}`);
    } finally {
      healRunningRef.current = false;
    }
  };

  const startRecording = async ({ reuniaoId, reuniaoTitulo }) => {
    if (!reuniaoId) return;
    if (isRecording) return;

    stopAllRequestedRef.current = false;
    rotatingRef.current = false;
    finalizeRunningRef.current = false;
    healRunningRef.current = false;
    lastHealAtRef.current = 0;

    setTimer(0);
    setLogs([]);
    setToastMsg("");

    const sessionId = `sess_${crypto?.randomUUID?.() || Date.now()}`;
    sessionIdRef.current = sessionId;
    reuniaoIdRef.current = reuniaoId;
    partNumberRef.current = 0;

    setCurrent({
      reuniaoId,
      reuniaoTitulo: reuniaoTitulo || `Reunião ${reuniaoId}`,
      sessionId,
      startedAtIso: nowIso(),
      storageBucket: STORAGE_BUCKET,
      storagePrefix: `reunioes/${reuniaoId}/${sessionId}/`,
    });

    await supabase
      .from("reunioes")
      .update({
        status: "Em Andamento",
        gravacao_status: "GRAVANDO",
        gravacao_session_id: sessionId,
        gravacao_bucket: STORAGE_BUCKET,
        gravacao_prefix: `reunioes/${reuniaoId}/${sessionId}/`,
        gravacao_inicio: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", reuniaoId);

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      displayStreamRef.current = displayStream;
      micStreamRef.current = micStream;

      watchTrack(displayStream.getVideoTracks?.()[0], "DISPLAY video");
      watchTrack(displayStream.getAudioTracks?.()[0], "DISPLAY audio");
      watchTrack(micStream.getAudioTracks?.()[0], "MIC audio");

      // ✅ constrói mix blindado (MIC-first)
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const dest = audioCtx.createMediaStreamDestination();

      // MIC primeiro (fallback)
      if (micStream.getAudioTracks().length > 0) {
        audioCtx.createMediaStreamSource(micStream).connect(dest);
      }

      // display audio é bônus
      if (displayStream.getAudioTracks().length > 0) {
        audioCtx.createMediaStreamSource(displayStream).connect(dest);
      }

      mixedStreamRef.current = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      // se parar o compartilhamento de tela, encerra
      displayStream.getVideoTracks()[0].onended = () => stopRecording();

      startSegment(reuniaoId, sessionId);

      clearInterval(segmentIntervalRef.current);
      segmentIntervalRef.current = setInterval(() => {
        if (!stopAllRequestedRef.current) rotateSegment();
      }, SEGMENT_MS);

      startTimeRef.current = Date.now();
      setIsRecording(true);
      startTimerFn();
    } catch (err) {
      addLog(`❌ Permissão negada: ${err?.message || err}`);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (stopAllRequestedRef.current) return;
    stopAllRequestedRef.current = true;

    const stopPromise = createStopPromise();

    try {
      setIsRecording(false);
      stopTimerFn();
      clearInterval(segmentIntervalRef.current);

      const rec = recorderRef.current;
      if (rec && rec.state === "recording") {
        await new Promise((resolve) => {
          const originalOnStop = rec.onstop;
          rec.onstop = async (e) => {
            if (originalOnStop) await originalOnStop(e);
            resolve();
          };
          try {
            rec.requestData();
          } catch {
            // ignore
          }
          rec.stop();
        });
      }

      await finalizeRecording();
      await stopPromise;
    } catch (e) {
      addLog(`❌ Erro stop: ${e?.message || e}`);
      rejectStopPromise(e);
      await finalizeRecording();
    } finally {
      resolveStopPromise();
    }
  };

  // 🔥 VERSÃO AUTO-CONCLUDE (SEM BACKEND NECESSÁRIO)
  const finalizeRecording = async () => {
    const reuniaoId = reuniaoIdRef.current;
    const sessionId = sessionIdRef.current;

    if (!reuniaoId) {
      resolveStopPromise();
      return;
    }
    if (finalizeRunningRef.current) return;
    finalizeRunningRef.current = true;

    try {
      setIsProcessing(true);

      await waitQueueDrain();
      await Promise.allSettled(Array.from(uploadsInFlightRef.current));

      const duracao = startTimeRef.current
        ? Math.floor((Date.now() - startTimeRef.current) / 1000)
        : timer;

      // ✅ aponta para part 1 para não travar no "Processando"
      const firstPartPath = buildPartPath(reuniaoId, sessionId, 1);

      await withRetry(async () => {
        const { error } = await supabase
          .from("reunioes")
          .update({
            status: "Realizada",
            duracao_segundos: duracao,
            gravacao_fim: nowIso(),
            gravacao_status: "CONCLUIDO",
            gravacao_path: firstPartPath,
            gravacao_bucket: STORAGE_BUCKET,
            updated_at: nowIso(),
          })
          .eq("id", reuniaoId);
        if (error) throw error;
      });

      addLog("🎉 VÍDEO DISPONÍVEL!");
    } catch (e) {
      await finalizeFailClosed(reuniaoId, e?.message || e);
    } finally {
      setIsProcessing(false);
      cleanupMedia();

      sessionIdRef.current = null;
      reuniaoIdRef.current = null;
      partNumberRef.current = 0;

      setCurrent(null);
      setTimer(0);
      finalizeRunningRef.current = false;

      resolveStopPromise();
    }
  };

  // ✅ Watchdog: tenta curar perda de áudio sem abortar
  useEffect(() => {
    const t = setInterval(() => {
      healAudioIfNeeded();
    }, AUDIO_HEALTH_CHECK_MS);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]); // só roda quando está gravando

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!isRecording) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isRecording]);

  const value = useMemo(
    () => ({
      isRecording,
      isProcessing,
      timer,
      timerLabel: secondsToMMSS(timer),
      current,
      startRecording,
      stopRecording,
    }),
    [isRecording, isProcessing, timer, current]
  );

  return (
    <RecordingContext.Provider value={value}>
      {children}
      <ToastLogger message={toastMsg} />
    </RecordingContext.Provider>
  );
}

export function useRecording() {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error("Use dentro de RecordingProvider");
  return ctx;
}
