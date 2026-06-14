import { dbQuery } from "../config/db.js";

export async function listPlayers(req, res, next) {
  try {
    const players = await dbQuery(
      `
      select
        id,
        name,
        role,
        base_price as "basePrice",
        batting_skill as "battingSkill",
        bowling_skill as "bowlingSkill"
      from players
      order by base_price asc, name asc
      `
    );

    res.json({ players });
  } catch (error) {
    next(error);
  }
}
