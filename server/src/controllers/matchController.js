import { simulateAndStoreMatch } from "../services/matchService.js";

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
