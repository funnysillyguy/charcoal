// Charcoal's shared AI: signed-in users chat on the owner's DeepSeek key without ever seeing it.
// The key lives in public.app_secrets (no RLS policies: service role only) and is only used here.
//   POST /ai/chat/completions   OpenAI-compatible proxy (stream or not), DeepSeek Flash only
//   GET  /ai/models             for the Settings connection test
//   GET  /ai/status             is a shared key set, and how much of today's allowance is left
//   POST /ai/key                owner only: { key } to set or replace, { key: null } to remove
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OWNER_ID = "45b54a28-3cce-41a8-9fb1-7a5abf6faf1d"; // @own
const DEFAULT_UPSTREAM = "https://api.deepseek.com/v1";
const ALLOWED_MODELS = ["deepseek-flash"];
const USER_DAILY_TOKENS = 300_000; // output tokens per person per day (~$0.18 at $0.60/M)
const GLOBAL_DAILY_TOKENS = 4_000_000; // whole site per day (~$2.40)
const MAX_TOKENS_CAP = 16000; // a full Canvas page plus thinking; the daily cap still bounds spend

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, accept, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status: number, message: string, type = "charcoal_error") => json({ error: { message, type } }, status);
const today = () => new Date().toISOString().slice(0, 10);

async function userFrom(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

async function secret(name: string): Promise<string | null> {
  const { data } = await admin.from("app_secrets").select("value").eq("name", name).maybeSingle();
  return data?.value ?? null;
}
const sharedKey = () => secret("deepseek_api_key");
// Optional override (testing only); normally unset so requests go to DeepSeek.
const upstream = async () => (await secret("deepseek_upstream")) || DEFAULT_UPSTREAM;

async function usage(userId: string) {
  const d = today();
  const [{ data: mine }, { data: all }] = await Promise.all([
    admin.from("shared_usage").select("output_tokens").eq("user_id", userId).eq("day", d).maybeSingle(),
    admin.from("shared_usage").select("output_tokens").eq("day", d),
  ]);
  const total = (all ?? []).reduce((s: number, r: { output_tokens: number }) => s + Number(r.output_tokens), 0);
  return { mine: Number(mine?.output_tokens ?? 0), total };
}

async function record(userId: string, tokens: number) {
  await admin.rpc("add_shared_usage", { p_user: userId, p_tokens: Math.max(0, Math.round(tokens)) });
}

/** Pass the SSE stream through untouched while watching for the final usage chunk. */
function meter(body: ReadableStream<Uint8Array>, onDone: (tokens: number) => Promise<void>) {
  const dec = new TextDecoder();
  let buf = "";
  let reported: number | null = null;
  let chars = 0;
  const scan = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const j = JSON.parse(payload);
      if (j.usage?.completion_tokens != null) reported = Number(j.usage.completion_tokens);
      const d = j.choices?.[0]?.delta;
      if (d) chars += (d.content?.length ?? 0) + (d.reasoning_content?.length ?? 0);
    } catch {
      /* partial or non-JSON line */
    }
  };
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        ctl.enqueue(chunk);
        buf += dec.decode(chunk, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        lines.forEach(scan);
      },
      async flush() {
        if (buf) scan(buf);
        await onDone(reported ?? Math.ceil(chars / 4));
      },
    }),
  );
}

async function chat(req: Request) {
  const user = await userFrom(req);
  if (!user) return fail(401, "Sign in to Charcoal to chat with the built-in AI.", "auth");
  const key = await sharedKey();
  if (!key) return fail(503, "The built-in AI isn't switched on yet. Ask the owner, or add your own key in Settings.");

  const { mine, total } = await usage(user.id);
  if (mine >= USER_DAILY_TOKENS)
    return fail(429, "You've hit today's limit on the built-in AI. It resets at midnight UTC, or add your own key in Settings.", "rate_limit");
  if (total >= GLOBAL_DAILY_TOKENS)
    return fail(429, "The built-in AI is out of juice for today. It resets at midnight UTC.", "rate_limit");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Bad request");
  }
  // Only what Charcoal sends; nothing else gets through on the owner's key.
  if (!ALLOWED_MODELS.includes(String(body.model))) body.model = ALLOWED_MODELS[0];
  body.max_tokens = Math.min(Number(body.max_tokens) || 1500, MAX_TOKENS_CAP);
  delete body.n;
  delete body.user;
  const stream = body.stream === true;
  if (stream) body.stream_options = { include_usage: true };

  const up = await fetch(`${await upstream()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, Accept: stream ? "text/event-stream" : "application/json" },
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!up.ok) {
    const text = await up.text();
    let message = "DeepSeek returned an error.";
    try {
      message = JSON.parse(text)?.error?.message || message;
    } catch { /* keep default */ }
    // Never surface the owner's account problems as "your key" errors to friends.
    if (up.status === 401 || up.status === 402) return fail(503, "The built-in AI is unavailable right now (owner's DeepSeek account needs attention).");
    return fail(up.status, message);
  }

  if (stream && up.body) {
    const metered = meter(up.body, (t) => record(user.id, t));
    return new Response(metered, {
      status: 200,
      headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }
  const data = await up.json();
  await record(user.id, Number(data?.usage?.completion_tokens ?? 0));
  return json(data);
}

async function setKey(req: Request) {
  const user = await userFrom(req);
  if (!user || user.id !== OWNER_ID) return fail(403, "Only the owner can change the built-in key.");
  let body: { key?: string | null };
  try {
    body = await req.json();
  } catch {
    return fail(400, "Bad request");
  }
  if (body.key === null) {
    await admin.from("app_secrets").delete().eq("name", "deepseek_api_key");
    return json({ ok: true, enabled: false });
  }
  const key = String(body.key ?? "").trim();
  if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) return fail(400, "That doesn't look like a DeepSeek key (sk-...).");
  const check = await fetch(`${await upstream()}/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!check.ok) return fail(400, "DeepSeek rejected that key. Check it in Settings first.");
  const { error } = await admin
    .from("app_secrets")
    .upsert({ name: "deepseek_api_key", value: key, set_by: user.id, updated_at: new Date().toISOString() });
  if (error) return fail(500, "Couldn't save the key.");
  return json({ ok: true, enabled: true });
}

async function status(req: Request) {
  const user = await userFrom(req);
  if (!user) return json({ signedIn: false, enabled: false });
  const key = await sharedKey();
  const { mine } = await usage(user.id);
  return json({
    signedIn: true,
    enabled: !!key,
    owner: user.id === OWNER_ID,
    usedToday: mine,
    dailyLimit: USER_DAILY_TOKENS,
    keyTail: user.id === OWNER_ID && key ? key.slice(-4) : undefined,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const path = new URL(req.url).pathname.replace(/^.*?\/ai(?=\/|$)/, "") || "/";
  try {
    if (req.method === "POST" && path === "/chat/completions") return await chat(req);
    if (req.method === "GET" && path === "/models") {
      const user = await userFrom(req);
      if (!user) return fail(401, "Sign in to use the built-in AI.", "auth");
      if (!(await sharedKey())) return fail(503, "The built-in AI isn't switched on yet.");
      return json({ object: "list", data: ALLOWED_MODELS.map((id) => ({ id, object: "model" })) });
    }
    if (req.method === "GET" && path === "/status") return await status(req);
    if (req.method === "POST" && path === "/key") return await setKey(req);
    return fail(404, "Not found");
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return new Response(null, { status: 499, headers: CORS });
    return fail(500, "Something went wrong. Try again.");
  }
});
