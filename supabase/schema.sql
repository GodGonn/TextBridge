create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  password text,
  created_at timestamptz not null default now(),
  expired_at timestamptz,
  created_by uuid,
  is_private boolean not null default false,
  is_locked boolean not null default false
);

alter table public.rooms add column if not exists is_locked boolean not null default false;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  text text not null,
  type text not null default 'text',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  expired_at timestamptz,
  deleted_at timestamptz,
  sender_user_id uuid,
  sender_device_id uuid,
  sender_name text,
  sender_color text
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_type text not null,
  file_size bigint not null,
  created_at timestamptz not null default now(),
  expired_at timestamptz,
  deleted_at timestamptz,
  sender_user_id uuid,
  sender_device_id uuid,
  sender_name text,
  sender_color text
);

alter table public.messages add column if not exists sender_user_id uuid;
alter table public.messages add column if not exists sender_device_id uuid;
alter table public.messages add column if not exists sender_name text;
alter table public.messages add column if not exists sender_color text;
alter table public.files add column if not exists sender_user_id uuid;
alter table public.files add column if not exists sender_device_id uuid;
alter table public.files add column if not exists sender_name text;
alter table public.files add column if not exists sender_color text;

create table if not exists public.users (
  id uuid primary key,
  email text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  role text not null default 'guest',
  joined_at timestamptz not null default now()
);

create unique index if not exists room_members_room_user_unique_idx on public.room_members (room_id, user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('textbridge-files', 'textbridge-files', false, 104857600, null)
on conflict (id) do update
set public = false,
    file_size_limit = 104857600,
    allowed_mime_types = null;

alter table public.rooms enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;
alter table public.users enable row level security;
alter table public.room_members enable row level security;

drop policy if exists "users can read own profile" on public.users;
drop policy if exists "users can create own profile" on public.users;
drop policy if exists "users can update own profile" on public.users;
drop policy if exists "users can read own room memberships" on public.room_members;
drop policy if exists "users can save own room memberships" on public.room_members;
drop policy if exists "users can update own room memberships" on public.room_members;
drop policy if exists "users can delete own room memberships" on public.room_members;

create policy "users can read own profile" on public.users
  for select to authenticated using ((select auth.uid()) = id);
create policy "users can create own profile" on public.users
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "users can update own profile" on public.users
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "users can read own room memberships" on public.room_members
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users can save own room memberships" on public.room_members
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users can update own room memberships" on public.room_members
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users can delete own room memberships" on public.room_members
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "rooms are accessible by code" on public.rooms;
drop policy if exists "messages are room scoped but public in v1" on public.messages;
drop policy if exists "files are room scoped but public in v1" on public.files;
drop policy if exists "rooms can be read for room discovery" on public.rooms;
drop policy if exists "messages can be read for realtime" on public.messages;
drop policy if exists "files can be read for realtime" on public.files;
drop policy if exists "rooms compatibility access" on public.rooms;
drop policy if exists "messages compatibility access" on public.messages;
drop policy if exists "files compatibility access" on public.files;
drop policy if exists "textbridge storage public read" on storage.objects;
drop policy if exists "textbridge storage public insert" on storage.objects;
drop policy if exists "textbridge storage public update" on storage.objects;
drop policy if exists "textbridge storage public delete" on storage.objects;
drop policy if exists "textbridge storage compatibility insert" on storage.objects;
drop policy if exists "textbridge storage compatibility update" on storage.objects;
drop policy if exists "textbridge storage compatibility delete" on storage.objects;

revoke all on table public.rooms from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.files from anon, authenticated;
revoke all on table public.users from anon, authenticated;
revoke all on table public.room_members from anon, authenticated;

create index if not exists rooms_created_by_idx on public.rooms (created_by);
create index if not exists messages_room_id_idx on public.messages (room_id);
create index if not exists files_room_id_idx on public.files (room_id);
create index if not exists messages_room_sender_device_idx on public.messages (room_id, sender_device_id);
create index if not exists files_room_sender_device_idx on public.files (room_id, sender_device_id);
create index if not exists room_members_room_id_idx on public.room_members (room_id);
create index if not exists room_members_user_id_idx on public.room_members (user_id);

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.files;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null,
  reset_at timestamptz not null
);

alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_ms integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_reset_at timestamptz;
begin
  if p_limit < 1 or p_window_ms < 1 or length(p_bucket_key) <> 64 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into public.rate_limit_buckets (bucket_key, request_count, reset_at)
  values (p_bucket_key, 1, v_now + p_window_ms * interval '1 millisecond')
  on conflict (bucket_key) do update
    set request_count = case
          when public.rate_limit_buckets.reset_at <= v_now then 1
          else public.rate_limit_buckets.request_count + 1
        end,
        reset_at = case
          when public.rate_limit_buckets.reset_at <= v_now
            then v_now + p_window_ms * interval '1 millisecond'
          else public.rate_limit_buckets.reset_at
        end
  returning public.rate_limit_buckets.request_count, public.rate_limit_buckets.reset_at
    into v_count, v_reset_at;

  if random() < 0.01 then
    delete from public.rate_limit_buckets where reset_at < v_now - interval '1 day';
  end if;

  return query select
    (v_count <= p_limit),
    greatest(1, ceil(extract(epoch from (v_reset_at - v_now)))::integer);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
