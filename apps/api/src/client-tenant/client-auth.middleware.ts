import { Injectable, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { JwtService } from "@nestjs/jwt";
import { ClientTenantContext } from "./client-tenant-context";

interface ClientAccessTokenPayload {
  sub: string;
  distributorId: string;
  type: "client";
}

/**
 * Client-portal counterpart to TenantMiddleware — verifies the bearer JWT
 * and requires the "client" type claim (see ClientAuthService.login), so a
 * distributor's own token can never be replayed against client-portal
 * routes and vice versa. Applied only to client-portal routes in
 * AppModule; TenantMiddleware explicitly excludes those same routes.
 */
@Injectable()
export class ClientAuthMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.header("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) {
      next(new UnauthorizedException("Missing bearer token"));
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<ClientAccessTokenPayload>(token);
      if (payload.type !== "client") {
        throw new Error("Not a client-portal token");
      }
      ClientTenantContext.run({ clientId: payload.sub, distributorId: payload.distributorId }, () => next());
    } catch {
      next(new UnauthorizedException("Invalid or expired token"));
    }
  }
}
