/**
 * Diff Profiles Operations
 * Port of diff_profiles.py
 *
 * Visualize differences between NextDNS profiles in a table format.
 */

import type {NextDNSApi} from './api.js';
import type {Profile, ListType} from './types.js';

const sleep = (ms: number): Promise<unknown> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type DiffSection =
  | 'all'
  | 'security'
  | 'privacy'
  | 'parental'
  | 'settings'
  | 'lists';

export interface ProfileDiffData {
  name: string;
  denylist: Record<string, boolean>; // domain -> active
  allowlist: Record<string, boolean>;
  security: Record<string, unknown>;
  privacy: Record<string, unknown>;
  parentalControl: Record<string, unknown>;
  settings: Record<string, unknown>;
}

export interface DiffRow {
  label: string;
  values: Record<string, string>; // profileId -> formatted value
  hasDiff: boolean;
}

export interface DiffTable {
  title: string;
  legend?: string;
  rows: DiffRow[];
  diffCount: number;
}

export interface DiffResult {
  profileIds: string[];
  profileNames: Record<string, string>;
  tables: DiffTable[];
}

export interface DiffOptions {
  apiKey: string;
  profileIds?: string[];
  section: DiffSection;
  diffOnly?: boolean;
}

/**
 * Format a cell value for display.
 * Matches Python: format_cell()
 */
function formatValue(value: unknown, maxWidth = 12): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (value === true) {
    return '✓';
  }
  if (value === false) {
    return '✗';
  }
  if (Array.isArray(value)) {
    return String(value.length);
  }
  if (typeof value === 'object') {
    return '{...}';
  }
  const str = String(value);
  if (str.length > maxWidth) {
    return str.slice(0, maxWidth - 2) + '..';
  }
  return str;
}

/**
 * Normalize list values for comparison.
 * Matches Python: normalize_list_for_comparison()
 */
function normalizeListForComparison(val: unknown): string {
  if (!Array.isArray(val)) {
    return JSON.stringify(val);
  }
  if (val.length === 0) {
    return '[]';
  }
  // Extract IDs if list of dicts, otherwise use values directly
  if (typeof val[0] === 'object' && val[0] !== null) {
    const ids = val.map(
      (item: Record<string, unknown>) => item.id || String(item)
    );
    return JSON.stringify(ids.sort());
  }
  return JSON.stringify([...val].sort());
}

/**
 * Compare denylist or allowlist across profiles.
 * Matches Python: compare_denylist_allowlist()
 */
function compareDenylistAllowlist(
  allData: Record<string, ProfileDiffData>,
  listType: ListType
): DiffRow[] {
  const profileIds = Object.keys(allData);

  // Collect all domains
  const allDomains = new Set<string>();
  for (const pdata of Object.values(allData)) {
    Object.keys(pdata[listType]).forEach((d) => allDomains.add(d));
  }

  if (allDomains.size === 0) {
    return [];
  }

  const rows: DiffRow[] = [];

  for (const domain of Array.from(allDomains).sort()) {
    const values: Record<string, string> = {};
    const states: (boolean | null)[] = [];

    for (const pid of profileIds) {
      const state = allData[pid][listType][domain];
      if (state === undefined) {
        values[pid] = '-';
        states.push(null);
      } else if (state) {
        values[pid] = '✓';
        states.push(true);
      } else {
        values[pid] = '✗';
        states.push(false);
      }
    }

    // Check for differences (not all same)
    const nonNull = states.filter((s) => s !== null);
    const hasDiff =
      states.some((s) => s === null) ||
      (nonNull.length > 0 && !nonNull.every((s) => s === nonNull[0]));

    rows.push({label: domain, values, hasDiff});
  }

  return rows;
}

/**
 * Compare list items (blocklists, natives, services, categories).
 * Matches Python: compare_list_items()
 */
function compareListItems(
  allData: Record<string, ProfileDiffData>,
  sectionName: keyof ProfileDiffData,
  field: string,
  hasActiveField = false
): DiffRow[] {
  const profileIds = Object.keys(allData);

  // Collect all unique items
  const allItems = new Set<string>();
  for (const pid of profileIds) {
    const section = allData[pid][sectionName] as Record<string, unknown>;
    const items = section?.[field];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (typeof item === 'object' && item !== null) {
          allItems.add((item as Record<string, string>).id || String(item));
        } else {
          allItems.add(String(item));
        }
      }
    }
  }

  if (allItems.size === 0) {
    return [];
  }

  const rows: DiffRow[] = [];

  for (const itemId of Array.from(allItems).sort()) {
    const values: Record<string, string> = {};
    const states: (boolean | null)[] = [];

    for (const pid of profileIds) {
      const section = allData[pid][sectionName] as Record<string, unknown>;
      const items = section?.[field];
      const itemMap: Record<string, Record<string, unknown>> = {};

      if (Array.isArray(items)) {
        for (const item of items) {
          if (typeof item === 'object' && item !== null) {
            const obj = item as Record<string, unknown>;
            itemMap[String(obj.id || item)] = obj;
          } else {
            itemMap[String(item)] = {id: String(item)};
          }
        }
      }

      if (itemMap[itemId]) {
        if (hasActiveField) {
          const isActive = (itemMap[itemId] as Record<string, boolean>).active;
          values[pid] = isActive ? '✓' : '✗';
          states.push(isActive);
        } else {
          values[pid] = '✓';
          states.push(true);
        }
      } else {
        values[pid] = '-';
        states.push(null);
      }
    }

    const hasDiff = !states.every((s) => s === states[0]);
    rows.push({label: itemId, values, hasDiff});
  }

  return rows;
}

/**
 * Compare simple settings fields.
 * Matches Python: compare_settings()
 */
function compareSettings(
  allData: Record<string, ProfileDiffData>,
  sectionName: keyof ProfileDiffData,
  fields: string[]
): DiffRow[] {
  const profileIds = Object.keys(allData);
  const rows: DiffRow[] = [];

  for (const field of fields) {
    const values: Record<string, string> = {};
    const compareValues: string[] = [];

    for (const pid of profileIds) {
      const section = allData[pid][sectionName] as Record<string, unknown>;
      const val = section?.[field];
      values[pid] = formatValue(val);
      compareValues.push(normalizeListForComparison(val));
    }

    const hasDiff = !compareValues.every((v) => v === compareValues[0]);
    rows.push({label: field, values, hasDiff});
  }

  return rows;
}

/**
 * Compare nested settings (expands nested objects).
 * Matches Python: flatten_nested_settings() + compare_settings() combined
 */
function compareNestedSettings(
  allData: Record<string, ProfileDiffData>,
  sectionName: keyof ProfileDiffData,
  fields: string[]
): DiffRow[] {
  const profileIds = Object.keys(allData);
  const rows: DiffRow[] = [];

  // Get sample to discover nested structure
  const sampleSection = allData[profileIds[0]][sectionName] as Record<
    string,
    unknown
  >;

  for (const field of fields) {
    const fieldValue = sampleSection?.[field];

    if (
      typeof fieldValue === 'object' &&
      fieldValue !== null &&
      !Array.isArray(fieldValue)
    ) {
      // Nested object - expand each subfield
      for (const subfield of Object.keys(fieldValue).sort()) {
        const values: Record<string, string> = {};
        const compareValues: string[] = [];

        for (const pid of profileIds) {
          const section = allData[pid][sectionName] as Record<
            string,
            Record<string, unknown>
          >;
          const val = section?.[field]?.[subfield];
          values[pid] = formatValue(val);
          compareValues.push(normalizeListForComparison(val));
        }

        const hasDiff = !compareValues.every((v) => v === compareValues[0]);
        rows.push({label: `${field}.${subfield}`, values, hasDiff});
      }
    } else {
      // Flat field
      const values: Record<string, string> = {};
      const compareValues: string[] = [];

      for (const pid of profileIds) {
        const section = allData[pid][sectionName] as Record<string, unknown>;
        const val = section?.[field];
        values[pid] = formatValue(val);
        compareValues.push(normalizeListForComparison(val));
      }

      const hasDiff = !compareValues.every((v) => v === compareValues[0]);
      rows.push({label: field, values, hasDiff});
    }
  }

  return rows;
}

/**
 * Fetch and prepare profile data for comparison.
 */
async function fetchProfileData(
  api: NextDNSApi,
  apiKey: string,
  profiles: Profile[]
): Promise<Record<string, ProfileDiffData>> {
  const allData: Record<string, ProfileDiffData> = {};

  for (const profile of profiles) {
    await sleep(300); // Rate limiting
    const data = await api.getProfile(profile.id, apiKey);

    allData[profile.id] = {
      name: profile.name,
      denylist: Object.fromEntries(
        (data.denylist || []).map((d) => [d.id, d.active])
      ),
      allowlist: Object.fromEntries(
        (data.allowlist || []).map((d) => [d.id, d.active])
      ),
      security: (data.security || {}) as Record<string, unknown>,
      privacy: (data.privacy || {}) as Record<string, unknown>,
      parentalControl: (data.parentalControl || {}) as Record<string, unknown>,
      settings: (data.settings || {}) as Record<string, unknown>,
    };
  }

  return allData;
}

/**
 * Generate diff tables for all sections.
 * Matches Python main() logic
 */
function generateDiffTables(
  allData: Record<string, ProfileDiffData>,
  section: DiffSection,
  diffOnly: boolean
): DiffTable[] {
  const tables: DiffTable[] = [];

  const createTable = (
    title: string,
    rows: DiffRow[],
    legend?: string
  ): DiffTable | null => {
    const displayRows = diffOnly ? rows.filter((r) => r.hasDiff) : rows;
    if (displayRows.length === 0) {
      return null;
    }
    return {
      title,
      legend,
      rows: displayRows,
      diffCount: rows.filter((r) => r.hasDiff).length,
    };
  };

  // Security settings
  if (section === 'all' || section === 'security') {
    const securityFields = [
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
    const rows = compareSettings(allData, 'security', securityFields);
    const table = createTable('Security Settings', rows);
    if (table) tables.push(table);
  }

  // Privacy settings
  if (section === 'all' || section === 'privacy') {
    const privacyFields = ['disguisedTrackers', 'allowAffiliate'];
    let rows = compareSettings(allData, 'privacy', privacyFields);
    let table = createTable('Privacy Settings', rows);
    if (table) tables.push(table);

    // Blocklists detail
    rows = compareListItems(allData, 'privacy', 'blocklists');
    table = createTable('Blocklists', rows, 'Legend: ✓=enabled, -=not enabled');
    if (table) tables.push(table);

    // Natives detail
    rows = compareListItems(allData, 'privacy', 'natives');
    table = createTable(
      'Native Tracking Protection',
      rows,
      'Legend: ✓=enabled, -=not enabled'
    );
    if (table) tables.push(table);
  }

  // Parental Control settings
  if (section === 'all' || section === 'parental') {
    const parentalFields = [
      'safeSearch',
      'youtubeRestrictedMode',
      'blockBypass',
    ];
    let rows = compareSettings(allData, 'parentalControl', parentalFields);
    let table = createTable('Parental Control Settings', rows);
    if (table) tables.push(table);

    // Services detail
    rows = compareListItems(allData, 'parentalControl', 'services', true);
    table = createTable(
      'Blocked Services',
      rows,
      'Legend: ✓=blocked (active), ✗=in list but disabled, -=not in list'
    );
    if (table) tables.push(table);

    // Categories detail
    rows = compareListItems(allData, 'parentalControl', 'categories', true);
    table = createTable(
      'Blocked Categories',
      rows,
      'Legend: ✓=blocked (active), ✗=in list but disabled, -=not in list'
    );
    if (table) tables.push(table);
  }

  // General settings
  if (section === 'all' || section === 'settings') {
    const settingsFields = ['logs', 'blockPage', 'performance', 'web3'];
    const rows = compareNestedSettings(allData, 'settings', settingsFields);
    const table = createTable('General Settings', rows);
    if (table) tables.push(table);
  }

  // Denylist and Allowlist
  if (section === 'all' || section === 'lists') {
    let rows = compareDenylistAllowlist(allData, 'denylist');
    let table = createTable(
      'Denylist',
      rows,
      'Legend: ✓=enabled, ✗=disabled, -=missing'
    );
    if (table) tables.push(table);

    rows = compareDenylistAllowlist(allData, 'allowlist');
    table = createTable(
      'Allowlist',
      rows,
      'Legend: ✓=enabled, ✗=disabled, -=missing'
    );
    if (table) tables.push(table);
  }

  return tables;
}

/**
 * Main diff function.
 * Matches Python main()
 */
export async function diffProfiles(
  api: NextDNSApi,
  options: DiffOptions
): Promise<DiffResult> {
  const {apiKey, profileIds, section, diffOnly = false} = options;

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
    throw new Error('Need at least 2 profiles to compare');
  }

  // Fetch profile data
  const allData = await fetchProfileData(api, apiKey, profiles);

  // Generate diff tables
  const tables = generateDiffTables(allData, section, diffOnly);

  // Build result
  const profileNames: Record<string, string> = {};
  for (const [pid, pdata] of Object.entries(allData)) {
    profileNames[pid] = pdata.name;
  }

  return {
    profileIds: Object.keys(allData),
    profileNames,
    tables,
  };
}

/**
 * Format diff result as text table (for CLI).
 * Matches Python: print_table()
 */
export function formatDiffAsText(result: DiffResult): string {
  const {profileIds, profileNames, tables} = result;
  const lines: string[] = [];

  const colWidths = [32, ...profileIds.map(() => 14)];

  for (const table of tables) {
    lines.push('='.repeat(60));
    lines.push(table.title);
    if (table.diffCount > 0) {
      lines.push(
        `(${table.rows.length} total, ${table.diffCount} differences)`
      );
    }
    lines.push('='.repeat(60));

    if (table.legend) {
      lines.push(table.legend);
      lines.push('');
    }

    // Header row
    const headers = [
      'Setting',
      ...profileIds.map((pid) => profileNames[pid].slice(0, 12)),
    ];
    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
    lines.push(headerRow);
    lines.push(colWidths.map((w) => '-'.repeat(w)).join('-+-'));

    // Data rows
    for (const row of table.rows) {
      const cells = [
        row.label.slice(0, 30).padEnd(colWidths[0]),
        ...profileIds.map((pid, i) =>
          (row.values[pid] || '-')
            .toString()
            .padStart(Math.floor(colWidths[i + 1] / 2))
            .padEnd(colWidths[i + 1])
        ),
      ];
      const rowStr = cells.join(' | ');
      lines.push(row.hasDiff ? `* ${rowStr}` : `  ${rowStr}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
