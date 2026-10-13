-- 0031_notify_copy.sql — plain punctuation in bell bodies (idempotent)
-- The notify_on_request_change bodies used em dashes; commas read the same
-- in the Notifications list. No logic change.
begin;

create or replace function public.notify_on_request_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner_id uuid;
begin
  if TG_OP = 'INSERT' then
    select p.id into v_owner_id from public.profiles p where p.role = 'owner' order by p.created_at limit 1;
    if v_owner_id is not null and NEW.requester_id <> v_owner_id then
      insert into public.notifications (user_id, type, title, body, link)
      values (v_owner_id, 'new_request', 'New reimbursement request',
        coalesce(NEW.merchant, NEW.category) || ', ' || NEW.amount::text,
        '/requests/' || NEW.id::text);
    end if;
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if NEW.status <> OLD.status and NEW.status in ('approved', 'rejected', 'reconciled') then
      insert into public.notifications (user_id, type, title, body, link)
      values (NEW.requester_id, 'request_' || NEW.status, 'Request ' || NEW.status,
        coalesce(NEW.merchant, NEW.category) || ', ' || NEW.amount::text,
        '/requests/' || NEW.id::text);
    end if;
    return NEW;
  end if;
  return NEW;
end; $$;

commit;
