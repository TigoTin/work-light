import type { ReactNode } from 'react';
import type { CodexStatus } from '../statusStore';

type PixelShellProps = {
  status: CodexStatus;
  pinned: boolean;
  workspaceName?: string;
  workspaceCwd?: string;
  workspaceSelected?: boolean;
  otherStatusBadge?: ReactNode;
  otherStatusPopover?: ReactNode;
  children: ReactNode;
  onTogglePin: () => void;
  onMinimize: () => void;
  onClearError: () => void;
};

const statusClass: Record<CodexStatus, string> = {
  idle: 'status-idle',
  working: 'status-working',
  waiting_confirmation: 'status-waiting',
  error: 'status-error',
  offline: 'status-offline'
};

export function PixelShell({
  status,
  pinned,
  workspaceName = '',
  workspaceCwd = '',
  workspaceSelected = false,
  otherStatusBadge,
  otherStatusPopover,
  children,
  onTogglePin,
  onMinimize,
  onClearError
}: PixelShellProps) {
  const className = [
    'pixel-shell',
    'capsule-shell',
    'horizontal-shell',
    'overflow-guard',
    'tools-auto-hide',
    statusClass[status],
    pinned ? 'is-pinned' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={className} data-testid="signal-shell" aria-label="Codex Signal floating status window">
      <div className="shell-frame" aria-hidden="true" />
      <header className="shell-header">
        <div className={`pixel-title${otherStatusBadge ? ' pixel-title-with-badge' : ''}`}>
          <span className="brand-label">CODEX</span>
          {otherStatusBadge}
          <span
            className={[
              'workspace-label',
              workspaceName ? '' : 'workspace-label-empty',
              workspaceSelected ? 'workspace-label-selected' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            title={workspaceCwd}
            aria-label={workspaceName ? `Codex workspace ${workspaceName}` : undefined}
            aria-hidden={workspaceName ? undefined : true}
            data-testid="workspace-label"
          >
            {workspaceName || '-'}
          </span>
        </div>
        <span className="connection-dot" title={`connection ${status}`} aria-label={`connection ${status}`} />
      </header>
      {otherStatusPopover}

      <div className="shell-body">{children}</div>

      <div className="tool-row" aria-label="Window controls">
        <button
          className="tool-button"
          type="button"
          title={pinned ? '取消置顶' : '固定置顶'}
          aria-label={pinned ? '取消置顶' : '固定置顶'}
          aria-pressed={pinned}
          onClick={onTogglePin}
        >
          {pinned ? '◆' : '◇'}
        </button>
        <button
          className="tool-button"
          type="button"
          title="最小化"
          aria-label="最小化"
          onClick={onMinimize}
        >
          _
        </button>
        <button
          className="tool-button"
          type="button"
          title="清除错误"
          aria-label="清除错误"
          onClick={onClearError}
        >
          ×
        </button>
      </div>
    </section>
  );
}
