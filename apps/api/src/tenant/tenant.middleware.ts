import { Injectable, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { TenantContext } from "./tenant-context";

/**
 * Resolves the authenticated MFD tenant for the request and scopes every
 * downstream call in TenantContext. Currently reads a stub header — replace
 * with real session/JWT resolution once auth lands, but keep this as the
 * single choke point so no route can bypass tenant scoping.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const mfdId = req.header("x-mfd-id");
    if (!mfdId) {
      throw new UnauthorizedException("Missing tenant context (x-mfd-id)");
    }
    TenantContext.run(mfdId, () => next());
  }
}
