import "dotenv/config";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  port: toNumber(process.env.PORT, 5000),
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ipl-auction-sim",
  mongoServerSelectionTimeoutMs: toNumber(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 5000),
  mongoRetryDelayMs: toNumber(process.env.MONGO_RETRY_DELAY_MS, 5000),
  mongoMaxRetries: Math.max(0, Math.floor(toNumber(process.env.MONGO_MAX_RETRIES, isProduction ? 0 : 6))),
  mongoMemoryFallback: toBoolean(process.env.MONGO_MEMORY_FALLBACK, !isProduction),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  auctionBidDurationMs: toNumber(process.env.AUCTION_BID_DURATION_MS, 15000),
  auctionStartBidDurationMs: toNumber(process.env.AUCTION_START_BID_DURATION_MS, 20000)
};
