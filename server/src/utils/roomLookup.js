import { dbQuery } from "../config/db.js";
import { httpError } from "./httpError.js";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return uuidRegex.test(String(value || "").trim());
}

export async function findRoomByIdOrCode(roomIdOrCode) {
  if (!roomIdOrCode) {
    throw httpError(400, "roomId is required");
  }

  const rawValue = String(roomIdOrCode).trim();
  const normalizedRoomId = rawValue.toUpperCase();
  let room = null;

  if (isUuid(rawValue)) {
    const byId = await dbQuery("select * from auction_rooms where id = $1 limit 1", [rawValue]);
    room = byId[0] || null;
  }

  if (!room) {
    const byCode = await dbQuery("select * from auction_rooms where room_id = $1 limit 1", [normalizedRoomId]);
    room = byCode[0] || null;
  }

  if (!room) {
    throw httpError(404, "Auction room not found");
  }

  return room;
}
