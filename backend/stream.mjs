import aiVoices from '../lib/aiVoices.json' with { type: 'json' };

/** Parse SSE even when UTF-8 bytes, CRLFs, or data fields span network chunks. */
export async function* readSSE(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000) throw new Error('Oversized provider frame');
      if (done) buffer += '\n\n';
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        if (!line) {
          if (data.length) yield data.join('\n');
          data = [];
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Only the first line can select allowlisted animation and recorded voice IDs. */
export class ReplyParser {
  buffer = '';
  started = false;
  constructor(emit, { allowVoice = true } = {}) { this.emit = emit; this.allowVoice = allowVoice; }
  push(text, final = false) {
    if (this.started) {
      if (text) this.emit({ type: 'text', text });
      return;
    }
    this.buffer += text;
    const end = this.buffer.indexOf('\n');
    if (end < 0 && this.buffer.length < 80 && !final) return;
    const first = (end < 0 ? this.buffer : this.buffer.slice(0, end)).trim();
    const tag = /^\[\[([^\]]+)\]\]$/.exec(first);
    const [animationId, voiceId] = tag ? tag[1].split('|').map(value => value.trim()) : [];
    const animation = ['idle', 'laugh', 'surprise'].includes(animationId) ? animationId : 'idle';
    this.emit({ type: 'animation', animation });
    if (this.allowVoice && voiceId && Object.hasOwn(aiVoices, voiceId)) this.emit({ type: 'voice', voice: voiceId });
    this.started = true;
    // An unknown directive is discarded; untagged prose is still displayed.
    const reply = tag ? (end < 0 ? '' : this.buffer.slice(end + 1)) : this.buffer;
    this.buffer = '';
    if (reply) this.emit({ type: 'text', text: reply });
  }
}
