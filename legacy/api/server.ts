import * as Sentry from "@sentry/nextjs";
import express, { type NextFunction, type Request, type Response } from "express";
import { requestStats } from "./db";
import { admin } from "./routes/admin";
import { auth } from "./routes/auth";
import { feedbackRoutes } from "./routes/feedback";
import { loadUser } from "./session";

// The legacy API. It predates the Next.js app and is mounted inside it
// (app/api/[...path]/route.ts), so both deploy as one Amplify app.
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  // Count queries per request: Server-Timing: db;desc="q=<n>".
  app.use((_req, res, next) => {
    const stats = { queries: 0 };
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      res.setHeader("Server-Timing", `db;desc="q=${stats.queries}"`);
      return json(body);
    };
    requestStats.run(stats, next);
  });

  app.use("/api", loadUser);
  app.use("/api", auth, feedbackRoutes, admin);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Express knows an error handler by its four arguments.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    if (process.env.SENTRY_DSN) Sentry.captureException(err);
    res.status(500).json({ error: "Something went wrong" });
  });
  return app;
}
