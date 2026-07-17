import { MiddlewareConsumer, Module, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller";
import { TenantMiddleware } from "./tenant/tenant.middleware";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { ArnProfilesModule } from "./arn-profiles/arn-profiles.module";
import { ProfileModule } from "./profile/profile.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AdminModule,
    ArnProfilesModule,
    ProfileModule,
  ],
  controllers: [HealthController],
  providers: [TenantMiddleware],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.GET },
        { path: "auth/login", method: RequestMethod.POST },
        { path: "admin/(.*)", method: RequestMethod.ALL },
      )
      .forRoutes("*");
  }
}
