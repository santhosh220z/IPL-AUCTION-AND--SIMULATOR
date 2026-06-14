import { dbQuery, withTransaction } from "../config/db.js";
import { getAuctionIo, getAuctionRoomState } from "./auctionService.js";
import { simulateMatchBetweenTeams } from "../utils/simulator.js";
import { findRoomByIdOrCode } from "../utils/roomLookup.js";
import { httpError } from "../utils/httpError.js";
import { calculatePointsTable } from "./tournamentService.js";
import {
  getParticipantByRoomAndUserId,
  getPopulatedMatchById,
  getPopulatedMatches,
  getTeamWithPlayers,
  listRoomTeamsWithPlayers,
  toSafeNumber
} from "./sqlData.js";

const PLAYING_ELEVEN_SIZE = 11;

function shuffleArray(input) {
  const array = [...input];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function buildLeagueFixtures(teamIds) {
  const fixtures = [];

  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      fixtures.push({
        team1Id: teamIds[i],
        team2Id: teamIds[j]
      });
    }
  }

  return shuffleArray(fixtures);
}

function normalizeObjectId(value) {
  return String(value?.id || value?._id || value || "");
}

function resolveTeamPlayersForSimulation(team) {
  if (team.playingElevenSubmittedAt && (team.playingEleven || []).length === PLAYING_ELEVEN_SIZE) {
    return team.playingEleven;
  }
  return team.players;
}

function toSimulatorTeam(team) {
  return {
    _id: team.id,
    name: team.name,
    players: resolveTeamPlayersForSimulation(team)
  };
}

function validateLineupSelection(team, playerIds) {
  if (!Array.isArray(playerIds)) {
    throw httpError(400, "playerIds must be an array of player ids");
  }

  if ((team.players || []).length < PLAYING_ELEVEN_SIZE) {
    throw httpError(400, `${team.name} does not have ${PLAYING_ELEVEN_SIZE} players yet`);
  }

  const uniqueIds = [...new Set(playerIds.map((id) => normalizeObjectId(id)).filter(Boolean))];

  if (uniqueIds.length !== PLAYING_ELEVEN_SIZE) {
    throw httpError(400, `Select exactly ${PLAYING_ELEVEN_SIZE} unique players`);
  }

  const rosterSet = new Set((team.players || []).map((player) => normalizeObjectId(player.id)));
  const invalidPlayer = uniqueIds.find((playerId) => !rosterSet.has(playerId));

  if (invalidPlayer) {
    throw httpError(400, "One or more selected players are not part of your team");
  }

  return uniqueIds;
}

function assertAllTeamsSubmittedLineup(teams) {
  const pending = teams.find(
    (team) => !(team.playingElevenSubmittedAt && (team.playingEleven || []).length === PLAYING_ELEVEN_SIZE)
  );

  if (pending) {
    throw httpError(400, `Waiting for playing 11 submission from ${pending.name}`);
  }
}

function winnerIdFromSimulation(simulation, team1, team2) {
  if (simulation.winner === "team1") return team1.id;
  if (simulation.winner === "team2") return team2.id;
  return null;
}

async function assertTeamsBelongToRoom(room, team1Id, team2Id) {
  const rows = await dbQuery(
    `
    select count(*)::int as team_count
    from teams
    where room_id = $1 and id = any($2::uuid[])
    `,
    [room.id, [team1Id, team2Id]]
  );

  const teamCount = toSafeNumber(rows[0]?.team_count);
  if (teamCount < 2) {
    throw httpError(400, "One or more selected teams are not in this room");
  }
}

async function loadTeam(teamId) {
  const team = await getTeamWithPlayers(teamId);
  if (!team) {
    throw httpError(404, "Team not found");
  }
  return team;
}

async function requireParticipant(room, userId, options = {}) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) {
    throw httpError(400, "userId is required");
  }

  const participant = await getParticipantByRoomAndUserId(room.id, cleanUserId);
  if (!participant) {
    throw httpError(403, "You are not a participant in this room");
  }

  if (options.populateTeam) {
    return {
      ...participant,
      team: participant.team_id ? await loadTeam(participant.team_id) : null
    };
  }

  return participant;
}

function assertAuctionCompleted(room) {
  if (room.status !== "completed") {
    throw httpError(400, "Finish the auction before using match simulation");
  }
}

export async function simulateAndStoreMatch({ roomId, team1Id, team2Id, userId, stage = "friendly" }) {
  const room = await findRoomByIdOrCode(roomId);
  await requireParticipant(room, userId);

  if (!team1Id || !team2Id) {
    const teamRows = await dbQuery(
      "select id from teams where room_id = $1 order by created_at asc limit 2",
      [room.id]
    );

    if (teamRows.length < 2) {
      throw httpError(400, "At least two teams are required");
    }

    team1Id = teamRows[0].id;
    team2Id = teamRows[1].id;
  }

  if (String(team1Id) === String(team2Id)) {
    throw httpError(400, "Select two different teams");
  }

  await assertTeamsBelongToRoom(room, team1Id, team2Id);

  const [team1, team2] = await Promise.all([loadTeam(team1Id), loadTeam(team2Id)]);
  const simTeam1 = toSimulatorTeam(team1);
  const simTeam2 = toSimulatorTeam(team2);

  if (simTeam1.players.length < 2 || simTeam2.players.length < 2) {
    throw httpError(400, "Both teams need at least 2 players for simulation");
  }

  const simulation = simulateMatchBetweenTeams(simTeam1, simTeam2);
  const winner = winnerIdFromSimulation(simulation, team1, team2);

  const insertRows = await dbQuery(
    `
    insert into matches (
      room_id,
      team1_id,
      team2_id,
      stage,
      status,
      scorecard,
      result,
      winner_team_id,
      team1_runs,
      team1_wickets,
      team1_overs,
      team2_runs,
      team2_wickets,
      team2_overs
    )
    values ($1, $2, $3, $4, 'completed', $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)
    returning *
    `,
    [
      room.id,
      team1.id,
      team2.id,
      stage,
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

  const insertedMatch = insertRows[0];
  const populatedMatch = await getPopulatedMatchById(insertedMatch.id);

  const io = getAuctionIo();
  if (io) {
    io.to(room.room_id).emit("match_update", {
      type: "match_completed",
      roomId: room.room_id,
      match: populatedMatch
    });
  }

  return populatedMatch;
}

export async function submitPlayingEleven({ roomId, userId, playerIds }) {
  const room = await findRoomByIdOrCode(roomId);
  assertAuctionCompleted(room);

  const participant = await requireParticipant(room, userId, { populateTeam: true });
  if (!participant.team) {
    throw httpError(400, "No team is associated with this participant");
  }

  const selectedPlayerIds = validateLineupSelection(participant.team, playerIds);

  await withTransaction(async (client) => {
    await client.query("delete from team_playing_eleven where team_id = $1", [participant.team.id]);

    for (let index = 0; index < selectedPlayerIds.length; index += 1) {
      const playerId = selectedPlayerIds[index];
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `
        insert into team_playing_eleven (team_id, player_id, position)
        values ($1, $2, $3)
        `,
        [participant.team.id, playerId, index + 1]
      );
    }

    await client.query(
      `
      update teams
      set
        playing_eleven_submitted_at = now(),
        updated_at = now()
      where id = $1
      `,
      [participant.team.id]
    );
  });

  const lineupRows = await dbQuery(
    `
    select
      t.id,
      t.playing_eleven_submitted_at,
      count(tpe.player_id)::int as lineup_count
    from teams t
    left join team_playing_eleven tpe on tpe.team_id = t.id
    where t.room_id = $1
    group by t.id, t.playing_eleven_submitted_at
    `,
    [room.id]
  );

  const submittedCount = lineupRows.filter(
    (row) => row.playing_eleven_submitted_at && toSafeNumber(row.lineup_count) === PLAYING_ELEVEN_SIZE
  ).length;

  const totalTeams = lineupRows.length;
  const allSubmitted = totalTeams > 0 && submittedCount === totalTeams;

  const state = await getAuctionRoomState(room.room_id, userId);

  const io = getAuctionIo();
  if (io) {
    io.to(room.room_id).emit("match_update", {
      type: "lineup_submitted",
      roomId: room.room_id,
      teamId: String(participant.team.id),
      submittedCount,
      totalTeams,
      allSubmitted
    });
  }

  return {
    room: state.room,
    submittedCount,
    totalTeams,
    allSubmitted
  };
}

export async function simulateFullRoomTournament({ roomId, userId }) {
  const room = await findRoomByIdOrCode(roomId);
  assertAuctionCompleted(room);
  await requireParticipant(room, userId);

  const teams = await listRoomTeamsWithPlayers(room.id);

  if (teams.length < 2) {
    throw httpError(400, "At least two teams are required for tournament simulation");
  }

  assertAllTeamsSubmittedLineup(teams);

  await dbQuery(
    `
    delete from matches
    where room_id = $1 and stage = any($2::text[])
    `,
    [room.id, ["league", "qualifier1", "eliminator", "qualifier2", "final"]]
  );

  const teamIdList = teams.map((team) => String(team.id));
  const teamMap = new Map(teams.map((team) => [String(team.id), team]));
  const randomizedFixtures = buildLeagueFixtures(teamIdList);

  const insertedMatchIds = await withTransaction(async (client) => {
    const matchIds = [];

    for (const fixture of randomizedFixtures) {
      const team1 = teamMap.get(fixture.team1Id);
      const team2 = teamMap.get(fixture.team2Id);
      const simTeam1 = toSimulatorTeam(team1);
      const simTeam2 = toSimulatorTeam(team2);

      const simulation = simulateMatchBetweenTeams(simTeam1, simTeam2);
      const winner = winnerIdFromSimulation(simulation, team1, team2);

      // eslint-disable-next-line no-await-in-loop
      const inserted = await client.query(
        `
        insert into matches (
          room_id,
          team1_id,
          team2_id,
          stage,
          status,
          scorecard,
          result,
          winner_team_id,
          team1_runs,
          team1_wickets,
          team1_overs,
          team2_runs,
          team2_wickets,
          team2_overs
        )
        values ($1, $2, $3, 'league', 'completed', $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12)
        returning id
        `,
        [
          room.id,
          team1.id,
          team2.id,
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

      matchIds.push(inserted.rows[0].id);
    }

    return matchIds;
  });

  const insertedMatchRows = insertedMatchIds.length
    ? await dbQuery("select * from matches where id = any($1::uuid[]) order by created_at asc", [
        insertedMatchIds
      ])
    : [];

  const populatedMatches = await getPopulatedMatches(insertedMatchRows);

  const pointsTable = await calculatePointsTable(room.id, userId);
  const winnerTeam = teamMap.get(pointsTable[0]?.teamId || "") || null;

  await dbQuery(
    `
    update auction_rooms
    set
      tournament_winner_team_id = $2,
      tournament_completed_at = now(),
      updated_at = now()
    where id = $1
    `,
    [room.id, winnerTeam ? winnerTeam.id : null]
  );

  const state = await getAuctionRoomState(room.room_id, userId);

  const io = getAuctionIo();
  if (io) {
    io.to(room.room_id).emit("match_update", {
      type: "tournament_completed",
      roomId: room.room_id,
      winner: state.room.tournamentWinner,
      totalMatches: populatedMatches.length
    });
  }

  return {
    room: state.room,
    matches: populatedMatches,
    pointsTable,
    winner: state.room.tournamentWinner
  };
}
