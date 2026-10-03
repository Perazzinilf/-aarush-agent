import { describe, expect, it } from "vitest";
import { normalizeCallTranscript, normalizeTwilioForm } from "@/lib/calls";

describe("voice call bridge", () => {
  it("normalizes an ElevenLabs post-call transcript into the shared transcript shape", () => {
    const result = normalizeCallTranscript({
      type: "post_call_transcription",
      data: {
        conversation_id: "conv_voice_123",
        transcript: [
          { role: "user", message: "My brother Ricardo loves Mitra." },
          { role: "agent", message: "Useful information, irritatingly specific." },
        ],
      },
    });
    expect(result).toMatchObject({ provider: "elevenlabs", externalConversationId: "conv_voice_123" });
    expect(result?.messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: "user", content: "My brother Ricardo loves Mitra." },
      { role: "assistant", content: "Useful information, irritatingly specific." },
    ]);
  });

  it("recognizes Twilio transcription callbacks", () => {
    const form = new FormData();
    form.set("CallSid", "CA123");
    form.set("TranscriptionText", "Ricardo is visiting next week.");
    const result = normalizeTwilioForm(form);
    expect(result?.externalConversationId).toBe("CA123");
    expect(result?.messages[0].role).toBe("user");
  });
});
