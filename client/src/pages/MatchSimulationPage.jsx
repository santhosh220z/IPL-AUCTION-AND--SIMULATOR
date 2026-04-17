import { useEffect, useMemo, useState } from "react";
import Panel from "../components/common/Panel";
import { http } from "../api/http";
import { useAuctionStore } from "../store/auctionStore";

function displayScore(innings, teamName) {
  if (!innings) return `${teamName} -`;
  return `${teamName}: ${innings.runs}/${innings.wickets} (${innings.overs})`;
}

export default function MatchSimulationPage() {
  const userId = useAuctionStore((state) => state.userId);
  const room = useAuctionStore((state) => state.room);
  const currentRoomId = useAuctionStore((state) => state.currentRoomId);
  const setRoom = useAuctionStore((state) => state.setRoom);
  const matches = useAuctionStore((state) => state.matches);
  const setMatches = useAuctionStore((state) => state.setMatches);
  const upsertMatch = useAuctionStore((state) => state.upsertMatch);

  const [team1Id, setTeam1Id] = useState("");
  const [team2Id, setTeam2Id] = useState("");
  const [latestMatch, setLatestMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const teams = room?.teams || [];

  useEffect(() => {
    async function loadRoomAndSchedule() {
      if (!currentRoomId) return;

      try {
        const [roomResponse, scheduleResponse] = await Promise.all([
          http.get(`/auction/room/${currentRoomId}`, {
            params: { userId }
          }),
          http
            .get(`/tournament/schedule/${currentRoomId}`, {
              params: { userId }
            })
            .catch(() => ({ data: { matches: [] } }))
        ]);

        setRoom(roomResponse.data.room);
        setMatches(scheduleResponse.data.matches || []);
      } catch (requestError) {
        setError(requestError.response?.data?.message || "Failed to fetch room or schedule");
      }
    }

    loadRoomAndSchedule();
  }, [currentRoomId, setRoom, setMatches, userId]);

  async function runFriendlySimulation(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data } = await http.post("/match/simulate", {
        roomId: currentRoomId,
        team1Id,
        team2Id,
        userId
      });

      setLatestMatch(data);
      setMessage("Friendly match simulated successfully.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  async function generateLeagueSchedule() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data } = await http.post("/tournament/schedule", { roomId: currentRoomId, userId });
      setMatches(data.matches || []);
      setMessage("League schedule generated.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not generate schedule");
    } finally {
      setLoading(false);
    }
  }

  async function refreshSchedule() {
    if (!currentRoomId) return;

    const { data } = await http.get(`/tournament/schedule/${currentRoomId}`, {
      params: { userId }
    });
    setMatches(data.matches || []);
  }

  async function simulateScheduledMatch(matchId) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data } = await http.post(`/tournament/simulate/${matchId}`, { userId });
      upsertMatch(data.match);
      setLatestMatch(data.match);
      setMessage("Scheduled match simulated.");
      await refreshSchedule();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not simulate scheduled match");
    } finally {
      setLoading(false);
    }
  }

  async function generatePlayoffs() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data } = await http.post(`/tournament/playoffs/${currentRoomId}`, { userId });
      setMatches((prev) => {
        const nonPlayoffs = prev.filter(
          (match) => !["qualifier1", "eliminator", "qualifier2", "final"].includes(match.stage)
        );
        return [...nonPlayoffs, ...(data.matches || [])];
      });
      setMessage("Playoff schedule updated.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not generate playoffs yet");
    } finally {
      setLoading(false);
    }
  }

  const groupedMatches = useMemo(() => {
    const groups = {
      league: [],
      qualifier1: [],
      eliminator: [],
      qualifier2: [],
      final: [],
      friendly: []
    };

    for (const match of matches) {
      if (!groups[match.stage]) groups[match.stage] = [];
      groups[match.stage].push(match);
    }

    return groups;
  }, [matches]);

  return (
    <div className="space-y-6">
      <Panel title="Match Simulation" subtitle="Run one-off matches or a full tournament lifecycle from league to final.">
        <form className="grid gap-3 md:grid-cols-3" onSubmit={runFriendlySimulation}>
          <label>
            <span className="label">Team 1</span>
            <select className="field" value={team1Id} onChange={(event) => setTeam1Id(event.target.value)} required>
              <option value="">Select team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label">Team 2</span>
            <select className="field" value={team2Id} onChange={(event) => setTeam2Id(event.target.value)} required>
              <option value="">Select team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <button className="cta-btn mt-[22px]" type="submit" disabled={loading || !currentRoomId || team1Id === team2Id}>
            Simulate Friendly
          </button>
        </form>
      </Panel>

      <Panel title="Tournament Controls">
        <div className="flex flex-wrap gap-3">
          <button className="ghost-btn" type="button" onClick={generateLeagueSchedule} disabled={loading || !currentRoomId}>
            Generate League Schedule
          </button>
          <button className="ghost-btn" type="button" onClick={refreshSchedule} disabled={loading || !currentRoomId}>
            Refresh Schedule
          </button>
          <button className="ghost-btn" type="button" onClick={generatePlayoffs} disabled={loading || !currentRoomId}>
            Generate / Advance Playoffs
          </button>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Latest Result" subtitle="Most recent simulated match scorecard summary.">
          {latestMatch?.scorecard ? (
            <div className="space-y-3 text-sm text-storm-800">
              <p className="rounded-xl border border-storm-300 bg-storm-100/70 px-3 py-2 font-semibold text-storm-900">{latestMatch.result}</p>
              <p>{displayScore(latestMatch.scorecard.innings1, latestMatch.team1?.name || "Team 1")}</p>
              <p>{displayScore(latestMatch.scorecard.innings2, latestMatch.team2?.name || "Team 2")}</p>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-storm-700">Recent Commentary</p>
                <div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-storm-300 bg-storm-100/70 p-2 text-xs">
                  {(latestMatch.scorecard.innings2?.commentary || []).slice(-20).map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-storm-700">No match simulated yet.</p>
          )}
        </Panel>

        <Panel title="Scheduled Matches" subtitle="Simulate pending fixtures one by one to build standings.">
          <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {matches.map((match) => (
              <div key={match._id} className="rounded-xl border border-storm-300 bg-storm-100/70 p-3 text-sm">
                <p className="font-semibold text-storm-900">
                  {match.team1?.name} vs {match.team2?.name}
                </p>
                <p className="text-xs uppercase tracking-wide text-storm-700">{match.stage}</p>
                <p className="mt-1 text-xs text-storm-700">Status: {match.status}</p>
                {match.result && <p className="mt-1 text-xs text-storm-700">Result: {match.result}</p>}

                {match.status !== "completed" && (
                  <button
                    className="cta-btn mt-2 w-full"
                    type="button"
                    disabled={loading}
                    onClick={() => simulateScheduledMatch(match._id)}
                  >
                    Simulate Match
                  </button>
                )}
              </div>
            ))}
            {!matches.length && <p className="text-sm text-storm-700">No schedule yet. Generate league fixtures first.</p>}
          </div>
        </Panel>
      </div>

      <Panel title="Schedule Breakdown by Stage">
        <div className="grid gap-3 md:grid-cols-3">
          {Object.entries(groupedMatches).map(([stage, stageMatches]) => (
            <div key={stage} className="rounded-xl border border-storm-300 bg-storm-100/70 p-3 text-sm">
              <p className="font-semibold capitalize text-storm-900">{stage.replace(/\d/g, " $&")}</p>
              <p className="mt-1 text-xs text-storm-700">Matches: {stageMatches.length}</p>
              <p className="text-xs text-storm-700">Completed: {stageMatches.filter((item) => item.status === "completed").length}</p>
            </div>
          ))}
        </div>
      </Panel>

      {(message || error) && (
        <Panel title={error ? "Action failed" : "Action complete"}>
          {message && <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </Panel>
      )}
    </div>
  );
}
