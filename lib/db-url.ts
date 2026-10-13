import { readFileSync } from "node:fs";
import path from "node:path";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { PoolConfig } from "pg";

let cached: Promise<string> | null = null;

// DATABASE_URL locally and in CI. On Amplify, DATABASE_SECRET_ARN names a
// Secrets Manager secret holding the URL: fetched once per cold start.
export function databaseUrl(): Promise<string> {
  cached ??= (async () => {
    const arn = process.env.DATABASE_SECRET_ARN;
    if (!arn) {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("Set DATABASE_URL (or DATABASE_SECRET_ARN on Amplify)");
      return url;
    }
    const client = new SecretsManagerClient({});
    const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
    const value = res.SecretString ?? "";
    // A plain URL, or the JSON RDS writes ({ "url": … } or its parts).
    if (!value.startsWith("{")) return value;
    const s = JSON.parse(value);
    return s.url ?? `postgres://${s.username}:${encodeURIComponent(s.password)}@${s.host}:${s.port ?? 5432}/${s.dbname ?? "bugboard"}`;
  })();
  return cached;
}

// RDS needs TLS with Amazon's CA, which Node doesn't trust by default.
export function poolConfig(url: string): PoolConfig {
  const host = new URL(url).hostname;
  if (!host.endsWith("rds.amazonaws.com")) return { connectionString: url };
  const ca = readFileSync(path.join(process.cwd(), "certs/rds-global-bundle.pem"), "utf8");
  return { connectionString: url.replace(/[?&]sslmode=[^&]*/, ""), ssl: { ca, rejectUnauthorized: true } };
}
