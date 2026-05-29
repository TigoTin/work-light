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
  SetPosition: vi.fn(() => Promise.resolve())
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

    expect(screen.getByTestId('signal-shell')).toHaveClass(
      'pixel-shell',
      'overflow-guard',
      'capsule-shell',
      'horizontal-shell'
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

  it('marks the shell so bottom controls can be hidden until hover or keyboard focus', () => {
    render(<App initialStatus="idle" />);

    expect(screen.getByTestId('signal-shell')).toHaveClass('tools-auto-hide');
  });

  it('toggles always-on-top through the Wails window API', async () => {
    render(<App initialStatus="idle" />);

    const pinButton = screen.getByRole('button', { name: '取消置顶' });
    fireEvent.click(pinButton);

    expect(windowApi.SetAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: '固定置顶' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '固定置顶' }));

    expect(windowApi.SetAlwaysOnTop).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: '取消置顶' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('minimises through the Wails window API without applying the local minimized shell', async () => {
    render(<App initialStatus="idle" />);

    fireEvent.click(screen.getByRole('button', { name: '最小化' }));

    expect(windowApi.Minimise).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('signal-shell')).not.toHaveClass('is-minimized');
  });

  it('clears an error status back to idle from the window controls', async () => {
    render(<App initialStatus="error" />);

    const clearButton = screen.getByRole('button', { name: '清除错误' });
    expect(clearButton).toBeEnabled();

    fireEvent.click(clearButton);

    expect(screen.getByLabelText('Codex status IDLE')).toHaveTextContent('IDLE');
  });

  it('keeps the clear error control enabled without changing idle status', async () => {
    render(<App initialStatus="idle" />);

    const clearButton = screen.getByRole('button', { name: '清除错误' });
    expect(clearButton).toBeEnabled();

    fireEvent.click(clearButton);

    expect(screen.getByLabelText('Codex status IDLE')).toHaveTextContent('IDLE');
  });
});
