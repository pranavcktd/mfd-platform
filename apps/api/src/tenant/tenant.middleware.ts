import { Injectable, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { TenantContext } from "./tenant-context";

/**
 * Resolves the authenticated Distributor tenant for the request and scopes
 * every downstream call in TenantContext. Currently reads a stub header —
 * replace with real session/JWT resolution once auth lands, but keep this
 * as the single choke point so no route can bypass tenant scoping.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const distributorId = req.header("x-distributor-id");
    if (!distributorId) {
      throw new UnauthorizedException("Missing tenant context (x-distributor-id)");
    }
    TenantContext.run(distributorId, () => next());
  }
}
