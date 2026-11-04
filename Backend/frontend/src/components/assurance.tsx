/** Maturity, verification and evidence, rendered honestly.
 *
 * The rule these components exist to enforce: no headline result appears on
 * screen without the level of evidence behind it appearing beside it. A peak
 * stress figure and a peak stress figure that has passed a mesh-refinement
 * study look identical as numbers, so the label has to travel with them.
 *
 * `MaturityBadge` is the compact form that sits next to a result. `MaturityPanel`
 * is the full statement: what the level means, what it forbids, which checks
 * produced no evidence, and what the next level would require. `CheckTable`
 * shows every check with its measured value, so a verdict can be re-derived
 * rather than taken on trust.
 *
 * None of these components computes anything. The backend's assurance plane
 * derives every verdict; these render what it decided. In particular a check
 * whose status is `not_run` is shown as a gap, never coloured as a pass. */

import { useState } from 'react';
import { Note, Panel, Source } from './primitives';
import type {
  MeshConvergenceStatus,
  AssuranceCheck,
  AssuranceOutcome,
  CheckStatus,
  MaturityLevel,
  ValidationLadder,
} from '../types/api';

/* --------------------------------------------------------------- maturity */

const LEVEL_TONE: Record<MaturityLevel, string> = {
  virtual_prototype: 'grey',
  simulation_evaluated: 'amber',
  numerically_verified: 'cyan',
  experimentally_validated: 'green',
  calibrated_component_twin: 'green',
  operational_predictive_twin: 'green',
};

/** The short form: level, ordinal and the ladder rung, with the full
 *  intended-use domain on hover. Sits next to a headline number. */
export function MaturityBadge({
  assurance,
  compact = false,
}: {
  assurance?: AssuranceOutcome | null;
  compact?: boolean;
}) {
  if (!assurance) {
    return (
      <span
        className="chip chip-grey"
        title="The assurance gate did not run for this result, so there is no maturity assessment. That is not the same as having passed."
      >
        maturity not assessed
      </span>
    );
  }

  const { maturity, verification, ladder_level, fidelity_level } = assurance;
  const tone = LEVEL_TONE[maturity.level] ?? 'grey';
  const title = [
    `${maturity.label} (Level ${maturity.level_ordinal})`,
    '',
    `Intended use: ${maturity.intended_use_domain}`,
    '',
    `Evidence required for this level: ${maturity.evidence_requirement}`,
    '',
    maturity.derivation,
  ].join('\n');

  return (
    <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      <span className={`chip chip-${tone}`} title={title}>
        L{maturity.level_ordinal} · {maturity.label}
      </span>
      {!compact && (
        <>
          <span
            className={`chip chip-${
              verification.status === 'verified'
                ? 'green'
                : verification.status === 'failed'
                  ? 'red'
                  : 'amber'
            }`}
            title={
              verification.status === 'verified'
                ? 'Every assurance check passed, including the analytical benchmark and the mesh-refinement study.'
                : verification.status === 'failed'
                  ? `A check measured something out of tolerance: ${verification.blocking_failures.join('; ')}`
                  : `Not verified. Checks that produced no evidence: ${verification.evidence_gaps.join('; ') || 'none recorded'}`
            }
          >
            {verification.status}
          </span>
          {ladder_level && (
            <span
              className="chip chip-grey"
              title={assurance.ladder_release_label ?? undefined}
            >
              {ladder_level}
            </span>
          )}
          {fidelity_level && (
            <span className="chip chip-grey" title="Model fidelity rung.">
              {fidelity_level}
            </span>
          )}
        </>
      )}
    </span>
  );
}

/** The full statement of what this result has earned and what it has not. */
export function MaturityPanel({ assurance }: { assurance?: AssuranceOutcome | null }) {
  if (!assurance) {
    return (
      <Panel title="Model maturity">
        <Note tone="amber">
          <strong>No maturity assessment for this result</strong>
          <div style={{ marginTop: 5 }}>
            The deterministic assurance gate did not run, so there is no record of
            what was checked. An absent assessment is not a passing one.
          </div>
        </Note>
      </Panel>
    );
  }

  const { maturity, verification, validation, uncertainty } = assurance;
  const tone = LEVEL_TONE[maturity.level] ?? 'grey';

  return (
    <Panel
      title="Model maturity &amp; evidence"
      badge={<MaturityBadge assurance={assurance} compact />}
    >
      <Note tone={tone === 'grey' ? 'amber' : (tone as 'cyan' | 'amber' | 'green')}>
        <strong>
          {maturity.label} — Level {maturity.level_ordinal} of 5
        </strong>
        <div style={{ marginTop: 5 }}>{maturity.evidence_requirement}</div>
      </Note>

      <div className="col-sm" style={{ marginTop: 12 }}>
        <Row label="Intended use domain" value={maturity.intended_use_domain} />
        <Row
          label="Numerical verification"
          value={verification.status}
          mono
          chip={
            verification.status === 'verified'
              ? 'green'
              : verification.status === 'failed'
                ? 'red'
                : 'amber'
          }
        />
        <Row
          label="Physical validation"
          value={validation.status.replace(/_/g, ' ')}
          mono
          chip={validation.status === 'passed' ? 'green' : 'grey'}
        />
        {assurance.ladder_level && (
          <Row label="Validation ladder" value={assurance.ladder_level} mono />
        )}
        {assurance.fidelity_level && (
          <Row label="Model fidelity" value={assurance.fidelity_level} mono />
        )}
        {maturity.last_evidence_date && (
          <Row label="Newest evidence" value={maturity.last_evidence_date} mono />
        )}
      </div>

      {/* Why this is not the next level up. This is the part of the panel
          that stops a reader assuming the ladder simply ends here. */}
      {maturity.blocked_from && maturity.blocking_reasons.length > 0 && (
        <div style={{ marginTop: 13 }}>
          <div className="section-label">
            Why this is not “{maturity.blocked_from.replace(/_/g, ' ')}”
          </div>
          <ul className="ul sm">
            {maturity.blocking_reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {verification.evidence_gaps.length > 0 && (
        <div style={{ marginTop: 11 }}>
          <Note tone="amber">
            <strong>Checks that produced no evidence</strong>
            <ul className="ul xs">
              {verification.evidence_gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            <div className="xs faint" style={{ marginTop: 5 }}>
              A check that did not run is recorded as a gap. It is never counted
              as a pass.
            </div>
          </Note>
        </div>
      )}

      {verification.blocking_failures.length > 0 && (
        <div style={{ marginTop: 11 }}>
          <Note tone="red">
            <strong>Checks that failed</strong>
            <ul className="ul xs">
              {verification.blocking_failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Note>
        </div>
      )}

      <div style={{ marginTop: 13 }}>
        <div className="section-label">What this level does not establish</div>
        <ul className="ul sm">
          {maturity.prohibited_claims.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      {assurance.ladder_next_gap && (
        <div style={{ marginTop: 11 }}>
          <Note tone="cyan">
            <strong>Next rung on the component ladder</strong>
            <div style={{ marginTop: 4 }}>{assurance.ladder_next_gap}</div>
          </Note>
        </div>
      )}

      <div style={{ marginTop: 13 }}>
        <div className="section-label">Uncertainty</div>
        <div className="sm faint" style={{ marginBottom: 7 }}>
          {uncertainty.note}
        </div>
        <div className="col-sm">
          {uncertainty.numerical_error_sources.map((s) => (
            <div key={s} className="xs dim">
              · {s}
            </div>
          ))}
          {uncertainty.solver_residual != null && (
            <Row
              label="Solver residual"
              value={uncertainty.solver_residual.toExponential(2)}
              mono
            />
          )}
          <Row
            label="Model discrepancy"
            value={
              uncertainty.model_discrepancy == null
                ? 'not quantified — no physical measurement exists'
                : String(uncertainty.model_discrepancy)
            }
          />
        </div>
      </div>

      <div className="xs faint" style={{ marginTop: 13 }}>
        {maturity.derivation}
      </div>
    </Panel>
  );
}

function Row({
  label,
  value,
  mono,
  chip,
}: {
  label: string;
  value: string;
  mono?: boolean;
  chip?: string;
}) {
  return (
    <div
      className="row-sb sm"
      style={{ padding: '5px 0', borderBottom: '1px solid var(--line)', gap: 14 }}
    >
      <span className="faint" style={{ flexShrink: 0 }}>
        {label}
      </span>
      {chip ? (
        <span className={`chip chip-${chip}`}>{value}</span>
      ) : (
        <span className={mono ? 'mono xs' : 'sm'} style={{ textAlign: 'right' }}>
          {value}
        </span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- check tables */

const STATUS_CHIP: Record<CheckStatus, string> = {
  passed: 'chip-green',
  failed: 'chip-red',
  warning: 'chip-amber',
  not_run: 'chip-grey',
  not_applicable: 'chip-grey',
};

const STATUS_TITLE: Record<CheckStatus, string> = {
  passed: 'Measured and inside tolerance.',
  failed: 'Measured and outside tolerance.',
  warning: 'A concern short of a failure. Not a pass.',
  not_run: 'This check did not run, so it produced no evidence. Not a pass.',
  not_applicable: 'This check does not apply to this analysis type.',
};

/** Every check with the measurement behind it, grouped by stage. */
export function CheckTable({ assurance }: { assurance?: AssuranceOutcome | null }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!assurance) return null;

  const stages: Array<{ key: string; label: string; checks: AssuranceCheck[] }> = [
    {
      key: 'pre',
      label: 'Before the solver ran',
      checks: assurance.verification.pre_solver?.checks ?? [],
    },
    {
      key: 'post',
      label: 'After the solver returned',
      checks: assurance.verification.post_solver?.checks ?? [],
    },
  ];

  const counts = stages
    .flatMap((s) => s.checks)
    .reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    }, {});

  return (
    <Panel
      title="Assurance checks"
      badge={
        <span className="row" style={{ gap: 5 }}>
          {(['passed', 'failed', 'warning', 'not_run', 'not_applicable'] as CheckStatus[])
            .filter((s) => counts[s])
            .map((s) => (
              <span key={s} className={`chip ${STATUS_CHIP[s]}`} title={STATUS_TITLE[s]}>
                {counts[s]} {s.replace(/_/g, ' ')}
              </span>
            ))}
        </span>
      }
    >
      <p className="sm faint" style={{ marginTop: 0 }}>
        Each check is a measurement compared against a fixed threshold, run by the
        backend's deterministic assurance service. Click one to see the
        measurement. The assistant cannot influence any verdict here.
      </p>

      {stages.map(
        (stage) =>
          stage.checks.length > 0 && (
            <div key={stage.key} style={{ marginTop: 12 }}>
              <div className="section-label">{stage.label}</div>
              {stage.checks.map((c) => {
                const id = `${stage.key}:${c.check_id}`;
                const isOpen = open === id;
                return (
                  <div
                    key={id}
                    style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}
                  >
                    <button
                      className="row-sb"
                      style={{
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: 'inherit',
                        textAlign: 'left',
                        gap: 10,
                      }}
                      onClick={() => setOpen(isOpen ? null : id)}
                    >
                      <span className="grow">
                        <span className="sm">{c.title}</span>
                        {c.severity === 'advisory' && (
                          <span className="xs faint"> · advisory</span>
                        )}
                      </span>
                      <span
                        className={`chip ${STATUS_CHIP[c.status]}`}
                        title={STATUS_TITLE[c.status]}
                      >
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{ marginTop: 7 }}>
                        <div className="xs faint">{c.description}</div>
                        <div className="sm" style={{ marginTop: 5 }}>
                          {c.detail}
                        </div>
                        {(c.measured != null || c.threshold != null) && (
                          <div className="mono xs faint" style={{ marginTop: 6 }}>
                            {c.measured != null &&
                              `measured ${c.measured.toPrecision(4)} ${c.unit ?? ''}`}
                            {c.measured != null && c.threshold != null && ' · '}
                            {c.threshold != null &&
                              `threshold ${c.threshold.toPrecision(4)} ${c.unit ?? ''}`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ),
      )}
    </Panel>
  );
}

/* --------------------------------------------------------- evidence record */

const SOURCE_LABEL: Record<string, string> = {
  user_supplied: 'you supplied',
  measured: 'measured',
  approved_database: 'approved database',
  literature: 'literature / handbook',
  demo_assumption: 'demonstration assumption',
  derived: 'derived',
};

/** The hashes that identify this run, and the provenance of every input. */
export function EvidencePanel({ assurance }: { assurance?: AssuranceOutcome | null }) {
  const evidence = assurance?.evidence;
  if (!evidence) return null;

  const hashes: Array<[string, string | null | undefined]> = [
    ['Requirement revision', evidence.requirement_revision],
    ['Geometry', evidence.geometry_hash],
    ['Material snapshot', evidence.material_snapshot_hash],
    ['Load case', evidence.load_case_hash],
    ['Mesh', evidence.mesh_hash],
    ['Solver input', evidence.solver_input_hash],
    ['Solver version', evidence.solver_version],
    ['Generator version', evidence.generator_version],
    ['Code commit', evidence.code_commit],
  ];

  const unconfirmed = evidence.provenance.filter(
    (p) => !p.confirmed && (p.source_type === 'demo_assumption' || p.source_type === 'derived'),
  );

  return (
    <Panel title="Evidence record" badge={<Source kind="solver" />}>
      <p className="sm faint" style={{ marginTop: 0 }}>
        What this result was computed from. If any of these change, the result
        becomes stale and has to be re-derived — it is not quietly carried
        forward.
      </p>

      <div className="col-sm" style={{ marginTop: 10 }}>
        {hashes.map(([label, value]) => (
          <Row
            key={label}
            label={label}
            value={value ?? 'not available'}
            mono={Boolean(value)}
          />
        ))}
      </div>

      {evidence.provenance.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="section-label">
            Input provenance · {evidence.provenance.length} inputs
          </div>
          <div className="col-sm">
            {evidence.provenance.map((p) => (
              <div
                key={p.key}
                className="row-sb"
                style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', gap: 12 }}
              >
                <span className="grow">
                  <div className="sm">{p.label}</div>
                  <div className="mono xs faint" style={{ marginTop: 2 }}>
                    {p.value != null ? `${p.value.toPrecision(5)} ${p.unit}` : '—'}
                    {p.revision && ` · rev ${p.revision}`}
                  </div>
                  {p.note && (
                    <div className="xs faint" style={{ marginTop: 2 }}>
                      {p.note}
                    </div>
                  )}
                </span>
                <span className="row" style={{ gap: 5, flexShrink: 0 }}>
                  <span
                    className={`chip ${
                      p.source_type === 'demo_assumption'
                        ? 'chip-amber'
                        : p.source_type === 'measured' || p.source_type === 'approved_database'
                          ? 'chip-green'
                          : 'chip-grey'
                    }`}
                  >
                    {SOURCE_LABEL[p.source_type] ?? p.source_type}
                  </span>
                  {p.confirmed && <span className="chip chip-green">confirmed</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {unconfirmed.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Note tone="amber">
            <strong>
              {unconfirmed.length} input{unconfirmed.length === 1 ? '' : 's'} still
              carry a demonstration assumption
            </strong>
            <div style={{ marginTop: 4 }}>
              Replace these with your own engineering values before the result
              informs a decision. They are labelled, not hidden, precisely so
              they can be found and replaced.
            </div>
          </Note>
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------- ladder display */

/** The component's validation ladder, with the attained rung marked. */
export function LadderPanel({ ladder }: { ladder?: ValidationLadder | null }) {
  if (!ladder) return null;

  return (
    <Panel
      title={ladder.title}
      badge={<span className="chip chip-cyan">{ladder.attained_level}</span>}
    >
      <p className="sm faint" style={{ marginTop: 0 }}>
        Each rung needs its own evidence. The rungs above the attained one are
        listed with what they would require, so the distance between what this
        platform computes and what a durability claim needs is visible.
      </p>
      <div className="col-sm" style={{ marginTop: 11 }}>
        {ladder.rungs.map((rung) => (
          <div
            key={rung.level}
            style={{
              padding: '9px 11px',
              background: 'var(--sunken)',
              borderRadius: 6,
              borderLeft: `2px solid ${
                rung.attained ? 'var(--green)' : 'var(--line-strong, var(--line))'
              }`,
            }}
          >
            <div className="row-sb" style={{ gap: 9 }}>
              <span className="mono sm" style={{ fontWeight: 600 }}>
                {rung.level}
              </span>
              <span className={`chip ${rung.attained ? 'chip-green' : 'chip-grey'}`}>
                {rung.attained ? 'attained' : 'not attained'}
              </span>
            </div>
            <div className="sm" style={{ marginTop: 5 }}>
              {rung.capability}
            </div>
            <div className="xs faint" style={{ marginTop: 4 }}>
              Requires: {rung.evidence_required}
            </div>
            {rung.attained ? (
              <div className="xs" style={{ marginTop: 4, color: 'var(--green)' }}>
                {rung.release_label}
              </div>
            ) : (
              rung.gap && (
                <div className="xs" style={{ marginTop: 4, color: 'var(--amber)' }}>
                  Gap: {rung.gap}
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}


/* ------------------------------------------------------------------ mesh convergence */

/** Chip label, tone and tooltip for the four recorded convergence states.
 *
 *  `inconclusive` is deliberately not styled as a failure. It means the
 *  quantity the feasibility decision rests on held still under refinement
 *  while some region-specific metric did not — typically a peak gradient or
 *  peak stress at a material interface, which is singular in this formulation
 *  and grows without bound however fine the mesh gets. Reporting it as "not
 *  converged" would read as a defect in the design rather than a known
 *  property of the mathematics.
 */
const CONVERGENCE_STATE: Record<
  MeshConvergenceStatus,
  { label: string; chip: string; title: string }
> = {
  passed: {
    label: 'converged',
    chip: 'chip-green',
    title:
      'The decision quantity and every compared metric held within tolerance ' +
      'when the mesh was refined.',
  },
  failed: {
    label: 'not converged',
    chip: 'chip-red',
    title:
      'The quantity the feasibility decision rests on kept moving under ' +
      'refinement, so its absolute value cannot be relied on.',
  },
  inconclusive: {
    label: 'inconclusive',
    chip: 'chip-amber',
    title:
      'The decision quantity converged, but a region-specific metric did ' +
      'not. Recorded as its own state — neither a pass nor a failure.',
  },
  not_run: {
    label: 'not run',
    chip: 'chip-grey',
    title:
      'No refinement study is on record, so this result has not been shown ' +
      'to be mesh-independent. Not a pass.',
  },
};

export function convergenceState(mesh?: {
  status?: MeshConvergenceStatus;
  verdict_changed?: boolean | null;
  converged?: boolean | null;
}) {
  if (mesh?.verdict_changed) {
    return {
      label: 'verdict changed',
      chip: 'chip-red',
      title:
        'Refining the mesh changed the feasibility verdict itself. The ' +
        'screening mesh was too coarse to decide this candidate.',
    };
  }
  const status: MeshConvergenceStatus =
    mesh?.status ?? (mesh?.converged ? 'passed' : 'not_run');
  return CONVERGENCE_STATE[status] ?? CONVERGENCE_STATE.not_run;
}

export function ConvergenceChip({
  mesh,
}: {
  mesh?: {
    status?: MeshConvergenceStatus;
    verdict_changed?: boolean | null;
    converged?: boolean | null;
  };
}) {
  const s = convergenceState(mesh);
  return (
    <span className={`chip ${s.chip}`} title={s.title}>
      {s.label}
    </span>
  );
}
