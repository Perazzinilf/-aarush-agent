create extension if not exists pgcrypto;
create extension if not exists vector;

do $$ begin
  create type memory_type as enum (
    'people', 'shared_events', 'preferences', 'recurring_jokes',
    'relationship_history', 'important_facts', 'promises_commitments', 'corrections'
  );
exception when duplicate_object then null;
end $$;

create table if not exists aarush_users (
  id uuid primary key,
  external_key text not null unique,
  display_name text not null default 'Owner',
  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references aarush_users(id) on delete cascade,
  openai_conversation_id text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  extracted_memory_ids uuid[] not null default '{}'
);
create index if not exists conversations_user_started_idx on conversations(user_id, started_at desc);

create table if not exists agent_sessions (
  user_id uuid primary key references aarush_users(id) on delete cascade,
  openai_conversation_id text not null,
  transcript_id uuid not null references conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references aarush_users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx on messages(conversation_id, created_at);

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references aarush_users(id) on delete cascade,
  type memory_type not null,
  summary text not null,
  entities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  event_date date,
  importance numeric(4,3) not null default 0.5 check (importance between 0 and 1),
  confidence numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  source_conversation_id text not null,
  pinned boolean not null default false,
  archived boolean not null default false,
  superseded_by uuid references memories(id) on delete set null,
  embedding vector(1536)
);
create index if not exists memories_user_active_idx on memories(user_id, archived, superseded_by);
create index if not exists memories_search_idx on memories using gin(to_tsvector('simple', summary));
create index if not exists memories_embedding_idx on memories using ivfflat (embedding vector_cosine_ops) with (lists = 50);

insert into aarush_users(id, external_key, display_name)
values ('00000000-0000-0000-0000-000000000001', 'dev-owner', 'Owner')
on conflict (id) do nothing;

create or replace function match_memories(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  request_user_id uuid
)
returns table (id uuid, summary text, similarity float)
language sql stable
as $$
  select m.id, m.summary, 1 - (m.embedding <=> query_embedding) as similarity
  from memories m
  where m.user_id = request_user_id
    and not m.archived
    and m.superseded_by is null
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

alter table aarush_users enable row level security;
alter table conversations enable row level security;
alter table agent_sessions enable row level security;
alter table messages enable row level security;
alter table memories enable row level security;

-- The app uses the server-only Supabase service role. Add user-scoped authenticated
-- policies before exposing Supabase directly to a browser in a future milestone.
