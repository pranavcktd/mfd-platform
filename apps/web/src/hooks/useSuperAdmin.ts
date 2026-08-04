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

export function useCheckNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminApiClient.post<{ jobId: string; triggeredAt: string }>("/admin/mail/check-now"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-mail-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-mail-summary"] });
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

export function useMailLogs(filters: {
  distributorId?: string;
  arnProfileId?: string;
  status?: string;
  rtaType?: string;
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
  if (filters.distributorId) params.set("distributorId", filters.distributorId);
  if (filters.arnProfileId) params.set("arnProfileId", filters.arnProfileId);
  if (filters.status) params.set("status", filters.status);
  if (filters.rtaType) params.set("rtaType", filters.rtaType);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
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

export function useMailLogSummary(filters: { distributorId?: string; arnProfileId?: string; from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (filters.distributorId) params.set("distributorId", filters.distributorId);
  if (filters.arnProfileId) params.set("arnProfileId", filters.arnProfileId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString();
  return useQuery({
    queryKey: ["admin-mail-summary", filters],
    queryFn: () => adminApiClient.get<MailLogSummaryRow[]>(`/admin/mail/logs/summary${qs ? `?${qs}` : ""}`),
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
  return useMutation({
    mutationFn: (folderPath: string) =>
      adminApiClient.post<EquityIsinImportResult>("/admin/equity-isin-master/import", { folderPath }),
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
  syncType: "DAILY" | "HISTORY_BACKFILL";
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
