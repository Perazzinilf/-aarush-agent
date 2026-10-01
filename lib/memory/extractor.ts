import OpenAI from "openai";
import { requiredEnv } from "@/lib/env";
import { buildMemoryExtractionPrompt } from "@/lib/memory/logic";
import { MEMORY_TYPES, type MemoryCandidate, type TranscriptMessage } from "@/lib/types";

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    memories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: [...MEMORY_TYPES] },
          summary: { type: "string" },
          entities: { type: "array", items: { type: "string" } },
          event_date: { type: ["string", "null"] },
          importance: { type: "number", minimum: 0, maximum: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["type", "summary", "entities", "event_date", "importance", "confidence"],
      },
    },
  },
  required: ["memories"],
} as const;

function parseCandidates(raw: string): MemoryCandidate[] {
  const parsed = JSON.parse(raw) as { memories?: Array<Record<string, unknown>> };
  if (!Array.isArray(parsed.memories)) return [];
  return parsed.memories.flatMap((item) => {
    if (!MEMORY_TYPES.includes(item.type as (typeof MEMORY_TYPES)[number])) return [];
    const summary = typeof item.summary === "string" ? item.summary.trim() : "";
    if (summary.length < 8) return [];
    const entities = Array.isArray(item.entities) ? item.entities.filter((value): value is string => typeof value === "string").slice(0, 12) : [];
    return [{
      type: item.type as MemoryCandidate["type"],
      summary,
      entities,
      eventDate: typeof item.event_date === "string" ? item.event_date : null,
      importance: clampNumber(item.importance, 0.5),
      confidence: clampNumber(item.confidence, 0.5),
    }];
  });
}

function clampNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

export async function extractLongTermMemories(
  messages: TranscriptMessage[],
  options: { conversationId: string; retries?: number; client?: OpenAI } ,
): Promise<MemoryCandidate[]> {
  if (!messages.length) return [];
  const client = options.client ?? new OpenAI({ apiKey: requiredEnv("OPENAI_API_KEY") });
  const retries = options.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        input: buildMemoryExtractionPrompt(messages),
        text: {
          format: {
            type: "json_schema",
            name: "aarush_memory_extraction",
            strict: true,
            schema: EXTRACTION_SCHEMA,
          },
        },
      });
      return parseCandidates(response.output_text || "{\"memories\":[]}");
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw new Error(`Memory extraction failed after ${retries + 1} attempts for ${options.conversationId}: ${String(lastError)}`);
}
