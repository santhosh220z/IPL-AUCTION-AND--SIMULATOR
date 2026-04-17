import Match from "../models/Match.js";
import Participant from "../models/Participant.js";
import Team from "../models/Team.js";
import { findRoomByIdOrCode } from "../utils/roomLookup.js";
import { httpError } from "../utils/httpError.js";
import { simulateMatchBetweenTeams } from "../utils/simulator.js";
import { getAuctionIo } from "./auctionService.js";

function parseOversToBalls(oversString) {
  const [oversPart, ballsPart] = String(oversString || "0.0").split(".");
  const overs = Number(oversPart || 0);
  const balls = Number(ballsPart || 0);
  return overs * 6 + balls;
}

function pointsRow(team) {
  return {
    teamId: String(team._id),
    teamName: team.name,
    owner: team.ownerName || "",
    played: 0,
    won: 0,
    lost: 0,
    tied: 0,
    points: 0,
    runsFor: 0,
    runsAgainst: 0,
    ballsFaced: 0,
    ballsBowled: 0,
    nrr: 0
  };
}

function computeNrr(row) {
  const runRateFor = row.ballsFaced ? (row.runsFor * 6) / row.ballsFaced : 0;
  const runRateAgainst = row.ballsBowled ? (row.runsAgainst * 6) / row.ballsBowled : 0;
  return Number((runRateFor - runRateAgainst).toFixed(3));
}

async function populateTeams(teamIds) {
  return Team.find({ _id: { $in: teamIds } });
}

async function requireRoomParticipant(room, userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) {
    throw httpError(400, "userId is required");
  }

  const participant = await Participant.findOne({ room: room._id, userId: cleanUserId });
  if (!participant) {
    throw httpError(403, "You are not a participant in this room");
  }
}

function getWinnerAndLoser(match) {
  if (!match.winner) return { winnerId: null, loserId: null };
  const winnerId = String(match.winner);
  const team1Id = String(match.team1);
  const team2Id = String(match.team2);
  const loserId = winnerId === team1Id ? team2Id : team1Id;
  return { winnerId, loserId };
}

export async function buildLeagueSchedule(roomIdOrCode, userId) {
  const room = await findRoomByIdOrCode(roomIdOrCode);
  await requireRoomParticipant(room, userId);
  const existing = await Match.find({ room: room._id, stage: "league" }).populate("team1 team2");

  if (existing.length > 0) {
    return existing;
  }

  const teamIds = room.teams.map((id) => String(id));
  if (teamIds.length < 2) {
    throw httpError(400, "At least two teams are needed for scheduling");
  }

  const fixtures = [];
  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      fixtures.push({
        room: room._id,
        team1: teamIds[i],
        team2: teamIds[j],
        stage: "league",
        status: "scheduled"
      });
    }
  }

  const created = await Match.insertMany(fixtures);
  return Match.find({ _id: { $in: created.map((match) => match._id) } }).populate("team1 team2");
}

export async function simulateScheduledMatchById(matchId, userId) {
  const match = await Match.findById(matchId).populate([
    { path: "team1", populate: { path: "players" } },
    { path: "team2", populate: { path: "players" } }
  ]);

  if (!match) {
    throw httpError(404, "Match not found");
  }

  const room = await findRoomByIdOrCode(String(match.room));
  await requireRoomParticipant(room, userId);

  if (match.status === "completed") {
    return match;
  }

  if (match.team1.players.length < 2 || match.team2.players.length < 2) {
    throw httpError(400, "Both teams need at least 2 players before simulating this match");
  }

  const simulation = simulateMatchBetweenTeams(match.team1, match.team2);

  let winner = null;
  if (simulation.winner === "team1") winner = match.team1._id;
  if (simulation.winner === "team2") winner = match.team2._id;

  match.status = "completed";
  match.scorecard = simulation;
  match.result = simulation.result;
  match.winner = winner;
  match.team1Runs = simulation.innings1.runs;
  match.team1Wickets = simulation.innings1.wickets;
  match.team1Overs = simulation.innings1.overs;
  match.team2Runs = simulation.innings2.runs;
  match.team2Wickets = simulation.innings2.wickets;
  match.team2Overs = simulation.innings2.overs;
  await match.save();

  const io = getAuctionIo();
  if (io) {
    io.to(room.roomId).emit("match_update", {
      type: "scheduled_match_completed",
      roomId: room.roomId,
      match
    });
  }

  return match;
}

export async function calculatePointsTable(roomIdOrCode, userId) {
  const room = await findRoomByIdOrCode(roomIdOrCode);
  await requireRoomParticipant(room, userId);
  const teams = await populateTeams(room.teams);
  const teamMap = new Map(teams.map((team) => [String(team._id), pointsRow(team)]));

  const completedMatches = await Match.find({
    room: room._id,
    status: "completed",
    stage: { $in: ["league", "qualifier1", "eliminator", "qualifier2", "final"] }
  });

  for (const match of completedMatches) {
    const team1 = teamMap.get(String(match.team1));
    const team2 = teamMap.get(String(match.team2));
    if (!team1 || !team2) continue;

    team1.played += 1;
    team2.played += 1;

    team1.runsFor += match.team1Runs;
    team1.runsAgainst += match.team2Runs;
    team1.ballsFaced += parseOversToBalls(match.team1Overs);
    team1.ballsBowled += parseOversToBalls(match.team2Overs);

    team2.runsFor += match.team2Runs;
    team2.runsAgainst += match.team1Runs;
    team2.ballsFaced += parseOversToBalls(match.team2Overs);
    team2.ballsBowled += parseOversToBalls(match.team1Overs);

    if (match.winner) {
      const winnerId = String(match.winner);
      if (winnerId === team1.teamId) {
        team1.won += 1;
        team2.lost += 1;
        team1.points += 2;
      } else {
        team2.won += 1;
        team1.lost += 1;
        team2.points += 2;
      }
    } else {
      team1.tied += 1;
      team2.tied += 1;
      team1.points += 1;
      team2.points += 1;
    }
  }

  const table = Array.from(teamMap.values()).map((row) => ({ ...row, nrr: computeNrr(row) }));

  table.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.nrr !== a.nrr) return b.nrr - a.nrr;
    return b.won - a.won;
  });

  return table;
}

export async function buildPlayoffs(roomIdOrCode, userId) {
  const room = await findRoomByIdOrCode(roomIdOrCode);
  await requireRoomParticipant(room, userId);
  const table = await calculatePointsTable(room._id, userId);

  if (table.length < 4) {
    throw httpError(400, "At least 4 teams are needed for IPL-style playoffs");
  }

  const playoffStages = ["qualifier1", "eliminator", "qualifier2", "final"];
  const existing = await Match.find({
    room: room._id,
    stage: { $in: playoffStages }
  }).sort({ createdAt: 1 });

  if (!existing.length) {
    const created = await Match.insertMany([
      {
        room: room._id,
        team1: table[0].teamId,
        team2: table[1].teamId,
        stage: "qualifier1",
        status: "scheduled"
      },
      {
        room: room._id,
        team1: table[2].teamId,
        team2: table[3].teamId,
        stage: "eliminator",
        status: "scheduled"
      }
    ]);

    return Match.find({ _id: { $in: created.map((match) => match._id) } }).populate("team1 team2 winner");
  }

  const byStage = new Map(existing.map((match) => [match.stage, match]));
  const qualifier1 = byStage.get("qualifier1");
  const eliminator = byStage.get("eliminator");
  const qualifier2 = byStage.get("qualifier2");
  const final = byStage.get("final");

  if (qualifier1?.status === "completed" && eliminator?.status === "completed" && !qualifier2) {
    const q1 = getWinnerAndLoser(qualifier1);
    const elim = getWinnerAndLoser(eliminator);

    if (!q1.loserId || !elim.winnerId) {
      throw httpError(400, "Playoff prerequisites are incomplete");
    }

    await Match.create({
      room: room._id,
      team1: q1.loserId,
      team2: elim.winnerId,
      stage: "qualifier2",
      status: "scheduled"
    });
  }

  if (qualifier1?.status === "completed" && qualifier2?.status === "completed" && !final) {
    const q1Winner = getWinnerAndLoser(qualifier1).winnerId;
    const q2Winner = getWinnerAndLoser(qualifier2).winnerId;

    if (!q1Winner || !q2Winner) {
      throw httpError(400, "Final prerequisites are incomplete");
    }

    await Match.create({
      room: room._id,
      team1: q1Winner,
      team2: q2Winner,
      stage: "final",
      status: "scheduled"
    });
  }

  const refreshed = await Match.find({
    room: room._id,
    stage: { $in: playoffStages }
  })
    .populate("team1 team2 winner")
    .sort({ createdAt: 1 });

  const io = getAuctionIo();
  if (io) {
    io.to(room.roomId).emit("match_update", {
      type: "playoff_schedule_updated",
      roomId: room.roomId,
      playoffMatches: refreshed
    });
  }

  return refreshed;
}
