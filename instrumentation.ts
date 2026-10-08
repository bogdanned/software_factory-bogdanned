import * as Sentry from "@sentry/nextjs";

// Sentry stays off until SENTRY_DSN is set.
export async function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // No cookies or auth headers in events.
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
        }
      }
      return event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
