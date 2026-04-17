const USER_ID_KEY = "user_id";

export function generateUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getOrCreateUserId() {
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) {
    return existing;
  }

  const generated = generateUuid();
  localStorage.setItem(USER_ID_KEY, generated);
  return generated;
}

export function normalizeHexColor(color) {
  const candidate = String(color || "").trim();
  if (/^#(?:[0-9a-fA-F]{6})$/.test(candidate)) {
    return candidate.toUpperCase();
  }
  return "#D4AF37";
}
