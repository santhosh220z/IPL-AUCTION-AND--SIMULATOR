import { useEffect, useState } from "react";
import Panel from "../components/common/Panel";
import { http } from "../api/http";
import { useAuctionStore } from "../store/auctionStore";

export default function StandingsPage() {
  const userId = useAuctionStore((state) => state.userId);
  const currentRoomId = useAuctionStore((state) => state.currentRoomId);
  const pointsTable = useAuctionStore((state) => state.pointsTable);
  const setPointsTable = useAuctionStore((state) => state.setPointsTable);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchPointsTable() {
    if (!currentRoomId) return;
    setLoading(true);
    setError("");

    try {
      const { data } = await http.get("/tournament/points-table", {
        params: { roomId: currentRoomId, userId }
      });
      setPointsTable(data.pointsTable || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load points table");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPointsTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoomId, userId]);

  return (
    <div className="space-y-6">
      <Panel
        title="Tournament Standings"
        subtitle="Points table with wins, losses, and net run rate."
        rightSlot={
          <button className="ghost-btn" onClick={fetchPointsTable} type="button" disabled={loading || !currentRoomId}>
            Refresh
          </button>
        }
      >
        {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-storm-700">
                <th className="px-3">Pos</th>
                <th className="px-3">Team</th>
                <th className="px-3">P</th>
                <th className="px-3">W</th>
                <th className="px-3">L</th>
                <th className="px-3">T</th>
                <th className="px-3">Pts</th>
                <th className="px-3">NRR</th>
              </tr>
            </thead>
            <tbody>
              {pointsTable.map((row, index) => (
                <tr key={row.teamId} className="rounded-xl bg-storm-100/80 text-storm-900">
                  <td className="rounded-l-xl px-3 py-3 font-semibold">{index + 1}</td>
                  <td className="px-3 py-3 font-semibold">{row.teamName}</td>
                  <td className="px-3 py-3">{row.played}</td>
                  <td className="px-3 py-3">{row.won}</td>
                  <td className="px-3 py-3">{row.lost}</td>
                  <td className="px-3 py-3">{row.tied}</td>
                  <td className="px-3 py-3 font-semibold">{row.points}</td>
                  <td className="rounded-r-xl px-3 py-3">{row.nrr > 0 ? `+${row.nrr}` : row.nrr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && !pointsTable.length && (
          <p className="mt-3 text-sm text-storm-700">No standings available yet. Simulate tournament matches first.</p>
        )}
      </Panel>
    </div>
  );
}
