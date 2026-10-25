// Minimal DeepSeek client for the OpenAI-compatible Chat Completions API.
// Streams Server-Sent Events, supports AbortController, and turns API errors into readable messages.

export class ApiError extends Error {
  constructor(message, { status = 0, kind = 'unknown', detail = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind; // auth | balance | rate | model | vision | params | server | network | no_key | unknown
    this.detail = detail;
  }
}

function hostOf(url) {
  try {
    return new URL(url, window.location.href).host;
  } catch {
    return url;
  }
}

async function errorFromResponse(res, { model, baseUrl }) {
  let detail = '';
  let charcoalType = '';
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      detail = json?.error?.message || json?.message || text;
      // Charcoal's own server (built-in AI) sends friendly messages; show them as-is.
      if (['rate_limit', 'auth', 'charcoal_error'].includes(json?.error?.type) && String(baseUrl || '').includes('/functions/v1/ai'))
        charcoalType = json.error.type;
    } catch {
      detail = text;
    }
  } catch {
    /* body unreadable */
  }
  detail = String(detail || '').slice(0, 400);
  const s = res.status;
  if (charcoalType === 'rate_limit') return new ApiError(detail, { status: s, kind: 'limit' });
  if (charcoalType === 'auth') return new ApiError(detail, { status: s, kind: 'signin' });
  if (charcoalType) return new ApiError(detail, { status: s, kind: 'builtin' });
  if (s === 401 || s === 403)
    return new ApiError('DeepSeek rejected the API key. Check it in Settings.', { status: s, kind: 'auth', detail });
  if (s === 402)
    return new ApiError('Your DeepSeek balance is empty. Top up at platform.deepseek.com, then regenerate.', {
      status: s,
      kind: 'balance',
      detail,
    });
  if (s === 429)
    return new ApiError('Rate limited by DeepSeek. Wait a few seconds and regenerate.', { status: s, kind: 'rate', detail });
  if (/model.*(not exist|not found|does not exist)/i.test(detail))
    return new ApiError(`"${model}" isn't a model on ${hostOf(baseUrl)}. Use deepseek-flash for V4.1-Flash with vision.`, {
      status: s,
      kind: 'model',
      detail,
    });
  if (/image|vision|multimodal|image_url/i.test(detail) && s === 400)
    return new ApiError(`${model} couldn't accept the image. Switch the model to deepseek-flash in Settings.`, {
      status: s,
      kind: 'vision',
      detail,
    });
  if (s === 400 || s === 422)
    return new ApiError(`DeepSeek rejected the request: ${detail || 'invalid parameters'}`, { status: s, kind: 'params', detail });
  if (s >= 500)
    return new ApiError(`DeepSeek is having trouble right now (${s}). Try again in a moment.`, { status: s, kind: 'server', detail });
  return new ApiError(`Request failed with status ${s}.`, { status: s, kind: 'unknown', detail });
}

function networkError(err, baseUrl) {
  if (err?.name === 'AbortError') return err;
  return new ApiError(`Couldn't reach ${hostOf(baseUrl)}. Check your connection and the base URL in Settings.`, {
    kind: 'network',
    detail: String(err?.message || err),
  });
}

/**
 * Stream a chat completion. Yields events:
 *   { type: 'content', text }   visible reply tokens
 *   { type: 'reasoning', text } chain-of-thought tokens (thinking mode only)
 *   { type: 'finish', reason }  finish_reason from the API
 *   { type: 'usage', usage }    token usage, when the API includes it
 *   { type: 'tool_call', index, id, name, args }  a piece of a function call (name/args arrive in parts)
 */
export async function* streamChat({ baseUrl, apiKey, body, signal, headers = {} }) {
  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${apiKey}`,
        ...headers,
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
  } catch (err) {
    throw networkError(err, baseUrl);
  }
  if (!res.ok) throw await errorFromResponse(res, { model: body.model, baseUrl });

  // Some proxies ignore `stream` and return a single JSON body.
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const json = await res.json();
    const msg = json?.choices?.[0]?.message || {};
    if (msg.reasoning_content) yield { type: 'reasoning', text: msg.reasoning_content };
    if (msg.content) yield { type: 'content', text: msg.content };
    for (const [i, tc] of (msg.tool_calls || []).entries())
      yield { type: 'tool_call', index: tc.index ?? i, id: tc.id, name: tc.function?.name, args: tc.function?.arguments || '' };
    yield { type: 'finish', reason: json?.choices?.[0]?.finish_reason || 'stop' };
    if (json.usage) yield { type: 'usage', usage: json.usage };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        throw networkError(err, baseUrl);
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        // SSE comments (DeepSeek sends ": keep-alive" while queued) and blank separators are skipped.
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') return;
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        if (json.error) {
          throw new ApiError(`DeepSeek stopped mid-reply: ${json.error.message || 'unknown error'}`, {
            kind: 'server',
            detail: JSON.stringify(json.error),
          });
        }
        const choice = json.choices?.[0];
        const delta = choice?.delta || {};
        if (delta.reasoning_content) yield { type: 'reasoning', text: delta.reasoning_content };
        if (delta.content) yield { type: 'content', text: delta.content };
        for (const tc of delta.tool_calls || [])
          yield { type: 'tool_call', index: tc.index ?? 0, id: tc.id, name: tc.function?.name, args: tc.function?.arguments || '' };
        if (choice?.finish_reason) yield { type: 'finish', reason: choice.finish_reason };
        if (json.usage) yield { type: 'usage', usage: json.usage };
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

/** GET /models — used by the Settings "Test connection" button. Free, and proves the key works. */
export async function listModels({ baseUrl, apiKey, signal, headers = {} }) {
  let res;
  try {
    res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, ...headers },
      signal,
    });
  } catch (err) {
    throw networkError(err, baseUrl);
  }
  if (!res.ok) throw await errorFromResponse(res, { model: '', baseUrl });
  const json = await res.json();
  return (json?.data || []).map((m) => m.id).filter(Boolean);
}

/** Non-streaming completion that returns parsed JSON (DeepSeek JSON output mode). */
export async function completeJSON({ baseUrl, apiKey, body, signal, headers = {} }) {
  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...headers },
      body: JSON.stringify({ ...body, stream: false, response_format: { type: 'json_object' } }),
      signal,
    });
  } catch (err) {
    throw networkError(err, baseUrl);
  }
  if (!res.ok) throw await errorFromResponse(res, { model: body.model, baseUrl });
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content || '';
  try {
    return JSON.parse(content);
  } catch {
    const m = /\{[\s\S]*\}/.exec(content);
    if (m) return JSON.parse(m[0]);
    throw new ApiError('The draft came back in the wrong format. Try again.', { kind: 'params', detail: content.slice(0, 300) });
  }
}
