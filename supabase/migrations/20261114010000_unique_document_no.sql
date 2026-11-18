-- ============================================================================
-- NOTARIX 1.0 - UNIQUE DOCUMENT NUMBER CONSTRAINT & ATOMIC GENERATOR
-- Enforces strict database-level uniqueness and provides atomic sequencing.
-- ============================================================================

-- 1. Ensure unique constraint on document_no
alter table public.records drop constraint if exists uq_records_document_no;
alter table public.records add constraint uq_records_document_no unique (document_no);

-- 2. Atomic Document Number Sequence Generator Function
create or replace function public.get_next_document_no(target_year int default extract(year from current_date)::int)
returns text
language plpgsql
as $$
declare
  max_seq int := 0;
  seq_val int;
  r record;
  candidate text;
begin
  for r in select document_no from public.records where document_no ~ ('^(?:NR\s+|DOC-)?' || target_year || '-[0-9]+$') loop
    seq_val := substring(r.document_no from '([0-9]+)$')::int;
    if seq_val > max_seq then
      max_seq := seq_val;
    end if;
  end loop;

  candidate := target_year || '-' || lpad((max_seq + 1)::text, 4, '0');

  while exists(select 1 from public.records where lower(trim(document_no)) = lower(trim(candidate))) loop
    max_seq := max_seq + 1;
    candidate := target_year || '-' || lpad((max_seq + 1)::text, 4, '0');
  end loop;

  return candidate;
end;
$$;

-- 3. Automatic Trigger on Insert to guarantee unique sequential number if empty or duplicate
create or replace function public.trg_enforce_document_no()
returns trigger
language plpgsql
as $$
begin
  if new.document_no is null or trim(new.document_no) = '' or exists(select 1 from public.records where lower(trim(document_no)) = lower(trim(new.document_no)) and id <> coalesce(new.id, 0)) then
    new.document_no := public.get_next_document_no();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_records_document_no on public.records;
create trigger trg_records_document_no
before insert on public.records
for each row
execute function public.trg_enforce_document_no();
