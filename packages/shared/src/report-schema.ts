export type RtaType = "CAMS" | "KFINTECH";

export interface PayloadMapping {
  sourceColumn: string;
  targetField: string;
  dataType: "string" | "float" | "int" | "date" | "boolean";
}

export interface CoreExtractors {
  investorPan?: string;
  folioNumber?: string;
  schemeCode?: string;
  transactionDate?: string;
  amcCode?: string;
}

/** Column-mapping blueprint returned by the LLM schema broker for a previously unseen report layout. */
export interface ReportSchemaBlueprint {
  reportCode: string;
  category: string;
  coreExtractors: CoreExtractors;
  payloadMappings: PayloadMapping[];
}
