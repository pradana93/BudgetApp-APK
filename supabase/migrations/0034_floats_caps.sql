-- 0034_floats_caps.sql — member spending caps + cash advance float (idempotent)
begin;

create table if not exists public.member_caps (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  monthly_cap numeric not null check (monthly_cap > 0),
  currency text not null default 'IDR'
);

create table if not exists public.member_floats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance numeric not null default 0
);

create table if not exists public.float_movements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('topup', 'spend')),
  amount numeric not null check (amount > 0),
  request_id uuid references public.reimbursement_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists float_mov_member_idx on public.float_movements(member_id, created_at desc);

alter table public.reimbursement_requests add column if not exists use_float boolean not null default false;

alter table public.member_caps enable row level security;
alter table public.member_floats enable row level security;
alter table public.float_movements enable row level security;

drop policy if exists "caps_owner_all" on public.member_caps;
drop policy if exists "caps_member_read" on public.member_caps;
drop policy if exists "floats_owner_all" on public.member_floats;
drop policy if exists "floats_member_read" on public.member_floats;
drop policy if exists "mov_owner_all" on public.float_movements;
drop policy if exists "mov_member_read" on public.float_movements;

create policy "caps_owner_all" on public.member_caps
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "caps_member_read" on public.member_caps
  for select to authenticated using (user_id = auth.uid());

create policy "floats_owner_all" on public.member_floats
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "floats_member_read" on public.member_floats
  for select to authenticated using (user_id = auth.uid());

create policy "mov_owner_all" on public.float_movements
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "mov_member_read" on public.float_movements
  for select to authenticated using (member_id = auth.uid());

-- Owner-only top-up (atomic balance + movement row).
create or replace function public.topup_float(p_user_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only owner can top up float'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  insert into public.member_floats (user_id, balance) values (p_user_id, p_amount)
  on conflict (user_id) do update set balance = public.member_floats.balance + excluded.balance;
  insert into public.float_movements (member_id, kind, amount) values (p_user_id, 'topup', p_amount);
end; $$;

-- Approved float requests deduct automatically. Never blocks approval.
create or replace function public.deduct_float_on_approve()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and NEW.status = 'approved' and OLD.status <> 'approved' and coalesce(NEW.use_float, false) then
    insert into public.member_floats (user_id, balance) values (NEW.requester_id, 0)
    on conflict (user_id) do nothing;
    update public.member_floats set balance = balance - NEW.amount where user_id = NEW.requester_id;
    insert into public.float_movements (member_id, kind, amount, request_id)
    values (NEW.requester_id, 'spend', NEW.amount, NEW.id);
  end if;
  return NEW;
exception when others then
  return NEW;
end; $$;

drop trigger if exists trg_deduct_float on public.reimbursement_requests;
create trigger trg_deduct_float after update on public.reimbursement_requests
for each row execute function public.deduct_float_on_approve();

commit;
