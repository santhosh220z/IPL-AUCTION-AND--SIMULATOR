export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.error("Unhandled error:", err);
  }

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {})
  });
}
