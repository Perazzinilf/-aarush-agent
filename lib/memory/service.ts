import { reconcileMemory, selectRelevantMemories } from "@/lib/memory/logic";
import type { MemoryCandidate, RetrievedMemory } from "@/lib/types";
import type { MemoryRepository } from "@/lib/memory/repository";
import { createOptionalEmbedding } from "@/lib/memory/embeddings";

export async function retrieveRelevantMemories(
  repository: MemoryRepository,
  userId: string,
  query: string,
  options?: { maxItems?: number; maxCharacters?: number },
): Promise<RetrievedMemory[]> {
  const memories = await repository.list(userId);
  if (repository.semanticSearch) {
    const embedding = await createOptionalEmbedding(query);
    if (embedding) {
      const semantic = await repository.semanticSearch(userId, embedding);
      const byId = new Map(memories.map((memory) => [memory.id, memory]));
      for (const memory of semantic) byId.set(memory.id, memory);
      return selectRelevantMemories(query, [...byId.values()], options);
    }
  }
  return selectRelevantMemories(query, memories, options);
}

export async function persistExtractedMemories(
  repository: MemoryRepository,
  userId: string,
  sourceConversationId: string,
  candidates: MemoryCandidate[],
): Promise<{ inserted: number; duplicates: number; superseded: number; memoryIds: string[] }> {
  const existing = await repository.list(userId);
  const result = { inserted: 0, duplicates: 0, superseded: 0, memoryIds: [] as string[] };
  for (const candidate of candidates) {
    const reconciliation = reconcileMemory(candidate, existing);
    if (reconciliation.action === "duplicate") {
      result.duplicates += 1;
      continue;
    }
    const id = crypto.randomUUID();
    const inserted = await repository.insert(userId, {
      id,
      sourceConversationId,
      ...candidate,
    });
    existing.push(inserted);
    result.inserted += 1;
    result.memoryIds.push(inserted.id);
    if (reconciliation.action === "supersede") {
      await repository.markSuperseded(userId, reconciliation.previous.id, inserted.id);
      reconciliation.previous.supersededBy = inserted.id;
      result.superseded += 1;
    }
  }
  return result;
}

export type InsertableMemory = MemoryCandidate & { id: string; sourceConversationId: string };

export type WritableMemoryRepository = MemoryRepository & {
  insert(userId: string, memory: InsertableMemory): Promise<import("@/lib/types").Memory>;
};
