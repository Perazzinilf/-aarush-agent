import { NextResponse } from "next/server";
import { getDevUser, isElevenLabsEnabled } from "@/lib/env";
import { ingestCallTranscript, normalizeCallTranscript, normalizeTwilioForm, startElevenLabsCall, verifyElevenLabsSignature, verifyTwilioSignature } from "@/lib/calls";
import { formatMemoryContext } from "@/lib/memory/logic";
import { retrieveRelevantMemories } from "@/lib/memory/service";
import { SupabaseMemoryRepository } from "@/lib/memory/repository";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    enabled: isElevenLabsEnabled(),
    configured: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AARUSH_AGENT_ID && process.env.ELEVENLABS_AARUSH_PHONE_NUMBER_ID),
    status: isElevenLabsEnabled() ? "enabled" : "prepared-but-disabled",
    webhook: "/api/calls",
    userId: getDevUser().id,
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = new FormData();
    if (contentType.includes("multipart/form-data")) {
      const parsed = await new Request(request.url, { method: "POST", headers: request.headers, body: rawBody }).formData();
      parsed.forEach((value, key) => form.append(key, value));
    } else {
      new URLSearchParams(rawBody).forEach((value, key) => form.append(key, value));
    }
    if (!verifyTwilioSignature(request.url, form, request.headers.get("x-twilio-signature"))) return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 401 });
    const transcript = normalizeTwilioForm(form);
    if (!transcript) return NextResponse.json({ received: true, processed: false, reason: "No transcript in callback" });
    return NextResponse.json(await ingestCallTranscript(transcript));
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Expected JSON or Twilio form data" }, { status: 400 });
  }
  const objectBody = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const isElevenLabsPayload = Boolean(objectBody?.type === "post_call_transcription" || objectBody?.type === "post_call_audio");
  if (isElevenLabsPayload && !verifyElevenLabsSignature(rawBody, request.headers.get("elevenlabs-signature") ?? request.headers.get("x-elevenlabs-signature"))) {
    return NextResponse.json({ error: "Invalid ElevenLabs signature" }, { status: 401 });
  }
  if (objectBody?.action === "start") {
    const toNumber = typeof objectBody.toNumber === "string" ? objectBody.toNumber.trim() : "";
    if (!toNumber) return NextResponse.json({ error: "toNumber is required" }, { status: 400 });
    try {
      return NextResponse.json(await startElevenLabsCall(toNumber), { status: 201 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start call" }, { status: 503 });
    }
  }
  const isMemoryRequest = Boolean(objectBody &&
    (objectBody.action === "retrieve_memory" ||
      (typeof objectBody.query === "string" && objectBody.type === undefined)));
  if (isMemoryRequest) {
    const secret = process.env.ELEVENLABS_CALL_TOOL_SECRET;
    const suppliedSecret = request.headers.get("x-aarush-call-secret");
    if (!secret || suppliedSecret !== secret) return NextResponse.json({ error: "Call memory tool is not configured" }, { status: 503 });
    const query = typeof objectBody?.query === "string" ? objectBody.query.trim() : "";
    if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
    const memories = await retrieveRelevantMemories(new SupabaseMemoryRepository(), getDevUser().id, query, { maxItems: 6, maxCharacters: 1800 });
    return NextResponse.json({ context: formatMemoryContext(memories), memories: memories.map(({ memory, reasons }) => ({ memory, reasons })) });
  }
  const transcript = normalizeCallTranscript(body);
  if (!transcript) return NextResponse.json({ error: "No supported call transcript found" }, { status: 400 });
  return NextResponse.json(await ingestCallTranscript(transcript));
}
