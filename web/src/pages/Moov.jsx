import React, { useState } from "react";
import Layout from "../components/tatico/Layout";
import MoovMetas from "./MoovMetas";
import MoovRotinas from "./MoovRotinas";
import MoovResumo from "./MoovResumo";

const Moov = () => {
  const [aba, setAba] = useState("resumo");
  const contentKey = "moov-" + aba;

  const renderContent = () => {
    if (aba === "metas") return <MoovMetas key={contentKey} />;
    if (aba === "rotinas") return <MoovRotinas key={contentKey} />;
    return <MoovResumo key={contentKey} />;
  };

  const tabs = [
    ["resumo", "Visão Geral"],
    ["metas", "Farol de Metas"],
    ["rotinas", "Farol de Rotinas"],
  ];

  return (
    <Layout>
      <div className="h-full overflow-hidden bg-slate-100 p-6 flex flex-col gap-5">
        <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-blue-600">Moov</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Moov</h1>
            </div>

            <div className="inline-flex w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-inner sm:w-auto">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAba(id)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition-all sm:flex-none ${
                    aba === id
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-white hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="flex-1 min-h-0">{renderContent()}</div>
      </div>
    </Layout>
  );
};

export default Moov;
