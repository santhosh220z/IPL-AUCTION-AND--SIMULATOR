import { create } from "zustand";
import { getOrCreateUserId, normalizeHexColor } from "../utils/identity";

export const useAuctionStore = create((set, get) => ({
  userId: getOrCreateUserId(),
  userName: localStorage.getItem("ipl-user-name") || "",
  teamColor: normalizeHexColor(localStorage.getItem("ipl-team-color") || "#D4AF37"),
  room: null,
  currentTeamId: localStorage.getItem("ipl-team-id") || "",
  currentRoomId: localStorage.getItem("ipl-room-id") || "",
  matches: [],
  pointsTable: [],
  setIdentity: ({ userName, teamColor }) => {
    const safeName = String(userName || "").trim();
    const safeColor = normalizeHexColor(teamColor);

    if (safeName) {
      localStorage.setItem("ipl-user-name", safeName);
    }
    localStorage.setItem("ipl-team-color", safeColor);

    set({ userName: safeName, teamColor: safeColor });
  },
  setRoom: (room) => {
    if (!room) {
      localStorage.removeItem("ipl-room-id");
      set({ room: null, currentRoomId: "" });
      return;
    }

    localStorage.setItem("ipl-room-id", room.roomId);
    set({ room, currentRoomId: room.roomId });
  },
  setCurrentTeamId: (teamId) => {
    if (teamId) {
      localStorage.setItem("ipl-team-id", teamId);
    } else {
      localStorage.removeItem("ipl-team-id");
    }
    set({ currentTeamId: teamId || "" });
  },
  setMatches: (matchesOrUpdater) =>
    set((state) => ({
      matches:
        typeof matchesOrUpdater === "function"
          ? matchesOrUpdater(state.matches)
          : matchesOrUpdater
    })),
  upsertMatch: (incomingMatch) => {
    const existing = get().matches;
    const foundIndex = existing.findIndex((match) => match._id === incomingMatch._id);

    if (foundIndex === -1) {
      set({ matches: [incomingMatch, ...existing] });
      return;
    }

    const updated = [...existing];
    updated[foundIndex] = incomingMatch;
    set({ matches: updated });
  },
  setPointsTable: (pointsTable) => set({ pointsTable }),
  resetAuctionState: () => {
    localStorage.removeItem("ipl-team-id");
    localStorage.removeItem("ipl-room-id");
    set({ room: null, currentTeamId: "", currentRoomId: "", matches: [], pointsTable: [] });
  }
}));
