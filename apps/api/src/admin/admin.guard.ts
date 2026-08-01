import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.header("x-admin-key");
    if (!key || key !== process.env.ADMIN_API_KEY) {
      throw new UnauthorizedException("Invalid admin key");
    }

    // Opt-in hardening: only enforced if ADMIN_IP_ALLOWLIST is actually set
    // (comma-separated IPs) — unset behaves exactly as before, so this
    // can't accidentally lock anyone out on a machine that hasn't
    // configured it. req.ip requires Express's `trust proxy` setting to be
    // accurate behind a reverse proxy; fine for direct/local access.
    const allowlist = process.env.ADMIN_IP_ALLOWLIST?.split(",").map((ip) => ip.trim()).filter(Boolean);
    if (allowlist && allowlist.length > 0 && !allowlist.includes(req.ip ?? "")) {
      throw new UnauthorizedException("Admin access is not allowed from this IP address");
    }

    return true;
  }
}
