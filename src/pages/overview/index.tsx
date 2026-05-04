import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Typography, theme, Modal, Segmented, Checkbox, InputNumber } from "antd";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot, Label,
  LineChart, Line, Legend, CartesianGrid,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import { Info, ExternalLink, RefreshCw, ChevronsDown, ChevronsUp, Eye, EyeOff, List } from "lucide-react";
import { useRouter } from "next/router";
import { useBudget } from "@/hooks/useBudget";
import { flattenTransactions } from "@/context/BudgetContext";
import { MonthSelector } from "@/components/shared/MonthSelector";
import { PercentChange } from "@/components/shared/PercentChange";
import { EmptyState } from "@/components/shared/EmptyState";
import { TransactionsTable } from "@/components/shared/TransactionsTable";
import {
  TransactionsFilters,
  applyTransactionFilters,
  DEFAULT_FILTERS,
  type TransactionFilters,
} from "@/components/shared/TransactionsFilters";
import {
  getSpendingPace, getDailySpendingCurve, getCategoryComparison,
  getBucketProgress, getBudgetBuckets, getBudgetSummary, dayOfMonth,
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

/* ── Neutral percent tag (blue or gray) ───────────────────────── */
function NeutralPercentTag({ value, color = "blue" }: { value: number; color?: "blue" | "gray" }) {
  const isPositive = value >= 0;
  const formatted = formatPercent(value);
  const palette = color === "gray"
    ? { fg: "#8c8c8c", bg: "rgba(140,140,140,0.12)" }
    : { fg: "#4096ff", bg: "rgba(64,150,255,0.1)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 6px", borderRadius: 4,
      background: palette.bg, color: palette.fg,
      fontSize: 12, fontWeight: 500, lineHeight: 1,
    }}>
      {isPositive ? "+" : ""}{formatted}
    </span>
  );
}

/* ── Ritmo de Gastos (Visor style) ────────────────────────────── */
function SpendingPaceCard({ data, previousData, allMonths }: { data: BudgetData; previousData: BudgetData | null; allMonths: BudgetData[] }) {
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

  // Provisioned amount (expenses only, flagged as provisional)
  const provisionedAmount = useMemo(() => {
    let sum = 0;
    for (const cat of Object.values(data.expenses?.by_category ?? {})) {
      for (const sub of Object.values(cat.subcategories)) {
        for (const tx of sub.transactions) {
          if (tx.provisional) sum += tx.amount;
        }
      }
    }
    return Math.round(sum * 100) / 100;
  }, [data]);

  // Total available across buckets — same calculation as PartialResultCard's pill.
  const totalAvailable = useMemo(() => {
    const summary = getBudgetSummary(data);
    const income = summary.total_income;
    const net = summary.net;
    const STORAGE_KEY = "budget_bucket_pcts";
    let customPcts: Record<string, number> = { custos_fixos: 30, conforto: 25, liberdade_financeira: 45 };
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.custos_fixos + parsed.conforto + parsed.liberdade_financeira === 100) customPcts = parsed;
        }
      } catch {}
    }
    const raw = getBucketProgress(data);
    return raw.reduce((s, b) => {
      const targetPct = customPcts[b.key] ?? b.targetPct;
      const targetAmount = Math.round(income * targetPct) / 100;
      const actualAmount = b.key === "liberdade_financeira" ? Math.max(net, 0) : b.actualAmount;
      return s + Math.max(targetAmount - actualAmount, 0);
    }, 0);
  }, [data]);
  const allBucketsFull = totalAvailable <= 0.01;
  const heroColor = allBucketsFull ? "#ff4d4f" : "#52c41a";

  // Average of last 3 months curve
  const avg3Curve = useMemo(() => {
    const prior = allMonths
      .filter(m => m.month < data.month)
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 3);
    if (prior.length === 0) return null;
    const curves = prior.map(m => getDailySpendingCurve(m));
    const maxDays = Math.max(...curves.map(c => c.length));
    const avg: { day: number; cumulative: number }[] = [];
    for (let d = 0; d < maxDays; d++) {
      const vals = curves.map(c => c[d]?.cumulative ?? c[c.length - 1]?.cumulative ?? 0);
      avg.push({ day: d + 1, cumulative: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) });
    }
    return avg;
  }, [data, allMonths]);

  const chartData = useMemo(() => {
    return currentCurve.map((d, i) => ({
      day: d.day,
      current: d.cumulative,
      previous: previousCurve?.[i]?.cumulative ?? null,
      avg3: avg3Curve?.[i]?.cumulative ?? null,
    }));
  }, [currentCurve, previousCurve, avg3Curve]);

  // Find last day with spending data
  const lastDataDay = useMemo(() => {
    if (data.data_through) return dayOfMonth(data.data_through);
    return pace.daysElapsed;
  }, [data, pace]);

  const rawLastValue = chartData[lastDataDay - 1]?.current ?? 0;
  const lastCurrentValue = Math.round(rawLastValue * 100) / 100;
  const lastAvg3Value = avg3Curve?.[lastDataDay - 1]?.cumulative ?? null;
  const lastPreviousValue = previousCurve?.[lastDataDay - 1]?.cumulative ?? null;
  const diff = lastAvg3Value != null ? lastCurrentValue - lastAvg3Value : null;
  const diffPrev = lastPreviousValue != null ? lastCurrentValue - lastPreviousValue : null;
  const diffLabel = diff != null
    ? (diff >= 0 ? `${rCompact(diff)} acima` : `${rCompact(Math.abs(diff))} abaixo`)
    : null;

  // Current line color: green if below avg3, red if above
  const currentColor = diff != null && diff <= 0 ? "#52c41a" : "#ff4d4f";

  // Stop the current-month line at lastDataDay (today). Days beyond have no data yet.
  const fullChartData = useMemo(() => {
    return chartData.map((d) => ({
      ...d,
      current: d.day <= lastDataDay ? d.current : null,
    }));
  }, [chartData, lastDataDay]);

  // Measure chart container width to clamp the endpoint pill inside the plot area.
  const chartWrapperRef = useRef<HTMLDivElement | null>(null);
  const [chartContainerWidth, setChartContainerWidth] = useState(0);
  useEffect(() => {
    if (!chartWrapperRef.current) return;
    const el = chartWrapperRef.current;
    const update = () => setChartContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <VisorCard>
      <SectionHead title="Ritmo de Gastos" linkText="Ver todas" href="/transactions" />

      {/* Hero: total available across buckets (mirrors Resultado Parcial pill) */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 32, fontWeight: 300, color: heroColor, lineHeight: 1 }}>
            {allBucketsFull ? r(0) : r(totalAvailable)}
          </span>
          <span style={{ fontSize: 15, color: "#8c8c8c" }}>
            {allBucketsFull ? "buckets esgotados" : "disponivel nos buckets"}
          </span>
        </div>
        {diff != null && (
          <div style={{ fontSize: 13, color: "#8c8c8c", marginTop: 4 }}>
            <span style={{ color: token.colorText, fontWeight: 500 }}>{r(Math.abs(diff))}</span>
            {" "}a {diff >= 0 ? "mais" : "menos"} este mes
          </div>
        )}
        {provisionedAmount > 0 && (
          <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            nao inclui
            <span style={{
              fontSize: 12, color: "#722ed1", fontWeight: 600,
              background: "rgba(114,46,209,0.1)", padding: "2px 8px", borderRadius: 4,
            }}>
              {r(provisionedAmount)} provisionado
            </span>
          </div>
        )}
      </div>

      {/* Comparison badges (blue) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        {lastPreviousValue != null && diffPrev != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NeutralPercentTag value={lastPreviousValue > 0 ? (diffPrev / lastPreviousValue) * 100 : 0} color="gray" />
            <span style={{ fontSize: 13, color: "#8c8c8c" }}>
              vs {r(lastPreviousValue)} mes passado
            </span>
          </div>
        )}
        {lastAvg3Value != null && diff != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NeutralPercentTag value={lastAvg3Value > 0 ? (diff / lastAvg3Value) * 100 : 0} />
            <span style={{ fontSize: 13, color: "#8c8c8c" }}>
              vs {r(lastAvg3Value)} media 3 meses
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div ref={chartWrapperRef} style={{ width: "100%" }}>
      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={fullChartData} margin={{ left: 10, right: 20, top: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="paceGradCurrent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={currentColor} stopOpacity={0.15} />
              <stop offset="100%" stopColor={currentColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#e8e8e8" }}
            tick={{ fill: "#8c8c8c" }}
            interval={3}
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
              const label = name === "current" ? "Este mes" : name === "previous" ? "Mes passado" : "Media 3 meses";
              return [r(v), label];
            }}
            labelFormatter={(l) => {
              const day = Number(l);
              if (!data.month || !Number.isFinite(day)) return `Dia ${l}`;
              const [yy, mm] = data.month.split("-").map(Number);
              const dt = new Date(Date.UTC(yy, (mm ?? 1) - 1, day));
              const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
              const dow = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][dt.getUTCDay()];
              return `Dia ${day} · ${dow}, ${day} de ${meses[(mm ?? 1) - 1]} ${yy}`;
            }}
            contentStyle={{
              background: "#fff",
              border: "none",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              fontSize: 13,
            }}
            labelStyle={{ color: "#1f1f1f", fontWeight: 600, marginBottom: 4 }}
          />

          {/* Average 3 months - dashed blue */}
          {avg3Curve && (
            <Area
              type="monotone"
              dataKey="avg3"
              stroke="#4096ff"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              fill="none"
              dot={false}
              connectNulls={false}
            />
          )}

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

          {/* Current month - solid line with gradient fill */}
          <Area
            type="monotone"
            dataKey="current"
            stroke={currentColor}
            strokeWidth={2.5}
            fill="url(#paceGradCurrent)"
            dot={false}
            connectNulls={false}
          />


          {/* Endpoint dot with multi-line label */}
          <ReferenceDot
            x={lastDataDay}
            y={lastCurrentValue}
            r={5}
            fill={currentColor}
            stroke="#fff"
            strokeWidth={2}
          >
            <Label
              position="top"
              offset={14}
              content={(props: unknown) => {
                const p = props as {
                  viewBox?: { x?: number; y?: number; width?: number; height?: number };
                  offset?: number;
                };
                const vb = p.viewBox ?? {};
                const dotX = (vb.x ?? 0) + (vb.width ?? 0) / 2;
                const dotTopY = vb.y ?? 0;
                const text = diff != null
                  ? `${r(Math.abs(diff))} a ${diff >= 0 ? "mais" : "menos"} este mes`
                  : r(lastCurrentValue);
                const padX = 10;
                const approxCharW = 6.2;
                const w = text.length * approxCharW + padX * 2;
                const h = 24;
                const rx = 12;
                const tipX = dotX;
                const dotTop = dotTopY;
                const dotBottom = dotTopY + 10; // dot has r=5
                const gap = 8;
                const chartTop = 10; // AreaChart margin.top
                // Default: pill above the dot. If it would overflow the chart top, flip below.
                let yBox = dotTop - gap - h;
                let placeAbove = true;
                if (yBox < chartTop + 2) {
                  placeAbove = false;
                  yBox = dotBottom + gap;
                }
                const tipY = placeAbove ? dotTop : dotBottom;
                const pillBottom = placeAbove ? yBox + h : yBox; // edge of pill that the triangle base sits on
                // Pill ABOVE the dot. Triangle anchored at the dot pointing down.
                // Pill is indented LEFT or RIGHT depending on which half the dot is in:
                //   dot in RIGHT half → pill extends LEFT (triangle near pill's right edge)
                //   dot in LEFT  half → pill extends RIGHT (triangle near pill's left edge)
                const baseHalf = 7;
                const triPadRight = 6; // pill extends LEFT of dot — pad between triangle right and pill right
                const triPadLeft  = 6; // mirror of triPadRight — pill's left edge sits 6px past the triangle base so the rounded corner fully covers it
                const chartLeft = 65 + 10;
                const chartRight = (chartContainerWidth || 9999) - 6;
                const chartCenter = (chartLeft + chartRight) / 2;
                const xLeft  = tipX + baseHalf + triPadRight - w; // pill right edge ≈ triangle right + pad
                const xRight = tipX - baseHalf - triPadLeft;      // pill left  edge ≈ triangle left  - pad (tight)
                const fitsLeft  = xLeft  >= chartLeft + 2 && xLeft  + w <= chartRight - 2;
                const fitsRight = xRight >= chartLeft + 2 && xRight + w <= chartRight - 2;
                const preferLeft = tipX >= chartCenter;
                // Hard requirement: triangle base [tipX-baseHalf, tipX+baseHalf] must sit inside the pill.
                const triMinX = tipX + baseHalf - w; // pill x lower bound to contain triangle
                const triMaxX = tipX - baseHalf;     // pill x upper bound to contain triangle
                let x: number;
                if (preferLeft && fitsLeft) x = xLeft;
                else if (!preferLeft && fitsRight) x = xRight;
                else if (fitsLeft) x = xLeft;
                else if (fitsRight) x = xRight;
                else {
                  // Neither indented side fits the chart. Allow chart overflow so the
                  // triangle base stays fully inside the pill — visual coherence wins.
                  const desired = preferLeft ? xLeft : xRight;
                  x = Math.max(triMinX, Math.min(desired, triMaxX));
                }
                return (
                  <g>
                    <rect x={x} y={yBox} width={w} height={h} rx={rx} ry={rx}
                      fill={currentColor} />
                    <polygon
                      points={`${tipX - baseHalf},${pillBottom + (placeAbove ? -0.5 : 0.5)} ${tipX + baseHalf},${pillBottom + (placeAbove ? -0.5 : 0.5)} ${tipX},${tipY}`}
                      fill={currentColor}
                    />
                    <text x={x + w / 2} y={yBox + h / 2 + 4} textAnchor="middle"
                      style={{ fontSize: 11, fontWeight: 600, fill: "#fff" }}>
                      {text}
                    </text>
                  </g>
                );
              }}
            />
          </ReferenceDot>
        </AreaChart>
      </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginTop: 12, paddingLeft: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 2, background: currentColor, borderRadius: 1 }} />
          <span style={{ fontSize: 12, color: "#8c8c8c" }}>Este mes</span>
        </div>
        {avg3Curve && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 0, borderTop: "2px dashed #4096ff" }} />
            <span style={{ fontSize: 12, color: "#8c8c8c" }}>Media 3 meses</span>
          </div>
        )}
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

function BucketRow({ bucket, provisioned = 0, pendingTargetPct, isPositiveBucket, onTargetChange, onDrilldown }: {
  bucket: ReturnType<typeof getBucketProgress>[0];
  provisioned?: number;
  pendingTargetPct?: number;
  isPositiveBucket?: boolean;
  onTargetChange?: (pct: number) => void;
  onDrilldown?: () => void;
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
  // Provisioned as a fraction of actualAmount, projected into the bar's scaled space
  const provFraction = bucket.actualAmount > 0 ? Math.min(provisioned / bucket.actualAmount, 1) : 0;
  const actualBarPct = fillPct + overflowPct;
  const provBarPct = actualBarPct * provFraction;
  const realAmount = Math.max(bucket.actualAmount - provisioned, 0);

  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
      {/* Name + values */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{bucket.name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{r(realAmount)}</span>
          {provisioned > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600, lineHeight: 1.4,
              color: "#722ed1",
              background: "rgba(114,46,209,0.12)",
              border: "1px solid rgba(114,46,209,0.3)",
              borderRadius: 4,
              padding: "1px 6px",
            }}>
              +{r(provisioned)} prov.
            </span>
          )}
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
              transition: "width 0.4s ease",
            }}
          />
        )}
        {/* Provisioned segment in purple at the LEFT, on top of everything */}
        {provBarPct > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${provBarPct}%`,
              background: "#722ed1",
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
          {onDrilldown && (
            <span
              onClick={onDrilldown}
              title="Ver transacoes"
              style={{
                cursor: "pointer", color: "#8c8c8c",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: 4,
              }}
            >
              <List size={14} />
            </span>
          )}
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
  const prevSummary = previousData ? getBudgetSummary(previousData) : null;
  const prevExpenses = prevSummary ? prevSummary.total_expenses : null;
  const expensesVariation = prevExpenses != null && prevExpenses !== 0 ? ((expenses - prevExpenses) / Math.abs(prevExpenses)) * 100 : null;

  // Provisioned amount per category (sum of transactions flagged as provisional)
  const provisionedByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [name, cat] of Object.entries(data.expenses?.by_category ?? {})) {
      let sum = 0;
      for (const sub of Object.values(cat.subcategories)) {
        for (const tx of sub.transactions) {
          if ((tx as { provisional?: boolean }).provisional) sum += tx.amount;
        }
      }
      if (sum > 0) map[name] = Math.round(sum * 100) / 100;
    }
    return map;
  }, [data]);
  const provisionedTotal = useMemo(
    () => Math.round(Object.values(provisionedByCat).reduce((s, v) => s + v, 0) * 100) / 100,
    [provisionedByCat]
  );
  const realExpenses = Math.max(expenses - provisionedTotal, 0);

  const barTotal = income + expenses;
  const incomePct = barTotal > 0 ? (income / barTotal) * 100 : 50;
  const realExpensePct = barTotal > 0 ? (realExpenses / barTotal) * 100 : 0;
  const provPct = barTotal > 0 ? (provisionedTotal / barTotal) * 100 : 0;

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
      // Sum provisioned across the categories that belong to this bucket
      const provisioned = b.key === "liberdade_financeira"
        ? 0
        : Math.round(b.categories.reduce((s, c) => s + (provisionedByCat[c] ?? 0), 0) * 100) / 100;
      return {
        ...b,
        targetPct,
        targetAmount,
        actualAmount,
        actualPct,
        delta: Math.round((actualPct - targetPct) * 100) / 100,
        provisioned,
      };
    });
  }, [data, customPcts, income, net, provisionedByCat]);

  // Total still available across all buckets (sum of remaining target - actual, only positives).
  const totalAvailable = buckets.reduce((s, b) => s + Math.max(b.targetAmount - b.actualAmount, 0), 0);
  const allBucketsFull = totalAvailable <= 0.01;

  // Bucket drilldown: open modal with bucket transactions
  const [bucketDrilldown, setBucketDrilldown] = useState<string | null>(null);
  const allFlat = useMemo(() => flattenTransactions(data), [data]);
  const bucketDrilldownTx = useMemo(() => {
    if (!bucketDrilldown) return [];
    const b = buckets.find((x) => x.key === bucketDrilldown);
    if (!b) return [];
    const cats = new Set(b.categories);
    return allFlat.filter((t) => t.category && cats.has(t.category));
  }, [bucketDrilldown, buckets, allFlat]);

  return (
    <VisorCard>
      <SectionHead title="Resultado Parcial" linkText="fluxo de caixa" href="/cashflow" />

      {/* Big value: total expenses (real + provisioned). Pill shows remaining bucket capacity. */}
      <div style={{ marginBottom: 8, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 32, fontWeight: 300, color: token.colorText }}>
          {r(expenses)}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.4,
            padding: "2px 8px",
            borderRadius: 999,
            color: allBucketsFull ? "#ff4d4f" : "#52c41a",
            background: allBucketsFull ? "rgba(255,77,79,0.12)" : "rgba(82,196,26,0.12)",
            border: `1px solid ${allBucketsFull ? "rgba(255,77,79,0.35)" : "rgba(82,196,26,0.35)"}`,
            whiteSpace: "nowrap",
          }}
        >
          {allBucketsFull
            ? "buckets esgotados"
            : `${r(totalAvailable)} disponivel nos buckets`}
        </span>
      </div>

      {/* Variation badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        {expensesVariation != null && <PercentChange value={expensesVariation} invert />}
        {prevExpenses != null && (
          <span style={{ fontSize: 13, color: "#8c8c8c" }}>
            vs {r(prevExpenses!)} mes anterior
          </span>
        )}
      </div>

      {/* Income vs Expense bar (provisioned purple FIRST of all) */}
      <div
        style={{
          display: "flex",
          height: 10,
          borderRadius: 5,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        {provPct > 0 && (
          <div style={{ width: `${provPct}%`, background: "#722ed1", transition: "width 0.3s" }} />
        )}
        <div style={{ width: `${incomePct}%`, background: "#4096ff", transition: "width 0.3s" }} />
        <div style={{ width: `${realExpensePct}%`, background: "#1d3557", transition: "width 0.3s" }} />
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 32, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Receita</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{r(income)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Gasto</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{r(realExpenses)}</div>
          {provisionedTotal > 0 && (
            <span style={{
              display: "inline-block",
              marginTop: 3,
              fontSize: 10,
              fontWeight: 600,
              lineHeight: 1.4,
              color: "#722ed1",
              background: "rgba(114,46,209,0.12)",
              border: "1px solid rgba(114,46,209,0.3)",
              borderRadius: 4,
              padding: "1px 6px",
              whiteSpace: "nowrap",
            }}>
              +{r(provisionedTotal)} prov.
            </span>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Net</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: net < 0 ? "#ff4d4f" : token.colorText }}>{r(net)}</div>
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
            provisioned={b.provisioned}
            pendingTargetPct={pendingPcts[b.key]}
            isPositiveBucket={b.key === "liberdade_financeira"}
            onTargetChange={(pct) => handlePctInput(b.key, pct)}
            onDrilldown={() => setBucketDrilldown(b.key)}
          />
        ))}
      </div>

      <Modal
        open={bucketDrilldown != null}
        onCancel={() => setBucketDrilldown(null)}
        footer={null}
        width="80%"
        destroyOnHidden
        title={bucketDrilldown ? `Bucket: ${buckets.find(b => b.key === bucketDrilldown)?.name ?? ""} — ${bucketDrilldownTx.length} transacoes` : ""}
        styles={{ body: { padding: 16 } }}
      >
        <TransactionsTable transactions={bucketDrilldownTx} redacted={redacted} pageSize={50} />
      </Modal>
    </VisorCard>
  );
}

type ProvFilter = "all" | "only" | "exclude";
type TxKey = string;

/* ── Category row inside a bucket (with subcategories) ────────── */
function CategoryRow({
  category, amount, previousAmount, variation, subcategories,
  forceExpand, checkedTxs, onToggleTx, onToggleGroup,
  totalExpenses, bucketTotal,
}: {
  category: string; amount: number;
  previousAmount: number | null; variation: number | null;
  subcategories: { name: string; total: number; prevTotal: number | null; variation: number | null; transactions: { description: string; date: string; amount: number; holder: string; provisional?: boolean; _key: string }[] }[];
  forceExpand: boolean | null;
  checkedTxs: Set<TxKey>;
  onToggleTx: (key: TxKey, amount: number) => void;
  onToggleGroup: (txs: { _key: string; amount: number }[]) => void;
  totalExpenses: number;
  bucketTotal: number;
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
          gridTemplateColumns: "1fr 150px 90px 90px 32px",
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
        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{r(amount)}</span>
          <div style={{ fontSize: 10, color: "#8c8c8c" }}>
            {bucketTotal > 0 ? formatPercent(Math.round((amount / bucketTotal) * 10000) / 100) : "0%"} bucket
            {" · "}
            {totalExpenses > 0 ? formatPercent(Math.round((amount / totalExpenses) * 10000) / 100) : "0%"} total
          </div>
        </div>
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
                gridTemplateColumns: "1fr 150px 90px 90px 32px",
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
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{r(sub.total)}</span>
                <div style={{ fontSize: 9, color: "#8c8c8c" }}>
                  {amount > 0 ? formatPercent(Math.round((sub.total / amount) * 10000) / 100) : "0%"} cat
                  {" · "}
                  {totalExpenses > 0 ? formatPercent(Math.round((sub.total / totalExpenses) * 10000) / 100) : "0%"} total
                </div>
              </div>
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
                      gridTemplateColumns: "1fr 150px 90px 90px 32px",
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

  const catTotalExpenses = useMemo(() => {
    const cats = data.expenses?.by_category ?? {};
    return Object.values(cats).reduce((s, c) => s + c.total, 0);
  }, [data]);

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
              <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4 }}>
                {catTotalExpenses > 0 ? formatPercent(Math.round((checkedTotal / catTotalExpenses) * 10000) / 100) : "0%"}
              </span>
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
          gridTemplateColumns: "1fr 150px 90px 90px 32px",
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
        // Collect all filtered txs for this bucket (for checkbox) and compute filtered total
        const bucketAllTxs: { _key: string; amount: number }[] = [];
        let filteredBucketTotal = 0;
        for (const cat of bucket.categories) {
          for (const [subName, sub] of Object.entries(cat.data.subcategories)) {
            const fTxs = filterTxs(sub.transactions);
            fTxs.forEach((tx: any, i: number) => {
              bucketAllTxs.push({ _key: `${cat.name}|${subName}|${i}|${tx.description}`, amount: tx.amount });
              filteredBucketTotal += tx.amount;
            });
          }
        }
        filteredBucketTotal = Math.round(filteredBucketTotal * 100) / 100;
        if (bucketAllTxs.length === 0 && provFilter !== "all") return null;
        const allBucketChecked = bucketAllTxs.length > 0 && bucketAllTxs.every((t) => checkedTxs.has(t._key));
        const someBucketChecked = !allBucketChecked && bucketAllTxs.some((t) => checkedTxs.has(t._key));

        return (
          <div key={bucket.key}>
            {/* Bucket header row */}
            <div
              onClick={() => toggleBucket(bucket.key)}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 150px 90px 90px 32px",
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
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{r(filteredBucketTotal)}</span>
                <div style={{ fontSize: 10, color: "#8c8c8c" }}>
                  {catTotalExpenses > 0 ? formatPercent(Math.round((filteredBucketTotal / catTotalExpenses) * 10000) / 100) : "0%"} do total
                </div>
              </div>
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
              if (subs.length === 0) return null;
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
                  totalExpenses={catTotalExpenses}
                  bucketTotal={filteredBucketTotal}
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
      holder: string; bank: string; accountNumber: string; accountType: "cc" | "savings" | "orphan";
      realTotal: number; realCount: number;
      provTotal: number; provCount: number;
    };
    const map: Record<string, AccStat> = {};
    const cats = data.expenses?.by_category ?? {};

    for (const cat of Object.values(cats)) {
      for (const sub of Object.values(cat.subcategories)) {
        for (const tx of sub.transactions) {
          const hasAccount = tx.account_number && tx.account_number !== "provisioned";
          const accNum = hasAccount ? tx.account_number! : "provisioned";
          const holder = tx.holder || "unknown";
          const key = `${holder}|${accNum}`;
          if (!map[key]) {
            const isCC = hasAccount && accNum.length <= 6;
            map[key] = {
              holder, bank: tx.bank || "Nubank", accountNumber: accNum,
              accountType: hasAccount ? (isCC ? "cc" : "savings") : "orphan",
              realTotal: 0, realCount: 0, provTotal: 0, provCount: 0,
            };
          }
          if (tx.provisional) {
            map[key].provTotal += tx.amount;
            map[key].provCount++;
          } else {
            map[key].realTotal += tx.amount;
            map[key].realCount++;
          }
        }
      }
    }
    return Object.values(map).sort((a, b) =>
      (b.realTotal + b.provTotal) - (a.realTotal + a.provTotal)
    );
  }, [data]);

  const realTotal = useMemo(() => accountStats.reduce((s, a) => s + a.realTotal, 0), [accountStats]);
  const realCount = useMemo(() => accountStats.reduce((s, a) => s + a.realCount, 0), [accountStats]);
  const provTotal = useMemo(() => accountStats.reduce((s, a) => s + a.provTotal, 0), [accountStats]);
  const provCount = useMemo(() => accountStats.reduce((s, a) => s + a.provCount, 0), [accountStats]);
  const grandTotal = realTotal + provTotal;
  const grandCount = realCount + provCount;

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

      {/* Breakdown: real + provisioned */}
      {provTotal > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#8c8c8c" }}>
            <span style={{ fontWeight: 600, color: token.colorText }}>{r(realTotal)}</span> ja lancado ({realCount})
          </span>
          <span style={{ fontSize: 12, color: "#8c8c8c" }}>+</span>
          <span style={{
            fontSize: 12, color: "#722ed1", fontWeight: 600,
            background: "rgba(114,46,209,0.1)", padding: "2px 8px", borderRadius: 4,
          }}>
            {r(provTotal)} provisionado ({provCount})
          </span>
        </div>
      )}

      {/* Account rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 16 }}>
        {accountStats.map((acc) => {
          const isOrphan = acc.accountType === "orphan";
          const rowTotal = acc.realTotal + acc.provTotal;
          const rowCount = acc.realCount + acc.provCount;
          const badgeBg = acc.accountType === "cc" ? "rgba(82,196,26,0.1)"
            : acc.accountType === "savings" ? "rgba(64,150,255,0.1)"
            : "rgba(114,46,209,0.1)";
          const badgeFg = acc.accountType === "cc" ? "#52c41a"
            : acc.accountType === "savings" ? "#4096ff"
            : "#722ed1";
          const badgeText = acc.accountType === "cc" ? "Ciclo atual"
            : acc.accountType === "savings" ? "Conta"
            : "Provisionado";
          return (
            <div
              key={`${acc.holder}|${acc.accountNumber}`}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 0",
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {isOrphan ? (
                  <div style={{
                    width: 40, height: 40, borderRadius: 20,
                    background: "rgba(114,46,209,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 18 }}>&#10024;</span>
                  </div>
                ) : (
                  <NuLogo size={40} />
                )}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>
                      {acc.holder}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      background: badgeBg, color: badgeFg,
                    }}>
                      {badgeText}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 2 }}>
                    {isOrphan ? "Previsto ate o fim do mes" : `${acc.accountType === "cc" ? "Fatura atual" : "Conta corrente"} · ${acc.accountNumber}`}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{r(rowTotal)}</div>
                {acc.provTotal > 0 && !isOrphan && (
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    <span style={{ color: "#8c8c8c" }}>{r(acc.realTotal)} + </span>
                    <span style={{ color: "#722ed1", fontWeight: 600 }}>{r(acc.provTotal)} prov.</span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#8c8c8c", marginTop: 2 }}>
                  {rowCount} {isOrphan ? "itens" : "transacoes"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </VisorCard>
  );
}

/* ── Top 10 Categorias ───────────────────────────────────────── */
type TopCatView = "top10" | "highest" | "lowest";

function TopCategoriesCard({ data, previousData, allMonths }: { data: BudgetData; previousData: BudgetData | null; allMonths: BudgetData[] }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);
  const [checkedCats, setCheckedCats] = useState<Set<string>>(new Set());
  const [checkedTotal, setCheckedTotal] = useState(0);
  const [viewMode, setViewMode] = useState<TopCatView>("top10");
  const [drilldownCat, setDrilldownCat] = useState<string | null>(null);
  const [drilldownFilters, setDrilldownFilters] = useState<TransactionFilters>(DEFAULT_FILTERS);
  const [comparisonOpen, setComparisonOpen] = useState(false);

  const allFlat = useMemo(() => flattenTransactions(data), [data]);
  const drilldownBaseTx = useMemo(
    () => (drilldownCat ? allFlat.filter((t) => t.category === drilldownCat) : []),
    [allFlat, drilldownCat]
  );
  const drilldownTx = useMemo(
    () => applyTransactionFilters(drilldownBaseTx, drilldownFilters),
    [drilldownBaseTx, drilldownFilters]
  );

  const openDrilldown = useCallback((catName: string) => {
    setDrilldownCat(catName);
    setDrilldownFilters(DEFAULT_FILTERS);
  }, []);

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

  // Provisioned amount per category (sum of transactions flagged as provisional)
  const provisionedByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [name, cat] of Object.entries(data.expenses?.by_category ?? {})) {
      let sum = 0;
      for (const sub of Object.values(cat.subcategories)) {
        for (const tx of sub.transactions) {
          if ((tx as { provisional?: boolean }).provisional) sum += tx.amount;
        }
      }
      if (sum > 0) map[name] = Math.round(sum * 100) / 100;
    }
    return map;
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

  const totalExpenses = useMemo(() => {
    const cats = data.expenses?.by_category ?? {};
    return Object.values(cats).reduce((s, c) => s + c.total, 0);
  }, [data]);

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
          <span
            onClick={() => setComparisonOpen(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 12, color: "#6366f1", cursor: "pointer", fontWeight: 500,
              padding: "2px 8px", borderRadius: 6,
              border: "1px solid rgba(99,102,241,0.3)",
              background: "rgba(99,102,241,0.08)",
            }}
          >
            <List size={12} /> Comparar meses
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "28px 200px 110px 1fr 80px 100px 90px 32px 32px",
        gap: 12, padding: "0 0 10px 0",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "center" }}>#</span>
        <span style={{ fontSize: 11, color: "#8c8c8c" }}>Categoria</span>
        <span style={{ fontSize: 11, color: "#8c8c8c" }}>Atual</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "center" }}>vs Mes Anterior</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "center" }}>Variacao</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>Diferenca</span>
        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>Anterior</span>
        <span />
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
              <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4 }}>
                {totalExpenses > 0 ? formatPercent(Math.round((checkedTotal / totalExpenses) * 10000) / 100) : "0%"}
              </span>
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

        // Bar widths normalized per row (max of current/prev for this category)
        const rowMax = Math.max(cat.total, prevTotal ?? 0, 1);
        const currentBarPct = (cat.total / rowMax) * 100;
        const prevBarPct = prevTotal != null ? (prevTotal / rowMax) * 100 : 0;
        const provisioned = provisionedByCat[cat.name] ?? 0;
        const provBarPct = (provisioned / rowMax) * 100;

        // Bar color: red if over previous, green if under or new
        const barColor = isUp ? "#ff4d4f" : "#52c41a";

        return (
          <div
            key={cat.name}
            style={{
              display: "grid", gridTemplateColumns: "28px 200px 110px 1fr 80px 100px 90px 32px 32px",
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

            {/* Current amount + % (+ purple provisioned tag below) */}
            <div>
              <div style={{ whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r(cat.total)}</span>
                <span style={{ fontSize: 10, color: "#8c8c8c", marginLeft: 4 }}>
                  {totalExpenses > 0 ? formatPercent(Math.round((cat.total / totalExpenses) * 10000) / 100) : "0%"}
                </span>
              </div>
              {(provisionedByCat[cat.name] ?? 0) > 0 && (
                <span style={{
                  display: "inline-block",
                  marginTop: 3,
                  fontSize: 10,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  color: "#722ed1",
                  background: "rgba(114,46,209,0.12)",
                  border: "1px solid rgba(114,46,209,0.3)",
                  borderRadius: 4,
                  padding: "1px 6px",
                  whiteSpace: "nowrap",
                }}>
                  +{r(provisionedByCat[cat.name])} prov.
                </span>
              )}
            </div>

            {/* Comparison bar */}
            <div style={{ position: "relative", height: 10, borderRadius: 5, background: token.colorFillSecondary, overflow: "hidden" }}>
              {isUp ? (
                <>
                  {/* Current (wider) as light red track */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, height: "100%",
                    width: `${currentBarPct}%`,
                    background: "rgba(168,7,26,0.25)",
                    transition: "width 0.4s ease",
                  }} />
                  {/* Previous (narrower) as dark red on top (real portion, after provisioned) */}
                  {prevBarPct > 0 && prevBarPct > provBarPct && (
                    <div style={{
                      position: "absolute", left: `${provBarPct}%`, top: 0, height: "100%",
                      width: `${prevBarPct - provBarPct}%`,
                      background: "#a8071a",
                    }} />
                  )}
                </>
              ) : (
                <>
                  {/* Previous (wider) as gray track */}
                  {prevBarPct > 0 && (
                    <div style={{
                      position: "absolute", left: 0, top: 0, height: "100%",
                      width: `${prevBarPct}%`,
                      background: "rgba(140,140,140,0.35)",
                    }} />
                  )}
                  {/* Current real (after provisioned) in green */}
                  {currentBarPct > provBarPct && (
                    <div style={{
                      position: "absolute", left: `${provBarPct}%`, top: 0, height: "100%",
                      width: `${currentBarPct - provBarPct}%`,
                      background: "#52c41a",
                      transition: "width 0.4s ease",
                    }} />
                  )}
                </>
              )}
              {/* Provisioned segment in purple at the LEFT, on top of everything */}
              {provisioned > 0 && (
                <div style={{
                  position: "absolute", left: 0, top: 0, height: "100%",
                  width: `${provBarPct}%`,
                  background: "#722ed1",
                  transition: "width 0.4s ease",
                }} />
              )}
            </div>

            {/* Variation */}
            <div style={{ textAlign: "center" }}>
              {variation != null ? (
                <PercentChange value={variation} invert size="small" />
              ) : (
                <span style={{ fontSize: 11, color: "#bfbfbf" }}>--</span>
              )}
            </div>

            {/* Difference */}
            <span style={{
              fontSize: 12, textAlign: "right", fontWeight: 500,
              color: prevTotal == null ? "#bfbfbf" : isUp ? "#ff4d4f" : isDown ? "#52c41a" : "#8c8c8c",
            }}>
              {prevTotal != null
                ? `${cat.total - prevTotal >= 0 ? "+" : "-"}${redacted ? REDACTED : formatBRL(Math.abs(cat.total - prevTotal))}`
                : "--"}
            </span>

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

            {/* Open transactions modal */}
            <span
              role="button"
              title="Ver transacoes"
              onClick={() => openDrilldown(cat.name)}
              style={{
                justifySelf: "center", cursor: "pointer", color: "#8c8c8c",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 24, height: 24, borderRadius: 4,
              }}
            >
              <List size={14} />
            </span>
          </div>
        );
      })}

      <Modal
        open={drilldownCat != null}
        onCancel={() => setDrilldownCat(null)}
        footer={null}
        width="80%"
        destroyOnHidden
        title={drilldownCat ? `${getCategoryMeta(drilldownCat).emoji} ${drilldownCat} — ${drilldownBaseTx.length} transacoes` : ""}
        styles={{ body: { padding: 16 } }}
      >
        <TransactionsFilters
          transactions={drilldownBaseTx}
          value={drilldownFilters}
          onChange={setDrilldownFilters}
          resultCount={drilldownTx.length}
        />
        <TransactionsTable transactions={drilldownTx} redacted={redacted} pageSize={50} />
      </Modal>

      <CategoryComparisonModal
        open={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        currentMonth={data.month}
        allMonths={allMonths}
        redacted={redacted}
      />
    </VisorCard>
  );
}

/* ── Category Comparison Modal ────────────────────────────────── */
function CategoryComparisonModal({
  open, onClose, currentMonth, allMonths, redacted,
}: {
  open: boolean;
  onClose: () => void;
  currentMonth: string;
  allMonths: BudgetData[];
  redacted: boolean;
}) {
  const { token } = theme.useToken();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);

  // Sort months ascending and limit to last 12 for readability
  const months = useMemo(() => {
    const sorted = [...allMonths].sort((a, b) => a.month.localeCompare(b.month));
    return sorted.slice(-12);
  }, [allMonths]);

  // Build category totals per month
  const grid = useMemo(() => {
    const catSet = new Set<string>();
    const perMonth: Record<string, Record<string, number>> = {};
    const incomeByMonth: Record<string, number> = {};
    const expensesByMonth: Record<string, number> = {};
    for (const m of months) {
      const cats: Record<string, number> = {};
      let monthExpenses = 0;
      for (const [name, cat] of Object.entries(m.expenses?.by_category ?? {})) {
        let total = 0;
        for (const sub of Object.values(cat.subcategories)) {
          for (const tx of sub.transactions) total += tx.amount;
        }
        cats[name] = Math.round(total * 100) / 100;
        catSet.add(name);
        monthExpenses += total;
      }
      perMonth[m.month] = cats;
      const summ = getBudgetSummary(m);
      incomeByMonth[m.month] = Math.round(summ.total_income * 100) / 100;
      expensesByMonth[m.month] = Math.round(monthExpenses * 100) / 100;
    }
    // Compute per-category total over selected window for sorting
    const categories = [...catSet].sort((a, b) => {
      const ta = months.reduce((s, m) => s + (perMonth[m.month][a] ?? 0), 0);
      const tb = months.reduce((s, m) => s + (perMonth[m.month][b] ?? 0), 0);
      return Math.abs(tb) - Math.abs(ta);
    });
    return { categories, perMonth, incomeByMonth, expensesByMonth };
  }, [months]);

  const monthLabel = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return `${names[(mm ?? 1) - 1]}/${String(y).slice(2)}`;
  };

  // Color scale based on value relative to category's max across months
  const cellBg = (val: number, max: number) => {
    if (val === 0 || max === 0) return "transparent";
    const intensity = Math.min(1, Math.abs(val) / max);
    const isNeg = val < 0;
    const alpha = 0.05 + intensity * 0.35;
    return isNeg
      ? `rgba(82,196,26,${alpha.toFixed(2)})`   // green for refunds/credits
      : `rgba(250,140,22,${alpha.toFixed(2)})`; // orange-ish for expenses
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="90%"
      destroyOnHidden
      title="Comparativo de Categorias por Mes"
      styles={{ body: { padding: 16, maxHeight: "75vh", overflow: "auto" } }}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{
                position: "sticky", left: 0, top: 0, zIndex: 3,
                background: token.colorBgElevated, padding: "8px 10px",
                textAlign: "left", borderBottom: `1px solid ${token.colorBorderSecondary}`,
                minWidth: 200,
              }}>Categoria</th>
              {months.map((m) => (
                <th key={m.month} style={{
                  position: "sticky", top: 0, zIndex: 2,
                  background: token.colorBgElevated, padding: "8px 10px",
                  textAlign: "right", borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  fontWeight: m.month === currentMonth ? 700 : 500,
                  color: m.month === currentMonth ? "#6366f1" : token.colorText,
                  whiteSpace: "nowrap",
                }}>
                  {monthLabel(m.month)}
                </th>
              ))}
              <th style={{
                position: "sticky", top: 0, zIndex: 2,
                background: token.colorBgElevated, padding: "8px 10px",
                textAlign: "right", borderBottom: `1px solid ${token.colorBorderSecondary}`,
                fontWeight: 700, whiteSpace: "nowrap",
              }}>Media</th>
              <th style={{
                position: "sticky", top: 0, zIndex: 2,
                background: token.colorBgElevated, padding: "8px 10px",
                textAlign: "right", borderBottom: `1px solid ${token.colorBorderSecondary}`,
                fontWeight: 700, whiteSpace: "nowrap",
              }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Build summary rows: Receita (income, green) and Total Despesas (orange).
              const incomeVals = months.map((m) => grid.incomeByMonth[m.month] ?? 0);
              const expensesVals = months.map((m) => grid.expensesByMonth[m.month] ?? 0);
              const sumRow = (label: string, vals: number[], color: string, bgRgba: string) => {
                const sum = vals.reduce((s, v) => s + v, 0);
                const nz = vals.filter(v => v !== 0).length;
                const avg = nz > 0 ? sum / nz : 0;
                return (
                  <tr key={label}>
                    <td style={{
                      position: "sticky", left: 0, zIndex: 1,
                      background: bgRgba, padding: "8px 10px",
                      borderTop: `2px solid ${color}`,
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      whiteSpace: "nowrap", fontWeight: 700, color,
                    }}>
                      {label}
                    </td>
                    {months.map((m, i) => (
                      <td key={m.month} style={{
                        padding: "8px 10px", textAlign: "right",
                        borderTop: `2px solid ${color}`,
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        background: bgRgba,
                        color, fontWeight: m.month === currentMonth ? 700 : 600,
                        whiteSpace: "nowrap",
                      }}>
                        {vals[i] === 0 ? "—" : r(vals[i])}
                      </td>
                    ))}
                    <td style={{
                      padding: "8px 10px", textAlign: "right",
                      borderTop: `2px solid ${color}`,
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      background: bgRgba, fontWeight: 700, color, whiteSpace: "nowrap",
                    }}>
                      {r(avg)}
                    </td>
                    <td style={{
                      padding: "8px 10px", textAlign: "right",
                      borderTop: `2px solid ${color}`,
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      background: bgRgba, fontWeight: 700, color, whiteSpace: "nowrap",
                    }}>
                      {r(sum)}
                    </td>
                  </tr>
                );
              };
              return [
                sumRow("💰 Receita", incomeVals, "#52c41a", "rgba(82,196,26,0.08)"),
                sumRow("💸 Total Despesas", expensesVals, "#fa541c", "rgba(250,84,28,0.08)"),
                <tr key="spacer-after-summary"><td colSpan={months.length + 3} style={{ height: 16, border: "none", background: "transparent" }} /></tr>,
              ];
            })()}
            {grid.categories.map((cat) => {
              const { emoji } = getCategoryMeta(cat);
              const vals = months.map((m) => grid.perMonth[m.month][cat] ?? 0);
              const max = Math.max(...vals.map(Math.abs));
              const sum = vals.reduce((s, v) => s + v, 0);
              const nonZero = vals.filter(v => v !== 0).length;
              const avg = nonZero > 0 ? sum / nonZero : 0;
              return (
                <tr key={cat}>
                  <td style={{
                    position: "sticky", left: 0, zIndex: 1,
                    background: token.colorBgElevated, padding: "6px 10px",
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{ marginRight: 6 }}>{emoji}</span>{cat}
                  </td>
                  {months.map((m, i) => {
                    const v = vals[i];
                    return (
                      <td key={m.month} style={{
                        padding: "6px 10px", textAlign: "right",
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        background: cellBg(v, max),
                        color: v < 0 ? "#52c41a" : token.colorText,
                        fontWeight: m.month === currentMonth ? 600 : 400,
                        whiteSpace: "nowrap",
                      }}>
                        {v === 0 ? "—" : r(v)}
                      </td>
                    );
                  })}
                  <td style={{
                    padding: "6px 10px", textAlign: "right",
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    fontWeight: 600, whiteSpace: "nowrap",
                    color: avg < 0 ? "#52c41a" : token.colorText,
                  }}>
                    {r(avg)}
                  </td>
                  <td style={{
                    padding: "6px 10px", textAlign: "right",
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    fontWeight: 700, whiteSpace: "nowrap",
                    color: sum < 0 ? "#52c41a" : token.colorText,
                  }}>
                    {r(sum)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
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
          { idx: 0, label: "Saem esse mes", color: "#52c41a" },
          { idx: 1, label: "Saem mes que vem", color: "#fa8c16" },
          { idx: 2, label: "Saem em 2 meses", color: "#fa8c16" },
          { idx: 3, label: "Saem em 3 meses", color: "#4096ff" },
          { idx: 4, label: "Saem em 4 meses", color: "#4096ff" },
          { idx: 5, label: "Saem em 5 meses", color: "#4096ff" },
        ].map(({ idx, label, color: c }) => {
          const val = freedByMonth[idx];
          const prev = idx > 0 ? freedByMonth[idx - 1] : 0;
          const onlyThisMonth = val - prev;
          if (!val || onlyThisMonth <= 0) return null;
          return (
            <div key={idx}>
              <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 300, color: c }}>{r(val)}</div>
              <div style={{ fontSize: 10, color: "#8c8c8c" }}>+{r(onlyThisMonth)} nesse periodo</div>
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

/* ── Composicao do Mes (a vista vs parcela nova vs parcela antiga) ── */
function MonthCompositionCard({ data }: { data: BudgetData }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const composition = useMemo(() => {
    type BucketKey = "avista" | "nova" | "antiga";
    const buckets: Record<BucketKey, { amount: number; count: number; byCategory: Record<string, { amount: number; count: number }> }> = {
      avista: { amount: 0, count: 0, byCategory: {} },
      nova:   { amount: 0, count: 0, byCategory: {} },
      antiga: { amount: 0, count: 0, byCategory: {} },
    };

    const consume = (tx: any, categoryName: string) => {
      if (tx.provisional) return;
      const total = tx.totalInstallments;
      const n = tx.installmentNumber;
      const key: BucketKey = total && total >= 2 && n
        ? (n === 1 ? "nova" : "antiga")
        : "avista";
      const b = buckets[key];
      b.amount += tx.amount;
      b.count++;
      if (!b.byCategory[categoryName]) b.byCategory[categoryName] = { amount: 0, count: 0 };
      b.byCategory[categoryName].amount += tx.amount;
      b.byCategory[categoryName].count++;
    };

    const cats = data.expenses?.by_category ?? {};
    for (const [catName, cat] of Object.entries(cats)) {
      for (const sub of Object.values(cat.subcategories)) {
        for (const tx of sub.transactions) consume(tx, catName);
      }
    }
    for (const tx of data.expenses?.unclassified ?? []) consume(tx, "Sem categoria");

    const toList = (bc: Record<string, { amount: number; count: number }>) =>
      Object.entries(bc)
        .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
        .sort((a, b) => b.amount - a.amount);

    const grand = buckets.avista.amount + buckets.nova.amount + buckets.antiga.amount;
    return {
      grand,
      rows: [
        { key: "avista",  label: "A vista",          amount: buckets.avista.amount, count: buckets.avista.count, color: "#4096ff", hint: "Compras unicas, sem parcelamento",       categories: toList(buckets.avista.byCategory) },
        { key: "nova",    label: "Parcela nova",     amount: buckets.nova.amount,   count: buckets.nova.count,   color: "#722ed1", hint: "Primeira parcela iniciada este mes",     categories: toList(buckets.nova.byCategory) },
        { key: "antiga",  label: "Parcela antiga",   amount: buckets.antiga.amount, count: buckets.antiga.count, color: "#8c8c8c", hint: "Parcelas iniciadas em meses anteriores", categories: toList(buckets.antiga.byCategory) },
      ],
    };
  }, [data]);

  const { grand, rows } = composition;

  return (
    <VisorCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionHead title="Composicao do Mes" />
        <div style={{ fontSize: 20, fontWeight: 300, marginBottom: 20 }}>{r(grand)}</div>
      </div>

      {/* Stacked bar */}
      {grand > 0 && (
        <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 20, background: token.colorFillSecondary }}>
          {rows.map((row) => {
            const pct = (row.amount / grand) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={row.key}
                style={{ width: `${pct}%`, background: row.color, transition: "width 0.4s ease" }}
                title={`${row.label}: ${formatPercent(pct)}`}
              />
            );
          })}
        </div>
      )}

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row) => {
          const pct = grand > 0 ? (row.amount / grand) * 100 : 0;
          const isOpen = expanded.has(row.key);
          const hasCats = row.categories.length > 0;
          return (
            <div key={row.key}>
              <div
                onClick={() => hasCats && toggle(row.key)}
                style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center",
                  padding: "8px 0", cursor: hasCats ? "pointer" : "default",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "#8c8c8c", width: 8, display: "inline-block", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0)", opacity: hasCats ? 1 : 0 }}>&#9654;</span>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: token.colorText }}>{row.label}</div>
                  <div style={{ fontSize: 11, color: "#8c8c8c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.count} {row.count === 1 ? "transacao" : "transacoes"} - {row.hint}
                  </div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: token.colorText }}>{r(row.amount)}</span>
                <span style={{
                  fontSize: 11, fontWeight: 500, color: row.color,
                  padding: "2px 8px", borderRadius: 4,
                  background: `${row.color}1a`, minWidth: 48, textAlign: "center",
                }}>
                  {formatPercent(pct)}
                </span>
              </div>

              {/* Category breakdown */}
              {isOpen && hasCats && (
                <div style={{
                  padding: "6px 0 10px 30px",
                  borderLeft: `2px solid ${row.color}33`,
                  marginLeft: 13, marginBottom: 6,
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  {row.categories.map((c) => {
                    const catPct = row.amount > 0 ? (c.amount / row.amount) * 100 : 0;
                    const { emoji } = getCategoryMeta(c.name);
                    return (
                      <div key={c.name} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 12 }}>{emoji}</span>
                          <span style={{ fontSize: 12, color: token.colorText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          <span style={{ fontSize: 10, color: "#8c8c8c" }}>({c.count})</span>
                        </div>
                        <span style={{ fontSize: 12, color: token.colorText }}>{r(c.amount)}</span>
                        <span style={{ fontSize: 10, color: "#8c8c8c", minWidth: 40, textAlign: "right" }}>{formatPercent(catPct)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </VisorCard>
  );
}

/* ── Top 10 Categorias - Linha temporal ───────────────────────── */
function TopCategoriesTrendCard({ allMonths, currentMonth }: { allMonths: BudgetData[]; currentMonth: string }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);

  const [excludeCurrent, setExcludeCurrent] = useState(false);

  // Sort months ascending, last 12. Optionally drop the current month.
  const months = useMemo(() => {
    let sorted = [...allMonths].sort((a, b) => a.month.localeCompare(b.month));
    if (excludeCurrent) sorted = sorted.filter((m) => m.month !== currentMonth);
    return sorted.slice(-12);
  }, [allMonths, excludeCurrent, currentMonth]);

  // Aggregate per month per category, then pick top-10 by total over the window.
  const { topCategories, chartData, totalsMap } = useMemo(() => {
    const totals: Record<string, number> = {};
    const perMonth: Record<string, Record<string, number>> = {};
    for (const m of months) {
      const cats: Record<string, number> = {};
      for (const [name, cat] of Object.entries(m.expenses?.by_category ?? {})) {
        let total = 0;
        for (const sub of Object.values(cat.subcategories)) {
          for (const tx of sub.transactions) total += tx.amount;
        }
        const v = Math.round(total * 100) / 100;
        cats[name] = v;
        totals[name] = (totals[name] ?? 0) + v;
      }
      perMonth[m.month] = cats;
    }
    const top = Object.entries(totals)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 10)
      .map(([name]) => name);
    const monthLabels = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const data = months.map((m) => {
      const [y, mm] = m.month.split("-").map(Number);
      const row: Record<string, string | number> = {
        month: m.month,
        label: `${monthLabels[(mm ?? 1) - 1]}/${String(y).slice(2)}`,
      };
      for (const cat of top) row[cat] = perMonth[m.month][cat] ?? 0;
      return row;
    });
    return { topCategories: top, chartData: data, totalsMap: totals };
  }, [months]);

  // Stable color palette for up to 10 lines.
  const PALETTE = [
    "#4096ff", "#fa8c16", "#52c41a", "#722ed1", "#eb2f96",
    "#13c2c2", "#fa541c", "#a0d911", "#1d3557", "#f5222d",
  ];

  // Visibility per category (default: all visible).
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggleCat = useCallback((cat: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  // Highlighted category (hover or pinned via click)
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [pinnedCat, setPinnedCat] = useState<string | null>(null);
  const highlighted = hoveredCat ?? pinnedCat;
  const togglePin = useCallback((cat: string) => {
    setPinnedCat((prev) => (prev === cat ? null : cat));
  }, []);

  const visibleSum = topCategories.reduce(
    (s, c) => (hidden.has(c) ? s : s + (totalsMap[c] ?? 0)),
    0
  );

  return (
    <VisorCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionHead title="Top 10 Categorias - Evolucao" />
        <label style={{
          display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
          fontSize: 12, color: "#8c8c8c", userSelect: "none",
        }}>
          <Checkbox checked={excludeCurrent} onChange={(e) => setExcludeCurrent(e.target.checked)} />
          Desconsiderar mes atual
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, marginTop: 12, alignItems: "stretch" }}>
        <div style={{ height: 520 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 10, right: 20, top: 10, bottom: 5 }}>
              <CartesianGrid stroke="rgba(140,140,140,0.15)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#e8e8e8" }}
                tick={{ fill: "#8c8c8c" }}
              />
              <YAxis
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#8c8c8c" }}
                tickFormatter={(v) => redacted ? "•••" : `R$ ${(v / 1000).toFixed(0)}k`}
                width={70}
              />
              <Tooltip
                formatter={(v: number, name: string) => [r(v), name]}
                labelFormatter={(l) => `Mes: ${l}`}
                contentStyle={{
                  background: "#fff",
                  border: "none",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#1f1f1f", fontWeight: 600, marginBottom: 4 }}
              />
              {topCategories.map((cat, i) => {
                if (hidden.has(cat)) return null;
                const { emoji } = getCategoryMeta(cat);
                const color = PALETTE[i % PALETTE.length];
                const isHighlighted = highlighted === cat;
                const dimmed = highlighted != null && !isHighlighted;
                return (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    name={`${emoji} ${cat}`}
                    stroke={color}
                    strokeWidth={isHighlighted ? 3.5 : 2}
                    strokeOpacity={dimmed ? 0.18 : 1}
                    dot={{ r: isHighlighted ? 4 : 3, fill: color, strokeWidth: 0, fillOpacity: dimmed ? 0.18 : 1 }}
                    activeDot={{ r: isHighlighted ? 6 : 5 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
              {currentMonth && (
                <ReferenceLine
                  x={(() => {
                    const m = chartData.find((d) => d.month === currentMonth);
                    return m ? (m.label as string) : undefined;
                  })()}
                  stroke="#6366f1"
                  strokeDasharray="4 4"
                  label={{ value: "atual", position: "top", fill: "#6366f1", fontSize: 10 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Side card: top 10 totals + toggles */}
        <div style={{
          background: token.colorBgElevated,
          borderRadius: 8,
          padding: "14px 16px",
          border: `1px solid ${token.colorBorderSecondary}`,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8c8c8c" }}>
              Soma (visiveis)
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: visibleSum < 0 ? "#52c41a" : token.colorText }}>
              {r(visibleSum)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 11, marginBottom: 6 }}>
            <span
              onClick={() => setHidden(new Set())}
              style={{ color: "#6366f1", cursor: "pointer", textDecoration: "underline" }}
            >
              marcar todas
            </span>
            <span
              onClick={() => setHidden(new Set(topCategories))}
              style={{ color: "#6366f1", cursor: "pointer", textDecoration: "underline" }}
            >
              desmarcar todas
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, marginBottom: 4 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {topCategories.map((cat, i) => {
              const { emoji } = getCategoryMeta(cat);
              const color = PALETTE[i % PALETTE.length];
              const total = totalsMap[cat] ?? 0;
              const isHidden = hidden.has(cat);
              const isHighlighted = highlighted === cat;
              const isPinned = pinnedCat === cat;
              return (
                <div
                  key={cat}
                  onMouseEnter={() => !isHidden && setHoveredCat(cat)}
                  onMouseLeave={() => setHoveredCat(null)}
                  onClick={() => togglePin(cat)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                    background: isHighlighted
                      ? `${color}1f`
                      : isHidden ? "transparent" : "rgba(99,102,241,0.04)",
                    border: isPinned ? `1px solid ${color}` : "1px solid transparent",
                    opacity: isHidden ? 0.4 : 1,
                    transition: "background 0.15s, opacity 0.15s, border-color 0.15s",
                  }}
                >
                  <Checkbox checked={!isHidden} onChange={() => toggleCat(cat)} onClick={(e) => e.stopPropagation()} />
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: isHighlighted ? 600 : 400 }}>
                    {emoji} {cat}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: total < 0 ? "#52c41a" : token.colorText }}>
                    {r(total)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </VisorCard>
  );
}

/* ── Receita por mes ──────────────────────────────────────────── */
function IncomeBarCard({ allMonths, currentMonth }: { allMonths: BudgetData[]; currentMonth: string }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);

  const months = useMemo(() => {
    return [...allMonths].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [allMonths]);

  const monthLabels = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const labelOf = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return `${monthLabels[(mm ?? 1) - 1]}/${String(y).slice(2)}`;
  };

  const chartData = useMemo(() => {
    return months.map((m) => ({
      month: m.month,
      label: labelOf(m.month),
      income: Math.round(getBudgetSummary(m).total_income * 100) / 100,
    }));
  }, [months]);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  useEffect(() => { setSelectedMonth(currentMonth); }, [currentMonth]);

  const selectedBudget = useMemo(
    () => months.find((m) => m.month === selectedMonth) ?? null,
    [months, selectedMonth]
  );

  const incomeTx = useMemo(() => {
    if (!selectedBudget) return [];
    const flat = flattenTransactions(selectedBudget);
    return flat.filter((t) => t.type === "income");
  }, [selectedBudget]);

  return (
    <VisorCard>
      <SectionHead title="Receita por mes" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 10, right: 20, top: 10, bottom: 5 }}>
              <CartesianGrid stroke="rgba(140,140,140,0.15)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#e8e8e8" }}
                tick={{ fill: "#8c8c8c" }}
              />
              <YAxis
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#8c8c8c" }}
                tickFormatter={(v) => redacted ? "•••" : `R$ ${(v / 1000).toFixed(0)}k`}
                width={70}
              />
              <Tooltip
                formatter={(v: number) => [r(v), "Receita"]}
                labelFormatter={(l) => `Mes: ${l}`}
                cursor={{ fill: "rgba(99,102,241,0.06)" }}
                contentStyle={{
                  background: "#fff",
                  border: "none",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#1f1f1f", fontWeight: 600, marginBottom: 4 }}
              />
              <Bar
                dataKey="income"
                radius={[4, 4, 0, 0]}
                onClick={(d: { month?: string }) => { if (d?.month) setSelectedMonth(d.month); }}
              >
                {chartData.map((d) => (
                  <Cell
                    key={d.month}
                    fill={d.month === selectedMonth ? "#52c41a" : "rgba(82,196,26,0.45)"}
                    cursor="pointer"
                  />
                ))}
                <LabelList
                  dataKey="income"
                  position="top"
                  style={{ fontSize: 11, fontWeight: 600, fill: "#52c41a" }}
                  formatter={(v: number) => redacted ? "•••" : `R$ ${(v / 1000).toFixed(1)}k`}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Income table for selected month */}
        <div style={{
          background: token.colorBgElevated,
          borderRadius: 8,
          padding: "14px 16px",
          border: `1px solid ${token.colorBorderSecondary}`,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8c8c8c" }}>
              Receita {labelOf(selectedMonth)}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#52c41a" }}>
              {r(incomeTx.reduce((s, t) => s + t.amount, 0))}
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, marginBottom: 4 }} />
          <div>
            {incomeTx.length === 0 ? (
              <div style={{ fontSize: 12, color: "#8c8c8c", padding: 8, textAlign: "center" }}>Sem receitas neste mes</div>
            ) : (
              <TransactionsTable transactions={incomeTx} redacted={redacted} pageSize={50} showCard={false} />
            )}
          </div>
        </div>
      </div>
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

      {/* Top row: Ritmo + Resultado (equal heights) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
        <SpendingPaceCard data={data} previousData={previousData} allMonths={allMonths} />
        <PartialResultCard data={data} previousData={previousData} />
      </div>

      {/* Row 2: Principais Categorias + Visao de Contas */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 16, marginTop: 16, alignItems: "stretch" }}>
        <TopCategoriesCard data={data} previousData={previousData} allMonths={allMonths} />
        <AccountBillsCard data={data} />
      </div>

      {/* Parcelas + Composicao do Mes */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 16, marginTop: 16, alignItems: "stretch" }}>
        <InstallmentsCard data={data} />
        <MonthCompositionCard data={data} />
      </div>

      {/* Categorias */}
      <div style={{ marginTop: 16 }}>
        <CategoriesCard data={data} previousData={previousData} />
      </div>

      {/* Top 10 Categorias - evolucao temporal */}
      <div style={{ marginTop: 16 }}>
        <TopCategoriesTrendCard allMonths={allMonths} currentMonth={data.month} />
      </div>

      {/* Receita por mes (bar chart + tabela do mes selecionado) */}
      <div style={{ marginTop: 16 }}>
        <IncomeBarCard allMonths={allMonths} currentMonth={data.month} />
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
