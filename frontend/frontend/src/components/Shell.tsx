/** Application shell: the six-section rail and the page frame.
 *
 * The rail is ordered as the work is done, not alphabetically, and sections
 * that cannot do anything yet are visibly disabled rather than leading to an
 * empty page. */

import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../store/useStore';

const SECTIONS = [
  { to: '/', label: 'Dashboard', icon: '◳', end: true, always: true },
  { to: '/new', label: 'New Design', icon: '✎', always: true },
  { to: '/improve', label: 'Improve Existing', icon: '⟲', always: true },
  { to: '/results', label: 'Simulation Results', icon: '◈', needsStudy: true },
  { to: '/compare', label: 'Design Comparison', icon: '⇄', needsStudy: true },
  { to: '/export', label: 'Export & Reports', icon: '↧', needsStudy: true },
];

export function Shell({ children }: { children: ReactNode }) {
  const online = useStore((s) => s.backendOnline);
  const study = useStore((s) => s.study);
  const running = useStore((s) => s.running);
  const capabilities = useStore((s) => s.capabilities);

  return (
    <div className="app">
      <aside className="rail">
        <NavLink to="/" className="rail-brand" style={{ padding: '0 6px 20px' }}>
          <div className="rail-mark">A</div>
          <div>
            <div className="rail-name">AutoTwin</div>
            <div className="rail-sub">Generative Engineering</div>
          </div>
        </NavLink>

        {SECTIONS.map((section) => {
          const locked = section.needsStudy && !study;
          return (
            <NavLink
              key={section.to}
              to={section.to}
              end={section.end}
              className={locked ? 'disabled' : undefined}
              onClick={(e) => locked && e.preventDefault()}
              title={locked ? 'Available once a simulation has run' : undefined}
            >
              <span className="rail-icon">{section.icon}</span>
              <span>{section.label}</span>
            </NavLink>
          );
        })}

        <div className="rail-spacer" />

        <div className="rail-status">
          <div className="row-sb" style={{ marginBottom: 6 }}>
            <span>Backend</span>
            <span className={`chip ${online ? 'chip-green' : online === false ? 'chip-red' : 'chip-grey'}`}>
              {online === null ? '…' : online ? 'online' : 'offline'}
            </span>
          </div>
          {capabilities?.benchmarks_all_passed !== undefined && (
            <div className="row-sb" style={{ marginBottom: 6 }}>
              <span>Solvers</span>
              <span
                className={`chip ${capabilities.benchmarks_all_passed ? 'chip-green' : 'chip-red'}`}
                title="Benchmarked against the analytical cantilever and 1D conduction solutions on startup."
              >
                {capabilities.benchmarks_all_passed ? 'verified' : 'failing'}
              </span>
            </div>
          )}
          {running && (
            <div className="row-sb">
              <span>Solver</span>
              <span className="chip chip-cyan">
                <span className="spin" style={{ width: 8, height: 8, borderWidth: 1.5 }} />
                running
              </span>
            </div>
          )}
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}

export function PageHead({
  title,
  context,
  actions,
}: {
  title: string;
  context?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="main-head">
      <div>
        <h1 className="main-title">{title}</h1>
        {context && <div className="main-context">{context}</div>}
      </div>
      <div className="main-spacer" />
      {actions}
    </div>
  );
}
