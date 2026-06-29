// Governanca de acesso ao Farol — MESMA regra do INOVE.
// Cada nivel tem a flag `farol_liberado` em app_niveis_acesso (no banco do
// Inove). O DB pode sobrescrever por nivel; quando nao houver linha, valem os
// defaults abaixo. So entra no Farol quem tem o nivel liberado.

const DEFAULT_FAROL_LIBERADO = {
  Pendente: false,
  CCO: false,
  "Manutenção": false,
  Tratativa: false,
  Instrutor: false,
  Embarcados: false,
  Borracheiro: false,
  RH: true,
  Gestor: true,
  Administrador: true,
};

function norm(value) {
  return String(value || "").trim();
}

// rows: linhas de app_niveis_acesso ({ nome, farol_liberado })
export function podeAcessarFarol(nivel, rows = []) {
  const nome = norm(nivel);
  if (!nome) return false;

  // Administrador sempre acessa (espelha o INOVE).
  const lower = nome.toLowerCase();
  if (lower === "administrador" || lower === "admin") return true;

  const row = (rows || []).find((r) => norm(r?.nome) === nome);
  if (row && (row.farol_liberado === true || row.farol_liberado === false)) {
    return row.farol_liberado === true;
  }

  return DEFAULT_FAROL_LIBERADO[nome] === true;
}
