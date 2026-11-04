/**
 * The two charts of the package (spec 8): annual NOI and debt service on the summary page, and
 * the sources-and-uses donut on page 3. Inline SVG, no dependencies, categorical colors in fixed
 * slot order with a legend and direct labels so identity never rests on color alone.
 */
import type { AnnualRow, Line } from '@pencil/engine';
import { formatUsd } from './format';

const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / exp;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * exp;
}

function compactUsd(v: number): string {
  const abs = Math.abs(v);
  const s = abs >= 1e6 ? `$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M` : abs >= 1e3 ? `$${Math.round(abs / 1e3)}k` : `$${Math.round(abs)}`;
  return v < 0 ? `−${s}` : s;
}

export function NoiDebtServiceChart({ annual, width = 680, height = 200 }: { annual: AnnualRow[]; width?: number; height?: number }) {
  const rows = annual.filter((a) => !a.partial);
  const pad = { l: 44, r: 8, t: 14, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const maxV = niceMax(Math.max(1, ...rows.map((r) => Math.max(r.noi, r.debtService.total))));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxV);
  const groupW = w / Math.max(1, rows.length);
  const barW = Math.max(4, Math.min(18, (groupW - 8) / 2 - 2));
  const y = (v: number) => pad.t + h - (Math.max(0, v) / maxV) * h;
  const lastNoi = rows[rows.length - 1];
  return (
    <div>
      <div className="legend">
        <span>
          <span className="sw" style={{ background: SERIES[0] }} />
          Net operating income
        </span>
        <span>
          <span className="sw" style={{ background: SERIES[1] }} />
          Debt service
        </span>
      </div>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Annual net operating income and debt service over the hold">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="#ecebe7" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} fontSize={8} fill="#8a8884" textAnchor="end">
              {compactUsd(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x0 = pad.l + i * groupW + groupW / 2;
          const bars = [
            { v: r.noi, c: SERIES[0], x: x0 - barW - 1 },
            { v: r.debtService.total, c: SERIES[1], x: x0 + 1 },
          ];
          return (
            <g key={r.year}>
              {bars.map((b, j) => {
                const top = y(b.v);
                const bh = Math.max(0, pad.t + h - top);
                return bh > 0 ? <rect key={j} x={b.x} y={top} width={barW} height={bh} rx={2} fill={b.c} /> : null;
              })}
              <text x={x0} y={height - 8} fontSize={8} fill="#52514e" textAnchor="middle">
                {`Y${r.year}`}
              </text>
            </g>
          );
        })}
        {lastNoi && lastNoi.noi > 0 ? (
          <text x={pad.l + (rows.length - 1) * groupW + groupW / 2 - 1 - barW / 2} y={y(lastNoi.noi) - 4} fontSize={8} fill="#111" textAnchor="middle">
            {compactUsd(lastNoi.noi)}
          </text>
        ) : null}
        <line x1={pad.l} x2={width - pad.r} y1={pad.t + h} y2={pad.t + h} stroke="#d9d7d2" strokeWidth={1} />
      </svg>
    </div>
  );
}

export function SourcesDonut({ sources, size = 170 }: { sources: Line[]; size?: number }) {
  const total = sources.reduce((s, l) => s + Math.max(0, l.amount), 0);
  const r = size / 2 - 4;
  const inner = r * 0.58;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -Math.PI / 2;
  const slices = sources
    .filter((l) => l.amount > 0)
    .map((l, i) => {
      const frac = total > 0 ? l.amount / total : 0;
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      angle = a1;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, rad: number) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as const;
      const [x0, y0] = p(a0, r);
      const [x1, y1] = p(a1, r);
      const [xi0, yi0] = p(a0, inner);
      const [xi1, yi1] = p(a1, inner);
      const d = frac >= 0.9999
        ? `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} Z M ${cx + inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy} Z`
        : `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0} Z`;
      return { key: l.key, label: l.label, amount: l.amount, frac, d, color: SERIES[i % SERIES.length]! };
    });
  return (
    <div className="cols" style={{ alignItems: 'center', gap: 12 }}>
      <svg className="chart" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: `0 0 ${size}px` }} role="img" aria-label="Sources of funds">
        {slices.map((s) => (
          <path key={s.key} d={s.d} fill={s.color} stroke="#fff" strokeWidth={2} fillRule="evenodd" />
        ))}
        <text x={cx} y={cy - 2} fontSize={8} fill="#52514e" textAnchor="middle">
          Total sources
        </text>
        <text x={cx} y={cy + 10} fontSize={9} fontWeight={600} fill="#111" textAnchor="middle">
          {compactUsd(total)}
        </text>
      </svg>
      <table className="t compact" style={{ flex: 1 }}>
        <tbody>
          {slices.map((s) => (
            <tr key={s.key}>
              <td>
                <span className="sw" style={{ background: s.color, display: 'inline-block', width: 9, height: 9, borderRadius: 2, marginRight: 5, verticalAlign: -1 }} />
                {s.label}
              </td>
              <td className="num">{formatUsd(s.amount)}</td>
              <td className="num muted">{`${(s.frac * 100).toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EquityBars({ peak, total, width = 320 }: { peak: number; total: number; width?: number }) {
  const max = Math.max(peak, total, 1);
  const rows = [
    { label: 'Peak equity', v: peak, c: SERIES[0]! },
    { label: 'Total equity contributed', v: total, c: SERIES[2]! },
  ];
  const labelW = 130;
  const barMax = width - labelW - 70;
  return (
    <svg className="chart" viewBox={`0 0 ${width} 44`} role="img" aria-label="Peak equity compared with total equity contributed">
      {rows.map((r, i) => {
        const bw = Math.max(1, (r.v / max) * barMax);
        const y = 4 + i * 20;
        return (
          <g key={r.label}>
            <text x={0} y={y + 10} fontSize={8} fill="#52514e">
              {r.label}
            </text>
            <rect x={labelW} y={y} width={bw} height={12} rx={2} fill={r.c} />
            <text x={labelW + bw + 4} y={y + 10} fontSize={8} fill="#111">
              {formatUsd(r.v)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Sequential single-hue shading for a sensitivity cell, light → dark by rank within the grid. */
export function heatColor(rank: number): string {
  // steps 100 → 400 of the blue ramp keep text readable on every cell
  const ramp = ['#f3f7fd', '#e3eefb', '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef'];
  const i = Math.max(0, Math.min(ramp.length - 1, Math.round(rank * (ramp.length - 1))));
  return ramp[i]!;
}
