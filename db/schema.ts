import { integer, pgTable, serial, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["customer", "admin"] }).notNull().default("customer"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  body: text("body").notNull().default(""),
  status: text("status", { enum: ["open", "planned", "in_progress", "shipped"] }).notNull().default("open"),
  authorId: integer("author_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
});

export const votes = pgTable(
  "votes",
  {
    id: serial("id").primaryKey(),
    feedbackId: integer("feedback_id").notNull().references(() => feedback.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One vote per user per idea.
  (t) => [unique("votes_feedback_id_user_id_unique").on(t.feedbackId, t.userId)],
);

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  feedbackId: integer("feedback_id").notNull().references(() => feedback.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outbox = pgTable("outbox", {
  id: serial("id").primaryKey(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  feedbackId: integer("feedback_id").references(() => feedback.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
