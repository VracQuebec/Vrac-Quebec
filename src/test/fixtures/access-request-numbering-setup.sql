create table transport_requests(id uuid primary key default gen_random_uuid(), request_number text unique, client_email text, client_name text, fail_after boolean default false);
create sequence transport_requests_number_seq; select setval('transport_requests_number_seq',54,true);
insert into transport_requests(request_number) select 'DT-'||lpad(n::text,4,'0') from unnest(array[3,4,26,27,28,29,32,50,51,52,53,54]) n;
create function validate_transport_request_input() returns trigger language plpgsql as $$begin
 if new.client_email is not null and new.client_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid client_email'; end if; return new; end$$;
create trigger trg_validate_transport_request_input before insert or update on transport_requests for each row execute function validate_transport_request_input();
create function fail_after() returns trigger language plpgsql as $$begin if new.fail_after then raise exception 'erreur simulée après insertion'; end if; return new; end$$;
create trigger trq_on_insert after insert on transport_requests for each row execute function fail_after();
