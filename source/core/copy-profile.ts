/**
 * Copy Profile Operations
 * Port of copy_profile.py
 *
 * Clone a NextDNS profile to a new profile (same or different account).
 */

import type {NextDNSApi} from './api.js';
import type {
  ProfileData,
  ProfileSecurity,
  ProfilePrivacy,
  ProfileParentalControl,
  ProfileSettings,
  RewriteEntry,
  TldEntry,
  BlocklistEntry,
  NativeEntry,
  ServiceEntry,
  CategoryEntry,
  DomainEntry,
} from './types.js';

// Re-export for convenience
export {KNOWN_FIELDS, SKIPPED_FIELDS} from './types.js';

export interface CopyProfileOptions {
  sourceApiKey: string;
  destApiKey: string;
  sourceProfileId: string;
  force?: boolean;
}

export interface CopyStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  message?: string;
}

export interface CopyCallbacks {
  onStepStart?: (step: string) => void;
  onStepComplete?: (step: string, success: boolean, message?: string) => void;
  onWarning?: (warnings: string[]) => void;
}

export interface CopyResult {
  success: boolean;
  newProfileId?: string;
  verificationMismatches: string[];
  skippedFields: string[];
  schemaWarnings: string[];
}

/**
 * Validate API schema for unknown fields.
 * Matches Python: validate_api_schema()
 */
export function validateApiSchema(sourceData: ProfileData): string[] {
  const warnings: string[] = [];

  const KNOWN_FIELDS = {
    root: new Set([
      'id',
      'fingerprint',
      'name',
      'setup',
      'security',
      'privacy',
      'parentalControl',
      'denylist',
      'allowlist',
      'settings',
      'rewrites',
    ]),
    security: new Set([
      'threatIntelligenceFeeds',
      'aiThreatDetection',
      'googleSafeBrowsing',
      'cryptojacking',
      'dnsRebinding',
      'idnHomographs',
      'typosquatting',
      'dga',
      'nrd',
      'ddns',
      'parking',
      'csam',
      'tlds',
    ]),
    privacy: new Set([
      'disguisedTrackers',
      'allowAffiliate',
      'blocklists',
      'natives',
    ]),
    parentalControl: new Set([
      'safeSearch',
      'youtubeRestrictedMode',
      'blockBypass',
      'services',
      'categories',
      'recreation',
    ]),
    settings: new Set(['logs', 'blockPage', 'performance', 'web3', 'bav']),
    'settings.logs': new Set(['enabled', 'drop', 'retention', 'location']),
    'settings.performance': new Set(['ecs', 'cacheBoost', 'cnameFlattening']),
  };

  const SKIPPED_FIELDS = {
    root: new Set(['id', 'fingerprint', 'setup']),
    parentalControl: new Set(['recreation']),
  };

  const checkFields = (
    data: Record<string, unknown>,
    knownSet: Set<string>,
    skippedSet: Set<string>,
    path: string
  ): void => {
    if (typeof data !== 'object' || data === null) return;
    const unknown = Object.keys(data).filter(
      (k) => !knownSet.has(k) && !skippedSet.has(k)
    );
    if (unknown.length > 0) {
      warnings.push(`Unknown field(s) at '${path}': ${unknown.join(', ')}`);
    }
  };

  checkFields(
    sourceData as unknown as Record<string, unknown>,
    KNOWN_FIELDS.root,
    SKIPPED_FIELDS.root,
    'root'
  );

  if (sourceData.security) {
    checkFields(
      sourceData.security as unknown as Record<string, unknown>,
      KNOWN_FIELDS.security,
      new Set(),
      'security'
    );
  }

  if (sourceData.privacy) {
    checkFields(
      sourceData.privacy as unknown as Record<string, unknown>,
      KNOWN_FIELDS.privacy,
      new Set(),
      'privacy'
    );
  }

  if (sourceData.parentalControl) {
    checkFields(
      sourceData.parentalControl as unknown as Record<string, unknown>,
      KNOWN_FIELDS.parentalControl,
      SKIPPED_FIELDS.parentalControl,
      'parentalControl'
    );
  }

  if (sourceData.settings) {
    checkFields(
      sourceData.settings as unknown as Record<string, unknown>,
      KNOWN_FIELDS.settings,
      new Set(),
      'settings'
    );

    if (sourceData.settings.logs) {
      checkFields(
        sourceData.settings.logs as unknown as Record<string, unknown>,
        KNOWN_FIELDS['settings.logs'],
        new Set(),
        'settings.logs'
      );
    }

    if (sourceData.settings.performance) {
      checkFields(
        sourceData.settings.performance as unknown as Record<string, unknown>,
        KNOWN_FIELDS['settings.performance'],
        new Set(),
        'settings.performance'
      );
    }
  }

  return warnings;
}

/**
 * Reconstruct payload for creating a new profile.
 * Matches Python: reconstruct_payload()
 */
export function reconstructPayload(
  sourceData: ProfileData
): Partial<ProfileData> {
  const payload: Partial<ProfileData> = {};

  // Append " (Copy)" to avoid duplicate name errors
  const baseName = sourceData.name || 'Cloned Profile';
  payload.name = `${baseName} (Copy)`;

  if (sourceData.security) {
    const sec = sourceData.security;
    payload.security = {
      threatIntelligenceFeeds: sec.threatIntelligenceFeeds ?? true,
      aiThreatDetection: sec.aiThreatDetection ?? true,
      googleSafeBrowsing: sec.googleSafeBrowsing ?? true,
      cryptojacking: sec.cryptojacking ?? true,
      dnsRebinding: sec.dnsRebinding ?? true,
      idnHomographs: sec.idnHomographs ?? true,
      typosquatting: sec.typosquatting ?? true,
      dga: sec.dga ?? true,
      nrd: sec.nrd ?? true,
      ddns: sec.ddns ?? true,
      parking: sec.parking ?? true,
      csam: sec.csam ?? true,
    } as ProfileSecurity;

    if (sec.tlds) {
      payload.security.tlds = sec.tlds.map((t: TldEntry) => {
        return {id: t.id};
      });
    }
  }

  if (sourceData.privacy) {
    const priv = sourceData.privacy;
    payload.privacy = {
      disguisedTrackers: priv.disguisedTrackers ?? true,
      allowAffiliate: priv.allowAffiliate ?? true,
    } as ProfilePrivacy;

    if (priv.blocklists) {
      payload.privacy.blocklists = priv.blocklists.map((b: BlocklistEntry) => {
        return {id: b.id};
      });
    }
    if (priv.natives) {
      payload.privacy.natives = priv.natives.map((n: NativeEntry) => {
        return {id: n.id};
      });
    }
  }

  if (sourceData.parentalControl) {
    const pc = sourceData.parentalControl;
    payload.parentalControl = {
      safeSearch: pc.safeSearch ?? false,
      youtubeRestrictedMode: pc.youtubeRestrictedMode ?? false,
      blockBypass: pc.blockBypass ?? false,
    } as ProfileParentalControl;

    if (pc.services) {
      payload.parentalControl.services = pc.services.map((s: ServiceEntry) => {
        return {
          id: s.id,
          active: s.active ?? false,
        };
      });
    }
    if (pc.categories) {
      payload.parentalControl.categories = pc.categories.map(
        (c: CategoryEntry) => {
          return {
            id: c.id,
            active: c.active ?? false,
          };
        }
      );
    }
    // Note: 'recreation' field is returned by API but not documented for write operations
    // Uncommenting this will cause 500 errors on profile creation
  }

  if (sourceData.denylist) {
    payload.denylist = sourceData.denylist.map((d: DomainEntry) => {
      return {
        id: d.id,
        active: d.active ?? true,
      };
    });
  }

  if (sourceData.allowlist) {
    payload.allowlist = sourceData.allowlist.map((a: DomainEntry) => {
      return {
        id: a.id,
        active: a.active ?? true,
      };
    });
  }

  if (sourceData.settings) {
    payload.settings = {} as ProfileSettings;
    const srcSet = sourceData.settings;

    if (srcSet.logs) {
      payload.settings.logs = srcSet.logs;
    }
    if (srcSet.blockPage) {
      payload.settings.blockPage = srcSet.blockPage;
    }
    if (srcSet.performance) {
      payload.settings.performance = srcSet.performance;
    }
    if (srcSet.web3 !== undefined) {
      payload.settings.web3 = srcSet.web3;
    }
    if (srcSet.bav !== undefined) {
      payload.settings.bav = srcSet.bav;
    }
  }

  return payload;
}

/**
 * Copy rewrites from source to destination profile.
 * Matches Python: copy_rewrites()
 */
async function copyRewrites(
  api: NextDNSApi,
  sourceApiKey: string,
  destApiKey: string,
  sourceProfileId: string,
  destProfileId: string
): Promise<{success: boolean; message: string}> {
  // Fetch rewrites from source
  let rewrites: RewriteEntry[];
  try {
    rewrites = await api.getRewrites(sourceProfileId, sourceApiKey);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (error.includes('404')) {
      return {
        success: true,
        message: 'Rewrites endpoint not found or not supported',
      };
    }
    return {success: false, message: `Could not fetch rewrites: ${error}`};
  }

  if (!rewrites || rewrites.length === 0) {
    return {success: true, message: 'No rewrites found to copy'};
  }

  // Clean rewrites (remove id and type fields)
  const cleanRewrites = rewrites.map((r) => {
    return {
      name: r.name,
      content: r.content,
    };
  });

  // Try PUT first (bulk update)
  try {
    await api.putRewrites(destProfileId, cleanRewrites, destApiKey);
    return {
      success: true,
      message: `Copied ${rewrites.length} rewrites (PUT method)`,
    };
  } catch {
    // PUT failed, try POST one by one
    let count = 0;
    for (const rewrite of cleanRewrites) {
      try {
        await api.addRewrite(destProfileId, rewrite, destApiKey);
        count++;
      } catch {
        // Continue on individual failures
      }
    }
    return {
      success: count > 0,
      message: `Copied ${count}/${rewrites.length} rewrites (POST method)`,
    };
  }
}

/**
 * Verify that the clone matches the source.
 * Matches Python: verify_clone()
 */
async function verifyClone(
  api: NextDNSApi,
  sourceApiKey: string,
  destApiKey: string,
  sourceProfileId: string,
  destProfileId: string
): Promise<string[]> {
  const mismatches: string[] = [];

  // Fetch both profiles with rewrites
  let src: ProfileData & {rewrites?: RewriteEntry[]};
  let dst: ProfileData & {rewrites?: RewriteEntry[]};

  try {
    src = await api.getProfile(sourceProfileId, sourceApiKey);
    try {
      src.rewrites = await api.getRewrites(sourceProfileId, sourceApiKey);
    } catch {
      src.rewrites = [];
    }
  } catch {
    return ['Verification skipped: could not fetch source profile'];
  }

  try {
    dst = await api.getProfile(destProfileId, destApiKey);
    try {
      dst.rewrites = await api.getRewrites(destProfileId, destApiKey);
    } catch {
      dst.rewrites = [];
    }
  } catch {
    return ['Verification skipped: could not fetch destination profile'];
  }

  // Security settings
  const sSec = src.security;
  const dSec = dst.security;
  if (sSec && dSec) {
    const securityKeys: (keyof ProfileSecurity)[] = [
      'threatIntelligenceFeeds',
      'aiThreatDetection',
      'googleSafeBrowsing',
      'cryptojacking',
      'dnsRebinding',
      'idnHomographs',
      'typosquatting',
      'dga',
      'nrd',
      'ddns',
      'parking',
      'csam',
    ];
    for (const k of securityKeys) {
      if (sSec[k] !== dSec[k]) {
        mismatches.push(`Security '${k}': Source=${sSec[k]}, Dest=${dSec[k]}`);
      }
    }

    // Security TLDs
    const sTlds = new Set((sSec.tlds || []).map((t: TldEntry) => t.id));
    const dTlds = new Set((dSec.tlds || []).map((t: TldEntry) => t.id));
    const tldDiff = [...sTlds]
      .filter((x) => !dTlds.has(x))
      .concat([...dTlds].filter((x) => !sTlds.has(x)));
    if (tldDiff.length > 0) {
      mismatches.push(`Security TLDs mismatch. Diff: ${tldDiff.join(', ')}`);
    }
  }

  // Privacy settings
  const sPriv = src.privacy;
  const dPriv = dst.privacy;
  if (sPriv && dPriv) {
    for (const k of ['disguisedTrackers', 'allowAffiliate'] as const) {
      if (sPriv[k] !== dPriv[k]) {
        mismatches.push(`Privacy '${k}': Source=${sPriv[k]}, Dest=${dPriv[k]}`);
      }
    }

    // Blocklists
    const sBl = new Set(
      (sPriv.blocklists || []).map((x: BlocklistEntry) => x.id)
    );
    const dBl = new Set(
      (dPriv.blocklists || []).map((x: BlocklistEntry) => x.id)
    );
    const blDiff = [...sBl]
      .filter((x) => !dBl.has(x))
      .concat([...dBl].filter((x) => !sBl.has(x)));
    if (blDiff.length > 0) {
      mismatches.push(`Blocklists mismatch. Diff: ${blDiff.join(', ')}`);
    }

    // Natives
    const sNat = new Set((sPriv.natives || []).map((x: NativeEntry) => x.id));
    const dNat = new Set((dPriv.natives || []).map((x: NativeEntry) => x.id));
    const natDiff = [...sNat]
      .filter((x) => !dNat.has(x))
      .concat([...dNat].filter((x) => !sNat.has(x)));
    if (natDiff.length > 0) {
      mismatches.push(
        `Native blocklists mismatch. Diff: ${natDiff.join(', ')}`
      );
    }
  }

  // Parental Control
  const sPc = src.parentalControl;
  const dPc = dst.parentalControl;
  if (sPc && dPc) {
    for (const k of [
      'safeSearch',
      'youtubeRestrictedMode',
      'blockBypass',
    ] as const) {
      if (sPc[k] !== dPc[k]) {
        mismatches.push(
          `Parental Control '${k}': Source=${sPc[k]}, Dest=${dPc[k]}`
        );
      }
    }

    // Services
    const sSrv = Object.fromEntries(
      (sPc.services || []).map((x: ServiceEntry) => [x.id, x.active ?? false])
    );
    const dSrv = Object.fromEntries(
      (dPc.services || []).map((x: ServiceEntry) => [x.id, x.active ?? false])
    );
    if (JSON.stringify(sSrv) !== JSON.stringify(dSrv)) {
      mismatches.push('Parental Services mismatch');
    }

    // Categories
    const sCat = Object.fromEntries(
      (sPc.categories || []).map((x: CategoryEntry) => [
        x.id,
        x.active ?? false,
      ])
    );
    const dCat = Object.fromEntries(
      (dPc.categories || []).map((x: CategoryEntry) => [
        x.id,
        x.active ?? false,
      ])
    );
    if (JSON.stringify(sCat) !== JSON.stringify(dCat)) {
      mismatches.push('Parental Categories mismatch');
    }
  }

  // Note: 'recreation' field cannot be set via API, so we skip verification

  // Denylist and Allowlist
  for (const listType of ['denylist', 'allowlist'] as const) {
    const sL = Object.fromEntries(
      (src[listType] || []).map((x: DomainEntry) => [x.id, x.active ?? true])
    );
    const dL = Object.fromEntries(
      (dst[listType] || []).map((x: DomainEntry) => [x.id, x.active ?? true])
    );
    if (Object.keys(sL).length !== Object.keys(dL).length) {
      mismatches.push(
        `${listType} mismatch. Source count=${Object.keys(sL).length}, Dest count=${Object.keys(dL).length}`
      );
    }
  }

  // Settings
  const sSet = src.settings;
  const dSet = dst.settings;
  if (sSet && dSet) {
    for (const k of [
      'logs',
      'blockPage',
      'performance',
      'web3',
      'bav',
    ] as const) {
      if (JSON.stringify(sSet[k]) !== JSON.stringify(dSet[k])) {
        mismatches.push(`Settings '${k}' mismatch`);
      }
    }
  } else if (sSet || dSet) {
    mismatches.push(
      'Settings mismatch: one profile has settings, the other does not'
    );
  }

  // Rewrites
  const cleanRw = (rwList: RewriteEntry[]): Set<string> =>
    new Set(
      rwList.map((r) => JSON.stringify({name: r.name, content: r.content}))
    );
  const sRw = cleanRw(src.rewrites || []);
  const dRw = cleanRw(dst.rewrites || []);
  if (sRw.size !== dRw.size || ![...sRw].every((x) => dRw.has(x))) {
    mismatches.push(
      `Rewrites mismatch. Source count=${sRw.size}, Dest count=${dRw.size}`
    );
  }

  return mismatches;
}

/**
 * Get list of skipped fields.
 * Returns human-readable descriptions.
 */
function getSkippedFields(sourceData: ProfileData): string[] {
  const skipped: string[] = [];

  const SKIPPED_ROOT = ['id', 'fingerprint', 'setup'];
  for (const field of SKIPPED_ROOT) {
    if ((sourceData as unknown as Record<string, unknown>)[field]) {
      skipped.push(`${field}: Auto-generated by NextDNS for new profile`);
    }
  }

  if (sourceData.parentalControl?.recreation) {
    skipped.push(
      'parentalControl.recreation: Not supported by API for write operations'
    );
  }

  return skipped;
}

/**
 * Copy a profile to a new profile.
 * Main entry point matching Python main()
 */
export async function copyProfile(
  api: NextDNSApi,
  options: CopyProfileOptions,
  callbacks: CopyCallbacks = {}
): Promise<CopyResult> {
  const {sourceApiKey, destApiKey, sourceProfileId, force} = options;
  const {onStepStart, onStepComplete, onWarning} = callbacks;

  const result: CopyResult = {
    success: false,
    verificationMismatches: [],
    skippedFields: [],
    schemaWarnings: [],
  };

  // Step 1: Fetch source profile
  onStepStart?.('Fetch source profile');
  let sourceData: ProfileData;
  try {
    sourceData = await api.getProfile(sourceProfileId, sourceApiKey);
    onStepComplete?.(
      'Fetch source profile',
      true,
      `Fetched "${sourceData.name}"`
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    onStepComplete?.('Fetch source profile', false, error);
    return result;
  }

  // Validate schema
  const schemaWarnings = validateApiSchema(sourceData);
  result.schemaWarnings = schemaWarnings;

  if (schemaWarnings.length > 0) {
    onWarning?.(schemaWarnings);

    if (!force) {
      onStepComplete?.(
        'Schema validation',
        false,
        'Unknown fields detected. Use --force to proceed anyway.'
      );
      return result;
    }
  }

  // Step 2: Create new profile
  onStepStart?.('Create new profile');
  const payload = reconstructPayload(sourceData);
  let newProfileId: string;

  try {
    const newProfile = await api.createProfile(payload, destApiKey);
    newProfileId = newProfile.id;
    result.newProfileId = newProfileId;
    onStepComplete?.(
      'Create new profile',
      true,
      `Created profile: ${newProfileId}`
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    onStepComplete?.('Create new profile', false, error);
    return result;
  }

  // Step 3: Copy rewrites
  onStepStart?.('Copy rewrites');
  const rewriteResult = await copyRewrites(
    api,
    sourceApiKey,
    destApiKey,
    sourceProfileId,
    newProfileId
  );
  onStepComplete?.(
    'Copy rewrites',
    rewriteResult.success,
    rewriteResult.message
  );

  // Step 4: Verify clone
  onStepStart?.('Verify clone');
  const mismatches = await verifyClone(
    api,
    sourceApiKey,
    destApiKey,
    sourceProfileId,
    newProfileId
  );
  result.verificationMismatches = mismatches;

  if (mismatches.length === 0) {
    onStepComplete?.('Verify clone', true, 'Profile verified successfully');
  } else {
    onStepComplete?.(
      'Verify clone',
      false,
      `${mismatches.length} discrepancies found`
    );
  }

  // Get skipped fields
  result.skippedFields = getSkippedFields(sourceData);
  result.success = true;

  return result;
}
