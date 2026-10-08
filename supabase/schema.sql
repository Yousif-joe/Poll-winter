-- Seasons Poll schema — paste into Supabase Dashboard → SQL Editor → Run.

-- Options table: one row per season, pre-seeded
create table if not exists poll_options (
  id text primary key,          -- 'spring' | 'summer' | 'autumn' | 'winter'
  label text not null,
  votes integer not null default 0
);

insert into poll_options (id, label) values
  ('spring','Spring'), ('summer','Summer'),
  ('autumn','Autumn'), ('winter','Winter')
on conflict (id) do nothing;

-- Atomic increment via RPC (anon can't write directly).
-- A single UPDATE ... SET votes = votes + 1 takes a row lock, so concurrent
-- votes are serialised and never lost.
create or replace function increment_vote(option_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update poll_options set votes = votes + 1 where id = option_id;
$$;

-- Only anon/authenticated may call it (not the implicit PUBLIC grant)
revoke execute on function increment_vote(text) from public;
grant execute on function increment_vote(text) to anon, authenticated;

-- Row Level Security: public can read, but only the function can write
alter table poll_options enable row level security;

drop policy if exists "public read" on poll_options;
create policy "public read" on poll_options
  for select using (true);

-- Enable Realtime on the table
alter publication supabase_realtime add table poll_options;
