import { afterEach, describe, expect, it } from 'vitest';
import { createStatusStore } from './statusStore';

type WailsDispatchWindow = Window & {
  _wails?: {
    dispatchWailsEvent?: (event: { name: string; data: unknown }) => void;
  };
};

describe('statusStore', () => {
  afterEach(() => {
    delete (window as Window & { runtime?: unknown }).runtime;
    delete (window as Window & { wails?: unknown }).wails;
  });

  it('updates from browser CustomEvent when no Wails runtime exists', () => {
    const store = createStatusStore('offline');

    window.dispatchEvent(new CustomEvent('codexStatusChanged', { detail: { status: 'working' } }));

    expect(store.getSnapshot()).toBe('working');
  });

  it('keeps status snapshots compatible while storing cwd from payloads', () => {
    const store = createStatusStore('offline');

    window.dispatchEvent(
      new CustomEvent('codexStatusChanged', {
        detail: { status: 'working', cwd: '/home/user/projects/work-light' }
      })
    );

    expect(store.getSnapshot()).toBe('working');
    expect(store.getCwdSnapshot()).toBe('/home/user/projects/work-light');
  });

  it('subscribes through window.runtime.EventsOn when available', () => {
    let eventHandler: ((payload: unknown) => void) | undefined;
    (window as Window & { runtime?: { EventsOn: (name: string, handler: (payload: unknown) => void) => () => void } }).runtime = {
      EventsOn: (name, handler) => {
        expect(name).toBe('codexStatusChanged');
        eventHandler = handler;
        return () => undefined;
      }
    };

    const store = createStatusStore('idle');
    eventHandler?.({ status: 'error' });

    expect(store.getSnapshot()).toBe('error');
  });

  it('updates from Wails runtime events that wrap payloads in data', () => {
    const store = createStatusStore('idle');
    (window as WailsDispatchWindow)._wails?.dispatchWailsEvent?.({
      name: 'codexStatusChanged',
      data: { status: 'waiting_confirmation' }
    });

    expect(store.getSnapshot()).toBe('waiting_confirmation');
    store.destroy();
  });

  it('updates from Wails runtime events that wrap Go struct fields in data', () => {
    const store = createStatusStore('working');
    (window as WailsDispatchWindow)._wails?.dispatchWailsEvent?.({
      name: 'codexStatusChanged',
      data: { Status: 'idle', CWD: '/home/user/projects/work-light' }
    });

    expect(store.getSnapshot()).toBe('idle');
    expect(store.getCwdSnapshot()).toBe('/home/user/projects/work-light');
    store.destroy();
  });

  it('updates other session snapshots from Wails events with Go struct fields in data', () => {
    const store = createStatusStore('idle');
    (window as WailsDispatchWindow)._wails?.dispatchWailsEvent?.({
      name: 'codexStatusChanged',
      data: {
        Status: 'idle',
        OtherStatus: 'error',
        OtherCount: 2,
        OtherCWDs: ['/home/user/projects/alpha', '/home/user/projects/beta']
      }
    });

    expect(store.getSnapshot()).toBe('idle');
    expect(store.getOtherSnapshot()).toEqual({
      status: 'error',
      count: 2,
      cwds: ['/home/user/projects/alpha', '/home/user/projects/beta']
    });
    store.destroy();
  });
});
