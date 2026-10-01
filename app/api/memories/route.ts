import { NextResponse } from "next/server";
import { getDevUser } from "@/lib/env";
import { SupabaseMemoryRepository } from "@/lib/memory/repository";
import { retrieveRelevantMemories } from "@/lib/memory/service";
import { MEMORY_TYPES, type MemoryCandidate } from "@/lib/types";
import { ensureUser } from "@/lib/users";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = getDevUser().id;
    await ensureUser();
    const repository = new SupabaseMemoryRepository();
    const query = new URL(request.url).searchParams.get("q")?.trim();
    const memories = query ? (await retrieveRelevantMemories(repository, userId, query, { maxItems: 50, maxCharacters: 20000 })).map((item) => ({ ...item.memory, matchScore: item.score, matchReasons: item.reasons })) : await repository.list(userId);
    return NextResponse.json({ memories });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load memories" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<MemoryCandidate> & { sourceConversationId?: string };
    const userId = getDevUser().id;
    if (!body.summary || !body.type || !MEMORY_TYPES.includes(body.type)) return NextResponse.json({ error: "type and summary are required" }, { status: 400 });
    const repository = new SupabaseMemoryRepository();
    const memory = await repository.insert(userId, {
      id: crypto.randomUUID(),
      sourceConversationId: body.sourceConversationId ?? "manual",
      type: body.type,
      summary: body.summary.trim(),
      entities: body.entities ?? [],
      eventDate: body.eventDate ?? null,
      importance: body.importance ?? 0.7,
      confidence: body.confidence ?? 1,
    });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create memory" }, { status: 500 });
  }
}
