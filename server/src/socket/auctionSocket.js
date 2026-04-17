import { Server } from "socket.io";
import { env } from "../config/env.js";
import {
  getAuctionRoomState,
  placeBidForRoom,
  setAuctionIo,
  startAuctionForRoom
} from "../services/auctionService.js";

export function initializeAuctionSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigin,
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    socket.on("join_room", async ({ roomId, userId }) => {
      try {
        if (!userId) {
          throw new Error("userId is required");
        }
        const normalizedRoomId = String(roomId || "").toUpperCase();
        socket.join(normalizedRoomId);
        const state = await getAuctionRoomState(normalizedRoomId, userId);
        socket.emit("update_bid", state.room);
      } catch (error) {
        socket.emit("error_message", { message: error.message || "Failed to join room" });
      }
    });

    socket.on("start_auction", async ({ roomId, userId }) => {
      try {
        if (!userId) {
          throw new Error("userId is required");
        }
        await startAuctionForRoom({ roomId, userId });
      } catch (error) {
        socket.emit("error_message", { message: error.message || "Could not start auction" });
      }
    });

    socket.on("place_bid", async ({ roomId, teamId, amount, userId }) => {
      try {
        if (!userId) {
          throw new Error("userId is required");
        }
        await placeBidForRoom({ roomId, teamId, amount, userId, source: "socket" });
      } catch (error) {
        socket.emit("error_message", { message: error.message || "Bid failed" });
      }
    });
  });

  setAuctionIo(io);
  return io;
}
