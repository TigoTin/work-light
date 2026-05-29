import { Screens, Window } from '@wailsio/runtime';

export const WINDOW_WIDTH = 220;
export const WINDOW_HEIGHT = 72;
const TOP_GAP = 8;

export async function placeWindowAtTopCenter() {
  const screen = await Screens.GetPrimary();
  const { WorkArea } = screen;
  const x = Math.round(WorkArea.X + (WorkArea.Width - WINDOW_WIDTH) / 2);
  const y = Math.round(WorkArea.Y + TOP_GAP);

  await Window.SetPosition(x, y);
}
