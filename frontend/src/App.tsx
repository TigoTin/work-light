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

function otherStatusClass(status: CodexStatus | '') {
  if (status === 'waiting_confirmation') {
    return 'waiting';
  }

  return status || 'offline';
}

function otherStatusTitle(count: number, status: CodexStatus | '', cwds: string[]) {
  const workspaceList = cwds.map(workspaceName).filter(Boolean).join(', ') || 'none';
  return `Other sessions: ${count}; highest status: ${status || 'unknown'}; workspaces: ${workspaceList}`;
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
  const other = useSyncExternalStore(store.subscribe, store.getOtherSnapshot, store.getOtherSnapshot);
  const [pinned, setPinned] = useState(true);
  const [otherOpen, setOtherOpen] = useState(false);
  const label = statusLabel[status];
  const lamps = activeLamp(status);
  const workspace = workspaceName(cwd);
  const otherBadgeTitle = other.count > 0 ? otherStatusTitle(other.count, other.status, other.cwds) : '';
  const otherWorkspaceNames = other.cwds.map(workspaceName).filter(Boolean);
  const visibleOtherWorkspaceNames = otherWorkspaceNames.slice(0, 3);
  const hiddenOtherCount = Math.max(0, other.count - visibleOtherWorkspaceNames.length);

  useEffect(() => {
    void placeWindowAtTopCenter();
  }, []);

  useEffect(() => {
    if (other.count === 0) {
      setOtherOpen(false);
    }
  }, [other.count]);

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
        otherStatusBadge={
          other.count > 0 ? (
            <button
              type="button"
              className={`other-status-badge other-status-${otherStatusClass(other.status)}`}
              title={otherBadgeTitle}
              aria-label={otherBadgeTitle}
              aria-expanded={otherOpen}
              data-testid="other-status-badge"
              onClick={() => setOtherOpen((open) => !open)}
            >
              +{other.count}
            </button>
          ) : undefined
        }
        otherStatusPopover={
          other.count > 0 && otherOpen ? (
            <div
              className="other-session-popover"
              data-testid="other-session-popover"
              role="list"
              aria-label={otherBadgeTitle}
            >
              {visibleOtherWorkspaceNames.map((name, index) => (
                <span className="other-session-item" role="listitem" key={`${name}-${index}`}>
                  <span className={`other-session-dot other-status-${otherStatusClass(other.status)}`} aria-hidden="true" />
                  <span className="other-session-name">{name}</span>
                </span>
              ))}
              {hiddenOtherCount > 0 ? (
                <span className="other-session-item" role="listitem">
                  <span className="other-session-dot other-status-offline" aria-hidden="true" />
                  <span className="other-session-name">+{hiddenOtherCount}</span>
                </span>
              ) : undefined}
            </div>
          ) : undefined
        }
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
