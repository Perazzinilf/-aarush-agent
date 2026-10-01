import { NextResponse } from "next/server";
import { endConversation, sendMessage } from "@/lib/agent/session";
import { getDevUser } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { message?: unknown; action?: unknown; conversationId?: unknown };
    const user = getDevUser();
    if (body.action === "end") {
      const result = await endConversation(user.id, typeof body.conversationId === "string" ? body.conversationId : undefined);
      return NextResponse.json(result);
    }
    if (typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    return NextResponse.json(await sendMessage(user.id, body.message.trim()));
  } catch (error) {
    console.error("Aarush agent request failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    const status = message.startsWith("Missing required server environment variable") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
