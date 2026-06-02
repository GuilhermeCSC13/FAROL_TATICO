// src/components/tatico/Sidebar.jsx
import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { supabase, supabaseInove } from "../../supabaseClient";
import {
  FaHome,
  FaClipboardList,
  FaCogs,
  FaChevronDown,
  FaChevronRight,
  FaCalendarAlt,
  FaTasks,
  FaMicrophone,
  FaTags,
} from "react-icons/fa";

const setores = [
  {
    key: "operacao",
    label: "Operação",
    path: "/planejamento/operacao",
    children: [
      { label: "PCO", to: "/planejamento/operacao?area=4" },
      { label: "Gestão de Motoristas", to: "/planejamento/operacao?area=5" },
    ],
  },
  {
    key: "manutencao",
    label: "Manutenção",
    path: "/manutencao",
    children: [
      { label: "Gestão de Frota", to: "/manutencao?area=2" },
      { label: "PCM", to: "/manutencao?area=9" },
    ],
  },
  {
    key: "moov",
    label: "Moov",
    path: "/moov",
    children: [{ label: "Moov", to: "/moov?area=3" }],
  },
  {
    key: "administrativo",
    label: "Administrativo",
    path: "/planejamento/administrativo",
    children: [
      { label: "Financeiro", to: "/planejamento/administrativo?area=7" },
      { label: "Pessoas", to: "/planejamento/administrativo?area=8" },
    ],
  },
];

const getActiveSetorKey = (pathname) =>
  setores.find((setor) => pathname.startsWith(setor.path))?.key || null;
export default function Sidebar() {
  const location = useLocation();
  const [user, setUser] = useState({ nome: "Gestor", nivel: "" });

  const isPlanejamentoActive = setores.some((s) =>
    location.pathname.startsWith(s.path)
  );

  const [openPlanejamento, setOpenPlanejamento] = useState(isPlanejamentoActive);
  const [openSetorKey, setOpenSetorKey] = useState(
    getActiveSetorKey(location.pathname)
  );

  useEffect(() => {
    const loadUser = async () => {
      // 1) PRIORIDADE: dados vindos do INOVE (usuario_externo)
      const stored = localStorage.getItem("usuario_externo");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          console.log("Dados carregados do cache:", parsed);
          if (parsed.nome && parsed.nivel) {
            setUser({ nome: parsed.nome, nivel: parsed.nivel });
            return;
          }
        } catch (e) {
          console.error("Erro ao ler usuario_externo", e);
        }
      }

      // 2) FALLBACK: login direto no Farol (supabase auth) + busca no banco INOVE
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let emailAlvo = session?.user?.email;

      if (!emailAlvo && stored) {
        try {
          emailAlvo = JSON.parse(stored).email;
        } catch {}
      }

      if (emailAlvo) {
        console.log("Buscando dados no banco para:", emailAlvo);
        const { data, error } = await supabaseInove
          .from("usuarios_aprovadores")
          .select("nome, nivel, login")
          .eq("email", emailAlvo)
          .maybeSingle();

        if (error) console.error("Erro ao buscar usuário:", error);

        if (data) {
          setUser({ nome: data.nome, nivel: data.nivel });
        }
      }
    };

    loadUser();
  }, []);

  const primeiroNome = user.nome ? user.nome.split(" ")[0] : "Gestor";
  const isAdm = String(user.nivel || "").trim().toLowerCase() === "administrador";

  useEffect(() => {
    if (isPlanejamentoActive) {
      setOpenPlanejamento(true);
      setOpenSetorKey(getActiveSetorKey(location.pathname));
    }
  }, [location.pathname, isPlanejamentoActive]);

  const linkBaseClasses =
    "flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors";
  const linkInactiveClasses =
    "text-blue-100 hover:text-white hover:bg-blue-600/60";
  const linkActiveClasses = "bg-blue-100 text-blue-700 font-semibold";

  return (
    <aside className="w-64 bg-blue-700 text-white flex flex-col min-h-screen font-sans shrink-0 transition-all duration-300">
      {/* Header */}
      <div className="px-4 py-4 border-b border-blue-500/40">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center text-xl font-bold backdrop-blur-sm">
            {primeiroNome.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-xs text-blue-100 opacity-80">
              Olá, {primeiroNome} 👋
            </p>
            <p className="text-sm font-bold tracking-tight">Farol Tático</p>
          </div>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {/* ✅ Visão Geral precisa ir para /inicio ("/" é o Landing) */}
        <NavLink
          to="/inicio"
          className={({ isActive }) =>
            `${linkBaseClasses} ${
              isActive ? linkActiveClasses : linkInactiveClasses
            }`
          }
        >
          <FaHome className="text-sm" />
          <span>Visão Geral</span>
        </NavLink>

        {/* Planejamento */}
        <div className="pt-2 pb-1">
          <button
            type="button"
            onClick={() => setOpenPlanejamento((prev) => !prev)}
            className={`w-full flex items-center justify-between px-4 py-2 text-sm rounded-md transition-colors ${
              openPlanejamento
                ? "bg-blue-800/50 text-white"
                : "text-blue-100 hover:bg-blue-600/40"
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              <FaClipboardList className="text-sm" />
              <span>Planejamento Tático</span>
            </span>
            {openPlanejamento ? (
              <FaChevronDown className="text-[10px] opacity-70" />
            ) : (
              <FaChevronRight className="text-[10px] opacity-70" />
            )}
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              openPlanejamento
                ? "max-h-[500px] opacity-100 mt-1"
                : "max-h-0 opacity-0"
            }`}
          >
            <div className="ml-2 pl-2 border-l border-blue-500/30 space-y-2">
              {setores.map((setor) => {
                const isSetorActive = location.pathname.startsWith(setor.path);
                const isSetorOpen = openSetorKey === setor.key;

                return (
                  <div key={setor.key} className="space-y-1">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSetorKey((prev) =>
                          prev === setor.key ? null : setor.key
                        )
                      }
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-md transition-colors ${
                        isSetorActive
                          ? "bg-blue-500 text-white font-semibold"
                          : "text-blue-50 hover:bg-blue-600/50"
                      }`}
                    >
                      <span>{setor.label}</span>
                      {isSetorOpen ? (
                        <FaChevronDown className="text-[9px] opacity-70" />
                      ) : (
                        <FaChevronRight className="text-[9px] opacity-70" />
                      )}
                    </button>

                    {isSetorOpen && (
                      <div className="ml-3 pl-3 border-l border-blue-400/30 space-y-1">
                        {setor.children.map((item) => {
                          const isChildActive =
                            `${location.pathname}${location.search}` === item.to;

                          return (
                            <NavLink
                              key={`${setor.key}-${item.label}`}
                              to={item.to}
                              className={`block px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                                isChildActive
                                  ? "bg-blue-200 text-blue-900 font-semibold"
                                  : "text-blue-100 hover:bg-blue-600/40"
                              }`}
                            >
                              {item.label}
                            </NavLink>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Copiloto IA */}
        <NavLink
          to="/copiloto"
          className={({ isActive }) =>
            `${linkBaseClasses} ${
              isActive
                ? "bg-gradient-to-r from-red-500/20 to-red-600/20 text-red-100 border border-red-500/30 shadow-sm"
                : "text-red-200 hover:bg-red-500/10 hover:text-white"
            } mt-4 mb-2`
          }
        >
          <FaMicrophone
            className={`text-sm ${
              location.pathname === "/copiloto" ? "animate-pulse" : ""
            }`}
          />
          <span className="font-bold tracking-wide">Copiloto IA</span>
        </NavLink>

        {/* Ferramentas */}
        <div className="pt-2">
          <p className="px-4 text-[10px] font-bold text-blue-300 uppercase tracking-wider mb-1">
            Ferramentas
          </p>

          <NavLink
            to="/central-reunioes"
            className={({ isActive }) =>
              `${linkBaseClasses} ${
                isActive ? linkActiveClasses : linkInactiveClasses
              }`
            }
          >
            <FaCalendarAlt className="text-sm" />
            <span>Agenda Tática</span>
          </NavLink>

          <NavLink
            to="/tipos-reuniao"
            className={({ isActive }) =>
              `${linkBaseClasses} ${
                isActive ? linkActiveClasses : linkInactiveClasses
              }`
            }
          >
            <FaTags className="text-sm" />
            <span>Tipos de Reunião</span>
          </NavLink>

          <NavLink
            to="/central-atas"
            className={({ isActive }) =>
              `${linkBaseClasses} ${
                isActive ? linkActiveClasses : linkInactiveClasses
              }`
            }
          >
            <FaClipboardList className="text-sm" />
            <span>Banco de Atas</span>
          </NavLink>

          <NavLink
            to="/gestao-acoes"
            className={({ isActive }) =>
              `${linkBaseClasses} ${
                isActive ? linkActiveClasses : linkInactiveClasses
              }`
            }
          >
            <FaTasks className="text-sm" />
            <span>Central de Ações</span>
          </NavLink>

          {/* Configurações (somente Administrador) */}
          {isAdm && (
            <NavLink
              to="/configuracoes"
              className={({ isActive }) =>
                `${linkBaseClasses} ${
                  isActive ? linkActiveClasses : linkInactiveClasses
                }`
              }
            >
              <FaCogs className="text-sm" />
              <span>Configurações</span>
            </NavLink>
          )}
        </div>
      </nav>

      {/* Rodapé */}
      <div className="px-3 py-3 border-t border-blue-500/40">
        <button
          type="button"
          onClick={() => {
            // Se estiver embarcado dentro do Inove (iframe), pede pro pai trocar de aba.
            if (window.parent && window.parent !== window) {
              try {
                window.parent.postMessage({ type: "farol:switch-to-inove" }, "*");
                return;
              } catch {
                /* fallback abaixo */
              }
            }
            window.location.replace("https://inovequatai.onrender.com/");
          }}
          className="w-full bg-white text-blue-900 px-4 py-2 rounded-lg font-bold hover:bg-blue-50 transition-all shadow-sm text-sm"
          title="Voltar para o INOVE"
        >
          Voltar para o INOVE
        </button>

        <div className="mt-2 text-[10px] text-blue-200/60 text-center">
          Farol Tático v1.2 · 2026
        </div>
      </div>
    </aside>
  );
}
