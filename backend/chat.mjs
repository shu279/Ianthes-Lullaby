import { buildSystemPrompt, requestsSilentVoice } from './persona.mjs';
import { readSSE, ReplyParser } from './stream.mjs';

const encoder = new TextEncoder();
const MAX_BODY = 32_000;

export function validateMessages(body) {
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 17) return null;
  let length = 0;
  const messages = [];
  for (const [index, message] of body.messages.entries()) {
    const expected = index % 2 ? 'assistant' : 'user';
    if (!message || message.role !== expected || typeof message.content !== 'string') return null;
    const content = message.content.trim();
    if (!content || content.length > 1200) return null;
    length += content.length;
    messages.push({ role: expected, content });
  }
  return messages.at(-1).role === 'user' && length <= 8000 ? messages : null;
}

async function readBody(request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function handleChat(request, env, fetcher = fetch) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin' });
  const fail = (status, error) => Response.json({ error }, { status, headers });
  if (!origin || !allowed.includes(origin)) return fail(403, 'このページからはAIに接続できません。');
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  if (new URL(request.url).pathname !== '/api/chat') return fail(404, 'Not found');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return fail(405, 'POST required');
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return fail(415, 'JSON required');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return fail(413, 'メッセージが長すぎます。');
  const messages = validateMessages(await readBody(request));
  if (!messages) return fail(400, 'メッセージを短くして、もう一度お試しください。');
  if (!env.GEMINI_API_KEY) return fail(503, 'AIチャットは準備中です。しばらくしてからお試しください。');
  if (env.CHAT_LIMITER) {
    const limit = await env.CHAT_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
    if (!limit.success) return fail(429, '少し時間をおいてから話しかけてください。');
  }
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  request.signal.addEventListener('abort', onAbort, { once: true });
  if (request.signal.aborted) abort.abort();
  const timeout = setTimeout(() => abort.abort(), 45_000);
  const cleanup = () => { clearTimeout(timeout); request.signal.removeEventListener('abort', onAbort); };
  let upstream;
  try {
    const model = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    if (!/^[a-zA-Z0-9.-]+$/.test(model)) throw new Error('Invalid model');
    upstream = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      signal: abort.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(messages.at(-1).content, env.ENABLE_RAG !== 'false') }] },
        contents: messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
        generationConfig: { temperature: 0.8, maxOutputTokens: 512 },
      }),
    });
  } catch {
    cleanup();
    return fail(502, 'AIに接続できませんでした。時間をおいてお試しください。');
  }
  if (!upstream.ok || !upstream.body) {
    cleanup();
    await upstream.body?.cancel();
    return fail(upstream.status === 429 ? 429 : 502, upstream.status === 429
      ? 'AIの利用上限に達しました。時間をおいてお試しください。'
      : 'AIが応答できませんでした。時間をおいてお試しください。');
  }
  headers.set('Content-Type', 'application/x-ndjson; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  let canceled = false;
  const stream = new ReadableStream({
    async start(controller) {
      let textLength = 0;
      let hadText = false;
      let completed = false;
      const emit = event => {
        if (canceled) return;
        if (event.type === 'text') {
          textLength += event.text.length;
          if (textLength > 1200) throw new Error('Reply too long');
          hadText ||= Boolean(event.text.trim());
        }
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };
      const parser = new ReplyParser(emit, { allowVoice: !requestsSilentVoice(messages.at(-1).content) });
      try {
        for await (const data of readSSE(upstream.body)) {
          if (data === '[DONE]') continue;
          const chunk = JSON.parse(data);
          const candidate = chunk.candidates?.[0];
          if (chunk.error || chunk.promptFeedback?.blockReason) throw new Error('Provider blocked');
          if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('Incomplete reply');
          for (const part of candidate?.content?.parts || []) {
            if (typeof part.text === 'string' && !part.thought) parser.push(part.text);
          }
          if (candidate?.finishReason === 'STOP') completed = true;
        }
        if (!completed) throw new Error('Stream interrupted');
        parser.push('', true);
        if (!hadText) throw new Error('Empty reply');
        emit({ type: 'done' });
      } catch {
        if (!canceled) emit({ type: 'error', message: '返事が途中で止まりました。もう一度お試しください。' });
      } finally {
        abort.abort();
        cleanup();
        if (!canceled) controller.close();
      }
    },
    cancel() { canceled = true; abort.abort(); cleanup(); },
  });
  return new Response(stream, { headers });
}

export default { fetch: (request, env) => handleChat(request, env) };
