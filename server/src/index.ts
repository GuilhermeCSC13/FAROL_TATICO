import express, { Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import multer from "multer";
import { VertexAI } from "@google-cloud/vertexai";

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
// CONFIG GEMINI (Vertex AI)
// ======================================================================
const PROJECT_ID = process.env.PROJECT_ID;
const LOCATION = process.env.LOCATION || "us-central1";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro";

let vertexAI: VertexAI | null = null;

if (PROJECT_ID) {
  vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: LOCATION,
  });

  console.log("Vertex AI configurado.");
} else {
  console.warn(
    "PROJECT_ID não definido. Rotas de Gemini ficarão desabilitadas."
  );
}

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
    if (!vertexAI) {
      return res.status(500).json({
        error:
          "Vertex AI não configurado. Defina PROJECT_ID, LOCATION e GEMINI_MODEL nas variáveis de ambiente.",
      });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ error: "Arquivo de áudio obrigatório (campo 'audio')." });
    }

    try {
      const base64Audio = req.file.buffer.toString("base64");

      const model = vertexAI.getGenerativeModel({
        model: GEMINI_MODEL,
      });

      const promptJson =
        "Você é um assistente que transcreve reuniões em português do Brasil e gera um resumo estruturado. " +
        "Retorne SOMENTE um JSON no formato: " +
        `{\"transcricao\":\"...\",\"resumo\":{\"decisoes\":[\"...\"],\"pendencias\":[\"...\"],\"responsaveis\":[\"...\"],\"prazos\":[\"...\"]}}`;

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: base64Audio,
                  mimeType: req.file.mimetype || "audio/wav",
                },
              },
              { text: promptJson },
            ],
          },
        ],
      });

      const text =
        (result.response as any)?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text || "")
          .join("") || "";

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
        error: "Erro ao processar áudio com Gemini",
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
