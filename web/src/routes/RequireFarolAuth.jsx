import { Navigate, Outlet, useLocation } from "react-router-dom";

function getStoredExternalUser() {
  try {
    const v = localStorage.getItem("usuario_externo");
    if (!v) return null;
    const p = JSON.parse(v);
    return p && (p.nome || p.login) ? p : null;
  } catch {
    return null;
  }
}

// Governanca: so e autorizado quem passou pelo gate do login (farol_liberado).
// Bloqueia sessao antiga/forjada no localStorage que nao tenha a permissao.
function isFarolAuthorized() {
  const u = getStoredExternalUser();
  return !!(u && u.farol_liberado === true);
}

export default function RequireFarolAuth() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const userDataParam = params.get("userData");

  // Se existir "userData" na URL, manda para o Landing processar a troca de
  // usuario primeiro (nao entra direto na rota protegida).
  if (userDataParam) {
    return <Navigate to={`/${location.search}`} replace />;
  }

  // Sem autorizacao valida -> volta para o login (sincrono, sem flash da tela).
  if (!isFarolAuthorized()) {
    const sp = new URLSearchParams();
    if (location.pathname !== "/") {
      sp.set("next", location.pathname + location.search);
    }
    return <Navigate to={`/?${sp.toString()}`} replace />;
  }

  return <Outlet />;
}
