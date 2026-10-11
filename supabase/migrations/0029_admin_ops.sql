-- 0029_admin_ops.sql — owner-only budget adjustments (idempotent).
-- All money movement stays append-only: deductions and transfers write
-- ledger entries; deletion is allowed only for untouched budgets.
begin;

-- DEDUCT: owner only, decreases total, writes a debit ledger entry.
create or replace function public.deduct_budget(p_budget_id uuid, p_amount numeric, p_description text)
returns public.ledger_entries
language plpgsql security definer set search_path = public as $$
declare
  v_budget public.budgets%rowtype;
  v_entry public.ledger_entries%rowtype;
begin
  if not public.is_owner() then
    raise exception 'Only owner can deduct budgets';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Deduction amount must be > 0';
  end if;

  select * into v_budget from public.budgets where id = p_budget_id for update;
  if not found then raise exception 'Budget not found'; end if;
  if v_budget.status != 'active' then raise exception 'Budget is not active'; end if;
  if (v_budget.total_amount - v_budget.allocated_amount) < p_amount then
    raise exception 'Insufficient available balance: %, requested %',
      (v_budget.total_amount - v_budget.allocated_amount), p_amount;
  end if;

  update public.budgets set total_amount = total_amount - p_amount where id = p_budget_id;

  insert into public.ledger_entries (budget_id, debit, credit, reference_id, reference_type, description)
    values (p_budget_id, p_amount, 0, p_budget_id, 'adjustment', coalesce(nullif(trim(p_description), ''), 'Admin deduction'))
    returning * into v_entry;
  return v_entry;
end; $$;

-- TRANSFER: owner only, atomically moves total from one budget to another.
create or replace function public.transfer_budget(p_from_budget_id uuid, p_to_budget_id uuid, p_amount numeric, p_description text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from public.budgets%rowtype;
  v_to public.budgets%rowtype;
  v_note text;
begin
  if not public.is_owner() then
    raise exception 'Only owner can transfer between budgets';
  end if;
  if p_from_budget_id = p_to_budget_id then
    raise exception 'Source and destination must differ';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Transfer amount must be > 0';
  end if;
  v_note := coalesce(nullif(trim(p_description), ''), 'Admin transfer');

  -- lock in id order to avoid deadlocks
  if p_from_budget_id < p_to_budget_id then
    select * into v_from from public.budgets where id = p_from_budget_id for update;
    select * into v_to from public.budgets where id = p_to_budget_id for update;
  else
    select * into v_to from public.budgets where id = p_to_budget_id for update;
    select * into v_from from public.budgets where id = p_from_budget_id for update;
  end if;
  if v_from.id is null then raise exception 'Source budget not found'; end if;
  if v_to.id is null then raise exception 'Destination budget not found'; end if;
  if v_from.status != 'active' or v_to.status != 'active' then
    raise exception 'Both budgets must be active';
  end if;
  if (v_from.total_amount - v_from.allocated_amount) < p_amount then
    raise exception 'Insufficient available balance in source: %, requested %',
      (v_from.total_amount - v_from.allocated_amount), p_amount;
  end if;

  update public.budgets set total_amount = total_amount - p_amount where id = p_from_budget_id;
  update public.budgets set total_amount = total_amount + p_amount where id = p_to_budget_id;

  insert into public.ledger_entries (budget_id, debit, credit, reference_id, reference_type, description)
    values (p_from_budget_id, p_amount, 0, p_to_budget_id, 'adjustment', v_note || ' → out');
  insert into public.ledger_entries (budget_id, debit, credit, reference_id, reference_type, description)
    values (p_to_budget_id, 0, p_amount, p_from_budget_id, 'adjustment', v_note || ' → in');
end; $$;

-- DELETE: owner only, only for budgets with zero activity.
create or replace function public.delete_budget(p_budget_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reqs int;
  v_ledger int;
begin
  if not public.is_owner() then
    raise exception 'Only owner can delete budgets';
  end if;

  perform 1 from public.budgets where id = p_budget_id for update;
  if not found then raise exception 'Budget not found'; end if;

  select count(*) into v_reqs from public.reimbursement_requests where budget_id = p_budget_id;
  if v_reqs > 0 then
    raise exception 'Budget has % request(s) — close it instead of deleting', v_reqs;
  end if;

  select count(*) into v_ledger from public.ledger_entries where budget_id = p_budget_id;
  if v_ledger > 0 then
    raise exception 'Budget has ledger history — close it instead of deleting';
  end if;

  delete from public.budgets where id = p_budget_id;
end; $$;

revoke all on function public.deduct_budget(uuid, numeric, text) from public;
revoke all on function public.transfer_budget(uuid, uuid, numeric, text) from public;
revoke all on function public.delete_budget(uuid) from public;
grant execute on function public.deduct_budget(uuid, numeric, text) to authenticated;
grant execute on function public.transfer_budget(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.delete_budget(uuid) to authenticated;

commit;
