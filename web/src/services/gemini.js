// Wrapper compativel com a interface do @google/generative-ai mas que vai
// pela Edge Function `gemini-proxy` no Supabase. A chave da Gemini API
// fica como secret no Supabase (GEMINI_API_KEY), nunca chega no bundle.

import { supabase } from "../supabaseClient";

async function callProxy(prompt, { model = "gemini-2.5-pro" } = {}) {
  const { data, error } = await supabase.functions.invoke("gemini-proxy", {
    body: { model, prompt },
  });
  if (error) {
    throw new Error(error.message || "Falha ao chamar gemini-proxy");
  }
  if (!data?.ok) {
    throw new Error(data?.error || "Resposta invalida do gemini-proxy");
  }
  return data.text || "";
}

// Mantem a mesma assinatura usada hoje em Inicio.jsx, CentralAtas.jsx,
// TacticalAssistant.jsx:
//   const model = getGeminiFlash();
//   const result = await model.generateContent(prompt);
//   result.response.text();
function buildModel(modelName) {
  return {
    generateContent: async (prompt) => {
      const text = await callProxy(prompt, { model: modelName });
      return { response: { text: () => text } };
    },
  };
}

export const getGeminiFlash = () => buildModel("gemini-2.5-pro");
export const getGeminiModel = (modelName) => buildModel(modelName);
