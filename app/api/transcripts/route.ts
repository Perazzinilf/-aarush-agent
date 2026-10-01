import { NextResponse } from "next/server";
import { endConversation } from "@/lib/agent/session";
import { getDevUser } from "@/lib/env";
import { SupabaseTranscriptStore } from "@/lib/transcripts";

export const runtime = "nodejs";

export async function GET() {
  try {
    const transcripts = await new SupabaseTranscriptStore().listConversations(getDevUser().id);
    return NextResponse.json({ transcripts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load transcripts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { conversationId?: string };
    const result = await endConversation(getDevUser().id, body.conversationId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to extract memories" }, { status: 500 });
  }
}
