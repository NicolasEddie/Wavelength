"use client";

import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CHAT_STATE_EVENT, OPEN_CHAT_EVENT, TOGGLE_CHAT_EVENT, getViewerContext } from "@/lib/chatContext";
import { TARGETS } from "@/lib/targets";

/**
 * "Ask Wavelength": a small astronomy assistant available on every page.
 * Answers stream from /api/chat (Claude). The conversation lives in memory for the
 * session and survives page changes because this component sits in the root layout.
 * Hidden entirely when the server reports no API key.
 */

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const MAX_CHARS = 500;

const STARTERS: Record<string, string[]> = {
  home: ["How does a telescope make a colour image?", "How do optical and radio telescopes differ?", "What is the Whirlpool Galaxy?"],
  learn: ["Why does the atmosphere blur telescope images?", "What does a 3 sigma threshold mean?", "Why is near-infrared light shown as red?"],
  m51: ["Tell me more about the Whirlpool Galaxy", "What is the small galaxy at the top?", "What do my current settings do to this image?"],
  m101: ["Tell me about the Pinwheel Galaxy", "Why are some parts of the arms bluer?", "What do my current settings do to this image?"],
  m104: ["Why is there a dark band across the Sombrero?", "What's in the bright central bulge?", "What do my current settings do to this image?"],
  m13: ["How old are the stars in this cluster?", "Why is source detection hard in the core?", "What do my current settings do to this image?"],
};

function pageOf(path: string): { page: "home" | "viewer" | "learn" | "other"; slug?: string } {
  if (path === "/") return { page: "home" };
  if (path.startsWith("/learn")) return { page: "learn" };
  const m = path.match(/^\/targets\/([a-z0-9]+)/);
  if (m) return { page: "viewer", slug: m[1] };
  return { page: "other" };
}

/** Tiny renderer for the subset of markdown the assistant is told to use: paragraphs, "- " lists, **bold**. */
function renderAnswer(text: string): ReactNode {
  const bold = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold text-fg">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block, i) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*] /.test(l))) {
        return (
          <ul key={i} className="m-0 list-disc space-y-1 pl-5 marker:text-accent">
            {lines.map((l, j) => <li key={j}>{bold(l.replace(/^\s*[-*] /, ""))}</li>)}
          </ul>
        );
      }
      return <p key={i} className="m-0">{bold(block)}</p>;
    });
}

export default function AskWavelength() {
  const pathname = usePathname();
  const where = pageOf(pathname);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(Boolean(d.enabled));
        if (d.enabled) document.documentElement.dataset.chat = "on";
      })
      .catch(() => setEnabled(false));
  }, []);

  const show = useCallback(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    openerRef.current?.focus?.();
  }, []);

  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const toggle = () => (openRef.current ? close() : show());
    window.addEventListener(OPEN_CHAT_EVENT, show);
    window.addEventListener(TOGGLE_CHAT_EVENT, toggle);
    return () => {
      window.removeEventListener(OPEN_CHAT_EVENT, show);
      window.removeEventListener(TOGGLE_CHAT_EVENT, toggle);
    };
  }, [show, close]);

  // Let buttons elsewhere (the viewer's "Ask") reflect whether the panel is open.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CHAT_STATE_EVENT, { detail: open }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = async (text: string) => {
    const question = text.trim().slice(0, MAX_CHARS);
    if (!question || busy) return;
    const history: Message[] = [...messages.filter((m) => !m.error), { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const viewer = where.page === "viewer" ? getViewerContext() : null;
    const update = (content: string, error = false) =>
      setMessages((ms) => [...ms.slice(0, -1), { role: "assistant", content, error }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          context: { page: where.page, viewer },
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        update(data.error ?? "Something went wrong. Please try again.", true);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        update(acc);
      }
      if (!acc.trim()) update("I couldn't come up with an answer. Please try rephrasing.", true);
    } catch {
      update("Couldn't reach the server. Check your connection and try again.", true);
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;

  const viewerCtx = where.page === "viewer" ? getViewerContext() : null;
  const target = where.slug ? TARGETS.find((t) => t.slug === where.slug) : undefined;
  const contextLabel = target
    ? `Looking at ${target.short}${viewerCtx ? ` · stretch ${viewerCtx.stretch.toFixed(1)}` : ""}`
    : where.page === "learn"
      ? "On the science page"
      : "Ask about astronomy or this site";
  const starters = STARTERS[where.slug ?? where.page] ?? STARTERS.home;

  return (
    <>
      {/* Floating opener; the viewer has its own button in the header instead. */}
      {!open && where.page !== "viewer" && (
        <button
          type="button"
          onClick={show}
          className="btn btn-primary fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-5 z-40 gap-2 shadow-[0_12px_40px_rgba(0,0,0,.55)]"
        >
          <Sparkle />
          Ask Wavelength
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Ask Wavelength"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[78svh] flex-col overflow-hidden rounded-t-2xl border border-rule-hi bg-ink/95 shadow-[0_-20px_80px_rgba(0,0,0,.6)] backdrop-blur-md sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100svh-40px))] sm:w-[400px] sm:rounded-2xl"
        >
          <header className="flex items-center gap-3 border-b border-rule px-4 py-3">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent/15 text-accent"><Sparkle /></span>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 font-display text-xl leading-tight">Ask Wavelength</h2>
              <p className="m-0 truncate text-[12px] text-muted">{contextLabel}</p>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={() => setMessages([])} disabled={busy} className="ulink text-[12px]">
                Clear
              </button>
            )}
            <button type="button" onClick={close} aria-label="Close chat" className="grid h-9 w-9 place-items-center rounded-full text-muted ring-1 ring-rule-hi hover:text-fg">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-[14px] leading-relaxed text-soft">
                  Ask anything about astronomy, telescopes, or what you&rsquo;re looking at. I can see which page and settings
                  you have open.
                </p>
                <div className="flex flex-col items-start gap-2">
                  {starters.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-rule-hi px-3.5 py-2 text-left text-[13px] text-soft transition-colors hover:border-accent hover:text-fg"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) =>
                m.role === "user" ? (
                  <p key={i} className="m-0 max-w-[85%] self-end rounded-2xl rounded-br-md bg-raised px-3.5 py-2 text-[14px] text-fg">
                    {m.content}
                  </p>
                ) : (
                  <div
                    key={i}
                    className={`flex max-w-[95%] flex-col gap-2 text-[14px] leading-relaxed ${m.error ? "text-accent" : "text-soft"}`}
                  >
                    {m.content ? renderAnswer(m.content) : <Thinking />}
                  </div>
                ),
              )
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-rule px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-3"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-rule-hi bg-black/30 p-1.5 pl-3.5 focus-within:border-accent">
              <label htmlFor="ask-input" className="sr-only">Your question</label>
              <textarea
                id="ask-input"
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={MAX_CHARS}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Ask about this galaxy, telescopes, the sky…"
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14px] text-fg outline-none placeholder:text-muted"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="grid h-9 w-9 flex-none place-items-center rounded-full bg-fg text-ink transition-opacity disabled:opacity-30"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12V2M2.5 6.5 7 2l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
              </button>
            </div>
            <p className="m-0 mt-1.5 flex justify-between px-1 text-[11px] text-muted">
              <span>Answers by Claude (AI) · can make mistakes</span>
              {input.length > MAX_CHARS - 100 && <span className="tabular-nums">{input.length}/{MAX_CHARS}</span>}
            </p>
          </form>
        </section>
      )}
    </>
  );
}

function Sparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 1.5c.4 2.9 1.7 4.2 4.6 4.6-2.9.4-4.2 1.7-4.6 4.6-.4-2.9-1.7-4.2-4.6-4.6C6.3 5.7 7.6 4.4 8 1.5Z" />
      <path d="M12.6 10.2c.2 1.3.8 1.9 2.1 2.1-1.3.2-1.9.8-2.1 2.1-.2-1.3-.8-1.9-2.1-2.1 1.3-.2 1.9-.8 2.1-2.1Z" opacity=".6" />
    </svg>
  );
}

function Thinking() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
