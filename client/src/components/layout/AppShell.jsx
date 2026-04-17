import { useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { http } from "../../api/http";
import { useAuctionStore } from "../../store/auctionStore";

export default function AppShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuctionStore((state) => state.userId);
  const userName = useAuctionStore((state) => state.userName);
  const currentRoomId = useAuctionStore((state) => state.currentRoomId);
  const setRoom = useAuctionStore((state) => state.setRoom);
  const setCurrentTeamId = useAuctionStore((state) => state.setCurrentTeamId);
  const resetAuctionState = useAuctionStore((state) => state.resetAuctionState);
  const hasAttemptedRejoin = useRef(false);

  const navItems = [
    { to: "/", label: "Home" },
    { to: currentRoomId ? `/auction/${currentRoomId}` : "/", label: "Auction" },
    { to: "/team", label: "Team Management" },
    { to: "/match", label: "Match Simulator" },
    { to: "/standings", label: "Standings" }
  ];

  function handleLeaveRoom() {
    resetAuctionState();
    navigate("/");
  }

  useEffect(() => {
    if (hasAttemptedRejoin.current || currentRoomId || !userId) {
      return;
    }

    hasAttemptedRejoin.current = true;

    async function autoRejoin() {
      try {
        const { data } = await http.get("/auction/rejoin", {
          params: { userId }
        });

        if (!data?.room) {
          return;
        }

        setRoom(data.room);
        if (data.teamId) {
          setCurrentTeamId(data.teamId);
        }

        if (location.pathname === "/" || location.pathname === "/room") {
          navigate(`/auction/${data.room.roomId}`);
        }
      } catch (error) {
        // Rejoin is best-effort for fresh sessions.
      }
    }

    autoRejoin();
  }, [currentRoomId, location.pathname, navigate, setCurrentTeamId, setRoom, userId]);

  return (
    <div className="min-h-screen pb-6">
      <div className="grain-layer" />
      <header className="sticky top-0 z-20 border-b border-storm-300/40 bg-storm-50/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display text-lg font-extrabold tracking-tight text-storm-900">IPL Auction Arena</p>
            <p className="font-mono text-xs text-storm-700">Anonymous room multiplayer + cricket simulator</p>
          </div>

          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    isActive ? "bg-ember-500 text-black" : "bg-storm-100/60 text-storm-900 hover:bg-storm-200"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-xl border border-storm-300 bg-storm-100 px-3 py-2 text-xs text-storm-900 sm:block">
              {userName ? `Playing as ${userName}` : "Anonymous mode"}
            </div>
            <button className="ghost-btn" onClick={handleLeaveRoom} type="button">
              Leave Room
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
