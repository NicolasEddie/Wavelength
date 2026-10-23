import Anthropic from "@anthropic-ai/sdk";
import { readManifest } from "@/lib/data";
import { buildSystemPrompt, type ChatContext } from "@/lib/chatPrompt";
import { TARGETS } from "@/lib/targets";

/**
 * POST /api/chat — streams an "Ask Wavelength" answer as plain text.
 * GET  /api/chat — { enabled } so the page can hide the chat when no key is configured.
 *
 * Cost guards: short messages, a short history window, a capped answer length, and a
 * per-visitor hourly limit. The limiter lives in this server instance's memory, so it is
 * best-effort across Vercel's instances; the Anthropic console spend limit is the hard cap.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-haiku-5-5";
const MAX_MESSAGE_CHARS = 500;
const MAX_HISTORY = 10;
const MAX_ANSWER_TOKENS = 700;
const LIMIT_PER_HOUR = 20;

const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= LIMIT_PER_HOUR) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return false;
}

const enabled = () => Boolean(process.env.ANTHROPIC_API_KEY) || process.env.CHAT_MOCK === "1";

export function GET() {
  return Response.json({ enabled: enabled() });
}

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

const num = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;

/** Accept only known fields with sane values from the browser. */
function cleanContext(raw: unknown): ChatContext {
  const r = (raw ?? {}) as Record<string, unknown>;
  const page = ["home", "viewer", "learn"].includes(r.page as string) ? (r.page as ChatContext["page"]) : "other";
  const v = r.viewer as Record<string, unknown> | undefined;
  if (page !== "viewer" || !v || !TARGETS.some((t) => t.slug === v.slug)) return { page: page === "viewer" ? "other" : page };
  const m = readManifest(v.slug as string);
  const sigma = num(v.sigma, 1, 10) ?? m.defaults.nSigma;
  return {
    page,
    viewer: {
      slug: v.slug as string,
      minimum: num(v.minimum, 0, 1) ?? m.defaults.minimum,
      stretch: num(v.stretch, 0.5, 30) ?? m.defaults.stretch,
      q: num(v.q, 0.5, 20) ?? m.defaults.q,
      sigma,
      sources: v.sources === true,
      sourceCount: m.detection.counts[sigma.toFixed(1)] ?? 0,
      zoom: num(v.zoom, 1, 8) ?? 1,
      defaults: { minimum: m.defaults.minimum, stretch: m.defaults.stretch, q: m.defaults.q, sigma: m.defaults.nSigma },
      fovArcmin: m.fovArcmin,
    },
  };
}

function cleanMessages(raw: unknown): IncomingMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const msgs = raw
    .slice(-MAX_HISTORY)
    .filter(
      (m): m is IncomingMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, m.role === "user" ? MAX_MESSAGE_CHARS : 4000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

const textStream = (chunks: AsyncIterable<string>) =>
  new Response(
    new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        try {
          for await (const c of chunks) controller.enqueue(enc.encode(c));
        } catch {
          controller.enqueue(enc.encode("\n\nSorry, the answer was cut off. Please try again."));
        }
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
  );

async function* mockAnswer(question: string, ctx: ChatContext) {
  const where = ctx.viewer ? `You're looking at ${ctx.viewer.slug.toUpperCase()} with stretch ${ctx.viewer.stretch}.` : "";
  const text = `**Test mode.** This is a stand-in answer used while building the chat. ${where} You asked: "${question.slice(0, 80)}".\n\n- Real answers come from Claude once an API key is configured.\n- Streaming, limits and context all work the same way.`;
  for (const word of text.split(/(?<= )/)) {
    yield word;
    await new Promise((r) => setTimeout(r, 25));
  }
}

export async function POST(req: Request) {
  if (!enabled()) return Response.json({ error: "Chat isn't available right now." }, { status: 503 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return Response.json(
      { error: "You've reached the question limit for now. Try again in an hour." },
      { status: 429 },
    );
  }

  let body: { messages?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const messages = cleanMessages(body.messages);
  if (!messages) return Response.json({ error: "Please type a question." }, { status: 400 });
  const ctx = cleanContext(body.context);

  if (process.env.CHAT_MOCK === "1" && !process.env.ANTHROPIC_API_KEY) {
    return textStream(mockAnswer(messages[messages.length - 1].content, ctx));
  }

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_ANSWER_TOKENS,
    system: buildSystemPrompt(ctx),
    messages,
    output_config: { effort: "low" },
  });
  const events = stream[Symbol.asyncIterator]();

  // Wait for the first event before answering, so API errors (bad key, overload, bad request)
  // return a real status and a clear message instead of a broken stream.
  let first: IteratorResult<Anthropic.MessageStreamEvent>;
  try {
    first = await events.next();
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    console.error("[chat] Anthropic API error", status, (err as Error).message);
    const message =
      status === 401 || status === 403
        ? "Chat isn't configured correctly right now."
        : status === 429 || status === 529
          ? "The assistant is busy right now. Please try again in a moment."
          : "Something went wrong answering that. Please try again.";
    return Response.json({ error: message, code: status }, { status: status >= 500 ? 502 : status === 429 ? 429 : 500 });
  }

  async function* answer() {
    const handle = (ev: Anthropic.MessageStreamEvent) =>
      ev.type === "content_block_delta" && ev.delta.type === "text_delta" ? ev.delta.text : "";
    if (!first.done) yield handle(first.value);
    try {
      for (;;) {
        const next = await events.next();
        if (next.done) break;
        const text = handle(next.value);
        if (text) yield text;
      }
    } catch (err) {
      console.error("[chat] stream interrupted", (err as Error).message);
      throw err;
    }
  }
  return textStream(answer());
}
