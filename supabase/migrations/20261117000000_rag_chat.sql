-- 모두의 AI: chat history + pgvector knowledge base
-- Run once in the Supabase SQL editor if this migration has not been applied.

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '새 대화',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(4096),
  created_at timestamptz not null default now(),
  unique (chunk_index)
);

create table if not exists public.app_config (
  key text primary key,
  value text not null
);

insert into public.app_config (key, value)
values ('ingest_secret_sha256', '510357c5ddc0669826727f421db79435b939a42360248cd347ebc0d10ea8b562')
on conflict (key) do update set value = excluded.value;

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;
alter table public.app_config enable row level security;

drop policy if exists conversations_select_own on public.conversations;
drop policy if exists conversations_insert_own on public.conversations;
drop policy if exists conversations_update_own on public.conversations;
drop policy if exists conversations_delete_own on public.conversations;
drop policy if exists messages_select_own on public.messages;
drop policy if exists messages_insert_own on public.messages;
drop policy if exists messages_update_own on public.messages;
drop policy if exists messages_delete_own on public.messages;
drop policy if exists documents_select_authenticated on public.documents;

create policy conversations_select_own on public.conversations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy conversations_insert_own on public.conversations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy conversations_update_own on public.conversations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy conversations_delete_own on public.conversations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy messages_select_own on public.messages
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy messages_insert_own on public.messages
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy messages_update_own on public.messages
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy messages_delete_own on public.messages
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy documents_select_authenticated on public.documents
  for select to authenticated
  using (true);

revoke all on table public.app_config from anon, authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select on table public.documents to authenticated;

create or replace function public.touch_conversation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id
    and user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row
  execute function public.touch_conversation();

create or replace function public.match_documents(
  query_embedding extensions.vector(4096),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  source text,
  content text,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    documents.id,
    documents.source,
    documents.content,
    (1 - (documents.embedding <=> query_embedding))::float as similarity
  from public.documents
  where documents.embedding <=> query_embedding < 1 - match_threshold
  order by documents.embedding <=> query_embedding asc
  limit least(match_count, 8);
$$;

revoke all on function public.match_documents(extensions.vector, double precision, integer) from public;
grant execute on function public.match_documents(extensions.vector, double precision, integer) to authenticated;

create or replace function public.replace_documents(
  ingest_secret text,
  chunks jsonb,
  replace_all boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  expected text;
  inserted integer;
begin
  select value into expected
  from public.app_config
  where key = 'ingest_secret_sha256';

  if expected is null
    or encode(extensions.digest(ingest_secret, 'sha256'), 'hex') is distinct from expected then
    raise exception 'forbidden';
  end if;

  if replace_all then
    delete from public.documents where true;
  end if;

  insert into public.documents (source, chunk_index, content, embedding)
  select
    item->>'source',
    (item->>'chunk_index')::integer,
    item->>'content',
    (item->>'embedding')::extensions.vector(4096)
  from jsonb_array_elements(chunks) as item;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.replace_documents(text, jsonb, boolean) from public;
grant execute on function public.replace_documents(text, jsonb, boolean) to anon, authenticated;
