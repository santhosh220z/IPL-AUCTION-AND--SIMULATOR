import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http } from "../api/http";
import Panel from "../components/common/Panel";
import { useAuctionStore } from "../store/auctionStore";

const defaultColor = "#D4AF37";

export default function RoomLobbyPage() {
  const navigate = useNavigate();

  const userId = useAuctionStore((state) => state.userId);
  const userName = useAuctionStore((state) => state.userName);
  const teamColor = useAuctionStore((state) => state.teamColor);
  const currentRoomId = useAuctionStore((state) => state.currentRoomId);

  const setIdentity = useAuctionStore((state) => state.setIdentity);
  const setRoom = useAuctionStore((state) => state.setRoom);
  const setCurrentTeamId = useAuctionStore((state) => state.setCurrentTeamId);

  const [mode, setMode] = useState("host");
  const [nameInput, setNameInput] = useState(userName || "");
  const [teamName, setTeamName] = useState("");
  const [colorInput, setColorInput] = useState(teamColor || defaultColor);
  const [roomCode, setRoomCode] = useState(currentRoomId || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const hasAttemptedRejoin = useRef(false);

  useEffect(() => {
    if (hasAttemptedRejoin.current) return;
    hasAttemptedRejoin.current = true;

    async function autoRejoin() {
      if (!userId) return;

      try {
        const { data } = await http.get("/auction/rejoin", {
          params: { userId }
        });

        if (!data?.room) {
          return;
        }

        const me = (data.room.participants || []).find((participant) => participant.userId === userId);
        if (me) {
          setIdentity({ userName: me.userName, teamColor: me.color });
          setNameInput(me.userName || "");
          setColorInput(me.color || defaultColor);
        }

        setRoom(data.room);
        if (data.teamId) {
          setCurrentTeamId(data.teamId);
        }

        navigate(`/auction/${data.room.roomId}`);
      } catch (requestError) {
        // Auto-rejoin should fail silently for new users.
      }
    }

    autoRejoin();
  }, [navigate, setCurrentTeamId, setIdentity, setRoom, userId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        userId,
        userName: nameInput,
        teamName,
        teamColor: colorInput
      };

      const { data } =
        mode === "host"
          ? await http.post("/auction/create-room", payload)
          : await http.post("/auction/join-room", {
              ...payload,
              roomId: roomCode
            });

      setIdentity({ userName: nameInput, teamColor: colorInput });
      setRoom(data.room);
      setCurrentTeamId(data.teamId);
      setMessage(mode === "host" ? "Room created successfully." : "Joined room successfully.");
      navigate(`/auction/${data.room.roomId}`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to continue. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[78vh] w-full max-w-4xl items-center justify-center">
      <div className="w-full space-y-5">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-ember-500">IPL Auction Simulator</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold text-storm-900">Host or Join a Room</h1>
          <p className="mt-2 text-sm text-storm-700">
            Anonymous multiplayer mode is enabled. Your local user ID: <span className="font-mono text-ember-500">{userId}</span>
          </p>
        </div>

        <Panel className="mx-auto max-w-2xl" title="Room Entry" subtitle="Enter your details and continue to the live auction room.">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-storm-300 bg-storm-100/70 p-2">
            <button
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                mode === "host" ? "bg-ember-500 text-black" : "bg-transparent text-storm-900"
              }`}
              onClick={() => setMode("host")}
              type="button"
            >
              Host Room
            </button>
            <button
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                mode === "join" ? "bg-ember-500 text-black" : "bg-transparent text-storm-900"
              }`}
              onClick={() => setMode("join")}
              type="button"
            >
              Join Room
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === "join" && (
              <label>
                <span className="label">Room Code</span>
                <input
                  className="field uppercase"
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  placeholder="ABC123"
                  required
                />
              </label>
            )}

            <label>
              <span className="label">User Name</span>
              <input
                className="field"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                placeholder="Enter your name"
                required
              />
            </label>

            <label>
              <span className="label">Team Name</span>
              <input
                className="field"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="Enter your franchise name"
                required
              />
            </label>

            <label>
              <span className="label">Team Color</span>
              <div className="flex items-center gap-3 rounded-xl border border-storm-300 bg-storm-100 p-2">
                <input
                  className="h-10 w-14 cursor-pointer rounded border border-storm-300 bg-transparent"
                  type="color"
                  value={colorInput}
                  onChange={(event) => setColorInput(event.target.value.toUpperCase())}
                />
                <span className="font-mono text-sm text-storm-900">{colorInput}</span>
              </div>
            </label>

            <button disabled={loading} className="cta-btn w-full" type="submit">
              {loading ? "Please wait..." : mode === "host" ? "Create Room" : "Join Room"}
            </button>
          </form>
        </Panel>

        {(message || error) && (
          <Panel className="mx-auto max-w-2xl" title={error ? "Action failed" : "Action complete"}>
            {message && <p className="rounded-lg border border-green-700/40 bg-green-900/20 px-3 py-2 text-sm text-green-200">{message}</p>}
            {error && <p className="rounded-lg border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">{error}</p>}
          </Panel>
        )}
      </div>
    </div>
  );
}
