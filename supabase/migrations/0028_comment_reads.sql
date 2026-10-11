-- 0028_comment_reads.sql — per-user read tracking for request discussions.
-- Safe to re-run (all statements are idempotent).
begin;

create table if not exists public.comment_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null references public.reimbursement_requests (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.comment_reads enable row level security;

drop policy if exists comment_reads_self on public.comment_reads;
create policy comment_reads_self on public.comment_reads
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.comment_reads to authenticated;

commit;
