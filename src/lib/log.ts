import pino from "pino";

const g = globalThis as unknown as { __unipubLog?: pino.Logger };

/** JSON logs to stdout (collected by Docker). Secrets and PII fields are redacted. */
export const log: pino.Logger =
  g.__unipubLog ??
  (g.__unipubLog = pino({
    level: process.env.LOG_LEVEL ?? (process.env.APP_ENV === "test" ? "warn" : "info"),
    base: { app: "unipub", env: process.env.APP_ENV ?? "local" },
    redact: {
      paths: [
        "*.password",
        "*.token",
        "*.phone",
        "*.name",
        "headers.cookie",
        "headers.authorization",
        "*.secret",
      ],
      censor: "[redacted]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }));
