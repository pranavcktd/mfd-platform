import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApiClient } from "../lib/admin-api-client";

export interface ArnProfileSummary {
  id: string;
  arnNumber: string;
  arnHolderName: string;
  parentArnProfileId: string | null;
  camsMailId: string | null;
}

export interface DistributorSummary {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  arnProfiles: ArnProfileSummary[];
  clientCount: number;
  folioCount: number;
  transactionCount: number;
  lastSyncAt: string | null;
}

export interface ArnProfileInput {
  arnNumber: string;
  arnHolderName: string;
  euinNumber?: string;
  panNumber?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  camsMailId?: string;
  gstNumber?: string;
}

export interface CreateDistributorInput {
  name: string;
  arnProfile: ArnProfileInput;
  childArnProfiles?: ArnProfileInput[];
  kfintechDssLoginId?: string;
  kfintechDssPassword?: string;
  kfintechZipPassword?: string;
  camsZipPassword?: string;
}

export interface CreateDistributorResult extends DistributorSummary {
  loginEmail: string;
  initialPassword: string;
}

export function useDistributorList() {
  return useQuery({
    queryKey: ["admin-distributors"],
    queryFn: () => adminApiClient.get<DistributorSummary[]>("/admin/distributors"),
  });
}

export interface RtaSenderConfigRow {
  id: string;
  rtaType: string;
  senderIdentifier: string;
  updatedAt: string;
}

/** Which real email address/domain each RTA sends mail from — editable here instead of needing a code change if CAMS/KFintech ever changes it. */
export function useRtaSenderConfig() {
  return useQuery({
    queryKey: ["admin-rta-sender-config"],
    queryFn: () => adminApiClient.get<RtaSenderConfigRow[]>("/admin/rta-config"),
  });
}

export function useUpdateRtaSenderConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rtaType, senderIdentifier }: { rtaType: string; senderIdentifier: string }) =>
      adminApiClient.put<RtaSenderConfigRow>(`/admin/rta-config/${rtaType}`, { senderIdentifier }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-rta-sender-config"] }),
  });
}

export function useCreateDistributor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDistributorInput) =>
      adminApiClient.post<CreateDistributorResult>("/admin/distributors", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-distributors"] }),
  });
}

export function useSetDistributorActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ distributorId, isActive }: { distributorId: string; isActive: boolean }) =>
      adminApiClient.patch(`/admin/distributors/${distributorId}/status`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-distributors"] }),
  });
}

export function useResetDistributorPassword() {
  return useMutation({
    mutationFn: (distributorId: string) =>
      adminApiClient.patch<{ newPassword: string }>(`/admin/distributors/${distributorId}/reset-password`),
  });
}

/** Soft delete only — hides the MFD from the roster and blocks login, but every client/folio/transaction stays intact (see Distributor.deletedAt's doc comment). */
export function useDeleteDistributor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (distributorId: string) => adminApiClient.delete<{ id: string; name: string }>(`/admin/distributors/${distributorId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-distributors"] }),
  });
}

export interface ArnCredentialRow {
  provider: "CAMS" | "KFINTECH";
  payload: Record<string, string>;
  updatedAt: string;
}

/** The currently-live (decrypted) CAMS/KFintech zip password + KFintech DSS login on file for one ARN — what the archive-decryption pipeline is actually trying first. */
export function useArnCredentials(distributorId: string, arnProfileId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-arn-credentials", distributorId, arnProfileId],
    queryFn: () => adminApiClient.get<ArnCredentialRow[]>(`/admin/distributors/${distributorId}/arn-profiles/${arnProfileId}/credentials`),
    enabled,
  });
}

/** Inserts a new credential row (never overwrites — RTA zip passwords rotate, old ones stay usable for older archives). */
export function useSaveArnCredential(distributorId: string, arnProfileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: "CAMS" | "KFINTECH"; payload: Record<string, string> }) =>
      adminApiClient.post<{ provider: string; updatedAt: string }>(
        `/admin/distributors/${distributorId}/arn-profiles/${arnProfileId}/credentials`,
        input,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-arn-credentials", distributorId, arnProfileId] }),
  });
}

export function useCheckNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminApiClient.post<{ jobId: string; triggeredAt: string }>("/admin/mail/check-now"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-mail-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-mail-summary"] });
      queryClient.invalidateQueries({ queryKey: ["admin-mail-last-sync"] });
    },
  });
}

export interface ScheduleStatus {
  paused: boolean;
  pattern: string | null;
}

export function useScheduleStatus() {
  return useQuery({
    queryKey: ["admin-schedule-status"],
    queryFn: () => adminApiClient.get<ScheduleStatus>("/admin/mail/schedule-status"),
  });
}

export function useSetSchedulePaused() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paused: boolean) =>
      adminApiClient.post(paused ? "/admin/mail/pause-schedule" : "/admin/mail/resume-schedule"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-schedule-status"] }),
  });
}

export interface MailLastSyncRow {
  rtaType: string;
  lastAttemptAt: string | null;
  lastAttemptStatus: string | null;
  lastCompletedAt: string | null;
}

/** Platform-wide "last sync" glance per RTA type — same idea as NAV Sync's "Last Sync" card, split by RTA since CAMS/KFintech are independent mailboxes. */
export function useMailLastSync() {
  return useQuery({
    queryKey: ["admin-mail-last-sync"],
    queryFn: () => adminApiClient.get<MailLastSyncRow[]>("/admin/mail/last-sync"),
  });
}

export interface MailLogRow {
  id: string;
  rtaType: string;
  fromAddress: string;
  subject: string | null;
  messageId: string | null;
  receivedAt: string | null;
  downloadUrl: string | null;
  status: string;
  distributorId: string | null;
  distributor: { name: string } | null;
  arnProfileId: string | null;
  arnProfile: { arnNumber: string; arnHolderName: string } | null;
  reportCode: string | null;
  rowsInserted: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** "folder-import" isolates one since-inception bulk-import run from ongoing daily mail — "live" is everything else (real inbox mail). */
export type MailSourceFilter = "folder-import" | "live";

export function useMailLogs(filters: {
  distributorId?: string;
  arnProfileId?: string;
  status?: string;
  rtaType?: string;
  from?: string;
  to?: string;
  source?: MailSourceFilter;
}) {
  const params = new URLSearchParams();
  if (filters.distributorId) params.set("distributorId", filters.distributorId);
  if (filters.arnProfileId) params.set("arnProfileId", filters.arnProfileId);
  if (filters.status) params.set("status", filters.status);
  if (filters.rtaType) params.set("rtaType", filters.rtaType);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.source) params.set("source", filters.source);
  const qs = params.toString();
  return useQuery({
    queryKey: ["admin-mail-logs", filters],
    queryFn: () => adminApiClient.get<MailLogRow[]>(`/admin/mail/logs${qs ? `?${qs}` : ""}`),
  });
}

export interface MailLogSummaryRow {
  date: string;
  rtaType: string;
  arnProfileId: string | null;
  arnNumber: string | null;
  seen: number;
  completed: number;
  failed: number;
  rowsInserted: number;
  failureReasons: Record<string, number>;
}

export function useMailLogSummary(filters: { distributorId?: string; arnProfileId?: string; from?: string; to?: string; source?: MailSourceFilter }) {
  const params = new URLSearchParams();
  if (filters.distributorId) params.set("distributorId", filters.distributorId);
  if (filters.arnProfileId) params.set("arnProfileId", filters.arnProfileId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.source) params.set("source", filters.source);
  const qs = params.toString();
  return useQuery({
    queryKey: ["admin-mail-summary", filters],
    queryFn: () => adminApiClient.get<MailLogSummaryRow[]>(`/admin/mail/logs/summary${qs ? `?${qs}` : ""}`),
  });
}

export interface MailReportTypeSummaryRow {
  rtaType: string;
  /** Null when schema-mapping never resolved this file to a known report type. */
  reportCode: string | null;
  seen: number;
  completed: number;
  failed: number;
  rowsInserted: number;
}

/** Powers the "RTA -> report type" expand tree in the Imported Data Explorer — counts per report type within a date range. */
export function useMailReportTypes(filters: { rtaType?: string; from?: string; to?: string; distributorId?: string; arnProfileId?: string; source?: MailSourceFilter }) {
  const params = new URLSearchParams();
  if (filters.rtaType) params.set("rtaType", filters.rtaType);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.distributorId) params.set("distributorId", filters.distributorId);
  if (filters.arnProfileId) params.set("arnProfileId", filters.arnProfileId);
  if (filters.source) params.set("source", filters.source);
  const qs = params.toString();
  return useQuery({
    queryKey: ["admin-mail-report-types", filters],
    queryFn: () => adminApiClient.get<MailReportTypeSummaryRow[]>(`/admin/mail/report-types${qs ? `?${qs}` : ""}`),
  });
}

export interface InsertedTransactionRow {
  id: string;
  clientName: string;
  panNumber: string | null;
  folioNumber: string;
  amcCode: string;
  schemeName: string | null;
  transactionType: string;
  transactionDescription: string | null;
  transactionDate: string;
  amount: string | null;
  units: string | null;
}

export interface InsertedFolioBalanceRow {
  id: string;
  clientName: string;
  panNumber: string | null;
  folioNumber: string;
  amcCode: string;
  schemeName: string | null;
  balanceUnits: string | null;
  valuationAmount: string | null;
  balanceAsOfDate: string | null;
}

export interface InsertedSipRegistrationRow {
  id: string;
  clientName: string;
  panNumber: string | null;
  folioNumber: string;
  amcCode: string;
  schemeName: string | null;
  sipAmount: string | null;
  frequency: string | null;
  startDate: string | null;
  endDate: string | null;
  registrationDate: string;
  ceaseDate: string | null;
  isActive: boolean;
}

export interface InsertedBrokerageWithheldRow {
  id: string;
  investorName: string | null;
  investorPan: string | null;
  folioNumber: string;
  amcCode: string | null;
  schemeCode: string | null;
  kycStatusAtWithholding: string | null;
  trailFeeWithheld: string | null;
  transactionIncentiveWithheld: string | null;
  upfrontWithheld: string | null;
  reportDate: string;
}

export interface InsertedSystematicExpiryRow {
  id: string;
  investorName: string | null;
  folioNumber: string;
  schemeName: string | null;
  toSchemeName: string | null;
  transactionType: string | null;
  amount: string | null;
  units: string | null;
  expiryDate: string | null;
}

export interface InsertedRawRecordRow {
  id: string;
  rtaType: string;
  reportCode: string;
  investorPan: string | null;
  folioNumber: string | null;
  amcCode: string | null;
  schemeCode: string | null;
  transactionDate: string | null;
  rawStructuredPayload: Record<string, unknown>;
}

export interface InsertedDataResponse {
  transactions: InsertedTransactionRow[];
  folioBalances: InsertedFolioBalanceRow[];
  sipRegistrations: InsertedSipRegistrationRow[];
  brokerageWithheld: InsertedBrokerageWithheldRow[];
  systematicExpiry: InsertedSystematicExpiryRow[];
  /** Every record this mail's report actually contained, regardless of report type — the universal fallback, always populated (unlike the tables above, which only reflect data that was actually applied to a CRM record). */
  rawRecords: InsertedRawRecordRow[];
}

/** The real Transaction/Folio-balance rows a set of completed mails put into the CRM — either one exact day (Daily Summary's "View" button) or a from/to range (the Imported Data Explorer). */
export function useMailInsertedData(
  filters: { rtaType?: string; reportCode?: string; date?: string; from?: string; to?: string; distributorId?: string; arnProfileId?: string; source?: MailSourceFilter },
  enabled: boolean,
) {
  const params = new URLSearchParams();
  if (filters.rtaType) params.set("rtaType", filters.rtaType);
  if (filters.reportCode) params.set("reportCode", filters.reportCode);
  if (filters.date) params.set("date", filters.date);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.distributorId) params.set("distributorId", filters.distributorId);
  if (filters.arnProfileId) params.set("arnProfileId", filters.arnProfileId);
  if (filters.source) params.set("source", filters.source);
  const qs = params.toString();
  return useQuery({
    queryKey: ["admin-mail-inserted-data", filters],
    queryFn: () => adminApiClient.get<InsertedDataResponse>(`/admin/mail/inserted-data${qs ? `?${qs}` : ""}`),
    enabled,
  });
}

export function useFolderImport() {
  return useMutation({
    mutationFn: (input: {
      distributorId: string;
      arnProfileId?: string;
      folderPath: string;
      camsZipPassword?: string;
      kfintechZipPassword?: string;
    }) => adminApiClient.post<{ jobId: string; triggeredAt: string }>("/admin/mail/folder-import", input),
  });
}

export interface FolderImportPreviewResult {
  folderPath: string;
  totalFiles: number;
  camsCount: number;
  kfintechCount: number;
  unrecognizedCount: number;
  camsFiles: string[];
  kfintechFiles: string[];
  unrecognizedFiles: Array<{ path: string; reason: string }>;
}

/** Dry-run — walks and classifies a Since-Inception folder without decrypting/parsing/queuing anything, so a bad structure (e.g. missing "cams"/"kfintech" folder name) can be caught before a real import runs. */
export function useFolderImportPreview() {
  return useMutation({
    mutationFn: (folderPath: string) =>
      adminApiClient.post<FolderImportPreviewResult>("/admin/mail/folder-import/preview", { folderPath }),
  });
}

export interface PlatformStatus {
  redis: { ok: boolean; error?: string };
  postgres: { ok: boolean; error?: string };
  queueDepths: Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }>;
  lastMailCheckedAt: string | null;
  lastSuccessfulIngestAt: string | null;
}

export function usePlatformStatus() {
  return useQuery({
    queryKey: ["admin-platform-status"],
    queryFn: () => adminApiClient.get<PlatformStatus>("/admin/status"),
    refetchInterval: 30_000,
  });
}

export interface SyncHealthRow {
  distributorId: string;
  distributorName: string;
  rtaType: string;
  consecutiveDecryptFailures: number;
  lastSuccessAt: string | null;
  staleCredential: boolean;
  noRecentSync: boolean;
}

export function useSyncHealth() {
  return useQuery({
    queryKey: ["admin-sync-health"],
    queryFn: () => adminApiClient.get<SyncHealthRow[]>("/admin/status/sync-health"),
    refetchInterval: 30_000,
  });
}

export interface EquityIsinImportResult {
  nseFile: string;
  bseFile: string;
  totalIsins: number;
  nseOnly: number;
  bseOnly: number;
  tradedOnBoth: number;
  withPriceData: number;
  upserted: number;
}

export function useEquityIsinMasterImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folderPath: string) =>
      adminApiClient.post<EquityIsinImportResult>("/admin/equity-isin-master/import", { folderPath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-equity-isin-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-equity-isin-data"] });
    },
  });
}

/** Direct browser upload of the NSE + BSE list files — same merge/upsert as the folder-path import, for admins who'd rather not type a server path. */
export function useEquityIsinMasterUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nseFile, bseFile }: { nseFile: File; bseFile: File }) => {
      const formData = new FormData();
      formData.append("nseFile", nseFile);
      formData.append("bseFile", bseFile);
      return adminApiClient.postForm<EquityIsinImportResult>("/admin/equity-isin-master/upload", formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-equity-isin-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-equity-isin-data"] });
    },
  });
}

export interface EquityIsinImportLogRow {
  id: string;
  triggeredAt: string;
  completedAt: string | null;
  status: string;
  folderPath: string;
  nseFile: string | null;
  bseFile: string | null;
  totalIsins: number | null;
  upserted: number | null;
  nseOnly: number | null;
  bseOnly: number | null;
  tradedOnBoth: number | null;
  withPriceData: number | null;
  errorMessage: string | null;
}

export function useEquityIsinMasterLogs(page: number) {
  return useQuery({
    queryKey: ["admin-equity-isin-logs", page],
    queryFn: () => adminApiClient.get<{ total: number; page: number; pageSize: number; logs: EquityIsinImportLogRow[] }>(`/admin/equity-isin-master/logs?page=${page}`),
  });
}

export interface EquityIsinMasterRow {
  isin: string;
  companyName: string;
  nseSymbol: string | null;
  bseScripCode: string | null;
  bseScripId: string | null;
  isTradedOnNse: boolean;
  isTradedOnBse: boolean;
  preferredExchange: string;
  lastClosePrice: string | null;
  lastPriceDate: string | null;
  updatedAt: string;
}

export function useEquityIsinMasterData(page: number, search: string) {
  return useQuery({
    queryKey: ["admin-equity-isin-data", page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      return adminApiClient.get<{ total: number; page: number; pageSize: number; rows: EquityIsinMasterRow[] }>(`/admin/equity-isin-master/data?${params.toString()}`);
    },
  });
}

export interface AuditLogRow {
  id: string;
  action: string;
  distributorId: string | null;
  distributor: { name: string } | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export function useAuditLog(distributorId?: string) {
  return useQuery({
    queryKey: ["admin-audit-log", distributorId],
    queryFn: () =>
      adminApiClient.get<AuditLogRow[]>(`/admin/distributors/audit-log${distributorId ? `?distributorId=${distributorId}` : ""}`),
  });
}

export interface BulkOnboardResult {
  total: number;
  succeeded: number;
  results: Array<{ row: number; success: boolean; name?: string; error?: string }>;
}

export function useBulkOnboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (csvText: string) => adminApiClient.post<BulkOnboardResult>("/admin/distributors/bulk", { csvText }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-distributors"] }),
  });
}

// --- NAV sync (daily AMFI NAV pull + historical backfill) ---

export interface NavSyncLogRow {
  id: string;
  triggeredAt: string;
  completedAt: string | null;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  syncType: "DAILY" | "HISTORY_BACKFILL" | "MANUAL_UPLOAD";
  fromDate: string | null;
  toDate: string | null;
  totalRowsInFile: number | null;
  schemesMatched: number | null;
  errorMessage: string | null;
}

export function useNavSyncLogs() {
  return useQuery({
    queryKey: ["admin-nav-logs"],
    queryFn: () => adminApiClient.get<NavSyncLogRow[]>("/admin/nav/logs"),
    // Short poll so a just-triggered sync's RUNNING -> COMPLETED transition
    // shows up without the user needing to manually refresh.
    refetchInterval: 5000,
  });
}

export function useNavCheckNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminApiClient.post<{ jobId: string; triggeredAt: string }>("/admin/nav/check-now"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-nav-logs"] }),
  });
}

export interface NavSyncLogDataRow {
  isin: string;
  schemeName: string | null;
  amcCode: string | null;
  amcName: string | null;
  nav: string;
  navDate: string;
}

export function useNavSyncLogData(logId: string, page: number, search: string, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-nav-log-data", logId, page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      return adminApiClient.get<{ total: number; pageSize: number; rows: NavSyncLogDataRow[] }>(`/admin/nav/logs/${logId}/data?${params.toString()}`);
    },
    enabled,
  });
}

/** Manual CSV/Excel NAV upload — fallback for when AMFI's site is down or has changed shape and the automated daily sync can't run. */
export function useNavManualUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return adminApiClient.postForm<{ logId: string; totalDataRows: number; matched: number; rowErrors: string[] }>(
        "/admin/nav/manual-upload",
        formData,
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-nav-logs"] }),
  });
}

export function useNavBackfillHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fromDate: string; toDate: string }) =>
      adminApiClient.post<{ jobId: string; fromDate: string; toDate: string; triggeredAt: string }>(
        "/admin/nav/backfill-history",
        input,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-nav-logs"] }),
  });
}

// --- Data quality (manual gap-filling for ISIN / RTA type / asset class) ---

export type GapType = "NO_ISIN" | "NO_LIVE_NAV_MATCH" | "NO_RTA_TYPE" | "NO_ASSET_CLASS";

export interface DataQualitySummaryRow {
  gapType: GapType;
  count: number;
}

export interface DataQualityFolioRow {
  id: string;
  folioNumber: string;
  amcCode: string;
  schemeName: string | null;
  assetClass: string | null;
  isin: string | null;
  rtaType: string | null;
  balanceUnits: string | null;
  valuationAmount: string | null;
  clientName: string;
  distributorName: string;
}

export interface SchemeSuggestion {
  schemeMasterId: string;
  amcCode: string;
  amcName: string | null;
  schemeCode: string;
  schemeName: string;
  isin: string | null;
  latestNav: string | null;
  score: number;
}

export function useDataQualitySummary(distributorId?: string) {
  return useQuery({
    queryKey: ["admin-data-quality-summary", distributorId],
    queryFn: () =>
      adminApiClient.get<DataQualitySummaryRow[]>(
        `/admin/data-quality/summary${distributorId ? `?distributorId=${distributorId}` : ""}`,
      ),
  });
}

export function useDataQualityGaps(gapType: GapType, distributorId?: string) {
  const params = new URLSearchParams({ gapType });
  if (distributorId) params.set("distributorId", distributorId);
  return useQuery({
    queryKey: ["admin-data-quality-folios", gapType, distributorId],
    queryFn: () => adminApiClient.get<DataQualityFolioRow[]>(`/admin/data-quality/folios?${params.toString()}`),
  });
}

/** Lazy — only fetched once a folio's "Fix" panel is actually opened, not for the whole list up front. */
export function useDataQualitySuggestions(folioId: string | null) {
  return useQuery({
    queryKey: ["admin-data-quality-suggestions", folioId],
    queryFn: () => adminApiClient.get<SchemeSuggestion[]>(`/admin/data-quality/folios/${folioId}/suggestions`),
    enabled: !!folioId,
  });
}

export interface SiblingFolio {
  id: string;
  folioNumber: string;
  clientName: string;
  distributorName: string;
}

export interface ApplyCorrectionResult {
  id: string;
  siblingFolios: SiblingFolio[];
  /** The full field set actually applied, including any RTA type inferred from the ISIN's known scheme — pass this whole set to bulk-apply, not just the field originally sent, so siblings get the inference too. */
  appliedFields: { isin?: string; assetClass?: string; rtaType?: string };
}

export function useApplyDataQualityFix() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ folioId, fields }: { folioId: string; fields: { isin?: string; assetClass?: string; rtaType?: string } }) =>
      adminApiClient.patch<ApplyCorrectionResult>(`/admin/data-quality/folios/${folioId}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-data-quality-summary"] });
      queryClient.invalidateQueries({ queryKey: ["admin-data-quality-folios"] });
    },
  });
}

export function useBulkApplyDataQualityFix() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { folioIds: string[]; fields: { isin?: string; assetClass?: string; rtaType?: string } }) =>
      adminApiClient.post<{ fixed: number }>("/admin/data-quality/folios/bulk-apply", {
        folioIds: input.folioIds,
        ...input.fields,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-data-quality-summary"] });
      queryClient.invalidateQueries({ queryKey: ["admin-data-quality-folios"] });
    },
  });
}
