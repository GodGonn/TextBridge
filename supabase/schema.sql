create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  password text,
  created_at timestamptz not null default now(),
  expired_at timestamptz,
  created_by uuid,
  is_private boolean not null default false
);

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('textbridge-files', 'textbridge-files', true, 52428800, null)
on conflict (id) do update
set public = true,
    file_size_limit = 52428800,
    allowed_mime_types = null;

alter table public.rooms enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;
alter table public.users enable row level security;
alter table public.room_members enable row level security;

drop policy if exists "rooms are accessible by code" on public.rooms;
drop policy if exists "messages are room scoped but public in v1" on public.messages;
drop policy if exists "files are room scoped but public in v1" on public.files;
drop policy if exists "textbridge storage public read" on storage.objects;
drop policy if exists "textbridge storage public insert" on storage.objects;
drop policy if exists "textbridge storage public update" on storage.objects;
drop policy if exists "textbridge storage public delete" on storage.objects;

create policy "rooms are accessible by code" on public.rooms
  for all using (true) with check (true);

create policy "messages are room scoped but public in v1" on public.messages
  for all using (true) with check (true);

create policy "files are room scoped but public in v1" on public.files
  for all using (true) with check (true);

create policy "textbridge storage public read" on storage.objects
  for select using (bucket_id = 'textbridge-files');

create policy "textbridge storage public insert" on storage.objects
  for insert with check (bucket_id = 'textbridge-files');

create policy "textbridge storage public update" on storage.objects
  for update using (bucket_id = 'textbridge-files') with check (bucket_id = 'textbridge-files');

create policy "textbridge storage public delete" on storage.objects
  for delete using (bucket_id = 'textbridge-files');

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
