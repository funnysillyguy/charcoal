// Charcoal Chat's web access. Signed-in users only, capped per day, and it only ever returns text.
//   POST /web/search { q, kind? }  results from official APIs only: Brave Search (if a key is saved), Google News RSS,
//                                  Wikipedia and DuckDuckGo Instant Answers. No scraping of search result pages.
//   POST /web/open   { url }  one public web page as plain text (no private or local addresses)
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SEARCHES_PER_DAY = 150;
const OPENS_PER_DAY = 300;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_TEXT = 14_000;
const UA = "Mozilla/5.0 (compatible; CharcoalChat/1.0; +https://funnysillyguy.github.io/charcoal/)";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, accept, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status: number, message: string, type = "charcoal_error") => json({ error: { message, type } }, status);

async function userFrom(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

/* ---------- text helpers ---------- */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", "#34": '"' };
function decode(s: string) {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (ENT[k]) return ENT[k];
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
      if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10) || 32);
      return m;
    });
}
const strip = (s: string) => decode(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

function htmlToText(html: string) {
  const title = strip((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || "");
  let body = html
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|form|nav|footer)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const main = /<(main|article)\b[\s\S]*?<\/\1>/i.exec(body);
  if (main && main[0].length > 1500) body = main[0];
  const text = decode(
    body
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre|table|ul|ol|header)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<h([1-6])\b[^>]*>/gi, (_m, n) => "\n" + "#".repeat(Number(n)) + " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

/* ---------- search ---------- */

type Result = { title: string; url: string; snippet: string };
// Only official APIs and feeds meant for programs, with an honest user agent. No scraping of result pages.
const api = (url: string, accept = "application/json") =>
  fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(8000) });

async function secret(name: string): Promise<string | null> {
  const { data } = await admin.from("app_secrets").select("value").eq("name", name).maybeSingle();
  return data?.value ?? null;
}

// Brave Search API (free tier with a key). Used only when the owner has saved one as "brave_search_key".
async function brave(q: string): Promise<Result[]> {
  const key = await secret("brave_search_key");
  if (!key) return [];
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=8`, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.web?.results || []).slice(0, 8).map((r: { title: string; url: string; description?: string }) => ({
    title: strip(r.title || ""),
    url: r.url,
    snippet: strip(r.description || ""),
  }));
}

// Google News RSS: current events.
async function news(q: string): Promise<Result[]> {
  const res = await api(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, "application/rss+xml,text/xml");
  if (!res.ok) return [];
  const xml = await res.text();
  return xml
    .split("<item>")
    .slice(1, 8)
    .map((it) => ({
      title: strip((/<title>([\s\S]*?)<\/title>/.exec(it) || [])[1] || ""),
      url: strip((/<link>([\s\S]*?)<\/link>/.exec(it) || [])[1] || ""),
      snippet: [strip((/<pubDate>([\s\S]*?)<\/pubDate>/.exec(it) || [])[1] || ""), strip((/<source[^>]*>([\s\S]*?)<\/source>/.exec(it) || [])[1] || "")]
        .filter(Boolean)
        .join(" · "),
    }))
    .filter((r) => r.title && r.url);
}

// Wikipedia search API: facts, people, places, things.
async function wikipedia(q: string): Promise<Result[]> {
  const res = await api(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=6&srsearch=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.query?.search || []).map((r: { title: string; snippet: string }) => ({
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    snippet: strip(r.snippet),
  }));
}

// DuckDuckGo Instant Answer API: quick definitions and summaries.
async function instant(q: string): Promise<Result[]> {
  const res = await api(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`);
  if (!res.ok) return [];
  const d = await res.json();
  const out: Result[] = [];
  if (d.AbstractText && d.AbstractURL) out.push({ title: d.Heading || q, url: d.AbstractURL, snippet: d.AbstractText });
  if (d.Answer) out.push({ title: `Answer: ${q}`, url: d.AbstractURL || "https://duckduckgo.com/", snippet: String(d.Answer) });
  for (const t of d.RelatedTopics || []) {
    if (out.length >= 6) break;
    if (t.FirstURL && t.Text) out.push({ title: t.Text.split(" - ")[0].slice(0, 90), url: t.FirstURL, snippet: t.Text });
  }
  return out;
}

const ENGINES: Record<string, (q: string) => Promise<Result[]>> = { brave, news, wikipedia, instant };

/* ---------- opening a page (public addresses only) ---------- */

function privateIp(ip: string) {
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
}

async function safeHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(".") && !h.includes(":")) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(h)) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return !privateIp(h);
  try {
    const addrs = [
      ...(await Deno.resolveDns(h, "A").catch(() => [] as string[])),
      ...(await Deno.resolveDns(h, "AAAA").catch(() => [] as string[])),
    ];
    return addrs.every((a) => !privateIp(a));
  } catch {
    return true; // resolver unavailable: hostname checks above still apply
  }
}

async function openPage(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That isn't a valid web address.");
  }
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error("Only http and https pages can be opened.");
    if (url.port && !["80", "443"].includes(url.port)) throw new Error("That address uses an unusual port.");
    if (!(await safeHost(url.hostname))) throw new Error("Private and local addresses can't be opened.");
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" },
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`The page answered with status ${res.status}.`);
    const type = res.headers.get("content-type") || "";
    if (!/text\/|json|xml/.test(type)) throw new Error(`That's a ${type.split(";")[0] || "binary"} file, not a page.`);
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_PAGE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const buf = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, Math.min(c.length, size - o)), o);
      o += c.length;
      if (o >= size) break;
    }
    const body = new TextDecoder().decode(buf);
    const { title, text } = /html/.test(type) ? htmlToText(body) : { title: "", text: body };
    return { url: url.toString(), title, text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT };
  }
  throw new Error("Too many redirects.");
}

/* ---------- routes ---------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "Use POST.");
  const path = new URL(req.url).pathname.replace(/^.*?\/web(?=\/|$)/, "") || "/";
  const user = await userFrom(req);
  if (!user) return fail(401, "Sign in to let Charcoal Chat use the web.", "auth");
  let body: { q?: string; url?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, "Bad request");
  }
  try {
    if (path === "/search") {
      const q = String(body.q || "").trim().slice(0, 300);
      if (!q) return fail(400, "Empty search.");
      const { data: n } = await admin.rpc("bump_web_usage", { p_user: user.id, p_kind: "search" });
      if (Number(n) > SEARCHES_PER_DAY) return fail(429, "Web search limit reached for today.", "rate_limit");
      // With a Brave key: the open web. Without: news + Wikipedia + instant answers, merged.
      const kind = body.kind === "news" ? "news" : "web";
      const tried: Record<string, number> = {};
      let results: Result[] = [];
      let source = "";
      const b = await brave(q).catch(() => [] as Result[]);
      tried.brave = b.length;
      if (b.length && kind === "web") {
        results = b;
        source = "brave";
      } else {
        const order = kind === "news" ? ["news", "wikipedia", "instant"] : ["wikipedia", "news", "instant"];
        const sets = await Promise.all(order.map((n) => ENGINES[n](q).catch(() => [] as Result[])));
        order.forEach((n, i) => (tried[n] = sets[i].length));
        const seen = new Set<string>();
        // interleave so each source gets a say, up to 10 results
        for (let i = 0; results.length < 10 && i < 8; i++) {
          for (const set of sets) {
            const r = set[i];
            if (r && !seen.has(r.url)) {
              seen.add(r.url);
              results.push(r);
            }
          }
        }
        source = order.filter((n) => tried[n]).join("+") || "none";
      }
      return json({ query: q, source, results, tried });
    }
    if (path === "/open") {
      const { data: n } = await admin.rpc("bump_web_usage", { p_user: user.id, p_kind: "fetch" });
      if (Number(n) > OPENS_PER_DAY) return fail(429, "Page-open limit reached for today.", "rate_limit");
      return json(await openPage(String(body.url || "")));
    }
    return fail(404, "Not found");
  } catch (e) {
    return fail(422, (e as Error)?.message || "Couldn't do that.");
  }
});
