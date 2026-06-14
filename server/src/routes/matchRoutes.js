import { Router } from "express";
import {
	simulateMatch,
	simulateRoomTournament,
	submitLineup
} from "../controllers/matchController.js";

const router = Router();

router.post("/simulate", simulateMatch);
router.post("/playing-eleven", submitLineup);
router.post("/simulate-room", simulateRoomTournament);

export default router;
