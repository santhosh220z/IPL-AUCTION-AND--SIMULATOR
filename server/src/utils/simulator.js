import { pickWeightedOutcome } from "./weightedRandom.js";

function getEntityId(entity) {
  return String(entity?._id || entity?.id || "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatOversFromBalls(balls) {
  const overs = Math.floor(balls / 6);
  const remainderBalls = balls % 6;
  return `${overs}.${remainderBalls}`;
}

function roleBattingBoost(role) {
  if (role === "wicketkeeper") return 4;
  if (role === "all-rounder") return 6;
  return 0;
}

function roleBowlingBoost(role) {
  if (role === "all-rounder") return 6;
  if (role === "bowler") return 8;
  return 0;
}

function battingSortScore(player) {
  return player.battingSkill + roleBattingBoost(player.role);
}

function bowlingSortScore(player) {
  return player.bowlingSkill + roleBowlingBoost(player.role);
}

function buildOutcomeWeights(battingSkill, bowlingSkill) {
  const balance = (battingSkill - bowlingSkill) / 100;

  return {
    "0": clamp(22 - balance * 6, 8, 38),
    "1": clamp(31 + balance * 1.5, 15, 44),
    "2": clamp(9 + balance * 2, 2, 16),
    "3": 1.5,
    "4": clamp(16 + balance * 8, 4, 30),
    "6": clamp(8 + balance * 7, 1, 20),
    W: clamp(12 - balance * 10, 2, 24)
  };
}

function initializeBatterStats(players) {
  const stats = new Map();
  for (const player of players) {
    const playerId = getEntityId(player);
    if (!playerId) {
      throw new Error("Missing player id in batting lineup");
    }

    stats.set(playerId, {
      playerId,
      name: player.name,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false
    });
  }
  return stats;
}

function initializeBowlerStats(players) {
  const stats = new Map();
  for (const player of players) {
    const playerId = getEntityId(player);
    if (!playerId) {
      throw new Error("Missing player id in bowling lineup");
    }

    stats.set(playerId, {
      playerId,
      name: player.name,
      balls: 0,
      runsConceded: 0,
      wickets: 0
    });
  }
  return stats;
}

function toBatterStatsArray(statsMap) {
  return Array.from(statsMap.values()).map((entry) => ({
    ...entry,
    strikeRate: entry.balls ? Number(((entry.runs * 100) / entry.balls).toFixed(2)) : 0
  }));
}

function toBowlerStatsArray(statsMap) {
  return Array.from(statsMap.values())
    .filter((entry) => entry.balls > 0)
    .map((entry) => ({
      ...entry,
      overs: formatOversFromBalls(entry.balls),
      economy: entry.balls ? Number(((entry.runsConceded * 6) / entry.balls).toFixed(2)) : 0
    }));
}

function runInnings({ battingTeam, bowlingTeam, target = Number.POSITIVE_INFINITY, oversLimit = 20 }) {
  const battingLineup = [...battingTeam.players].sort((a, b) => battingSortScore(b) - battingSortScore(a));
  const bowlingUnit = [...bowlingTeam.players]
    .sort((a, b) => bowlingSortScore(b) - bowlingSortScore(a))
    .slice(0, Math.max(3, Math.min(6, bowlingTeam.players.length)));

  if (battingLineup.length < 2 || bowlingUnit.length < 1) {
    throw new Error("Each team needs enough players for match simulation");
  }

  const batterStats = initializeBatterStats(battingLineup);
  const bowlerStats = initializeBowlerStats(bowlingUnit);

  const inningsBalls = [];
  const overs = [];

  let strikerIndex = 0;
  let nonStrikerIndex = 1;
  let nextBatterIndex = 2;

  let totalRuns = 0;
  let wickets = 0;
  let ballsBowled = 0;

  while (ballsBowled < oversLimit * 6 && wickets < 10 && totalRuns < target) {
    const overNumber = Math.floor(ballsBowled / 6);
    const bowler = bowlingUnit[overNumber % bowlingUnit.length];
    const thisOver = [];

    for (let ball = 0; ball < 6; ball += 1) {
      if (ballsBowled >= oversLimit * 6 || wickets >= 10 || totalRuns >= target) {
        break;
      }

      const striker = battingLineup[strikerIndex];
      if (!striker) {
        wickets = 10;
        break;
      }

      const outcome = pickWeightedOutcome(
        buildOutcomeWeights(striker.battingSkill, bowler.bowlingSkill)
      );

      const batterId = getEntityId(striker);
      const bowlerId = getEntityId(bowler);
      const batter = batterStats.get(batterId);
      const bowlerStat = bowlerStats.get(bowlerId);

      if (!batter || !bowlerStat) {
        throw new Error("Unable to resolve batter or bowler stats by player id");
      }

      batter.balls += 1;
      bowlerStat.balls += 1;
      ballsBowled += 1;

      if (outcome === "W") {
        wickets += 1;
        batter.out = true;
        bowlerStat.wickets += 1;
        thisOver.push("W");
        inningsBalls.push(
          `${formatOversFromBalls(ballsBowled)} ${bowler.name} to ${striker.name}: WICKET`
        );

        if (nextBatterIndex < battingLineup.length) {
          strikerIndex = nextBatterIndex;
          nextBatterIndex += 1;
        } else {
          strikerIndex = -1;
          break;
        }
      } else {
        const runs = Number(outcome);
        totalRuns += runs;
        batter.runs += runs;
        bowlerStat.runsConceded += runs;

        if (runs === 4) batter.fours += 1;
        if (runs === 6) batter.sixes += 1;

        thisOver.push(String(outcome));
        inningsBalls.push(
          `${formatOversFromBalls(ballsBowled)} ${bowler.name} to ${striker.name}: ${runs} run${
            runs === 1 ? "" : "s"
          }`
        );

        if (runs % 2 === 1) {
          [strikerIndex, nonStrikerIndex] = [nonStrikerIndex, strikerIndex];
        }
      }

      if (totalRuns >= target || wickets >= 10 || strikerIndex === -1) {
        break;
      }
    }

    overs.push({ over: overNumber + 1, bowler: bowler.name, sequence: thisOver.join(" ") });

    if (strikerIndex === -1 || totalRuns >= target || wickets >= 10) {
      break;
    }

    [strikerIndex, nonStrikerIndex] = [nonStrikerIndex, strikerIndex];
  }

  return {
    runs: totalRuns,
    wickets,
    balls: ballsBowled,
    overs: formatOversFromBalls(ballsBowled),
    batters: toBatterStatsArray(batterStats),
    bowlers: toBowlerStatsArray(bowlerStats),
    oversBreakdown: overs,
    commentary: inningsBalls
  };
}

export function simulateMatchBetweenTeams(team1, team2, oversLimit = 20) {
  const innings1 = runInnings({
    battingTeam: team1,
    bowlingTeam: team2,
    target: Number.POSITIVE_INFINITY,
    oversLimit
  });

  const innings2 = runInnings({
    battingTeam: team2,
    bowlingTeam: team1,
    target: innings1.runs + 1,
    oversLimit
  });

  let winner = null;
  let result = "Match tied";

  if (innings1.runs > innings2.runs) {
    winner = "team1";
    result = `${team1.name} won by ${innings1.runs - innings2.runs} runs`;
  } else if (innings2.runs > innings1.runs) {
    winner = "team2";
    const wicketsRemaining = 10 - innings2.wickets;
    result = `${team2.name} won by ${wicketsRemaining} wickets`;
  }

  return {
    winner,
    result,
    innings1,
    innings2,
    summary: {
      team1: `${team1.name} ${innings1.runs}/${innings1.wickets} (${innings1.overs})`,
      team2: `${team2.name} ${innings2.runs}/${innings2.wickets} (${innings2.overs})`
    }
  };
}
