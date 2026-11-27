-- Secret Santa: tables.
-- Row-level security is switched on here; the rules themselves are in the next file.

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_path text check (char_length(avatar_path) <= 200),
  google_avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  budget text check (char_length(budget) <= 80),
  exchange_date date,
  note text check (char_length(note) <= 500),
  drawn_at timestamptz,
  pairs_changed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.parties enable row level security;
create index parties_owner_id_idx on public.parties (owner_id);

-- Invite codes live outside the API schema; they are reached only through functions.
create table private.party_invites (
  party_id uuid primary key references public.parties (id) on delete cascade,
  code text not null unique default replace(gen_random_uuid()::text, '-', '')
);
alter table private.party_invites enable row level security;

create table public.party_members (
  party_id uuid not null references public.parties (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  in_draw boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);
alter table public.party_members enable row level security;
create index party_members_user_id_idx on public.party_members (user_id);

-- "Keep apart" pairs. Stored once, smaller id first.
create table public.exclusions (
  party_id uuid not null,
  user_a uuid not null,
  user_b uuid not null,
  primary key (party_id, user_a, user_b),
  check (user_a < user_b),
  foreign key (party_id, user_a) references public.party_members (party_id, user_id) on delete cascade,
  foreign key (party_id, user_b) references public.party_members (party_id, user_id) on delete cascade
);
alter table public.exclusions enable row level security;
create index exclusions_user_b_idx on public.exclusions (party_id, user_b);

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  url text check (url is null or (url ~* '^https?://' and char_length(url) <= 2000)),
  price text check (char_length(price) <= 40),
  note text check (char_length(note) <= 500),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.wishes enable row level security;
create index wishes_user_id_idx on public.wishes (user_id, position);

-- Who took part in the current draw.
create table public.draw_participants (
  party_id uuid not null,
  user_id uuid not null,
  primary key (party_id, user_id),
  foreign key (party_id, user_id) references public.party_members (party_id, user_id) on delete cascade
);
alter table public.draw_participants enable row level security;

-- The matches. Removing a member removes the rows where they give or receive.
create table public.assignments (
  party_id uuid not null,
  giver_id uuid not null,
  receiver_id uuid not null,
  primary key (party_id, giver_id),
  unique (party_id, receiver_id),
  check (giver_id <> receiver_id),
  foreign key (party_id, giver_id) references public.party_members (party_id, user_id) on delete cascade,
  foreign key (party_id, receiver_id) references public.party_members (party_id, user_id) on delete cascade
);
alter table public.assignments enable row level security;
create index assignments_giver_id_idx on public.assignments (giver_id);
