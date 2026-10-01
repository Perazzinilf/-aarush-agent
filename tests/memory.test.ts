import { describe, expect, it, vi } from "vitest";
import { extractLongTermMemories } from "@/lib/memory/extractor";
import { reconcileMemory, selectRelevantMemories } from "@/lib/memory/logic";
import { persistExtractedMemories } from "@/lib/memory/service";
import type { Memory, MemoryCandidate, MemoryUpdate } from "@/lib/types";
import type { MemoryRepository } from "@/lib/memory/repository";
import OpenAI from "openai";

class FakeMemoryRepository implements MemoryRepository {
  constructor(private memories: Memory[] = []) {}
  async list(userId: string) { return this.memories.filter((memory) => memory.userId === userId); }
  async insert(userId: string, memory: MemoryCandidate & { id: string; sourceConversationId: string }) {
    const created: Memory = { ...memory, userId, createdAt: new Date().toISOString(), eventDate: memory.eventDate ?? null, pinned: false, archived: false, supersededBy: null };
    this.memories.push(created);
    return created;
  }
  async update(userId: string, id: string, update: MemoryUpdate) {
    const memory = this.memories.find((item) => item.id === id && item.userId === userId);
    if (!memory) throw new Error("not found");
    Object.assign(memory, update);
    return memory;
  }
  async delete(userId: string, id: string) {
    const index = this.memories.findIndex((item) => item.id === id && item.userId === userId);
    if (index >= 0) this.memories.splice(index, 1);
  }
  async markSuperseded(userId: string, oldId: string, newId: string) {
    const memory = this.memories.find((item) => item.id === oldId && item.userId === userId);
    if (!memory) throw new Error("not found");
    memory.supersededBy = newId;
  }
}

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: crypto.randomUUID(), userId: "user-a", type: "people", summary: "Ricardo loves Mitra.", entities: ["Ricardo", "Mitra"], createdAt: new Date().toISOString(), eventDate: null, importance: .8, confidence: .95, sourceConversationId: "conversation-a", pinned: false, archived: false, supersededBy: null, ...overrides,
  };
}

describe("memory retrieval and reconciliation", () => {
  it("retrieves an entity-linked memory while respecting the context budget", () => {
    const result = selectRelevantMemories("What did I tell you about Ricardo?", [memory(), memory({ id: crypto.randomUUID(), summary: "A very long unrelated note ".repeat(300), entities: ["Unrelated"] })], { maxCharacters: 300 });
    expect(result).toHaveLength(1);
    expect(result[0].memory.summary).toContain("Ricardo");
    expect(result[0].reasons.join(" ")).toContain("Ricardo");
  });

  it("skips duplicates and supersedes a corrected fact without deleting history", () => {
    const previous = memory({ summary: "Ricardo lives in Pune." });
    expect(reconcileMemory({ type: "people", summary: "Ricardo lives in Pune.", entities: ["Ricardo"], importance: .8, confidence: .9 }, [previous]).action).toBe("duplicate");
    const correction = reconcileMemory({ type: "corrections", summary: "Correction: Ricardo no longer lives in Pune; he lives in Jaipur.", entities: ["Ricardo", "Pune", "Jaipur"], importance: .9, confidence: .9 }, [previous]);
    expect(correction.action).toBe("insert");
    const sameTypeCorrection = reconcileMemory({ type: "people", summary: "Actually Ricardo no longer lives in Pune; he lives in Jaipur.", entities: ["Ricardo", "Pune", "Jaipur"], importance: .9, confidence: .9 }, [previous]);
    expect(sameTypeCorrection.action).toBe("supersede");
  });

  it("enforces user isolation for retrieval and editing/deletion", async () => {
    const repo = new FakeMemoryRepository([memory(), memory({ userId: "user-b", summary: "Secret fact for user B", entities: ["Secret"] })]);
    expect((await repo.list("user-a")).every((item) => item.userId === "user-a")).toBe(true);
    await repo.update("user-a", (await repo.list("user-a"))[0].id, { pinned: true });
    expect((await repo.list("user-a"))[0].pinned).toBe(true);
    await repo.delete("user-a", (await repo.list("user-a"))[0].id);
    expect((await repo.list("user-b"))[0].summary).toBe("Secret fact for user B");
  });

  it("persists extracted memories with duplicate prevention and correction provenance", async () => {
    const previous = memory({ summary: "Ricardo lives in Pune." });
    const repo = new FakeMemoryRepository([previous]);
    const result = await persistExtractedMemories(repo, "user-a", "conversation-b", [
      { type: "people", summary: "Ricardo lives in Pune.", entities: ["Ricardo"], importance: .8, confidence: .9 },
      { type: "people", summary: "Actually Ricardo no longer lives in Pune; he lives in Jaipur.", entities: ["Ricardo", "Pune", "Jaipur"], importance: .9, confidence: .9 },
    ]);
    expect(result.duplicates).toBe(1);
    expect(result.superseded).toBe(1);
    expect((await repo.list("user-a")).find((item) => item.id === previous.id)?.supersededBy).toBe(result.memoryIds[0]);
  });
});

describe("memory extraction", () => {
  it("parses structured memories and retries transient extraction failures", async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error("temporary upstream failure"))
      .mockResolvedValue({ output_text: JSON.stringify({ memories: [{ type: "people", summary: "Ricardo loves Mitra.", entities: ["Ricardo", "Mitra"], event_date: null, importance: .8, confidence: .96 }] }) });
    const client = { responses: { create } } as unknown as OpenAI;
    const result = await extractLongTermMemories([{ role: "user", content: "My brother Ricardo loves Mitra." }], { conversationId: "conversation-a", client, retries: 1 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(result[0].summary).toBe("Ricardo loves Mitra.");
  });
});
