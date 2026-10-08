import { supabaseInove } from "../supabaseClient";

// O cabeçalho que prova QUEM está chamando a IA (gemini-proxy) e a Agenda (google-calendar).
// O Farol não abre sessão no próprio Supabase: o login dele é o do INOVE (LandingFarol →
// signInWithPassword), e as funções conferem esse token no INOVE (ver
// supabase/functions/_shared/sessaoInove.ts). Sem sessão, vai vazio e a função recusa com o motivo.
export async function cabecalhoSessaoInove() {
  const { data } = await supabaseInove.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { "x-inove-token": token } : {};
}
