import { customAlphabet } from "nanoid";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateCode = customAlphabet(alphabet, 6);

export function generateRoomCode() {
  return generateCode();
}
