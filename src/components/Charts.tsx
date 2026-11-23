"use client";
import { useState, type ReactNode } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { Table2, BarChart3 } from "lucide-react";
import { Empty } from "./ui";

// Validated reference categorical palette (dataviz skill, light mode), fixed order.
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const GRID = "#e1e0d9"; const AXIS = "#898781"; const INK2 = "#52514e";
const tick = { fontSize: 11, fill: AXIS };

function TT({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
      <div className="mb-0.5 font-medium text-slate-800">{label}</div>
      {payload.map((p) => <div key={p.name} className="flex items-center gap-1.5" style={{ color: INK2 }}><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{payload.length > 1 && <span>{p.name}:</span>}<span className="font-semibold tabular-nums text-slate-900">{fmt ? fmt(p.value) : p.value.toLocaleString("en-IN")}</span></div>)}
    </div>
  );
}

export function ChartCard({ title, children, rows, cols, height = 240 }: { title: string; children: ReactNode; rows: Record<string, unknown>[]; cols: [string, string][]; height?: number }) {
  const [table, setTable] = useState(false);
  return (
    <div className="card">
      <div className="card-h"><span className="card-t">{title}</span><button className="btn-ghost btn-xs" onClick={() => setTable((t) => !t)} title={table ? "Show chart" : "Show table"}>{table ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}</button></div>
      <div className="p-3" style={{ minHeight: height }}>
        {!rows.length ? <Empty title="No data yet">Figures appear once records exist.</Empty> : table ? (
          <div className="max-h-[260px] overflow-auto"><table className="tbl"><thead><tr>{cols.map(([k, h]) => <th key={k}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([k]) => <td key={k} className="tabular-nums">{String(r[k] ?? "")}</td>)}</tr>)}</tbody></table></div>
        ) : <div style={{ height }}>{children}</div>}
      </div>
    </div>
  );
}

export function Bars({ data, x, y, horizontal, fmt, color = SERIES[0] }: { data: Record<string, unknown>[]; x: string; y: string; horizontal?: boolean; fmt?: (v: number) => string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 4, right: 12, left: horizontal ? 8 : -12, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid stroke={GRID} vertical={!!horizontal} horizontal={!horizontal} />
        {horizontal ? <><XAxis type="number" tick={tick} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={fmt} /><YAxis type="category" dataKey={x} tick={tick} width={120} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} /></>
          : <><XAxis dataKey={x} tick={tick} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} interval={0} angle={data.length > 6 ? -25 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 54 : 24} /><YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={fmt} /></>}
        <Tooltip content={<TT fmt={fmt} />} cursor={{ fill: "rgba(42,120,214,.06)" }} />
        <Bar dataKey={y} fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, x, series, fmt }: { data: Record<string, unknown>[]; x: string; series: { key: string; name: string }[]; fmt?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={x} tick={tick} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
        <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={fmt} />
        <Tooltip content={<TT fmt={fmt} />} cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: INK2 }} iconType="plainline" />}
        {series.map((s, i) => <Line key={s.key} dataKey={s.key} name={s.name} stroke={SERIES[i]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: SERIES[i] }} activeDot={{ r: 5 }} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GroupedBars({ data, x, series }: { data: Record<string, unknown>[]; x: string; series: { key: string; name: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 12, left: -12, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={x} tick={tick} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
        <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<TT />} cursor={{ fill: "rgba(42,120,214,.06)" }} />
        <Legend wrapperStyle={{ fontSize: 11, color: INK2 }} iconType="square" />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={22} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}
