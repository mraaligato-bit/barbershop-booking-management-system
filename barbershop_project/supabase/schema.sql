-- BARBERSHOP BOOKING MANAGEMENT SYSTEM
-- Supabase / PostgreSQL schema
--
-- SETUP: Supabase -> SQL Editor -> New query -> paste this entire file -> Run.
-- CUSTOMIZE: Change the sample services near the bottom to match the real shop menu.
-- TIMEZONE: Booking dates and default shop hours use Asia/Manila.
-- SECURITY: Do not disable RLS and do not place the service_role key in frontend files.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default 'New customer',
  phone text,
  role text not null default 'customer' check (role in ('customer','barber','admin','owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 360),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  display_name text not null,
  bio text not null default '',
  specialties text[] not null default '{}',
  commission_rate numeric(5,2) not null default 0 check (commission_rate between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.barber_availability (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  iso_weekday smallint not null check (iso_weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  break_start time,
  break_end time,
  is_available boolean not null default true,
  unique (barber_id, iso_weekday),
  check (start_time < end_time),
  check ((break_start is null and break_end is null) or (break_start is not null and break_end is not null and start_time <= break_start and break_start < break_end and break_end <= end_time))
);

create table if not exists public.pay_settings (
  barber_id uuid primary key references public.barbers(id) on delete cascade,
  pay_type text not null default 'commission' check (pay_type in ('fixed','commission','both')),
  base_monthly_salary numeric(12,2) not null default 0 check (base_monthly_salary >= 0),
  commission_rate numeric(5,2) not null default 0 check (commission_rate between 0 and 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_at_booking numeric(10,2) not null check (price_at_booking >= 0),
  status text not null default 'confirmed' check (status in ('confirmed','checked_in','in_service','completed','cancelled','no_show')),
  notes text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- Database-level protection: active appointments cannot overlap for the same barber.
-- This catches near-simultaneous bookings even if two customers choose the same slot.
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (
    barber_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('confirmed','checked_in','in_service'));

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 5 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default (now() at time zone 'Asia/Manila')::date,
  category text not null,
  description text,
  amount numeric(12,2) not null check (amount > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists appointments_customer_starts_idx on public.appointments(customer_id, starts_at desc);
create index if not exists appointments_barber_starts_idx on public.appointments(barber_id, starts_at desc);
create index if not exists appointments_status_starts_idx on public.appointments(status, starts_at);
create index if not exists reviews_status_created_idx on public.reviews(status, created_at desc);
create index if not exists expenses_date_idx on public.expenses(expense_date desc);

-- User profile creation is handled by Supabase Auth. Public sign-up always creates a customer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(lower(new.email), ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'New customer'),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    'customer'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.can_view_customer_profile(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.appointments a
    join public.barbers b on b.id = a.barber_id
    where a.customer_id = p_customer_id
      and b.user_id = auth.uid()
      and a.status not in ('cancelled')
  )
$$;

-- Every newly assigned barber starts with Tue-Sun, 9 AM-6 PM and a 1-2 PM break.
-- CUSTOMIZE: Change these defaults if the real shop has different hours.
create or replace function public.seed_barber_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.pay_settings (barber_id, pay_type, base_monthly_salary, commission_rate)
  values (new.id, 'commission', 0, new.commission_rate)
  on conflict (barber_id) do nothing;

  insert into public.barber_availability (barber_id, iso_weekday, start_time, end_time, break_start, break_end)
  select new.id, day_no, time '09:00', time '18:00', time '13:00', time '14:00'
  from generate_series(2, 7) as days(day_no)
  on conflict (barber_id, iso_weekday) do nothing;
  return new;
end;
$$;

drop trigger if exists on_barber_created_defaults on public.barbers;
create trigger on_barber_created_defaults
after insert on public.barbers
for each row execute procedure public.seed_barber_defaults();

-- Used by the booking form to calculate available 15-minute start intervals.
-- This function reads existing appointments without exposing another customer's records.
create or replace function public.get_available_slots(p_service_id uuid, p_barber_id uuid, p_date date)
returns table(slot_start timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration integer;
  v_weekday integer;
begin
  if auth.uid() is null then raise exception 'Sign in to check appointment availability.'; end if;
  select s.duration_minutes into v_duration from public.services s where s.id = p_service_id and s.is_active = true;
  if v_duration is null then raise exception 'This service is not available.'; end if;
  if not exists (select 1 from public.barbers b where b.id = p_barber_id and b.is_active = true) then
    raise exception 'This barber is not currently taking appointments.';
  end if;
  if p_date < (now() at time zone 'Asia/Manila')::date then raise exception 'Choose today or a future date.'; end if;
  v_weekday := extract(isodow from p_date)::integer;

  return query
  select candidate.slot_start
  from public.barber_availability a
  cross join lateral generate_series(
    ((p_date + a.start_time) at time zone 'Asia/Manila'),
    (((p_date + a.end_time) at time zone 'Asia/Manila') - make_interval(mins => v_duration)),
    interval '15 minutes'
  ) as candidate(slot_start)
  where a.barber_id = p_barber_id
    and a.iso_weekday = v_weekday
    and a.is_available = true
    and candidate.slot_start >= now()
    and (
      a.break_start is null
      or not (
        candidate.slot_start < ((p_date + a.break_end) at time zone 'Asia/Manila')
        and candidate.slot_start + make_interval(mins => v_duration) > ((p_date + a.break_start) at time zone 'Asia/Manila')
      )
    )
    and not exists (
      select 1 from public.appointments existing
      where existing.barber_id = p_barber_id
        and existing.status in ('confirmed','checked_in','in_service')
        and candidate.slot_start < existing.ends_at
        and candidate.slot_start + make_interval(mins => v_duration) > existing.starts_at
    )
  order by candidate.slot_start;
end;
$$;

-- All customer bookings pass through this function so the price/duration cannot be changed in DevTools.
create or replace function public.book_appointment(p_service_id uuid, p_barber_id uuid, p_start timestamptz, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_duration integer;
  v_price numeric(10,2);
  v_id uuid;
  v_date date;
begin
  if auth.uid() is null then raise exception 'Sign in before booking.'; end if;
  v_role := public.current_user_role();
  if v_role <> 'customer' then raise exception 'Only customer accounts can make customer bookings.'; end if;
  if p_notes is not null and char_length(p_notes) > 300 then raise exception 'The note must be 300 characters or fewer.'; end if;
  select s.duration_minutes, s.price into v_duration, v_price
  from public.services s where s.id = p_service_id and s.is_active = true;
  if v_duration is null then raise exception 'This service is no longer available.'; end if;
  v_date := (p_start at time zone 'Asia/Manila')::date;
  if not exists (
    select 1 from public.get_available_slots(p_service_id, p_barber_id, v_date) slots
    where slots.slot_start = p_start
  ) then raise exception 'That time is no longer available. Choose another time.'; end if;

  insert into public.appointments (customer_id, service_id, barber_id, starts_at, ends_at, price_at_booking, status, notes)
  values (auth.uid(), p_service_id, p_barber_id, p_start, p_start + make_interval(mins => v_duration), v_price, 'confirmed', nullif(trim(p_notes), ''))
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'That time was just booked by someone else. Choose another available time.';
end;
$$;

create or replace function public.cancel_my_booking(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.current_user_role() <> 'customer' then raise exception 'Only customers can cancel their own bookings.'; end if;
  update public.appointments
  set status = 'cancelled', updated_at = now()
  where id = p_appointment_id
    and customer_id = auth.uid()
    and status = 'confirmed'
    and starts_at >= now() + interval '24 hours';
  if not found then raise exception 'This booking cannot be cancelled from your account. Cancellations require a confirmed booking at least 24 hours away.'; end if;
end;
$$;

create or replace function public.set_appointment_status(p_appointment_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_current text;
  v_barber_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_status not in ('confirmed','checked_in','in_service','completed','cancelled','no_show') then raise exception 'Invalid appointment status.'; end if;
  v_role := public.current_user_role();
  select a.status, a.barber_id into v_current, v_barber_id from public.appointments a where a.id = p_appointment_id;
  if v_current is null then raise exception 'Appointment not found.'; end if;
  if v_role in ('admin','owner') then
    update public.appointments set status = p_status, updated_at = now() where id = p_appointment_id;
    return;
  end if;
  if v_role <> 'barber' or not exists (select 1 from public.barbers b where b.id = v_barber_id and b.user_id = auth.uid()) then
    raise exception 'You are not allowed to update this appointment.';
  end if;
  if not (
    (v_current = 'confirmed' and p_status in ('checked_in','no_show')) or
    (v_current = 'checked_in' and p_status in ('in_service','no_show')) or
    (v_current = 'in_service' and p_status in ('completed','no_show'))
  ) then raise exception 'That status change is not allowed for a barber account.'; end if;
  update public.appointments set status = p_status, updated_at = now() where id = p_appointment_id;
end;
$$;

create or replace function public.owner_set_staff_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  if auth.uid() is null or public.current_user_role() <> 'owner' then raise exception 'Only the owner can assign account roles.'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own owner role from this screen.'; end if;
  if p_role not in ('customer','barber','admin','owner') then raise exception 'Invalid role.'; end if;
  update public.profiles set role = p_role, updated_at = now() where id = p_user_id returning full_name into v_name;
  if not found then raise exception 'Account not found.'; end if;
  if p_role = 'barber' then
    insert into public.barbers (user_id, display_name, is_active)
    values (p_user_id, coalesce(nullif(trim(v_name), ''), 'Barber'), true)
    on conflict (user_id) do update set is_active = true, updated_at = now();
  elsif p_role <> 'barber' then
    update public.barbers set is_active = false, updated_at = now() where user_id = p_user_id;
  end if;
end;
$$;

-- Enable row-level security on every table reachable from the browser.
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.barbers enable row level security;
alter table public.barber_availability enable row level security;
alter table public.pay_settings enable row level security;
alter table public.appointments enable row level security;
alter table public.reviews enable row level security;
alter table public.expenses enable row level security;

-- Profiles: customers can read/update their own editable columns; staff see only what their role needs.
drop policy if exists profiles_read_own_or_authorized on public.profiles;
create policy profiles_read_own_or_authorized on public.profiles for select to authenticated
using (id = auth.uid() or public.current_user_role() in ('admin','owner') or public.can_view_customer_profile(id));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using (id = auth.uid() or public.current_user_role() = 'owner')
with check (id = auth.uid() or public.current_user_role() = 'owner');

-- Public service menu and active barber cards are safe to read without signing in.
drop policy if exists services_public_read on public.services;
create policy services_public_read on public.services for select to anon, authenticated using (is_active = true);
drop policy if exists services_owner_all on public.services;
create policy services_owner_all on public.services for all to authenticated
using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');

drop policy if exists barbers_public_read on public.barbers;
create policy barbers_public_read on public.barbers for select to anon, authenticated using (is_active = true);
drop policy if exists barbers_staff_read_own on public.barbers;
create policy barbers_staff_read_own on public.barbers for select to authenticated using (user_id = auth.uid());
drop policy if exists barbers_owner_all on public.barbers;
create policy barbers_owner_all on public.barbers for all to authenticated
using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');

-- Only admins/owners maintain working hours from the first version. Customers use get_available_slots().
drop policy if exists availability_staff_read on public.barber_availability;
create policy availability_staff_read on public.barber_availability for select to authenticated
using (public.current_user_role() in ('admin','owner') or exists (select 1 from public.barbers b where b.id = barber_id and b.user_id = auth.uid()));
drop policy if exists availability_admin_owner_manage on public.barber_availability;
create policy availability_admin_owner_manage on public.barber_availability for all to authenticated
using (public.current_user_role() in ('admin','owner')) with check (public.current_user_role() in ('admin','owner'));

-- Pay information: a barber can see their own settings; owner can see and edit every barber's settings.
drop policy if exists pay_settings_read_own_or_owner on public.pay_settings;
create policy pay_settings_read_own_or_owner on public.pay_settings for select to authenticated
using (public.current_user_role() = 'owner' or exists (select 1 from public.barbers b where b.id = barber_id and b.user_id = auth.uid()));
drop policy if exists pay_settings_owner_manage on public.pay_settings;
create policy pay_settings_owner_manage on public.pay_settings for all to authenticated
using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');

-- Bookings: customer sees their own; assigned barber sees their jobs; Admin/Owner see all.
drop policy if exists appointments_role_read on public.appointments;
create policy appointments_role_read on public.appointments for select to authenticated
using (
  customer_id = auth.uid()
  or public.current_user_role() in ('admin','owner')
  or exists (select 1 from public.barbers b where b.id = barber_id and b.user_id = auth.uid())
);
-- No direct INSERT/UPDATE policy is provided: writes must use the validated RPC functions above.

-- Reviews: public can see approved reviews only; authors see their own; Admin/Owner moderate.
drop policy if exists reviews_public_or_authorized_read on public.reviews;
create policy reviews_public_or_authorized_read on public.reviews for select to anon, authenticated
using (status = 'approved' or customer_id = auth.uid() or public.current_user_role() in ('admin','owner'));
drop policy if exists reviews_customer_insert_completed on public.reviews;
create policy reviews_customer_insert_completed on public.reviews for insert to authenticated
with check (
  customer_id = auth.uid()
  and public.current_user_role() = 'customer'
  and status = 'pending'
  and moderated_by is null
  and moderated_at is null
  and exists (select 1 from public.appointments a where a.id = appointment_id and a.customer_id = auth.uid() and a.status = 'completed')
);
drop policy if exists reviews_admin_owner_update on public.reviews;
create policy reviews_admin_owner_update on public.reviews for update to authenticated
using (public.current_user_role() in ('admin','owner')) with check (public.current_user_role() in ('admin','owner'));
drop policy if exists reviews_admin_owner_delete on public.reviews;
create policy reviews_admin_owner_delete on public.reviews for delete to authenticated using (public.current_user_role() in ('admin','owner'));

-- Expense records are private to the Owner.
drop policy if exists expenses_owner_all on public.expenses;
create policy expenses_owner_all on public.expenses for all to authenticated
using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner' and created_by = auth.uid());

-- Least-privilege grants. Table privileges and RLS are both required for browser security.
-- Revoke default table grants first, then add only the permissions used by the website.
revoke all on public.profiles from anon, authenticated;
revoke all on public.services, public.barbers, public.reviews from anon, authenticated;
revoke all on public.barber_availability, public.pay_settings, public.appointments, public.expenses from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, updated_at) on public.profiles to authenticated;

grant select on public.services to anon, authenticated;
grant select (id, rating, body, status, created_at) on public.reviews to anon;
grant select, insert, delete on public.reviews to authenticated;
grant update (status, moderated_by, moderated_at) on public.reviews to authenticated;
-- Keep staff account UUIDs and compensation settings out of anonymous table queries.
grant select (id, display_name, bio, specialties, is_active) on public.barbers to anon;
grant select (id, user_id, display_name, bio, specialties, is_active, created_at, updated_at) on public.barbers to authenticated;
grant insert, update, delete on public.services to authenticated;
grant insert, update, delete on public.barbers to authenticated;
grant select, insert, update, delete on public.barber_availability to authenticated;
grant select, insert, update, delete on public.pay_settings to authenticated;
grant select on public.appointments to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;

grant execute on function public.current_user_role() to anon, authenticated;
grant execute on function public.can_view_customer_profile(uuid) to authenticated;
grant execute on function public.get_available_slots(uuid, uuid, date) to authenticated;
grant execute on function public.book_appointment(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_my_booking(uuid) to authenticated;
grant execute on function public.set_appointment_status(uuid, text) to authenticated;
grant execute on function public.owner_set_staff_role(uuid, text) to authenticated;

-- Sample service menu for setup. Replace names, prices, and times with the shop's real offerings.
insert into public.services (name, description, price, duration_minutes, sort_order, is_active)
values
  ('Classic Haircut', 'A clean, tailored haircut finished with a quick style.', 250, 30, 1, true),
  ('Skin Fade', 'A precise fade with clean lines and a balanced finish.', 350, 45, 2, true),
  ('Beard Trim', 'Shape, tidy, and define your beard with care.', 180, 20, 3, true),
  ('Haircut + Beard', 'A complete refresh for your hair and beard.', 400, 60, 4, true),
  ('Kids Haircut', 'A comfortable, tidy cut for younger customers.', 200, 30, 5, true),
  ('Classic Shave', 'A careful traditional shave and finishing touch.', 220, 30, 6, true)
on conflict (name) do nothing;

comment on table public.profiles is 'Profile for a Supabase Auth user. Public sign-ups are always assigned customer role.';
comment on table public.appointments is 'Appointment data. Booking writes are restricted to validated RPC functions.';
comment on function public.book_appointment(uuid, uuid, timestamptz, text) is 'Creates a booking using database-owned service duration and price, checks availability, and relies on an exclusion constraint to prevent overlaps.';
