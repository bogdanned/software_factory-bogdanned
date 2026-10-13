import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // lib/db-url.ts reads the RDS CA at runtime; ship it with every server route.
  outputFileTracingIncludes: { "/**": ["certs/rds-global-bundle.pem"] },
  serverExternalPackages: ["pg", "express", "light-my-request"],
};

export default nextConfig;
