-- TextBridge performs room authorization in its server API. Browser clients only
-- use Supabase Auth and Realtime Presence, so the Data API and Storage must not
-- expose room contents directly.

update storage.buckets
set public = false
where id = 'textbridge-files';

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
