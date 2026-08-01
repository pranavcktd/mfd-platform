import { Controller, Get, Param } from "@nestjs/common";
import { ClientPortalService } from "./client-portal.service";

@Controller("client")
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Get("me")
  getMe() {
    return this.clientPortalService.getMe();
  }

  @Get("family/:memberId")
  getFamilyMember(@Param("memberId") memberId: string) {
    return this.clientPortalService.getFamilyMemberDetail(memberId);
  }

  @Get("folios/:folioId/transactions")
  getFolioTransactions(@Param("folioId") folioId: string) {
    return this.clientPortalService.getFolioTransactions(folioId);
  }

  @Get("family/:memberId/folios/:folioId/transactions")
  getFamilyMemberFolioTransactions(@Param("memberId") memberId: string, @Param("folioId") folioId: string) {
    return this.clientPortalService.getFamilyMemberFolioTransactions(memberId, folioId);
  }
}
