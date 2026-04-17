import { Router } from "express";
import { listPlayers } from "../controllers/playerController.js";

const router = Router();

router.get("/", listPlayers);

export default router;
