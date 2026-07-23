import { Controller, Get, Param, Query } from "@nestjs/common";
import { CrmService } from "./crm.service";

@Controller("crm")
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get("clients")
  listClients(@Query("search") search?: string, @Query("page") page?: string) {
    return this.crmService.listClients(search, page ? Number(page) : 1);
  }

  @Get("clients/:clientId")
  getClientDetail(@Param("clientId") clientId: string) {
    return this.crmService.getClientDetail(clientId);
  }
}
