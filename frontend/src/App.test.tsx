import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

type TestWorkArea = {
  X: number;
  Y: number;
  Width: number;
  Height: number;
};

type TestScreen = {
  WorkArea: TestWorkArea;
  PhysicalWorkArea?: TestWorkArea;
};

const windowApi = vi.hoisted(() => ({
  Minimise: vi.fn(() => Promise.resolve()),
  SetAlwaysOnTop: vi.fn(() => Promise.resolve()),
  SetPosition: vi.fn(() => Promise.resolve()),
  SetSize: vi.fn(() => Promise.resolve()),
  Show: vi.fn(() => Promise.resolve())
}));

const screensApi = vi.hoisted(() => ({
  GetPrimary: vi.fn<() => Promise<TestScreen>>(() =>
    Promise.resolve({
      WorkArea: {
        X: 40,
        Y: 20,
        Width: 1280,
        Height: 720
      }
    })
  )
}));

vi.mock('@wailsio/runtime', () => ({
  Window: windowApi,
  Screens: screensApi,
  Events: {
    On: vi.fn(),
    Off: vi.fn()
  }
}));

const statuses = [
  ['idle', 'IDLE', 'status-idle'],
  ['working', 'WORK', 'status-working'],
  ['waiting_confirmation', 'WAIT', 'status-waiting'],
  ['error', 'ERR', 'status-error'],
  ['offline', 'OFF', 'status-offline']
] as const;

describe('App signal states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(statuses)('renders %s with the expected shell class, label, and pulse', (status, label, className) => {
    render(<App initialStatus={status} />);

    expect(screen.getByTestId('signal-shell')).toHaveClass(className);
    expect(screen.getByLabelText(`Codex status ${label}`)).toHaveTextContent(label);
    expect(screen.getByTestId('status-pulse')).toHaveClass(`status-pulse-${status}`);
    expect(screen.getByTestId('status-pulse')).toHaveAttribute('data-status', status);
  });

  it('marks all three lamps as alternating while working', () => {
    render(<App initialStatus="working" />);

    expect(screen.getByTestId('lamp-red')).toHaveAttribute('data-animation', 'alternating');
    expect(screen.getByTestId('lamp-yellow')).toHaveAttribute('data-animation', 'alternating');
    expect(screen.getByTestId('lamp-green')).toHaveAttribute('data-animation', 'alternating');
  });

  it('uses compact overflow-safe anchors for the small floating window', () => {
    render(<App initialStatus="idle" />);

    expect(screen.getByTestId('shell-layout')).toHaveClass('pixel-shell-layout', 'tools-auto-hide');
    expect(screen.getByTestId('signal-shell')).toHaveClass(
      'pixel-shell',
      'overflow-guard',
      'capsule-shell',
      'horizontal-shell',
      'main-surface'
    );
    expect(screen.getByTestId('status-label')).toHaveAttribute('title', 'IDLE');
  });

  it('marks the lamp container as horizontal for the capsule layout', () => {
    render(<App initialStatus="idle" />);

    expect(screen.getByTestId('lamp-row')).toHaveClass('lamp-row', 'lamp-row-horizontal');
  });

  it('keeps the waiting label text and accessible metadata unchanged beside the pulse', () => {
    render(<App initialStatus="waiting_confirmation" />);

    const label = screen.getByTestId('status-label');
    expect(label).toHaveTextContent('WAIT');
    expect(label).toHaveAttribute('title', 'WAIT');
    expect(label).toHaveAccessibleName('Codex status WAIT');
    expect(screen.getByTestId('status-pulse')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows only the current workspace directory from a Linux cwd with the full cwd as tooltip', () => {
    render(<App initialStatus="idle" initialCwd="/home/user/projects/work-light" />);

    const workspace = screen.getByTestId('workspace-label');
    expect(workspace).toHaveTextContent('work-light');
    expect(workspace).toHaveAttribute('title', '/home/user/projects/work-light');
  });

  it('shows only the current workspace directory from a Windows cwd', () => {
    render(<App initialStatus="idle" initialCwd={'C:\\Users\\dev\\project\\work-light'} />);

    const workspace = screen.getByTestId('workspace-label');
    expect(workspace).toHaveTextContent('work-light');
    expect(workspace).toHaveAttribute('title', 'C:\\Users\\dev\\project\\work-light');
  });

  it('keeps the workspace label collapsible without changing lamp or status anchors', () => {
    render(<App initialStatus="idle" initialCwd="/tmp/a-very-long-workspace-name-that-must-not-push-fixed-ui" />);

    expect(screen.getByTestId('workspace-label')).toHaveClass('workspace-label');
    expect(screen.getByTestId('workspace-label').closest('.shell-header')).not.toBeNull();
    expect(screen.getByTestId('lamp-row')).toHaveClass('lamp-row-horizontal');
    expect(screen.getByTestId('status-label')).toHaveClass('status-band');
  });

  it('shows a compact other-session badge with status class and workspace basenames', () => {
    render(<App initialStatus="idle" initialCwd="/home/user/projects/work-light" />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('codexStatusChanged', {
          detail: {
            status: 'idle',
            otherStatus: 'error',
            otherCount: 2,
            otherCwds: ['/home/user/projects/alpha', '/home/user/projects/beta']
          }
        })
      );
    });

    const badge = screen.getByTestId('other-status-badge');
    expect(badge).toHaveTextContent('+2');
    expect(badge).toHaveClass('other-status-badge', 'other-status-error');
    expect(badge).toHaveAttribute('title', 'Other sessions: 2; highest status: error; workspaces: alpha, beta');
    expect(badge).toHaveAccessibleName('Other sessions: 2; highest status: error; workspaces: alpha, beta');
    expect(badge).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a compact workspace list from the other-session badge', () => {
    render(<App initialStatus="idle" initialCwd="/home/user/projects/work-light" />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('codexStatusChanged', {
          detail: {
            status: 'idle',
            otherStatus: 'waiting_confirmation',
            otherCount: 2,
            otherCwds: ['/home/user/projects/alpha', '/home/user/projects/beta']
          }
        })
      );
    });

    const badge = screen.getByTestId('other-status-badge');
    fireEvent.click(badge);

    expect(badge).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('other-session-popover')).toHaveTextContent('alpha');
    expect(screen.getByTestId('other-session-popover')).toHaveTextContent('beta');
  });

  it('switches the displayed workspace when an other-session item is clicked', () => {
    render(<App initialStatus="idle" initialCwd="/home/user/projects/work-light" />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('codexStatusChanged', {
          detail: {
            status: 'idle',
            cwd: '/home/user/projects/work-light',
            otherStatus: 'waiting_confirmation',
            otherCount: 1,
            otherCwds: ['/home/user/projects/alpha'],
            sessions: [
              { sessionId: 'current', cwd: '/home/user/projects/work-light', status: 'idle', updatedAt: '2026-05-30T10:00:00Z' },
              { sessionId: 'other', cwd: '/home/user/projects/alpha', status: 'waiting_confirmation', updatedAt: '2026-05-30T10:00:01Z' }
            ]
          }
        })
      );
    });

    fireEvent.click(screen.getByTestId('other-status-badge'));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to workspace alpha' }));

    expect(screen.getByTestId('workspace-label')).toHaveTextContent('alpha');
    expect(screen.getByTestId('workspace-label')).toHaveClass('workspace-label-selected');
    expect(screen.getByLabelText('Codex status WAIT')).toHaveTextContent('WAIT');
    expect(screen.getByTestId('other-status-badge')).toHaveTextContent('+1');
  });

  it('clears the selected workspace when that session disappears', () => {
    render(<App initialStatus="idle" initialCwd="/home/user/projects/work-light" />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('codexStatusChanged', {
          detail: {
            status: 'idle',
            cwd: '/home/user/projects/work-light',
            otherStatus: 'waiting_confirmation',
            otherCount: 1,
            otherCwds: ['/home/user/projects/alpha'],
            sessions: [
              { sessionId: 'current', cwd: '/home/user/projects/work-light', status: 'idle', updatedAt: '2026-05-30T10:00:00Z' },
              { sessionId: 'other', cwd: '/home/user/projects/alpha', status: 'waiting_confirmation', updatedAt: '2026-05-30T10:00:01Z' }
            ]
          }
        })
      );
    });

    fireEvent.click(screen.getByTestId('other-status-badge'));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to workspace alpha' }));

    expect(screen.getByTestId('workspace-label')).toHaveTextContent('alpha');

    act(() => {
      window.dispatchEvent(
        new CustomEvent('codexStatusChanged', {
          detail: {
            status: 'idle',
            cwd: '/home/user/projects/work-light',
            otherStatus: '',
            otherCount: 0,
            otherCwds: [],
            sessions: [{ sessionId: 'current', cwd: '/home/user/projects/work-light', status: 'idle', updatedAt: '2026-05-30T10:00:02Z' }]
          }
        })
      );
    });

    expect(screen.getByTestId('workspace-label')).toHaveTextContent('work-light');
    expect(screen.getByTestId('workspace-label')).not.toHaveClass('workspace-label-selected');
  });

  it('summarizes hidden workspaces in the other-session popover', () => {
    render(<App initialStatus="idle" initialCwd="/home/user/projects/work-light" />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('codexStatusChanged', {
          detail: {
            status: 'idle',
            otherStatus: 'working',
            otherCount: 5,
            otherCwds: [
              '/home/user/projects/alpha',
              '/home/user/projects/beta',
              '/home/user/projects/gamma',
              '/home/user/projects/delta',
              '/home/user/projects/epsilon'
            ]
          }
        })
      );
    });

    fireEvent.click(screen.getByTestId('other-status-badge'));

    expect(screen.getByTestId('other-session-popover')).toHaveTextContent('alpha');
    expect(screen.getByTestId('other-session-popover')).toHaveTextContent('gamma');
    expect(screen.getByTestId('other-session-popover')).toHaveTextContent('+2');
  });

  it('does not show the other-session badge when there are no other sessions', () => {
    render(<App initialStatus="idle" initialCwd="/home/user/projects/work-light" />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('codexStatusChanged', {
          detail: {
            status: 'idle',
            otherStatus: 'idle',
            otherCount: 0,
            otherCwds: []
          }
        })
      );
    });

    expect(screen.queryByTestId('other-status-badge')).toBeNull();
  });

  it('places the compact window at the top center of the primary work area after mount', async () => {
    render(<App initialStatus="idle" />);

    await waitFor(() => {
      expect(windowApi.SetPosition).toHaveBeenCalledWith(570, 28);
    });
    expect(screensApi.GetPrimary).toHaveBeenCalledTimes(1);
  });

  it('forces the native window size on first mount before positioning', async () => {
    render(<App initialStatus="idle" />);

    await waitFor(() => {
      expect(windowApi.SetSize).toHaveBeenNthCalledWith(1, 225, 77);
      expect(windowApi.SetPosition).toHaveBeenCalledWith(570, 28);
      expect(windowApi.Show).toHaveBeenCalledTimes(1);
      expect(windowApi.SetSize).toHaveBeenNthCalledWith(2, 224, 76);
    });
    expect(windowApi.SetSize.mock.invocationCallOrder[0]).toBeLessThan(windowApi.SetPosition.mock.invocationCallOrder[0]);
    expect(windowApi.SetPosition.mock.invocationCallOrder[0]).toBeLessThan(windowApi.Show.mock.invocationCallOrder[0]);
    expect(windowApi.Show.mock.invocationCallOrder[0]).toBeLessThan(windowApi.SetSize.mock.invocationCallOrder[1]);
  });

  it('uses logical primary work area coordinates without physical scale correction', async () => {
    screensApi.GetPrimary.mockResolvedValueOnce({
      WorkArea: {
        X: 0,
        Y: 0,
        Width: 1280,
        Height: 752
      },
      PhysicalWorkArea: {
        X: 0,
        Y: 0,
        Width: 2560,
        Height: 1504
      }
    });

    render(<App initialStatus="idle" />);

    await waitFor(() => {
      expect(windowApi.SetPosition).toHaveBeenCalledWith(530, 8);
    });
    expect(screensApi.GetPrimary).toHaveBeenCalledTimes(1);
  });

  it('centers on a work area with negative multi-monitor coordinates', async () => {
    screensApi.GetPrimary.mockResolvedValueOnce({
      WorkArea: {
        X: -1920,
        Y: 0,
        Width: 1920,
        Height: 1080
      }
    });

    render(<App initialStatus="idle" />);

    await waitFor(() => {
      expect(windowApi.SetPosition).toHaveBeenCalledWith(-1070, 8);
    });
    expect(screensApi.GetPrimary).toHaveBeenCalledTimes(1);
  });

  it('keeps the logical window position when physical work area scale is 1', async () => {
    screensApi.GetPrimary.mockResolvedValueOnce({
      WorkArea: {
        X: 40,
        Y: 20,
        Width: 1280,
        Height: 720
      },
      PhysicalWorkArea: {
        X: 40,
        Y: 20,
        Width: 1280,
        Height: 720
      }
    });

    render(<App initialStatus="idle" />);

    await waitFor(() => {
      expect(windowApi.SetPosition).toHaveBeenCalledWith(570, 28);
    });
    expect(screensApi.GetPrimary).toHaveBeenCalledTimes(1);
  });

  it('does not render window controls inside the floating widget', () => {
    render(<App initialStatus="idle" />);

    expect(screen.queryByLabelText('Window controls')).toBeNull();
    expect(screen.queryByRole('button', { name: '取消置顶' })).toBeNull();
    expect(screen.queryByRole('button', { name: '最小化' })).toBeNull();
    expect(screen.queryByRole('button', { name: '清除错误' })).toBeNull();
  });

  it('clears an error status back to idle from the tray clear event', async () => {
    render(<App initialStatus="error" />);

    act(() => {
      window.dispatchEvent(new CustomEvent('workLightClearError'));
    });

    expect(screen.getByLabelText('Codex status IDLE')).toHaveTextContent('IDLE');
  });

  it('keeps the tray clear event harmless when already idle', async () => {
    render(<App initialStatus="idle" />);

    act(() => {
      window.dispatchEvent(new CustomEvent('workLightClearError'));
    });

    expect(screen.getByLabelText('Codex status IDLE')).toHaveTextContent('IDLE');
  });
});
