import { Router } from "express";
import { simulateMatch } from "../controllers/matchController.js";

const router = Router();

router.post("/simulate", simulateMatch);

export default router;
