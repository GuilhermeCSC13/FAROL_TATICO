export const getMesAtualFarol = () => {
  const mesAtual = new Date().getMonth() + 1;
  return Math.min(Math.max(mesAtual, 1), 12);
};

export const isCurrencyUnit = (unidade) =>
  String(unidade || "").trim().toLowerCase() === "currency";

export const formatFarolValue = (value, unidade) => {
  if (value === null || value === undefined || value === "") return "";

  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  if (isCurrencyUnit(unidade)) {
    return number.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return Number.isInteger(number) ? String(number) : String(number);
};

export const exportFullElementAsImage = async ({
  element,
  html2canvas,
  fileName,
  format = "png",
}) => {
  if (!element) return;

  const clone = element.cloneNode(true);
  clone.style.position = "absolute";
  clone.style.left = "-100000px";
  clone.style.top = "0";
  clone.style.width = `${element.scrollWidth}px`;
  clone.style.height = "auto";
  clone.style.maxWidth = "none";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  clone.style.background = "#ffffff";

  document.body.appendChild(clone);

  try {
    const width = clone.scrollWidth;
    const height = clone.scrollHeight;

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
    });

    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const ext = format === "jpg" ? "jpg" : "png";
    const dataUrl = canvas.toDataURL(
      mime,
      format === "jpg" ? 0.92 : undefined
    );

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${fileName}.${ext}`;
    a.click();
  } finally {
    document.body.removeChild(clone);
  }
};
