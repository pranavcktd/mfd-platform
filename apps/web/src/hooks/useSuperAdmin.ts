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
