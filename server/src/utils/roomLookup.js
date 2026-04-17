import mongoose from "mongoose";
import AuctionRoom from "../models/AuctionRoom.js";
import { httpError } from "./httpError.js";

export async function findRoomByIdOrCode(roomIdOrCode) {
  if (!roomIdOrCode) {
    throw httpError(400, "roomId is required");
  }

  let room = null;

  if (mongoose.Types.ObjectId.isValid(roomIdOrCode)) {
    room = await AuctionRoom.findById(roomIdOrCode);
  }

  if (!room) {
    room = await AuctionRoom.findOne({ roomId: String(roomIdOrCode).toUpperCase() });
  }

  if (!room) {
    throw httpError(404, "Auction room not found");
  }

  return room;
}
