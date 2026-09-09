// Wrapper compativel com a interface do @google/generative-ai, mas que vai
// pela Edge Function `gemini-proxy` no Supabase — que desde a migração fala
// com o OPENROUTER, nao mais com a Gemini API direta. A chave
// (OPENROUTER_API_KEY) fica como secret no Supabase, nunca chega no bundle.
//
// O modelo continua sendo o mesmo (Gemini 2.5 Pro), so que pelo slug do
// OpenRouter: "google/gemini-2.5-pro". Trocar de modelo aqui e so trocar essa
// string por outro slug do catalogo (https://openrouter.ai/models).
//
// O nome dos exports e do arquivo e historico — mantido para nao mexer nas
// tres telas que ja chamam isso.

import { supabase } from "../supabaseClient";

const MODELO_PADRAO = "google/gemini-2.5-pro";

async function callProxy(prompt, { model = MODELO_PADRAO } = {}) {
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

export const getGeminiFlash = () => buildModel(MODELO_PADRAO);
export const getGeminiModel = (modelName) => buildModel(modelName);
