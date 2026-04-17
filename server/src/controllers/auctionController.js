import {
  createAuctionRoom,
  getAuctionRoomState,
  getLatestRoomForUser,
  joinAuctionRoom,
  placeBidForRoom,
  startAuctionForRoom
} from "../services/auctionService.js";

export async function createRoom(req, res, next) {
  try {
    const { userId, userName, teamName, teamColor } = req.body;
    const result = await createAuctionRoom({ userId, userName, teamName, teamColor });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function joinRoom(req, res, next) {
  try {
    const { roomId, userId, userName, teamName, teamColor } = req.body;
    const result = await joinAuctionRoom({ roomId, userId, userName, teamName, teamColor });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function startAuction(req, res, next) {
  try {
    const { roomId, userId } = req.body;
    const result = await startAuctionForRoom({ roomId, userId });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function placeBid(req, res, next) {
  try {
    const { roomId, teamId, amount, userId } = req.body;
    const result = await placeBidForRoom({
      roomId,
      teamId,
      amount,
      userId,
      source: "rest"
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getRoomState(req, res, next) {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "userId query parameter is required" });
    }
    const result = await getAuctionRoomState(roomId, userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function rejoinRoom(req, res, next) {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "userId query parameter is required" });
    }
    const result = await getLatestRoomForUser(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
