-- 0030_push_event.sql — server-side FCM fan-out trigger (idempotent)
-- Fires push-event on every request insert/update; the function itself
-- decides recipients. The shared secret lives in Vault under the name
-- "push-event-secret" (set outside this repo), so nothing secret is
-- committed here. All failures are swallowed: never block the write.
begin;

create or replace function public.notify_push_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
  v_payload jsonb;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push-event-secret' limit 1;
  if v_secret is null or v_secret = '' then return NEW; end if;
  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW),
    'old_record', case when TG_OP = 'UPDATE' then row_to_json(OLD) else null end
  );
  perform net.http_post(
    url := 'https://frxzokdrpvdqcmbkjwcw.supabase.co/functions/v1/push-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyeHpva2RycHZkcWNtYmtqd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTI4MTUsImV4cCI6MjEwNDc2ODgxNX0.H7wFMejnwyxDemigL-3dBqBfnYr5xKAyl4sRHWjoWdY',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyeHpva2RycHZkcWNtYmtqd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTI4MTUsImV4cCI6MjEwNDc2ODgxNX0.H7wFMejnwyxDemigL-3dBqBfnYr5xKAyl4sRHWjoWdY',
      'x-push-secret', v_secret
    ),
    body := v_payload,
    timeout_milliseconds := 10000
  );
  return NEW;
exception when others then
  return NEW;
end; $$;

drop trigger if exists trg_push_event on public.reimbursement_requests;
create trigger trg_push_event after insert or update on public.reimbursement_requests
for each row execute function public.notify_push_event();

commit;
