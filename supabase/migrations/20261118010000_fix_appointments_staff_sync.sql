-- ============================================================================
-- NOTARIX 1.0 - APPOINTMENT MANAGEMENT SYSTEM FIX & REALTIME SYNC
-- 1. Secure Staff RPC Functions (guaranteed Admin & Secretary access)
-- 2. Supabase Auth accounts auto-provisioning & profiles.auth_user_id linking
-- 3. Supabase Realtime publication on public.appointments
-- ============================================================================

-- Enable pgcrypto if not already enabled
create extension if not exists pgcrypto;

-- 1. SECURE RPC: Retrieve all appointments for authorized office staff
create or replace function public.staff_get_appointments(
  p_email text,
  p_password text
)
returns setof public.appointments
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where lower(email) = lower(trim(p_email))
      and password = p_password
      and role in ('admin', 'staff')
  ) then
    raise exception 'Unauthorized: invalid staff credentials.';
  end if;

  return query
    select * from public.appointments
    order by created_at desc;
end;
$$;

-- 2. SECURE RPC: Update appointment status (Approve, Reject, Complete, Cancel)
create or replace function public.staff_update_appointment_status(
  p_email text,
  p_password text,
  p_appointment_id bigint,
  p_status text,
  p_remarks text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.appointments;
begin
  if not exists (
    select 1 from public.profiles
    where lower(email) = lower(trim(p_email))
      and password = p_password
      and role in ('admin', 'staff')
  ) then
    raise exception 'Unauthorized: invalid staff credentials.';
  end if;

  if p_status not in ('Pending', 'Approved', 'Rejected', 'Rescheduled', 'Completed', 'Cancelled') then
    raise exception 'Invalid status value.';
  end if;

  update public.appointments
  set status = p_status,
      remarks = coalesce(p_remarks, remarks),
      updated_at = now()
  where id = p_appointment_id
  returning * into v_row;

  if not found then
    raise exception 'Appointment not found.';
  end if;

  return v_row;
end;
$$;

-- 3. SECURE RPC: Reschedule appointment
create or replace function public.staff_reschedule_appointment(
  p_email text,
  p_password text,
  p_appointment_id bigint,
  p_date date,
  p_time time,
  p_remarks text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.appointments;
begin
  if not exists (
    select 1 from public.profiles
    where lower(email) = lower(trim(p_email))
      and password = p_password
      and role in ('admin', 'staff')
  ) then
    raise exception 'Unauthorized: invalid staff credentials.';
  end if;

  if p_date is null or p_time is null then
    raise exception 'New appointment date and time are required.';
  end if;

  if p_date <= current_date then
    raise exception 'The new appointment date must be in the future.';
  end if;

  if extract(dow from p_date) = 0 then
    raise exception 'The office is closed on Sundays. Please choose another date.';
  end if;

  if p_time < '09:00'::time or p_time > '16:00'::time then
    raise exception 'Appointments are only available from 9:00 AM to 4:00 PM.';
  end if;

  if extract(minute from p_time) not in (0, 30) or extract(second from p_time) <> 0 then
    raise exception 'Appointments must be booked in 30-minute intervals.';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.appointment_date = p_date
      and a.appointment_time = p_time
      and a.id <> p_appointment_id
      and a.status in ('Pending', 'Approved', 'Rescheduled')
  ) then
    raise exception 'That date and time is already booked. Please choose another slot.';
  end if;

  update public.appointments
  set appointment_date = p_date,
      appointment_time = p_time,
      status = 'Rescheduled',
      remarks = coalesce(p_remarks, remarks),
      updated_at = now()
  where id = p_appointment_id
  returning * into v_row;

  if not found then
    raise exception 'Appointment not found.';
  end if;

  return v_row;
end;
$$;

-- 4. GRANT PERMISSIONS TO ANON AND AUTHENTICATED ROLES
grant execute on function public.staff_get_appointments(text, text) to anon, authenticated;
grant execute on function public.staff_update_appointment_status(text, text, bigint, text, text) to anon, authenticated;
grant execute on function public.staff_reschedule_appointment(text, text, bigint, date, time, text) to anon, authenticated;

-- 5. AUTO-PROVISION SUPABASE AUTH USERS & LINK profiles.auth_user_id
do $$
declare
  v_admin_id uuid;
  v_secretary_id uuid;
begin
  -- A. Admin account
  select id into v_admin_id from auth.users where lower(email) = 'admin@notarium.com';
  if v_admin_id is null then
    v_admin_id := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud
    ) values (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@notarium.com',
      crypt('admin123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"Administrator"}',
      now(),
      now(),
      'authenticated',
      'authenticated'
    );
  end if;

  -- B. Secretary account
  select id into v_secretary_id from auth.users where lower(email) = 'secretary@notarium.com';
  if v_secretary_id is null then
    v_secretary_id := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud
    ) values (
      v_secretary_id,
      '00000000-0000-0000-0000-000000000000',
      'secretary@notarium.com',
      crypt('staff123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"Jay Ann Bayarcal"}',
      now(),
      now(),
      'authenticated',
      'authenticated'
    );
  end if;

  -- C. Link profiles.auth_user_id
  update public.profiles
  set auth_user_id = v_admin_id
  where lower(email) = 'admin@notarium.com';

  update public.profiles
  set auth_user_id = v_secretary_id
  where lower(email) = 'secretary@notarium.com';
end;
$$;

-- 6. ENABLE SUPABASE REALTIME ON APPOINTMENTS
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end;
$$;
