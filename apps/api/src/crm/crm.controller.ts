import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { AddNomineeDto } from "./dto/add-nominee.dto";
import { AddBankAccountDto } from "./dto/add-bank-account.dto";
import { MergeClientsDto } from "./dto/merge-clients.dto";
import { CreateFamilyDto, UpdateFamilyDto, AddFamilyMemberDto, SetFamilyHeadDto } from "./dto/family.dto";

@Controller("crm")
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get("clients")
  listClients(
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("amcCode") amcCode?: string,
    @Query("assetClass") assetClass?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
  ) {
    return this.crmService.listClients(search, page ? Number(page) : 1, {
      amcCode,
      assetClass,
      arnProfileIds: arnProfileIds ? arnProfileIds.split(",").filter(Boolean) : undefined,
    });
  }

  @Get("clients/:clientId")
  getClientDetail(@Param("clientId") clientId: string) {
    return this.crmService.getClientDetail(clientId);
  }

  @Get("clients/:clientId/folios/:folioId/transactions")
  getFolioTransactions(@Param("clientId") clientId: string, @Param("folioId") folioId: string) {
    return this.crmService.getFolioTransactions(clientId, folioId);
  }

  @Get("clients/:clientId/transactions")
  getClientTransactions(
    @Param("clientId") clientId: string,
    @Query("page") page?: string,
    @Query("search") search?: string,
  ) {
    return this.crmService.getClientTransactions(clientId, page ? Number(page) : 1, search);
  }

  @Post("clients/:clientId/nominees")
  addNominee(@Param("clientId") clientId: string, @Body() dto: AddNomineeDto) {
    return this.crmService.addNominee(clientId, dto);
  }

  @Delete("clients/:clientId/nominees/:nomineeId")
  removeNominee(@Param("clientId") clientId: string, @Param("nomineeId") nomineeId: string) {
    return this.crmService.removeNominee(clientId, nomineeId);
  }

  @Post("clients/:clientId/bank-accounts")
  addBankAccount(@Param("clientId") clientId: string, @Body() dto: AddBankAccountDto) {
    return this.crmService.addBankAccount(clientId, dto);
  }

  @Delete("clients/:clientId/bank-accounts/:bankAccountId")
  removeBankAccount(@Param("clientId") clientId: string, @Param("bankAccountId") bankAccountId: string) {
    return this.crmService.removeBankAccount(clientId, bankAccountId);
  }

  @Patch("clients/:clientId/mark-reviewed")
  markReviewed(@Param("clientId") clientId: string) {
    return this.crmService.markReviewed(clientId);
  }

  @Post("clients/merge")
  mergeClients(@Body() dto: MergeClientsDto) {
    return this.crmService.mergeClients(dto.sourceClientId, dto.targetClientId);
  }

  @Post("clients/:clientId/portal-login")
  createPortalLogin(@Param("clientId") clientId: string) {
    return this.crmService.createPortalLogin(clientId);
  }

  @Patch("clients/:clientId/portal-login/disable")
  disablePortalLogin(@Param("clientId") clientId: string) {
    return this.crmService.disablePortalLogin(clientId);
  }

  @Patch("clients/:clientId/portal-login/reset-password")
  resetClientPortalPassword(@Param("clientId") clientId: string) {
    return this.crmService.resetClientPortalPassword(clientId);
  }

  @Get("families")
  listFamilies() {
    return this.crmService.listFamilies();
  }

  @Post("families")
  createFamily(@Body() dto: CreateFamilyDto) {
    return this.crmService.createFamilyWithMembers(dto.familyName, dto.headClientId, dto.memberClientIds);
  }

  @Patch("families/:familyId")
  updateFamily(@Param("familyId") familyId: string, @Body() dto: UpdateFamilyDto) {
    return this.crmService.updateFamilyName(familyId, dto.familyName);
  }

  @Delete("families/:familyId")
  removeFamily(@Param("familyId") familyId: string) {
    return this.crmService.removeFamily(familyId);
  }

  @Post("families/:familyId/members")
  addFamilyMember(@Param("familyId") familyId: string, @Body() dto: AddFamilyMemberDto) {
    return this.crmService.addFamilyMember(familyId, dto.clientId);
  }

  @Patch("families/:familyId/head")
  setFamilyHead(@Param("familyId") familyId: string, @Body() dto: SetFamilyHeadDto) {
    return this.crmService.setFamilyHead(familyId, dto.clientId);
  }

  @Patch("clients/:clientId/remove-from-family")
  removeFamilyMember(@Param("clientId") clientId: string) {
    return this.crmService.removeFamilyMember(clientId);
  }
}
