import mongoose from "mongoose";

const globalCache = globalThis as unknown as {
  mongooseConn?: Promise<typeof mongoose>;
};

export async function connectDb(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  globalCache.mongooseConn ??= mongoose.connect(uri);
  try {
    return await globalCache.mongooseConn;
  } catch (err) {
    globalCache.mongooseConn = undefined;
    throw err;
  }
}
