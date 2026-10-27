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

/** Open the chat panel if it's closed, close it if it's open. */
export const TOGGLE_CHAT_EVENT = "wavelength:toggle-chat";
/** Fired by the chat panel whenever it opens or closes; `detail` is true when open. */
export const CHAT_STATE_EVENT = "wavelength:chat-state";

export function toggleChat() {
  window.dispatchEvent(new Event(TOGGLE_CHAT_EVENT));
}
