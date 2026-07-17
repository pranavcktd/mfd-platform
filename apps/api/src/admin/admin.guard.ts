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
    return true;
  }
}
