import Player from "../models/Player.js";

export async function listPlayers(req, res, next) {
  try {
    const players = await Player.find().sort({ basePrice: 1, name: 1 });
    res.json({ players });
  } catch (error) {
    next(error);
  }
}
