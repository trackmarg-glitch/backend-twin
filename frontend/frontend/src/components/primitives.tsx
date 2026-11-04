/** Shared presentation primitives.
 *
 * `Source` is the load-bearing one: no engineering number reaches the screen
 * without saying whether a solver computed it, a reduced-order model estimated
 * it, the engineer typed it, the assistant proposed it, or it is still missing. */

import type { ReactNode } from 'react';

export type SourceKind =
  | 'solver'
  | 'estimate'
  | 'you'
  | 'ai'
  | 'missing'
  | 'locked'
  | 'catalog';

const SOURCES: Record<SourceKind, { label: string; title: string }> = {
  solver: {
    label: 'solver',
    title:
      'Computed by the finite-element solver and stored with the run. This is the authoritative value.',
  },
  estimate: {
    label: 'estimate',
    title:
      'Reduced-order analytic estimate, updated live. Not a finite-element result — run the simulation for the committed value.',
  },
  you: { label: 'your input', title: 'A value you entered.' },
  ai: {
    label: 'AI proposed',
    title:
      'Drawn from your description by the assistant and not yet confirmed. Check it before running.',
  },
  missing: {
    label: 'required',
    title: 'Required before a simulation can start. The platform will not assume it.',
  },
  locked: {
    label: 'protected',
    title: 'A mounting or assembly interface. It is preserved and cannot be optimised away.',
  },
  catalog: {
    label: 'catalog',
    title:
      'From the material catalog. Shipped values are illustrative handbook data, not supplier-certified.',
  },
};

export function Source({ kind }: { kind: SourceKind }) {
  const s = SOURCES[kind];
  return (
    <span className={`src src-${kind}`} title={s.title}>
      {s.label}
    </span>
  );
}

export function Panel({
  title,
  badge,
  actions,
  children,
  noBody,
}: {
  title?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  noBody?: boolean;
}) {
  return (
    <section className="panel">
      {title && (
        <div className="panel-head">
          <span className="panel-title">{title}</span>
          {badge}
          <span className="panel-spacer" />
          {actions}
        </div>
      )}
      {noBody ? children : <div className="panel-body">{children}</div>}
    </section>
  );
}

export function Metric({
  label,
  value,
  unit,
  delta,
  lowerIsBetter = true,
  source,
  foot,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: number | null;
  lowerIsBetter?: boolean;
  source?: SourceKind;
  foot?: ReactNode;
}) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const good = hasDelta ? (lowerIsBetter ? delta! < 0 : delta! > 0) : false;
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      <div className="metric-foot">
        {source && <Source kind={source} />}
        {hasDelta && Math.abs(delta!) >= 0.05 && (
          <span className={`metric-delta ${good ? 'good' : 'bad'}`}>
            {delta! > 0 ? '+' : ''}
            {delta!.toFixed(1)}%
          </span>
        )}
        {foot}
      </div>
    </div>
  );
}

export function Note({
  tone = 'cyan',
  children,
}: {
  tone?: 'cyan' | 'amber' | 'red' | 'green' | 'plain';
  children: ReactNode;
}) {
  return <div className={`note ${tone === 'plain' ? '' : `note-${tone}`}`}>{children}</div>;
}

export function Empty({ icon = '◇', children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-mark">{icon}</div>
      {children}
    </div>
  );
}

export function Spin() {
  return <span className="spin" />;
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionLabel({ letter, children }: { letter?: string; children: ReactNode }) {
  return (
    <div className="section-label">
      {letter && <span className="group-letter">{letter}</span>}
      {children}
    </div>
  );
}

/** Engineering number formatting that does not overstate precision. */
export function fmt(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const m = Math.abs(value);
  if (m !== 0 && (m < 1e-3 || m >= 1e6)) return value.toExponential(2);
  if (m >= 1000) return value.toFixed(0);
  if (m >= 100) return value.toFixed(1);
  if (m >= 10) return value.toFixed(2);
  if (m >= 1) return value.toFixed(3);
  return value.toFixed(digits);
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function Delta({
  percent,
  lowerIsBetter = true,
}: {
  percent: number | null | undefined;
  lowerIsBetter?: boolean;
}) {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return <span className="faint">—</span>;
  }
  if (Math.abs(percent) < 0.05) return <span className="faint">—</span>;
  const good = lowerIsBetter ? percent < 0 : percent > 0;
  return <span className={good ? 'good' : 'bad'}>{pct(percent)}</span>;
}

/** Status chip for a candidate, honest about what it means. */
export function StatusChip({
  status,
  feasible,
}: {
  status: string;
  feasible?: boolean | null;
}) {
  const failed = ['geometry_invalid', 'mesh_failed', 'solver_failed'].includes(status);
  if (failed) {
    return (
      <span className="chip chip-red" title="This design produced no result at all.">
        {status.replace(/_/g, ' ')}
      </span>
    );
  }
  if (feasible === true) {
    return (
      <span
        className="chip chip-green"
        title="Every configured constraint passed. Not a statement about safety or certification."
      >
        feasible
      </span>
    );
  }
  if (feasible === false) {
    return (
      <span className="chip chip-amber" title="Solved, but at least one constraint failed.">
        infeasible
      </span>
    );
  }
  return <span className="chip chip-grey">{status.replace(/_/g, ' ')}</span>;
}
