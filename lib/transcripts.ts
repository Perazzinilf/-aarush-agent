import { getSupabaseAdmin } from "@/lib/supabase";
import type { AgentSessionRecord, ConversationRecord, TranscriptMessage } from "@/lib/types";

export interface TranscriptStore {
  createConversation(userId: string, openaiConversationId: string): Promise<ConversationRecord>;
  findConversationByOpenAIId(userId: string, openaiConversationId: string): Promise<ConversationRecord | null>;
  appendMessage(conversationId: string, userId: string, message: TranscriptMessage): Promise<void>;
  getConversation(userId: string, conversationId: string): Promise<ConversationRecord>;
  finishConversation(userId: string, conversationId: string, extractedMemoryIds: string[]): Promise<void>;
  listConversations(userId: string): Promise<ConversationRecord[]>;
  getActiveSession(userId: string): Promise<AgentSessionRecord | null>;
  createActiveSession(record: AgentSessionRecord): Promise<void>;
  deleteActiveSession(userId: string): Promise<void>;
}

function toConversation(row: Record<string, unknown>, messages: TranscriptMessage[] = []): ConversationRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    openaiConversationId: String(row.openai_conversation_id),
    startedAt: String(row.started_at),
    endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
    messages,
    extractedMemoryIds: Array.isArray(row.extracted_memory_ids) ? row.extracted_memory_ids.filter((id): id is string => typeof id === "string") : [],
  };
}

export class SupabaseTranscriptStore implements TranscriptStore {
  constructor(private readonly db = getSupabaseAdmin()) {}

  async createConversation(userId: string, openaiConversationId: string): Promise<ConversationRecord> {
    const { data, error } = await this.db.from("conversations").insert({ user_id: userId, openai_conversation_id: openaiConversationId }).select("*").single();
    if (error) throw error;
    return toConversation(data as Record<string, unknown>);
  }

  async findConversationByOpenAIId(userId: string, openaiConversationId: string): Promise<ConversationRecord | null> {
    const { data, error } = await this.db
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("openai_conversation_id", openaiConversationId)
      .order("started_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = data?.[0];
    return row ? toConversation(row as Record<string, unknown>) : null;
  }

  async appendMessage(conversationId: string, userId: string, message: TranscriptMessage): Promise<void> {
    const { error } = await this.db.from("messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: message.role,
      content: message.content,
      created_at: message.createdAt ?? new Date().toISOString(),
    });
    if (error) throw error;
  }

  async getConversation(userId: string, conversationId: string): Promise<ConversationRecord> {
    const [{ data, error }, messagesResult] = await Promise.all([
      this.db.from("conversations").select("*").eq("id", conversationId).eq("user_id", userId).single(),
      this.db.from("messages").select("role, content, created_at").eq("conversation_id", conversationId).eq("user_id", userId).order("created_at", { ascending: true }),
    ]);
    if (error) throw error;
    if (messagesResult.error) throw messagesResult.error;
    const messages = (messagesResult.data ?? []).map((row) => ({ role: row.role as TranscriptMessage["role"], content: String(row.content), createdAt: String(row.created_at) }));
    return toConversation(data as Record<string, unknown>, messages);
  }

  async finishConversation(userId: string, conversationId: string, extractedMemoryIds: string[]): Promise<void> {
    const { error } = await this.db.from("conversations").update({ ended_at: new Date().toISOString(), extracted_memory_ids: extractedMemoryIds }).eq("id", conversationId).eq("user_id", userId);
    if (error) throw error;
  }

  async listConversations(userId: string): Promise<ConversationRecord[]> {
    const { data, error } = await this.db.from("conversations").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => toConversation(row as Record<string, unknown>));
  }

  async getActiveSession(userId: string): Promise<AgentSessionRecord | null> {
    const { data, error } = await this.db.from("agent_sessions").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      userId: String(data.user_id),
      openaiConversationId: String(data.openai_conversation_id),
      transcriptId: String(data.transcript_id),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    };
  }

  async createActiveSession(record: AgentSessionRecord): Promise<void> {
    const { error } = await this.db.from("agent_sessions").upsert({
      user_id: record.userId,
      openai_conversation_id: record.openaiConversationId,
      transcript_id: record.transcriptId,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    });
    if (error) throw error;
  }

  async deleteActiveSession(userId: string): Promise<void> {
    const { error } = await this.db.from("agent_sessions").delete().eq("user_id", userId);
    if (error) throw error;
  }
}
