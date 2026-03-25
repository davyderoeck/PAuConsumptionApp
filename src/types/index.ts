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

export type FileType = 'per-user' | 'per-flow';

/** Aggregated daily usage for one user on one calendar date */
export interface DailyUsage {
  date: string;
  requests: number;
  peakDayEntitlement: number;
}

/** All usage data for a single user (Caller ID) */
export interface UserUsage {
  callerId: string;
  totalRequests: number;
  maxEntitledQuantity: number;
  environments: string[];
  dailyUsage: Record<string, DailyUsage>;
}

/** Fully classified user result (matches Python classify_user output) */
export interface ClassifiedUser {
  callerId: string;
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
  daysOverStandard: number;   // days in period where daily total > 8k (needs Premium)
  daysOverPremium: number;    // days in period where daily total > 40k (needs Process)
  daysUnderPremium: number;   // days in period where daily total ≤ 40k (per-flow downgrade indicator)
  totalDays: number;          // total days with any activity
  frequencyInsight: string;   // human-readable frequency recommendation (full)
  frequencyLabel: string;     // short conclusion label for table column
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

export type ProcessingStatus = 'idle' | 'parsing' | 'analyzing' | 'complete' | 'error';

