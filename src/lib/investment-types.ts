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
  /** Synthetic zero row injected into the Section View for a holding that existed
   *  in the previous month but is absent in the selected month (shows the drop to zero). */
  isDropped?: boolean;
}

export type FilteredInfo = Record<string, (string | number | boolean)[] | null>;

// ── Assess (anomaly report emitted by the /assess plugin skill) ──

export type Severity = "HIGH" | "MEDIUM" | "INFO";

export interface AssessItem {
  broker: string;
  holder: string;
  type: string;
  product: string;
  nome: string;
  severity: Severity;
  kind: string;
  message: string;
  value: number | null;
  prev: number | null;
  delta: number | null;
  pct: number | null;
}

export interface AssessBucket {
  product: string;
  severity: Severity;
  count: number;
  message: string;
}

export interface AssessSection {
  area: string;
  products?: string[];
  value?: number;
  pct?: number;
  status: "ok" | "attention";
  verdict?: string;
  notes?: string;
}

export interface AssessData {
  household?: string;
  month: string;
  baseline: string | null;
  summary?: string;
  counts?: { HIGH: number; MEDIUM: number; INFO: number };
  items: AssessItem[];
  // Per-area portfolio review (mini-reports). Optional; surfaced in the assess modal.
  sections?: AssessSection[];
  // Bucket rollup + portfolio-level notes are optional — the viewer derives per-product badges
  // from `items` itself, so the model-authored file only needs to carry `items` (+ summary).
  by_product?: AssessBucket[];
  global?: { severity: Severity; kind: string; message: string }[];
}

// Identity of a holding, shared by the Section View drop-to-zero logic and assess lookups.
export const holdingKey = (broker: string, holder: string, type: string, product: string, nome: string) =>
  `${broker}|${holder}|${type}|${product}|${nome}`;

// Ant Design Tag/text color per severity (green = no finding).
export const SEVERITY_COLOR: Record<Severity | "OK", string> = {
  HIGH: "error",
  MEDIUM: "warning",
  INFO: "processing",
  OK: "success",
};

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
  { value: "Ações (Unvested Nubank)", label: "Ações (Unvested Nubank)" },
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
  "Ações (Unvested Nubank)",
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
  "Ações (Unvested Nubank)",
  "Renda Fixa US",
  "Disponível para Investir US",
];

export const isUSInvestment = (product: string) => US_PRODUCTS.includes(product);

export const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
