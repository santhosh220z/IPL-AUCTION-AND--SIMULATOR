import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { http } from "../api/http";
import MetricCard from "../components/common/MetricCard";
import Panel from "../components/common/Panel";
import { useSocket } from "../context/SocketContext";
import { useAuctionStore } from "../store/auctionStore";

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function readableSeconds(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${seconds}s`;
}

function initials(name) {
  return String(name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AuctionRoomPage() {
  const { roomId } = useParams();
  const { socket, connected } = useSocket();

  const userId = useAuctionStore((state) => state.userId);
  const room = useAuctionStore((state) => state.room);
  const setRoom = useAuctionStore((state) => state.setRoom);
  const currentTeamId = useAuctionStore((state) => state.currentTeamId);

  const [bidAmount, setBidAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);

  const myTeam = useMemo(() => room?.teams?.find((team) => team.id === currentTeamId), [room, currentTeamId]);
  const amHost = useMemo(() => room?.creatorUserId === userId, [room, userId]);

  const recommendedMinBid = useMemo(() => {
    if (!room?.currentPlayer) return 0;
    if (!room.highestBidder) return room.currentPlayer.basePrice;
    return room.highestBid + 100000;
  }, [room]);

  useEffect(() => {
    if (!room?.bidEndTime) {
      setTimeLeft(0);
      return;
    }

    const tick = () => {
      const milliseconds = new Date(room.bidEndTime).getTime() - Date.now();
      setTimeLeft(Math.max(0, milliseconds));
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [room?.bidEndTime]);

  async function refreshRoom() {
    const { data } = await http.get(`/auction/room/${roomId}`, {
      params: { userId }
    });
    setRoom(data.room);
  }

  useEffect(() => {
    async function fetchRoom() {
      try {
        await refreshRoom();
      } catch (requestError) {
        setError(requestError.response?.data?.message || "Unable to fetch room state");
      }
    }

    fetchRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, setRoom]);

  useEffect(() => {
    if (!socket || !roomId || !userId) return;

    socket.emit("join_room", { roomId, userId });

    const applyRoomState = (payload) => {
      setRoom(payload);
    };

    const onParticipantsUpdate = () => {
      refreshRoom().catch(() => null);
    };

    const onError = (payload) => {
      setError(payload?.message || "Socket action failed");
    };

    const onMatchUpdate = (payload) => {
      if (payload?.message) {
        setMessage(payload.message);
      }
    };


    socket.on("start_auction", applyRoomState);
    socket.on("new_player", applyRoomState);
    socket.on("update_bid", applyRoomState);
    socket.on("auction_end", applyRoomState);
    socket.on("participants_update", onParticipantsUpdate);
    socket.on("match_update", onMatchUpdate);
    socket.on("error_message", onError);

    return () => {

      socket.off("start_auction", applyRoomState);
      socket.off("new_player", applyRoomState);
      socket.off("update_bid", applyRoomState);
      socket.off("auction_end", applyRoomState);
      socket.off("participants_update", onParticipantsUpdate);
      socket.off("match_update", onMatchUpdate);
      socket.off("error_message", onError);
    };
  }, [socket, roomId, setRoom, userId]);

  async function startAuction() {
    setLoading(true);
    setError("");

    try {
      if (socket && connected) {
        socket.emit("start_auction", { roomId, userId });
      } else {
        await http.post("/auction/start", { roomId, userId });
      }

      setMessage("Auction started.");
      await refreshRoom();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not start auction");
    } finally {
      setLoading(false);
    }
  }

  async function placeBid(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const numericBid = Number(bidAmount);
      if (!Number.isFinite(numericBid) || numericBid <= 0) {
        setError("Enter a valid bid amount.");
        return;
      }

      if (socket && connected) {
        socket.emit("place_bid", {
          roomId,
          teamId: currentTeamId,
          amount: numericBid,
          userId
        });
      } else {
        await http.post("/auction/place-bid", {
          roomId,
          teamId: currentTeamId,
          amount: numericBid,
          userId
        });
      }

      setBidAmount("");
      setMessage("Bid submitted.");
      await refreshRoom();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Bid failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel title={`Auction Room ${roomId}`} subtitle="Live anonymous bidding with user color identity.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Auction Status" value={room?.status || "loading"} accent={room?.status === "ongoing" ? "ember" : "storm"} />
          <MetricCard label="Teams" value={room?.teams?.length || 0} />
          <MetricCard label="Current Bid" value={formatMoney(room?.highestBid || 0)} />
          <MetricCard label="Time Left" value={readableSeconds(timeLeft)} />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Current Player on Auction"
          subtitle={room?.currentPlayer ? "Bid fast before the countdown ends" : "No active player right now"}
          rightSlot={
            room?.status === "waiting" ? (
              <button className="cta-btn" type="button" onClick={startAuction} disabled={loading || !amHost}>
                {loading ? "Starting..." : amHost ? "Start Auction" : "Host can start"}
              </button>
            ) : null
          }
        >
          {room?.currentPlayer ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-storm-300 bg-storm-100/70 p-4">
                <h3 className="font-display text-2xl font-bold text-storm-900">{room.currentPlayer.name}</h3>
                <p className="mt-1 text-sm text-storm-700">Role: {room.currentPlayer.role}</p>
                <p className="mt-1 text-sm text-storm-700">Base Price: {formatMoney(room.currentPlayer.basePrice)}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-storm-300 bg-storm-100 px-3 py-2 text-xs text-storm-900">
                    Batting Skill: <strong>{room.currentPlayer.battingSkill}</strong>
                  </div>
                  <div className="rounded-lg border border-storm-300 bg-storm-100 px-3 py-2 text-xs text-storm-900">
                    Bowling Skill: <strong>{room.currentPlayer.bowlingSkill}</strong>
                  </div>
                </div>
              </div>

              <div
                className="rounded-xl border bg-storm-100/70 p-4"
                style={{
                  borderColor: room.highestBidder?.color || "rgba(212, 175, 55, 0.35)"
                }}
              >
                <p className="text-sm text-storm-700">
                  Highest Bidder: <strong style={{ color: room.highestBidder?.color || undefined }}>{room.highestBidder?.name || "No bids yet"}</strong>
                </p>
                <p className="mt-1 text-sm text-storm-700">
                  Highest Bid: <strong>{formatMoney(room.highestBid || 0)}</strong>
                </p>
              </div>

              <form onSubmit={placeBid} className="space-y-3 rounded-xl border border-storm-300 bg-storm-100/70 p-4">
                <p className="text-xs uppercase tracking-wide text-storm-700">Place Bid (Your Team: {myTeam?.name || "N/A"})</p>
                <input
                  className="field"
                  type="number"
                  value={bidAmount}
                  onChange={(event) => setBidAmount(event.target.value)}
                  min={recommendedMinBid}
                  step="100000"
                  placeholder={`Minimum ${formatMoney(recommendedMinBid)}`}
                  required
                />
                <button className="cta-btn w-full" type="submit" disabled={!currentTeamId || loading || room?.status !== "ongoing"}>
                  Submit Bid
                </button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-storm-700">
              {room?.status === "completed" ? (
                <>
                  Auction completed. Go to <Link className="font-semibold text-ember-500 underline" to="/match">Match Simulator</Link> to submit your Playing 11 and start tournament simulation.
                </>
              ) : (
                <>
                  Waiting for auction to start. Go to <Link className="font-semibold text-ember-500 underline" to="/">home</Link> to host or join a room.
                </>
              )}
            </p>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Teams" subtitle="Budget, squad, and owner color identity.">
            <div className="space-y-3">
              {room?.teams?.map((team) => (
                <div
                  key={team.id}
                  className="rounded-xl border bg-storm-100/70 p-3"
                  style={{
                    borderColor: team.color || "rgba(212, 175, 55, 0.35)",
                    boxShadow: team.id === room?.highestBidder?.id ? `0 0 0 2px ${team.color}55 inset` : "none"
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-storm-900">{team.name}</p>
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color }} />
                  </div>
                  <p className="text-xs text-storm-700">Owner: {team.ownerName || team.owner?.username || "-"}</p>
                  <p className="mt-1 text-xs text-storm-700">Budget: {formatMoney(team.budget)}</p>
                  <p className="text-xs text-storm-700">Players: {team.players?.length || 0}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Participants" subtitle="Live room members with selected color.">
            <div className="space-y-2">
              {(room?.participants || []).map((participant) => (
                <div key={participant.id} className="flex items-center gap-3 rounded-lg border border-storm-300 bg-storm-100/70 px-3 py-2">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold text-storm-900"
                    style={{ borderColor: participant.color, color: participant.color }}
                  >
                    {initials(participant.userName)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-storm-900">
                      {participant.userName}
                      {participant.isHost ? " (Host)" : ""}
                    </p>
                    <p className="text-xs text-storm-700">{participant.teamName || "No team"}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Auction Results" subtitle="Sold and unsold players update automatically as each timer settles.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold text-storm-900">Sold Players ({room?.soldPlayers?.length || 0})</h3>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {(room?.soldPlayers || []).map((entry, index) => (
                <div key={`${entry.player?.id || index}-${index}`} className="rounded-lg border border-storm-300 bg-storm-100/70 px-3 py-2 text-sm text-storm-900">
                  <span className="font-semibold">{entry.player?.name}</span> to <span className="font-semibold">{entry.team?.name}</span> for {formatMoney(entry.amount)}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-storm-900">Unsold Players ({room?.unsoldPlayers?.length || 0})</h3>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {(room?.unsoldPlayers || []).map((player) => (
                <div key={player.id} className="rounded-lg border border-storm-300 bg-storm-100/70 px-3 py-2 text-sm text-storm-900">
                  {player.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {(message || error) && (
        <Panel title={error ? "Action failed" : "Update"}>
          {message && <p className="rounded-lg border border-green-700/40 bg-green-900/20 px-3 py-2 text-sm text-green-200">{message}</p>}
          {error && <p className="rounded-lg border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">{error}</p>}
        </Panel>
      )}
    </div>
  );
}
