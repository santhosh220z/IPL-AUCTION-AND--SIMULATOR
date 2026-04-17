import { Router } from "express";
import {
  createLeagueSchedule,
  generatePlayoffs,
  getPointsTable,
  getSchedule,
  simulateScheduledMatch
} from "../controllers/tournamentController.js";

const router = Router();

router.post("/schedule", createLeagueSchedule);
router.get("/schedule/:roomId", getSchedule);
router.post("/simulate/:matchId", simulateScheduledMatch);
router.post("/playoffs/:roomId", generatePlayoffs);
router.get("/points-table", getPointsTable);

export default router;
