import { Events } from '@wailsio/runtime';

export type CodexStatus = 'idle' | 'working' | 'waiting_confirmation' | 'error' | 'offline';
export type OtherStatusSnapshot = {
  status: CodexStatus | '';
  count: number;
  cwds: string[];
};
export type SessionSnapshot = {
  sessionId: string;
  cwd: string;
  status: CodexStatus;
  updatedAt: string;
};

type Listener = () => void;
type RuntimeUnsubscribe = () => void;
type EventHandler = (payload: unknown) => void;

type WailsLikeWindow = Window & {
  runtime?: {
    EventsOn?: (name: string, handler: EventHandler) => RuntimeUnsubscribe | void;
  };
  wails?: {
    EventsOn?: (name: string, handler: EventHandler) => RuntimeUnsubscribe | void;
    Events?: {
      On?: (name: string, handler: EventHandler) => RuntimeUnsubscribe | void;
    };
  };
};

const eventName = 'codexStatusChanged';
const validStatuses: CodexStatus[] = ['idle', 'working', 'waiting_confirmation', 'error', 'offline'];

function isCodexStatus(value: unknown): value is CodexStatus {
  return typeof value === 'string' && validStatuses.includes(value as CodexStatus);
}

function normalizeCodexStatus(value: unknown): CodexStatus | undefined {
  if (value === 'waiting') {
    return 'waiting_confirmation';
  }

  return isCodexStatus(value) ? value : undefined;
}

function extractStatus(payload: unknown): CodexStatus | undefined {
  const status = normalizeCodexStatus(payload);
  if (status) {
    return status;
  }

  if (Array.isArray(payload)) {
    return extractStatus(payload[0]);
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    return extractStatus(
      record.status ??
        record.Status ??
        record.data ??
        record.Data ??
        record.detail ??
        record.Detail ??
        record.state ??
        record.State
    );
  }

  return undefined;
}

function extractOther(payload: unknown): Partial<OtherStatusSnapshot> | undefined {
  if (Array.isArray(payload)) {
    return extractOther(payload[0]);
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const otherStatus = record.otherStatus ?? record.OtherStatus;
    const otherCount = record.otherCount ?? record.OtherCount;
    const otherCwds = record.otherCwds ?? record.OtherCWDs;
    const next: Partial<OtherStatusSnapshot> = {};

    if (otherStatus !== undefined) {
      next.status = normalizeCodexStatus(otherStatus) ?? '';
    }
    if (typeof otherCount === 'number' && Number.isFinite(otherCount)) {
      next.count = Math.max(0, otherCount);
    }
    if (Array.isArray(otherCwds)) {
      next.cwds = otherCwds.filter((cwd): cwd is string => typeof cwd === 'string');
    }

    if ('status' in next || 'count' in next || 'cwds' in next) {
      return next;
    }

    return extractOther(record.data ?? record.Data ?? record.detail ?? record.Detail);
  }

  return undefined;
}

function extractCwd(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    return extractCwd(payload[0]);
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const cwd = record.cwd ?? record.CWD ?? record.Cwd;
    if (typeof cwd === 'string') {
      return cwd;
    }

    return extractCwd(record.data ?? record.Data ?? record.detail ?? record.Detail);
  }

  return undefined;
}

function extractStringField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

function extractSessions(payload: unknown): SessionSnapshot[] | undefined {
  if (Array.isArray(payload)) {
    const sessions = payload.flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const record = item as Record<string, unknown>;
      const status = normalizeCodexStatus(record.status ?? record.Status);
      if (!status) {
        return [];
      }

      return [
        {
          sessionId: extractStringField(record, 'sessionId', 'SessionID', 'session_id'),
          cwd: extractStringField(record, 'cwd', 'CWD', 'Cwd'),
          status,
          updatedAt: extractStringField(record, 'updatedAt', 'UpdatedAt', 'updated_at')
        }
      ];
    });
    return sessions.length > 0 ? sessions : undefined;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const sessions = record.sessions ?? record.Sessions;
    if (sessions !== undefined) {
      return extractSessions(sessions) ?? [];
    }
    return extractSessions(record.data ?? record.Data ?? record.detail ?? record.Detail);
  }

  return undefined;
}

function subscribeRuntime(handler: EventHandler): RuntimeUnsubscribe | undefined {
  const currentWindow = window as WailsLikeWindow;
  const eventsOn =
    currentWindow.runtime?.EventsOn ??
    currentWindow.wails?.EventsOn ??
    currentWindow.wails?.Events?.On;

  if (eventsOn) {
    const unsubscribe = eventsOn(eventName, handler);
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }

  return Events.On(eventName, handler);
}

export function createStatusStore(initialStatus: CodexStatus = 'offline', initialCwd = '') {
  let currentStatus = initialStatus;
  let currentCwd = initialCwd;
  let currentOther: OtherStatusSnapshot = { status: '', count: 0, cwds: [] };
  let currentSessions: SessionSnapshot[] = [];
  const listeners = new Set<Listener>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const setStatus = (nextStatus: CodexStatus) => {
    if (nextStatus === currentStatus) {
      return;
    }

    currentStatus = nextStatus;
    notify();
  };

  const setCwd = (nextCwd: string) => {
    if (nextCwd === currentCwd) {
      return;
    }

    currentCwd = nextCwd;
    notify();
  };

  const setOther = (nextOther: Partial<OtherStatusSnapshot>) => {
    const status = nextOther.status ?? currentOther.status;
    const count = nextOther.count ?? currentOther.count;
    const cwds = nextOther.cwds ?? currentOther.cwds;
    const cwdsChanged = cwds.length !== currentOther.cwds.length || cwds.some((cwd, index) => cwd !== currentOther.cwds[index]);

    if (status === currentOther.status && count === currentOther.count && !cwdsChanged) {
      return;
    }

    currentOther = { status, count, cwds };
    notify();
  };

  const setSessions = (nextSessions: SessionSnapshot[]) => {
    const sessionsChanged =
      nextSessions.length !== currentSessions.length ||
      nextSessions.some((session, index) => {
        const current = currentSessions[index];
        return (
          !current ||
          session.sessionId !== current.sessionId ||
          session.cwd !== current.cwd ||
          session.status !== current.status ||
          session.updatedAt !== current.updatedAt
        );
      });

    if (!sessionsChanged) {
      return;
    }

    currentSessions = nextSessions;
    notify();
  };

  const handlePayload = (payload: unknown) => {
    const nextStatus = extractStatus(payload);
    const nextCwd = extractCwd(payload);
    const nextOther = extractOther(payload);
    const nextSessions = extractSessions(payload);
    if (nextStatus) {
      setStatus(nextStatus);
    }
    if (nextCwd !== undefined) {
      setCwd(nextCwd);
    }
    if (nextOther) {
      setOther(nextOther);
    }
    if (nextSessions) {
      setSessions(nextSessions);
    }
  };

  const handleDomEvent = (event: Event) => {
    handlePayload((event as CustomEvent<unknown>).detail);
  };

  const runtimeUnsubscribe = subscribeRuntime(handlePayload);
  window.addEventListener(eventName, handleDomEvent);

  return {
    getSnapshot: () => currentStatus,
    getCwdSnapshot: () => currentCwd,
    getOtherSnapshot: () => currentOther,
    getSessionsSnapshot: () => currentSessions,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setStatus,
    destroy: () => {
      runtimeUnsubscribe?.();
      window.removeEventListener(eventName, handleDomEvent);
      listeners.clear();
    }
  };
}

export type StatusStore = ReturnType<typeof createStatusStore>;

export const statusStore = createStatusStore();
