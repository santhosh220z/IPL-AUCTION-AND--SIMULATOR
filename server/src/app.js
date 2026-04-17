import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import auctionRoutes from "./routes/auctionRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import playerRoutes from "./routes/playerRoutes.js";
import tournamentRoutes from "./routes/tournamentRoutes.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true
  })
);
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/players", playerRoutes);
app.use("/auction", auctionRoutes);
app.use("/match", matchRoutes);
app.use("/tournament", tournamentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
