import { NextResponse } from "next/server";
import { getDevUser } from "@/lib/env";
import { SupabaseMemoryRepository } from "@/lib/memory/repository";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const memory = await new SupabaseMemoryRepository().update(getDevUser().id, id, body);
    return NextResponse.json({ memory });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update memory" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    await new SupabaseMemoryRepository().delete(getDevUser().id, id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete memory" }, { status: 500 });
  }
}
