import { render, screen } from '@testing-library/react';
// @ts-expect-error Node types are intentionally not a frontend dependency.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import App from './App';
import { visualRegressionContract } from './visualContract';

declare const process: {
  cwd: () => string;
};

let stylesheet = '';

beforeAll(async () => {
  stylesheet = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8');
});

function cssBlockFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 'm'));

  return match?.groups?.body ?? '';
}

describe('small window visual regression contract', () => {
  it.each(visualRegressionContract.statusStates)('keeps stable shell and status anchors for %s', (status) => {
    render(<App initialStatus={status} initialCwd="/home/user/projects/work-light" />);

    expect(screen.getByTestId('shell-layout')).toHaveClass(...visualRegressionContract.layoutClasses);
    expect(screen.getByTestId('signal-shell')).toHaveClass(...visualRegressionContract.shellClasses, `status-${status === 'waiting_confirmation' ? 'waiting' : status}`);
    expect(screen.getByTestId('lamp-row')).toHaveClass(...visualRegressionContract.lampRowClasses);
    expect(screen.getByTestId('status-label')).toHaveClass(visualRegressionContract.statusLabelClass);
    expect(screen.getByTestId('workspace-label')).toHaveClass(visualRegressionContract.workspaceLabelClass);
  });

  it.each(visualRegressionContract.cssInvariants)('keeps CSS invariant for %s', ({ selector, declarations }) => {
    const block = cssBlockFor(selector);

    expect(block, `${selector} should exist in styles.css`).not.toBe('');

    for (const [property, value] of Object.entries(declarations)) {
      expect(block).toContain(`${property}: ${value};`);
    }
  });
});
