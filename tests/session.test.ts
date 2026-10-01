import { describe, expect, it, vi } from "vitest";
import { getOrCreateStoredSession } from "@/lib/agent/session";
import type { AgentSessionRecord } from "@/lib/types";

describe("persistent session identity", () => {
  it("creates one durable conversation id per user and reuses it", async () => {
    const records = new Map<string, AgentSessionRecord>();
    const store = {
      getActiveSession: vi.fn(async (userId: string) => records.get(userId) ?? null),
      createActiveSession: vi.fn(async (record: AgentSessionRecord) => { records.set(record.userId, record); }),
    };
    const createConversationId = vi.fn(async () => "conv_persistent_123");
    const first = await getOrCreateStoredSession("user-a", store, createConversationId);
    const second = await getOrCreateStoredSession("user-a", store, createConversationId);
    expect(first.openaiConversationId).toBe("conv_persistent_123");
    expect(second).toEqual(first);
    expect(createConversationId).toHaveBeenCalledTimes(1);
    expect(store.createActiveSession).toHaveBeenCalledTimes(1);
  });
});
