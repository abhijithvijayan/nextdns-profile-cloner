/**
 * Manage Domain Operations
 * Port of manage_domain.py
 *
 * Manages domains in allowlist/denylist across NextDNS profiles.
 */

import type {NextDNSApi} from './api.js';
import type {
  Profile,
  ListType,
  DomainAction,
  OperationResult,
} from './types.js';

export interface ManageDomainOptions {
  apiKey: string;
  domain: string;
  listType: ListType;
  action: DomainAction;
  profileIds?: string[]; // If not provided, operates on all profiles
}

export interface ManageDomainCallbacks {
  onProgress?: (result: OperationResult) => void;
}

/**
 * Add a domain to a profile's allowlist or denylist.
 * Matches Python: add_domain_to_list()
 */
async function addDomainToList(
  api: NextDNSApi,
  apiKey: string,
  profileId: string,
  domain: string,
  listType: ListType,
  active = true
): Promise<{success: boolean; error?: string}> {
  try {
    await api.addDomain(profileId, domain, listType, active, apiKey);
    return {success: true};
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {success: false, error};
  }
}

/**
 * Enable or disable a domain in a profile's allowlist or denylist.
 * Matches Python: update_domain_status()
 */
async function updateDomainStatus(
  api: NextDNSApi,
  apiKey: string,
  profileId: string,
  domain: string,
  listType: ListType,
  active: boolean
): Promise<{success: boolean; error?: string}> {
  try {
    await api.updateDomainStatus(profileId, domain, listType, active, apiKey);
    return {success: true};
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Match Python: 404 returns "not found"
    if (error.includes('404') || error.toLowerCase().includes('not found')) {
      return {success: false, error: 'not found'};
    }
    return {success: false, error};
  }
}

/**
 * Remove a domain from a profile's allowlist or denylist.
 * Matches Python: remove_domain_from_list()
 */
async function removeDomainFromList(
  api: NextDNSApi,
  apiKey: string,
  profileId: string,
  domain: string,
  listType: ListType
): Promise<{success: boolean; error?: string}> {
  try {
    await api.removeDomain(profileId, domain, listType, apiKey);
    return {success: true};
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Match Python: 404 is success with note "not found (already removed)"
    if (error.includes('404') || error.toLowerCase().includes('not found')) {
      return {success: true, error: 'not found (already removed)'};
    }
    return {success: false, error};
  }
}

/**
 * Manage a domain across profiles.
 * Main entry point matching Python main() logic.
 */
export async function manageDomain(
  api: NextDNSApi,
  options: ManageDomainOptions,
  callbacks: ManageDomainCallbacks = {}
): Promise<{
  results: OperationResult[];
  successCount: number;
  failCount: number;
}> {
  const {apiKey, domain, listType, action, profileIds} = options;
  const {onProgress} = callbacks;

  // Get target profiles
  let profiles: Profile[];
  if (profileIds && profileIds.length > 0) {
    const allProfiles = await api.getProfiles(apiKey);
    profiles = allProfiles.filter((p) => profileIds.includes(p.id));

    // If specific profile IDs provided but none found
    if (profiles.length === 0) {
      throw new Error(
        `None of the specified profiles found: ${profileIds.join(', ')}`
      );
    }
  } else {
    profiles = await api.getProfiles(apiKey);
  }

  if (profiles.length === 0) {
    throw new Error('No profiles found');
  }

  const results: OperationResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const profile of profiles) {
    let result: {success: boolean; error?: string};

    switch (action) {
      case 'add':
        result = await addDomainToList(
          api,
          apiKey,
          profile.id,
          domain,
          listType
        );
        break;
      case 'remove':
        result = await removeDomainFromList(
          api,
          apiKey,
          profile.id,
          domain,
          listType
        );
        break;
      case 'enable':
        result = await updateDomainStatus(
          api,
          apiKey,
          profile.id,
          domain,
          listType,
          true
        );
        break;
      case 'disable':
        result = await updateDomainStatus(
          api,
          apiKey,
          profile.id,
          domain,
          listType,
          false
        );
        break;
    }

    const operationResult: OperationResult = {
      profileId: profile.id,
      profileName: profile.name,
      success: result.success,
      error: result.error,
    };

    results.push(operationResult);

    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }

    // Notify callback
    onProgress?.(operationResult);
  }

  return {results, successCount, failCount};
}

/**
 * Get all profiles for an API key.
 * Convenience wrapper matching Python: get_all_profiles()
 */
export async function getAllProfiles(
  api: NextDNSApi,
  apiKey: string
): Promise<Profile[]> {
  return api.getProfiles(apiKey);
}
