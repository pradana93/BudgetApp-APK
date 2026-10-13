-- 0033_rollover.sql — period rollover rules (idempotent)
-- rollover_mode: off | rollover (carry available) | reset (fresh totals).
-- rolled_from links an auto-started successor to its parent.
begin;

alter table public.budgets add column if not exists rollover_mode text not null default 'off';
alter table public.budgets add column if not exists rolled_from uuid references public.budgets(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'budgets_rollover_mode_check') then
    alter table public.budgets add constraint budgets_rollover_mode_check check (rollover_mode in ('off', 'rollover', 'reset'));
  end if;
end $$;

commit;
