# IPL Auction and Cricket Simulator Web App

Full-stack multiplayer IPL-style auction platform with real-time bidding and a cricket match simulator.

## What This App Includes

- Anonymous multiplayer identity using local `user_id` (UUID)
- Auction room creation and join by room code
- Host/join entry with user name, team name, and team color
- Real-time bidding with Socket.IO
- Bid timer reset on valid new bid
- Team budget tracking and automatic player assignment
- Session auto-rejoin after refresh using participant records
- Match simulation with ball-by-ball probability logic
- League schedule generation
- Points table with net run rate calculation
- IPL-style playoff progression (Qualifier 1, Eliminator, Qualifier 2, Final)

## Tech Stack

- Frontend: React, Tailwind CSS, Zustand, Axios, React Router
- Backend: Node.js, Express, Socket.IO, pg
- Database: Supabase Postgres
- Identity: Anonymous UUID + room participant records

## Project Structure

```text
.
├── client
│   ├── src
│   │   ├── api
│   │   ├── components
│   │   ├── context
│   │   ├── pages
│   │   └── store
│   ├── .env.example
│   └── package.json
├── server
│   ├── src
│   │   ├── config
│   │   ├── controllers
│   │   ├── middleware
│   │   ├── routes
│   │   ├── seed
│   │   ├── services
│   │   ├── socket
│   │   └── utils
│   ├── supabase
│   ├── .env.example
│   └── package.json
└── package.json
```

## Prerequisites

- Node.js 18+
- Supabase project with Postgres enabled

## Environment Setup

### Server

1. Copy `server/.env.example` to `server/.env`
2. Update values if needed

Server variables:

- `PORT` default `5000`
- `SUPABASE_DB_URL` Postgres connection string from Supabase
- `SUPABASE_DB_SSL` use SSL when connecting to Supabase DB (`true` default)
- `DB_RETRY_DELAY_MS` retry delay between failed DB attempts (default `5000`)
- `DB_MAX_RETRIES` retries before failure (default `6` in dev, `0` infinite in production)
- `CLIENT_ORIGIN` default `http://localhost:5173`
- `AUCTION_BID_DURATION_MS` bid reset timer (default 15000)
- `AUCTION_START_BID_DURATION_MS` first-bid timer (default 20000)

### Client

1. Copy `client/.env.example` to `client/.env`
2. Confirm `VITE_API_URL` points to backend

## Run Locally

1. Install dependencies

```bash
npm install
```

2. Apply Supabase schema

Run `server/supabase/schema.sql` in Supabase SQL editor.

3. Seed sample IPL players

```bash
npm run seed
```

4. Start client and server together

```bash
npm run dev
```

5. Open apps

- Client: http://localhost:5173
- Server health: http://localhost:5000/health

## Core API Endpoints

### Auction

- `POST /auction/create-room`
- `POST /auction/join-room`
- `POST /auction/start`
- `POST /auction/place-bid`
- `GET /auction/room/:roomId`
- `GET /auction/rejoin?userId=UUID`

### Players

- `GET /players`

### Match Simulator

- `POST /match/simulate`
- `POST /match/playing-eleven`
- `POST /match/simulate-room`

### Tournament

- `POST /tournament/schedule`
- `GET /tournament/schedule/:roomId`
- `POST /tournament/simulate/:matchId`
- `POST /tournament/playoffs/:roomId`
- `GET /tournament/points-table?roomId=ROOM_CODE`

## Real-Time Socket Events

Client emits:

- `join_room`
- `start_auction`
- `place_bid`

Server emits:

- `join_room`
- `participants_update`
- `start_auction`
- `new_player`
- `place_bid`
- `update_bid`
- `auction_end`
- `match_update`
- `error_message`

## Auction Engine Notes

- Each room has a serialized lock queue for safe concurrent bidding.
- Team ownership is tied to anonymous `userId` identity.
- Team budget is checked before accepting a bid.
- Bid timer resets on every accepted bid.
- On timer expiry, current player is assigned to highest bidder or marked unsold.

## Anonymous Identity Flow

- On first visit, frontend generates `user_id` UUID and stores it in localStorage.
- Host/join forms collect `userName`, `teamName`, and `teamColor`.
- Backend stores participants with unique `(room, userId)` constraint.
- On app load, frontend calls `/auction/rejoin` to restore the previous room and team.

## Match Simulation Logic

- Ball outcomes: `0, 1, 2, 3, 4, 6, W`
- Outcome probabilities are weighted by batsman and bowler skill difference.
- Match produces:
  - ball-by-ball commentary
  - batter and bowler scorecards
  - innings totals and final result

## Tournament Logic

- League schedule uses round-robin fixtures.
- Points:
  - Win = 2
  - Tie = 1 each
  - Loss = 0
- Net run rate is calculated from aggregate runs and balls.
- Playoffs progress through:
  - Qualifier 1
  - Eliminator
  - Qualifier 2
  - Final

## Scripts

Root:

- `npm run dev` run client + server together
- `npm run seed` seed player data
- `npm run build` build client

Server workspace:

- `npm --workspace server run dev`
- `npm --workspace server run seed`

Client workspace:

- `npm --workspace client run dev`
- `npm --workspace client run build`
