export const MEMORY_TYPES = [
  "people",
  "shared_events",
  "preferences",
  "recurring_jokes",
  "relationship_history",
  "important_facts",
  "promises_commitments",
  "corrections",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export type TranscriptRole = "user" | "assistant" | "system";

export interface TranscriptMessage {
  role: TranscriptRole;
  content: string;
  createdAt?: string;
}

export interface Memory {
  id: string;
  userId: string;
  type: MemoryType;
  summary: string;
  entities: string[];
  createdAt: string;
  eventDate: string | null;
  importance: number;
  confidence: number;
  sourceConversationId: string;
  pinned: boolean;
  archived: boolean;
  supersededBy: string | null;
}

export interface MemoryCandidate {
  type: MemoryType;
  summary: string;
  entities: string[];
  eventDate?: string | null;
  importance: number;
  confidence: number;
}

export interface RetrievedMemory {
  memory: Memory;
  score: number;
  reasons: string[];
}

export interface ConversationRecord {
  id: string;
  userId: string;
  openaiConversationId: string;
  startedAt: string;
  endedAt: string | null;
  messages: TranscriptMessage[];
  extractedMemoryIds: string[];
}

export interface AgentSessionRecord {
  userId: string;
  openaiConversationId: string;
  transcriptId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryUpdate {
  summary?: string;
  type?: MemoryType;
  entities?: string[];
  eventDate?: string | null;
  importance?: number;
  confidence?: number;
  pinned?: boolean;
  archived?: boolean;
}
