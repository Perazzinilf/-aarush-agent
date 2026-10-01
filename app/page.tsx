"use client";

import { FormEvent, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string; memories?: Array<{ summary: string; reasons: string[] }> };

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready when you are. Try not to make a mess.");

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    const text = draft.trim();
    setDraft("");
    setMessages((current) => [...current, { role: "user", content: text }]);
    setBusy(true);
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed");
      setConversationId(data.conversationId);
      setMessages((current) => [...current, { role: "assistant", content: data.reply, memories: data.retrievedMemories }]);
      setStatus("Aarush replied. The continuity notes used for that reply are shown below it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function endConversation() {
    if (busy || !conversationId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "end", conversationId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to end conversation");
      setStatus(`Conversation ended. Extracted ${data.extracted ?? 0} durable memories; skipped ${data.duplicates ?? 0} duplicates.`);
      setConversationId(undefined);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack gap-lg">
      <div className="hero">
        <div><p className="eyebrow">Persistent agent / milestone one</p><h1>Talk to Aarush.</h1><p className="lede">A cloud-only conversation with durable continuity, kept separate from his personality and visible when you want to inspect it.</p></div>
        <div className="status-card"><span className="status-dot" />{status}</div>
      </div>
      <div className="chat-card">
        <div className="conversation" aria-live="polite">
          {!messages.length && <div className="empty-state"><div className="monogram">A</div><p>Say something useful. Or something entertaining. I am not fussy.</p></div>}
          {messages.map((message, index) => <div className={`message-row ${message.role}`} key={`${message.role}-${index}`}><div className="message-bubble"><div className="message-label">{message.role === "user" ? "You" : "Aarush"}</div><p>{message.content}</p>{message.memories && message.memories.length > 0 && <details className="memory-trace"><summary>Continuity notes used ({message.memories.length})</summary>{message.memories.map((memory, memoryIndex) => <div className="trace-item" key={`${memory.summary}-${memoryIndex}`}><span>{memory.summary}</span><small>{memory.reasons.join(" · ")}</small></div>)}</details>}</div></div>)}
          {busy && <div className="message-row assistant"><div className="message-bubble thinking">Aarush is thinking. This may take a moment; wisdom is annoyingly expensive.</div></div>}
        </div>
        <form className="composer" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write to Aarush..." rows={3} disabled={busy} /><div className="composer-actions"><span>Session history is stored by OpenAI Conversations; durable memories are stored separately in Supabase.</span><button type="submit" disabled={busy || !draft.trim()}>Send</button></div></form>
      </div>
      <div className="toolbar"><button className="secondary" onClick={endConversation} disabled={busy || !conversationId}>End conversation &amp; extract memories</button><span>Ending a conversation analyzes its transcript and applies duplicate/correction rules.</span></div>
    </section>
  );
}
