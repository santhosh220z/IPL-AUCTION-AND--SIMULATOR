import { dbQuery } from "../config/db.js";

const defaultColor = "#D4AF37";
const hexColorRegex = /^#(?:[0-9a-fA-F]{6})$/;
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return uuidRegex.test(String(value || "").trim());
}

export function normalizeRoomId(roomId) {
  return String(roomId || "").trim().toUpperCase();
}

export function normalizeColor(color) {
  const candidate = String(color || "").trim();
  return hexColorRegex.test(candidate) ? candidate.toUpperCase() : defaultColor;
}

export function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mapPlayerRow(player) {
  if (!player) return null;

  return {
    id: String(player.id),
    _id: String(player.id),
    name: player.name,
    role: player.role,
    basePrice: toSafeNumber(player.base_price),
    battingSkill: toSafeNumber(player.batting_skill),
    bowlingSkill: toSafeNumber(player.bowling_skill)
  };
}

function mapParticipantRow(row) {
  return {
    id: String(row.id),
    userId: row.user_id,
    userName: row.user_name,
    isHost: Boolean(row.is_host),
    color: normalizeColor(row.color),
    teamId: row.team_id ? String(row.team_id) : "",
    teamName: row.team_name || ""
  };
}

function mapTeamMinimal(row) {
  if (!row) return null;

  return {
    id: String(row.id),
    name: row.name,
    color: normalizeColor(row.color),
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name || ""
  };
}

function mapTeamForPayload(team, players = [], playingEleven = []) {
  const playingElevenPlayerIds = playingEleven.map((player) => player.id);

  return {
    id: String(team.id),
    name: team.name,
    budget: toSafeNumber(team.budget),
    spent: toSafeNumber(team.spent),
    color: normalizeColor(team.color),
    owner: {
      id: String(team.owner_user_id || ""),
      username: team.owner_name || "",
      color: normalizeColor(team.color)
    },
    ownerUserId: String(team.owner_user_id || ""),
    ownerName: team.owner_name || "",
    players,
    playingEleven,
    playingElevenPlayerIds,
    playingElevenSubmitted:
      Boolean(team.playing_eleven_submitted_at) && playingElevenPlayerIds.length === 11,
    playingElevenSubmittedAt: team.playing_eleven_submitted_at
  };
}

export async function getRoomByCode(roomId) {
  const rows = await dbQuery("select * from auction_rooms where room_id = $1 limit 1", [
    normalizeRoomId(roomId)
  ]);
  return rows[0] || null;
}

export async function getRoomById(roomId) {
  const rows = await dbQuery("select * from auction_rooms where id = $1 limit 1", [roomId]);
  return rows[0] || null;
}

export async function getRoomByIdOrCode(roomIdOrCode) {
  const raw = String(roomIdOrCode || "").trim();
  if (!raw) return null;

  if (isUuid(raw)) {
    const byId = await getRoomById(raw);
    if (byId) {
      return byId;
    }
  }

  return getRoomByCode(raw);
}

export async function listRoomTeams(roomId) {
  return dbQuery("select * from teams where room_id = $1 order by created_at asc", [roomId]);
}

export async function listRoomParticipants(roomId) {
  const rows = await dbQuery(
    `
    select
      p.id,
      p.user_id,
      p.user_name,
      p.is_host,
      p.color,
      p.team_id,
      t.name as team_name
    from participants p
    left join teams t on t.id = p.team_id
    where p.room_id = $1
    order by p.created_at asc
    `,
    [roomId]
  );

  return rows.map(mapParticipantRow);
}

export async function listTeamPlayers(teamIds) {
  if (!Array.isArray(teamIds) || !teamIds.length) {
    return new Map();
  }

  const rows = await dbQuery(
    `
    select tp.team_id, pl.*
    from team_players tp
    join players pl on pl.id = tp.player_id
    where tp.team_id = any($1::uuid[])
    order by tp.team_id asc, tp.acquired_at asc, pl.name asc
    `,
    [teamIds]
  );

  const byTeam = new Map(teamIds.map((id) => [String(id), []]));
  for (const row of rows) {
    const key = String(row.team_id);
    if (!byTeam.has(key)) {
      byTeam.set(key, []);
    }
    byTeam.get(key).push(mapPlayerRow(row));
  }

  return byTeam;
}

export async function listTeamPlayingElevens(teamIds) {
  if (!Array.isArray(teamIds) || !teamIds.length) {
    return new Map();
  }

  const rows = await dbQuery(
    `
    select tpe.team_id, tpe.position, pl.*
    from team_playing_eleven tpe
    join players pl on pl.id = tpe.player_id
    where tpe.team_id = any($1::uuid[])
    order by tpe.team_id asc, tpe.position asc
    `,
    [teamIds]
  );

  const byTeam = new Map(teamIds.map((id) => [String(id), []]));
  for (const row of rows) {
    const key = String(row.team_id);
    if (!byTeam.has(key)) {
      byTeam.set(key, []);
    }
    byTeam.get(key).push(mapPlayerRow(row));
  }

  return byTeam;
}

export async function listRoomTeamsWithPlayers(roomId) {
  const teams = await listRoomTeams(roomId);
  const teamIds = teams.map((team) => String(team.id));

  const [playersByTeam, playingElevensByTeam] = await Promise.all([
    listTeamPlayers(teamIds),
    listTeamPlayingElevens(teamIds)
  ]);

  return teams.map((team) =>
    mapTeamForPayload(
      team,
      playersByTeam.get(String(team.id)) || [],
      playingElevensByTeam.get(String(team.id)) || []
    )
  );
}

export async function getTeamById(teamId) {
  const rows = await dbQuery("select * from teams where id = $1 limit 1", [teamId]);
  return rows[0] || null;
}

export async function getTeamWithPlayers(teamId) {
  const team = await getTeamById(teamId);
  if (!team) return null;

  const [playersByTeam, playingElevensByTeam] = await Promise.all([
    listTeamPlayers([team.id]),
    listTeamPlayingElevens([team.id])
  ]);

  const players = playersByTeam.get(String(team.id)) || [];
  const playingEleven = playingElevensByTeam.get(String(team.id)) || [];

  return {
    id: String(team.id),
    _id: String(team.id),
    roomId: String(team.room_id),
    name: team.name,
    ownerUserId: String(team.owner_user_id),
    ownerName: team.owner_name || "",
    color: normalizeColor(team.color),
    budget: toSafeNumber(team.budget),
    spent: toSafeNumber(team.spent),
    playingElevenSubmittedAt: team.playing_eleven_submitted_at,
    players,
    playingEleven
  };
}

export async function countRoomQueue(roomId) {
  const rows = await dbQuery(
    "select count(*)::int as queue_size from room_player_queue where room_id = $1",
    [roomId]
  );
  return toSafeNumber(rows[0]?.queue_size, 0);
}

async function getRoomCurrentPlayer(roomRow) {
  if (!roomRow?.current_player_id) {
    return null;
  }

  const rows = await dbQuery("select * from players where id = $1 limit 1", [roomRow.current_player_id]);
  return mapPlayerRow(rows[0] || null);
}

async function getRoomHighestBidder(roomRow, teamRows) {
  if (!roomRow?.highest_bidder_team_id) {
    return null;
  }

  const fromRoomTeams = teamRows.find(
    (team) => String(team.id) === String(roomRow.highest_bidder_team_id)
  );

  if (fromRoomTeams) {
    return {
      id: String(fromRoomTeams.id),
      name: fromRoomTeams.name,
      color: normalizeColor(fromRoomTeams.color)
    };
  }

  const rows = await dbQuery("select id, name, color from teams where id = $1 limit 1", [
    roomRow.highest_bidder_team_id
  ]);

  const team = rows[0];
  if (!team) return null;

  return {
    id: String(team.id),
    name: team.name,
    color: normalizeColor(team.color)
  };
}

async function getRoomTournamentWinner(roomRow, teamRows) {
  if (!roomRow?.tournament_winner_team_id) {
    return null;
  }

  const fromRoomTeams = teamRows.find(
    (team) => String(team.id) === String(roomRow.tournament_winner_team_id)
  );

  if (fromRoomTeams) {
    return {
      id: String(fromRoomTeams.id),
      name: fromRoomTeams.name,
      color: normalizeColor(fromRoomTeams.color)
    };
  }

  const rows = await dbQuery("select id, name, color from teams where id = $1 limit 1", [
    roomRow.tournament_winner_team_id
  ]);

  const team = rows[0];
  if (!team) return null;

  return {
    id: String(team.id),
    name: team.name,
    color: normalizeColor(team.color)
  };
}

async function getRoomSoldPlayers(roomId) {
  const rows = await dbQuery(
    `
    select
      sp.amount,
      t.id as team_id,
      t.name as team_name,
      pl.*
    from sold_players sp
    join players pl on pl.id = sp.player_id
    left join teams t on t.id = sp.team_id
    where sp.room_id = $1
    order by sp.created_at asc
    `,
    [roomId]
  );

  return rows.map((row) => ({
    player: mapPlayerRow(row),
    team: row.team_id
      ? {
          id: String(row.team_id),
          name: row.team_name || ""
        }
      : null,
    amount: toSafeNumber(row.amount)
  }));
}

async function getRoomUnsoldPlayers(roomId) {
  const rows = await dbQuery(
    `
    select pl.*
    from unsold_players up
    join players pl on pl.id = up.player_id
    where up.room_id = $1
    order by up.created_at asc
    `,
    [roomId]
  );

  return rows.map(mapPlayerRow);
}

export async function buildRoomPayloadFromRow(roomRow) {
  const [teamRows, participants, queueSize, soldPlayers, unsoldPlayers] = await Promise.all([
    listRoomTeams(roomRow.id),
    listRoomParticipants(roomRow.id),
    countRoomQueue(roomRow.id),
    getRoomSoldPlayers(roomRow.id),
    getRoomUnsoldPlayers(roomRow.id)
  ]);

  const teamIds = teamRows.map((team) => String(team.id));
  const [playersByTeam, playingElevensByTeam, currentPlayer, highestBidder, tournamentWinner] =
    await Promise.all([
      listTeamPlayers(teamIds),
      listTeamPlayingElevens(teamIds),
      getRoomCurrentPlayer(roomRow),
      getRoomHighestBidder(roomRow, teamRows),
      getRoomTournamentWinner(roomRow, teamRows)
    ]);

  const teams = teamRows.map((team) =>
    mapTeamForPayload(
      team,
      playersByTeam.get(String(team.id)) || [],
      playingElevensByTeam.get(String(team.id)) || []
    )
  );

  const currentPlayerIndex = toSafeNumber(roomRow.current_player_index);

  return {
    id: String(roomRow.id),
    roomId: roomRow.room_id,
    status: roomRow.status,
    creator: roomRow.creator_user_id,
    creatorUserId: roomRow.creator_user_id,
    creatorName: roomRow.creator_name,
    currentPlayerIndex,
    queueSize,
    remainingPlayers: Math.max(
      queueSize - (roomRow.current_player_id ? currentPlayerIndex + 1 : currentPlayerIndex),
      0
    ),
    bidEndTime: roomRow.bid_end_time,
    currentPlayer,
    highestBid: toSafeNumber(roomRow.highest_bid),
    highestBidder,
    tournamentWinner,
    tournamentCompletedAt: roomRow.tournament_completed_at,
    teams,
    participants,
    soldPlayers,
    unsoldPlayers
  };
}

export async function getRoomPayloadByCode(roomId) {
  const room = await getRoomByCode(roomId);
  if (!room) {
    return null;
  }

  return buildRoomPayloadFromRow(room);
}

export async function getParticipantByRoomAndUserId(roomId, userId) {
  const rows = await dbQuery(
    "select * from participants where room_id = $1 and user_id = $2 limit 1",
    [roomId, userId]
  );

  return rows[0] || null;
}

export async function getPopulatedMatches(matchRows) {
  if (!Array.isArray(matchRows) || !matchRows.length) {
    return [];
  }

  const teamIds = new Set();
  for (const match of matchRows) {
    if (match.team1_id) teamIds.add(String(match.team1_id));
    if (match.team2_id) teamIds.add(String(match.team2_id));
    if (match.winner_team_id) teamIds.add(String(match.winner_team_id));
  }

  const teamRows = teamIds.size
    ? await dbQuery("select id, name, color, owner_user_id, owner_name from teams where id = any($1::uuid[])", [
        Array.from(teamIds)
      ])
    : [];

  const teamMap = new Map(teamRows.map((team) => [String(team.id), mapTeamMinimal(team)]));

  return matchRows.map((match) => ({
    _id: String(match.id),
    id: String(match.id),
    room: String(match.room_id),
    team1: teamMap.get(String(match.team1_id)) || null,
    team2: teamMap.get(String(match.team2_id)) || null,
    stage: match.stage,
    status: match.status,
    scorecard: match.scorecard,
    result: match.result || "",
    winner: match.winner_team_id ? teamMap.get(String(match.winner_team_id)) || null : null,
    team1Runs: toSafeNumber(match.team1_runs),
    team1Wickets: toSafeNumber(match.team1_wickets),
    team1Overs: match.team1_overs || "0.0",
    team2Runs: toSafeNumber(match.team2_runs),
    team2Wickets: toSafeNumber(match.team2_wickets),
    team2Overs: match.team2_overs || "0.0",
    createdAt: match.created_at,
    updatedAt: match.updated_at
  }));
}

export async function getPopulatedMatchById(matchId) {
  const rows = await dbQuery("select * from matches where id = $1 limit 1", [matchId]);
  if (!rows.length) {
    return null;
  }

  const populated = await getPopulatedMatches(rows);
  return populated[0] || null;
}

export async function getRoomScheduleMatches(roomId) {
  const rows = await dbQuery("select * from matches where room_id = $1 order by created_at asc", [roomId]);
  return getPopulatedMatches(rows);
}
