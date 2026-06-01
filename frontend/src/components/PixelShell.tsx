import type { ReactNode } from 'react';
import type { CodexStatus } from '../statusStore';

type PixelShellProps = {
  status: CodexStatus;
  workspaceName?: string;
  workspaceCwd?: string;
  workspaceSelected?: boolean;
  otherStatusBadge?: ReactNode;
  otherStatusPopover?: ReactNode;
  children: ReactNode;
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
  workspaceName = '',
  workspaceCwd = '',
  workspaceSelected = false,
  otherStatusBadge,
  otherStatusPopover,
  children
}: PixelShellProps) {
  const className = [
    'pixel-shell',
    'capsule-shell',
    'horizontal-shell',
    'overflow-guard',
    'main-surface',
    statusClass[status]
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="pixel-shell-layout tools-auto-hide" data-testid="shell-layout">
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
      </section>
    </div>
  );
}
