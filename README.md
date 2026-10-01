# Aarush

A cloud-native personal agent with a consistent Aarush personality, an OpenAI Conversations-backed active session, and a separate Supabase long-term-memory layer.

## What is included

- Next.js App Router + TypeScript, with server-only API routes.
- `@openai/agents` using `Agent` + `run()` + `OpenAIConversationsSession`.
- One active OpenAI conversation ID per user in `agent_sessions`; completed transcripts remain in Supabase.
- Structured memory extraction at explicit conversation end, with JSON-schema output, retries, duplicate detection, correction/supersession, provenance, pinning, archiving, and a strict retrieval budget.
- Entity/text retrieval in the app, plus a pgvector column and `match_memories` RPC ready for embeddings.
- Chat page with retrieved-memory inspection and explicit end/extract control.
- Memory dashboard for search, editing, pinning, archiving, and deletion.
- `/api/agent`, `/api/memories`, `/api/transcripts`, and `/api/calls` routes.
- ElevenLabs variables and call boundary prepared, but calling is disabled.

The schema supports multiple users. The first milestone uses a stable dev identity and does not include public signup.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Apply `supabase/migrations/001_aarush.sql` in the Supabase SQL editor before using the chat or memory dashboard. Keep `.env.local` server-side and never expose service keys through `NEXT_PUBLIC_` variables.

Useful checks:

```bash
npm test
npm run typecheck
npm run build
```

Without OpenAI and Supabase credentials, the UI can render but API calls intentionally return a configuration error.

## Environment variables

Required for the app:

- `OPENAI_API_KEY` — server-only API key used by the Agents SDK and memory extraction.
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL. The URL is public metadata; the service key is not.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase service-role key.

Optional:

- `OPENAI_MODEL` (default `gpt-4.1-mini`)
- `OPENAI_EMBEDDING_MODEL` (reserved for semantic retrieval)
- `AARUSH_DEV_USER_ID` (default `00000000-0000-0000-0000-000000000001`)
- `AARUSH_DEV_USER_NAME` (default `Owner`)
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AARUSH_AGENT_ID`
- `ELEVENLABS_AARUSH_PHONE_NUMBER_ID`
- `ELEVENLABS_ENABLED=false` (must remain false for this milestone)

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Supabase, run the migration SQL and copy the project URL and service-role key.
3. In Vercel, import the GitHub repository as a Next.js project.
4. Add the variables above under Vercel Project Settings → Environment Variables for Preview and Production. Add secrets through Vercel's secure value fields, not the repository.
5. Deploy. The exact next step after this implementation is to push the repository, import it into Vercel, add the three required variables, and redeploy after the first environment-variable save.

## Deliberate non-goals for milestone one

No ChatGPT archive import, multi-agent orchestration, computer control, Windows dependency, local model, or active ElevenLabs call path is included.
