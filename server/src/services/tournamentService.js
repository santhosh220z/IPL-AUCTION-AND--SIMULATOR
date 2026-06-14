import { dbQuery, withTransaction } from "../config/db.js";
import { findRoomByIdOrCode } from "../utils/roomLookup.js";
import { httpError } from "../utils/httpError.js";
import { simulateMatchBetweenTeams } from "../utils/simulator.js";
import { getAuctionIo } from "./auctionService.js";
import {
  getParticipantByRoomAndUserId,
  getPopulatedMatches,
  getTeamWithPlayers,
  toSafeNumber
} from "./sqlData.js";

function parseOversToBalls(oversString) {
  const [oversPart, ballsPart] = String(oversString || "0.0").split(".");
  const overs = Number(oversPart || 0);
  const balls = Number(ballsPart || 0);
  return overs * 6 + balls;
}

function pointsRow(team) {
  return {
    teamId: String(team.id),
    teamName: team.name,
    owner: team.owner_name || "",
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

function getWinnerAndLoser(match) {
  if (!match.winner_team_id) return { winnerId: null, loserId: null };

  const winnerId = String(match.winner_team_id);
  const team1Id = String(match.team1_id);
  const team2Id = String(match.team2_id);
  const loserId = winnerId === team1Id ? team2Id : team1Id;

  return { winnerId, loserId };
}

function resolveTeamPlayersForSimulation(team) {
  if (team.playingElevenSubmittedAt && (team.playingEleven || []).length === 11) {
    return team.playingEleven;
  }
  return team.players;
}

async function requireRoomParticipant(room, userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) {
    throw httpError(400, "userId is required");
  }

  const participant = await getParticipantByRoomAndUserId(room.id, cleanUserId);
  if (!participant) {
    throw httpError(403, "You are not a participant in this room");
  }
}

async function getTeamsForRoom(roomId) {
  return dbQuery("select id, name, owner_name from teams where room_id = $1 order by created_at asc", [
    roomId
  ]);
}

async function getLeagueMatches(roomId) {
  return dbQuery(
    "select * from matches where room_id = $1 and stage = 'league' order by created_at asc",
    [roomId]
  );
}

export async function getRoomSchedule(roomIdOrCode, userId) {
  const room = await findRoomByIdOrCode(roomIdOrCode);
  await requireRoomParticipant(room, userId);

  const rows = await dbQuery("select * from matches where room_id = $1 order by created_at asc", [room.id]);
  return getPopulatedMatches(rows);
}

export async function buildLeagueSchedule(roomIdOrCode, userId) {
  const room = await findRoomByIdOrCode(roomIdOrCode);
  await requireRoomParticipant(room, userId);

  const existing = await getLeagueMatches(room.id);
  if (existing.length > 0) {
    return getPopulatedMatches(existing);
  }

  const teams = await getTeamsForRoom(room.id);
  if (teams.length < 2) {
    throw httpError(400, "At least two teams are needed for scheduling");
  }

  const fixtures = [];
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      fixtures.push({
        roomId: room.id,
        team1Id: teams[i].id,
        team2Id: teams[j].id,
        stage: "league",
        status: "scheduled"
      });
    }
  }

  const insertedMatchIds = await withTransaction(async (client) => {
    const ids = [];

    for (const fixture of fixtures) {
      // eslint-disable-next-line no-await-in-loop
      const inserted = await client.query(
        `
        insert into matches (room_id, team1_id, team2_id, stage, status)
        values ($1, $2, $3, $4, $5)
        returning id
        `,
        [fixture.roomId, fixture.team1Id, fixture.team2Id, fixture.stage, fixture.status]
      );

      ids.push(inserted.rows[0].id);
    }

    return ids;
  });

  const createdRows = insertedMatchIds.length
    ? await dbQuery("select * from matches where id = any($1::uuid[])", [insertedMatchIds])
    : [];

  return getPopulatedMatches(createdRows);
}

export async function simulateScheduledMatchById(matchId, userId) {
  const matchRows = await dbQuery("select * from matches where id = $1 limit 1", [matchId]);
  const match = matchRows[0] || null;

  if (!match) {
    throw httpError(404, "Match not found");
  }

  const room = await findRoomByIdOrCode(String(match.room_id));
  await requireRoomParticipant(room, userId);

  if (match.status === "completed") {
    const populated = await getPopulatedMatches([match]);
    return populated[0] || null;
  }

  const [team1, team2] = await Promise.all([
    getTeamWithPlayers(match.team1_id),
    getTeamWithPlayers(match.team2_id)
  ]);

  if (!team1 || !team2) {
    throw httpError(404, "Scheduled match teams are missing");
  }

  const simTeam1 = {
    _id: team1.id,
    name: team1.name,
    players: resolveTeamPlayersForSimulation(team1)
  };

  const simTeam2 = {
    _id: team2.id,
    name: team2.name,
    players: resolveTeamPlayersForSimulation(team2)
  };

  if (simTeam1.players.length < 2 || simTeam2.players.length < 2) {
    throw httpError(400, "Both teams need at least 2 players before simulating this match");
  }

  const simulation = simulateMatchBetweenTeams(simTeam1, simTeam2);

  let winner = null;
  if (simulation.winner === "team1") winner = team1.id;
  if (simulation.winner === "team2") winner = team2.id;

  const updatedRows = await dbQuery(
    `
    update matches
    set
      status = 'completed',
      scorecard = $2::jsonb,
      result = $3,
      winner_team_id = $4,
      team1_runs = $5,
      team1_wickets = $6,
      team1_overs = $7,
      team2_runs = $8,
      team2_wickets = $9,
      team2_overs = $10,
      updated_at = now()
    where id = $1
    returning *
    `,
    [
      match.id,
      JSON.stringify(simulation),
      simulation.result,
      winner,
      simulation.innings1.runs,
      simulation.innings1.wickets,
      simulation.innings1.overs,
      simulation.innings2.runs,
      simulation.innings2.wickets,
      simulation.innings2.overs
    ]
  );

  const updatedMatch = updatedRows[0];
  const populated = await getPopulatedMatches([updatedMatch]);
  const populatedMatch = populated[0] || null;

  const io = getAuctionIo();
  if (io) {
    io.to(room.room_id).emit("match_update", {
      type: "scheduled_match_completed",
      roomId: room.room_id,
      match: populatedMatch
    });
  }

  return populatedMatch;
}

export async function calculatePointsTable(roomIdOrCode, userId) {
  const room = await findRoomByIdOrCode(roomIdOrCode);
  await requireRoomParticipant(room, userId);

  const teams = await getTeamsForRoom(room.id);
  const teamMap = new Map(teams.map((team) => [String(team.id), pointsRow(team)]));

  const completedMatches = await dbQuery(
    `
    select *
    from matches
    where room_id = $1
      and status = 'completed'
      and stage = any($2::text[])
    order by created_at asc
    `,
    [room.id, ["league", "qualifier1", "eliminator", "qualifier2", "final"]]
  );

  for (const match of completedMatches) {
    const team1 = teamMap.get(String(match.team1_id));
    const team2 = teamMap.get(String(match.team2_id));
    if (!team1 || !team2) continue;

    team1.played += 1;
    team2.played += 1;

    team1.runsFor += toSafeNumber(match.team1_runs);
    team1.runsAgainst += toSafeNumber(match.team2_runs);
    team1.ballsFaced += parseOversToBalls(match.team1_overs);
    team1.ballsBowled += parseOversToBalls(match.team2_overs);

    team2.runsFor += toSafeNumber(match.team2_runs);
    team2.runsAgainst += toSafeNumber(match.team1_runs);
    team2.ballsFaced += parseOversToBalls(match.team2_overs);
    team2.ballsBowled += parseOversToBalls(match.team1_overs);

    if (match.winner_team_id) {
      const winnerId = String(match.winner_team_id);
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
  const table = await calculatePointsTable(room.id, userId);

  if (table.length < 4) {
    throw httpError(400, "At least 4 teams are needed for IPL-style playoffs");
  }

  const playoffStages = ["qualifier1", "eliminator", "qualifier2", "final"];
  const existing = await dbQuery(
    `
    select *
    from matches
    where room_id = $1 and stage = any($2::text[])
    order by created_at asc
    `,
    [room.id, playoffStages]
  );

  if (!existing.length) {
    const insertedMatchIds = await withTransaction(async (client) => {
      const qualifier1 = await client.query(
        `
        insert into matches (room_id, team1_id, team2_id, stage, status)
        values ($1, $2, $3, 'qualifier1', 'scheduled')
        returning id
        `,
        [room.id, table[0].teamId, table[1].teamId]
      );

      const eliminator = await client.query(
        `
        insert into matches (room_id, team1_id, team2_id, stage, status)
        values ($1, $2, $3, 'eliminator', 'scheduled')
        returning id
        `,
        [room.id, table[2].teamId, table[3].teamId]
      );

      return [qualifier1.rows[0].id, eliminator.rows[0].id];
    });

    const created = await dbQuery("select * from matches where id = any($1::uuid[])", [
      insertedMatchIds
    ]);

    return getPopulatedMatches(created);
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

    await dbQuery(
      `
      insert into matches (room_id, team1_id, team2_id, stage, status)
      values ($1, $2, $3, 'qualifier2', 'scheduled')
      `,
      [room.id, q1.loserId, elim.winnerId]
    );
  }

  const refreshedAfterQ2 = await dbQuery(
    `
    select *
    from matches
    where room_id = $1 and stage = any($2::text[])
    order by created_at asc
    `,
    [room.id, playoffStages]
  );

  const byStageAfterQ2 = new Map(refreshedAfterQ2.map((match) => [match.stage, match]));
  const qualifier1Updated = byStageAfterQ2.get("qualifier1");
  const qualifier2Updated = byStageAfterQ2.get("qualifier2");
  const finalUpdated = byStageAfterQ2.get("final");

  if (
    qualifier1Updated?.status === "completed" &&
    qualifier2Updated?.status === "completed" &&
    !finalUpdated
  ) {
    const q1Winner = getWinnerAndLoser(qualifier1Updated).winnerId;
    const q2Winner = getWinnerAndLoser(qualifier2Updated).winnerId;

    if (!q1Winner || !q2Winner) {
      throw httpError(400, "Final prerequisites are incomplete");
    }

    await dbQuery(
      `
      insert into matches (room_id, team1_id, team2_id, stage, status)
      values ($1, $2, $3, 'final', 'scheduled')
      `,
      [room.id, q1Winner, q2Winner]
    );
  }

  const refreshed = await dbQuery(
    `
    select *
    from matches
    where room_id = $1 and stage = any($2::text[])
    order by created_at asc
    `,
    [room.id, playoffStages]
  );

  const populated = await getPopulatedMatches(refreshed);

  const io = getAuctionIo();
  if (io) {
    io.to(room.room_id).emit("match_update", {
      type: "playoff_schedule_updated",
      roomId: room.room_id,
      playoffMatches: populated
    });
  }

  return populated;
}
