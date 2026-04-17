import mongoose from "mongoose";

export async function connectDatabase(mongoUri, options = {}) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri, options);
}
