alter table public.messages
  add column if not exists sender_user_id uuid,
  add column if not exists sender_device_id uuid,
  add column if not exists sender_name text,
  add column if not exists sender_color text;

alter table public.files
  add column if not exists sender_user_id uuid,
  add column if not exists sender_device_id uuid,
  add column if not exists sender_name text,
  add column if not exists sender_color text;

create index if not exists messages_room_sender_device_idx
  on public.messages (room_id, sender_device_id);
create index if not exists files_room_sender_device_idx
  on public.files (room_id, sender_device_id);

alter table public.messages
  drop constraint if exists messages_sender_name_length_check,
  add constraint messages_sender_name_length_check
    check (sender_name is null or char_length(sender_name) between 1 and 32),
  drop constraint if exists messages_sender_color_format_check,
  add constraint messages_sender_color_format_check
    check (sender_color is null or sender_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.files
  drop constraint if exists files_sender_name_length_check,
  add constraint files_sender_name_length_check
    check (sender_name is null or char_length(sender_name) between 1 and 32),
  drop constraint if exists files_sender_color_format_check,
  add constraint files_sender_color_format_check
    check (sender_color is null or sender_color ~ '^#[0-9A-Fa-f]{6}$');
