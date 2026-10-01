import { getSupabaseAdmin } from "@/lib/supabase";
import { createOptionalEmbedding } from "@/lib/memory/embeddings";
import type { Memory, MemoryCandidate, MemoryUpdate } from "@/lib/types";

export interface MemoryRepository {
  list(userId: string): Promise<Memory[]>;
  insert(userId: string, memory: MemoryCandidate & { id: string; sourceConversationId: string }): Promise<Memory>;
  semanticSearch?(userId: string, embedding: number[]): Promise<Memory[]>;
  update(userId: string, memoryId: string, update: MemoryUpdate): Promise<Memory>;
  delete(userId: string, memoryId: string): Promise<void>;
  markSuperseded(userId: string, oldMemoryId: string, newMemoryId: string): Promise<void>;
}

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: row.type as Memory["type"],
    summary: String(row.summary),
    entities: Array.isArray(row.entities) ? row.entities.filter((value): value is string => typeof value === "string") : [],
    createdAt: String(row.created_at),
    eventDate: typeof row.event_date === "string" ? row.event_date : null,
    importance: Number(row.importance ?? 0.5),
    confidence: Number(row.confidence ?? 0.5),
    sourceConversationId: String(row.source_conversation_id),
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    supersededBy: typeof row.superseded_by === "string" ? row.superseded_by : null,
  };
}

function updateToRow(update: MemoryUpdate): Record<string, unknown> {
  return {
    ...(update.summary !== undefined ? { summary: update.summary } : {}),
    ...(update.type !== undefined ? { type: update.type } : {}),
    ...(update.entities !== undefined ? { entities: update.entities } : {}),
    ...(update.eventDate !== undefined ? { event_date: update.eventDate } : {}),
    ...(update.importance !== undefined ? { importance: update.importance } : {}),
    ...(update.confidence !== undefined ? { confidence: update.confidence } : {}),
    ...(update.pinned !== undefined ? { pinned: update.pinned } : {}),
    ...(update.archived !== undefined ? { archived: update.archived } : {}),
  };
}

export class SupabaseMemoryRepository implements MemoryRepository {
  constructor(private readonly db = getSupabaseAdmin()) {}

  async list(userId: string): Promise<Memory[]> {
    const { data, error } = await this.db.from("memories").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => rowToMemory(row as Record<string, unknown>));
  }

  async insert(userId: string, memory: MemoryCandidate & { id: string; sourceConversationId: string }): Promise<Memory> {
    const embedding = await createOptionalEmbedding(memory.summary);
    const { data, error } = await this.db.from("memories").insert({
      id: memory.id,
      user_id: userId,
      type: memory.type,
      summary: memory.summary,
      entities: memory.entities,
      event_date: memory.eventDate ?? null,
      importance: memory.importance,
      confidence: memory.confidence,
      source_conversation_id: memory.sourceConversationId,
      ...(embedding ? { embedding } : {}),
    }).select("*").single();
    if (error) throw error;
    return rowToMemory(data as Record<string, unknown>);
  }

  async semanticSearch(userId: string, embedding: number[]): Promise<Memory[]> {
    const { data: matches, error: matchError } = await this.db.rpc("match_memories", {
      query_embedding: embedding,
      match_threshold: 0.2,
      match_count: 12,
      request_user_id: userId,
    });
    if (matchError) throw matchError;
    const ids = (matches ?? []).map((match: { id: string }) => match.id);
    if (!ids.length) return [];
    const { data, error } = await this.db.from("memories").select("*").in("id", ids).eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((row) => rowToMemory(row as Record<string, unknown>));
  }

  async update(userId: string, memoryId: string, update: MemoryUpdate): Promise<Memory> {
    const { data, error } = await this.db.from("memories").update(updateToRow(update)).eq("id", memoryId).eq("user_id", userId).select("*").single();
    if (error) throw error;
    return rowToMemory(data as Record<string, unknown>);
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    const { error } = await this.db.from("memories").delete().eq("id", memoryId).eq("user_id", userId);
    if (error) throw error;
  }

  async markSuperseded(userId: string, oldMemoryId: string, newMemoryId: string): Promise<void> {
    const { error } = await this.db.from("memories").update({ superseded_by: newMemoryId }).eq("id", oldMemoryId).eq("user_id", userId);
    if (error) throw error;
  }
}
