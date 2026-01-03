/**
 * Sync Lists Operations
 * Port of sync_lists.py
 *
 * Sync denylist and allowlist domains across all NextDNS profiles.
 * Uses majority voting to determine canonical state for each domain.
 */

import type {NextDNSApi} from './api.js';
import type {Profile, ListType, SyncOperation} from './types.js';

const DELAY_MS = 500; // 500ms between requests (matches Python DELAY = 0.5)

export interface ProfileListData {
  name: string;
  denylist: Record<string, boolean>; // domain -> active
  allowlist: Record<string, boolean>;
}

export interface SyncAnalysis {
  denylist: {
    canonical: Record<string, boolean>;
    toAdd: SyncOperation[];
    toUpdate: SyncOperation[];
  };
  allowlist: {
    canonical: Record<string, boolean>;
    toAdd: SyncOperation[];
    toUpdate: SyncOperation[];
  };
  totalUniqueInDenylist: number;
  totalUniqueInAllowlist: number;
  estimatedTimeMinutes: number;
}

export type SyncTarget = 'both' | 'denylist' | 'allowlist';

export interface SyncListsOptions {
  apiKey: string;
  listType: SyncTarget;
  profileIds?: string[];
  dryRun?: boolean;
}

export interface SyncResult {
  operation: SyncOperation;
  success: boolean;
  error?: string;
}

export interface SyncCallbacks {
  onProgress?: (result: SyncResult, completed: number, total: number) => void;
  onAnalysisComplete?: (analysis: SyncAnalysis) => void;
}

const sleep = (ms: number): Promise<unknown> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rate limited request with retry logic.
 * Matches Python: rate_limited_request()
 */
async function rateLimitedRequest<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await fn();
      await sleep(DELAY_MS);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Check for rate limit
      if (lastError.message.includes('rateLimit')) {
        await sleep(2000); // Wait longer if rate limited
      } else {
        throw lastError;
      }
    }
  }

  throw lastError;
}

/**
 * Fetch profile data including denylist and allowlist.
 * Matches Python: get_profile_data()
 */
async function getProfileListData(
  api: NextDNSApi,
  apiKey: string,
  profileId: string
): Promise<ProfileListData | null> {
  try {
    const data = await api.getProfile(profileId, apiKey);
    return {
      name: data.name,
      denylist: Object.fromEntries(
        (data.denylist || []).map((d) => [d.id, d.active])
      ),
      allowlist: Object.fromEntries(
        (data.allowlist || []).map((d) => [d.id, d.active])
      ),
    };
  } catch (err) {
    console.error(`Error fetching profile ${profileId}:`, err);
    return null;
  }
}

/**
 * Determine canonical state for each domain (majority wins, enabled if tie).
 * Matches Python: get_canonical_domains()
 */
export function getCanonicalDomains(
  allData: Record<string, ProfileListData>,
  listType: ListType
): Record<string, boolean> {
  const domainStates: Record<string, {enabled: number; disabled: number}> = {};

  for (const pdata of Object.values(allData)) {
    for (const [domain, active] of Object.entries(pdata[listType])) {
      if (!domainStates[domain]) {
        domainStates[domain] = {enabled: 0, disabled: 0};
      }
      if (active) {
        domainStates[domain].enabled++;
      } else {
        domainStates[domain].disabled++;
      }
    }
  }

  const canonical: Record<string, boolean> = {};
  for (const [domain, counts] of Object.entries(domainStates)) {
    // Majority wins, enabled wins ties (matches Python)
    canonical[domain] = counts.enabled >= counts.disabled;
  }

  return canonical;
}

/**
 * Calculate sync operations needed.
 * Matches Python logic in sync_list()
 */
function calculateSyncOperations(
  allData: Record<string, ProfileListData>,
  canonical: Record<string, boolean>,
  listType: ListType
): {toAdd: SyncOperation[]; toUpdate: SyncOperation[]} {
  const toAdd: SyncOperation[] = [];
  const toUpdate: SyncOperation[] = [];

  for (const [domain, shouldBeActive] of Object.entries(canonical)) {
    for (const [profileId, pdata] of Object.entries(allData)) {
      const currentState = pdata[listType][domain];

      if (currentState === undefined) {
        toAdd.push({
          type: 'add',
          profileId,
          profileName: pdata.name,
          domain,
          shouldBeActive,
          listType,
        });
      } else if (currentState !== shouldBeActive) {
        toUpdate.push({
          type: 'update',
          profileId,
          profileName: pdata.name,
          domain,
          shouldBeActive,
          listType,
        });
      }
    }
  }

  return {toAdd, toUpdate};
}

/**
 * Analyze what sync operations are needed.
 * Returns analysis without executing changes.
 */
export async function analyzeSync(
  api: NextDNSApi,
  options: Pick<SyncListsOptions, 'apiKey' | 'profileIds'>
): Promise<{allData: Record<string, ProfileListData>; analysis: SyncAnalysis}> {
  const {apiKey, profileIds} = options;

  // Get all profiles
  let profiles: Profile[] = await api.getProfiles(apiKey);

  // Filter to specified profiles if provided
  if (profileIds && profileIds.length > 0) {
    profiles = profiles.filter((p) => profileIds.includes(p.id));
    if (profiles.length === 0) {
      throw new Error(
        `None of the specified profiles found: ${profileIds.join(', ')}`
      );
    }
  }

  if (profiles.length < 2) {
    throw new Error('Need at least 2 profiles to sync');
  }

  // Fetch profile data
  const allData: Record<string, ProfileListData> = {};

  for (const profile of profiles) {
    await sleep(300); // Rate limiting between profile fetches
    const data = await getProfileListData(api, apiKey, profile.id);
    if (data) {
      allData[profile.id] = data;
    }
  }

  // Calculate canonical state
  const denylistCanonical = getCanonicalDomains(allData, 'denylist');
  const allowlistCanonical = getCanonicalDomains(allData, 'allowlist');

  // Calculate operations
  const denylistOps = calculateSyncOperations(
    allData,
    denylistCanonical,
    'denylist'
  );
  const allowlistOps = calculateSyncOperations(
    allData,
    allowlistCanonical,
    'allowlist'
  );

  // Calculate total operations for time estimate
  const totalOps =
    denylistOps.toAdd.length +
    denylistOps.toUpdate.length +
    allowlistOps.toAdd.length +
    allowlistOps.toUpdate.length;
  const estimatedTimeMinutes = (totalOps * DELAY_MS) / 60000;

  const analysis: SyncAnalysis = {
    denylist: {
      canonical: denylistCanonical,
      toAdd: denylistOps.toAdd,
      toUpdate: denylistOps.toUpdate,
    },
    allowlist: {
      canonical: allowlistCanonical,
      toAdd: allowlistOps.toAdd,
      toUpdate: allowlistOps.toUpdate,
    },
    totalUniqueInDenylist: Object.keys(denylistCanonical).length,
    totalUniqueInAllowlist: Object.keys(allowlistCanonical).length,
    estimatedTimeMinutes,
  };

  return {allData, analysis};
}

/**
 * Execute sync operations.
 * Matches Python: sync_list() when not dry_run
 */
export async function executeSync(
  api: NextDNSApi,
  options: SyncListsOptions,
  analysis: SyncAnalysis,
  callbacks: SyncCallbacks = {}
): Promise<{
  addSuccess: number;
  addFail: number;
  updateSuccess: number;
  updateFail: number;
  results: SyncResult[];
}> {
  const {apiKey, listType, dryRun} = options;
  const {onProgress} = callbacks;

  if (dryRun) {
    return {
      addSuccess: 0,
      addFail: 0,
      updateSuccess: 0,
      updateFail: 0,
      results: [],
    };
  }

  const results: SyncResult[] = [];
  let addSuccess = 0;
  let addFail = 0;
  let updateSuccess = 0;
  let updateFail = 0;

  // Collect operations based on target
  const operations: SyncOperation[] = [];

  if (listType === 'both' || listType === 'denylist') {
    operations.push(...analysis.denylist.toAdd, ...analysis.denylist.toUpdate);
  }
  if (listType === 'both' || listType === 'allowlist') {
    operations.push(
      ...analysis.allowlist.toAdd,
      ...analysis.allowlist.toUpdate
    );
  }

  const total = operations.length;

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    let success = false;
    let error: string | undefined;

    try {
      if (op.type === 'add') {
        await rateLimitedRequest(async () => {
          await api.addDomain(
            op.profileId,
            op.domain,
            op.listType,
            op.shouldBeActive,
            apiKey
          );
        });
        addSuccess++;
        success = true;
      } else {
        await rateLimitedRequest(async () => {
          await api.updateDomainStatus(
            op.profileId,
            op.domain,
            op.listType,
            op.shouldBeActive,
            apiKey
          );
        });
        updateSuccess++;
        success = true;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (op.type === 'add') {
        addFail++;
      } else {
        updateFail++;
      }
    }

    const result: SyncResult = {operation: op, success, error};
    results.push(result);
    onProgress?.(result, i + 1, total);
  }

  return {addSuccess, addFail, updateSuccess, updateFail, results};
}

/**
 * Full sync operation - analyze and execute.
 * Main entry point matching Python main()
 */
export async function syncLists(
  api: NextDNSApi,
  options: SyncListsOptions,
  callbacks: SyncCallbacks = {}
): Promise<{
  analysis: SyncAnalysis;
  results: SyncResult[];
  addSuccess: number;
  addFail: number;
  updateSuccess: number;
  updateFail: number;
}> {
  const {onAnalysisComplete} = callbacks;

  // Analyze first
  const {analysis} = await analyzeSync(api, {
    apiKey: options.apiKey,
    profileIds: options.profileIds,
  });

  onAnalysisComplete?.(analysis);

  // Execute if not dry run
  const execResult = await executeSync(api, options, analysis, callbacks);

  return {
    analysis,
    ...execResult,
  };
}
