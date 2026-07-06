import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Typography, theme, Modal, Segmented, Checkbox, InputNumber } from "antd";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot, Label,
  LineChart, Line, Legend, CartesianGrid,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import { Info, ExternalLink, RefreshCw, ChevronsDown, ChevronsUp, List } from "lucide-react";
import { useRouter } from "next/router";
import { useBudget } from "@/hooks/useBudget";
import { useIsMobile } from "@/hooks/useIsMobile";
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
import { useRefresh, useRegisterRefresh } from "@/context/RefreshContext";
import { getCategoryMeta } from "@/lib/category-meta";
import type { BudgetData, Transaction } from "@/lib/types";

const { Text, Title } = Typography;

/* ── Visor-style card wrapper ─────────────────────────────────── */
function VisorCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { token } = theme.useToken();
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        background: token.colorBgContainer,
        borderRadius: 12,
        padding: isMobile ? "16px 14px" : "24px 28px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
        maxWidth: "100%",
        overflowX: "hidden",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── Section header with link ─────────────────────────────────── */
function SectionHead({ title, linkText, href, extra }: { title: string; linkText?: string; href?: string; extra?: React.ReactNode }) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8c8c8c" }}>
          {title}
        </span>
        <Info size={13} color="#bfbfbf" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {extra}
        {linkText && href && (
          <span
            onClick={() => router.push(href)}
            style={{ fontSize: 12, color: "#6366f1", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}
          >
            {linkText} <ExternalLink size={12} />
          </span>
        )}
      </div>
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

      {/* Hero: total spent this month (swapped from Resultado Parcial). */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 32, fontWeight: 300, color: token.colorText, lineHeight: 1 }}>
            {r(lastCurrentValue)}
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

/* ── Color helper: mix a hex color with white at given ratio ──── */
function mixWithWhite(hex: string, ratio: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * ratio);
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/* ── Bucket progress bar ──────────────────────────────────────── */
const BUCKET_COLORS: Record<string, { bar: string; bg: string }> = {
  custos_fixos: { bar: "#4096ff", bg: "rgba(64, 150, 255, 0.08)" },
  conforto: { bar: "#fa8c16", bg: "rgba(250, 140, 22, 0.08)" },
  liberdade_financeira: { bar: "#52c41a", bg: "rgba(82, 196, 26, 0.08)" },
};

function BucketRow({ bucket, provisioned = 0, pendingTargetPct, isPositiveBucket, onTargetChange, onDrilldown, splitOld }: {
  bucket: ReturnType<typeof getBucketProgress>[0];
  provisioned?: number;
  pendingTargetPct?: number;
  isPositiveBucket?: boolean;
  onTargetChange?: (pct: number) => void;
  onDrilldown?: () => void;
  splitOld?: { newAmount: number; oldAmount: number };
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

  // Optional split: old (ongoing installments) vs new (a vista + 1st installment)
  const splitOldFraction = splitOld && bucket.actualAmount > 0
    ? Math.min(Math.max(splitOld.oldAmount / bucket.actualAmount, 0), 1)
    : 0;
  const oldBarPct = actualBarPct * splitOldFraction;
  // Lighten / desaturate the bucket color for "old" portion (stronger contrast)
  const oldColor = mixWithWhite(colors.bar, 0.7);

  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
      {/* Name + values */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{bucket.name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{r(realAmount)}</span>
          {provisioned > 0 && (
            <>
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
              <span style={{ fontSize: 11, color: "#8c8c8c" }}>
                = <span style={{ color: token.colorText, fontWeight: 600 }}>{r(bucket.actualAmount)}</span>
              </span>
            </>
          )}
          <span style={{ fontSize: 11, color: "#8c8c8c" }}>
            / {r(bucket.targetAmount)}
          </span>
        </div>
      </div>

      {/* Bar */}
      <div style={{ position: "relative", height: 8, borderRadius: 4, background: token.colorFillSecondary, overflow: "hidden" }}>
        {splitOld ? (
          <>
            {/* Old portion (ongoing installments) — muted bucket color */}
            {oldBarPct > 0 && (
              <div
                style={{
                  position: "absolute", left: 0, top: 0, height: "100%",
                  width: `${oldBarPct}%`, background: oldColor,
                  transition: "width 0.4s ease",
                }}
              />
            )}
            {/* New portion (a vista + 1st installment) — full bucket color */}
            <div
              style={{
                position: "absolute", left: `${oldBarPct}%`, top: 0, height: "100%",
                width: `${actualBarPct - oldBarPct}%`, background: colors.bar,
                transition: "width 0.4s ease",
              }}
            />
            {/* Thin separator between old and new segments */}
            {oldBarPct > 0 && oldBarPct < actualBarPct && (
              <div
                style={{
                  position: "absolute", left: `${oldBarPct}%`, top: 0, height: "100%",
                  width: 1, background: token.colorBgContainer,
                  transform: "translateX(-0.5px)",
                }}
              />
            )}
            {/* Over-target overlay: paint the portion beyond targetMark in red */}
            {overBudget && !isPositiveBucket && (
              <div
                style={{
                  position: "absolute", left: `${targetMark}%`, top: 0, height: "100%",
                  width: `${actualBarPct - targetMark}%`, background: overflowColor,
                  transition: "width 0.4s ease",
                }}
              />
            )}
          </>
        ) : (
          <>
            {/* Fill up to target */}
            <div
              style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${fillPct}%`, background: colors.bar,
                transition: "width 0.4s ease",
              }}
            />
            {/* Overflow */}
            {overBudget && (
              <div
                style={{
                  position: "absolute", left: `${fillPct}%`, top: 0, height: "100%",
                  width: `${overflowPct}%`, background: overflowColor,
                  transition: "width 0.4s ease",
                }}
              />
            )}
          </>
        )}
        {/* Provisioned segment in purple at the LEFT, on top of everything */}
        {provBarPct > 0 && (
          <div
            style={{
              position: "absolute", left: 0, top: 0, height: "100%",
              width: `${provBarPct}%`, background: "#722ed1",
              transition: "width 0.4s ease",
            }}
          />
        )}
      </div>

      {/* Target marker (outside overflow:hidden container, immediately under the bar) */}
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

      {/* Single line: % + antigo/novo at the start, disponivel + meta at the end */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: overBudget ? (isPositiveBucket ? "#1a7a0a" : "#ff4d4f") : underBudgetBad ? "#ff4d4f" : defaultColors.bar, fontWeight: 500 }}>
            {formatPercent(bucket.actualPct)}
          </span>
          {splitOld && bucket.actualAmount > 0 && (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: oldColor, display: "inline-block" }} />
                <span style={{ color: "#8c8c8c" }}>antigo</span>
                <span style={{ color: token.colorText, fontWeight: 600 }}>{r(splitOld.oldAmount)}</span>
                <span style={{ color: "#bfbfbf" }}>({formatPercent(bucket.actualAmount > 0 ? (splitOld.oldAmount / bucket.actualAmount) * 100 : 0)})</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: colors.bar, display: "inline-block" }} />
                <span style={{ color: "#8c8c8c" }}>novo</span>
                <span style={{ color: token.colorText, fontWeight: 600 }}>{r(splitOld.newAmount)}</span>
                <span style={{ color: "#bfbfbf" }}>({formatPercent(bucket.actualAmount > 0 ? (splitOld.newAmount / bucket.actualAmount) * 100 : 0)})</span>
              </span>
            </>
          )}
        </div>
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

  // Old (ongoing installments) amount per category — installmentNumber > 1, non-provisional
  const oldByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [name, cat] of Object.entries(data.expenses?.by_category ?? {})) {
      let sum = 0;
      for (const sub of Object.values(cat.subcategories)) {
        for (const tx of sub.transactions) {
          if ((tx as { provisional?: boolean }).provisional) continue;
          const total = tx.totalInstallments;
          const n = tx.installmentNumber;
          if (total && total >= 2 && n && n > 1) sum += tx.amount;
        }
      }
      if (sum > 0) map[name] = Math.round(sum * 100) / 100;
    }
    return map;
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

  // Read-only here; bucket targets are edited in the separate BudgetBucketsCard.
  const [customPcts] = useState<Record<string, number>>(() => {
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
      const oldAmount = b.key === "liberdade_financeira"
        ? 0
        : Math.round(b.categories.reduce((s, c) => s + (oldByCat[c] ?? 0), 0) * 100) / 100;
      const newAmount = Math.max(Math.round((actualAmount - oldAmount) * 100) / 100, 0);
      return {
        ...b,
        targetPct,
        targetAmount,
        actualAmount,
        actualPct,
        delta: Math.round((actualPct - targetPct) * 100) / 100,
        provisioned,
        oldAmount,
        newAmount,
      };
    });
  }, [data, customPcts, income, net, provisionedByCat, oldByCat]);

  // "Acima do orçamento" applies only to the spending buckets (custos_fixos, conforto).
  // Liberdade financeira is the savings destination — exceeding its target is GOOD, not
  // overspending, so it must not count toward the overage.
  //
  // Buckets are separate envelopes, so one can sit over its target while another still has
  // room. Collapsing to a single over/available flag hides that: a bucket overage would
  // read as "acima do orçamento" even when the other bucket has plenty left. Instead we
  // surface the NET position across the spending buckets (available − overspent): positive
  // means there's room left overall, negative means the combined spend is over budget. When
  // the state is mixed (some room AND some overage) we also show the breakdown.
  const spendingBuckets = buckets.filter((b) => b.key !== "liberdade_financeira");
  const totalAvailable = Math.round(spendingBuckets.reduce((s, b) => s + Math.max(b.targetAmount - b.actualAmount, 0), 0) * 100) / 100;
  const totalOverspent = Math.round(spendingBuckets.reduce((s, b) => s + Math.max(b.actualAmount - b.targetAmount, 0), 0) * 100) / 100;
  const netBucketBalance = Math.round((totalAvailable - totalOverspent) * 100) / 100;
  const isOverBudget = netBucketBalance < -0.01;
  const allBucketsFull = Math.abs(netBucketBalance) <= 0.01;
  // Spending buckets that individually blew past their target — named in a warning so the
  // green net headline doesn't hide that one envelope is over.
  const overBuckets = spendingBuckets.filter((b) => b.actualAmount - b.targetAmount > 0.01);

  // Pending (not-yet-posted) transactions still on open card bills. While any remain, the
  // partial result can still shift, so we surface a top-right warning on the card.
  const pendingCount = useMemo(
    () =>
      (data.transactions ?? []).filter(
        (t) => (t as { status?: string }).status === "pending" && !(t as { provisional?: boolean }).provisional
      ).length,
    [data]
  );

  return (
    <VisorCard>
      <SectionHead
        title="Resultado Parcial"
        linkText="fluxo de caixa"
        href="/cashflow"
        extra={
          pendingCount > 0 ? (
            <span
              title={`${pendingCount} transação(ões) ainda pendente(s) — fatura em aberto; os valores podem mudar`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: 600, color: "#d46b08",
                background: "rgba(250,140,22,0.12)", border: "1px solid rgba(250,140,22,0.35)",
                borderRadius: 6, padding: "1px 7px", lineHeight: "16px",
              }}
            >
              <span aria-hidden>⚠</span>
              {pendingCount} pendente{pendingCount > 1 ? "s" : ""}
            </span>
          ) : undefined
        }
      />

      {/* Big value: net balance across spending buckets (available − overspent). */}
      <div style={{ marginBottom: 4, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 32, fontWeight: 300, color: (isOverBudget || allBucketsFull) ? "#ff4d4f" : "#52c41a", lineHeight: 1 }}>
          {allBucketsFull ? r(0) : r(Math.abs(netBucketBalance))}
        </span>
        <span style={{ fontSize: 15, color: "#8c8c8c" }}>
          {isOverBudget ? "acima do orcamento dos buckets" : allBucketsFull ? "buckets esgotados" : "saldo nos buckets"}
        </span>
      </div>
      {/* Warning when a spending bucket is over target, even if the net is still positive. */}
      {overBuckets.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 12, color: "#ff4d4f" }}>
          <span aria-hidden>⚠</span>
          <span>
            {overBuckets.map((b) => `${b.name} ${r(Math.round((b.actualAmount - b.targetAmount) * 100) / 100)} acima do alvo`).join(" · ")}
          </span>
        </div>
      )}
      {/* Secondary line: total spent this month (real + provisioned) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 13, color: "#8c8c8c", flexWrap: "wrap" }}>
        gasto:
        <span style={{ color: token.colorText, fontWeight: 600 }}>{r(realExpenses)}</span>
        {provisionedTotal > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600, lineHeight: 1.4,
            color: "#722ed1",
            background: "rgba(114,46,209,0.12)",
            border: "1px solid rgba(114,46,209,0.3)",
            borderRadius: 4,
            padding: "1px 6px",
          }}>
            + {r(provisionedTotal)} prov.
          </span>
        )}
        <span style={{ color: "#8c8c8c" }}>
          = <span style={{ color: token.colorText, fontWeight: 600 }}>{r(expenses)}</span>
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
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Receita</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{r(income)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Gasto</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{r(realExpenses)}</span>
            {provisionedTotal > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 600, lineHeight: 1.4,
                color: "#722ed1",
                background: "rgba(114,46,209,0.12)",
                border: "1px solid rgba(114,46,209,0.3)",
                borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
              }}>
                +{r(provisionedTotal)} prov.
              </span>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>Net</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: net < 0 ? "#ff4d4f" : token.colorText }}>{r(net)}</span>
            {provisionedTotal > 0 && (() => {
              const netReal = income - realExpenses;
              return (
                <span style={{
                  fontSize: 10, fontWeight: 600, lineHeight: 1.4,
                  color: netReal < 0 ? "#ff4d4f" : "#52c41a",
                  background: netReal < 0 ? "rgba(255,77,79,0.12)" : "rgba(82,196,26,0.12)",
                  border: `1px solid ${netReal < 0 ? "rgba(255,77,79,0.3)" : "rgba(82,196,26,0.3)"}`,
                  borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
                }}>
                  {r(netReal)} s/ prov.
                </span>
              );
            })()}
          </div>
        </div>
      </div>

    </VisorCard>
  );
}

/* ── Buckets (orçamento por bucket) ───────────────────────────── */
function BudgetBucketsCard({ data }: { data: BudgetData }) {
  const { redacted } = useRedact();
  const summary = getBudgetSummary(data);
  const income = summary.total_income;
  const net = summary.net;

  // Old (ongoing installments) amount per category — installmentNumber > 1, non-provisional
  const oldByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [name, cat] of Object.entries(data.expenses?.by_category ?? {})) {
      let sum = 0;
      for (const sub of Object.values(cat.subcategories)) {
        for (const tx of sub.transactions) {
          if ((tx as { provisional?: boolean }).provisional) continue;
          const total = tx.totalInstallments;
          const n = tx.installmentNumber;
          if (total && total >= 2 && n && n > 1) sum += tx.amount;
        }
      }
      if (sum > 0) map[name] = Math.round(sum * 100) / 100;
    }
    return map;
  }, [data]);

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
      const actualAmount = b.key === "liberdade_financeira" ? Math.max(net, 0) : b.actualAmount;
      const actualPct = income > 0 ? Math.round((actualAmount / income) * 10000) / 100 : 0;
      const provisioned = b.key === "liberdade_financeira"
        ? 0
        : Math.round(b.categories.reduce((s, c) => s + (provisionedByCat[c] ?? 0), 0) * 100) / 100;
      const oldAmount = b.key === "liberdade_financeira"
        ? 0
        : Math.round(b.categories.reduce((s, c) => s + (oldByCat[c] ?? 0), 0) * 100) / 100;
      const newAmount = Math.max(Math.round((actualAmount - oldAmount) * 100) / 100, 0);
      return {
        ...b, targetPct, targetAmount, actualAmount, actualPct,
        delta: Math.round((actualPct - targetPct) * 100) / 100,
        provisioned, oldAmount, newAmount,
      };
    });
  }, [data, customPcts, income, net, provisionedByCat, oldByCat]);

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
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8c8c8c" }}>
          Buckets
        </span>
        <Info size={13} color="#bfbfbf" />
        {!pendingValid && (
          <span style={{ fontSize: 10, color: "#ff4d4f", fontWeight: 500, marginLeft: 4 }}>
            soma {pendingSum}% (deve ser 100%)
          </span>
        )}
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
          splitOld={(b.key === "conforto" || b.key === "custos_fixos") && (b.oldAmount > 0 || b.newAmount > 0)
            ? { newAmount: b.newAmount, oldAmount: b.oldAmount }
            : undefined}
        />
      ))}

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
  const isMobile = useIsMobile();
  const catGrid = isMobile ? "1fr auto 28px" : "1fr 150px 90px 90px 32px";
  const subGrid = isMobile ? "1fr auto 28px" : "1fr 150px 90px 90px 32px";
  const txGrid = isMobile ? "1fr auto" : "1fr 150px 90px 90px 32px";
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
          gridTemplateColumns: catGrid,
          gap: isMobile ? 8 : 12,
          alignItems: "center",
          padding: isMobile ? "10px 0 10px 8px" : "9px 0 9px 20px",
          cursor: "pointer",
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: "#8c8c8c", transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "rotate(0)", flexShrink: 0 }}>&#9654;</span>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{emoji}</span>
          <span style={{
            fontSize: 13, fontWeight: 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
          }}>{category}</span>
          <span style={{ fontSize: 11, color: "#bfbfbf", flexShrink: 0 }}>({subcategories.length})</span>
        </div>
        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{r(amount)}</span>
          <div style={{ fontSize: 10, color: "#8c8c8c" }}>
            {isMobile ? (
              variation != null ? (
                <span style={{ color: variation > 0 ? "#ff4d4f" : variation < 0 ? "#52c41a" : "#8c8c8c" }}>
                  {variation >= 0 ? "+" : ""}{variation.toFixed(0)}%
                </span>
              ) : "—"
            ) : (
              <>
                {bucketTotal > 0 ? formatPercent(Math.round((amount / bucketTotal) * 10000) / 100) : "0%"} bucket
                {" · "}
                {totalExpenses > 0 ? formatPercent(Math.round((amount / totalExpenses) * 10000) / 100) : "0%"} total
              </>
            )}
          </div>
        </div>
        {!isMobile && (
          <>
            <div style={{ textAlign: "center" }}>
              {variation != null ? <PercentChange value={variation} invert size="small" /> : <span style={{ fontSize: 12, color: "#bfbfbf" }}>--</span>}
            </div>
            <span style={{ fontSize: 12, color: "#8c8c8c", textAlign: "right" }}>
              {previousAmount != null ? r(previousAmount) : "--"}
            </span>
          </>
        )}
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
                gridTemplateColumns: subGrid,
                gap: isMobile ? 8 : 12,
                alignItems: "center",
                padding: isMobile ? "8px 0 8px 24px" : "7px 0 7px 44px",
                cursor: "pointer",
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillQuaternary,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 9, color: "#bfbfbf", transition: "transform 0.2s", transform: subExpanded ? "rotate(90deg)" : "rotate(0)", flexShrink: 0 }}>&#9654;</span>
                <span style={{
                  fontSize: 12, fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                }}>{sub.name}</span>
                <span style={{ fontSize: 10, color: "#bfbfbf", flexShrink: 0 }}>({sub.transactions.length})</span>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{r(sub.total)}</span>
                {!isMobile && (
                  <div style={{ fontSize: 9, color: "#8c8c8c" }}>
                    {amount > 0 ? formatPercent(Math.round((sub.total / amount) * 10000) / 100) : "0%"} cat
                    {" · "}
                    {totalExpenses > 0 ? formatPercent(Math.round((sub.total / totalExpenses) * 10000) / 100) : "0%"} total
                  </div>
                )}
              </div>
              {!isMobile && (
                <>
                  <div style={{ textAlign: "center" }}>
                    {sub.variation != null ? <PercentChange value={sub.variation} invert size="small" /> : <span style={{ fontSize: 12, color: "#bfbfbf" }}>--</span>}
                  </div>
                  <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>
                    {sub.prevTotal != null ? r(sub.prevTotal) : "--"}
                  </span>
                </>
              )}
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
                      gridTemplateColumns: isMobile ? "1fr auto 28px" : "1fr 150px 90px 90px 32px",
                      gap: isMobile ? 8 : 12,
                      alignItems: "center",
                      padding: isMobile ? "6px 0 6px 36px" : "5px 0 5px 64px",
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      background: checkedTxs.has(tx._key) ? "rgba(99,102,241,0.06)" : token.colorFillQuaternary,
                    }}
                  >
                    <span style={{ fontSize: 12, color: token.colorTextSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                      {tx.description}
                      {tx.provisional && (
                        <span style={{ fontSize: 9, background: "rgba(114,46,209,0.1)", color: "#722ed1", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>
                          Prov
                        </span>
                      )}
                    </span>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 12 }}>{r(tx.amount)}</span>
                      {isMobile && (
                        <div style={{ fontSize: 10, color: "#8c8c8c" }}>
                          {tx.holder}{tx.date ? ` · ${tx.date.split("-")[2]}/${tx.date.split("-")[1]}` : ""}
                        </div>
                      )}
                    </div>
                    {!isMobile && (
                      <>
                        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "center" }}>
                          {tx.holder}
                        </span>
                        <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>
                          {tx.date ? `${tx.date.split("-")[2]}/${tx.date.split("-")[1]}` : "--"}
                        </span>
                      </>
                    )}
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
  const isMobile = useIsMobile();
  const headerGrid = isMobile ? "1fr auto 32px" : "1fr 150px 90px 90px 32px";
  const bucketGrid = isMobile ? "1fr auto 32px" : "1fr 150px 90px 90px 32px";
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
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: isMobile ? "flex-start" : "center",
        marginBottom: 12,
        flexDirection: isMobile ? "column" : "row",
        gap: isMobile ? 8 : 0,
      }}>
        <SectionHead title="Categorias" />
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          flexWrap: "wrap",
          width: isMobile ? "100%" : undefined,
        }}>
          <Segmented
            size="small"
            value={provFilter}
            onChange={(v) => setProvFilter(v as ProvFilter)}
            options={[
              { label: "Todos", value: "all" },
              { label: "Prov", value: "only" },
              { label: "Real", value: "exclude" },
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

      {/* Column headers — desktop only */}
      {!isMobile && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: headerGrid,
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
      )}

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
                gridTemplateColumns: bucketGrid,
                gap: isMobile ? 8 : 12,
                alignItems: "center",
                padding: "12px 0",
                cursor: "pointer",
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: bucket.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "#8c8c8c", transition: "transform 0.2s", transform: isCollapsed ? "rotate(0)" : "rotate(90deg)", flexShrink: 0 }}>&#9654;</span>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                }}>{bucket.name}</span>
                <span style={{ fontSize: 11, color: "#8c8c8c", flexShrink: 0 }}>({bucket.categories.length})</span>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{r(filteredBucketTotal)}</span>
                <div style={{ fontSize: 10, color: "#8c8c8c" }}>
                  {catTotalExpenses > 0 ? formatPercent(Math.round((filteredBucketTotal / catTotalExpenses) * 10000) / 100) : "0%"} do total
                </div>
              </div>
              {!isMobile && (
                <>
                  <span />
                  <span />
                </>
              )}
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
  const isMobile = useIsMobile();

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
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 14, minWidth: 0, flex: 1 }}>
                {isOrphan ? (
                  <div style={{
                    width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: isMobile ? 16 : 20,
                    background: "rgba(114,46,209,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <span style={{ fontSize: isMobile ? 16 : 18 }}>&#10024;</span>
                  </div>
                ) : (
                  <NuLogo size={isMobile ? 32 : 40} />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                    <span style={{
                      fontSize: 14, fontWeight: 600, textTransform: "capitalize",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                    }}>
                      {acc.holder}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      background: badgeBg, color: badgeFg, flexShrink: 0,
                    }}>
                      {badgeText}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 12, color: "#8c8c8c", marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {isOrphan ? "Previsto ate o fim do mes" : `${acc.accountType === "cc" ? "Fatura" : "Conta"} · ${acc.accountNumber}`}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
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

/* ── Installment classification (à vista / parcela nova / parcela antiga) ── */
type InstGroupKey = "antiga" | "nova" | "avista" | "prov";

const INST_GROUP_META: Record<InstGroupKey, { label: string; color: string; hint: string }> = {
  antiga: { label: "Parcela antiga", color: "#8c8c8c", hint: "Iniciadas em meses anteriores" },
  nova:   { label: "Parcela nova",   color: "#722ed1", hint: "1a parcela iniciada este mes" },
  avista: { label: "A vista",        color: "#4096ff", hint: "Compra unica, sem parcelamento" },
  prov:   { label: "Provisionado",   color: "#fa8c16", hint: "Estimativa — ainda nao lancado" },
};
const INST_GROUP_ORDER: InstGroupKey[] = ["antiga", "nova", "avista", "prov"];

function classifyInstallment(tx: Transaction): InstGroupKey {
  if (tx.provisional) return "prov";
  const total = tx.totalInstallments;
  const n = tx.installmentNumber;
  if (total && total >= 2 && n) return n === 1 ? "nova" : "antiga";
  return "avista";
}

/* ── Per-category installment tree (old vs new installments) ───── */
function CategoryInstallmentTree({ transactions, redacted }: { transactions: Transaction[]; redacted: boolean }) {
  const { token } = theme.useToken();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);
  const [openGroups, setOpenGroups] = useState<Set<InstGroupKey>>(new Set());
  const toggleGroup = (k: InstGroupKey) =>
    setOpenGroups(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const { groups, total } = useMemo(() => {
    const g: Record<InstGroupKey, { amount: number; txs: Transaction[] }> = {
      antiga: { amount: 0, txs: [] }, nova: { amount: 0, txs: [] },
      avista: { amount: 0, txs: [] }, prov: { amount: 0, txs: [] },
    };
    for (const tx of transactions) {
      const k = classifyInstallment(tx);
      g[k].amount = Math.round((g[k].amount + tx.amount) * 100) / 100;
      g[k].txs.push(tx);
    }
    for (const k of INST_GROUP_ORDER) g[k].txs.sort((a, b) => b.amount - a.amount);
    const sum = INST_GROUP_ORDER.reduce((s, k) => s + g[k].amount, 0);
    return { groups: g, total: Math.round(sum * 100) / 100 };
  }, [transactions]);

  const visible = INST_GROUP_ORDER.filter(k => groups[k].txs.length > 0);
  if (visible.length === 0) return null;

  return (
    <div style={{
      padding: "8px 0 12px 48px",
      background: token.colorFillQuaternary,
      borderBottom: `1px solid ${token.colorBorderSecondary}`,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      {visible.map((k) => {
        const meta = INST_GROUP_META[k];
        const grp = groups[k];
        const pct = total !== 0 ? (grp.amount / total) * 100 : 0;
        const isOpen = openGroups.has(k);
        return (
          <div key={k}>
            {/* Group header */}
            <div
              onClick={() => toggleGroup(k)}
              style={{
                display: "grid", gridTemplateColumns: "16px 1fr auto 56px", gap: 10, alignItems: "center",
                padding: "5px 12px 5px 0", cursor: "pointer",
              }}
            >
              <span style={{
                fontSize: 9, color: "#8c8c8c", justifySelf: "center",
                transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0)",
              }}>&#9654;</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: token.colorText }}>{meta.label}</span>
                <span style={{ fontSize: 10, color: "#bfbfbf" }}>({grp.txs.length})</span>
                <span style={{ fontSize: 10, color: "#8c8c8c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.hint}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: token.colorText, whiteSpace: "nowrap" }}>{r(grp.amount)}</span>
              <span style={{
                fontSize: 10, fontWeight: 500, color: meta.color, justifySelf: "end",
                padding: "1px 6px", borderRadius: 4, background: `${meta.color}1a`, minWidth: 44, textAlign: "center",
              }}>
                {formatPercent(pct)}
              </span>
            </div>

            {/* Individual transactions */}
            {isOpen && (
              <div style={{ paddingLeft: 16, borderLeft: `2px solid ${meta.color}33`, marginLeft: 7, marginBottom: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                {grp.txs.map((tx, i) => {
                  const isInst = k === "antiga" || k === "nova";
                  return (
                    <div key={tx.id ?? `${tx.description}-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "2px 12px 2px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 11, color: token.colorText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description}</span>
                        {isInst && tx.totalInstallments && tx.installmentNumber && (
                          <span style={{ fontSize: 9, fontWeight: 600, color: meta.color, background: `${meta.color}1a`, borderRadius: 3, padding: "0 4px", flexShrink: 0, whiteSpace: "nowrap" }}>
                            {tx.installmentNumber}/{tx.totalInstallments}
                            {tx.totalInstallments - tx.installmentNumber > 0 ? ` · faltam ${tx.totalInstallments - tx.installmentNumber}` : " · ultima"}
                          </span>
                        )}
                        {tx.holder && <span style={{ fontSize: 9, color: "#bfbfbf", flexShrink: 0 }}>{tx.holder}</span>}
                      </div>
                      <span style={{ fontSize: 11, color: token.colorText, whiteSpace: "nowrap" }}>{r(tx.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Top 10 Categorias ───────────────────────────────────────── */
type TopCatView = "top10" | "highest" | "lowest";

function TopCategoriesCard({ data, previousData, allMonths }: { data: BudgetData; previousData: BudgetData | null; allMonths: BudgetData[] }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);
  const isMobile = useIsMobile();
  const gridCols = isMobile
    ? "24px 1fr auto 28px"
    : "28px 200px 110px 1fr 80px 100px 90px 32px 32px";
  const [checkedCats, setCheckedCats] = useState<Set<string>>(new Set());
  const [checkedTotal, setCheckedTotal] = useState(0);
  const [viewMode, setViewMode] = useState<TopCatView>("top10");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const toggleCatExpand = useCallback((name: string) => {
    setExpandedCats(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  }, []);
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

  // Flat transactions per category — feeds the installment tree (old/new parcelas)
  const catTxs = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    for (const [name, cat] of Object.entries(data.expenses?.by_category ?? {})) {
      const txs: Transaction[] = [];
      for (const sub of Object.values(cat.subcategories)) for (const tx of sub.transactions) txs.push(tx);
      map[name] = txs;
    }
    return map;
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
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: isMobile ? "flex-start" : "center",
        marginBottom: 12,
        flexDirection: isMobile ? "column" : "row",
        gap: isMobile ? 8 : 0,
      }}>
        <SectionHead title="Principais Categorias" />
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          flexWrap: "wrap",
          width: isMobile ? "100%" : undefined,
        }}>
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
            <List size={12} /> Comparar
          </span>
        </div>
      </div>

      {/* Column headers — desktop only */}
      {!isMobile && (
        <div style={{
          display: "grid", gridTemplateColumns: gridCols,
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
      )}

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

        if (isMobile) {
          return (
            <React.Fragment key={cat.name}>
            <div
              onClick={() => openDrilldown(cat.name)}
              style={{
                display: "grid", gridTemplateColumns: gridCols,
                gap: 8, alignItems: "center",
                padding: "12px 0",
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "center", fontWeight: 500 }}>{idx + 1}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span
                  onClick={(e) => { e.stopPropagation(); toggleCatExpand(cat.name); }}
                  style={{
                    fontSize: 9, color: "#8c8c8c", flexShrink: 0,
                    transition: "transform 0.2s", transform: expandedCats.has(cat.name) ? "rotate(90deg)" : "rotate(0)",
                  }}
                  title="parcelas"
                >&#9654;</span>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                <span style={{ fontSize: 14, flexShrink: 0 }}>{emoji}</span>
                <span style={{
                  fontSize: 12, fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  minWidth: 0,
                }}>
                  {cat.name}
                </span>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r(cat.total)}</div>
                {variation != null && (
                  <div style={{
                    fontSize: 10, fontWeight: 500,
                    color: isUp ? "#ff4d4f" : isDown ? "#52c41a" : "#8c8c8c",
                  }}>
                    {variation >= 0 ? "+" : ""}{variation.toFixed(0)}%
                  </div>
                )}
              </div>
              <span
                role="button"
                style={{
                  justifySelf: "center", color: "#8c8c8c",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 24, height: 24, borderRadius: 4,
                }}
              >
                <List size={14} />
              </span>
            </div>
            {expandedCats.has(cat.name) && (
              <CategoryInstallmentTree transactions={catTxs[cat.name] ?? []} redacted={redacted} />
            )}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={cat.name}>
          <div
            style={{
              display: "grid", gridTemplateColumns: gridCols,
              gap: 12, alignItems: "center",
              padding: "14px 0 14px 0",
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            {/* Number */}
            <span style={{ fontSize: 12, color: "#8c8c8c", textAlign: "center", fontWeight: 500 }}>{idx + 1}</span>
            {/* Chevron + dot + emoji + name + new tag */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 0 }}>
              <span
                onClick={() => toggleCatExpand(cat.name)}
                title="parcelas (antiga / nova / a vista)"
                style={{
                  fontSize: 10, color: "#8c8c8c", cursor: "pointer", flexShrink: 0,
                  transition: "transform 0.2s", transform: expandedCats.has(cat.name) ? "rotate(90deg)" : "rotate(0)",
                }}
              >&#9654;</span>
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
          {expandedCats.has(cat.name) && (
            <CategoryInstallmentTree transactions={catTxs[cat.name] ?? []} redacted={redacted} />
          )}
          </React.Fragment>
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

  // Multi-select of category rows → totalizer footer
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const toggleSel = useCallback((cat: string) => {
    setSelectedCats(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
  }, []);
  useEffect(() => { if (!open) setSelectedCats(new Set()); }, [open]);

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
              }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Checkbox
                    checked={grid.categories.length > 0 && selectedCats.size === grid.categories.length}
                    indeterminate={selectedCats.size > 0 && selectedCats.size < grid.categories.length}
                    onChange={(e) => setSelectedCats(e.target.checked ? new Set(grid.categories) : new Set())}
                  />
                  Categoria
                </span>
              </th>
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
              const isSel = selectedCats.has(cat);
              const selBg = "rgba(99,102,241,0.10)";
              return (
                <tr key={cat}>
                  <td
                    onClick={() => toggleSel(cat)}
                    style={{
                      position: "sticky", left: 0, zIndex: 1,
                      background: isSel ? selBg : token.colorBgElevated, padding: "6px 10px",
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      whiteSpace: "nowrap", cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <Checkbox
                        checked={isSel}
                        onChange={() => toggleSel(cat)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span><span style={{ marginRight: 6 }}>{emoji}</span>{cat}</span>
                    </span>
                  </td>
                  {months.map((m, i) => {
                    const v = vals[i];
                    return (
                      <td key={m.month} style={{
                        padding: "6px 10px", textAlign: "right",
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        background: isSel ? selBg : cellBg(v, max),
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
          {selectedCats.size > 0 && (() => {
            const selMonthVals = months.map((m) =>
              [...selectedCats].reduce((s, c) => s + (grid.perMonth[m.month][c] ?? 0), 0)
            );
            const selSum = Math.round(selMonthVals.reduce((s, v) => s + v, 0) * 100) / 100;
            const selNz = selMonthVals.filter((v) => v !== 0).length;
            const selAvg = selNz > 0 ? selSum / selNz : 0;
            const color = "#6366f1";
            const bg = "#eef0fe";
            const cell = (extra: React.CSSProperties = {}): React.CSSProperties => ({
              padding: "10px", textAlign: "right", borderTop: `2px solid ${color}`,
              background: bg, color, fontWeight: 700, whiteSpace: "nowrap",
              position: "sticky", bottom: 0, zIndex: 2, ...extra,
            });
            return (
              <tfoot>
                <tr>
                  <td style={cell({ textAlign: "left", left: 0, zIndex: 4 })}>
                    &Sigma; {selectedCats.size} {selectedCats.size === 1 ? "categoria" : "categorias"}
                  </td>
                  {selMonthVals.map((v, i) => (
                    <td key={months[i].month} style={cell(months[i].month === currentMonth ? { fontWeight: 800 } : {})}>
                      {v === 0 ? "—" : r(v)}
                    </td>
                  ))}
                  <td style={cell()}>{r(selAvg)}</td>
                  <td style={cell()}>{r(selSum)}</td>
                </tr>
              </tfoot>
            );
          })()}
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
  const isMobile = useIsMobile();
  const instGrid = isMobile ? "1fr auto" : "1fr 90px 130px 80px";
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
      <div style={{ display: "flex", gap: isMobile ? 16 : 32, marginBottom: 20, flexWrap: "wrap" }}>
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

      {/* Column headers — desktop only */}
      {!isMobile && (
        <div style={{
          display: "grid", gridTemplateColumns: instGrid,
          gap: 12, padding: "0 0 8px 0",
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}>
          <span style={{ fontSize: 11, color: "#8c8c8c" }}>Descricao</span>
          <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>Valor</span>
          <span style={{ fontSize: 11, color: "#8c8c8c" }}>Progresso</span>
          <span style={{ fontSize: 11, color: "#8c8c8c", textAlign: "right" }}>Status</span>
        </div>
      )}

      {/* Tree groups */}
      {groups.map(group => {
        const isExpanded = forceExpand === true ? true : forceExpand === false ? false : !collapsed.has(group.key);
        return (
          <div key={group.key}>
            {/* Group header */}
            <div
              onClick={() => toggleGroup(group.key)}
              style={{
                display: "grid", gridTemplateColumns: instGrid,
                gap: isMobile ? 8 : 12, alignItems: "center", padding: "12px 0",
                cursor: "pointer", borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: group.dotColor, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "#8c8c8c", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0)", flexShrink: 0 }}>&#9654;</span>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: group.color,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                }}>{group.label}</span>
                <span style={{ fontSize: 11, color: "#8c8c8c", flexShrink: 0 }}>({group.items.length})</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, textAlign: "right" }}>{r(group.total)}</span>
              {!isMobile && (
                <>
                  <span />
                  <span />
                </>
              )}
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
                    display: "grid", gridTemplateColumns: instGrid,
                    gap: isMobile ? 8 : 12, alignItems: "center",
                    padding: isMobile ? "8px 0 8px 16px" : "9px 0 9px 28px",
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorFillQuaternary,
                  }}
                >
                  {/* Description */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", minWidth: 0 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{emoji}</span>
                    <div style={{ overflow: "hidden", minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.description}
                      </div>
                      <div style={{ fontSize: 11, color: "#8c8c8c" }}>
                        {item.holder} · {item.installmentNumber}/{item.totalInstallments}
                        {item.remaining === 0
                          ? " · última"
                          : item.remaining <= 2
                          ? ` · ${item.remaining === 1 ? "falta 1" : `faltam ${item.remaining}`}`
                          : ` · ${item.remaining} restantes`}
                      </div>
                    </div>
                  </div>

                  {/* Amount */}
                  <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right" }}>{r(item.amount)}</span>

                  {!isMobile && (
                    <>
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
                    </>
                  )}
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
  const isMobile = useIsMobile();

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

  // Highlighted categories: transient hover (single) overrides pinned set (multi).
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [pinnedCats, setPinnedCats] = useState<Set<string>>(new Set());
  const effectiveHighlights = useMemo(() => {
    if (hoveredCat) return new Set([hoveredCat]);
    return pinnedCats;
  }, [hoveredCat, pinnedCats]);
  const hasHighlight = effectiveHighlights.size > 0;
  const togglePin = useCallback((cat: string) => {
    setPinnedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);
  const clearPins = useCallback(() => setPinnedCats(new Set()), []);

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
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 380px", gap: 16, marginTop: 12, alignItems: "stretch" }}>
        <div style={{ height: isMobile ? 320 : 520 }}>
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
                const isHighlighted = effectiveHighlights.has(cat);
                const dimmed = hasHighlight && !isHighlighted;
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
          <div style={{ display: "flex", gap: 10, fontSize: 11, marginBottom: 6, flexWrap: "wrap" }}>
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
            {pinnedCats.size > 0 && (
              <span
                onClick={clearPins}
                style={{ color: "#fa541c", cursor: "pointer", textDecoration: "underline" }}
              >
                limpar destaques ({pinnedCats.size})
              </span>
            )}
          </div>
          <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, marginBottom: 4 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {topCategories.map((cat, i) => {
              const { emoji } = getCategoryMeta(cat);
              const color = PALETTE[i % PALETTE.length];
              const total = totalsMap[cat] ?? 0;
              const isHidden = hidden.has(cat);
              const isHighlighted = effectiveHighlights.has(cat);
              const isPinned = pinnedCats.has(cat);
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

/* ── Evolucao dos Buckets ao longo do tempo ───────────────────── */
function BucketsTrendCard({ allMonths }: { allMonths: BudgetData[] }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);

  const [view, setView] = useState<"pct" | "amount">("pct");

  const monthLabels = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const labelOf = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return `${monthLabels[(mm ?? 1) - 1]}/${String(y).slice(2)}`;
  };

  const chartData = useMemo(() => {
    const sorted = [...allMonths].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
    return sorted.map((m) => {
      const summary = getBudgetSummary(m);
      const income = summary.total_income;
      const buckets = getBucketProgress(m);
      const pick = (key: string) => buckets.find((b) => b.key === key);
      const cf = pick("custos_fixos");
      const cnf = pick("conforto");
      const lf = pick("liberdade_financeira");
      const lfActualAmount = Math.max(summary.net, 0);
      const lfActualPct = income > 0 ? Math.round((lfActualAmount / income) * 10000) / 100 : 0;
      return {
        month: m.month,
        label: labelOf(m.month),
        custos_fixos_amount: cf?.actualAmount ?? 0,
        custos_fixos_pct: cf?.actualPct ?? 0,
        conforto_amount: cnf?.actualAmount ?? 0,
        conforto_pct: cnf?.actualPct ?? 0,
        liberdade_amount: lfActualAmount,
        liberdade_pct: lfActualPct,
      };
    });
  }, [allMonths]);

  const isPct = view === "pct";
  const series = [
    { key: "custos_fixos", name: "Custos Fixos", color: "#4096ff", target: 30 },
    { key: "conforto", name: "Conforto", color: "#fa8c16", target: 25 },
    { key: "liberdade_financeira", name: "Liberdade Financeira", color: "#52c41a", target: 45 },
  ];

  return (
    <VisorCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <SectionHead title="Evolucao dos Buckets" />
        <Segmented
          size="small"
          value={view}
          onChange={(v) => setView(v as "pct" | "amount")}
          options={[
            { label: "% receita", value: "pct" },
            { label: "Valor", value: "amount" },
          ]}
        />
      </div>

      <div style={{ height: 360, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: 10, right: 20, top: 16, bottom: 5 }}>
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
              tickFormatter={(v) =>
                redacted ? "•••" : isPct ? `${v}%` : `R$ ${(v / 1000).toFixed(0)}k`
              }
              width={70}
            />
            <Tooltip
              formatter={(v: number, name: string) => {
                if (isPct) return [`${(v as number).toFixed(1)}%`, name];
                return [r(v), name];
              }}
              labelFormatter={(l) => `Mes: ${l}`}
              contentStyle={{
                background: token.colorBgElevated,
                border: "none",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                fontSize: 12,
              }}
              labelStyle={{ color: token.colorText, fontWeight: 600, marginBottom: 4 }}
            />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="circle"
              wrapperStyle={{ fontSize: 12 }}
            />
            {isPct && series.map((s) => (
              <ReferenceLine
                key={`t-${s.key}`}
                y={s.target}
                stroke={s.color}
                strokeDasharray="3 3"
                strokeOpacity={0.45}
              />
            ))}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                name={s.name}
                dataKey={isPct ? `${s.key === "liberdade_financeira" ? "liberdade" : s.key}_pct` : `${s.key === "liberdade_financeira" ? "liberdade" : s.key}_amount`}
                stroke={s.color}
                strokeWidth={2.5}
                dot={{ r: 3, fill: s.color }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </VisorCard>
  );
}

/* ── Evolucao de Patrimonio ───────────────────────────────────── */
function WealthEvolutionCard({ allMonths }: { allMonths: BudgetData[] }) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();
  const r = (v: number) => redacted ? REDACTED : formatBRL(v);

  const [view, setView] = useState<"cumulative" | "monthly">("cumulative");

  const monthLabels = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const labelOf = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return `${monthLabels[(mm ?? 1) - 1]}/${String(y).slice(2)}`;
  };

  const chartData = useMemo(() => {
    const sorted = [...allMonths].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
    let cumulative = 0;
    return sorted.map((m) => {
      const summary = getBudgetSummary(m);
      const monthly = Math.round(summary.net * 100) / 100;
      cumulative += monthly;
      return {
        month: m.month,
        label: labelOf(m.month),
        monthly,
        cumulative: Math.round(cumulative * 100) / 100,
      };
    });
  }, [allMonths]);

  const totalCumulative = chartData.length > 0 ? chartData[chartData.length - 1].cumulative : 0;
  const firstCumulative = chartData.length > 0 ? chartData[0].cumulative : 0;
  const delta = totalCumulative - firstCumulative;

  const dataKey = view === "cumulative" ? "cumulative" : "monthly";
  const seriesLabel = view === "cumulative" ? "Patrimonio acumulado" : "Patrimonio mensal";

  return (
    <VisorCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <SectionHead title="Evolucao de Patrimonio" />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Segmented
            size="small"
            value={view}
            onChange={(v) => setView(v as "cumulative" | "monthly")}
            options={[
              { label: "Acumulado", value: "cumulative" },
              { label: "Mensal", value: "monthly" },
            ]}
          />
          {view === "cumulative" && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: totalCumulative >= 0 ? "#52c41a" : "#ff4d4f" }}>
                {r(totalCumulative)}
              </span>
              {chartData.length > 1 && (
                <span style={{ fontSize: 12, color: delta >= 0 ? "#52c41a" : "#ff4d4f", fontWeight: 500 }}>
                  ({delta >= 0 ? "+" : ""}{r(delta)})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 360, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ left: 10, right: 20, top: 16, bottom: 5 }}>
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
              formatter={(v: number) => [r(v), seriesLabel]}
              labelFormatter={(l) => `Mes: ${l}`}
              cursor={{ fill: "rgba(99,102,241,0.06)" }}
              contentStyle={{
                background: token.colorBgElevated,
                border: "none",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                fontSize: 12,
              }}
              labelStyle={{ color: token.colorText, fontWeight: 600, marginBottom: 4 }}
            />
            <ReferenceLine y={0} stroke="#bfbfbf" strokeDasharray="2 2" />
            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => {
                let isNegative: boolean;
                if (view === "cumulative") {
                  const prev = i > 0 ? chartData[i - 1].cumulative : 0;
                  isNegative = d.cumulative < 0 || d.cumulative < prev;
                } else {
                  isNegative = d.monthly < 0;
                }
                return (
                  <Cell key={d.month} fill={isNegative ? "rgba(255,77,79,0.55)" : "rgba(82,196,26,0.55)"} />
                );
              })}
              <LabelList
                dataKey={dataKey}
                position="top"
                style={{ fontSize: 11, fontWeight: 600, fill: "#8c8c8c" }}
                formatter={(v: number) => redacted ? "•••" : `R$ ${(v / 1000).toFixed(1)}k`}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </VisorCard>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */
export default function OverviewPage() {
  const { data: activeData, allMonths, loading, refresh } = useBudget();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const cols2 = isMobile ? "1fr" : "1fr 1fr";
  const colsLR = isMobile ? "1fr" : "1.3fr 0.7fr";
  const { refreshing } = useRefresh();
  useRegisterRefresh(refresh, [refresh]);

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

  if (loading && !activeData) return null;
  if (!data) return <EmptyState />;

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: isMobile ? "flex-start" : "center",
        marginBottom: isMobile ? 16 : 24,
        flexDirection: isMobile ? "column" : "row",
        gap: isMobile ? 12 : 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Title level={4} style={{ margin: 0, fontWeight: 400 }}>Visao Geral</Title>
        </div>
        <div style={isMobile ? { width: "100%", overflowX: "auto" } : undefined}>
          <MonthSelector months={monthPills} selected={data.month} onSelect={setSelectedMonth} />
        </div>
      </div>

      {/* Row 1: col 1 = Resultado Parcial + Buckets (stacked); col 2 = Ritmo de Gastos */}
      <div style={{ display: "grid", gridTemplateColumns: cols2, gap: 16, marginBottom: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <PartialResultCard data={data} previousData={previousData} />
          <BudgetBucketsCard data={data} />
        </div>
        <SpendingPaceCard data={data} previousData={previousData} allMonths={allMonths} />
      </div>

      {/* Row 2: Principais Categorias + Visao de Contas */}
      <div style={{ display: "grid", gridTemplateColumns: colsLR, gap: 16, marginTop: 16, alignItems: "stretch" }}>
        <TopCategoriesCard data={data} previousData={previousData} allMonths={allMonths} />
        <AccountBillsCard data={data} />
      </div>

      {/* Parcelas + Composicao do Mes */}
      <div style={{ display: "grid", gridTemplateColumns: colsLR, gap: 16, marginTop: 16, alignItems: "stretch" }}>
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

      {/* Evolucao dos 3 buckets ao longo do tempo */}
      <div style={{ marginTop: 16 }}>
        <BucketsTrendCard allMonths={allMonths} />
      </div>

      {/* Evolucao de Patrimonio (acumulado da sobra mensal) */}
      <div style={{ marginTop: 16 }}>
        <WealthEvolutionCard allMonths={allMonths} />
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
