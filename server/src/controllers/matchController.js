import {
  simulateAndStoreMatch,
  simulateFullRoomTournament,
  submitPlayingEleven
} from "../services/matchService.js";

export async function simulateMatch(req, res, next) {
  try {
    const { roomId, team1Id, team2Id, userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    const match = await simulateAndStoreMatch({ roomId, team1Id, team2Id, userId, stage: "friendly" });
    res.status(201).json(match);
  } catch (error) {
    next(error);
  }
}

export async function submitLineup(req, res, next) {
  try {
    const { roomId, userId, playerIds } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const result = await submitPlayingEleven({ roomId, userId, playerIds });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function simulateRoomTournament(req, res, next) {
  try {
    const { roomId, userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const result = await simulateFullRoomTournament({ roomId, userId });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
