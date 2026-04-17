import { Router } from "express";
import {
  createRoom,
  getRoomState,
  joinRoom,
  placeBid,
  rejoinRoom,
  startAuction
} from "../controllers/auctionController.js";

const router = Router();

router.post("/create-room", createRoom);
router.post("/join-room", joinRoom);
router.post("/start", startAuction);
router.post("/place-bid", placeBid);
router.get("/room/:roomId", getRoomState);
router.get("/rejoin", rejoinRoom);

export default router;
