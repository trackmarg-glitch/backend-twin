/** AutoTwin — routing, backend connection and solver-job polling. */

import { useEffect, useRef } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Note } from './components/primitives';
import { Comparison } from './pages/Comparison';
import { Dashboard } from './pages/Dashboard';
import { Export } from './pages/Export';
import { ImproveDesign } from './pages/ImproveDesign';
import { NewDesign } from './pages/NewDesign';
import { Results } from './pages/Results';
import { api, pollJob } from './services/api';
import { useStore } from './store/useStore';

function Toast() {
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(id);
  }, [toast, setToast]);

  if (!toast) return null;
  return <div className="toast">{toast}</div>;
}

function Offline() {
  const error = useStore((s) => s.backendError);
  return (
    <div className="main-body" style={{ maxWidth: 640, margin: '40px auto' }}>
      <Note tone="red">
        <strong>Cannot reach the AutoTwin backend</strong>
        <div style={{ marginTop: 6 }}>{error}</div>
      </Note>
      <div style={{ marginTop: 14 }}>
        <Note tone="cyan">
          <strong>Start it with</strong>
          <pre className="code" style={{ marginTop: 8 }}>
            {`cd backend
.venv\\Scripts\\activate        # Windows
uvicorn app.main:app --reload --port 8000`}
          </pre>
          <div className="xs faint" style={{ marginTop: 9 }}>
            If the port is taken, stop the old process or run on another port and set
            VITE_API_BASE in frontend/.env to match.
          </div>
        </Note>
      </div>
      <button
        className="btn btn-primary"
        style={{ marginTop: 16 }}
        onClick={() => window.location.reload()}
      >
        Retry
      </button>
    </div>
  );
}

function Bootstrap() {
  const store = useStore();
  const polling = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.health();
        if (cancelled) return;
        store.setBackend(true);

        const profiles = await api.profiles();
        if (!cancelled) store.setProfiles(profiles);

        // Runs the solver verification benchmarks, so this is the slow one.
        const capabilities = await api.capabilities(true);
        if (!cancelled) store.setCapabilities(capabilities);
      } catch (error) {
        if (!cancelled) store.setBackend(false, (error as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow a running solver job, then load its study.
  useEffect(() => {
    const job = store.activeJob;
    if (!job || !store.running) return;
    if (job.status === 'completed' || job.status === 'failed') return;

    polling.current?.abort();
    const controller = new AbortController();
    polling.current = controller;

    (async () => {
      try {
        const finished = await pollJob(job.id, (u) => store.setJob(u), {
          signal: controller.signal,
          intervalMs: 1500,
        });

        if (finished.status === 'completed') {
          const runId = finished.result_payload?.optimization_run_id as string | undefined;
          if (runId) {
            store.setStudy(await api.study(runId));
            store.setToast('Simulation complete — results are ready.');
          }
        } else if (finished.status === 'failed') {
          store.setRunError(finished.error ?? 'The job failed without a message.');
        }
      } catch (error) {
        if (!controller.signal.aborted) store.setRunError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) store.setRunning(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.activeJob?.id, store.running]);

  return null;
}

export default function App() {
  const online = useStore((s) => s.backendOnline);

  return (
    <BrowserRouter>
      <Bootstrap />
      <Shell>
        {online === false ? (
          <Offline />
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewDesign />} />
            <Route path="/improve" element={<ImproveDesign />} />
            <Route path="/results" element={<Results />} />
            <Route path="/compare" element={<Comparison />} />
            <Route path="/export" element={<Export />} />
          </Routes>
        )}
      </Shell>
      <Toast />
    </BrowserRouter>
  );
}
