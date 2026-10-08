-- 0026_push_tokens.sql — native APK push notification device tokens.
-- Client registers FCM tokens here (upsert own rows). Web never writes here.
-- Sending is done by the `send-push` edge function with the service role.
begin;

create table if not exists public.push_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_owner_all on public.push_tokens;
create policy push_tokens_owner_all on public.push_tokens
  for all to authenticated
  using (public.is_owner() = true)
  with check (public.is_owner() = true);

drop policy if exists push_tokens_self on public.push_tokens;
create policy push_tokens_self on public.push_tokens
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.push_tokens to authenticated;

commit;
