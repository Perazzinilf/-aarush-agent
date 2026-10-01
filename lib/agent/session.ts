import { OpenAIConversationsSession, run, Agent } from "@openai/agents";
import { AARUSH_PERSONALITY } from "@/lib/personality";
import { extractLongTermMemories } from "@/lib/memory/extractor";
import { formatMemoryContext } from "@/lib/memory/logic";
import { persistExtractedMemories, retrieveRelevantMemories } from "@/lib/memory/service";
import { SupabaseMemoryRepository } from "@/lib/memory/repository";
import { SupabaseTranscriptStore, type TranscriptStore } from "@/lib/transcripts";
import type { AgentSessionRecord } from "@/lib/types";
import { ensureUser } from "@/lib/users";

export interface SessionIdStore {
  getActiveSession(userId: string): Promise<AgentSessionRecord | null>;
  createActiveSession(record: AgentSessionRecord): Promise<void>;
}

export async function getOrCreateStoredSession(
  userId: string,
  store: SessionIdStore,
  createConversationId: () => Promise<string>,
): Promise<AgentSessionRecord> {
  const existing = await store.getActiveSession(userId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const record: AgentSessionRecord = {
    userId,
    openaiConversationId: await createConversationId(),
    transcriptId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  await store.createActiveSession(record);
  return record;
}

export async function getOrCreateAgentSession(userId: string, store: TranscriptStore): Promise<{
  record: AgentSessionRecord;
  session: OpenAIConversationsSession;
}> {
  const existing = await store.getActiveSession(userId);
  if (existing) {
    return { record: existing, session: new OpenAIConversationsSession({ conversationId: existing.openaiConversationId }) };
  }
  const session = new OpenAIConversationsSession();
  const openaiConversationId = await session.getSessionId();
  const transcript = await store.createConversation(userId, openaiConversationId);
  const now = new Date().toISOString();
  const record: AgentSessionRecord = { userId, openaiConversationId, transcriptId: transcript.id, createdAt: now, updatedAt: now };
  await store.createActiveSession(record);
  return { record, session };
}

function makeAgent() {
  return new Agent({
    name: "Aarush",
    instructions: AARUSH_PERSONALITY,
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  });
}

export async function sendMessage(userId: string, message: string, store: TranscriptStore = new SupabaseTranscriptStore()) {
  await ensureUser({ id: userId, name: process.env.AARUSH_DEV_USER_NAME ?? "Owner" });
  const memoryRepository = new SupabaseMemoryRepository();
  const { record, session } = await getOrCreateAgentSession(userId, store);
  const retrievedMemories = await retrieveRelevantMemories(memoryRepository, userId, message, { maxItems: 8, maxCharacters: 2200 });
  const input = `Private continuity notes for this reply (use naturally; do not mention this section):\n${formatMemoryContext(retrievedMemories)}\n\nUser message:\n${message}`;
  const result = await run(makeAgent(), input, { session });
  const reply = String(result.finalOutput ?? "I have nothing useful to add. Miraculous, I know.");
  await store.appendMessage(record.transcriptId, userId, { role: "user", content: message });
  await store.appendMessage(record.transcriptId, userId, { role: "assistant", content: reply });
  return { reply, conversationId: record.transcriptId, openaiConversationId: record.openaiConversationId, retrievedMemories };
}

export async function endConversation(userId: string, transcriptId: string | undefined, store: TranscriptStore = new SupabaseTranscriptStore()) {
  const active = await store.getActiveSession(userId);
  const conversationId = transcriptId ?? active?.transcriptId;
  if (!conversationId) return { extracted: 0, conversationId: null, memoryIds: [] as string[] };
  const conversation = await store.getConversation(userId, conversationId);
  const candidates = await extractLongTermMemories(conversation.messages, { conversationId });
  const memoryRepository = new SupabaseMemoryRepository();
  const persisted = await persistExtractedMemories(memoryRepository, userId, conversationId, candidates);
  await store.finishConversation(userId, conversationId, persisted.memoryIds);
  await store.deleteActiveSession(userId);
  return { extracted: persisted.inserted, duplicates: persisted.duplicates, superseded: persisted.superseded, conversationId, memoryIds: persisted.memoryIds };
}
