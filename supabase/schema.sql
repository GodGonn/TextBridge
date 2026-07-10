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
  deleted_at timestamptz
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
  deleted_at timestamptz
);

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
values ('textbridge-files', 'textbridge-files', true, 104857600, null)
on conflict (id) do update
set public = true,
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

-- Compatibility mode keeps account-free rooms working when no server secret is configured.
-- Production deployments should set SUPABASE_SECRET_KEY and replace these with deny-all policies.
create policy "rooms compatibility access" on public.rooms
  for all to anon, authenticated using (true) with check (true);

create policy "messages compatibility access" on public.messages
  for all to anon, authenticated using (true) with check (true);

create policy "files compatibility access" on public.files
  for all to anon, authenticated using (true) with check (true);

create policy "textbridge storage compatibility insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'textbridge-files');

create policy "textbridge storage compatibility update" on storage.objects
  for update to anon, authenticated using (bucket_id = 'textbridge-files') with check (bucket_id = 'textbridge-files');

create policy "textbridge storage compatibility delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'textbridge-files');

revoke all on table public.rooms from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.files from anon, authenticated;
grant all on table public.rooms to anon, authenticated;
grant all on table public.messages to anon, authenticated;
grant all on table public.files to anon, authenticated;
grant select, insert, update on table public.users to authenticated;
grant select, insert, update, delete on table public.room_members to authenticated;

create index if not exists rooms_created_by_idx on public.rooms (created_by);
create index if not exists messages_room_id_idx on public.messages (room_id);
create index if not exists files_room_id_idx on public.files (room_id);
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
