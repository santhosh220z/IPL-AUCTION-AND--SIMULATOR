import { env } from "../config/env.js";
import { dbQuery, withTransaction } from "../config/db.js";
import { generateRoomCode } from "../utils/generateRoomCode.js";
import { httpError } from "../utils/httpError.js";
import {
  buildRoomPayloadFromRow,
  countRoomQueue,
  getParticipantByRoomAndUserId,
  getRoomByCode,
  isUuid,
  normalizeColor,
  normalizeRoomId,
  toSafeNumber
} from "./sqlData.js";

const roomLocks = new Map();
const roomTimers = new Map();

let ioInstance = null;

function requireText(value, fieldName) {
  const result = String(value || "").trim();
  if (!result) {
    throw httpError(400, `${fieldName} is required`);
  }
  return result;
}

function clearBidTimer(roomId) {
  const timer = roomTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    roomTimers.delete(roomId);
  }
}

function queueRoomTask(roomId, handler) {
  const previousTask = roomLocks.get(roomId) || Promise.resolve();
  const currentTask = previousTask
    .catch(() => null)
    .then(handler)
    .finally(() => {
      if (roomLocks.get(roomId) === currentTask) {
        roomLocks.delete(roomId);
      }
    });

  roomLocks.set(roomId, currentTask);
  return currentTask;
}

function emitToRoom(roomId, event, payload) {
  if (!ioInstance) return;
  ioInstance.to(roomId).emit(event, payload);
}

async function ensureRoomMembership(room, userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) {
    throw httpError(400, "userId is required");
  }

  const participant = await getParticipantByRoomAndUserId(room.id, cleanUserId);
  if (!participant) {
    throw httpError(403, "User is not a participant in this room");
  }

  return participant;
}

async function getCurrentQueuePlayer(roomId, queueIndex) {
  const rows = await dbQuery(
    `
    select rpq.player_id, pl.*
    from room_player_queue rpq
    join players pl on pl.id = rpq.player_id
    where rpq.room_id = $1 and rpq.queue_index = $2
    limit 1
    `,
    [roomId, queueIndex]
  );

  return rows[0] || null;
}

async function clearTeamLineups(roomId) {
  await withTransaction(async (client) => {
    await client.query(
      `
      delete from team_playing_eleven
      where team_id in (select id from teams where room_id = $1)
      `,
      [roomId]
    );

    await client.query(
      `
      update teams
      set playing_eleven_submitted_at = null,
          updated_at = now()
      where room_id = $1
      `,
      [roomId]
    );
  });
}

async function markNextPlayer(room) {
  const nextIndex = toSafeNumber(room.current_player_index) + 1;
  const queueSize = await countRoomQueue(room.id);

  if (nextIndex >= queueSize) {
    await clearTeamLineups(room.id);

    await dbQuery(
      `
      update auction_rooms
      set
        status = 'completed',
        current_player_id = null,
        highest_bid = 0,
        highest_bidder_team_id = null,
        bid_end_time = null,
        tournament_winner_team_id = null,
        tournament_completed_at = null,
        updated_at = now()
      where id = $1
      `,
      [room.id]
    );

    clearBidTimer(room.room_id);

    const state = await getAuctionRoomState(room.room_id);
    emitToRoom(room.room_id, "auction_end", state.room);
    return state;
  }

  const nextPlayer = await getCurrentQueuePlayer(room.id, nextIndex);
  if (!nextPlayer) {
    throw httpError(500, "Auction queue is inconsistent");
  }

  const bidEndTime = new Date(Date.now() + env.auctionStartBidDurationMs).toISOString();

  await dbQuery(
    `
    update auction_rooms
    set
      current_player_index = $2,
      current_player_id = $3,
      highest_bid = $4,
      highest_bidder_team_id = null,
      bid_end_time = $5,
      updated_at = now()
    where id = $1
    `,
    [room.id, nextIndex, nextPlayer.player_id, toSafeNumber(nextPlayer.base_price), bidEndTime]
  );

  clearBidTimer(room.room_id);
  const timer = setTimeout(() => {
    settleCurrentPlayer(room.room_id).catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`Failed to settle player for room ${room.room_id}`, error);
    });
  }, env.auctionStartBidDurationMs);

  roomTimers.set(room.room_id, timer);

  const state = await getAuctionRoomState(room.room_id);
  emitToRoom(room.room_id, "new_player", state.room);
  return state;
}

async function settleCurrentPlayer(roomId) {
  const normalizedRoomId = normalizeRoomId(roomId);

  return queueRoomTask(normalizedRoomId, async () => {
    const room = await getRoomByCode(normalizedRoomId);
    if (!room || room.status !== "ongoing" || !room.current_player_id) {
      return null;
    }

    const currentPlayerRows = await dbQuery("select id from players where id = $1 limit 1", [
      room.current_player_id
    ]);
    const currentPlayer = currentPlayerRows[0];

    if (!currentPlayer) {
      throw httpError(500, "Current player missing from database");
    }

    if (room.highest_bidder_team_id) {
      const winnerTeamRows = await dbQuery("select * from teams where id = $1 limit 1", [
        room.highest_bidder_team_id
      ]);
      const winnerTeam = winnerTeamRows[0] || null;

      if (winnerTeam && toSafeNumber(winnerTeam.budget) >= toSafeNumber(room.highest_bid)) {
        await withTransaction(async (client) => {
          await client.query(
            `
            insert into team_players (team_id, player_id, acquired_amount)
            values ($1, $2, $3)
            on conflict (team_id, player_id) do nothing
            `,
            [winnerTeam.id, currentPlayer.id, toSafeNumber(room.highest_bid)]
          );

          await client.query(
            `
            update teams
            set
              budget = budget - $1,
              spent = spent + $1,
              updated_at = now()
            where id = $2
            `,
            [toSafeNumber(room.highest_bid), winnerTeam.id]
          );

          await client.query(
            `
            insert into sold_players (room_id, player_id, team_id, amount)
            values ($1, $2, $3, $4)
            `,
            [room.id, currentPlayer.id, winnerTeam.id, toSafeNumber(room.highest_bid)]
          );
        });
      } else {
        await dbQuery(
          `
          insert into unsold_players (room_id, player_id)
          values ($1, $2)
          on conflict do nothing
          `,
          [room.id, currentPlayer.id]
        );
      }
    } else {
      await dbQuery(
        `
        insert into unsold_players (room_id, player_id)
        values ($1, $2)
        on conflict do nothing
        `,
        [room.id, currentPlayer.id]
      );
    }

    const refreshed = await getRoomByCode(normalizedRoomId);
    return markNextPlayer(refreshed);
  });
}

async function scheduleBidTimer(roomId, durationMs) {
  clearBidTimer(roomId);
  const timer = setTimeout(() => {
    settleCurrentPlayer(roomId).catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`Failed to auto-settle bid timeout for room ${roomId}`, error);
    });
  }, durationMs);

  roomTimers.set(roomId, timer);
}

async function roomCodeExists(roomCode) {
  const room = await getRoomByCode(roomCode);
  return Boolean(room);
}

export function setAuctionIo(io) {
  ioInstance = io;
}

export function getAuctionIo() {
  return ioInstance;
}

export async function createAuctionRoom({ userId, userName, teamName, teamColor }) {
  const cleanUserId = requireText(userId, "userId");
  const cleanUserName = requireText(userName, "userName");
  const cleanTeamName = requireText(teamName, "teamName");
  const safeColor = normalizeColor(teamColor);

  let roomCode = generateRoomCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await roomCodeExists(roomCode);
    if (!exists) break;
    roomCode = generateRoomCode();
  }

  const result = await withTransaction(async (client) => {
    const roomInsert = await client.query(
      `
      insert into auction_rooms (
        room_id,
        creator_user_id,
        creator_name,
        status,
        current_player_index,
        highest_bid
      )
      values ($1, $2, $3, 'waiting', 0, 0)
      returning *
      `,
      [roomCode, cleanUserId, cleanUserName]
    );

    const room = roomInsert.rows[0];

    const teamInsert = await client.query(
      `
      insert into teams (
        room_id,
        name,
        owner_user_id,
        owner_name,
        color,
        budget,
        spent
      )
      values ($1, $2, $3, $4, $5, 100000000, 0)
      returning *
      `,
      [room.id, cleanTeamName, cleanUserId, cleanUserName, safeColor]
    );

    const team = teamInsert.rows[0];

    await client.query(
      `
      insert into participants (
        room_id,
        user_id,
        user_name,
        team_id,
        is_host,
        color
      )
      values ($1, $2, $3, $4, true, $5)
      `,
      [room.id, cleanUserId, cleanUserName, team.id, safeColor]
    );

    return {
      room,
      teamId: String(team.id)
    };
  });

  const state = await getAuctionRoomState(result.room.room_id, cleanUserId);

  return {
    room: state.room,
    teamId: result.teamId
  };
}

export async function joinAuctionRoom({ roomId, userId, userName, teamName, teamColor }) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const cleanUserId = requireText(userId, "userId");
  const cleanUserName = requireText(userName, "userName");
  const cleanTeamName = requireText(teamName, "teamName");
  const safeColor = normalizeColor(teamColor);

  if (!normalizedRoomId) {
    throw httpError(400, "roomId is required");
  }

  return queueRoomTask(normalizedRoomId, async () => {
    const room = await getRoomByCode(normalizedRoomId);
    if (!room) {
      throw httpError(404, "Auction room not found");
    }

    if (room.status !== "waiting") {
      throw httpError(400, "Room is not accepting new teams");
    }

    const existingParticipantRows = await dbQuery(
      `
      select *
      from participants
      where room_id = $1 and user_id = $2
      limit 1
      `,
      [room.id, cleanUserId]
    );

    const existingParticipant = existingParticipantRows[0] || null;

    if (existingParticipant) {
      await dbQuery(
        `
        update participants
        set
          user_name = $2,
          color = $3,
          updated_at = now()
        where id = $1
        `,
        [existingParticipant.id, cleanUserName, safeColor]
      );

      const state = await getAuctionRoomState(room.room_id, cleanUserId);
      emitToRoom(room.room_id, "join_room", state.room);
      emitToRoom(room.room_id, "participants_update", state.room.participants);

      return {
        room: state.room,
        teamId: existingParticipant.team_id ? String(existingParticipant.team_id) : ""
      };
    }

    const activeTeamRows = await dbQuery(
      `
      select *
      from teams
      where room_id = $1 and owner_user_id = $2
      limit 1
      `,
      [room.id, cleanUserId]
    );

    let activeTeam = activeTeamRows[0] || null;

    if (!activeTeam) {
      const insertRows = await dbQuery(
        `
        insert into teams (
          room_id,
          name,
          owner_user_id,
          owner_name,
          color,
          budget,
          spent
        )
        values ($1, $2, $3, $4, $5, 100000000, 0)
        returning *
        `,
        [room.id, cleanTeamName, cleanUserId, cleanUserName, safeColor]
      );

      activeTeam = insertRows[0];
    } else {
      const updateRows = await dbQuery(
        `
        update teams
        set
          name = $2,
          owner_name = $3,
          color = $4,
          updated_at = now()
        where id = $1
        returning *
        `,
        [activeTeam.id, cleanTeamName, cleanUserName, safeColor]
      );

      activeTeam = updateRows[0];
    }

    await dbQuery(
      `
      insert into participants (
        room_id,
        user_id,
        user_name,
        team_id,
        is_host,
        color
      )
      values ($1, $2, $3, $4, false, $5)
      `,
      [room.id, cleanUserId, cleanUserName, activeTeam.id, safeColor]
    );

    const state = await getAuctionRoomState(room.room_id, cleanUserId);
    emitToRoom(room.room_id, "join_room", state.room);
    emitToRoom(room.room_id, "participants_update", state.room.participants);

    return {
      room: state.room,
      teamId: String(activeTeam.id)
    };
  });
}

function shuffleArray(input) {
  const array = [...input];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export async function startAuctionForRoom({ roomId, userId }) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const cleanUserId = requireText(userId, "userId");

  return queueRoomTask(normalizedRoomId, async () => {
    const room = await getRoomByCode(normalizedRoomId);

    if (!room) {
      throw httpError(404, "Auction room not found");
    }

    if (String(room.creator_user_id) !== cleanUserId) {
      throw httpError(403, "Only room creator can start the auction");
    }

    if (room.status !== "waiting") {
      throw httpError(400, "Auction is already started or completed");
    }

    const teamCountRows = await dbQuery(
      "select count(*)::int as team_count from teams where room_id = $1",
      [room.id]
    );
    const teamCount = toSafeNumber(teamCountRows[0]?.team_count);

    if (teamCount < 2) {
      throw httpError(400, "At least 2 teams are required to start auction");
    }

    const players = await dbQuery("select * from players order by name asc");
    if (!players.length) {
      throw httpError(400, "No players available. Seed players first.");
    }

    const queue = shuffleArray(players);

    await clearTeamLineups(room.id);

    await withTransaction(async (client) => {
      await client.query("delete from room_player_queue where room_id = $1", [room.id]);

      for (let index = 0; index < queue.length; index += 1) {
        const player = queue[index];
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `
          insert into room_player_queue (room_id, queue_index, player_id)
          values ($1, $2, $3)
          `,
          [room.id, index, player.id]
        );
      }

      await client.query(
        `
        update auction_rooms
        set
          current_player_index = 0,
          current_player_id = $2,
          highest_bid = $3,
          highest_bidder_team_id = null,
          bid_end_time = $4,
          status = 'ongoing',
          tournament_winner_team_id = null,
          tournament_completed_at = null,
          updated_at = now()
        where id = $1
        `,
        [
          room.id,
          queue[0].id,
          toSafeNumber(queue[0].base_price),
          new Date(Date.now() + env.auctionStartBidDurationMs).toISOString()
        ]
      );
    });

    await scheduleBidTimer(room.room_id, env.auctionStartBidDurationMs);

    const state = await getAuctionRoomState(room.room_id);
    emitToRoom(room.room_id, "start_auction", state.room);
    emitToRoom(room.room_id, "new_player", state.room);

    return state;
  });
}

export async function placeBidForRoom({ roomId, teamId, amount, userId }) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const cleanUserId = requireText(userId, "userId");

  if (!isUuid(teamId)) {
    throw httpError(400, "Invalid teamId");
  }

  const bidAmount = Number(amount);
  if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
    throw httpError(400, "Bid amount must be a positive number");
  }

  return queueRoomTask(normalizedRoomId, async () => {
    const room = await getRoomByCode(normalizedRoomId);
    if (!room) {
      throw httpError(404, "Auction room not found");
    }

    if (room.status !== "ongoing") {
      throw httpError(400, "Auction is not ongoing");
    }

    if (!room.current_player_id) {
      throw httpError(400, "No active player is currently on auction");
    }

    const teamRows = await dbQuery("select * from teams where id = $1 limit 1", [teamId]);
    const team = teamRows[0] || null;

    if (!team) {
      throw httpError(404, "Team not found");
    }

    if (String(team.room_id) !== String(room.id)) {
      throw httpError(403, "Team does not belong to this room");
    }

    if (String(team.owner_user_id) !== cleanUserId) {
      throw httpError(403, "You can only bid for your own team");
    }

    if (toSafeNumber(team.budget) < bidAmount) {
      throw httpError(400, "Insufficient team budget");
    }

    const currentPlayerRows = await dbQuery("select base_price from players where id = $1 limit 1", [
      room.current_player_id
    ]);
    const currentPlayer = currentPlayerRows[0] || null;

    if (!currentPlayer) {
      throw httpError(400, "Current player is unavailable");
    }

    const minIncrement = 100000;
    const minimumBid = room.highest_bidder_team_id
      ? toSafeNumber(room.highest_bid) + minIncrement
      : toSafeNumber(currentPlayer.base_price);

    if (bidAmount < minimumBid) {
      throw httpError(400, `Minimum valid bid is ${minimumBid}`);
    }

    const nextBidEnd = new Date(Date.now() + env.auctionBidDurationMs).toISOString();

    await dbQuery(
      `
      update auction_rooms
      set
        highest_bid = $2,
        highest_bidder_team_id = $3,
        bid_end_time = $4,
        updated_at = now()
      where id = $1
      `,
      [room.id, bidAmount, team.id, nextBidEnd]
    );

    await scheduleBidTimer(room.room_id, env.auctionBidDurationMs);

    const state = await getAuctionRoomState(room.room_id);
    emitToRoom(room.room_id, "place_bid", {
      roomId: room.room_id,
      teamId: String(team.id),
      teamName: team.name,
      amount: bidAmount,
      color: normalizeColor(team.color),
      bidEndTime: nextBidEnd
    });
    emitToRoom(room.room_id, "update_bid", state.room);

    return state;
  });
}

export async function getAuctionRoomState(roomId, userId) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const room = await getRoomByCode(normalizedRoomId);

  if (!room) {
    throw httpError(404, "Auction room not found");
  }

  if (userId) {
    await ensureRoomMembership(room, userId);
  }

  const payload = await buildRoomPayloadFromRow(room);
  return { room: payload };
}

export async function getLatestRoomForUser(userId) {
  const cleanUserId = requireText(userId, "userId");

  const participantRows = await dbQuery(
    `
    select
      p.team_id,
      r.room_id,
      r.status,
      p.updated_at
    from participants p
    join auction_rooms r on r.id = p.room_id
    where p.user_id = $1
    order by p.updated_at desc
    `,
    [cleanUserId]
  );

  const participant =
    participantRows.find((entry) => entry.status && entry.status !== "completed") ||
    participantRows[0] ||
    null;

  if (!participant) {
    return { room: null, teamId: "" };
  }

  const state = await getAuctionRoomState(participant.room_id, cleanUserId);
  return {
    room: state.room,
    teamId: participant.team_id ? String(participant.team_id) : ""
  };
}
