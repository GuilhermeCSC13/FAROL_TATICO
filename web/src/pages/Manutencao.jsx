import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/tatico/Layout";
import ManutencaoMetas from "./ManutencaoMetas";
import ManutencaoRotinas from "./ManutencaoRotinas";
import ManutencaoResumo from "./ManutencaoResumo";

const AREAS_MANUTENCAO = {
  2: "Gestão de Frota",
  9: "PCM",
};

const Manutencao = () => {
  const [aba, setAba] = useState("resumo");
  const [searchParams] = useSearchParams();

  const subsetor = useMemo(() => {
    const area = searchParams.get("area") || "2";
    return AREAS_MANUTENCAO[area] || "Gestão de Frota";
  }, [searchParams]);

  const renderContent = () => {
    if (aba === "metas") return <ManutencaoMetas />;
    if (aba === "rotinas") return <ManutencaoRotinas />;
    return <ManutencaoResumo />;
  };

  const baseBtn =
    "px-4 py-2 text-xs sm:text-sm font-medium rounded-md border transition-all";
  const inactiveBtn =
    "text-slate-500 border-slate-200 bg-white hover:bg-slate-100";
  const activeBtn = "text-white bg-blue-600 border-blue-600 shadow-sm";

  return (
    <Layout>
      <div className="h-full p-6 bg-slate-50 overflow-hidden flex flex-col font-sans">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-500">
              Manutenção
            </p>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-800 uppercase tracking-tight">
              {subsetor}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Visão Geral, Farol de Metas e Farol de Rotinas apenas de {subsetor}.
            </p>
          </div>

          <div className="inline-flex bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setAba("resumo")}
              className={`${baseBtn} ${
                aba === "resumo" ? activeBtn : inactiveBtn
              } rounded-none`}
            >
              Visão Geral
            </button>
            <button
              type="button"
              onClick={() => setAba("metas")}
              className={`${baseBtn} ${
                aba === "metas" ? activeBtn : inactiveBtn
              } rounded-none border-l-0`}
            >
              Farol de Metas
            </button>
            <button
              type="button"
              onClick={() => setAba("rotinas")}
              className={`${baseBtn} ${
                aba === "rotinas" ? activeBtn : inactiveBtn
              } rounded-none border-l-0`}
            >
              Farol de Rotinas
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">{renderContent()}</div>
      </div>
    </Layout>
  );
};

export default Manutencao;
