import { NextResponse } from "next/server";
import { isElevenLabsEnabled } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    enabled: isElevenLabsEnabled(),
    configured: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AARUSH_AGENT_ID && process.env.ELEVENLABS_AARUSH_PHONE_NUMBER_ID),
    status: "prepared-but-disabled",
  });
}

export async function POST() {
  return NextResponse.json({ error: "ElevenLabs calling is prepared but disabled for this milestone." }, { status: 501 });
}
