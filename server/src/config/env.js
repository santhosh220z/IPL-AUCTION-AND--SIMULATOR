import "dotenv/config";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function toLowerText(value) {
  return String(value || "").trim().toLowerCase();
}

function shouldUsePooler() {
  const raw = toLowerText(process.env.SUPABASE_USE_POOLER);
  return raw === "1" || raw === "true" || raw === "yes";
}

function getSupabaseProjectRef(projectUrl) {
  const rawUrl = String(projectUrl || "").trim();
  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);
    const [ref] = parsed.hostname.split(".");
    return String(ref || "").trim();
  } catch {
    return "";
  }
}

function buildSupabaseDbUrlFromParts() {
  const projectUrl = firstNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL);
  const projectRef = firstNonEmpty(process.env.SUPABASE_PROJECT_REF, getSupabaseProjectRef(projectUrl));
  const password = firstNonEmpty(process.env.SUPABASE_DB_PASSWORD, process.env.POSTGRES_PASSWORD);

  if (!projectRef || !password) {
    return "";
  }

  const usePooler = shouldUsePooler();
  const poolerHost = firstNonEmpty(
    process.env.SUPABASE_POOLER_HOST,
    process.env.SUPABASE_POOLER_REGION
      ? `aws-0-${String(process.env.SUPABASE_POOLER_REGION).trim()}.pooler.supabase.com`
      : ""
  );

  const user = firstNonEmpty(
    process.env.SUPABASE_DB_USER,
    usePooler ? `postgres.${projectRef}` : "postgres"
  );

  const host = firstNonEmpty(
    process.env.SUPABASE_DB_HOST,
    usePooler ? poolerHost : "",
    `db.${projectRef}.supabase.co`
  );

  const port = firstNonEmpty(
    process.env.SUPABASE_DB_PORT,
    usePooler ? "6543" : "5432"
  );
  const database = firstNonEmpty(process.env.SUPABASE_DB_NAME, "postgres");

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function resolveSupabaseDbUrl() {
  const explicit = firstNonEmpty(
    process.env.SUPABASE_DB_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.SUPABASE_POOLER_URL
  );

  if (explicit) {
    return explicit;
  }

  return buildSupabaseDbUrlFromParts();
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

const isProduction = process.env.NODE_ENV === "production";
const resolvedSupabaseDbUrl = resolveSupabaseDbUrl();

export const env = {
  port: toNumber(process.env.PORT, 5000),
  supabaseDbUrl: resolvedSupabaseDbUrl,
  supabaseDbSsl: toBoolean(process.env.SUPABASE_DB_SSL, true),
  dbRetryDelayMs: toNumber(process.env.DB_RETRY_DELAY_MS, 5000),
  dbMaxRetries: Math.max(0, Math.floor(toNumber(process.env.DB_MAX_RETRIES, isProduction ? 0 : 6))),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  auctionBidDurationMs: toNumber(process.env.AUCTION_BID_DURATION_MS, 15000),
  auctionStartBidDurationMs: toNumber(process.env.AUCTION_START_BID_DURATION_MS, 20000)
};
