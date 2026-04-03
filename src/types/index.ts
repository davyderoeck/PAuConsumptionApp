/** Raw row from the Power Platform admin center CSV export */
export interface RawApiRow {
  environmentId: string;
  environmentName: string;
  callerId: string;
  callerType?: string;     // 'Flow' for per-flow files, absent for per-user files
  usageDate: string;       // ISO date string YYYY-MM-DD
  entitledQuantity: number;
  powerAutomateRequests: number;
}

export type FileType = 'per-user' | 'per-flow' | 'non-licensed';

/** Aggregated daily usage for one user on one calendar date */
export interface DailyUsage {
  date: string;
  requests: number;
  peakDayEntitlement: number;
}

/** All usage data for a single user (Caller ID) */
export interface UserUsage {
  callerId: string;
  callerType?: string;   // 'Service Principal', 'User', etc. (non-licensed files)
  totalRequests: number;
  maxEntitledQuantity: number;
  environments: string[];
  /** Peak daily requests per environment — used for env-specific process license calculation */
  envPeakRequests: Record<string, number>;
  dailyUsage: Record<string, DailyUsage>;
}

/** Fully classified user result (matches Python classify_user output) */
export interface ClassifiedUser {
  callerId: string;
  callerType?: string;   // 'Service Principal', 'User', etc. (non-licensed files only)
  environmentCount: number;
  environments: string;
  totalRequests: number;
  peakDate: string;
  peakDailyRequests: number;
  peakDayEntitlement: number;
  maxEntitledQuantity: number;
  effectiveObservedCapacity: number;
  capacityGapRequests: number;
  compliant: boolean;
  recommendation: 'Process' | 'Premium' | 'Covered' | 'Downgrade to Premium';
  additionalPremiumRequired: number;
  totalProcessLicensesRequired: number;
  incrementalProcessLicensesNeeded: number;
  /** Process licenses broken down per environment (Process licenses are env-specific in Power Automate) */
  processLicensesPerEnv: Record<string, number>;
  daysOverStandard: number;   // days in period where daily total > 8k (needs Premium)
  daysOverPremium: number;    // days in period where daily total > 40k (needs Process)
  daysUnderPremium: number;   // days in period where daily total ≤ 40k (per-flow downgrade indicator)
  totalDays: number;          // total days with any activity
  frequencyInsight: string;   // human-readable frequency recommendation (full)
  frequencyLabel: string;     // short conclusion label for table column
  /** Non-licensed only: position in bottom-up pool allocation */
  poolCoverageStatus?: 'covered' | 'warning' | 'overrun';
}

/** Seller-focused summary for the dashboard */
export interface SellerSummary {
  usersAnalyzed: number;
  compliantUsers: number;
  nonCompliantUsers: number;
  usersMissingPremium: number;
  additionalPremiumLicensesRequired: number;
  usersNeedingProcessLicenses: number;
  totalProcessLicensesRequired: number;
  incrementalProcessLicensesForCompliance: number;
  monthlyOpportunityUsd: number;
  annualOpportunityUsd: number;
  dateRange: string;
  premiumPriceMonthly: number;
  processPriceMonthly: number;
}

/** Per-environment, per-date breakdown for a single user (drill-down view) */
export interface UserDrillDownData {
  callerId: string;
  classified: ClassifiedUser;
  allDates: string[];            // sorted YYYY-MM-DD
  allEnvs: string[];             // sorted by total desc
  /** envName → (date → requests) */
  matrix: Record<string, Record<string, number>>;
  /** date → total requests across all envs */
  dailyTotal: { date: string; requests: number }[];
}

/** Aggregated stats per environment */
export interface EnvironmentSummary {
  environmentName: string;
  totalUsers: number;
  usersCompliant: number;
  usersMissingPremium: number;   // 8k-40k peak, no premium entitlement (per-user only)
  usersNeedingProcess: number;   // >40k peak (per-user) or >250k peak (per-flow)
  flowsDowngradeable: number;    // per-flow only: peak ≤ 40k, could use Premium instead
  totalRequests: number;
  peakDailyRequests: number;
  peakDate: string;
  allDates: string[];           // sorted YYYY-MM-DD
  /** date -> total requests across all users in this env */
  dailyTotal: { date: string; requests: number; usersActive: number }[];
}

/** License thresholds (matches Python constants) */
export const STANDARD_CAPACITY = 8000;
export const PREMIUM_CAPACITY = 40000;
export const PROCESS_CAPACITY_UNIT = 250000;
export const DEFAULT_PREMIUM_PRICE_MONTHLY = 15.0;
export const DEFAULT_PROCESS_PRICE_MONTHLY = 150.0;

/** Non-licensed tenant pool constants (Microsoft licensing rules) */
export const D365_POOL_BASE = 500_000;          // base pool with qualifying D365 Enterprise/Pro licenses
export const D365_PER_USER_ACCRUAL = 5_000;     // additional requests per qualifying D365 base seat
export const D365_POOL_CAP = 10_000_000;        // max tenant pool (hard cap)
export const REQUEST_ADDON_CAPACITY = 50_000;   // requests added per PP Request capacity add-on/day

/** Configuration for non-licensed tenant pool (entered by user in Settings) */
export interface TenantPoolConfig {
  /** Price per Power Platform Request capacity add-on per month */
  requestAddonPrice: number;
}

/** Tenant-level overrun analysis for non-licensed callers */
export interface NonLicensedTenantAnalysis {
  tenantPool: number;
  peakTenantDay: string;
  peakTenantRequests: number;
  dailyTotals: { date: string; requests: number }[];
  overrun: number;
  /** PP Request add-ons needed to cover overrun (50k/add-on) */
  addonsNeeded: number;
  /** Monthly cost to cover overrun with add-ons */
  addonCostMonthly: number;
  /** Top callers by peak daily usage — candidates for Process licenses to remove from pool */
  topCallers: {
    callerId: string;
    callerType?: string;
    peakDailyRequests: number;
    totalRequests: number;
  }[];
}

export type ProcessingStatus = 'idle' | 'parsing' | 'analyzing' | 'complete' | 'error';

