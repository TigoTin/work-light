import type { CodexStatus } from './statusStore';

type CssInvariant = {
  selector: string;
  declarations: Record<string, string>;
};

export const visualRegressionContract: {
  statusStates: CodexStatus[];
  layoutClasses: string[];
  shellClasses: string[];
  lampRowClasses: string[];
  statusLabelClass: string;
  workspaceLabelClass: string;
  cssInvariants: CssInvariant[];
} = {
  statusStates: ['idle', 'working', 'waiting_confirmation', 'error', 'offline'],
  layoutClasses: ['pixel-shell-layout', 'tools-auto-hide'],
  shellClasses: ['pixel-shell', 'capsule-shell', 'horizontal-shell', 'overflow-guard', 'main-surface'],
  lampRowClasses: ['lamp-row', 'lamp-row-horizontal'],
  statusLabelClass: 'status-band',
  workspaceLabelClass: 'workspace-label',
  cssInvariants: [
    {
      selector: '.app-root',
      declarations: {
        'min-width': '224px',
        'min-height': '76px',
        overflow: 'hidden',
        background: '#081010'
      }
    },
    {
      selector: '.pixel-shell-layout',
      declarations: {
        width: '220px',
        height: '72px',
        'grid-template-columns': '220px',
        background: '#102020'
      }
    },
    {
      selector: '.pixel-shell',
      declarations: {
        width: '220px',
        height: '72px',
        'min-width': '220px',
        'min-height': '72px',
        overflow: 'hidden'
      }
    },
    {
      selector: '.shell-body',
      declarations: {
        'grid-template-columns': 'auto 18px 64px',
        overflow: 'hidden'
      }
    },
    {
      selector: '.lamp-row',
      declarations: {
        width: '78px',
        'min-width': '78px',
        height: '30px'
      }
    },
    {
      selector: '.status-band',
      declarations: {
        width: '64px',
        'min-width': '64px',
        'max-width': '64px',
        overflow: 'hidden',
        'white-space': 'nowrap'
      }
    },
    {
      selector: '.workspace-label',
      declarations: {
        'min-width': '0',
        'max-width': '100%',
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        'white-space': 'nowrap'
      }
    },
    {
      selector: '.other-session-item',
      declarations: {
        display: 'block',
        overflow: 'hidden'
      }
    },
    {
      selector: '.other-session-summary',
      declarations: {
        display: 'grid',
        'grid-template-columns': '6px minmax(0, 1fr)'
      }
    }
  ]
};
