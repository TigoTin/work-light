import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Window } from '@wailsio/runtime';
import { PixelShell } from './components/PixelShell';
import { SignalLamp } from './components/SignalLamp';
import { type CodexStatus, createStatusStore, statusStore } from './statusStore';
import { placeWindowAtTopCenter } from './windowPlacement';
import './styles.css';

type AppProps = {
  initialStatus?: CodexStatus;
  initialCwd?: string;
};

const statusLabel: Record<CodexStatus, string> = {
  idle: 'IDLE',
  working: 'WORK',
  waiting_confirmation: 'WAIT',
  error: 'ERR',
  offline: 'OFF'
};

function activeLamp(status: CodexStatus) {
  return {
    red: status === 'error' || status === 'working',
    yellow: status === 'waiting_confirmation' || status === 'working',
    green: status === 'idle' || status === 'working'
  };
}

function workspaceName(cwd: string) {
  const trimmed = cwd.trim();
  if (!trimmed) {
    return '';
  }

  const withoutTrailingSlash = trimmed.replace(/[\\/]+$/, '');
  const parts = withoutTrailingSlash.split(/[\\/]+/);
  return parts.at(-1) ?? withoutTrailingSlash;
}

function StatusPulse({ status }: { status: CodexStatus }) {
  const bits = status === 'working' ? 3 : status === 'error' ? 2 : 1;

  return (
    <div
      className={`status-pulse status-pulse-${status}`}
      data-status={status}
      data-testid="status-pulse"
      aria-hidden="true"
    >
      {Array.from({ length: bits }, (_, index) => (
        <span className="pulse-bit" key={index} />
      ))}
    </div>
  );
}

export default function App({ initialStatus, initialCwd }: AppProps) {
  const store = useMemo(
    () =>
      initialStatus || initialCwd !== undefined
        ? createStatusStore(initialStatus ?? 'offline', initialCwd ?? '')
        : statusStore,
    [initialCwd, initialStatus]
  );
  const status = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const cwd = useSyncExternalStore(store.subscribe, store.getCwdSnapshot, store.getCwdSnapshot);
  const [pinned, setPinned] = useState(true);
  const label = statusLabel[status];
  const lamps = activeLamp(status);
  const workspace = workspaceName(cwd);

  useEffect(() => {
    void placeWindowAtTopCenter();
  }, []);

  function togglePin() {
    setPinned((current) => {
      const next = !current;
      void Window.SetAlwaysOnTop(next);
      return next;
    });
  }

  return (
    <main className="app-root">
      <PixelShell
        status={status}
        pinned={pinned}
        workspaceName={workspace}
        workspaceCwd={cwd}
        onTogglePin={togglePin}
        onMinimize={() => void Window.Minimise()}
        onClearError={() => {
          if (status === 'error') {
            store.setStatus('idle');
          }
        }}
      >
        <div className="lamp-row lamp-row-horizontal" aria-label="Codex signal lamps" data-testid="lamp-row">
          <SignalLamp color="red" status={status} active={lamps.red} />
          <SignalLamp color="yellow" status={status} active={lamps.yellow} />
          <SignalLamp color="green" status={status} active={lamps.green} />
        </div>
        <StatusPulse status={status} />
        <div className="status-band" aria-label={`Codex status ${label}`} title={label} data-testid="status-label">
          {label}
        </div>
      </PixelShell>
    </main>
  );
}
