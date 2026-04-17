import Match from "../models/Match.js";
import Participant from "../models/Participant.js";
import Team from "../models/Team.js";
import { getAuctionIo } from "./auctionService.js";
import { simulateMatchBetweenTeams } from "../utils/simulator.js";
import { findRoomByIdOrCode } from "../utils/roomLookup.js";
import { httpError } from "../utils/httpError.js";

async function loadTeam(teamId) {
  const team = await Team.findById(teamId).populate("players");
  if (!team) {
    throw httpError(404, "Team not found");
  }
  return team;
}

function assertTeamsBelongToRoom(room, team1Id, team2Id) {
  const roomTeamIds = room.teams.map((id) => String(id));

  if (!roomTeamIds.includes(String(team1Id)) || !roomTeamIds.includes(String(team2Id))) {
    throw httpError(400, "One or more selected teams are not in this room");
  }
}

function winnerIdFromSimulation(simulation, team1, team2) {
  if (simulation.winner === "team1") return team1._id;
  if (simulation.winner === "team2") return team2._id;
  return null;
}

async function requireParticipant(room, userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) {
    throw httpError(400, "userId is required");
  }

  const participant = await Participant.findOne({ room: room._id, userId: cleanUserId });
  if (!participant) {
    throw httpError(403, "You are not a participant in this room");
  }
}

export async function simulateAndStoreMatch({ roomId, team1Id, team2Id, userId, stage = "friendly" }) {
  const room = await findRoomByIdOrCode(roomId);
  await requireParticipant(room, userId);

  if (!team1Id || !team2Id) {
    if (room.teams.length < 2) {
      throw httpError(400, "At least two teams are required");
    }
    team1Id = room.teams[0];
    team2Id = room.teams[1];
  }

  if (String(team1Id) === String(team2Id)) {
    throw httpError(400, "Select two different teams");
  }

  assertTeamsBelongToRoom(room, team1Id, team2Id);

  const [team1, team2] = await Promise.all([loadTeam(team1Id), loadTeam(team2Id)]);

  if (team1.players.length < 2 || team2.players.length < 2) {
    throw httpError(400, "Both teams need at least 2 players for simulation");
  }

  const simulation = simulateMatchBetweenTeams(team1, team2);
  const winner = winnerIdFromSimulation(simulation, team1, team2);

  const match = await Match.create({
    room: room._id,
    team1: team1._id,
    team2: team2._id,
    stage,
    status: "completed",
    scorecard: simulation,
    result: simulation.result,
    winner,
    team1Runs: simulation.innings1.runs,
    team1Wickets: simulation.innings1.wickets,
    team1Overs: simulation.innings1.overs,
    team2Runs: simulation.innings2.runs,
    team2Wickets: simulation.innings2.wickets,
    team2Overs: simulation.innings2.overs
  });

  const populatedMatch = await Match.findById(match._id).populate("team1 team2 winner");

  const io = getAuctionIo();
  if (io) {
    io.to(room.roomId).emit("match_update", {
      type: "match_completed",
      roomId: room.roomId,
      match: populatedMatch
    });
  }

  return populatedMatch;
}
