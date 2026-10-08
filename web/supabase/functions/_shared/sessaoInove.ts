// QUEM CHAMA TEM DE ESTAR LOGADO NO INOVE E TER O FAROL LIBERADO (08/10/2026).
//
// Até aqui `gemini-proxy` e `google-calendar` respondiam a qualquer um (verify_jwt=false, CORS *,
// sem conferir nada): dava para gastar a cota da IA e criar/apagar evento na agenda do admin
// só com a chave pública do site. O Farol não abre sessão no próprio Supabase — o login dele é o
// do INOVE (LandingFarol → signInWithPassword no INOVE) —, então a prova de quem chama é o token
// da sessão do INOVE, que o site manda no cabeçalho `x-inove-token` (web/src/utils/sessaoInove.js).
//
// A conferência é a mesma do login do Farol (`podeAcessarFarol`): conta ativa e aprovada, e
// Administrador ou nível com `app_niveis_acesso.farol_liberado`. Tudo lido no INOVE COM O TOKEN
// DA PESSOA (a RLS do INOVE deixa o logado ler o próprio cadastro e os níveis): nenhuma chave de
// serviço do INOVE mora aqui. Segredo necessário: INOVE_ANON_KEY (a chave pública do INOVE).
const INOVE_URL = Deno.env.get("INOVE_URL") ?? "https://wboelthngddvkgrvwkbu.supabase.co";
const INOVE_ANON = Deno.env.get("INOVE_ANON_KEY") ?? "";

export const CABECALHOS_CORS = "authorization, x-client-info, apikey, content-type, x-inove-token";

export type Sessao = { ok: true; nome: string; nivel: string } | { ok: false; status: number; erro: string };

export async function conferirSessaoInove(req: Request): Promise<Sessao> {
  const token = (req.headers.get("x-inove-token") ?? "").trim();
  if (!token) return { ok: false, status: 401, erro: "sem sessão do INOVE — entre no Farol de novo" };
  if (!INOVE_ANON) return { ok: false, status: 500, erro: "função sem configuração (INOVE_ANON_KEY)" };
  const h = { apikey: INOVE_ANON, Authorization: `Bearer ${token}` };

  const u = await fetch(`${INOVE_URL}/auth/v1/user`, { headers: h });
  if (!u.ok) return { ok: false, status: 401, erro: "sessão do INOVE vencida ou inválida — entre no Farol de novo" };
  const usuario = await u.json();
  const id = String(usuario?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, status: 401, erro: "sessão do INOVE inválida" };

  const p = await fetch(
    `${INOVE_URL}/rest/v1/usuarios_aprovadores?select=nome,nivel,ativo,status_cadastro&auth_user_id=eq.${id}&limit=1`,
    { headers: h },
  );
  const perfil = p.ok ? (await p.json())?.[0] : null;
  const normal = (v: unknown) => String(v ?? "").trim().toLowerCase();
  if (!perfil || perfil.ativo !== true || normal(perfil.status_cadastro) !== "aprovado") {
    return { ok: false, status: 403, erro: "usuário sem acesso" };
  }
  if (["administrador", "admin"].includes(normal(perfil.nivel))) {
    return { ok: true, nome: perfil.nome, nivel: perfil.nivel };
  }
  const n = await fetch(
    `${INOVE_URL}/rest/v1/app_niveis_acesso?select=farol_liberado&nome=eq.${encodeURIComponent(perfil.nivel ?? "")}&limit=1`,
    { headers: h },
  );
  const nivel = n.ok ? (await n.json())?.[0] : null;
  if (nivel?.farol_liberado !== true) return { ok: false, status: 403, erro: "seu nível de acesso não tem o Farol liberado" };
  return { ok: true, nome: perfil.nome, nivel: perfil.nivel };
}
