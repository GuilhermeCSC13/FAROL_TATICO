import express, { Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import multer from "multer";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ======================================================================
// CONFIG BÁSICA
// ======================================================================
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());
app.use(morgan("dev"));

// ======================================================================
// CONFIG IA
// Esta rota nao guarda chave: ela fala com a Edge Function `gemini-proxy` do
// Supabase, que e o unico lugar onde a OPENROUTER_API_KEY existe.
// ======================================================================
const IA_PROXY_URL =
  process.env.IA_PROXY_URL?.trim() ||
  "https://zgmxylsmbremaprebifq.supabase.co/functions/v1/gemini-proxy";
const IA_MODELO = process.env.IA_MODELO?.trim() || "google/gemini-2.5-pro";

console.log(`IA via proxy: ${IA_PROXY_URL} (${IA_MODELO}).`);

// ======================================================================
// UPLOAD DE ÁUDIO EM MEMÓRIA
// ======================================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// ======================================================================
// ROTA DE SAÚDE
// ======================================================================
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "API Farol de Metas e Reuniões rodando",
  });
});

// ======================================================================
// ROTA: TRANSCRIÇÃO + RESUMO COM GEMINI
// POST /api/reunioes/:id/transcrever
// body form-data: audio (file)
// ======================================================================
app.post(
  "/api/reunioes/:id/transcrever",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    if (!IA_PROXY_URL) {
      return res.status(500).json({
        error: "IA não configurada. Defina IA_PROXY_URL nas variáveis de ambiente.",
      });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ error: "Arquivo de áudio obrigatório (campo 'audio')." });
    }

    try {
      const base64Audio = req.file.buffer.toString("base64");

      const promptJson =
        "Você é um assistente que transcreve reuniões em português do Brasil e gera um resumo estruturado. " +
        "Retorne SOMENTE um JSON no formato: " +
        `{\"transcricao\":\"...\",\"resumo\":{\"decisoes\":[\"...\"],\"pendencias\":[\"...\"],\"responsaveis\":[\"...\"],\"prazos\":[\"...\"]}}`;

      const mime = req.file.mimetype || "audio/wav";

      // Áudio vai inline (base64) porque aqui só temos o buffer do upload, não
      // uma URL. Arquivo grande estoura o corpo da Edge Function — se um dia
      // esta rota voltar a ser usada de verdade, o caminho é subir pro Storage
      // e mandar `mediaUrl`, como a Central de Atas faz.
      const proxyResp = await fetch(IA_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: IA_MODELO,
          prompt: [
            promptJson,
            { inlineData: { mimeType: mime, data: base64Audio } },
          ],
        }),
      });

      if (!proxyResp.ok) {
        const detalhe = await proxyResp.text().catch(() => "");
        throw new Error(`proxy ${proxyResp.status}: ${detalhe.slice(0, 400)}`);
      }

      const bruto: any = await proxyResp.json();
      if (!bruto?.ok) {
        throw new Error(bruto?.error || "resposta inválida do proxy");
      }

      const uso = bruto?.raw?.usage ?? {};
      console.log(
        `[ia] ${IA_MODELO} tokens=${uso.prompt_tokens ?? "?"}/${
          uso.completion_tokens ?? "?"
        } custo=${uso.cost ?? "?"}`
      );

      const text: string = bruto?.text || "";

      let payload: any;

      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }

      res.json({
        reuniaoId: req.params.id,
        resultado: payload,
      });
    } catch (error: any) {
      console.error("Erro ao processar áudio:", error);

      res.status(500).json({
        error: "Erro ao processar áudio com a IA",
        detail: error?.message,
      });
    }
  }
);

// ======================================================================
// START
// ======================================================================
app.listen(PORT, () => {
  console.log(`Server rodando na porta ${PORT}`);
});
