-- Leptigo v2 shared-data schema
-- Safe to run on a fresh Supabase project. RLS is the security boundary.

create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,
  display_name text not null default 'Leptigo User',
  rep integer not null default 0 check (rep >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meanings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  context text not null check (char_length(context) between 1 and 280),
  part text not null check (part in ('noun','verb','adjective','adverb','other')),
  definition text not null check (char_length(definition) between 1 and 500),
  tone text not null check (char_length(tone) between 1 and 64),
  confidence integer not null default 50 check (confidence between 0 and 100),
  is_public boolean not null default true,
  vote_count integer not null default 0 check (vote_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.meaning_votes (
  meaning_id uuid not null references public.meanings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meaning_id,user_id)
);

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day_date date not null,
  definition text not null check (char_length(definition) between 1 and 180),
  vote_count integer not null default 0 check (vote_count >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, day_date)
);

create table if not exists public.daily_votes (
  daily_entry_id uuid not null references public.daily_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (daily_entry_id,user_id)
);

create index if not exists meanings_public_created_idx on public.meanings (is_public, created_at desc);
create index if not exists meanings_votes_idx on public.meanings (vote_count desc);
create index if not exists daily_entries_day_idx on public.daily_entries (day_date, vote_count desc);
create index if not exists meaning_votes_user_idx on public.meaning_votes (user_id);
create index if not exists daily_votes_user_idx on public.daily_votes (user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
begin
  base_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name',''),
    nullif(split_part(coalesce(new.email,''),'@',1),''),
    'Leptigo User'
  );

  insert into public.profiles (id,username,display_name)
  values (
    new.id,
    'leptigo_' || substr(replace(new.id::text,'-',''),1,8),
    left(base_name,60)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.enforce_meaning_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.meanings
    where user_id = new.user_id
      and created_at > now() - interval '15 seconds'
  ) then
    raise exception 'slow down: wait a few seconds before publishing again';
  end if;

  if (
    select count(*) from public.meanings
    where user_id = new.user_id
      and created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'hourly publishing limit reached';
  end if;

  if exists (
    select 1 from public.meanings
    where user_id = new.user_id
      and lower(trim(context)) = lower(trim(new.context))
      and created_at > now() - interval '1 day'
  ) then
    raise exception 'you already used that context recently';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_meaning_limits on public.meanings;
create trigger trg_meaning_limits
before insert on public.meanings
for each row execute procedure public.enforce_meaning_limits();

create or replace function public.bump_rep_on_meaning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set rep = rep + case when new.is_public then 10 else 2 end,
      updated_at = now()
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_meaning_rep on public.meanings;
create trigger trg_meaning_rep
after insert on public.meanings
for each row execute procedure public.bump_rep_on_meaning();

create or replace function public.guard_and_add_meaning_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_id uuid;
begin
  select user_id into author_id from public.meanings where id = new.meaning_id;
  if author_id is null then raise exception 'meaning not found'; end if;
  if author_id = new.user_id then raise exception 'author cannot vote for own meaning'; end if;

  update public.meanings set vote_count = vote_count + 1 where id = new.meaning_id;
  update public.profiles set rep = rep + 1, updated_at = now() where id = new.user_id;
  update public.profiles set rep = rep + 2, updated_at = now() where id = author_id;
  return new;
end;
$$;

drop trigger if exists trg_meaning_vote_add on public.meaning_votes;
create trigger trg_meaning_vote_add
before insert on public.meaning_votes
for each row execute procedure public.guard_and_add_meaning_vote();

create or replace function public.bump_rep_on_daily()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set rep = rep + 5, updated_at = now() where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_daily_rep on public.daily_entries;
create trigger trg_daily_rep
after insert on public.daily_entries
for each row execute procedure public.bump_rep_on_daily();

create or replace function public.guard_and_add_daily_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_id uuid;
begin
  select user_id into author_id from public.daily_entries where id = new.daily_entry_id;
  if author_id is null then raise exception 'daily entry not found'; end if;
  if author_id = new.user_id then raise exception 'author cannot vote for own entry'; end if;

  update public.daily_entries set vote_count = vote_count + 1 where id = new.daily_entry_id;
  update public.profiles set rep = rep + 1, updated_at = now() where id = new.user_id;
  update public.profiles set rep = rep + 2, updated_at = now() where id = author_id;
  return new;
end;
$$;

drop trigger if exists trg_daily_vote_add on public.daily_votes;
create trigger trg_daily_vote_add
before insert on public.daily_votes
for each row execute procedure public.guard_and_add_daily_vote();

alter table public.profiles enable row level security;
alter table public.meanings enable row level security;
alter table public.meaning_votes enable row level security;
alter table public.daily_entries enable row level security;
alter table public.daily_votes enable row level security;

drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles
for select using (true);

drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists meanings_read on public.meanings;
create policy meanings_read on public.meanings
for select using (is_public or auth.uid() = user_id);

drop policy if exists meanings_insert on public.meanings;
create policy meanings_insert on public.meanings
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists meanings_delete on public.meanings;

drop policy if exists meaning_votes_read on public.meaning_votes;
create policy meaning_votes_read on public.meaning_votes
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists meaning_votes_insert on public.meaning_votes;
create policy meaning_votes_insert on public.meaning_votes
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists meaning_votes_delete on public.meaning_votes;

drop policy if exists daily_entries_read on public.daily_entries;
create policy daily_entries_read on public.daily_entries
for select using (true);

drop policy if exists daily_entries_insert on public.daily_entries;
create policy daily_entries_insert on public.daily_entries
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists daily_votes_read on public.daily_votes;
create policy daily_votes_read on public.daily_votes
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists daily_votes_insert on public.daily_votes;
create policy daily_votes_insert on public.daily_votes
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists daily_votes_delete on public.daily_votes;

-- Reset grants explicitly so rerunning this migration does not leave older, broader access behind.
revoke all on public.profiles from anon, authenticated;
revoke all on public.meanings from anon, authenticated;
revoke all on public.meaning_votes from anon, authenticated;
revoke all on public.daily_entries from anon, authenticated;
revoke all on public.daily_votes from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username,display_name) on public.profiles to authenticated;
grant select on public.meanings to anon, authenticated;
grant insert on public.meanings to authenticated;
grant select,insert on public.meaning_votes to authenticated;
grant select on public.daily_entries to anon, authenticated;
grant insert on public.daily_entries to authenticated;
grant select,insert on public.daily_votes to authenticated;

-- Hardening and scale pass.
-- Trigger functions are internal implementation details, never public RPC endpoints.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_meaning_limits() from public, anon, authenticated;
revoke execute on function public.bump_rep_on_meaning() from public, anon, authenticated;
revoke execute on function public.guard_and_add_meaning_vote() from public, anon, authenticated;
revoke execute on function public.bump_rep_on_daily() from public, anon, authenticated;
revoke execute on function public.guard_and_add_daily_vote() from public, anon, authenticated;

create index if not exists meanings_user_idx on public.meanings (user_id);

-- Cache auth.uid() once per statement rather than once per row.
drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists meanings_read on public.meanings;
create policy meanings_read on public.meanings
for select using (is_public or (select auth.uid()) = user_id);

drop policy if exists meanings_insert on public.meanings;
create policy meanings_insert on public.meanings
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists meaning_votes_read on public.meaning_votes;
create policy meaning_votes_read on public.meaning_votes
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists meaning_votes_insert on public.meaning_votes;
create policy meaning_votes_insert on public.meaning_votes
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists daily_entries_insert on public.daily_entries;
create policy daily_entries_insert on public.daily_entries
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists daily_votes_read on public.daily_votes;
create policy daily_votes_read on public.daily_votes
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists daily_votes_insert on public.daily_votes;
create policy daily_votes_insert on public.daily_votes
for insert to authenticated
with check ((select auth.uid()) = user_id);

-- Keep extensions outside the API-exposed public schema.
alter extension citext set schema extensions;
