import type {
  RawApiRow,
  UserUsage,
  ClassifiedUser,
  SellerSummary,
  UserDrillDownData,
  EnvironmentSummary,
  FileType,
} from '../types';
import {
  STANDARD_CAPACITY,
  PREMIUM_CAPACITY,
  PROCESS_CAPACITY_UNIT,
  DEFAULT_PREMIUM_PRICE_MONTHLY,
  DEFAULT_PROCESS_PRICE_MONTHLY,
} from '../types';

const fmt = (n: number) => n >= 1_000_000
  ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000
  ? `${(n / 1_000).toFixed(0)}k`
  : String(n);

/**
 * Aggregate raw rows by user, then classify each user by peak daily usage.
 * Mirrors the Python script logic exactly.
 */
export function analyzeConsumption(
  rows: RawApiRow[],
  dateRange: string,
  premiumPrice = DEFAULT_PREMIUM_PRICE_MONTHLY,
  processPrice = DEFAULT_PROCESS_PRICE_MONTHLY,
  fileType: FileType = 'per-user',
): { users: ClassifiedUser[]; summary: SellerSummary } {
  const userMap = aggregateByUser(rows);
  const users = Array.from(userMap.values())
    .map(u => classifyUser(u, fileType))
    .sort((a, b) =>
      b.peakDailyRequests - a.peakDailyRequests ||
      b.totalRequests - a.totalRequests
    );

  const premiumUsers = users.filter(u => u.additionalPremiumRequired > 0);
  const processUsers = users.filter(u => u.totalProcessLicensesRequired > 0);
  const nonCompliant = users.filter(u => !u.compliant);

  const totalAddlPremium = premiumUsers.reduce((s, u) => s + u.additionalPremiumRequired, 0);
  const totalProcessLic = users.reduce((s, u) => s + u.totalProcessLicensesRequired, 0);
  const incrementalProcess = users.reduce((s, u) => s + u.incrementalProcessLicensesNeeded, 0);

  const monthly = totalAddlPremium * premiumPrice + totalProcessLic * processPrice;

  const summary: SellerSummary = {
    usersAnalyzed: users.length,
    compliantUsers: users.length - nonCompliant.length,
    nonCompliantUsers: nonCompliant.length,
    usersMissingPremium: premiumUsers.length,
    additionalPremiumLicensesRequired: totalAddlPremium,
    usersNeedingProcessLicenses: processUsers.length,
    totalProcessLicensesRequired: totalProcessLic,
    incrementalProcessLicensesForCompliance: incrementalProcess,
    monthlyOpportunityUsd: Math.round(monthly * 100) / 100,
    annualOpportunityUsd: Math.round(monthly * 12 * 100) / 100,
    dateRange,
    premiumPriceMonthly: premiumPrice,
    processPriceMonthly: processPrice,
  };

  return { users, summary };
}

/** Aggregate raw CSV rows by Caller ID, summing requests per calendar day */
function aggregateByUser(rows: RawApiRow[]): Map<string, UserUsage> {
  const map = new Map<string, UserUsage>();

  for (const row of rows) {
    if (!row.callerId) continue;

    let usage = map.get(row.callerId);
    if (!usage) {
      usage = {
        callerId: row.callerId,
        totalRequests: 0,
        maxEntitledQuantity: 0,
        environments: [],
        dailyUsage: {},
      };
      map.set(row.callerId, usage);
    }

    usage.totalRequests += row.powerAutomateRequests;
    usage.maxEntitledQuantity = Math.max(usage.maxEntitledQuantity, row.entitledQuantity);

    const env = row.environmentName || row.environmentId;
    if (env && !usage.environments.includes(env)) {
      usage.environments.push(env);
    }

    const daily = usage.dailyUsage[row.usageDate] ?? {
      date: row.usageDate,
      requests: 0,
      peakDayEntitlement: 0,
    };
    daily.requests += row.powerAutomateRequests;
    daily.peakDayEntitlement = Math.max(daily.peakDayEntitlement, row.entitledQuantity);
    usage.dailyUsage[row.usageDate] = daily;
  }

  return map;
}

/** Classify a single user/flow based on their peak daily usage */
function classifyUser(usage: UserUsage, fileType: FileType): ClassifiedUser {
  const days = Object.values(usage.dailyUsage);
  if (days.length === 0) {
    return {
      callerId: usage.callerId,
      environmentCount: usage.environments.length,
      environments: usage.environments.join('; '),
      totalRequests: 0,
      peakDate: '',
      peakDailyRequests: 0,
      peakDayEntitlement: 0,
      maxEntitledQuantity: 0,
      effectiveObservedCapacity: STANDARD_CAPACITY,
      capacityGapRequests: 0,
      compliant: true,
      recommendation: 'Covered',
      additionalPremiumRequired: 0,
      totalProcessLicensesRequired: 0,
      incrementalProcessLicensesNeeded: 0,
      daysOverStandard: 0,
      daysOverPremium: 0,
      daysUnderPremium: 0,
      totalDays: 0,
      frequencyInsight: '',
      frequencyLabel: '',
    };
  }

  // Find peak day (max requests, tie-break by date descending for latest)
  const peak = days.reduce((best, d) =>
    d.requests > best.requests || (d.requests === best.requests && d.date > best.date)
      ? d : best
  );

  const peakDailyRequests = peak.requests;

  // --- Per-flow logic: entitlement is 250K (Process), check if could downgrade ---
  if (fileType === 'per-flow') {
    const entitlement = PROCESS_CAPACITY_UNIT; // 250K per-flow license
    const compliant = peakDailyRequests <= entitlement;
    const capacityGapRequests = Math.max(peakDailyRequests - entitlement, 0);

    // Additional process licenses if exceeding 250K
    const totalProcessLicensesRequired = peakDailyRequests > entitlement
      ? Math.ceil(peakDailyRequests / PROCESS_CAPACITY_UNIT)
      : 0;
    const incrementalProcessLicensesNeeded = peakDailyRequests > entitlement
      ? Math.ceil((peakDailyRequests - entitlement) / PROCESS_CAPACITY_UNIT)
      : 0;

    // Could this flow run on a Premium license instead? (peak ≤ 40K)
    const canDowngrade = peakDailyRequests <= PREMIUM_CAPACITY;

    const daysOverEntitlement = days.filter(d => d.requests > entitlement).length;
    const daysUnderPremium = days.filter(d => d.requests <= PREMIUM_CAPACITY).length;
    const totalDays = days.length;

    let recommendation: 'Process' | 'Premium' | 'Covered' | 'Downgrade to Premium';
    if (!compliant) recommendation = 'Process';
    else if (canDowngrade) recommendation = 'Downgrade to Premium';
    else recommendation = 'Covered';

    // Frequency analysis for per-flow: based on 250K threshold
    const freqOver = totalDays > 0 ? (daysOverEntitlement / totalDays) * 100 : 0;
    let frequencyInsight = '';
    let frequencyLabel = '';

    if (canDowngrade) {
      frequencyInsight = `Peak ${fmt(peakDailyRequests)} ≤ 40k on all days — Premium license (40k/day) would suffice. Potential cost saving.`;
      frequencyLabel = 'Downgrade candidate';
    } else if (daysOverEntitlement > 0) {
      if (freqOver < 10) {
        frequencyInsight = `Exceeded 250k/day on ${daysOverEntitlement}/${totalDays} days (${freqOver.toFixed(0)}%). Occasional spike.`;
        frequencyLabel = 'Occasional spike';
      } else if (freqOver < 40) {
        frequencyInsight = `Exceeded 250k/day on ${daysOverEntitlement}/${totalDays} days (${freqOver.toFixed(0)}%). Moderate pattern — additional Process license may be needed.`;
        frequencyLabel = 'Moderate pattern';
      } else {
        frequencyInsight = `Exceeded 250k/day on ${daysOverEntitlement}/${totalDays} days (${freqOver.toFixed(0)}%). Recurring — additional Process licenses recommended.`;
        frequencyLabel = 'License recommended';
      }
    } else {
      frequencyInsight = '';
      frequencyLabel = 'Compliant';
    }

    return {
      callerId: usage.callerId,
      environmentCount: usage.environments.length,
      environments: usage.environments.sort().join('; '),
      totalRequests: usage.totalRequests,
      peakDate: peak.date,
      peakDailyRequests,
      peakDayEntitlement: peak.peakDayEntitlement,
      maxEntitledQuantity: usage.maxEntitledQuantity,
      effectiveObservedCapacity: entitlement,
      capacityGapRequests,
      compliant,
      recommendation,
      additionalPremiumRequired: 0,
      totalProcessLicensesRequired,
      incrementalProcessLicensesNeeded,
      daysOverStandard: 0,  // not applicable for per-flow
      daysOverPremium: daysOverEntitlement,  // repurposed: days > 250K for per-flow
      daysUnderPremium,
      totalDays,
      frequencyInsight,
      frequencyLabel,
    };
  }

  // --- Per-user logic (original) ---

  // Total process licenses required = ceil(peak / 250k) if peak > 40k
  const totalProcessLicensesRequired = peakDailyRequests > PREMIUM_CAPACITY
    ? Math.ceil(peakDailyRequests / PROCESS_CAPACITY_UNIT)
    : 0;

  // Incremental process licenses needed above the entitled capacity
  const entitledCapacity = Math.max(PREMIUM_CAPACITY, usage.maxEntitledQuantity);
  const incrementalProcessLicensesNeeded = peakDailyRequests > entitledCapacity
    ? Math.ceil((peakDailyRequests - entitledCapacity) / PROCESS_CAPACITY_UNIT)
    : 0;

  // Premium required: 8k < peak ≤ 40k AND entitled < 40k
  const additionalPremiumRequired =
    peakDailyRequests > STANDARD_CAPACITY &&
    peakDailyRequests <= PREMIUM_CAPACITY &&
    usage.maxEntitledQuantity < PREMIUM_CAPACITY
      ? 1 : 0;

  const effectiveObservedCapacity = Math.max(STANDARD_CAPACITY, usage.maxEntitledQuantity);
  const compliant = peakDailyRequests <= effectiveObservedCapacity;
  const capacityGapRequests = Math.max(peakDailyRequests - effectiveObservedCapacity, 0);

  let recommendation: 'Process' | 'Premium' | 'Covered';
  if (totalProcessLicensesRequired > 0) recommendation = 'Process';
  else if (additionalPremiumRequired) recommendation = 'Premium';
  else recommendation = 'Covered';

  const daysOverStandard = days.filter(d => d.requests > STANDARD_CAPACITY).length;
  const daysOverPremium = days.filter(d => d.requests > PREMIUM_CAPACITY).length;
  const totalDays = days.length;

  // Build frequency insight — skip 8k analysis if user already has Premium entitlement (>=40k)
  const hasPremiumEntitlement = usage.maxEntitledQuantity >= PREMIUM_CAPACITY;
  const freqPrem = totalDays > 0 ? (daysOverPremium / totalDays) * 100 : 0;
  const freqStd = totalDays > 0 ? (daysOverStandard / totalDays) * 100 : 0;

  let frequencyInsight = '';
  let frequencyLabel = '';
  if (daysOverPremium > 0) {
    if (freqPrem < 10) {
      frequencyInsight = `Process spike on ${daysOverPremium}/${totalDays} days — review before adding licenses`;
      frequencyLabel = 'Occasional spike';
    } else if (freqPrem < 40) {
      frequencyInsight = `Process usage on ${daysOverPremium}/${totalDays} days — moderate pattern`;
      frequencyLabel = 'Moderate pattern';
    } else {
      frequencyInsight = `Process usage recurring (${daysOverPremium}/${totalDays} days) — licenses recommended`;
      frequencyLabel = 'License recommended';
    }
  } else if (!hasPremiumEntitlement && daysOverStandard > 0) {
    if (freqStd < 10) {
      frequencyInsight = `Premium spike on ${daysOverStandard}/${totalDays} days — occasional, monitor first`;
      frequencyLabel = 'Monitor first';
    } else if (freqStd < 40) {
      frequencyInsight = `Premium threshold on ${daysOverStandard}/${totalDays} days — moderate pattern`;
      frequencyLabel = 'Moderate pattern';
    } else {
      frequencyInsight = `Premium threshold recurring (${daysOverStandard}/${totalDays} days) — upgrade recommended`;
      frequencyLabel = 'License recommended';
    }
  }

  return {
    callerId: usage.callerId,
    environmentCount: usage.environments.length,
    environments: usage.environments.sort().join('; '),
    totalRequests: usage.totalRequests,
    peakDate: peak.date,
    peakDailyRequests,
    peakDayEntitlement: peak.peakDayEntitlement,
    maxEntitledQuantity: usage.maxEntitledQuantity,
    effectiveObservedCapacity,
    capacityGapRequests,
    compliant,
    recommendation,
    additionalPremiumRequired,
    totalProcessLicensesRequired,
    incrementalProcessLicensesNeeded,
    daysOverStandard,
    daysOverPremium,
    daysUnderPremium: 0,  // not used for per-user
    totalDays,
    frequencyInsight,
    frequencyLabel,
  };
}

/**
 * Build per-environment × per-date drill-down data for a single user.
 * Used to populate the user detail modal with trend chart + heat matrix.
 */
export function buildDrillDown(
  rows: RawApiRow[],
  callerId: string,
  classified: ClassifiedUser,
): UserDrillDownData {
  const userRows = rows.filter(r => r.callerId === callerId);

  // matrix[envName][date] = total requests
  const matrix: Record<string, Record<string, number>> = {};
  const dateSet = new Set<string>();
  const envTotals: Record<string, number> = {};

  for (const row of userRows) {
    const env = row.environmentName || row.environmentId || 'Unknown';
    const date = row.usageDate;
    dateSet.add(date);
    if (!matrix[env]) matrix[env] = {};
    matrix[env][date] = (matrix[env][date] ?? 0) + row.powerAutomateRequests;
    envTotals[env] = (envTotals[env] ?? 0) + row.powerAutomateRequests;
  }

  const allDates = Array.from(dateSet).sort();
  // Sort envs by total usage descending
  const allEnvs = Object.keys(matrix).sort((a, b) => (envTotals[b] ?? 0) - (envTotals[a] ?? 0));

  // daily total across all envs
  const dailyTotal = allDates.map(date => ({
    date,
    requests: allEnvs.reduce((sum, env) => sum + (matrix[env][date] ?? 0), 0),
  }));

  return { callerId, classified, allDates, allEnvs, matrix, dailyTotal };
}

/**
 * Build per-environment summaries: user counts, compliance, daily trends.
 */
export function buildEnvironmentSummary(rows: RawApiRow[], fileType: FileType = 'per-user'): EnvironmentSummary[] {
  // Group rows by environment
  const envMap = new Map<string, RawApiRow[]>();
  for (const row of rows) {
    const env = row.environmentName || row.environmentId || 'Unknown';
    if (!envMap.has(env)) envMap.set(env, []);
    envMap.get(env)!.push(row);
  }

  const summaries: EnvironmentSummary[] = [];

  for (const [envName, envRows] of envMap) {
    // Aggregate by user within this environment: user -> date -> requests
    const userDays = new Map<string, Map<string, number>>();
    const dateSet = new Set<string>();
    const dateDailyTotals = new Map<string, { total: number; users: Set<string> }>();

    for (const row of envRows) {
      dateSet.add(row.usageDate);
      if (!userDays.has(row.callerId)) userDays.set(row.callerId, new Map());
      const ud = userDays.get(row.callerId)!;
      ud.set(row.usageDate, (ud.get(row.usageDate) ?? 0) + row.powerAutomateRequests);

      if (!dateDailyTotals.has(row.usageDate)) dateDailyTotals.set(row.usageDate, { total: 0, users: new Set() });
      const dd = dateDailyTotals.get(row.usageDate)!;
      dd.total += row.powerAutomateRequests;
      dd.users.add(row.callerId);
    }

    // Classify each user/flow by their peak day within this environment
    let usersCompliant = 0, usersMissingPremium = 0, usersNeedingProcess = 0, flowsDowngradeable = 0;
    let totalRequests = 0;

    for (const [, dayMap] of userDays) {
      const peak = Math.max(...Array.from(dayMap.values()));
      totalRequests += Array.from(dayMap.values()).reduce((s, v) => s + v, 0);

      if (fileType === 'per-flow') {
        // Per-flow: entitlement = 250K
        if (peak > PROCESS_CAPACITY_UNIT) usersNeedingProcess++;
        else if (peak <= PREMIUM_CAPACITY) { flowsDowngradeable++; usersCompliant++; }
        else usersCompliant++;
      } else {
        // Per-user: standard thresholds
        if (peak > PREMIUM_CAPACITY) usersNeedingProcess++;
        else if (peak > STANDARD_CAPACITY) usersMissingPremium++;
        else usersCompliant++;
      }
    }

    const allDates = Array.from(dateSet).sort();
    const dailyTotal = allDates.map(date => {
      const dd = dateDailyTotals.get(date);
      return { date, requests: dd?.total ?? 0, usersActive: dd?.users.size ?? 0 };
    });

    // Overall peak
    const peakDay = dailyTotal.reduce((best, d) => d.requests > best.requests ? d : best, dailyTotal[0]);

    summaries.push({
      environmentName: envName,
      totalUsers: userDays.size,
      usersCompliant,
      usersMissingPremium,
      usersNeedingProcess,
      flowsDowngradeable,
      totalRequests,
      peakDailyRequests: peakDay?.requests ?? 0,
      peakDate: peakDay?.date ?? '',
      allDates,
      dailyTotal,
    });
  }

  // Sort by non-compliant users desc
  return summaries.sort((a, b) =>
    (b.usersNeedingProcess + b.usersMissingPremium) - (a.usersNeedingProcess + a.usersMissingPremium)
  );
}

