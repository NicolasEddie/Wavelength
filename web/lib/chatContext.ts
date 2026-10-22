/**
 * What the visitor is looking at, shared between the viewer and the chat panel.
 * The viewer publishes its settings here; the chat sends a snapshot with each question.
 */

export interface ViewerContext {
  slug: string;
  minimum: number;
  stretch: number;
  q: number;
  sigma: number;
  sources: boolean;
  sourceCount: number;
  zoom: number;
}

let viewer: ViewerContext | null = null;

export function setViewerContext(ctx: ViewerContext | null) {
  viewer = ctx;
}

export function getViewerContext(): ViewerContext | null {
  return viewer;
}

/** Ask the chat panel to open (used by the viewer's header button). */
export const OPEN_CHAT_EVENT = "wavelength:open-chat";

export function openChat() {
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}
