"use client";

import { useEffect, useState } from "react";

type Memory = { id: string; type: string; summary: string; entities: string[]; importance: number; confidence: number; eventDate: string | null; pinned: boolean; archived: boolean; sourceConversationId: string; supersededBy: string | null };

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading memories...");

  async function load(search = "") {
    const response = await fetch(`/api/memories${search ? `?q=${encodeURIComponent(search)}` : ""}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to load memories");
    setMemories(data.memories);
    setStatus(`${data.memories.length} memories found.`);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/memories")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load memories");
        if (!cancelled) {
          setMemories(data.memories);
          setStatus(`${data.memories.length} memories found.`);
        }
      })
      .catch((error) => { if (!cancelled) setStatus(error.message); });
    return () => { cancelled = true; };
  }, []);

  async function update(id: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/memories/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!response.ok) throw new Error((await response.json()).error ?? "Unable to update memory");
    await load(query);
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this memory permanently?")) return;
    const response = await fetch(`/api/memories/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error((await response.json()).error ?? "Unable to delete memory");
    await load(query);
  }

  return <section className="stack gap-lg"><div className="hero compact"><div><p className="eyebrow">Long-term memory / private dashboard</p><h1>Continuity, inspected.</h1><p className="lede">Edit what matters, archive what does not, and keep the provenance attached. Aarush does not need to narrate his filing system.</p></div><div className="status-card">{status}</div></div><div className="search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") load(query).catch((error) => setStatus(error.message)); }} placeholder="Search by person, event, preference..." /><button onClick={() => load(query).catch((error) => setStatus(error.message))}>Search</button><button className="secondary" onClick={() => { setQuery(""); load().catch((error) => setStatus(error.message)); }}>Clear</button></div><div className="memory-grid">{memories.map((memory) => <article className={`memory-card ${memory.archived ? "archived" : ""}`} key={memory.id}><div className="memory-meta"><span className="pill">{memory.type.replaceAll("_", " ")}</span><span>{Math.round(memory.confidence * 100)}% confidence</span></div><textarea defaultValue={memory.summary} onBlur={(event) => { if (event.target.value !== memory.summary) update(memory.id, { summary: event.target.value }).catch((error) => setStatus(error.message)); }} /><div className="entity-row">{memory.entities.map((entity) => <span key={entity}>#{entity}</span>)}</div><div className="memory-actions"><button className={memory.pinned ? "active" : ""} onClick={() => update(memory.id, { pinned: !memory.pinned }).catch((error) => setStatus(error.message))}>{memory.pinned ? "Unpin" : "Pin"}</button><button onClick={() => update(memory.id, { archived: !memory.archived }).catch((error) => setStatus(error.message))}>{memory.archived ? "Restore" : "Archive"}</button><button className="danger" onClick={() => remove(memory.id).catch((error) => setStatus(error.message))}>Delete</button></div><small>Source conversation: {memory.sourceConversationId}</small></article>)}{!memories.length && <div className="empty-state wide"><div className="monogram">∅</div><p>No memories yet. End a conversation containing something worth remembering.</p></div>}</div></section>;
}
