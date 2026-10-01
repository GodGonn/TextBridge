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
