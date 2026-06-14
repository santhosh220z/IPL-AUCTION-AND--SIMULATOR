import { createServer } from "node:http";
import app from "./app.js";
import { closeDatabase, connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { initializeAuctionSocket } from "./socket/auctionSocket.js";

function getDatabaseErrorHint(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "").toUpperCase();

  if (code === "ENOTFOUND" && message.includes("db.")) {
    return "The direct Supabase DB host is often IPv6-only. Use the Supabase Session/Transaction Pooler connection string (IPv4) in SUPABASE_DB_URL.";
  }

  if (code === "28P01") {
    return "Database authentication failed. Verify the database password in SUPABASE_DB_URL (or SUPABASE_DB_PASSWORD).";
  }

  if (code === "3D000") {
    return "Database name is invalid. For Supabase, use /postgres unless you created a custom DB name.";
  }

  return "";
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectDatabaseWithRetry({
  connectionString,
  retryDelayMs,
  maxRetries
}) {
  let attempt = 1;

  while (maxRetries === 0 || attempt <= maxRetries) {
    // eslint-disable-next-line no-console
    console.log(`Connecting to database (attempt ${attempt})...`);

    try {
      await connectDatabase(connectionString);
      // eslint-disable-next-line no-console
      console.log("Database connected");
      return;
    } catch (error) {
      const hint = getDatabaseErrorHint(error);
      // eslint-disable-next-line no-console
      console.error(
        `Database connection failed. Retrying in ${retryDelayMs / 1000}s...`,
        error?.message || error,
        hint ? `Hint: ${hint}` : ""
      );

      if (maxRetries !== 0 && attempt >= maxRetries) {
        break;
      }

      attempt += 1;
      await sleep(retryDelayMs);
    }
  }

  throw new Error(`Unable to connect to Supabase Postgres after ${maxRetries} attempts`);
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

  await closeDatabase();
}

async function bootstrap() {
  await connectDatabaseWithRetry({
    connectionString: env.supabaseDbUrl,
    retryDelayMs: env.dbRetryDelayMs,
    maxRetries: env.dbMaxRetries
  });

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
    await closeDatabase();
    // eslint-disable-next-line no-console
    console.error("Failed to start server", error);
    process.exit(1);
  });
