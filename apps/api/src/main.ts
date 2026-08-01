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

  // Idempotent — only creates the single seeded "Admin" row if the table is
  // empty, so this is safe to run on every boot.
  await app.get(AdminAuthService).ensureSeeded();

  const port = process.env.API_PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on port ${port}`);
}

bootstrap();
