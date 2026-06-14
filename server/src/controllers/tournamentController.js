import {
  buildLeagueSchedule,
  buildPlayoffs,
  calculatePointsTable,
  getRoomSchedule,
  simulateScheduledMatchById
} from "../services/tournamentService.js";
import { getAuctionRoomState } from "../services/auctionService.js";

export async function createLeagueSchedule(req, res, next) {
  try {
    const { roomId, userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    const matches = await buildLeagueSchedule(roomId, userId);
    res.status(201).json({ matches });
  } catch (error) {
    next(error);
  }
}

export async function getSchedule(req, res, next) {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "userId query parameter is required" });
    }
    await getAuctionRoomState(roomId, userId);
    const matches = await getRoomSchedule(roomId, userId);
    res.json({ matches });
  } catch (error) {
    next(error);
  }
}

export async function simulateScheduledMatch(req, res, next) {
  try {
    const { matchId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    const match = await simulateScheduledMatchById(matchId, userId);
    res.json({ match });
  } catch (error) {
    next(error);
  }
}

export async function generatePlayoffs(req, res, next) {
  try {
    const { roomId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    const matches = await buildPlayoffs(roomId, userId);
    res.status(201).json({ matches });
  } catch (error) {
    next(error);
  }
}

export async function getPointsTable(req, res, next) {
  try {
    const { roomId, userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "userId query parameter is required" });
    }
    if (!roomId) {
      return res.status(400).json({ message: "roomId query parameter is required" });
    }
    const pointsTable = await calculatePointsTable(roomId, userId);
    res.json({ pointsTable });
  } catch (error) {
    next(error);
  }
}
