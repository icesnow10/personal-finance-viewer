import React, { useMemo, useState, useCallback } from "react";
import { Typography, theme, Modal, Segmented, Checkbox, InputNumber } from "antd";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot, Label,
} from "recharts";
import { Info, ExternalLink, RefreshCw, ChevronsDown, ChevronsUp, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/router";
import { useBudget } from "@/hooks/useBudget";
import { MonthSelector } from "@/components/shared/MonthSelector";
import { PercentChange } from "@/components/shared/PercentChange";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  getSpendingPace, getDailySpendingCurve, getCategoryComparison,
  getBucketProgress, getBudgetBuckets, getBudgetSummary,
} from "@/lib/computations";
import { formatBRL, formatPercent, formatCompact, REDACTED } from "@/lib/formatters";
import { useRedact } from "@/context/RedactContext";
import { getCategoryMeta } from "@/lib/category-meta";
import type { BudgetData } from "@/lib/types";

const { Text, Title } = Typography;

/* ── Visor-style card wrapper ─────────────────────────────────── */
function VisorCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        background: token.colorBgContainer,
        borderRadius: 12,
        padding: "24px 28px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── Section header with link ─────────────────────────────────── */
function SectionHead({ title, linkText, href }: { title: string; linkText?: string; href?: string }) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8c8c8c" }}>
          {title}
        </span>
        <Info size={13} color="#bfbfbf" />
      </div>
      {linkText && href && (
        <span
          onClick={() => router.push(href)}
          style={{ fontSize: 12, color: "#6366f1", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}
        >
          {linkText} <ExternalLink size={12} />
        </span>
      )}
    </div>
  );
}

/* ── Ritmo de Gastos (Visor style) ────────────────────────────── */
function SpendingPaceCard({ data, previousData }: { data: BudgetData; previousData: BudgetData | null }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);
  const rCompact = (v: number) => redacted ? "•••••" : formatCompact(v);
  const currentCurve = useMemo(() => getDailySpendingCurve(data), [data]);
  const previousCurve = useMemo(
    () => (previousData ? getDailySpendingCurve(previousData) : null),
    [previousData]
  );
  const pace = useMemo(() => getSpendingPace(data, previousData), [data, previousData]);

  const chartData = useMemo(() => {
    return currentCurve.map((d, i) => ({
      day: d.day,
      current: d.cumulative,
      previous: previousCurve?.[i]?.cumulative ?? null,
    }));
  }, [currentCurve, previousCurve]);

  // Find last day with spending data
  const lastDataDay = useMemo(() => {
    for (let i = currentCurve.length - 1; i >= 0; i--) {
      if (i === 0 || currentCurve[i].cumulative !== currentCurve[i - 1].cumulative) {
        // find last day that had a change or the last day with data
      }
    }
    if (data.data_through) return new Date(data.data_through).getDate();
    return pace.daysElapsed;
  }, [currentCurve, data, pace]);

  const lastCurrentValue = chartData[lastDataDay - 1]?.current ?? 0;
  const lastPreviousValue = previousCurve?.[previousCurve.length - 1]?.cumulative ?? null;
  const diff = lastPreviousValue != null ? lastCurrentValue - lastPreviousValue : null;
  const diffLabel = diff != null
    ? (diff >= 0 ? `${rCompact(diff)} acima` : `${rCompact(Math.abs(diff))} abaixo`)
    : null;

  // Projected line (dashed extension)
  const projectedData = useMemo(() => {
    if (!data.partial && !data.data_through) return null;
    const startDay = lastDataDay;
    const startValue = chartData[startDay - 1]?.current ?? 0;
    const daysInMonth = pace.daysInMonth;
    const dailyAvg = pace.dailyAvg;
    const points = [];
    for (let d = startDay; d <= daysInMonth; d++) {
      points.push({
        day: d,
        projected: Math.round((startValue + dailyAvg * (d - startDay)) * 100) / 100,
      });
    }
    return points;
  }, [data, lastDataDay, chartData, pace]);

  // Merge projected into chart data
  const fullChartData = useMemo(() => {
    const projMap = new Map<number, number>();
    if (projectedData) {
      for (const p of projectedData) projMap.set(p.day, p.projected);
    }
    return chartData.map((d) => ({
      ...d,
      projected: projMap.get(d.day) ?? null,
    }));
  }, [chartData, projectedData]);

  return (
    <VisorCard>
      <SectionHead title="Ritmo de Gastos" linkText="Ver todas" href="/transactions" />

      {/* Big value */}
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 32, fontWeight: 300, color: token.colorText }}>
          {r(lastCurrentValue)}
        </span>
        {diffLabel && (
          <span style={{ fontSize: 16, fontWeight: 400, color: "#8c8c8c", marginLeft: 8 }}>
            {diff != null && diff >= 0 ? "acima" : "abaixo"}
          </span>
        )}
      </div>

      {/* Variation badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        {pace.variationVsPrevious != null && (
          <PercentChange value={pace.variationVsPrevious} invert />
        )}
        {lastPreviousValue != null && (
          <span style={{ fontSize: 13, color: "#8c8c8c" }}>
            vs {r(lastPreviousValue!)} mes anterior
          </span>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={fullChartData} margin={{ left: 10, right: 20, top: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="paceGradCurrent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff6b6b" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#ff6b6b" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="paceGradBelow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffa940" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#ffa940" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#e8e8e8" }}
            tick={{ fill: "#8c8c8c" }}
            interval={4}
          />
          <YAxis
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#8c8c8c" }}
            tickFormatter={(v) => redacted ? "•••" : `R$ ${(v / 1000).toFixed(0)}k`}
            width={65}
          />
          <Tooltip
            formatter={(v: number, name: string) => {
              const label = name === "current" ? "Este mes" : name === "previous" ? "Mes passado" : "Projecao";
              return [r(v), label];
            }}
            labelFormatter={(l) => `Dia ${l}`}
            contentStyle={{
              background: "#fff",
              border: "none",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              fontSize: 13,
            }}
          />

          {/* Previous month - dashed gray */}
          {previousCurve && (
            <Area
              type="monotone"
              dataKey="previous"
              stroke="#bfbfbf"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              fill="none"
              dot={false}
              connectNulls={false}
            />
          )}

          {/* Projected - dashed continuation */}
          <Area
            type="monotone"
            dataKey="projected"
            stroke="#bfbfbf"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            fill="none"
            dot={false}
            connectNulls={false}
          />

          {/* Current month - solid red with gradient fill */}
          <Area
            type="monotone"
            dataKey="current"
            stroke="#ff4d4f"
            strokeWidth={2.5}
            fill="url(#paceGradCurrent)"
            dot={false}
            connectNulls={false}
          />

          {/* Endpoint dot */}
          <ReferenceDot
            x={lastDataDay}
            y={lastCurrentValue}
            r={5}
            fill="#ff4d4f"
            stroke="#fff"
            strokeWidth={2}
          >
            <Label
              value={r(lastCurrentValue)}
              position="top"
              offset={12}
              style={{ fontSize: 11, fontWeight: 600, fill: "#ff4d4f" }}
            />
          </ReferenceDot>
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginTop: 12, paddingLeft: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 2, background: "#ff4d4f", borderRadius: 1 }} />
          <span style={{ fontSize: 12, color: "#8c8c8c" }}>Este mes</span>
        </div>
        {previousCurve && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 0, borderTop: "2px dashed #bfbfbf" }} />
            <span style={{ fontSize: 12, color: "#8c8c8c" }}>Mes passado</span>
          </div>
        )}
      </div>
    </VisorCard>
  );
}

/* ── Bucket progress bar ──────────────────────────────────────── */
const BUCKET_COLORS: Record<string, { bar: string; bg: string }> = {
  custos_fixos: { bar: "#4096ff", bg: "rgba(64, 150, 255, 0.08)" },
  conforto: { bar: "#fa8c16", bg: "rgba(250, 140, 22, 0.08)" },
  liberdade_financeira: { bar: "#52c41a", bg: "rgba(82, 196, 26, 0.08)" },
};

function BucketRow({ bucket, pendingTargetPct, isPositiveBucket, onTargetChange }: {
  bucket: ReturnType<typeof getBucketProgress>[0];
  pendingTargetPct?: number;
  isPositiveBucket?: boolean;
  onTargetChange?: (pct: number) => void;
}) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);
  const defaultColors = BUCKET_COLORS[bucket.key] || { bar: "#6366f1", bg: "rgba(99,102,241,0.08)" };
  const overBudget = bucket.actualPct > bucket.targetPct;
  const underBudgetBad = isPositiveBucket && !overBudget && bucket.actualPct < bucket.targetPct;
  const colors = underBudgetBad ? { bar: "#ff4d4f", bg: "rgba(255,77,79,0.08)" } : defaultColors;
  const overflowColor = isPositiveBucket ? "#1a7a0a" : "#ff4d4f";
  // Scale everything so the total (fill + overflow) never exceeds 100%
  const maxPct = Math.max(bucket.actualPct, bucket.targetPct);
  const scale = maxPct > 0 ? 100 / maxPct : 1;
  const targetMark = bucket.targetPct * scale;
  const fillPct = Math.min(bucket.actualPct, bucket.targetPct) * scale;
  const overflowPct = overBudget ? (bucket.actualPct - bucket.targetPct) * scale : 0;

  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
      {/* Name + values */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{bucket.name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{r(bucket.actualAmount)}</span>
          <span style={{ fontSize: 11, color: "#8c8c8c" }}>
            / {r(bucket.targetAmount)}
          </span>
        </div>
      </div>

      {/* Bar */}
      <div style={{ position: "relative", height: 8, borderRadius: 4, background: token.colorFillSecondary, overflow: "hidden" }}>
        {/* Fill up to target */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${fillPct}%`,
            background: colors.bar,
            borderRadius: overBudget ? "4px 0 0 4px" : 4,
            transition: "width 0.4s ease",
          }}
        />
        {/* Overflow */}
        {overBudget && (
          <div
            style={{
              position: "absolute",
              left: `${fillPct}%`,
              top: 0,
              height: "100%",
              width: `${overflowPct}%`,
              background: overflowColor,
              borderRadius: "0 4px 4px 0",
              transition: "width 0.4s ease",
            }}
          />
        )}
      </div>
      {/* Target marker (outside overflow:hidden container) */}
      <div style={{ position: "relative", height: 0 }}>
        <div
          style={{
            position: "absolute",
            left: `${targetMark}%`,
            top: -11,
            width: 2,
            height: 14,
            background: overBudget && !isPositiveBucket ? "#ff4d4f" : token.colorTextSecondary,
            borderRadius: 1,
            transform: "translateX(-1px)",
          }}
        />
      </div>

      {/* % labels */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 11, color: overBudget ? (isPositiveBucket ? "#1a7a0a" : "#ff4d4f") : underBudgetBad ? "#ff4d4f" : defaultColors.bar, fontWeight: 500 }}>
          {formatPercent(bucket.actualPct)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {overBudget && isPositiveBucket && (
            <span style={{ fontSize: 11, color: "#1a7a0a", fontWeight: 500 }}>
              +{r(bucket.actualAmount - bucket.targetAmount)} acima
            </span>
          )}
          {overBudget && !isPositiveBucket && (
            <span style={{ fontSize: 11, color: "#ff4d4f", fontWeight: 500 }}>
              +{r(bucket.actualAmount - bucket.targetAmount)} acima
            </span>
          )}
          {!overBudget && bucket.targetAmount > bucket.actualAmount && (
            <span style={{ fontSize: 11, color: isPositiveBucket ? "#ff4d4f" : "#52c41a", fontWeight: 500 }}>
              {r(bucket.targetAmount - bucket.actualAmount)} {isPositiveBucket ? "faltam" : "disponivel"}
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, color: "#8c8c8c" }}>
            meta
            {onTargetChange ? (
              <InputNumber
                size="small"
                min={0}
                max={100}
                value={pendingTargetPct ?? bucket.targetPct}
                onChange={(v) => onTargetChange(v ?? 0)}
                formatter={(v) => `${v}%`}
                parser={(v) => Number((v || "").replace("%", "")) as 0}
                style={{ width: 58, fontSize: 11 }}
                controls={false}
              />
            ) : (
              <span> {formatPercent(bucket.targetPct)}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Resultado Parcial (Visor style) ──────────────────────────── */
function PartialResultCard({ data, previousData }: { data: BudgetData; previousData: BudgetData | null }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);
  const summary = getBudgetSummary(data);
  const income = summary.total_income;
  const expenses = summary.total_expenses;
  const net = summary.net;
  const prevNet = previousData ? getBudgetSummary(previousData).net : null;
  const netVariation = prevNet != null && prevNet !== 0 ? ((net - prevNet) / Math.abs(prevNet)) * 100 : null;

  const barTotal = income + expenses;
  const incomePct = barTotal > 0 ? (income / barTotal) * 100 : 50;

  const STORAGE_KEY = "budget_bucket_pcts";
  const DEFAULT_PCTS: Record<string, number> = { custos_fixos: 30, conforto: 25, liberdade_financeira: 45 };

  const [customPcts, setCustomPcts] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return DEFAULT_PCTS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.custos_fixos + parsed.conforto + parsed.liberdade_financeira === 100) return parsed;
      }
    } catch {}
    return DEFAULT_PCTS;
  });

  const [pendingPcts, setPendingPcts] = useState<Record<string, number>>(customPcts);
  const pendingSum = pendingPcts.custos_fixos + pendingPcts.conforto + pendingPcts.liberdade_financeira;
  const pendingValid = pendingSum === 100;

  const handlePctInput = useCallback((key: string, value: number) => {
    setPendingPcts((prev) => {
      const next = { ...prev, [key]: value };
      const sum = next.custos_fixos + next.conforto + next.liberdade_financeira;
      if (sum === 100) {
        setCustomPcts(next);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }, []);

  const buckets = useMemo(() => {
    const raw = getBucketProgress(data);
    return raw.map((b) => {
      const targetPct = customPcts[b.key] ?? b.targetPct;
      const targetAmount = Math.round(income * targetPct) / 100;
      // For liberdade financeira, actual = net (income - expenses leftover)
      const actualAmount = b.key === "liberdade_financeira" ? Math.max(net, 0) : b.actualAmount;
      const actualPct = income > 0 ? Math.round((actualAmount / income) * 10000) / 100 : 0;
      return {
        ...b,
        targetPct,
        targetAmount,
        actualAmount,
        actualPct,
        delta: Math.round((actualPct - targetPct) * 100) / 100,
      };
    });
  }, [data, customPcts, income, net]);

  return (
    <VisorCard>
      <SectionHead title="Resultado Parcial" linkText="fluxo de caixa" href="/cashflow" />

      {/* Big value */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 300, color: token.colorText }}>
          {r(net)}
        </span>
      </div>

      {/* Variation badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        {netVariation != null && <PercentChange value={netVariation} />}
        {prevNet != null && (
          <span style={{ fontSize: 13, color: "#8c8c8c" }}>
            vs {r(prevNet!)} mes anterior
          </span>
        )}
      </div>

      {/* Income vs Expense bar */}
      <div
        style={{
          display: "flex",
          height: 10,
          borderRadius: 5,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        <div style={{ width: `${incomePct}%`, background: "#4096ff", transition: "width 0.3s" }} />
        <div style={{ flex: 1, background: "#1d3557", transition: "width 0.3s" }} />
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 32, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Receita</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{r(income)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Gasto</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{r(expenses)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Excluido</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{r(summary.investment)}</div>
        </div>
      </div>

      {/* Budget Buckets */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8c8c8c" }}>
              Buckets
            </span>
            {!pendingValid && (
              <span style={{ fontSize: 10, color: "#ff4d4f", fontWeight: 500 }}>
                soma {pendingSum}% (deve ser 100%)
              </span>
            )}
          </div>
          <span
            style={{ fontSize: 12, color: "#6366f1", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}
            onClick={() => {}}
          >
            Ver metas <ExternalLink size={12} />
          </span>
        </div>
        {buckets.map((b) => (
          <BucketRow
            key={b.key}
            bucket={b}
            pendingTargetPct={pendingPcts[b.key]}
            isPositiveBucket={b.key === "liberdade_financeira"}
            onTargetChange={(pct) => handlePctInput(b.key, pct)}
          />
        ))}
      </div>
    </VisorCard>
  );
}

type ProvFilter = "all" | "only" | "exclude";
type TxKey = string;

/* ── Category row inside a bucket (with subcategories) ────────── */
function CategoryRow({
  category, amount, previousAmount, variation, subcategories,
  forceExpand, checkedTxs, onToggleTx, onToggleGroup,
}: {
  category: string; amount: number;
  previousAmount: number | null; variation: number | null;
  subcategories: { name: string; total: number; prevTotal: number | null; variation: number | null; transactions: { description: string; date: string; amount: number; holder: string; provisional?: boolean; _key: string }[] }[];
  forceExpand: boolean | null;
  checkedTxs: Set<TxKey>;
  onToggleTx: (key: TxKey, amount: number) => void;
  onToggleGroup: (txs: { _key: string; amount: number }[]) => void;
}) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);
  const [localExpanded, setLocalExpanded] = useState(false);
  const [localExpandedSubs, setLocalExpandedSubs] = useState<Set<string>>(new Set());
  const { emoji } = getCategoryMeta(category);

  const expanded = forceExpand ?? localExpanded;
  const allTxs = useMemo(() => subcategories.flatMap((s) => s.transactions), [subcategories]);
  const allCatChecked = allTxs.length > 0 && allTxs.every((t) => checkedTxs.has(t._key));
  const someCatChecked = !allCatChecked && allTxs.some((t) => checkedTxs.has(t._key));

  const toggleSub = (name: string) => {
    setLocalExpandedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  return (
    <div>
      {/* Category header */}
      <div
        onClick={() => setLocalExpanded(!localExpanded)}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 100px 90px 90px 32px",
          gap: 12,
          alignItems: "center",
          padding: "9px 0 9px 20px",
          cursor: "pointer",
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#8c8c8c", transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "rotate(0)" }}>&#9654;</span>
          <span style={{ fontSize: 14 }}>{emoji}</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{category}</span>
          <span style={{ fontSize: 11, color: "#bfbfbf" }}>({subcategories.length})</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>{r(amount)}</span>
        <div style={{ textAlign: "center" }}>
          {variation != null ? <PercentChange value={variation} invert size="small" /> : <span style={{ fontSize: 12, color: "#bfbfbf" }}>--</span>}
        </div>
        <span style={{ fontSize: 12, color: "#8c8c8c", textAlign: "right" }}>
          {previousAmount != null ? r(previousAmount) : "--"}
        </span>
        <Checkbox
          checked={allCatChecked}
          indeterminate={someCatChecked}
          onChange={() => onToggleGroup(allTxs)}
          onClick={(e) => e.stopPropagation()}
          style={{ justifySelf: "center" }}
        />
      </div>

      {/* Expanded subcategories */}
      {expanded && subcategories.map((sub) => {
        const subExpanded = forceExpand === true || localExpandedSubs.has(sub.name);
        const allSubChecked = sub.transactions.length > 0 && sub.transactions.every((t) => checkedTxs.has(t._key));
        const someSubChecked = !allSubChecked && sub.transactions.some((t) => checkedTxs.has(t._key));
        return (
          <div key={sub.name}>
            {/* Subcategory header */}
            <div
              onClick={() => toggleSub(sub.name)}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 90px 90px 32px",
                gap: 12,
                alignItems: "center",
                padding: "7px 0 7px 44px",
                cursor: "pointer",
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillQuaternary,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: "#bfbfbf", transition: "transform 0.2s", transform: subExpanded ? "rotate(90deg)" : "rotate(0)" }}>&#9654;</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{sub.name}</span>
                <span style={{ fontSize: 10, color: "#bfbfbf" }}>({sub.transactions.length})</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right" }}>{r(sub.total)}</span>
              <div style={{ textAlign: "center" }}>
                {sub.variation != null ? <PercentChange value={sub.variation} invert size="small" /> : <span style={{ fontSize: 12, color: "#bfbfbf" }}>--</span>}
              </div>
              <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>
                {sub.prevTotal != null ? r(sub.prevTotal) : "--"}
              </span>
              <Checkbox
                checked={allSubChecked}
                indeterminate={someSubChecked}
                onChange={() => onToggleGroup(sub.transactions)}
                onClick={(e) => e.stopPropagation()}
                style={{ justifySelf: "center" }}
              />
            </div>

            {/* Transactions inside subcategory */}
            {subExpanded && sub.transactions.length > 0 && (
              <div>
                {[...sub.transactions]
                  .sort((a, b) => b.amount - a.amount)
                  .map((tx) => (
                  <div
                    key={tx._key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 100px 90px 90px 32px",
                      gap: 12,
                      alignItems: "center",
                      padding: "5px 0 5px 64px",
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      background: checkedTxs.has(tx._key) ? "rgba(99,102,241,0.06)" : token.colorFillQuaternary,
                    }}
                  >
                    <span style={{ fontSize: 12, color: token.colorTextSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                      {tx.description}
                      {tx.provisional && (
                        <span style={{ fontSize: 9, background: "rgba(114,46,209,0.1)", color: "#722ed1", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>
                          Provisionado
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, textAlign: "right" }}>{r(tx.amount)}</span>
                    <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "center" }}>
                      {tx.holder}
                    </span>
                    <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>
                      {tx.date ? `${tx.date.split("-")[2]}/${tx.date.split("-")[1]}` : "--"}
                    </span>
                    <Checkbox
                      checked={checkedTxs.has(tx._key)}
                      onChange={() => onToggleTx(tx._key, tx.amount)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ justifySelf: "center" }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Categorias (tree: Bucket > Category > Transactions) ──────── */
function CategoriesCard({ data, previousData }: { data: BudgetData; previousData: BudgetData | null }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<string>>(new Set());
  const [provFilter, setProvFilter] = useState<ProvFilter>("all");
  const [forceExpand, setForceExpand] = useState<boolean | null>(null);
  const [checkedTxs, setCheckedTxs] = useState<Set<TxKey>>(new Set());
  const [checkedTotal, setCheckedTotal] = useState(0);

  const toggleBucket = (key: string) => {
    setCollapsedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleToggleTx = useCallback((key: TxKey, amount: number) => {
    setCheckedTxs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setCheckedTotal((t) => Math.round((t - amount) * 100) / 100);
      } else {
        next.add(key);
        setCheckedTotal((t) => Math.round((t + amount) * 100) / 100);
      }
      return next;
    });
  }, []);

  const handleToggleGroup = useCallback((txs: { _key: string; amount: number }[]) => {
    setCheckedTxs((prev) => {
      const next = new Set(prev);
      const allChecked = txs.every((t) => prev.has(t._key));
      if (allChecked) {
        for (const t of txs) next.delete(t._key);
        setCheckedTotal((tot) => Math.round((tot - txs.reduce((s, t) => s + t.amount, 0)) * 100) / 100);
      } else {
        const toAdd = txs.filter((t) => !prev.has(t._key));
        for (const t of toAdd) next.add(t._key);
        setCheckedTotal((tot) => Math.round((tot + toAdd.reduce((s, t) => s + t.amount, 0)) * 100) / 100);
      }
      return next;
    });
  }, []);

  const clearChecked = useCallback(() => {
    setCheckedTxs(new Set());
    setCheckedTotal(0);
  }, []);

  const prevCatMap = useMemo(() => {
    if (!previousData) return null;
    return Object.fromEntries(
      Object.entries(previousData.expenses.by_category).map(([k, v]) => [k, v.total])
    );
  }, [previousData]);

  const prevSubMap = useMemo(() => {
    if (!previousData) return null;
    const map: Record<string, Record<string, number>> = {};
    for (const [catName, cat] of Object.entries(previousData.expenses.by_category)) {
      map[catName] = {};
      for (const [subName, sub] of Object.entries(cat.subcategories)) {
        map[catName][subName] = sub.total;
      }
    }
    return map;
  }, [previousData]);

  const bucketDefs = useMemo(() => {
    const rawBuckets = getBudgetBuckets(data);
    const cats = data.expenses?.by_category ?? {};
    const custos = rawBuckets.custos_fixos;
    const conforto = rawBuckets.conforto;
    const liberdade = rawBuckets.liberdade_financeira;

    const allBucketCats = new Set([
      ...(custos.categories ?? []),
      ...(conforto.categories ?? []),
      ...(liberdade.categories ?? []),
    ]);

    const makeBucket = (name: string, key: string, bd: { categories: string[] }, color: string) => {
      const catEntries = (bd.categories ?? [])
        .filter((c) => cats[c])
        .map((c) => ({ name: c, data: cats[c] }))
        .sort((a, b) => b.data.total - a.data.total);
      const total = catEntries.reduce((s, c) => s + c.data.total, 0);
      return { name, key, color, total, categories: catEntries };
    };

    const buckets = [
      makeBucket("Custos Fixos", "custos_fixos", custos, "#4096ff"),
      makeBucket("Conforto", "conforto", conforto, "#fa8c16"),
      makeBucket("Liberdade Financeira", "liberdade_financeira", liberdade, "#52c41a"),
    ];

    // Categories not in any bucket go into Conforto (catch-all)
    const otherCats = Object.entries(cats)
      .filter(([c]) => !allBucketCats.has(c))
      .map(([c, d]) => ({ name: c, data: d }));
    if (otherCats.length > 0) {
      const confortoBucket = buckets.find((b) => b.key === "conforto");
      if (confortoBucket) {
        confortoBucket.categories.push(...otherCats.sort((a, b) => b.data.total - a.data.total));
        confortoBucket.total += otherCats.reduce((s, c) => s + c.data.total, 0);
      }
    }

    return buckets;
  }, [data]);


  // Filter transactions by provisional status and add _key
  const filterTxs = useCallback((transactions: any[]) => {
    let txs = transactions;
    if (provFilter === "only") txs = txs.filter((t: any) => t.provisional);
    else if (provFilter === "exclude") txs = txs.filter((t: any) => !t.provisional);
    return txs;
  }, [provFilter]);

  return (
    <VisorCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionHead title="Categorias" />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Segmented
            size="small"
            value={provFilter}
            onChange={(v) => setProvFilter(v as ProvFilter)}
            options={[
              { label: "Todos", value: "all" },
              { label: "Provisionados", value: "only" },
              { label: "Realizados", value: "exclude" },
            ]}
          />
          <div
            onClick={() => setForceExpand(forceExpand === true ? false : true)}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", color: "#8c8c8c" }}
            title={forceExpand === true ? "Recolher tudo" : "Expandir tudo"}
          >
            {forceExpand === true ? <ChevronsUp size={16} /> : <ChevronsDown size={16} />}
          </div>
        </div>
      </div>

      {/* Accumulator bar */}
      {checkedTxs.size > 0 && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "8px 12px", marginBottom: 8, borderRadius: 8,
          background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
        }}>
          <span style={{ fontSize: 13, color: "#6366f1", fontWeight: 500 }}>
            {checkedTxs.size} selecionados
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#6366f1" }}>
              {r(checkedTotal)}
            </span>
            <span
              onClick={clearChecked}
              style={{ fontSize: 12, color: "#8c8c8c", cursor: "pointer", textDecoration: "underline" }}
            >
              limpar
            </span>
          </div>
        </div>
      )}

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 100px 90px 90px 32px",
          gap: 12,
          padding: "0 0 8px 0",
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          marginBottom: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#8c8c8c" }}>Categoria</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>Atual</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "center" }}>Variacao</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>Anterior</span>
        <span />
      </div>

      {bucketDefs.map((bucket) => {
        const isCollapsed = collapsedBuckets.has(bucket.key);
        // Collect all filtered txs for this bucket (for checkbox)
        const bucketAllTxs: { _key: string; amount: number }[] = [];
        for (const cat of bucket.categories) {
          for (const [subName, sub] of Object.entries(cat.data.subcategories)) {
            const fTxs = filterTxs(sub.transactions);
            fTxs.forEach((tx: any, i: number) => {
              bucketAllTxs.push({ _key: `${cat.name}|${subName}|${i}|${tx.description}`, amount: tx.amount });
            });
          }
        }
        const allBucketChecked = bucketAllTxs.length > 0 && bucketAllTxs.every((t) => checkedTxs.has(t._key));
        const someBucketChecked = !allBucketChecked && bucketAllTxs.some((t) => checkedTxs.has(t._key));

        return (
          <div key={bucket.key}>
            {/* Bucket header row */}
            <div
              onClick={() => toggleBucket(bucket.key)}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 90px 90px 32px",
                gap: 12,
                alignItems: "center",
                padding: "12px 0",
                cursor: "pointer",
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: bucket.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "#8c8c8c", transition: "transform 0.2s", transform: isCollapsed ? "rotate(0)" : "rotate(90deg)" }}>&#9654;</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{bucket.name}</span>
                <span style={{ fontSize: 11, color: "#8c8c8c" }}>({bucket.categories.length})</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, textAlign: "right" }}>{r(bucket.total)}</span>
              <span />
              <span />
              <Checkbox
                checked={allBucketChecked}
                indeterminate={someBucketChecked}
                onChange={() => handleToggleGroup(bucketAllTxs)}
                onClick={(e) => e.stopPropagation()}
                style={{ justifySelf: "center" }}
              />
            </div>

            {/* Category rows inside bucket */}
            {!isCollapsed && bucket.categories.map((cat) => {
              const prevAmount = prevCatMap ? prevCatMap[cat.name] ?? null : null;
              const variation = prevAmount != null && prevAmount > 0
                ? ((cat.data.total - prevAmount) / prevAmount) * 100
                : null;
              const prevSubs = prevSubMap?.[cat.name] ?? null;
              const subs = Object.entries(cat.data.subcategories)
                .map(([name, sub]) => {
                  const pt = prevSubs ? prevSubs[name] ?? null : null;
                  const v = pt != null && pt > 0 ? ((sub.total - pt) / pt) * 100 : null;
                  const txsWithKey = filterTxs(sub.transactions).map((tx: any, i: number) => ({
                    ...tx,
                    _key: `${cat.name}|${name}|${i}|${tx.description}`,
                  }));
                  const filteredTotal = txsWithKey.reduce((s: number, t: any) => s + t.amount, 0);
                  return { name, total: Math.round(filteredTotal * 100) / 100, prevTotal: pt, variation: v, transactions: txsWithKey };
                })
                .filter((s) => s.transactions.length > 0)
                .sort((a, b) => b.total - a.total);
              const filteredCatTotal = subs.reduce((s, sub) => s + sub.total, 0);
              return (
                <CategoryRow
                  key={cat.name}
                  category={cat.name}
                  amount={Math.round(filteredCatTotal * 100) / 100}
                  previousAmount={prevAmount}
                  variation={variation}
                  subcategories={subs}
                  forceExpand={forceExpand}
                  checkedTxs={checkedTxs}
                  onToggleTx={handleToggleTx}
                  onToggleGroup={handleToggleGroup}
                />
              );
            })}
          </div>
        );
      })}
    </VisorCard>
  );
}

/* ── Nubank logo (inline SVG) ─────────────────────────────────── */
function NuLogo({ size = 40 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: "#820ad1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <path d="M5 19V9.5C5 7.01 7.01 5 9.5 5H11L19 13V19H17V14L10 7H9.5C8.12 7 7 8.12 7 9.5V19H5Z" fill="white" />
      </svg>
    </div>
  );
}

/* ── Visao de Contas (Visor style) ────────────────────────────── */
function AccountBillsCard({ data }: { data: BudgetData }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);

  const accountStats = useMemo(() => {
    type AccStat = {
      holder: string; bank: string; accountNumber: string; accountType: "cc" | "savings" | "provisioned";
      total: number; count: number;
    };
    const map: Record<string, AccStat> = {};
    const cats = data.expenses?.by_category ?? {};

    for (const [, cat] of Object.entries(cats)) {
      for (const [, sub] of Object.entries(cat.subcategories)) {
        for (const tx of sub.transactions) {
          const accNum = tx.account_number || "provisioned";
          const holder = tx.holder || "unknown";
          const key = `${holder}|${accNum}`;
          if (!map[key]) {
            const isCC = accNum !== "provisioned" && accNum.length <= 6;
            map[key] = {
              holder, bank: tx.bank || "Nubank", accountNumber: accNum,
              accountType: accNum === "provisioned" ? "provisioned" : isCC ? "cc" : "savings",
              total: 0, count: 0,
            };
          }
          map[key].total += tx.amount;
          map[key].count++;
        }
      }
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [data]);

  const grandTotal = useMemo(() => accountStats.reduce((s, a) => s + a.total, 0), [accountStats]);
  const grandCount = useMemo(() => accountStats.reduce((s, a) => s + a.count, 0), [accountStats]);
  const realAccounts = useMemo(() => accountStats.filter(a => a.accountType !== "provisioned"), [accountStats]);
  const provAccounts = useMemo(() => accountStats.filter(a => a.accountType === "provisioned"), [accountStats]);

  const getAccountLabel = (a: typeof accountStats[0]) => {
    if (a.accountType === "cc") return "Fatura atual";
    if (a.accountType === "savings") return "Conta corrente";
    return "Provisionado";
  };

  return (
    <VisorCard>
      <SectionHead title="Visao de Contas" linkText="Ver todas" href="/transactions" />

      {/* Big total */}
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 32, fontWeight: 300, color: token.colorText }}>
          {r(grandTotal)}
        </span>
        <span style={{ fontSize: 14, color: "#8c8c8c", marginLeft: 8 }}>
          {grandCount} transacoes
        </span>
      </div>

      {/* Account rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 16 }}>
        {realAccounts.map((acc) => (
          <div
            key={`${acc.holder}|${acc.accountNumber}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 0",
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            {/* Left: logo + info */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <NuLogo size={40} />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>
                    {acc.holder}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                    background: acc.accountType === "cc" ? "rgba(82,196,26,0.1)" : "rgba(64,150,255,0.1)",
                    color: acc.accountType === "cc" ? "#52c41a" : "#4096ff",
                  }}>
                    {acc.accountType === "cc" ? "Ciclo atual" : "Conta"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 2 }}>
                  {getAccountLabel(acc)} · {acc.accountNumber}
                </div>
              </div>
            </div>

            {/* Right: amount + count */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{r(acc.total)}</div>
              <div style={{ fontSize: 11, color: "#8c8c8c", marginTop: 2 }}>
                {acc.count} transacoes
              </div>
            </div>
          </div>
        ))}

        {/* Provisioned */}
        {provAccounts.map((acc) => (
          <div
            key={`${acc.holder}|${acc.accountNumber}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 0",
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              opacity: 0.6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 20,
                background: "rgba(114,46,209,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ fontSize: 18 }}>&#10024;</span>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>
                    {acc.holder}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                    background: "rgba(114,46,209,0.1)", color: "#722ed1",
                  }}>
                    Provisionado
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 2 }}>
                  Previsto ate o fim do mes
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{r(acc.total)}</div>
              <div style={{ fontSize: 11, color: "#8c8c8c", marginTop: 2 }}>
                {acc.count} itens
              </div>
            </div>
          </div>
        ))}
      </div>
    </VisorCard>
  );
}

/* ── Top 10 Categorias ───────────────────────────────────────── */
type TopCatView = "top10" | "highest" | "lowest";

function TopCategoriesCard({ data, previousData }: { data: BudgetData; previousData: BudgetData | null }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);
  const [checkedCats, setCheckedCats] = useState<Set<string>>(new Set());
  const [checkedTotal, setCheckedTotal] = useState(0);
  const [viewMode, setViewMode] = useState<TopCatView>("top10");

  const handleToggleCat = useCallback((name: string, amount: number) => {
    setCheckedCats(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        setCheckedTotal(t => Math.round((t - amount) * 100) / 100);
      } else {
        next.add(name);
        setCheckedTotal(t => Math.round((t + amount) * 100) / 100);
      }
      return next;
    });
  }, []);

  const clearChecked = useCallback(() => {
    setCheckedCats(new Set());
    setCheckedTotal(0);
  }, []);

  const allCategories = useMemo(() => {
    const cats = data.expenses?.by_category ?? {};
    return Object.entries(cats).map(([name, cat]) => ({ name, total: cat.total }));
  }, [data]);

  const categories = useMemo(() => {
    if (viewMode === "top10") {
      return [...allCategories].sort((a, b) => b.total - a.total).slice(0, 10);
    }
    // Need previous data for variation sorts
    const prevMap = previousData
      ? Object.fromEntries(Object.entries(previousData.expenses.by_category).map(([k, v]) => [k, v.total]))
      : null;
    const withVariation = allCategories.map(c => {
      const prev = prevMap?.[c.name] ?? null;
      const variation = prev != null && prev > 0 ? ((c.total - prev) / prev) * 100 : null;
      return { ...c, variation };
    }).filter(c => c.variation != null);

    if (viewMode === "highest") {
      return withVariation.filter(c => c.variation! > 0).sort((a, b) => (b.variation ?? 0) - (a.variation ?? 0)).slice(0, 10);
    }
    return withVariation.filter(c => c.variation! < 0).sort((a, b) => (a.variation ?? 0) - (b.variation ?? 0)).slice(0, 10);
  }, [allCategories, previousData, viewMode]);

  const prevCatMap = useMemo(() => {
    if (!previousData) return null;
    return Object.fromEntries(
      Object.entries(previousData.expenses.by_category).map(([k, v]) => [k, v.total])
    );
  }, [previousData]);

  const maxTotal = useMemo(() => {
    if (categories.length === 0) return 1;
    const maxCurrent = categories[0]?.total ?? 0;
    const maxPrev = prevCatMap ? Math.max(...categories.map(c => prevCatMap[c.name] ?? 0)) : 0;
    return Math.max(maxCurrent, maxPrev, 1);
  }, [categories, prevCatMap]);

  const bucketForCategory = useMemo(() => {
    const buckets = getBudgetBuckets(data);
    const map: Record<string, string> = {};
    for (const cat of buckets.custos_fixos.categories) map[cat] = "custos_fixos";
    for (const cat of buckets.conforto.categories) map[cat] = "conforto";
    for (const cat of buckets.liberdade_financeira.categories) map[cat] = "liberdade_financeira";
    return map;
  }, [data]);

  const BUCKET_DOT_COLORS: Record<string, string> = {
    custos_fixos: "#4096ff",
    conforto: "#fa8c16",
    liberdade_financeira: "#52c41a",
  };

  return (
    <VisorCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionHead title="Principais Categorias" />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Segmented
            size="small"
            value={viewMode}
            onChange={(v) => { setViewMode(v as TopCatView); clearChecked(); }}
            options={[
              { label: "Top 10", value: "top10" },
              { label: "Maior alta", value: "highest" },
              { label: "Maior queda", value: "lowest" },
            ]}
          />
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "28px 200px 90px 1fr 80px 90px 32px",
        gap: 12, padding: "0 0 10px 0",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "center" }}>#</span>
        <span style={{ fontSize: 11, color: "#8c8c8c" }}>Categoria</span>
        <span style={{ fontSize: 11, color: "#8c8c8c" }}>Atual</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "center" }}>vs Mes Anterior</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "center" }}>Variacao</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>Anterior</span>
        <span />
      </div>

      {/* Accumulator bar */}
      {checkedCats.size > 0 && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "8px 12px", marginTop: 8, marginBottom: 4, borderRadius: 8,
          background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
        }}>
          <span style={{ fontSize: 13, color: "#6366f1", fontWeight: 500 }}>
            {checkedCats.size} selecionadas
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#6366f1" }}>
              {r(checkedTotal)}
            </span>
            <span
              onClick={clearChecked}
              style={{ fontSize: 12, color: "#8c8c8c", cursor: "pointer", textDecoration: "underline" }}
            >
              limpar
            </span>
          </div>
        </div>
      )}

      {categories.map((cat, idx) => {
        const { emoji } = getCategoryMeta(cat.name);
        const dotColor = BUCKET_DOT_COLORS[bucketForCategory[cat.name] || "conforto"] || "#fa8c16";
        const prevTotal = prevCatMap?.[cat.name] ?? null;
        const variation = prevTotal != null && prevTotal > 0
          ? ((cat.total - prevTotal) / prevTotal) * 100
          : null;
        const isUp = variation != null && variation > 0;
        const isDown = variation != null && variation < 0;
        const isNew = prevTotal == null || prevTotal === 0;

        // Bar widths relative to max
        const currentBarPct = (cat.total / maxTotal) * 100;
        const prevBarPct = prevTotal != null ? (prevTotal / maxTotal) * 100 : 0;

        // Bar color: red if over previous, green if under or new
        const barColor = isUp ? "#ff4d4f" : "#52c41a";

        return (
          <div
            key={cat.name}
            style={{
              display: "grid", gridTemplateColumns: "28px 200px 90px 1fr 80px 90px 32px",
              gap: 12, alignItems: "center",
              padding: "14px 0 14px 0",
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            {/* Number */}
            <span style={{ fontSize: 12, color: "#8c8c8c", textAlign: "center", fontWeight: 500 }}>{idx + 1}</span>
            {/* Dot + emoji + name + new tag */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
              <span style={{ fontSize: 15 }}>{emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{cat.name}</span>
              {isNew && (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                  background: "rgba(114,46,209,0.1)", color: "#722ed1",
                  display: "inline-flex", alignItems: "center", gap: 3,
                }}>
                  &#9733; Nova
                </span>
              )}
            </div>

            {/* Current amount */}
            <span style={{ fontSize: 13, fontWeight: 600 }}>{r(cat.total)}</span>

            {/* Comparison bar */}
            <div style={{ position: "relative", height: 10, borderRadius: 5, background: token.colorFillSecondary, overflow: "hidden" }}>
              {/* Previous month bar (gray background reference) */}
              {prevBarPct > 0 && (
                <div style={{
                  position: "absolute", left: 0, top: 0, height: "100%",
                  width: `${prevBarPct}%`, background: token.colorFillSecondary,
                  borderRadius: 5,
                }} />
              )}
              {/* Current bar */}
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${currentBarPct}%`, background: barColor,
                borderRadius: 5, transition: "width 0.4s ease",
              }} />
            </div>

            {/* Variation */}
            <div style={{ textAlign: "center" }}>
              {variation != null ? (
                <PercentChange value={variation} invert size="small" />
              ) : (
                <span style={{ fontSize: 11, color: "#bfbfbf" }}>--</span>
              )}
            </div>

            {/* Previous amount */}
            <span style={{ fontSize: 12, color: "#8c8c8c", textAlign: "right" }}>
              {prevTotal != null ? r(prevTotal) : "--"}
            </span>

            {/* Checkbox */}
            <Checkbox
              checked={checkedCats.has(cat.name)}
              onChange={() => handleToggleCat(cat.name, cat.total)}
              style={{ justifySelf: "center" }}
            />
          </div>
        );
      })}
    </VisorCard>
  );
}

/* ── Parcelas (tree view) ─────────────────────────────────────── */
type InstItem = { description: string; amount: number; installmentNumber: number; totalInstallments: number; holder: string; category: string; remaining: number };
type InstGroup = { key: string; label: string; color: string; dotColor: string; items: InstItem[]; total: number };

function InstallmentsCard({ data }: { data: BudgetData }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["ending", "near", "ongoing"]));
  const [forceExpand, setForceExpand] = useState<boolean | null>(false);

  const toggleGroup = (key: string) => {
    setForceExpand(null);
    setCollapsed(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };

  const installments = useMemo(() => {
    const all: InstItem[] = [];
    const cats = data.expenses?.by_category ?? {};
    for (const [catName, cat] of Object.entries(cats)) {
      for (const [, sub] of Object.entries(cat.subcategories)) {
        for (const tx of sub.transactions) {
          const t = tx as any;
          if (t.totalInstallments && t.totalInstallments >= 2) {
            all.push({
              description: t.description, amount: t.amount,
              installmentNumber: t.installmentNumber, totalInstallments: t.totalInstallments,
              holder: t.holder, category: catName,
              remaining: t.totalInstallments - t.installmentNumber,
            });
          }
        }
      }
    }
    return all.sort((a, b) => a.remaining - b.remaining);
  }, [data]);

  const groups: InstGroup[] = useMemo(() => {
    const ending = installments.filter(i => i.remaining === 0);
    const near = installments.filter(i => i.remaining > 0 && i.remaining <= 2);
    const ongoing = installments.filter(i => i.remaining > 2);
    return [
      { key: "ending", label: "Finalizam este mes", color: "#52c41a", dotColor: "#52c41a", items: ending, total: ending.reduce((s, i) => s + i.amount, 0) },
      { key: "near", label: "Quase finalizando", color: "#fa8c16", dotColor: "#fa8c16", items: near, total: near.reduce((s, i) => s + i.amount, 0) },
      { key: "ongoing", label: "Em andamento", color: "#4096ff", dotColor: "#4096ff", items: ongoing, total: ongoing.reduce((s, i) => s + i.amount, 0) },
    ].filter(g => g.items.length > 0);
  }, [installments]);

  const totalMonthly = useMemo(() => installments.reduce((s, i) => s + i.amount, 0), [installments]);
  const freedByMonth = useMemo(() => {
    const result: number[] = [];
    for (let m = 0; m <= 5; m++) {
      result.push(installments.filter(i => i.remaining <= m).reduce((s, i) => s + i.amount, 0));
    }
    return result;
  }, [installments]);

  if (installments.length === 0) return null;

  return (
    <VisorCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionHead title="Parcelas" />
        <div
          onClick={() => setForceExpand(forceExpand === true ? false : true)}
          style={{ cursor: "pointer", display: "flex", alignItems: "center", color: "#8c8c8c" }}
        >
          {forceExpand === true ? <ChevronsUp size={16} /> : <ChevronsDown size={16} />}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 32, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Custo mensal</div>
          <div style={{ fontSize: 20, fontWeight: 300 }}>{r(totalMonthly)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Parcelas ativas</div>
          <div style={{ fontSize: 20, fontWeight: 300 }}>{installments.length}</div>
        </div>
        {[
          { idx: 0, label: "Saem mes que vem", color: "#52c41a" },
          { idx: 1, label: "Saem em 2 meses", color: "#52c41a" },
          { idx: 2, label: "Saem em 3 meses", color: "#fa8c16" },
          { idx: 3, label: "Saem em 4 meses", color: "#fa8c16" },
          { idx: 4, label: "Saem em 5 meses", color: "#fa8c16" },
          { idx: 5, label: "Saem em 6 meses", color: "#fa8c16" },
        ].map(({ idx, label, color: c }) => {
          const val = freedByMonth[idx];
          const prev = idx > 0 ? freedByMonth[idx - 1] : 0;
          if (!val || val <= prev) return null;
          return (
            <div key={idx}>
              <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 300, color: c }}>{r(val)}</div>
            </div>
          );
        })}
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 90px 130px 80px",
        gap: 12, padding: "0 0 8px 0",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <span style={{ fontSize: 11, color: "#8c8c8c" }}>Descricao</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>Valor</span>
        <span style={{ fontSize: 11, color: "#8c8c8c" }}>Progresso</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>Status</span>
      </div>

      {/* Tree groups */}
      {groups.map(group => {
        const isExpanded = forceExpand === true ? true : forceExpand === false ? false : !collapsed.has(group.key);
        return (
          <div key={group.key}>
            {/* Group header */}
            <div
              onClick={() => toggleGroup(group.key)}
              style={{
                display: "grid", gridTemplateColumns: "1fr 90px 130px 80px",
                gap: 12, alignItems: "center", padding: "12px 0",
                cursor: "pointer", borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: group.dotColor, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "#8c8c8c", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }}>&#9654;</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: group.color }}>{group.label}</span>
                <span style={{ fontSize: 11, color: "#8c8c8c" }}>({group.items.length})</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, textAlign: "right" }}>{r(group.total)}</span>
              <span />
              <span />
            </div>

            {/* Items */}
            {isExpanded && group.items.map((item, idx) => {
              const pct = (item.installmentNumber / item.totalInstallments) * 100;
              const barColor = group.dotColor;
              const { emoji } = getCategoryMeta(item.category);
              return (
                <div
                  key={`${group.key}-${idx}`}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 90px 130px 80px",
                    gap: 12, alignItems: "center", padding: "9px 0 9px 28px",
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorFillQuaternary,
                  }}
                >
                  {/* Description */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                    <span style={{ fontSize: 14 }}>{emoji}</span>
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.description}
                      </div>
                      <div style={{ fontSize: 11, color: "#8c8c8c" }}>{item.holder}</div>
                    </div>
                  </div>

                  {/* Amount */}
                  <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right" }}>{r(item.amount)}</span>

                  {/* Progress bar */}
                  <div>
                    <div style={{ position: "relative", height: 6, borderRadius: 3, background: token.colorFillSecondary, overflow: "hidden", marginBottom: 3 }}>
                      <div style={{
                        position: "absolute", left: 0, top: 0, height: "100%",
                        width: `${pct}%`, background: barColor, borderRadius: 3, transition: "width 0.4s ease",
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: "#8c8c8c" }}>
                      {item.installmentNumber}/{item.totalInstallments}
                    </span>
                  </div>

                  {/* Remaining tag */}
                  <div style={{ textAlign: "right" }}>
                    {item.remaining === 0 ? (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "rgba(82,196,26,0.1)", color: "#52c41a" }}>
                        Ultima
                      </span>
                    ) : item.remaining <= 2 ? (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "rgba(250,140,22,0.1)", color: "#fa8c16" }}>
                        {item.remaining === 1 ? "Falta 1" : `Faltam ${item.remaining}`}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: "#8c8c8c" }}>
                        {item.remaining} restantes
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </VisorCard>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */
export default function OverviewPage() {
  const { data: activeData, allMonths, loading, refresh } = useBudget();
  const { redacted, toggle: toggleRedact } = useRedact();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const monthPills = useMemo(
    () => allMonths.map((m) => ({ month: m.month, net: getBudgetSummary(m).net })),
    [allMonths]
  );

  const data = useMemo(() => {
    if (selectedMonth) {
      return allMonths.find((m) => m.month === selectedMonth) || activeData;
    }
    return activeData;
  }, [selectedMonth, allMonths, activeData]);

  const previousData = useMemo(() => {
    if (!data) return null;
    const sorted = allMonths.filter((m) => m.month < data.month).sort((a, b) => b.month.localeCompare(a.month));
    return sorted[0] || null;
  }, [data, allMonths]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  if (loading && !activeData) return null;
  if (!data) return <EmptyState />;

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Title level={4} style={{ margin: 0, fontWeight: 400 }}>Visao Geral</Title>
          <RefreshCw
            size={16}
            color="#8c8c8c"
            style={{ cursor: "pointer", animation: refreshing ? "spin 1s linear infinite" : undefined }}
            onClick={handleRefresh}
          />
          {redacted ? (
            <EyeOff size={16} color="#8c8c8c" style={{ cursor: "pointer" }} onClick={toggleRedact} />
          ) : (
            <Eye size={16} color="#8c8c8c" style={{ cursor: "pointer" }} onClick={toggleRedact} />
          )}
        </div>
        <MonthSelector months={monthPills} selected={data.month} onSelect={setSelectedMonth} />
      </div>

      {/* Top row: Ritmo + Resultado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <SpendingPaceCard data={data} previousData={previousData} />
        <PartialResultCard data={data} previousData={previousData} />
      </div>

      {/* Row 2: Principais Categorias + Visao de Contas */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 16, marginTop: 16, alignItems: "stretch" }}>
        <TopCategoriesCard data={data} previousData={previousData} />
        <AccountBillsCard data={data} />
      </div>

      {/* Parcelas */}
      <div style={{ marginTop: 16 }}>
        <InstallmentsCard data={data} />
      </div>

      {/* Categorias */}
      <div style={{ marginTop: 16 }}>
        <CategoriesCard data={data} previousData={previousData} />
      </div>

      {/* Refresh modal */}
      <Modal
        open={refreshing}
        closable={false}
        footer={null}
        centered
        width={320}
        styles={{ body: { textAlign: "center", padding: "32px 24px" } }}
      >
        <RefreshCw size={28} color="#6366f1" style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>Recarregando arquivos...</div>
        <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4 }}>Lendo resources/*.json</div>
      </Modal>
    </div>
  );
}
