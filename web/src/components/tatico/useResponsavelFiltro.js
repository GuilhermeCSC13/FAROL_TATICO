import { useMemo, useState } from "react";

export default function useResponsavelFiltro(items = [], field = "responsavel") {
  const [responsavelFiltro, setResponsavelFiltro] = useState("");

  const responsaveis = useMemo(() => {
    return [...new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => String(item?.[field] || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items, field]);

  const itemsFiltrados = useMemo(() => {
    if (!responsavelFiltro) return items;
    return (Array.isArray(items) ? items : []).filter(
      (item) => String(item?.[field] || "").trim() === responsavelFiltro
    );
  }, [items, field, responsavelFiltro]);

  return {
    responsavelFiltro,
    setResponsavelFiltro,
    responsaveis,
    itemsFiltrados,
  };
}
