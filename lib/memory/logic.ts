import type { Memory, MemoryCandidate, RetrievedMemory, TranscriptMessage } from "@/lib/types";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "been", "being", "could", "from", "have", "into",
  "just", "like", "love", "loves", "more", "most", "that", "the", "their", "there",
  "this", "very", "what", "when", "with", "would", "your",
]);

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function meaningfulTokens(value: string): string[] {
  return [...new Set(normalizeText(value).split(" ").filter((token) => token.length > 2 && !STOP_WORDS.has(token)))];
}

export function extractEntityHints(value: string): string[] {
  const candidates = value.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) ?? [];
  return [...new Set(candidates.map((candidate) => candidate.trim()))].slice(0, 12);
}

export function memoryFingerprint(memory: Pick<Memory | MemoryCandidate, "type" | "summary" | "entities">): string {
  return [memory.type, normalizeText(memory.summary), ...memory.entities.map(normalizeText).sort()].join("|");
}

function overlapScore(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length / Math.max(left.length, right.length);
}

export function detectDuplicateMemory(candidate: MemoryCandidate, existing: Memory[]): Memory | null {
  const candidateFingerprint = memoryFingerprint(candidate);
  return existing.find((memory) => {
    if (memory.archived || memory.supersededBy) return false;
    if (memoryFingerprint(memory) === candidateFingerprint) return true;
    return memory.type === candidate.type && overlapScore(meaningfulTokens(memory.summary), meaningfulTokens(candidate.summary)) >= 0.82;
  }) ?? null;
}

const CORRECTION_MARKERS = ["actually", "correction", "wrong", "not ", "no longer", "instead", "update", "change"];

export function looksLikeCorrection(summary: string): boolean {
  const normalized = ` ${normalizeText(summary)} `;
  return CORRECTION_MARKERS.some((marker) => normalized.includes(` ${marker.trim()} `) || normalized.includes(marker));
}

export function findMemoryToSupersede(candidate: MemoryCandidate, existing: Memory[]): Memory | null {
  if (!looksLikeCorrection(candidate.summary)) return null;
  const candidateTokens = meaningfulTokens(candidate.summary).filter((token) => !CORRECTION_MARKERS.includes(token));
  return existing
    .filter((memory) => !memory.archived && !memory.supersededBy && memory.type === candidate.type)
    .sort((a, b) => overlapScore(meaningfulTokens(b.summary), candidateTokens) - overlapScore(meaningfulTokens(a.summary), candidateTokens))
    .find((memory) => overlapScore(meaningfulTokens(memory.summary), candidateTokens) >= 0.25) ?? null;
}

export type Reconciliation =
  | { action: "insert"; candidate: MemoryCandidate }
  | { action: "duplicate"; existing: Memory }
  | { action: "supersede"; previous: Memory; candidate: MemoryCandidate };

export function reconcileMemory(candidate: MemoryCandidate, existing: Memory[]): Reconciliation {
  const duplicate = detectDuplicateMemory(candidate, existing);
  if (duplicate) return { action: "duplicate", existing: duplicate };
  const previous = findMemoryToSupersede(candidate, existing);
  if (previous) return { action: "supersede", previous, candidate };
  return { action: "insert", candidate };
}

export function selectRelevantMemories(
  query: string,
  memories: Memory[],
  options: { maxItems?: number; maxCharacters?: number } = {},
): RetrievedMemory[] {
  const maxItems = options.maxItems ?? 8;
  const maxCharacters = options.maxCharacters ?? 2400;
  const queryTokens = meaningfulTokens(query);
  const queryEntities = extractEntityHints(query).map(normalizeText);
  const active = memories.filter((memory) => !memory.archived && !memory.supersededBy);

  const scored = active.map((memory) => {
    const memoryTokens = meaningfulTokens(`${memory.summary} ${memory.entities.join(" ")}`);
    const entityMatches = memory.entities.filter((entity) => queryEntities.includes(normalizeText(entity)));
    const tokenMatches = queryTokens.filter((token) => memoryTokens.includes(token));
    const score = (entityMatches.length ? 0.65 + Math.min(entityMatches.length * 0.1, 0.25) : 0) +
      Math.min(tokenMatches.length / Math.max(queryTokens.length, 1), 0.35) +
      (memory.pinned ? 0.08 : 0) + memory.importance * 0.02;
    return {
      memory,
      score,
      reasons: [
        ...(entityMatches.length ? [`entity: ${entityMatches.join(", ")}`] : []),
        ...(tokenMatches.length ? [`text: ${tokenMatches.slice(0, 5).join(", ")}`] : []),
        ...(memory.pinned ? ["pinned"] : []),
      ],
    };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);

  const selected: RetrievedMemory[] = [];
  let characters = 0;
  for (const item of scored) {
    if (selected.length >= maxItems) break;
    const cost = item.memory.summary.length + item.memory.entities.join(", ").length + 120;
    if (characters + cost > maxCharacters) continue;
    selected.push(item);
    characters += cost;
  }
  return selected;
}

export function formatMemoryContext(memories: RetrievedMemory[]): string {
  if (!memories.length) return "No relevant continuity notes were found.";
  return memories.map(({ memory }) => `- [${memory.type}] ${memory.summary}`).join("\n");
}

export function buildMemoryExtractionPrompt(messages: TranscriptMessage[]): string {
  const transcript = messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
  return `Review this completed conversation and extract only durable, useful long-term memories about the user or their relationship with Aarush. Do not save greetings, one-off questions, temporary logistics, generic opinions, or every sentence. Prefer no memory over a weak memory. Include corrections when the user clearly updates an earlier fact.\n\nAllowed memory types: people, shared_events, preferences, recurring_jokes, relationship_history, important_facts, promises_commitments, corrections.\n\nConversation:\n${transcript}`;
}
