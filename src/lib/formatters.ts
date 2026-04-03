export const REDACTED = "R$ •••••";

export const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatCompact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return formatBRL(v);
};

export const formatPercent = (v: number) =>
  `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export const formatMonth = (month: string) => {
  const [year, m] = month.split("-");
  const names = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${names[parseInt(m, 10) - 1]} ${year}`;
};

export const formatMonthShort = (month: string) => {
  const [, m] = month.split("-");
  const names = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];
  return names[parseInt(m, 10) - 1] || month;
};

export const formatMonthShortYear = (month: string) => {
  const [year, m] = month.split("-");
  return `${formatMonthShort(month)} '${year.slice(2)}`;
};
