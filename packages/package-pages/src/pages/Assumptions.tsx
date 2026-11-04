import { formatByUnit } from '../format';
import type { RegisterEntry } from '../types';

const SOURCE_LABEL: Record<string, string> = {
  benchmark: 'Benchmark',
  'parcel-data': 'Parcel data',
  'my-number': 'My number',
  quote: 'Quote',
  comp: 'Comp',
  calculated: 'Calculated',
  unknown: 'Unknown',
};

export function AssumptionsPage({ register }: { register: RegisterEntry[] }) {
  const sections = new Map<string, RegisterEntry[]>();
  for (const e of register) {
    const list = sections.get(e.section) ?? [];
    list.push(e);
    sections.set(e.section, list);
  }
  return (
    <>
      {[...sections.entries()].map(([section, entries]) => (
        <div key={section} className="register-section">
          <h3>{section}</h3>
          <table className="t compact">
            <thead>
              <tr>
                <th style={{ width: '26%' }}>Input</th>
                <th className="num" style={{ width: '13%' }}>
                  Value
                </th>
                <th style={{ width: '10%' }}>Source</th>
                <th style={{ width: '21%' }}>Note</th>
                <th className="nowrap" style={{ width: '11%' }}>
                  Date
                </th>
                <th style={{ width: '19%' }}>Benchmark</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <RegisterRow key={e.path} e={e} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="footnote">
        Figures rounded; totals may not foot. Scenario overrides are listed under the base value;
        flags mark values outside their benchmark range.
      </p>
    </>
  );
}

function RegisterRow({ e }: { e: RegisterEntry }) {
  const overrides = e.overrides
    ? [
        e.overrides.best !== undefined ? `Best: ${formatByUnit(e.overrides.best, e.unit)}` : null,
        e.overrides.worst !== undefined
          ? `Worst: ${formatByUnit(e.overrides.worst, e.unit)}`
          : null,
      ].filter(Boolean)
    : [];
  return (
    <tr>
      <td>
        {e.label}
        <div className="muted" style={{ fontSize: '6.5pt' }}>
          {e.path}
        </div>
      </td>
      <td className="num">
        {formatByUnit(e.value, e.unit)}
        {overrides.length > 0 ? <div className="muted">{overrides.join(' · ')}</div> : null}
      </td>
      <td>{SOURCE_LABEL[e.source] ?? e.source}</td>
      <td>
        {e.note ?? ''}
        {e.flag ? (
          <div>
            <span className="flag-chip">{e.flag}</span>
          </div>
        ) : null}
      </td>
      <td className="nowrap">{e.updatedAt ? e.updatedAt.slice(0, 10) : ''}</td>
      <td>
        {e.benchmark ? (
          <>
            {`${formatByUnit(e.benchmark.low, e.unit)} – ${formatByUnit(e.benchmark.high, e.unit)}`}
            <div className="muted">{`${e.benchmark.source}, ${e.benchmark.asOf}${e.benchmark.sampleSize ? ` (n=${e.benchmark.sampleSize})` : ''}`}</div>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  );
}
