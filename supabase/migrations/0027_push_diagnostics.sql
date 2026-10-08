-- 0027_push_diagnostics.sql — self-reporting for native push registration.
-- Applied remotely already; kept here so the repo matches the database.
-- Safe to re-run (all statements are idempotent).
begin;

create table if not exists public.push_diagnostics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.profiles (id) on delete cascade,
  platform text not null default 'android',
  step text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

alter table public.push_diagnostics enable row level security;

drop policy if exists push_diag_insert on public.push_diagnostics;
create policy push_diag_insert on public.push_diagnostics
  for insert to authenticated with check (user_id is null or auth.uid() = user_id);

drop policy if exists push_diag_select on public.push_diagnostics;
create policy push_diag_select on public.push_diagnostics
  for select to authenticated using (public.is_owner() = true or auth.uid() = user_id);

grant insert, select on public.push_diagnostics to authenticated;

commit;
