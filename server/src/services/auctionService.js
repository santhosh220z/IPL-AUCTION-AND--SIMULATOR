import mongoose from "mongoose";
import { env } from "../config/env.js";
import AuctionRoom from "../models/AuctionRoom.js";
import Participant from "../models/Participant.js";
import Player from "../models/Player.js";
import Team from "../models/Team.js";
import { generateRoomCode } from "../utils/generateRoomCode.js";
import { httpError } from "../utils/httpError.js";

const roomLocks = new Map();
const roomTimers = new Map();

let ioInstance = null;

const defaultColor = "#D4AF37";
const hexColorRegex = /^#(?:[0-9a-fA-F]{6})$/;

function normalizeRoomId(roomId) {
  return String(roomId || "").trim().toUpperCase();
}

function normalizeColor(color) {
  const candidate = String(color || "").trim();
  return hexColorRegex.test(candidate) ? candidate.toUpperCase() : defaultColor;
}

function requireText(value, fieldName) {
  const result = String(value || "").trim();
  if (!result) {
    throw httpError(400, `${fieldName} is required`);
  }
  return result;
}

function serializePlayer(player) {
  if (!player) return null;
  return {
    id: String(player._id),
    name: player.name,
    role: player.role,
    basePrice: player.basePrice,
    battingSkill: player.battingSkill,
    bowlingSkill: player.bowlingSkill
  };
}

function serializeTeam(team) {
  const ownerId = String(team.ownerUserId || team.owner?._id || "");
  const ownerName = team.ownerName || team.owner?.username || "";
  const color = normalizeColor(team.color);

  return {
    id: String(team._id),
    name: team.name,
    budget: team.budget,
    spent: team.spent,
    color,
    owner: {
      id: ownerId,
      username: ownerName,
      color
    },
    ownerUserId: ownerId,
    ownerName,
    players: (team.players || []).map(serializePlayer)
  };
}

function serializeParticipant(participant) {
  return {
    id: String(participant._id),
    userId: participant.userId,
    userName: participant.userName,
    isHost: Boolean(participant.isHost),
    color: normalizeColor(participant.color),
    teamId: participant.team ? String(participant.team._id || participant.team) : "",
    teamName: participant.team?.name || ""
  };
}

function buildRoomPayload(room, participants = []) {
  return {
    id: String(room._id),
    roomId: room.roomId,
    status: room.status,
    creator: room.creatorUserId,
    creatorUserId: room.creatorUserId,
    creatorName: room.creatorName,
    currentPlayerIndex: room.currentPlayerIndex,
    queueSize: room.playerQueue?.length || 0,
    remainingPlayers: Math.max(
      (room.playerQueue?.length || 0) - (room.currentPlayer ? room.currentPlayerIndex + 1 : room.currentPlayerIndex),
      0
    ),
    bidEndTime: room.bidEndTime,
    currentPlayer: serializePlayer(room.currentPlayer),
    highestBid: room.highestBid,
    highestBidder: room.highestBidder
      ? {
          id: String(room.highestBidder._id || room.highestBidder),
          name: room.highestBidder.name || "",
          color: normalizeColor(room.highestBidder.color)
        }
      : null,
    teams: (room.teams || []).map(serializeTeam),
    participants: participants.map(serializeParticipant),
    soldPlayers:
      room.soldPlayers?.map((entry) => ({
        player: serializePlayer(entry.player),
        team: entry.team
          ? {
              id: String(entry.team._id || entry.team),
              name: entry.team.name || ""
            }
          : null,
        amount: entry.amount
      })) || [],
    unsoldPlayers: (room.unsoldPlayers || []).map(serializePlayer)
  };
}

async function hydrateRoomByCode(roomId) {
  return AuctionRoom.findOne({ roomId: normalizeRoomId(roomId) })
    .populate({
      path: "teams",
      populate: [{ path: "players" }]
    })
    .populate("currentPlayer")
    .populate("highestBidder", "name budget color ownerName ownerUserId")
    .populate("soldPlayers.player")
    .populate("soldPlayers.team", "name")
    .populate("unsoldPlayers");
}

async function getRoomParticipants(roomObjectId) {
  return Participant.find({ room: roomObjectId })
    .populate("team", "name color ownerUserId ownerName")
    .sort({ createdAt: 1 });
}

async function ensureRoomMembership(room, userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) {
    throw httpError(400, "userId is required");
  }

  const participant = await Participant.findOne({ room: room._id, userId: cleanUserId });
  if (!participant) {
    throw httpError(403, "User is not a participant in this room");
  }

  return participant;
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

async function markNextPlayer(room) {
  const nextIndex = room.currentPlayerIndex + 1;

  if (nextIndex >= room.playerQueue.length) {
    room.status = "completed";
    room.currentPlayer = null;
    room.highestBid = 0;
    room.highestBidder = null;
    room.bidEndTime = null;
    await room.save();
    clearBidTimer(room.roomId);

    const state = await getAuctionRoomState(room.roomId);
    emitToRoom(room.roomId, "auction_end", state.room);
    return state;
  }

  const nextPlayer = await Player.findById(room.playerQueue[nextIndex]);
  if (!nextPlayer) {
    throw httpError(500, "Auction queue is inconsistent");
  }

  room.currentPlayerIndex = nextIndex;
  room.currentPlayer = nextPlayer._id;
  room.highestBid = nextPlayer.basePrice;
  room.highestBidder = null;
  room.bidEndTime = new Date(Date.now() + env.auctionStartBidDurationMs);
  await room.save();

  clearBidTimer(room.roomId);
  const timer = setTimeout(() => {
    settleCurrentPlayer(room.roomId).catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`Failed to settle player for room ${room.roomId}`, error);
    });
  }, env.auctionStartBidDurationMs);

  roomTimers.set(room.roomId, timer);

  const state = await getAuctionRoomState(room.roomId);
  emitToRoom(room.roomId, "new_player", state.room);
  return state;
}

async function settleCurrentPlayer(roomId) {
  const normalizedRoomId = normalizeRoomId(roomId);

  return queueRoomTask(normalizedRoomId, async () => {
    const room = await AuctionRoom.findOne({ roomId: normalizedRoomId });
    if (!room || room.status !== "ongoing" || !room.currentPlayer) {
      return null;
    }

    const currentPlayer = await Player.findById(room.currentPlayer);
    if (!currentPlayer) {
      throw httpError(500, "Current player missing from database");
    }

    if (room.highestBidder) {
      const winnerTeam = await Team.findById(room.highestBidder);

      if (winnerTeam && winnerTeam.budget >= room.highestBid) {
        winnerTeam.players.push(currentPlayer._id);
        winnerTeam.budget -= room.highestBid;
        winnerTeam.spent += room.highestBid;
        await winnerTeam.save();

        room.soldPlayers.push({
          player: currentPlayer._id,
          team: winnerTeam._id,
          amount: room.highestBid
        });
      } else {
        room.unsoldPlayers.push(currentPlayer._id);
      }
    } else {
      room.unsoldPlayers.push(currentPlayer._id);
    }

    await room.save();
    return markNextPlayer(room);
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
    const existing = await AuctionRoom.findOne({ roomId: roomCode });
    if (!existing) break;
    roomCode = generateRoomCode();
  }

  const room = await AuctionRoom.create({
    roomId: roomCode,
    creatorUserId: cleanUserId,
    creatorName: cleanUserName,
    participants: [cleanUserId],
    teams: []
  });

  const team = await Team.create({
    name: cleanTeamName,
    ownerUserId: cleanUserId,
    ownerName: cleanUserName,
    color: safeColor,
    room: room._id
  });

  await Participant.create({
    room: room._id,
    userId: cleanUserId,
    userName: cleanUserName,
    team: team._id,
    isHost: true,
    color: safeColor
  });

  room.teams.push(team._id);
  await room.save();

  const state = await getAuctionRoomState(room.roomId, cleanUserId);
  return {
    room: state.room,
    teamId: String(team._id)
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
    const room = await AuctionRoom.findOne({ roomId: normalizedRoomId });
    if (!room) {
      throw httpError(404, "Auction room not found");
    }

    if (room.status !== "waiting") {
      throw httpError(400, "Room is not accepting new teams");
    }

    const existingParticipant = await Participant.findOne({ room: room._id, userId: cleanUserId }).populate("team");
    if (existingParticipant) {
      existingParticipant.userName = cleanUserName;
      existingParticipant.color = safeColor;
      await existingParticipant.save();

      const state = await getAuctionRoomState(room.roomId, cleanUserId);
      emitToRoom(room.roomId, "join_room", state.room);
      emitToRoom(room.roomId, "participants_update", state.room.participants);
      return {
        room: state.room,
        teamId: existingParticipant.team ? String(existingParticipant.team._id) : ""
      };
    }

    let activeTeam = await Team.findOne({ room: room._id, ownerUserId: cleanUserId });
    if (!activeTeam) {
      activeTeam = await Team.create({
        name: cleanTeamName,
        ownerUserId: cleanUserId,
        ownerName: cleanUserName,
        color: safeColor,
        room: room._id
      });
      room.teams.push(activeTeam._id);
    } else {
      activeTeam.name = cleanTeamName;
      activeTeam.ownerName = cleanUserName;
      activeTeam.color = safeColor;
      await activeTeam.save();
    }

    await Participant.create({
      room: room._id,
      userId: cleanUserId,
      userName: cleanUserName,
      team: activeTeam._id,
      isHost: false,
      color: safeColor
    });

    if (!room.participants.some((participant) => String(participant) === cleanUserId)) {
      room.participants.push(cleanUserId);
    }
    await room.save();

    const state = await getAuctionRoomState(room.roomId, cleanUserId);
    emitToRoom(room.roomId, "join_room", state.room);
    emitToRoom(room.roomId, "participants_update", state.room.participants);

    return {
      room: state.room,
      teamId: String(activeTeam._id)
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
    const room = await AuctionRoom.findOne({ roomId: normalizedRoomId });

    if (!room) {
      throw httpError(404, "Auction room not found");
    }

    if (String(room.creatorUserId) !== cleanUserId) {
      throw httpError(403, "Only room creator can start the auction");
    }

    if (room.status !== "waiting") {
      throw httpError(400, "Auction is already started or completed");
    }

    if (room.teams.length < 2) {
      throw httpError(400, "At least 2 teams are required to start auction");
    }

    const players = await Player.find();
    if (!players.length) {
      throw httpError(400, "No players available. Seed players first.");
    }

    const queue = shuffleArray(players);
    room.playerQueue = queue.map((player) => player._id);
    room.currentPlayerIndex = 0;
    room.currentPlayer = queue[0]._id;
    room.highestBid = queue[0].basePrice;
    room.highestBidder = null;
    room.bidEndTime = new Date(Date.now() + env.auctionStartBidDurationMs);
    room.status = "ongoing";
    await room.save();

    await scheduleBidTimer(room.roomId, env.auctionStartBidDurationMs);

    const state = await getAuctionRoomState(room.roomId);
    emitToRoom(room.roomId, "start_auction", state.room);
    emitToRoom(room.roomId, "new_player", state.room);

    return state;
  });
}

function isMemberTeam(room, teamId) {
  return room.teams.some((id) => String(id) === String(teamId));
}

export async function placeBidForRoom({ roomId, teamId, amount, userId }) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const cleanUserId = requireText(userId, "userId");

  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    throw httpError(400, "Invalid teamId");
  }

  const bidAmount = Number(amount);
  if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
    throw httpError(400, "Bid amount must be a positive number");
  }

  return queueRoomTask(normalizedRoomId, async () => {
    const room = await AuctionRoom.findOne({ roomId: normalizedRoomId }).populate("currentPlayer");
    if (!room) {
      throw httpError(404, "Auction room not found");
    }

    if (room.status !== "ongoing") {
      throw httpError(400, "Auction is not ongoing");
    }

    if (!room.currentPlayer) {
      throw httpError(400, "No active player is currently on auction");
    }

    if (!isMemberTeam(room, teamId)) {
      throw httpError(403, "Team does not belong to this room");
    }

    const team = await Team.findById(teamId);
    if (!team) {
      throw httpError(404, "Team not found");
    }

    if (String(team.room) !== String(room._id)) {
      throw httpError(403, "Team does not belong to this room");
    }

    if (String(team.ownerUserId) !== cleanUserId) {
      throw httpError(403, "You can only bid for your own team");
    }

    if (team.budget < bidAmount) {
      throw httpError(400, "Insufficient team budget");
    }

    const minIncrement = 100000;
    const minimumBid = room.highestBidder
      ? room.highestBid + minIncrement
      : room.currentPlayer.basePrice;

    if (bidAmount < minimumBid) {
      throw httpError(400, `Minimum valid bid is ${minimumBid}`);
    }

    room.highestBid = bidAmount;
    room.highestBidder = team._id;
    room.bidEndTime = new Date(Date.now() + env.auctionBidDurationMs);
    await room.save();

    await scheduleBidTimer(room.roomId, env.auctionBidDurationMs);

    const state = await getAuctionRoomState(room.roomId);
    emitToRoom(room.roomId, "place_bid", {
      roomId: room.roomId,
      teamId: String(team._id),
      teamName: team.name,
      amount: bidAmount,
      color: normalizeColor(team.color),
      bidEndTime: room.bidEndTime
    });
    emitToRoom(room.roomId, "update_bid", state.room);
    return state;
  });
}

export async function getAuctionRoomState(roomId, userId) {
  const room = await hydrateRoomByCode(roomId);
  if (!room) {
    throw httpError(404, "Auction room not found");
  }

  if (userId) {
    await ensureRoomMembership(room, userId);
  }

  const participants = await getRoomParticipants(room._id);
  return { room: buildRoomPayload(room, participants) };
}

export async function getLatestRoomForUser(userId) {
  const cleanUserId = requireText(userId, "userId");
  const participants = await Participant.find({ userId: cleanUserId })
    .populate("room")
    .populate("team")
    .sort({ updatedAt: -1 });

  const participant = participants.find((entry) => entry.room && entry.room.status !== "completed") || participants[0];

  if (!participant || !participant.room) {
    return { room: null, teamId: "" };
  }

  const state = await getAuctionRoomState(participant.room.roomId, cleanUserId);
  return {
    room: state.room,
    teamId: participant.team ? String(participant.team._id) : ""
  };
}
