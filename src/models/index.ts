import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const STATUSES = ["todo", "doing", "done"] as const;
export type Status = (typeof STATUSES)[number];

const owner = { type: Schema.Types.ObjectId, ref: "User", required: true, index: true } as const;

const userSchema = new Schema(
  {
    githubId: { type: Number, required: true, unique: true },
    username: { type: String, required: true },
    avatarUrl: { type: String, default: "" },
  },
  { timestamps: true },
);

// Only a hash of the session token is stored; the raw token lives in the user's cookie.
const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

const goalSchema = new Schema({
  userId: owner,
  title: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
});

const weeklyPlanSchema = new Schema({
  userId: owner,
  title: { type: String, required: true, trim: true },
  startDate: { type: String, required: true },
  goalId: { type: Schema.Types.ObjectId, ref: "Goal", default: null, index: true },
});

const todoSchema = new Schema({
  userId: owner,
  title: { type: String, required: true, trim: true },
  date: { type: String, required: true, index: true },
  status: { type: String, enum: STATUSES, default: "todo", required: true },
  weeklyPlanId: { type: Schema.Types.ObjectId, ref: "WeeklyPlan", default: null, index: true },
});

function model<T extends Schema>(name: string, schema: T): Model<InferSchemaType<T>> {
  return (mongoose.models[name] as Model<InferSchemaType<T>>) ?? mongoose.model(name, schema);
}

export const User = model("User", userSchema);
export const Session = model("Session", sessionSchema);
export const Goal = model("Goal", goalSchema);
export const WeeklyPlan = model("WeeklyPlan", weeklyPlanSchema);
export const Todo = model("Todo", todoSchema);
