// src/utils/abrirHtml.js
//
// Anexo .html nas Ações (01/10/2026 — dono: "nas ações não aceita HTML").
// O storage do Supabase entrega .html como text/plain (proteção contra XSS): abrir o link
// direto mostra o código, não a página. Aqui o conteúdo é baixado e mostrado numa aba nova,
// dentro de um iframe com `sandbox` SEM allow-same-origin — o HTML roda os scripts dele
// (gráficos, filtros), mas numa origem isolada: não lê a sessão nem o localStorage do Farol.

export const ehHtml = (url) => /\.html?$/i.test(String(url || "").split("?")[0]);

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const escTxt = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function abrirHtmlSeguro(url) {
  // a aba abre já no clique; depois do fetch o bloqueador de pop-up barraria
  const aba = window.open("", "_blank");
  if (!aba) {
    alert("O navegador bloqueou a nova aba. Permita pop-ups para o Farol e clique de novo.");
    return;
  }
  aba.opener = null;
  const nome = decodeURIComponent(String(url).split("?")[0].split("/").pop() || "Anexo");
  const escrever = (html) => {
    aba.document.open();
    aba.document.write(html);
    aba.document.close();
  };
  escrever(`<p style="font-family:sans-serif;padding:24px;color:#475569">Carregando ${escTxt(nome)}…</p>`);
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    escrever(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escTxt(nome)}</title>` +
        `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head>` +
        `<body><iframe sandbox="allow-scripts allow-popups allow-modals allow-downloads allow-forms" srcdoc="${escAttr(html)}"></iframe></body></html>`
    );
  } catch (e) {
    escrever(
      `<p style="font-family:sans-serif;padding:24px;color:#b91c1c">Não consegui abrir ${escTxt(nome)}: ${escTxt(e?.message || e)}</p>` +
        `<p style="font-family:sans-serif;padding:0 24px"><a href="${escAttr(url)}" download>Baixar o arquivo</a></p>`
    );
  }
}
