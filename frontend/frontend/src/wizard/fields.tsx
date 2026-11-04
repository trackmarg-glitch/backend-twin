/** Form controls for the parameter steps.
 *
 * Two rules these enforce, because they are the ones that matter:
 *
 *  - Every input shows its unit next to the box, so a number can never be
 *    ambiguous about what it means.
 *  - Every input shows where its current value came from. A demonstration
 *    fixture, an assistant suggestion and a value you typed look different,
 *    and a required value you have not supplied is marked, not defaulted. */

import type { ReactNode } from 'react';
import { Source, type SourceKind } from '../components/primitives';
import type { ParameterSpec } from '../types/api';

/** Metres are entered in millimetres throughout the UI. */
export function toDisplay(spec: ParameterSpec, value: number): number {
  return spec.unit === 'm' ? value * 1000 : value;
}

export function fromDisplay(spec: ParameterSpec, value: number): number {
  return spec.unit === 'm' ? value / 1000 : value;
}

export function unitOf(spec: ParameterSpec): string {
  if (spec.unit === 'm') return 'mm';
  if (spec.unit === '-') return '';
  return spec.unit;
}

export function Field({
  label,
  help,
  warn,
  source,
  children,
  tip,
}: {
  label: string;
  help?: string;
  warn?: string;
  source?: SourceKind;
  children: ReactNode;
  tip?: string;
}) {
  return (
    <div className="f">
      <div className="f-top">
        <span className="f-label" title={tip}>
          {label}
          {tip && <span className="faint"> ⓘ</span>}
        </span>
        <span className="f-spacer" />
        {source && <Source kind={source} />}
      </div>
      {children}
      {help && <div className="f-help">{help}</div>}
      {warn && <div className="f-warn">{warn}</div>}
    </div>
  );
}

export function NumberInput({
  value,
  unit,
  onChange,
  min,
  max,
  step = 'any',
  disabled,
  missing,
  placeholder,
}: {
  value: number | '' | undefined;
  unit?: string;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  disabled?: boolean;
  missing?: boolean;
  placeholder?: string;
}) {
  return (
    <div className={`f-input ${missing ? 'missing' : ''} ${disabled ? 'locked' : ''}`}>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
      {unit && <span className="f-suffix">{unit}</span>}
    </div>
  );
}

/** A bounded design dimension: number box plus the slider over its range. */
export function RangeField({
  spec,
  value,
  source,
  onChange,
  varied,
  onToggleVaried,
}: {
  spec: ParameterSpec;
  value: number;
  source?: SourceKind;
  onChange: (canonical: number) => void;
  /** Whether the optimizer may change this dimension. */
  varied?: boolean;
  onToggleVaried?: () => void;
}) {
  const shown = toDisplay(spec, value);
  const min = toDisplay(spec, spec.minimum);
  const max = toDisplay(spec, spec.maximum);
  const step = spec.kind === 'integer' ? 1 : spec.unit === 'm' ? 0.1 : 0.01;
  const unit = unitOf(spec);
  const locked = !spec.is_design_variable;

  return (
    <div className="f">
      <div className="f-top">
        {onToggleVaried && !locked && (
          <input
            type="checkbox"
            checked={varied}
            onChange={onToggleVaried}
            style={{ width: 'auto', accentColor: 'var(--cyan)', marginRight: 2 }}
            title="Let the optimizer vary this dimension"
          />
        )}
        <span className="f-label" title={spec.description ?? undefined}>
          {spec.label}
          {spec.description && <span className="faint"> ⓘ</span>}
        </span>
        <span className="f-spacer" />
        {locked ? <Source kind="locked" /> : source && <Source kind={source} />}
      </div>

      <div className={`f-input ${locked ? 'locked' : ''}`}>
        <input
          type="number"
          value={Number(shown.toFixed(spec.kind === 'integer' ? 0 : 2))}
          min={min}
          max={max}
          step={step}
          disabled={locked}
          onChange={(e) => onChange(fromDisplay(spec, Number(e.target.value)))}
        />
        {unit && <span className="f-suffix">{unit}</span>}
      </div>

      {!locked && (
        <>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={shown}
            onChange={(e) => onChange(fromDisplay(spec, Number(e.target.value)))}
          />
          <div className="row-sb xs faint" style={{ marginTop: 3 }}>
            <span>{spec.kind === 'integer' ? min.toFixed(0) : min.toFixed(1)}</span>
            <span>{spec.kind === 'integer' ? max.toFixed(0) : max.toFixed(1)}</span>
          </div>
        </>
      )}

      {locked && spec.preserved_reason && (
        <div className="f-help">{spec.preserved_reason}</div>
      )}
    </div>
  );
}
