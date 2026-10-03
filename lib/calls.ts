import { createHmac, timingSafeEqual } from "node:crypto";
import { getDevUser, isElevenLabsEnabled, requiredEnv } from "@/lib/env";
import { extractLongTermMemories } from "@/lib/memory/extractor";
import { persistExtractedMemories } from "@/lib/memory/service";
import { SupabaseMemoryRepository } from "@/lib/memory/repository";
import { SupabaseTranscriptStore, type TranscriptStore } from "@/lib/transcripts";
import type { TranscriptMessage } from "@/lib/types";
import { ensureUser } from "@/lib/users";

type CallProvider = "elevenlabs" | "twilio" | "generic";

export interface NormalizedCallTranscript {
  provider: CallProvider;
  externalConversationId: string;
  messages: TranscriptMessage[];
  startedAt?: string;
  endedAt?: string;
}

interface UnknownRecord {
  [key: string]: unknown;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function normalizeRole(value: unknown): TranscriptMessage["role"] | null {
  if (value === "user" || value === "human" || value === "caller") return "user";
  if (value === "assistant" || value === "agent" || value === "ai") return "assistant";
  if (value === "system") return "system";
  return null;
}

function normalizeMessages(value: unknown): TranscriptMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    const role = normalizeRole(row.role ?? row.speaker ?? row.author);
    const content = stringValue(row.message, row.content, row.text, row.transcript);
    if (!role || !content) return [];
    return [{ role, content, createdAt: stringValue(row.created_at, row.createdAt, row.timestamp) }];
  });
}

function parseJsonBody(body: unknown): UnknownRecord {
  return record(body);
}

export function normalizeCallTranscript(body: unknown, providerHint?: CallProvider): NormalizedCallTranscript | null {
  const root = parseJsonBody(body);
  const data = record(root.data);
  const provider = providerHint ?? (root.type === "post_call_transcription" || root.type === "post_call_audio" ? "elevenlabs" : "generic");
  const transcript = data.transcript ?? root.transcript ?? data.messages ?? root.messages;
  const messages = normalizeMessages(transcript);
  const externalConversationId = stringValue(
    data.conversation_id,
    data.conversationId,
    root.conversation_id,
    root.conversationId,
    root.CallSid,
    root.call_sid,
    data.call_sid,
  );
  if (!externalConversationId || messages.length === 0) return null;
  return {
    provider,
    externalConversationId,
    messages,
    startedAt: stringValue(data.started_at, data.start_time, root.started_at, root.StartTime),
    endedAt: stringValue(data.ended_at, data.end_time, root.ended_at, root.EndTime),
  };
}

export function normalizeTwilioForm(form: FormData): NormalizedCallTranscript | null {
  const messages: TranscriptMessage[] = [];
  const transcription = stringValue(form.get("TranscriptionText"), form.get("transcription_text"));
  if (transcription) messages.push({ role: "user", content: transcription });
  const transcript = stringValue(form.get("Transcript"), form.get("transcript"));
  if (transcript) messages.push({ role: "user", content: transcript });
  const callSid = stringValue(form.get("CallSid"), form.get("call_sid"));
  if (!callSid || messages.length === 0) return null;
  return { provider: "twilio", externalConversationId: callSid, messages };
}

export async function ingestCallTranscript(
  transcript: NormalizedCallTranscript,
  userId = getDevUser().id,
  store: TranscriptStore = new SupabaseTranscriptStore(),
) {
  await ensureUser({ id: userId, name: getDevUser().name });
  const sourceId = `call:${transcript.provider}:${transcript.externalConversationId}`;
  const existing = await store.findConversationByOpenAIId(userId, sourceId);
  if (existing?.endedAt) {
    return { status: "already_processed" as const, conversationId: existing.id, memoryIds: existing.extractedMemoryIds };
  }

  const conversation = existing ?? await store.createConversation(userId, sourceId);
  if (!existing || existing.messages.length === 0) {
    for (const message of transcript.messages) {
      await store.appendMessage(conversation.id, userId, message);
    }
  }
  const fullConversation = await store.getConversation(userId, conversation.id);
  const candidates = await extractLongTermMemories(fullConversation.messages, { conversationId: conversation.id });
  const persisted = await persistExtractedMemories(new SupabaseMemoryRepository(), userId, conversation.id, candidates);
  await store.finishConversation(userId, conversation.id, persisted.memoryIds);
  return { status: "processed" as const, conversationId: conversation.id, ...persisted };
}

export function verifyElevenLabsSignature(rawBody: string, signature: string | null, secret = process.env.ELEVENLABS_WEBHOOK_SECRET): boolean {
  if (!secret) return true;
  if (!signature) return false;
  const values = Object.fromEntries(signature.split(/[, ]+/).map((part) => part.split("=", 2) as [string, string]));
  const timestamp = values.t;
  const received = values.v0;
  if (!timestamp || !received) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function verifyTwilioSignature(url: string, form: FormData, signature: string | null, authToken = process.env.TWILIO_AUTH_TOKEN): boolean {
  if (!authToken) return true;
  if (!signature) return false;
  const values = [...form.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}${String(value)}`)
    .join("");
  const expected = createHmac("sha1", authToken).update(`${url}${values}`).digest("base64");
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function startElevenLabsCall(toNumber: string) {
  if (!isElevenLabsEnabled()) throw new Error("ElevenLabs calling is disabled. Set ELEVENLABS_ENABLED=true after configuring the voice provider.");
  const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": requiredEnv("ELEVENLABS_API_KEY") },
    body: JSON.stringify({
      agent_id: requiredEnv("ELEVENLABS_AARUSH_AGENT_ID"),
      agent_phone_number_id: requiredEnv("ELEVENLABS_AARUSH_PHONE_NUMBER_ID"),
      to_number: toNumber,
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs outbound call failed with HTTP ${response.status}`);
  return await response.json() as UnknownRecord;
}
