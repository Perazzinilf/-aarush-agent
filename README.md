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
- `/api/calls` accepts ElevenLabs post-call transcripts and Twilio transcription callbacks, stores them in the same user-scoped transcript tables, extracts long-term memories, and deduplicates provider retries.
- ElevenLabs outbound calling is available behind `ELEVENLABS_ENABLED=true`; it remains disabled until the provider configuration is complete.

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
- `ELEVENLABS_ENABLED=false` (set to `true` only after configuring the call provider)
- `ELEVENLABS_WEBHOOK_SECRET` (recommended for signed ElevenLabs post-call webhooks)
- `ELEVENLABS_CALL_TOOL_SECRET` (optional separate password for the ElevenLabs live memory-retrieval tool; if omitted, the webhook secret is accepted)
- `TWILIO_AUTH_TOKEN` (only needed for direct Twilio callback signature verification)

## Connect ElevenLabs and Twilio calls

The web chat and voice path use the same `AARUSH_DEV_USER_ID`. Configure the ElevenLabs agent with Aarush's personality, attach the Twilio phone number through ElevenLabs, and set its post-call transcription webhook to:

```text
https://aarush-agent.vercel.app/api/calls
```

The webhook must deliver the post-call transcript. The route creates a durable conversation record, saves the user/agent messages, extracts useful memories, and writes them to the same `memories` table used by web chat. Repeated provider webhooks are ignored after the conversation is finalized.

To let Aarush use those memories during a later phone call, add an ElevenLabs server tool pointing to the same URL. Have the tool send `{ "action": "retrieve_memory", "query": "..." }` with the `x-aarush-call-secret` header set to `ELEVENLABS_CALL_TOOL_SECRET`. Give the tool a short description such as “Retrieve relevant private continuity notes before answering the caller.” The returned `context` should be available to the voice agent before it replies. This keeps retrieval server-side and uses the same `memories` table as web chat.

For outbound calls from the app, POST JSON to `/api/calls` with `{ "action": "start", "toNumber": "+..." }` after setting `ELEVENLABS_ENABLED=true`. This uses ElevenLabs' Twilio outbound-call API and the configured agent/phone-number IDs.

Twilio should remain the telephony transport attached to the ElevenLabs agent. A direct Twilio webhook carrying `CallSid` and `TranscriptionText` is also accepted, but it does not replace the ElevenLabs voice agent.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Supabase, run the migration SQL and copy the project URL and service-role key.
3. In Vercel, import the GitHub repository as a Next.js project.
4. Add the variables above under Vercel Project Settings → Environment Variables for Preview and Production. Add secrets through Vercel's secure value fields, not the repository.
5. Deploy. The exact next step after this implementation is to push the repository, import it into Vercel, add the three required variables, and redeploy after the first environment-variable save.

## Deliberate non-goals for milestone one

No ChatGPT archive import, multi-agent orchestration, computer control, Windows dependency, local model, or active ElevenLabs call path is included.
