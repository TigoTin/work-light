import { Screens, Window } from '@wailsio/runtime';

export const MAIN_SURFACE_WIDTH = 220;
export const WINDOW_CHROME_PADDING = 4;
export const WINDOW_WIDTH = MAIN_SURFACE_WIDTH + WINDOW_CHROME_PADDING;
export const WINDOW_HEIGHT = 76;
const TOP_GAP = 8;

function afterNextFrame() {
  return new Promise<void>((resolve) => {
    const scheduleFrame = globalThis.requestAnimationFrame ?? ((callback: FrameRequestCallback) => globalThis.setTimeout(callback, 0));
    scheduleFrame(() => resolve());
  });
}

export async function placeWindowAtTopCenter() {
  await Window.SetSize(WINDOW_WIDTH + 1, WINDOW_HEIGHT + 1);

  const screen = await Screens.GetPrimary();
  const { WorkArea } = screen;
  const x = Math.round(WorkArea.X + (WorkArea.Width - MAIN_SURFACE_WIDTH) / 2);
  const y = Math.round(WorkArea.Y + TOP_GAP);

  await Window.SetPosition(x, y);
  await Window.Show();
  await afterNextFrame();
  await Window.SetSize(WINDOW_WIDTH, WINDOW_HEIGHT);
}
