"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { recentHistory, streamChat, type ChatMessage, type ChatAnimation } from "@/lib/aiChat";

const endpoint = process.env.NEXT_PUBLIC_CHAT_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8787/api/chat" : "");

export default function AIChatPanel({ active, onAnimationRequest, onBusyChange }: {
  active: boolean;
  onAnimationRequest: (animation: ChatAnimation) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingUser, setPendingUser] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement | null>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    if (!active) request.current?.abort();
    return () => { request.current?.abort(); };
  }, [active]);

  useEffect(() => {
    if (transcript.current && followLatest.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [history, pendingUser, reply, busy]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || request.current || !endpoint) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    onBusyChange(true);
    onAnimationRequest("idle");
    setError("");
    setInput("");
    setPendingUser(content);
    setReply("");
    followLatest.current = true;
    const messages = recentHistory(history, content);
    try {
      const text = await streamChat({
        endpoint, messages, signal: controller.signal,
        onText: setReply, onAnimation: onAnimationRequest,
      });
      setHistory([...messages, { role: "assistant", content: text }]);
    } catch (failure) {
      setInput(content);
      setError(controller.signal.aborted ? "返事を中断しました。" :
        failure instanceof Error ? failure.message : "AIに接続できませんでした。");
    } finally {
      setPendingUser("");
      setReply("");
      setBusy(false);
      onBusyChange(false);
      request.current = null;
    }
  }

  function clearHistory() {
    if (request.current) return;
    setHistory([]);
    setError("");
  }

  return (
    <section className="aiChatPanel" aria-label="AIチャット">
      <div className="aiChatHeader">
        <button type="button" onClick={clearHistory} disabled={busy || !history.length}>会話をリセット</button>
      </div>
      <div className="aiTranscript" ref={transcript} role="log" aria-label="会話履歴" aria-live="off"
        onScroll={() => {
          const element = transcript.current;
          if (element) followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
        }}>
        {!history.length && !pendingUser && <p className="aiWelcome"></p>}
        {history.map((message, index) => <p className={`aiMessage ${message.role}`} key={index}>
          <span className="aiSpeaker">{message.role === "user" ? "あなた" : "イアンセ"}</span>{message.content}
        </p>)}
        {pendingUser && <p className="aiMessage user"><span className="aiSpeaker">あなた</span>{pendingUser}</p>}
        {busy && <p className="aiMessage assistant"><span className="aiSpeaker">イアンセ</span>{reply || "…"}<span className="aiCursor" aria-hidden="true">▍</span></p>}
      </div>
      <p className="srOnly" aria-live="polite">{busy ? "返事をしています。" : history.at(-1)?.content}</p>
      {error && <p className="aiError" role="alert">{error}</p>}
      {!endpoint && <p className="aiNotice">AIモードは準備中です</p>}
      <form className="aiChatForm" onSubmit={send}>
        <label htmlFor="ai-message" className="srOnly">メッセージ</label>
        <textarea id="ai-message" placeholder="今の気持ちは？" rows={2} maxLength={1000}
          value={input} disabled={!endpoint || busy} onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault(); event.currentTarget.form?.requestSubmit();
            }
          }} />
        {busy ? <button type="button" onClick={() => request.current?.abort()}>停止</button>
          : <button type="submit" disabled={!endpoint || !input.trim()}>送信</button>}
      </form>
    </section>
  );
}
