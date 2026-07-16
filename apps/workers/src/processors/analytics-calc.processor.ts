import { Job } from "bullmq";

export interface AnalyticsCalcJobData {
  mfdId: string;
  trigger: "nav-update" | "ledger-update";
}

/**
 * Phase 5 cost optimization: recompute XIRR/CAGR/absolute-return metrics
 * out-of-band whenever new AMFI NAV data or ledger rows land, writing to a
 * read-optimized cache table instead of computing on page render. Not yet
 * implemented.
 */
export async function processAnalyticsCalc(job: Job<AnalyticsCalcJobData>) {
  const { mfdId, trigger } = job.data;
  throw new Error(`processAnalyticsCalc not implemented (mfdId=${mfdId}, trigger=${trigger})`);
}
