/**
 * NextDNS API Types
 * Shared between CLI and Web
 */

export interface Profile {
  id: string;
  fingerprint?: string;
  name: string;
}

export interface DomainEntry {
  id: string;
  active: boolean;
}

export interface BlocklistEntry {
  id: string;
}

export interface NativeEntry {
  id: string;
}

export interface ServiceEntry {
  id: string;
  active: boolean;
}

export interface CategoryEntry {
  id: string;
  active: boolean;
}

export interface TldEntry {
  id: string;
}

export interface RewriteEntry {
  id?: string;
  name: string;
  content: string;
  type?: string;
}

export interface ProfileSecurity {
  threatIntelligenceFeeds: boolean;
  aiThreatDetection: boolean;
  googleSafeBrowsing: boolean;
  cryptojacking: boolean;
  dnsRebinding: boolean;
  idnHomographs: boolean;
  typosquatting: boolean;
  dga: boolean;
  nrd: boolean;
  ddns: boolean;
  parking: boolean;
  csam: boolean;
  tlds?: TldEntry[];
}

export interface ProfilePrivacy {
  blocklists?: BlocklistEntry[];
  natives?: NativeEntry[];
  disguisedTrackers: boolean;
  allowAffiliate: boolean;
}

export interface ProfileParentalControl {
  safeSearch: boolean;
  youtubeRestrictedMode: boolean;
  blockBypass: boolean;
  services?: ServiceEntry[];
  categories?: CategoryEntry[];
  recreation?: unknown;
}

export interface ProfileSettings {
  logs?: {
    enabled: boolean;
    drop?: {
      ip: boolean;
      domain: boolean;
    };
    retention?: number;
    location?: string;
  };
  blockPage?: {
    enabled: boolean;
  };
  performance?: {
    ecs: boolean;
    cacheBoost: boolean;
    cnameFlattening: boolean;
    handshake?: boolean;
  };
  web3?: boolean;
  bav?: boolean;
}

export interface ProfileData {
  id: string;
  fingerprint?: string;
  name: string;
  setup?: unknown;
  security?: ProfileSecurity;
  privacy?: ProfilePrivacy;
  parentalControl?: ProfileParentalControl;
  denylist?: DomainEntry[];
  allowlist?: DomainEntry[];
  settings?: ProfileSettings;
  rewrites?: RewriteEntry[];
}

export type ListType = 'allowlist' | 'denylist';

export type DomainAction = 'add' | 'remove' | 'enable' | 'disable';

export interface ApiError {
  code: string;
  message?: string;
}

export interface ApiResponse<T> {
  data?: T;
  errors?: ApiError[];
}

// Operation result types for CLI/Web feedback
export interface OperationResult {
  profileId: string;
  profileName: string;
  success: boolean;
  error?: string;
}

export interface SyncOperation {
  type: 'add' | 'update';
  profileId: string;
  profileName: string;
  domain: string;
  shouldBeActive: boolean;
  listType: ListType;
}

export interface DiffRow {
  label: string;
  values: Map<string, string>;
  hasDiff: boolean;
}

export interface DiffSection {
  title: string;
  rows: DiffRow[];
  legend?: string;
}

// Known fields for schema validation (from Python)
export const KNOWN_FIELDS = {
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
} as const;

export const SKIPPED_FIELDS = {
  root: new Set(['id', 'fingerprint', 'setup']),
  parentalControl: new Set(['recreation']),
} as const;
