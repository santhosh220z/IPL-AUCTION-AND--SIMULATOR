import { useCallback, useEffect, useMemo, useState } from "react";
import Panel from "../components/common/Panel";
import { http } from "../api/http";
import { useAuctionStore } from "../store/auctionStore";
import { useSocket } from "../context/SocketContext";

function displayScore(innings, teamName) {
  if (!innings) return `${teamName} -`;
  return `${teamName}: ${innings.runs}/${innings.wickets} (${innings.overs})`;
}

const PLAYING_ELEVEN_SIZE = 11;

export default function MatchSimulationPage() {
  const { socket } = useSocket();
  const userId = useAuctionStore((state) => state.userId);
  const room = useAuctionStore((state) => state.room);
  const currentRoomId = useAuctionStore((state) => state.currentRoomId);
  const currentTeamId = useAuctionStore((state) => state.currentTeamId);
  const setRoom = useAuctionStore((state) => state.setRoom);
  const matches = useAuctionStore((state) => state.matches);
  const setMatches = useAuctionStore((state) => state.setMatches);
  const setPointsTable = useAuctionStore((state) => state.setPointsTable);

  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [latestMatch, setLatestMatch] = useState(null);
  const [submittingLineup, setSubmittingLineup] = useState(false);
  const [simulatingTournament, setSimulatingTournament] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const teams = room?.teams || [];
  const auctionCompleted = room?.status === "completed";
  const winner = room?.tournamentWinner || null;

  const myTeam = useMemo(() => {
    if (!teams.length) return null;
    return teams.find((team) => team.id === currentTeamId) || teams.find((team) => team.ownerUserId === userId) || null;
  }, [teams, currentTeamId, userId]);

  const submittedCount = useMemo(
    () => teams.filter((team) => team.playingElevenSubmitted).length,
    [teams]
  );
  const allLineupsSubmitted = teams.length > 0 && submittedCount === teams.length;

  const completedMatches = useMemo(
    () => matches.filter((match) => match.status === "completed"),
    [matches]
  );

  const loadRoomAndMatches = useCallback(async () => {
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
      setError(requestError.response?.data?.message || "Failed to fetch room or tournament data");
    }
  }, [currentRoomId, setMatches, setRoom, userId]);

  useEffect(() => {
    loadRoomAndMatches();
  }, [loadRoomAndMatches]);

  useEffect(() => {
    if (!socket || !currentRoomId) return;

    const onMatchUpdate = (payload) => {
      if (payload?.roomId !== currentRoomId) {
        return;
      }

      if (payload?.type === "lineup_submitted") {
        setMessage(`Playing 11 submitted (${payload.submittedCount}/${payload.totalTeams} teams ready).`);
      }

      if (payload?.type === "tournament_completed" && payload?.winner?.name) {
        setMessage(`${payload.winner.name} claimed tournament victory.`);
      }

      loadRoomAndMatches().catch(() => null);
    };

    socket.on("match_update", onMatchUpdate);

    return () => {
      socket.off("match_update", onMatchUpdate);
    };
  }, [socket, currentRoomId, loadRoomAndMatches]);

  useEffect(() => {
    if (!myTeam) {
      setSelectedPlayerIds([]);
      return;
    }

    const submittedIds = myTeam.playingElevenPlayerIds || [];
    if (submittedIds.length === PLAYING_ELEVEN_SIZE) {
      setSelectedPlayerIds(submittedIds);
      return;
    }

    setSelectedPlayerIds([]);
  }, [myTeam]);

  useEffect(() => {
    setLatestMatch(completedMatches[completedMatches.length - 1] || null);
  }, [completedMatches]);

  function togglePlayerSelection(playerId) {
    setError("");

    setSelectedPlayerIds((previous) => {
      if (previous.includes(playerId)) {
        return previous.filter((id) => id !== playerId);
      }

      if (previous.length >= PLAYING_ELEVEN_SIZE) {
        return previous;
      }

      return [...previous, playerId];
    });
  }

  async function submitMyLineup(event) {
    event.preventDefault();
    setSubmittingLineup(true);
    setError("");
    setMessage("");

    try {
      if (selectedPlayerIds.length !== PLAYING_ELEVEN_SIZE) {
        setError(`Select exactly ${PLAYING_ELEVEN_SIZE} players before submitting.`);
        return;
      }

      const { data } = await http.post("/match/playing-eleven", {
        roomId: currentRoomId,
        userId,
        playerIds: selectedPlayerIds
      });

      if (data.room) {
        setRoom(data.room);
      }

      setMessage(
        data.allSubmitted
          ? "All teams submitted Playing 11. Tournament simulation is now unlocked."
          : `Playing 11 submitted (${data.submittedCount}/${data.totalTeams} teams ready).`
      );

      await loadRoomAndMatches();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not submit Playing 11");
    } finally {
      setSubmittingLineup(false);
    }
  }

  async function simulateTournament() {
    setSimulatingTournament(true);
    setError("");
    setMessage("");

    try {
      const { data } = await http.post("/match/simulate-room", {
        roomId: currentRoomId,
        userId
      });

      setMatches(data.matches || []);
      setPointsTable(data.pointsTable || []);
      if (data.room) {
        setRoom(data.room);
      }

      const simulatedMatches = data.matches || [];
      setLatestMatch(simulatedMatches[simulatedMatches.length - 1] || null);
      setMessage(data.winner?.name ? `${data.winner.name} claimed tournament victory.` : "Tournament simulation complete.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not simulate full tournament");
    } finally {
      setSimulatingTournament(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="Match Simulator" subtitle="Submit Playing 11 after auction, then simulate all team-vs-team matches in random order.">
        {!currentRoomId && <p className="text-sm text-storm-700">Join an auction room first to access match simulation.</p>}
        {currentRoomId && !auctionCompleted && (
          <p className="text-sm text-storm-700">Auction is still ongoing. Finish the auction to unlock Playing 11 selection and simulation.</p>
        )}
        {currentRoomId && auctionCompleted && (
          <p className="text-sm text-storm-700">
            Pick your Playing 11, wait for all teams to submit, then run a full randomized tournament simulation.
          </p>
        )}
      </Panel>

      {auctionCompleted && (
        <>
          <Panel
            title="Your Playing 11"
            subtitle={
              myTeam
                ? `Select exactly ${PLAYING_ELEVEN_SIZE} players for ${myTeam.name}`
                : "Your team was not found in this room"
            }
            rightSlot={
              myTeam ? (
                <span className="rounded-lg border border-storm-300 bg-storm-100/70 px-3 py-2 text-xs text-storm-800">
                  Selected: {selectedPlayerIds.length}/{PLAYING_ELEVEN_SIZE}
                </span>
              ) : null
            }
          >
            {!myTeam && <p className="text-sm text-storm-700">Unable to locate your team in this room.</p>}

            {myTeam && (myTeam.players?.length || 0) < PLAYING_ELEVEN_SIZE && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Your squad has fewer than {PLAYING_ELEVEN_SIZE} players. Complete your squad in auction before submitting lineup.
              </p>
            )}

            {myTeam && (myTeam.players?.length || 0) >= PLAYING_ELEVEN_SIZE && (
              <form className="space-y-3" onSubmit={submitMyLineup}>
                <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
                  {(myTeam.players || []).map((player) => {
                    const checked = selectedPlayerIds.includes(player.id);

                    return (
                      <label
                        key={player.id}
                        className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                          checked ? "border-ember-500 bg-ember-100/50" : "border-storm-300 bg-storm-100/70"
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-storm-900">{player.name}</p>
                          <p className="text-xs uppercase tracking-wide text-storm-700">{player.role}</p>
                        </div>
                        <input
                          checked={checked}
                          onChange={() => togglePlayerSelection(player.id)}
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-ember-500"
                        />
                      </label>
                    );
                  })}
                </div>
                <button
                  className="cta-btn w-full"
                  type="submit"
                  disabled={submittingLineup || selectedPlayerIds.length !== PLAYING_ELEVEN_SIZE}
                >
                  {submittingLineup ? "Submitting..." : "Submit Playing 11"}
                </button>
              </form>
            )}
          </Panel>

          <Panel title="Room Readiness" subtitle="All teams must submit their Playing 11 before simulation can begin.">
            <div className="grid gap-2 md:grid-cols-2">
              {teams.map((team) => (
                <div key={team.id} className="rounded-xl border border-storm-300 bg-storm-100/70 p-3 text-sm">
                  <p className="font-semibold text-storm-900">{team.name}</p>
                  <p className="text-xs text-storm-700">Owner: {team.ownerName || "Unknown"}</p>
                  <p className={`mt-1 text-xs font-semibold ${team.playingElevenSubmitted ? "text-green-700" : "text-amber-700"}`}>
                    {team.playingElevenSubmitted ? "Playing 11 submitted" : "Waiting for Playing 11"}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-storm-700">
              Ready teams: {submittedCount}/{teams.length}
            </p>
          </Panel>

          <Panel title="Tournament Run" subtitle="Simulate all team-vs-team fixtures in random order and declare the winner.">
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="cta-btn"
                type="button"
                disabled={!allLineupsSubmitted || simulatingTournament}
                onClick={simulateTournament}
              >
                {simulatingTournament ? "Simulating tournament..." : winner ? "Re-simulate Tournament" : "Simulate Full Tournament"}
              </button>

              {!allLineupsSubmitted && (
                <span className="text-xs text-storm-700">Tournament unlocks after every team submits Playing 11.</span>
              )}
            </div>

            {winner && (
              <p className="mt-4 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                Champion: {winner.name}
              </p>
            )}
          </Panel>
        </>
      )}

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

        <Panel title="All Simulated Matches" subtitle="Randomized fixtures across all teams using submitted Playing 11.">
          <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {completedMatches.map((match) => (
              <div key={match._id} className="rounded-xl border border-storm-300 bg-storm-100/70 p-3 text-sm">
                <p className="font-semibold text-storm-900">
                  {match.team1?.name} vs {match.team2?.name}
                </p>
                <p className="text-xs uppercase tracking-wide text-storm-700">{match.stage}</p>
                <p className="mt-1 text-xs text-storm-700">{match.result}</p>
              </div>
            ))}
            {!completedMatches.length && <p className="text-sm text-storm-700">No completed matches yet.</p>}
          </div>
        </Panel>
      </div>

      {(message || error) && (
        <Panel title={error ? "Action failed" : "Action complete"}>
          {message && <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </Panel>
      )}
    </div>
  );
}
