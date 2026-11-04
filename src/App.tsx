import { useCallback, useState } from 'react';
import { AppShell } from './shell/AppShell';
import { INTRO_SESSION_KEY, IntroSequence } from './intro/IntroSequence';
import { ModuleSwitch } from './shell/ModuleSwitch';
import { navigate, useRoute } from './app/routes';
import { BrakeCaliperDashboard } from './modules/brakeCaliper/BrakeCaliperDashboard';
import { SparkPlugDashboard } from './modules/sparkPlug/SparkPlugDashboard';
import { AlloyWheelDashboard } from './modules/alloyWheel/AlloyWheelDashboard';
import { DashboardPage } from './pages/DashboardPage';
import { DesignLabPage } from './pages/DesignLabPage';
import { PendingPage } from './pages/PendingPage';
import { AIInsightsPage } from './pages/AIInsightsPage';
import { ExperimentPage } from './pages/ExperimentPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ReportsPage } from './pages/ReportsPage';

/**
 * The intro plays once per browser session, so reloading mid-demo drops
 * straight into the app. `#/...?intro` (or clearing session storage)
 * replays it on purpose.
 */
function shouldPlayIntro() {
  try {
    if (window.location.hash.includes('intro')) return true;
    return window.sessionStorage.getItem(INTRO_SESSION_KEY) !== '1';
  } catch {
    return true; // sessionStorage blocked (private mode): just play it.
  }
}

export default function App() {
  const route = useRoute();
  const [running, setRunning] = useState(false);
  const [intro, setIntro] = useState(shouldPlayIntro);

  const endIntro = useCallback(() => {
    try {
      window.sessionStorage.setItem(INTRO_SESSION_KEY, '1');
    } catch {
      /* non-fatal */
    }
    setIntro(false);
  }, []);

  let page;
  switch (route.section) {
    case 'dashboard':
      page = <DashboardPage />;
      break;
    case 'design-lab':
      page = <DesignLabPage />;
      break;
    case 'experiment':
      page = <ExperimentPage />;
      break;
    case 'analytics':
      page = <AnalyticsPage />;
      break;
    case 'reports':
      page = <ReportsPage />;
      break;
    case 'ai-insights':
      page = <AIInsightsPage />;
      break;
    case 'digital-twin': {
      const moduleSwitch = (
        <ModuleSwitch value={route.module} onChange={(m) => navigate({ section: 'digital-twin', module: m })} />
      );
      page =
        route.module === 'alloy-wheel' ? (
          <AlloyWheelDashboard key="wheel" moduleSwitch={moduleSwitch} onRunningChange={setRunning} />
        ) : route.module === 'spark-plug' ? (
          <SparkPlugDashboard key="spark" moduleSwitch={moduleSwitch} onRunningChange={setRunning} />
        ) : (
          <BrakeCaliperDashboard key="brake" moduleSwitch={moduleSwitch} onRunningChange={setRunning} />
        );
      break;
    }
    default:
      page = <PendingPage section={route.section} />;
  }

  // Only the Digital Twin pages run a live sim, so the "running" chip is idle everywhere else.
  return (
    <>
      <AppShell active={route.section} running={route.section === 'digital-twin' && running}>
        {page}
      </AppShell>
      {intro && <IntroSequence onDone={endIntro} />}
    </>
  );
}
