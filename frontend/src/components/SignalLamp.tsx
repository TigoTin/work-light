import type { CodexStatus } from '../statusStore';

type LampColor = 'red' | 'yellow' | 'green';

type SignalLampProps = {
  color: LampColor;
  status: CodexStatus;
  active: boolean;
};

export function SignalLamp({ color, status, active }: SignalLampProps) {
  const alternating = status === 'working';
  const dimmed = status === 'offline';
  const className = [
    'signal-lamp',
    `lamp-${color}`,
    active ? 'lamp-active' : 'lamp-muted',
    alternating ? 'lamp-alternating' : '',
    dimmed ? 'lamp-dimmed' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      aria-hidden="true"
      className={className}
      data-animation={alternating ? 'alternating' : active ? 'steady' : 'dim'}
      data-testid={`lamp-${color}`}
    />
  );
}
