"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CATEGORY_COLORS, fmtUSD0, monthLabel } from "@/lib/analytics";
import { Category } from "@/lib/types";

const AXIS = { stroke: "#383835", fontSize: 12, fill: "#898781" };

const tooltipStyle = {
  background: "#232322",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  fontSize: 13,
  color: "#fff",
};

/** Generic value-over-time area line. `x` should be display-ready labels. */
export function NetWorthLine({ points }: { points: { x: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3987e5" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#3987e5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2c2c2a" vertical={false} />
        <XAxis
          dataKey="x"
          tick={{ fontSize: 12, fill: "#898781" }}
          axisLine={{ stroke: AXIS.stroke }}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
          tick={{ fontSize: 12, fill: "#898781" }}
          axisLine={false}
          tickLine={false}
          width={48}
          domain={["dataMin - 2000", "dataMax + 2000"]}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtUSD0(Number(v)), "Net worth"]} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#3987e5"
          strokeWidth={2}
          fill="url(#nw)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const ALLOC_COLORS = ["#3987e5", "#199e70", "#c98500", "#9085e9", "#e66767", "#d55181", "#d95926", "#86b6ef"];

/** Portfolio allocation donut — slices get fixed palette slots in given order. */
export function AllocationDonut({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: { label: string; value: number }[];
  centerLabel: string;
  centerValue: string;
}) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius={70}
            outerRadius={95}
            paddingAngle={2}
            stroke="#1a1a19"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((s, i) => (
              <Cell key={s.label} fill={ALLOC_COLORS[i % ALLOC_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtUSD0(Number(v)), String(name)]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xs text-ink-muted">{centerLabel}</span>
        <span className="text-xl font-semibold tabular">{centerValue}</span>
      </div>
    </div>
  );
}

export const ALLOCATION_COLORS = ALLOC_COLORS;

export function CashFlowBars({
  data,
}: {
  data: { month: string; income: number; spend: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="#2c2c2a" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={monthLabel}
          tick={{ fontSize: 12, fill: "#898781" }}
          axisLine={{ stroke: AXIS.stroke }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`}
          tick={{ fontSize: 12, fill: "#898781" }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(l) => monthLabel(String(l))}
          formatter={(v, name) => [fmtUSD0(Number(v)), name === "income" ? "Income" : "Spending"]}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
        />
        <Bar dataKey="income" fill="#199e70" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
        <Bar dataKey="spend" fill="#3987e5" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpendingDonut({
  data,
  total,
}: {
  data: { category: Category; total: number }[];
  total: number;
}) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="total"
            nameKey="category"
            innerRadius={70}
            outerRadius={95}
            paddingAngle={2}
            stroke="#1a1a19"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.category} fill={CATEGORY_COLORS[d.category]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtUSD0(Number(v)), String(name)]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xs text-ink-muted">This month</span>
        <span className="text-xl font-semibold tabular">{fmtUSD0(total)}</span>
      </div>
    </div>
  );
}
