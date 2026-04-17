import { createServer } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { initializeAuctionSocket } from "./socket/auctionSocket.js";

let inMemoryMongoServer = null;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectDatabaseWithRetry({
  mongoUri,
  serverSelectionTimeoutMs,
  retryDelayMs,
  maxRetries
}) {
  let attempt = 1;

  while (maxRetries === 0 || attempt <= maxRetries) {
    // eslint-disable-next-line no-console
    console.log(`Connecting to database (attempt ${attempt})...`);

    try {
      await connectDatabase(mongoUri, { serverSelectionTimeoutMS: serverSelectionTimeoutMs });
      // eslint-disable-next-line no-console
      console.log("Database connected");
      return;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Database connection failed. Retrying in ${retryDelayMs / 1000}s...`,
        error?.message || error
      );

      if (maxRetries !== 0 && attempt >= maxRetries) {
        break;
      }

      attempt += 1;
      await sleep(retryDelayMs);
    }
  }

  throw new Error(`Unable to connect to MongoDB after ${maxRetries} attempts`);
}

async function connectInMemoryDatabase(serverSelectionTimeoutMs) {
  // eslint-disable-next-line no-console
  console.warn("Starting in-memory MongoDB fallback...");

  inMemoryMongoServer = await MongoMemoryServer.create();
  const memoryUri = inMemoryMongoServer.getUri("ipl-auction-sim");

  await connectDatabase(memoryUri, {
    serverSelectionTimeoutMS: serverSelectionTimeoutMs
  });

  // eslint-disable-next-line no-console
  console.log("In-memory MongoDB connected");
}

async function stopInMemoryDatabase() {
  if (!inMemoryMongoServer) {
    return;
  }

  await inMemoryMongoServer.stop();
  inMemoryMongoServer = null;
}

function startHttpServer(httpServer, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      reject(error);
    };

    httpServer.once("error", onError);
    httpServer.listen(port, () => {
      httpServer.off("error", onError);
      resolve();
    });
  });
}

async function shutdown(server, signal) {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}. Closing server...`);

  await new Promise((resolve) => {
    server.close(resolve);
  });

  await stopInMemoryDatabase();
}

async function bootstrap() {
  try {
    await connectDatabaseWithRetry({
      mongoUri: env.mongoUri,
      serverSelectionTimeoutMs: env.mongoServerSelectionTimeoutMs,
      retryDelayMs: env.mongoRetryDelayMs,
      maxRetries: env.mongoMaxRetries
    });
  } catch (connectionError) {
    if (!env.mongoMemoryFallback) {
      throw connectionError;
    }

    // eslint-disable-next-line no-console
    console.warn(
      "Primary MongoDB is unavailable. Falling back to in-memory MongoDB for this session."
    );
    await connectInMemoryDatabase(env.mongoServerSelectionTimeoutMs);
  }

  const httpServer = createServer(app);
  initializeAuctionSocket(httpServer);

  process.on("SIGINT", () => {
    shutdown(httpServer, "SIGINT")
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });

  process.on("SIGTERM", () => {
    shutdown(httpServer, "SIGTERM")
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });

  try {
    await startHttpServer(httpServer, env.port);
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${env.port}`);
  } catch (listenError) {
    if (listenError?.code === "EADDRINUSE") {
      throw new Error(
        `Port ${env.port} is already in use. Stop the existing process or set a different PORT.`
      );
    }

    throw listenError;
  }
}

bootstrap()
  .catch(async (error) => {
    await stopInMemoryDatabase();
    // eslint-disable-next-line no-console
    console.error("Failed to start server", error);
    process.exit(1);
  });
