import { Events } from '@wailsio/runtime';

export type CodexStatus = 'idle' | 'working' | 'waiting_confirmation' | 'error' | 'offline';

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

function extractStatus(payload: unknown): CodexStatus | undefined {
  if (isCodexStatus(payload)) {
    return payload;
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

  const handlePayload = (payload: unknown) => {
    const nextStatus = extractStatus(payload);
    const nextCwd = extractCwd(payload);
    if (nextStatus) {
      setStatus(nextStatus);
    }
    if (nextCwd !== undefined) {
      setCwd(nextCwd);
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
