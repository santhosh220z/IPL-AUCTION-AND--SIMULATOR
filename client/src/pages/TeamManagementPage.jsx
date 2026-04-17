import { useEffect, useMemo, useState } from "react";
import Panel from "../components/common/Panel";
import { http } from "../api/http";
import { useAuctionStore } from "../store/auctionStore";

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

export default function TeamManagementPage() {
  const userId = useAuctionStore((state) => state.userId);
  const room = useAuctionStore((state) => state.room);
  const currentRoomId = useAuctionStore((state) => state.currentRoomId);
  const setRoom = useAuctionStore((state) => state.setRoom);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRoom() {
      if (!currentRoomId) return;
      setLoading(true);
      setError("");

      try {
        const { data } = await http.get(`/auction/room/${currentRoomId}`, {
          params: { userId }
        });
        setRoom(data.room);
      } catch (requestError) {
        setError(requestError.response?.data?.message || "Could not load room");
      } finally {
        setLoading(false);
      }
    }

    loadRoom();
  }, [currentRoomId, setRoom, userId]);

  const teamCount = useMemo(() => room?.teams?.length || 0, [room]);

  return (
    <div className="space-y-6">
      <Panel
        title="Team Management"
        subtitle="Inspect squad compositions, role balance, and remaining budgets after auction rounds."
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-storm-800">
          <span className="rounded-lg border border-storm-300 bg-storm-100/70 px-3 py-2">Room: {room?.roomId || "N/A"}</span>
          <span className="rounded-lg border border-storm-300 bg-storm-100/70 px-3 py-2">Teams: {teamCount}</span>
          <span className="rounded-lg border border-storm-300 bg-storm-100/70 px-3 py-2">Auction Status: {room?.status || "N/A"}</span>
        </div>
      </Panel>

      {loading && <p className="text-sm text-storm-700">Loading latest team data...</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {(room?.teams || []).map((team) => {
          const roleCount = (team.players || []).reduce(
            (acc, player) => {
              acc[player.role] = (acc[player.role] || 0) + 1;
              return acc;
            },
            { batsman: 0, bowler: 0, "all-rounder": 0, wicketkeeper: 0 }
          );

          return (
            <Panel key={team.id} title={team.name} subtitle={`Owner: ${team.ownerName || team.owner?.username || "Unknown"}`}>
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-storm-700">
                <div className="rounded-lg border border-storm-300 bg-storm-100/70 px-2 py-2">Budget: {formatMoney(team.budget)}</div>
                <div className="rounded-lg border border-storm-300 bg-storm-100/70 px-2 py-2">Spent: {formatMoney(team.spent)}</div>
                <div className="rounded-lg border border-storm-300 bg-storm-100/70 px-2 py-2">Batsmen: {roleCount.batsman}</div>
                <div className="rounded-lg border border-storm-300 bg-storm-100/70 px-2 py-2">Bowlers: {roleCount.bowler}</div>
                <div className="rounded-lg border border-storm-300 bg-storm-100/70 px-2 py-2">All-rounders: {roleCount["all-rounder"]}</div>
                <div className="rounded-lg border border-storm-300 bg-storm-100/70 px-2 py-2">Wicketkeepers: {roleCount.wicketkeeper}</div>
              </div>

              <div className="mb-3 flex items-center gap-2 rounded-lg border border-storm-300 bg-storm-100/70 px-3 py-2 text-xs text-storm-800">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color || "#D4AF37" }} />
                Team Color: {team.color || "#D4AF37"}
              </div>

              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {(team.players || []).map((player) => (
                  <div key={player.id} className="rounded-lg border border-storm-300 bg-storm-100/70 px-3 py-2 text-sm">
                    <p className="font-semibold text-storm-900">{player.name}</p>
                    <p className="text-xs uppercase tracking-wide text-storm-700">{player.role}</p>
                  </div>
                ))}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
