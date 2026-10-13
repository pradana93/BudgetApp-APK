-- 0032_notification_prefs.sql — per-user scheduled-push toggles (idempotent)
-- push-scheduled reads these; lifecycle pushes always send.
begin;

create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  digest_enabled boolean not null default true,
  due_enabled boolean not null default true
);

alter table public.notification_prefs enable row level security;

drop policy if exists "prefs_select_own" on public.notification_prefs;
drop policy if exists "prefs_insert_own" on public.notification_prefs;
drop policy if exists "prefs_update_own" on public.notification_prefs;

create policy "prefs_select_own" on public.notification_prefs
  for select to authenticated using (user_id = auth.uid());
create policy "prefs_insert_own" on public.notification_prefs
  for insert to authenticated with check (user_id = auth.uid());
create policy "prefs_update_own" on public.notification_prefs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

commit;
