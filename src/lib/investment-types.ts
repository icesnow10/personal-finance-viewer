export interface Investment {
  key: string;
  month_year: string;
  broker: string;
  holder: "michel" | "carol" | "";
  type: "available" | "frozen" | "";
  product: string;
  nome: string;
  quantidade: number;
  valor_atual: number;
  updated_at: string;
  children?: Investment[];
  quantidade_usd?: number;
  taxa_usd_brl?: number;
}

export type FilteredInfo = Record<string, (string | number | boolean)[] | null>;

export interface ComparisonRow {
  key: string;
  type: string;
  product: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
  [month: string]: string | number | boolean | undefined;
}

export interface DetailedComparisonRow {
  key: string;
  product: string;
  nome: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
  isProductRow?: boolean;
  children?: DetailedComparisonRow[];
  [key: string]: string | number | boolean | DetailedComparisonRow[] | undefined;
}

export const STORAGE_KEY = "personal_finances_data";

export const brokerOptions = [
  { value: "BTG", label: "BTG" },
  { value: "Caixa", label: "Caixa" },
  { value: "Clear", label: "Clear" },
  { value: "Morgan Stanley", label: "Morgan Stanley" },
  { value: "Nubank", label: "Nubank" },
];

export const productOptions = [
  { value: "Ações BRA", label: "Ações BRA" },
  { value: "Ações US", label: "Ações US" },
  { value: "Ações (Vested Nubank)", label: "Ações (Vested Nubank)" },
  { value: "Ações (Vesting Nubank)", label: "Ações (Vesting Nubank)" },
  { value: "Renda Fixa", label: "Renda Fixa" },
  { value: "Renda Fixa US", label: "Renda Fixa US" },
  { value: "ETF", label: "ETF" },
  { value: "Fundo Imobiliário", label: "Fundo Imobiliário" },
  { value: "Reserva de Emergência", label: "Reserva de Emergência" },
  { value: "Tesouro Direto", label: "Tesouro Direto" },
  { value: "Disponível para Investir", label: "Disponível para Investir" },
  { value: "Disponível para Investir US", label: "Disponível para Investir US" },
  { value: "FGTS", label: "FGTS" },
];

export const productOrder = [
  "Ações BRA",
  "Ações US",
  "Ações (Vested Nubank)",
  "Ações (Vesting Nubank)",
  "Fundo Imobiliário",
  "Renda Fixa",
  "Renda Fixa US",
  "Tesouro Direto",
  "Reserva de Emergência",
  "ETF",
  "Disponível para Investir",
  "Disponível para Investir US",
  "FGTS",
];

export const US_PRODUCTS = [
  "Ações US",
  "Ações (Vested Nubank)",
  "Ações (Vesting Nubank)",
  "Renda Fixa US",
  "Disponível para Investir US",
];

export const isUSInvestment = (product: string) => US_PRODUCTS.includes(product);

export const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
