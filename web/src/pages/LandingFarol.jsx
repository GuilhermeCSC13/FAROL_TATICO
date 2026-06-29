import { useEffect, useState } from "react";
// ✅ IMPORTAÇÃO CORRETA: Trazendo os dois clientes
import { supabase, supabaseInove } from "../supabaseClient";
import { podeAcessarFarol } from "../utils/farolAccess";
import { LogIn, Lock, User, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function LandingFarol() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Inputs
  const [inputLogin, setInputLogin] = useState("");
  const [senha, setSenha] = useState("");

  // 1. LIMPEZA DE SESSÃO
  useEffect(() => {
    localStorage.removeItem("usuario_externo");
    localStorage.removeItem("farol_ia_date");
    localStorage.removeItem("farol_ia_text");
    localStorage.removeItem("sb-access-token");
    sessionStorage.clear();
    
    // Garante logout local (nos dois bancos: Farol e Inove)
    const cleanSession = async () => {
        try { await supabase.auth.signOut(); } catch {}
        try { await supabaseInove.auth.signOut(); } catch {}
    };
    cleanSession();
  }, []);

  // 2. LOGIN (CONSULTANDO O BANCO DO INOVE)
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    const termo = inputLogin.trim();
    const pass = senha.trim();

    if (!termo || !pass) {
        setErrorMsg("Preencha usuário e senha.");
        setLoading(false);
        return;
    }

    try {
      // 1) Valida pela RPC segura do Inove: a senha é conferida DENTRO do banco
      //    (SECURITY DEFINER); o Farol NUNCA lê a coluna senha. Funciona mesmo
      //    com a RLS ligada (anon bloqueado).
      const { data: usuario, error } = await supabaseInove.rpc("verify_legacy_login", {
        p_identifier: termo,
        p_senha: pass,
      });

      if (error) {
        console.error("Erro na conexão Inove:", error);
        throw new Error("Erro ao validar credenciais no Inove.");
      }

      if (!usuario) {
        setErrorMsg("Usuário ou senha incorretos.");
        setLoading(false);
        return;
      }

      if (usuario.ativo === false) {
        setErrorMsg("Sua conta está inativa no momento.");
        setLoading(false);
        return;
      }

      // 2) Abre a sessão REAL (authenticated) no Inove, pra RLS liberar as
      //    leituras de usuarios_aprovadores. Se a conta Auth ainda não existir,
      //    segue em contingência (anon) sem travar o acesso.
      const emailLogin = String(usuario.email || "").trim().toLowerCase();
      if (emailLogin) {
        const { error: signInError } = await supabaseInove.auth.signInWithPassword({
          email: emailLogin,
          password: pass,
        });
        if (signInError) {
          console.warn("Sessão authenticated não abriu (contingência):", signInError.message);
        }
      }

      // 2.1) GOVERNANCA: nem todos os niveis acessam o Farol. Mesma regra do
      //      INOVE (flag farol_liberado por nivel em app_niveis_acesso).
      const { data: niveis } = await supabaseInove
        .from("app_niveis_acesso")
        .select("nome, farol_liberado");

      if (!podeAcessarFarol(usuario.nivel, niveis || [])) {
        try { await supabaseInove.auth.signOut(); } catch {}
        setErrorMsg("Seu nivel de acesso nao tem permissao para o Farol Tatico.");
        setLoading(false);
        return;
      }

      // 3. SUCESSO
      const usuarioOficial = {
        id: usuario.id,
        nome: usuario.nome || usuario.login,
        email: usuario.email,
        nivel: usuario.nivel,
        login: usuario.login,
        setor: usuario.setor || "N/A",
        origem: "Login Farol (Auth Inove)"
      };

      // Grava a sessão localmente no Farol
      localStorage.setItem("usuario_externo", JSON.stringify(usuarioOficial));

      // Entra no sistema
      navigate("/inicio", { replace: true });

    } catch (err) {
      setErrorMsg(err.message || "Erro de conexão.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 to-blue-900"></div>
      <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-blue-200 rounded-full blur-3xl opacity-50"></div>
      
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-2xl max-w-sm w-full relative z-10">
        
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Farol Tático</h1>
          <p className="text-slate-500 text-sm mt-1">Acesso Integrado (Inove)</p>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3 text-red-600 text-sm animate-pulse">
            <AlertTriangle size={18} />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative group">
            <User className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={20} />
            <input
              type="text"
              placeholder="Usuário ou E-mail"
              value={inputLogin}
              onChange={(e) => setInputLogin(e.target.value)}
              className="w-full pl-10 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white transition-all outline-none text-slate-700 font-medium"
              autoFocus
            />
          </div>

          <div className="relative group">
            <Lock className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={20} />
            <input
              type="password"
              placeholder="Senha de Acesso"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full pl-10 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white transition-all outline-none text-slate-700 font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 mt-4 active:scale-[0.98]"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <><LogIn size={20} /> Validar Acesso</>}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400 font-mono">
            SISTEMA INTEGRADO • v2.4
          </p>
        </div>
      </div>
    </div>
  );
}
