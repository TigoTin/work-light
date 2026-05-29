import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Window } from '@wailsio/runtime';
import { PixelShell } from './components/PixelShell';
import { SignalLamp } from './components/SignalLamp';
import { type CodexStatus, type SessionSnapshot, createStatusStore, statusStore } from './statusStore';
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

function statusPriority(status: CodexStatus) {
  switch (status) {
    case 'error':
      return 4;
    case 'waiting_confirmation':
      return 3;
    case 'working':
      return 2;
    case 'idle':
      return 1;
    default:
      return 0;
  }
}

function statusForWorkspace(sessions: SessionSnapshot[], targetCwd: string) {
  return sessions
    .filter((session) => session.cwd === targetCwd)
    .reduce<CodexStatus | undefined>((best, session) => {
      if (!best || statusPriority(session.status) > statusPriority(best)) {
        return session.status;
      }
      return best;
    }, undefined);
}

function statusForWorkspaces(sessions: SessionSnapshot[], targetCwds: string[], fallback: CodexStatus | '') {
  const statuses = targetCwds.map((targetCwd) => statusForWorkspace(sessions, targetCwd)).filter((status): status is CodexStatus => Boolean(status));

  return statuses.reduce<CodexStatus | ''>((best, status) => {
    if (!best || statusPriority(status) > statusPriority(best)) {
      return status;
    }
    return best;
  }, fallback);
}

function uniqueOtherCwds(sessions: SessionSnapshot[], displayCwd: string, fallbackCwds: string[]) {
  const seen = new Set<string>();
  const cwds = sessions.length > 0 ? sessions.map((session) => session.cwd) : fallbackCwds;

  return cwds.filter((cwd) => {
    if (!cwd || cwd === displayCwd || seen.has(cwd)) {
      return false;
    }
    seen.add(cwd);
    return true;
  });
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
  const sessions = useSyncExternalStore(store.subscribe, store.getSessionsSnapshot, store.getSessionsSnapshot);
  const [pinned, setPinned] = useState(true);
  const [otherOpen, setOtherOpen] = useState(false);
  const [selectedCwd, setSelectedCwd] = useState('');
  const selectedStatus = selectedCwd ? statusForWorkspace(sessions, selectedCwd) : undefined;
  const displayStatus = selectedStatus ?? status;
  const displayCwd = selectedStatus ? selectedCwd : cwd;
  const displayOtherCwds = uniqueOtherCwds(sessions, displayCwd, other.cwds);
  const label = statusLabel[displayStatus];
  const lamps = activeLamp(displayStatus);
  const workspace = workspaceName(displayCwd);
  const otherCount = sessions.length > 0 ? sessions.filter((session) => session.cwd !== displayCwd).length : other.count;
  const otherStatus = sessions.length > 0 ? statusForWorkspaces(sessions, displayOtherCwds, other.status) : other.status;
  const otherBadgeTitle = otherCount > 0 ? otherStatusTitle(otherCount, otherStatus, displayOtherCwds) : '';
  const otherWorkspaceNames = displayOtherCwds.map(workspaceName).filter(Boolean);
  const visibleOtherWorkspaceNames = otherWorkspaceNames.slice(0, 3);
  const hiddenOtherCount = Math.max(0, otherCount - visibleOtherWorkspaceNames.length);

  useEffect(() => {
    void placeWindowAtTopCenter();
  }, []);

  useEffect(() => {
    if (otherCount === 0) {
      setOtherOpen(false);
    }
  }, [otherCount]);

  useEffect(() => {
    if (selectedCwd && sessions.length > 0 && !selectedStatus) {
      setSelectedCwd('');
    }
  }, [selectedCwd, selectedStatus, sessions]);

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
        status={displayStatus}
        pinned={pinned}
        workspaceName={workspace}
        workspaceCwd={displayCwd}
        workspaceSelected={Boolean(selectedStatus)}
        otherStatusBadge={
          otherCount > 0 ? (
            <button
              type="button"
              className={`other-status-badge other-status-${otherStatusClass(otherStatus)}`}
              title={otherBadgeTitle}
              aria-label={otherBadgeTitle}
              aria-expanded={otherOpen}
              data-testid="other-status-badge"
              onClick={() => setOtherOpen((open) => !open)}
            >
              +{otherCount}
            </button>
          ) : undefined
        }
        otherStatusPopover={
          otherCount > 0 && otherOpen ? (
            <div
              className="other-session-popover"
              data-testid="other-session-popover"
              role="list"
              aria-label={otherBadgeTitle}
            >
              {visibleOtherWorkspaceNames.map((name, index) => (
                <span className="other-session-item" role="listitem" key={`${name}-${index}`}>
                  <button
                    className="other-session-button"
                    type="button"
                    aria-label={`Switch to workspace ${name}`}
                    onClick={() => {
                      setSelectedCwd(displayOtherCwds[index] ?? '');
                      setOtherOpen(false);
                    }}
                  >
                    <span className={`other-session-dot other-status-${otherStatusClass(statusForWorkspace(sessions, displayOtherCwds[index] ?? '') ?? otherStatus)}`} aria-hidden="true" />
                    <span className="other-session-name">{name}</span>
                  </button>
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
          if (displayStatus === 'error') {
            store.setStatus('idle');
          }
        }}
      >
        <div className="lamp-row lamp-row-horizontal" aria-label="Codex signal lamps" data-testid="lamp-row">
          <SignalLamp color="red" status={displayStatus} active={lamps.red} />
          <SignalLamp color="yellow" status={displayStatus} active={lamps.yellow} />
          <SignalLamp color="green" status={displayStatus} active={lamps.green} />
        </div>
        <StatusPulse status={displayStatus} />
        <div className="status-band" aria-label={`Codex status ${label}`} title={label} data-testid="status-label">
          {label}
        </div>
      </PixelShell>
    </main>
  );
}
