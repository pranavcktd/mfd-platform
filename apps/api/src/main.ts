import { config } from "dotenv";
import { resolve } from "node:path";
// Must run before AppModule (and its transitive @mfd/db import, which
// constructs PrismaClient at module-load time) is imported below — the
// monorepo root .env is 3 levels up from apps/api/src. @nestjs/config's
// ConfigModule.forRoot() loads .env too, but only once AppModule's own
// decorator body runs, which is after AppModule's imports (including
// @mfd/db) have already been evaluated — too late for Prisma.
config({ path: resolve(__dirname, "../../../.env") });

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { AdminAuthService } from "./admin-auth/admin-auth.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Only needed once the frontend is on a different origin than the API
  // (e.g. Vercel + Railway) — locally they share an origin via vite's dev
  // proxy, so this is a no-op there. CORS_ORIGIN is a comma-separated
  // allowlist; unset means "allow any origin", which is fine here since the
  // real access gate is this app's own auth (JWT/admin-key/PAN login), not
  // CORS — narrow it once the deployed frontend origin is known.
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({ origin: corsOrigin ? corsOrigin.split(",").map((o) => o.trim()) : true, credentials: true });

  // Idempotent — only creates the single seeded "Admin" row if the table is
  // empty, so this is safe to run on every boot.
  await app.get(AdminAuthService).ensureSeeded();

  const port = process.env.API_PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on port ${port}`);
}

bootstrap();
