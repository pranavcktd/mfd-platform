import { Injectable, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { JwtService } from "@nestjs/jwt";
import { TenantContext } from "./tenant-context";

interface AccessTokenPayload {
  sub: string;
  type?: "client";
}

/**
 * Verifies the request's bearer JWT and scopes every downstream call in
 * TenantContext to the token's distributor id. Single choke point so no
 * route can bypass tenant scoping — routes that must run before a
 * distributor is authenticated (login, admin onboarding) are excluded in
 * AppModule.configure(), as are the separate client-portal routes (guarded
 * by ClientAuthMiddleware instead).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.header("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) {
      next(new UnauthorizedException("Missing bearer token"));
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      // Defense in depth: a client-portal token's `sub` is a clientId, not a
      // distributorId — rejecting it explicitly here avoids it silently
      // resolving to "no such distributor" empty results instead of a clear
      // auth error.
      if (payload.type === "client") {
        throw new Error("Client-portal token used against a distributor route");
      }
      TenantContext.run(payload.sub, () => next());
    } catch {
      next(new UnauthorizedException("Invalid or expired token"));
    }
  }
}
