import { MiddlewareConsumer, Module, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller";
import { TenantMiddleware } from "./tenant/tenant.middleware";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { ArnProfilesModule } from "./arn-profiles/arn-profiles.module";
import { ProfileModule } from "./profile/profile.module";
import { MailModule } from "./mail/mail.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { CrmModule } from "./crm/crm.module";
import { MisModule } from "./mis/mis.module";
import { ReportsModule } from "./reports/reports.module";
import { OtherAssetsModule } from "./other-assets/other-assets.module";
import { AnalysisModule } from "./analysis/analysis.module";
import { ClientAuthModule } from "./client-auth/client-auth.module";
import { ClientAuthMiddleware } from "./client-tenant/client-auth.middleware";
import { ClientPortalModule } from "./client-portal/client-portal.module";
import { AdminAuthModule } from "./admin-auth/admin-auth.module";
import { ImportExternalModule } from "./import-external/import-external.module";
import { EquityIsinMasterModule } from "./equity-isin-master/equity-isin-master.module";
import { NavModule } from "./nav/nav.module";
import { DataQualityModule } from "./data-quality/data-quality.module";
import { RtaConfigModule } from "./rta-config/rta-config.module";
import { MarketDataModule } from "./market-data/market-data.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AdminModule,
    ArnProfilesModule,
    ProfileModule,
    MailModule,
    DashboardModule,
    CrmModule,
    MisModule,
    ReportsModule,
    OtherAssetsModule,
    AnalysisModule,
    ClientAuthModule,
    ClientPortalModule,
    AdminAuthModule,
    ImportExternalModule,
    EquityIsinMasterModule,
    NavModule,
    DataQualityModule,
    RtaConfigModule,
    MarketDataModule,
  ],
  controllers: [HealthController],
  providers: [TenantMiddleware, ClientAuthMiddleware],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.GET },
        { path: "auth/login", method: RequestMethod.POST },
        { path: "admin/(.*)", method: RequestMethod.ALL },
        { path: "admin-auth/(.*)", method: RequestMethod.ALL },
        { path: "client-auth/login", method: RequestMethod.POST },
        { path: "client-auth/change-password", method: RequestMethod.PATCH },
        { path: "client/(.*)", method: RequestMethod.ALL },
      )
      .forRoutes("*");

    // Client-portal routes get their own middleware instead of
    // TenantMiddleware — a separate auth surface from the MFD's own login
    // (see ClientAuthMiddleware doc comment). Note: "client/*" (documented
    // NestJS wildcard), not "client/(.*)" — confirmed the hard way that a
    // raw regex string is accepted (silently, no error) by exclude() but
    // does NOT match anything when passed to forRoutes() on this NestJS
    // version, which left this middleware never actually running.
    consumer
      .apply(ClientAuthMiddleware)
      .forRoutes(
        { path: "client-auth/change-password", method: RequestMethod.PATCH },
        { path: "client/*", method: RequestMethod.ALL },
      );
  }
}
