import { Job } from "bullmq";

export interface AnalyticsCalcJobData {
  distributorId: string;
  trigger: "nav-update" | "ledger-update";
}

/**
 * Phase 1 cost optimization: recompute XIRR/CAGR/absolute-return metrics
 * out-of-band whenever new AMFI NAV data or ledger rows land, writing to a
 * read-optimized cache table instead of computing on page render. Not yet
 * implemented.
 */
export async function processAnalyticsCalc(job: Job<AnalyticsCalcJobData>) {
  const { distributorId, trigger } = job.data;
  throw new Error(
    `processAnalyticsCalc not implemented (distributorId=${distributorId}, trigger=${trigger})`,
  );
}
