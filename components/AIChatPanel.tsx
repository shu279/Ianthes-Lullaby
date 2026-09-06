"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { recentHistory, type ChatMessage, type ChatAnimation } from "@/lib/aiChat";
import { streamSpokenChat } from "@/lib/spokenChat";
import { ConversationVoice, type VoiceStatus } from "@/lib/conversationVoice";

const endpoint = process.env.NEXT_PUBLIC_CHAT_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8787/api/chat" : "");

const speechEndpoint = endpoint ? new URL("./tts", endpoint).href : "";

export default function AIChatPanel({ onAnimationRequest, onBusyChange, voiceRef }: {
  onAnimationRequest: (animation: ChatAnimation) => void;
  onBusyChange: (busy: boolean) => void;
  voiceRef: RefObject<ConversationVoice | null>;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingUser, setPendingUser] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState("");
  const speaking = voiceStatus === "loading" || voiceStatus === "playing";
  const request = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement | null>(null);
  const followLatest = useRef(true);
  const openButton = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const focusOnToggle = useRef(false);

  useEffect(() => {
    const voice = new ConversationVoice((status, message) => {
      setVoiceStatus(status);
      setVoiceError(message || "");
    });
    voiceRef.current = voice;
    const onVisibilityChange = () => {
      if (document.hidden) voice.stop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      request.current?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      voice.dispose();
      if (voiceRef.current === voice) voiceRef.current = null;
    };
  }, [voiceRef]);

  useEffect(() => { onBusyChange(busy || speaking); }, [busy, speaking, onBusyChange]);

  useEffect(() => {
    if (isOpen && transcript.current && followLatest.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [history, pendingUser, reply, busy, isOpen]);

  useEffect(() => {
    if (!focusOnToggle.current) return;
    (isOpen ? closeButton.current : openButton.current)?.focus({ preventScroll: true });
    focusOnToggle.current = false;
  }, [isOpen]);

  function toggleChat() {
    focusOnToggle.current = true;
    setIsOpen(value => !value);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || request.current || !endpoint) return;
    voiceRef.current?.stop();
    voiceRef.current?.prepareAudio();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    onAnimationRequest("idle");
    setError("");
    setInput("");
    setPendingUser(content);
    setReply("");
    followLatest.current = true;
    const messages = recentHistory(history, content);
    try {
      const text = await streamSpokenChat({
        endpoint, speechEndpoint, messages, signal: controller.signal, voice: voiceRef.current,
        onText: setReply, onAnimation: onAnimationRequest,
      });
      setHistory([...messages, { role: "assistant", content: text }]);
    } catch (failure) {
      voiceRef.current?.stop();
      setInput(content);
      setError(controller.signal.aborted ? "返事を中断しました。" :
        failure instanceof Error ? failure.message : "AIに接続できませんでした。");
    } finally {
      setPendingUser("");
      setReply("");
      setBusy(false);
      request.current = null;
    }
  }

  function clearHistory() {
    if (request.current) return;
    voiceRef.current?.stop();
    voiceRef.current?.clearCache();
    setHistory([]);
    setError("");
  }

  return (
    <>
      {!isOpen && <button ref={openButton} className="aiChatToggle" type="button"
        aria-expanded={false} aria-controls="ai-chat-panel" onClick={toggleChat}>チャットを開く</button>}
      <section id="ai-chat-panel" className="aiChatPanel" aria-label="AIチャット" hidden={!isOpen}>
        <div className="aiChatHeader">
          <button type="button" onClick={clearHistory} disabled={busy || !history.length}>会話をリセット</button>
          <button ref={closeButton} type="button" aria-label="チャットを閉じる"
            aria-expanded={isOpen} aria-controls="ai-chat-panel" onClick={toggleChat}>閉じる</button>
        </div>
        <div className="aiTranscript" ref={transcript} role="log" aria-label="会話履歴" aria-live="off"
          onScroll={() => {
            const element = transcript.current;
            if (element) followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
          }}>
          {history.map((message, index) => <p className={`aiMessage ${message.role}`} key={index}>
            <span className="aiSpeaker">{message.role === "user" ? "あなた" : "イアンサ"}</span>{message.content}
          </p>)}
          {pendingUser && <p className="aiMessage user"><span className="aiSpeaker">あなた</span>{pendingUser}</p>}
          {busy && <p className="aiMessage assistant"><span className="aiSpeaker">イアンセ</span>{reply}
            {(!reply || voiceStatus === "loading") && <span role="status" aria-label="返事を待っています">{reply ? "\n..." : "..."}</span>}
          </p>}
        </div>
        <p className="srOnly" aria-live="polite">{busy ? "返事をしています。" : history.at(-1)?.content}</p>
        {error && <p className="aiError" role="alert">{error}</p>}
        {(voiceStatus === "error" || voiceStatus === "blocked") && <p className="aiNotice" role="status">
          {voiceError || "音声を再生できませんでした。次の送信時に再試行します。"}
        </p>}
        {!endpoint && <p className="aiNotice">AIチャットは準備中です</p>}
        <form className="aiChatForm" onSubmit={send}>
          <label htmlFor="ai-message" className="srOnly">メッセージ</label>
          <textarea id="ai-message" rows={1} maxLength={1000}
            value={input} disabled={!endpoint || busy} onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault(); event.currentTarget.form?.requestSubmit();
              }
            }} />
          {busy ? <button type="button" onClick={() => request.current?.abort()}>停止</button>
            : <button type="submit" disabled={!endpoint || !input.trim()}>送信</button>}
          {!busy && speaking && <button type="button" onClick={() => voiceRef.current?.stop()}>停止</button>}
        </form>
      </section>
    </>
  );
}
