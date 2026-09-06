const SYNTHESIS_URL = 'https://api.tts.quest/v3/voicevox/synthesis';
const TIMEOUT_MS = 60_000;
const MAX_AUDIO_BYTES = 8_000_000;

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function readLimited(response, maxBytes) {
  if (!response.body || Number(response.headers.get('Content-Length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error('Invalid response size');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Response too large');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readJSON(response) {
  return JSON.parse(new TextDecoder().decode(await readLimited(response, 32_000)));
}

// Only follow a provider job's status URL; derive the audio URL from that same job.
function jobURLs(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/^audio[1-9]\.tts\.quest$/.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash ||
      !/^\/v1\/data\/[a-f0-9]{64}\/status\.json$/.test(url.pathname)) throw new Error('Invalid audio job');
  return { status: url.href, audio: new URL('audio.mp3', url).href };
}

/** Called only after the Worker's shared origin, method and body checks. */
export async function handleTts(request, body, env, headers, fetcher = fetch, pause = wait) {
  const fail = (status, error) => Response.json({ error }, { status, headers });
  if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > 1200) {
    return fail(400, '読み上げる文章が長すぎるか、空になっています。');
  }
  if (env.TTS_LIMITER) {
    const limit = await env.TTS_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
    if (!limit.success) return fail(429, '読み上げが混み合っています。少し時間をおいてお試しください。');
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]);
  try {
    signal.throwIfAborted();
    const form = new URLSearchParams({ speaker: '0', text: body.text.trim() });
    if (env.VOICEVOX_API_KEY) form.set('key', env.VOICEVOX_API_KEY);
    const synthesis = await fetcher(SYNTHESIS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // Workers supports manual redirect handling; non-2xx responses are rejected below.
      body: form.toString(), signal, redirect: 'manual',
    });
    const job = await readJSON(synthesis).catch(error => {
      if (synthesis.status === 429) return { retryAfter: synthesis.headers.get('Retry-After') || 30 };
      throw error;
    });
    if (synthesis.status === 429 || job.retryAfter) {
      const seconds = Math.min(86400, Math.max(1, Math.ceil(Number(job.retryAfter) || 30)));
      headers.set('Retry-After', String(seconds));
      headers.set('Access-Control-Expose-Headers', 'Retry-After');
      return fail(429, `読み上げが混み合っています。${seconds}秒ほど待ってからお試しください。`);
    }
    if (!synthesis.ok || !job.success) throw new Error('Synthesis unavailable');
    const urls = jobURLs(job.audioStatusUrl);
    // At most 22 subrequests, including synthesis and audio, within Workers Free limits.
    for (let attempt = 0; attempt < 20; attempt++) {
      signal.throwIfAborted();
      const response = await fetcher(urls.status, { signal, redirect: 'manual' });
      const status = await readJSON(response);
      if (!response.ok || !status.success || status.isAudioError) throw new Error('Synthesis failed');
      if (status.isAudioReady) {
        const audio = await fetcher(urls.audio, { signal, redirect: 'manual' });
        if (!audio.ok || !audio.headers.get('Content-Type')?.startsWith('audio/')) {
          await audio.body?.cancel();
          throw new Error('Audio unavailable');
        }
        const bytes = await readLimited(audio, MAX_AUDIO_BYTES);
        if (!bytes.length) throw new Error('Empty audio');
        headers.set('Content-Type', 'audio/mpeg');
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(bytes, { headers });
      }
      await pause(2500, signal);
    }
    return fail(504, '音声の準備に時間がかかっています。次の会話で再試行します。');
  } catch {
    return fail(signal.aborted ? 504 : 502, signal.aborted
      ? '音声の準備を中断しました。次の会話で再試行します。'
      : '音声を生成できませんでした。テキストで会話を続けられます。');
  }
}
