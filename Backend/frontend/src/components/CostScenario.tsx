/** Prototype cost and lead-time scenario calculator.
 *
 * This is arithmetic on figures the engineer types in. It is not a
 * measurement, not a benchmark, and not a claim this platform makes about
 * itself, and the research dossiers are explicit that presenting it as any of
 * those is a prohibited claim. So it lives behind a disclosure, carries a
 * "your figures" badge on every input, starts completely empty, and prints
 * the formula behind every line it produces.
 *
 * The one input that decides the whole answer — how many physical prototypes
 * you still expect to build after virtual screening — is deliberately not
 * estimated for you. If the platform guessed it, the result would be the
 * platform's claim about its own value rather than your scenario.
 */

import { useState } from 'react';
import { Note, Panel, Source, Spin } from './primitives';
import { api } from '../services/api';
import type { CostEstimate, CostInputs } from '../types/api';

type FieldKey = Exclude<keyof CostInputs, 'currency'>;

const FIELDS: Array<{
  key: FieldKey;
  label: string;
  help?: string;
  integer?: boolean;
  optional?: boolean;
}> = [
  {
    key: 'prototype_unit_cost',
    label: 'Cost per physical prototype',
    help: 'Material, machining and assembly for one prototype part.',
  },
  {
    key: 'physical_test_cost',
    label: 'Test cost per iteration',
    help: 'Rig time, instrumentation and labour for one physical test.',
  },
  { key: 'engineering_hourly_cost', label: 'Engineering cost per hour' },
  {
    key: 'traditional_physical_iterations',
    label: 'Physical iterations without virtual screening',
    help: 'How many build–test–modify cycles your current process needs.',
    integer: true,
  },
  {
    key: 'traditional_engineering_hours_per_iteration',
    label: 'Engineering hours per physical iteration',
  },
  {
    key: 'physical_iterations_after_virtual',
    label: 'Physical iterations you expect to still need',
    help:
      'Your judgement. The platform deliberately does not estimate this for ' +
      'you — it is the input that decides the whole result.',
    integer: true,
  },
  {
    key: 'virtual_engineering_hours',
    label: 'Engineering hours to set up and review the virtual study',
  },
  { key: 'virtual_compute_cost', label: 'Compute cost for the virtual study', optional: true },
  {
    key: 'lead_time_days_per_physical_iteration',
    label: 'Calendar days per physical iteration',
    optional: true,
  },
  {
    key: 'lead_time_days_per_virtual_study',
    label: 'Calendar days for the virtual study',
    optional: true,
  },
];

const REQUIRED = FIELDS.filter((f) => !f.optional).map((f) => f.key);

export function CostScenario() {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [values, setValues] = useState<Partial<Record<FieldKey, string>>>({});
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = REQUIRED.filter((k) => (values[k] ?? '').trim() === '');

  const run = async () => {
    setBusy(true);
    setError(null);
    setEstimate(null);
    try {
      const payload: Record<string, unknown> = { currency };
      for (const f of FIELDS) {
        const raw = (values[f.key] ?? '').trim();
        if (raw === '') {
          if (!f.optional) throw new Error(`${f.label} is required.`);
          continue;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new Error(`${f.label} is not a number.`);
        payload[f.key] = f.integer ? Math.round(n) : n;
      }
      setEstimate(await api.estimateCost(payload as unknown as CostInputs));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const money = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  if (!open) {
    return (
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-block" onClick={() => setOpen(true)}>
          Open the prototype cost &amp; lead-time scenario calculator
        </button>
        <div className="xs faint" style={{ marginTop: 6, lineHeight: 1.6 }}>
          Arithmetic on figures you supply. It is not a measurement of this
          platform and makes no claim about what AutoTwin saves.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <Panel
        title="Prototype cost & lead-time scenario"
        badge={<Source kind="you" />}
        actions={
          <button className="btn btn-sm" onClick={() => setOpen(false)}>
            Close
          </button>
        }
      >
        <Note tone="amber">
          <strong>This is your scenario, not our result.</strong> Every figure
          below is one you type in, and the output is the arithmetic of those
          figures. Nothing here was measured, benchmarked or observed by this
          platform, and no saving is assumed — the calculator will report a
          negative saving if your inputs imply one.
        </Note>

        <div className="row" style={{ gap: 8, margin: '14px 0 4px' }}>
          <label className="xs faint" htmlFor="cost-currency">
            Currency
          </label>
          <input
            id="cost-currency"
            type="text"
            style={{ width: 90 }}
            value={currency}
            maxLength={8}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </div>

        <div className="split" style={{ marginTop: 8 }}>
          {FIELDS.map((f) => (
            <div key={f.key} style={{ marginBottom: 10 }}>
              <label className="section-label" htmlFor={`cost-${f.key}`}>
                {f.label}
                {f.optional && <span className="xs faint"> (optional)</span>}
              </label>
              <input
                id={`cost-${f.key}`}
                type="number"
                min={0}
                step={f.integer ? 1 : 'any'}
                placeholder="—"
                value={values[f.key] ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
              />
              {f.help && (
                <div className="xs faint" style={{ marginTop: 3, lineHeight: 1.55 }}>
                  {f.help}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 6 }}
          onClick={run}
          disabled={busy || missing.length > 0}
        >
          {busy ? <Spin /> : null} Calculate this scenario
        </button>
        {missing.length > 0 && (
          <div className="xs faint" style={{ marginTop: 6 }}>
            {missing.length} required figure{missing.length === 1 ? '' : 's'} still
            empty. The calculator will not assume a value for any of them.
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12 }}>
            <Note tone="red">{error}</Note>
          </div>
        )}

        {estimate && (
          <div style={{ marginTop: 16 }}>
            <div className="split">
              <div>
                <div className="section-label">Scenario you described</div>
                <table className="tbl">
                  <tbody>
                    {estimate.traditional_breakdown.map((l) => (
                      <tr key={l.label}>
                        <td className="t dim" title={l.formula}>
                          {l.label}
                        </td>
                        <td className="n">{money(l.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="t">
                        <strong>Total</strong>
                      </td>
                      <td className="n">
                        <strong>{money(estimate.traditional_cost)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <div className="section-label">Virtual-first alternative</div>
                <table className="tbl">
                  <tbody>
                    {estimate.virtual_breakdown.map((l) => (
                      <tr key={l.label}>
                        <td className="t dim" title={l.formula}>
                          {l.label}
                        </td>
                        <td className="n">{money(l.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="t">
                        <strong>Total</strong>
                      </td>
                      <td className="n">
                        <strong>{money(estimate.virtual_first_cost)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="row-sb" style={{ marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
              <span className="sm">
                Difference between the two scenarios you described
              </span>
              <strong
                style={{
                  color:
                    estimate.estimated_savings >= 0 ? 'var(--green)' : 'var(--red)',
                }}
              >
                {money(estimate.estimated_savings)}
                {estimate.estimated_savings_percent != null &&
                  ` (${estimate.estimated_savings_percent.toFixed(1)}%)`}
              </strong>
            </div>
            {estimate.lead_time_days_saved != null && (
              <div className="row-sb sm" style={{ marginTop: 6 }}>
                <span>Calendar-day difference</span>
                <strong>{estimate.lead_time_days_saved.toFixed(0)} days</strong>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <Note tone="amber">
                {estimate.disclaimer}
                {estimate.assumptions.length > 0 && (
                  <ul className="ul">
                    {estimate.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </Note>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
