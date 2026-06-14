-- Run this file in Supabase SQL Editor before starting the server.

create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  role text not null check (role in ('batsman', 'bowler', 'all-rounder', 'wicketkeeper')),
  base_price bigint not null check (base_price >= 0),
  batting_skill integer not null check (batting_skill between 1 and 100),
  bowling_skill integer not null check (bowling_skill between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auction_rooms (
  id uuid primary key default gen_random_uuid(),
  room_id text not null unique,
  creator_user_id text not null,
  creator_name text not null,
  status text not null default 'waiting' check (status in ('waiting', 'ongoing', 'completed')),
  current_player_index integer not null default 0 check (current_player_index >= 0),
  highest_bid bigint not null default 0 check (highest_bid >= 0),
  bid_end_time timestamptz,
  current_player_id uuid references players(id) on delete set null,
  highest_bidder_team_id uuid,
  tournament_winner_team_id uuid,
  tournament_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references auction_rooms(id) on delete cascade,
  name text not null,
  owner_user_id text not null,
  owner_name text not null,
  color text not null default '#D4AF37',
  budget bigint not null default 100000000 check (budget >= 0),
  spent bigint not null default 0 check (spent >= 0),
  playing_eleven_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, owner_user_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'auction_rooms_highest_bidder_team_fk'
  ) then
    alter table auction_rooms
      add constraint auction_rooms_highest_bidder_team_fk
      foreign key (highest_bidder_team_id) references teams(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'auction_rooms_tournament_winner_team_fk'
  ) then
    alter table auction_rooms
      add constraint auction_rooms_tournament_winner_team_fk
      foreign key (tournament_winner_team_id) references teams(id) on delete set null;
  end if;
end;
$$;

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references auction_rooms(id) on delete cascade,
  user_id text not null,
  user_name text not null,
  team_id uuid not null references teams(id) on delete cascade,
  is_host boolean not null default false,
  color text not null default '#D4AF37',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists room_player_queue (
  room_id uuid not null references auction_rooms(id) on delete cascade,
  queue_index integer not null check (queue_index >= 0),
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, queue_index),
  unique (room_id, player_id)
);

create table if not exists team_players (
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  acquired_amount bigint not null default 0 check (acquired_amount >= 0),
  acquired_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

create table if not exists team_playing_eleven (
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  position integer not null check (position between 1 and 11),
  created_at timestamptz not null default now(),
  primary key (team_id, player_id),
  unique (team_id, position)
);

create table if not exists sold_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references auction_rooms(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists unsold_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references auction_rooms(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (room_id, player_id)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references auction_rooms(id) on delete cascade,
  team1_id uuid not null references teams(id) on delete cascade,
  team2_id uuid not null references teams(id) on delete cascade,
  stage text not null default 'league' check (stage in ('friendly', 'league', 'qualifier1', 'eliminator', 'qualifier2', 'final')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed')),
  scorecard jsonb,
  result text not null default '',
  winner_team_id uuid references teams(id) on delete set null,
  team1_runs integer not null default 0,
  team1_wickets integer not null default 0,
  team1_overs text not null default '0.0',
  team2_runs integer not null default 0,
  team2_wickets integer not null default 0,
  team2_overs text not null default '0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_auction_rooms_creator_user_id on auction_rooms(creator_user_id);
create index if not exists idx_auction_rooms_room_id on auction_rooms(room_id);
create index if not exists idx_teams_room_id on teams(room_id);
create index if not exists idx_teams_owner_user_id on teams(owner_user_id);
create index if not exists idx_participants_room_id on participants(room_id);
create index if not exists idx_participants_user_id on participants(user_id);
create index if not exists idx_matches_room_id on matches(room_id);
create index if not exists idx_matches_stage_status on matches(stage, status);
create index if not exists idx_sold_players_room_id on sold_players(room_id);
create index if not exists idx_unsold_players_room_id on unsold_players(room_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_players_updated_at on players;
create trigger trg_players_updated_at
before update on players
for each row execute function set_updated_at();

drop trigger if exists trg_auction_rooms_updated_at on auction_rooms;
create trigger trg_auction_rooms_updated_at
before update on auction_rooms
for each row execute function set_updated_at();

drop trigger if exists trg_teams_updated_at on teams;
create trigger trg_teams_updated_at
before update on teams
for each row execute function set_updated_at();

drop trigger if exists trg_participants_updated_at on participants;
create trigger trg_participants_updated_at
before update on participants
for each row execute function set_updated_at();

drop trigger if exists trg_matches_updated_at on matches;
create trigger trg_matches_updated_at
before update on matches
for each row execute function set_updated_at();
