'use client';

import {useState, useCallback} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {api} from '@/lib/api';
import {Button} from '../Button';
import {Card, CardHeader} from '../Card';
import type {Profile, ProfileData} from '@/lib/types';
import styles from './DiffProfiles.module.scss';

type Section =
  | 'all'
  | 'security'
  | 'privacy'
  | 'parental'
  | 'settings'
  | 'lists';

interface ProfileDataMap {
  [profileId: string]: {
    name: string;
    denylist: Record<string, boolean>;
    allowlist: Record<string, boolean>;
    security: Record<string, unknown>;
    privacy: Record<string, unknown>;
    parentalControl: Record<string, unknown>;
    settings: Record<string, unknown>;
  };
}

interface ComparisonRow {
  label: string;
  values: (string | boolean | null)[];
  hasDiff: boolean;
}

const SECTIONS: {id: Section; label: string}[] = [
  {id: 'all', label: 'All'},
  {id: 'security', label: 'Security'},
  {id: 'privacy', label: 'Privacy'},
  {id: 'parental', label: 'Parental Control'},
  {id: 'settings', label: 'Settings'},
  {id: 'lists', label: 'Lists'},
];

export function DiffProfiles() {
  const {profiles} = useAuth();
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [section, setSection] = useState<Section>('all');
  const [diffOnly, setDiffOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileDataMap | null>(null);
  const [error, setError] = useState('');

  const handleProfileToggle = (profileId: string) => {
    setSelectedProfiles((prev) =>
      prev.includes(profileId)
        ? prev.filter((id) => id !== profileId)
        : [...prev, profileId]
    );
  };

  const handleSelectAll = () => {
    if (selectedProfiles.length === profiles.length) {
      setSelectedProfiles([]);
    } else {
      setSelectedProfiles(profiles.map((p) => p.id));
    }
  };

  const fetchData = async () => {
    setError('');

    if (selectedProfiles.length < 2) {
      setError('Please select at least 2 profiles to compare');
      return;
    }

    const targetProfiles = profiles.filter((p) =>
      selectedProfiles.includes(p.id)
    );

    setIsLoading(true);

    try {
      const dataMap: ProfileDataMap = {};

      for (const profile of targetProfiles) {
        const data = await api.getProfile(profile.id);
        dataMap[profile.id] = {
          name: profile.name,
          denylist: Object.fromEntries(
            (data.denylist || []).map((d) => [d.id, d.active])
          ),
          allowlist: Object.fromEntries(
            (data.allowlist || []).map((d) => [d.id, d.active])
          ),
          security: (data.security || {}) as unknown as Record<string, unknown>,
          privacy: (data.privacy || {}) as unknown as Record<string, unknown>,
          parentalControl: (data.parentalControl || {}) as unknown as Record<
            string,
            unknown
          >,
          settings: (data.settings || {}) as unknown as Record<string, unknown>,
        };
      }

      setProfileData(dataMap);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch profile data'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const formatValue = (val: unknown): string => {
    if (val === true) return '✓';
    if (val === false) return '✗';
    if (val === null || val === undefined) return '-';
    if (Array.isArray(val)) return String(val.length);
    if (typeof val === 'object') return '{...}';
    return String(val);
  };

  const compareSettings = useCallback(
    (sectionName: string, fields: string[]): ComparisonRow[] => {
      if (!profileData) return [];

      const profileIds = Object.keys(profileData);
      const rows: ComparisonRow[] = [];

      for (const field of fields) {
        const values: (string | boolean | null)[] = [];
        const rawValues: unknown[] = [];

        for (const pid of profileIds) {
          const sectionData = profileData[pid][
            sectionName as keyof (typeof profileData)[string]
          ] as Record<string, unknown>;
          const val = sectionData?.[field];
          values.push(formatValue(val));
          rawValues.push(val);
        }

        const hasDiff = !rawValues.every(
          (v) => JSON.stringify(v) === JSON.stringify(rawValues[0])
        );
        rows.push({label: field, values, hasDiff});
      }

      return rows;
    },
    [profileData]
  );

  const compareNestedSettings = useCallback(
    (sectionName: string, fields: string[]): ComparisonRow[] => {
      if (!profileData) return [];

      const profileIds = Object.keys(profileData);
      const rows: ComparisonRow[] = [];

      for (const field of fields) {
        const sampleSection = profileData[profileIds[0]][
          sectionName as keyof (typeof profileData)[string]
        ] as Record<string, unknown>;
        const fieldValue = sampleSection?.[field];

        if (
          typeof fieldValue === 'object' &&
          fieldValue !== null &&
          !Array.isArray(fieldValue)
        ) {
          // Nested object - expand each subfield
          for (const subfield of Object.keys(fieldValue)) {
            const values: (string | boolean | null)[] = [];
            const rawValues: unknown[] = [];

            for (const pid of profileIds) {
              const sectionData = profileData[pid][
                sectionName as keyof (typeof profileData)[string]
              ] as Record<string, Record<string, unknown>>;
              const val = sectionData?.[field]?.[subfield];
              values.push(formatValue(val));
              rawValues.push(val);
            }

            const hasDiff = !rawValues.every(
              (v) => JSON.stringify(v) === JSON.stringify(rawValues[0])
            );
            rows.push({label: `${field}.${subfield}`, values, hasDiff});
          }
        } else {
          // Flat field
          const values: (string | boolean | null)[] = [];
          const rawValues: unknown[] = [];

          for (const pid of profileIds) {
            const sectionData = profileData[pid][
              sectionName as keyof (typeof profileData)[string]
            ] as Record<string, unknown>;
            const val = sectionData?.[field];
            values.push(formatValue(val));
            rawValues.push(val);
          }

          const hasDiff = !rawValues.every(
            (v) => JSON.stringify(v) === JSON.stringify(rawValues[0])
          );
          rows.push({label: field, values, hasDiff});
        }
      }

      return rows;
    },
    [profileData]
  );

  const compareLists = useCallback(
    (listType: 'denylist' | 'allowlist'): ComparisonRow[] => {
      if (!profileData) return [];

      const profileIds = Object.keys(profileData);
      const allDomains = new Set<string>();

      for (const pid of profileIds) {
        Object.keys(profileData[pid][listType]).forEach((d) =>
          allDomains.add(d)
        );
      }

      const rows: ComparisonRow[] = [];

      for (const domain of Array.from(allDomains).sort()) {
        const values: (string | null)[] = [];
        const states: (boolean | null)[] = [];

        for (const pid of profileIds) {
          const state = profileData[pid][listType][domain];
          if (state === undefined) {
            values.push('-');
            states.push(null);
          } else if (state) {
            values.push('✓');
            states.push(true);
          } else {
            values.push('✗');
            states.push(false);
          }
        }

        const hasDiff = !states.every((s) => s === states[0]);
        rows.push({label: domain, values, hasDiff});
      }

      return rows;
    },
    [profileData]
  );

  const compareListItems = useCallback(
    (
      sectionName: string,
      field: string,
      hasActiveField = false
    ): ComparisonRow[] => {
      if (!profileData) return [];

      const profileIds = Object.keys(profileData);
      const allItems = new Set<string>();

      for (const pid of profileIds) {
        const sectionData = profileData[pid][
          sectionName as keyof (typeof profileData)[string]
        ] as Record<string, unknown[]>;
        const items = sectionData?.[field] || [];
        if (Array.isArray(items)) {
          items.forEach((item) => {
            if (typeof item === 'object' && item !== null) {
              allItems.add((item as Record<string, string>).id || String(item));
            } else {
              allItems.add(String(item));
            }
          });
        }
      }

      const rows: ComparisonRow[] = [];

      for (const itemId of Array.from(allItems).sort()) {
        const values: string[] = [];
        const states: (boolean | null)[] = [];

        for (const pid of profileIds) {
          const sectionData = profileData[pid][
            sectionName as keyof (typeof profileData)[string]
          ] as Record<string, unknown[]>;
          const items = sectionData?.[field] || [];
          const itemMap: Record<string, Record<string, unknown>> = {};

          if (Array.isArray(items)) {
            items.forEach((item) => {
              if (typeof item === 'object' && item !== null) {
                const obj = item as Record<string, unknown>;
                itemMap[String(obj.id || item)] = obj;
              } else {
                itemMap[String(item)] = {id: String(item)};
              }
            });
          }

          if (itemMap[itemId]) {
            if (hasActiveField) {
              const isActive = (itemMap[itemId] as Record<string, boolean>)
                .active;
              values.push(isActive ? '✓' : '✗');
              states.push(isActive);
            } else {
              values.push('✓');
              states.push(true);
            }
          } else {
            values.push('-');
            states.push(null);
          }
        }

        const hasDiff = !states.every((s) => s === states[0]);
        rows.push({label: itemId, values, hasDiff});
      }

      return rows;
    },
    [profileData]
  );

  const renderTable = (
    title: string,
    rows: ComparisonRow[],
    legend?: string
  ) => {
    if (!profileData) return null;

    const displayRows = diffOnly ? rows.filter((r) => r.hasDiff) : rows;
    if (displayRows.length === 0) return null;

    const profileIds = Object.keys(profileData);
    const diffCount = rows.filter((r) => r.hasDiff).length;

    return (
      <div className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h3>{title}</h3>
          <span className={styles.stats}>
            {rows.length} total{diffCount > 0 && `, ${diffCount} differences`}
          </span>
        </div>
        {legend && <p className={styles.legend}>{legend}</p>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.labelCell}>Setting</th>
                {profileIds.map((pid) => (
                  <th key={pid} className={styles.valueCell}>
                    {profileData[pid].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr
                  key={row.label}
                  className={row.hasDiff ? styles.diffRow : ''}
                >
                  <td className={styles.labelCell}>{row.label}</td>
                  {row.values.map((val, i) => (
                    <td key={i} className={styles.valueCell}>
                      <span
                        className={`${styles.value} ${
                          val === '✓'
                            ? styles.enabled
                            : val === '✗'
                              ? styles.disabled
                              : ''
                        }`}
                      >
                        {val}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderComparisons = () => {
    if (!profileData) return null;

    return (
      <div className={styles.comparisons}>
        {(section === 'all' || section === 'security') &&
          renderTable(
            'Security Settings',
            compareSettings('security', [
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
            ])
          )}

        {(section === 'all' || section === 'privacy') && (
          <>
            {renderTable(
              'Privacy Settings',
              compareSettings('privacy', [
                'disguisedTrackers',
                'allowAffiliate',
              ])
            )}
            {renderTable(
              'Blocklists',
              compareListItems('privacy', 'blocklists'),
              'Legend: ✓ = enabled, - = not configured'
            )}
            {renderTable(
              'Native Tracking Protection',
              compareListItems('privacy', 'natives'),
              'Legend: ✓ = enabled, - = not configured'
            )}
          </>
        )}

        {(section === 'all' || section === 'parental') && (
          <>
            {renderTable(
              'Parental Control Settings',
              compareSettings('parentalControl', [
                'safeSearch',
                'youtubeRestrictedMode',
                'blockBypass',
              ])
            )}
            {renderTable(
              'Blocked Services',
              compareListItems('parentalControl', 'services', true),
              'Legend: ✓ = active (blocking), ✗ = inactive, - = not configured'
            )}
            {renderTable(
              'Blocked Categories',
              compareListItems('parentalControl', 'categories', true),
              'Legend: ✓ = active (blocking), ✗ = inactive, - = not configured'
            )}
          </>
        )}

        {(section === 'all' || section === 'settings') &&
          renderTable(
            'General Settings',
            compareNestedSettings('settings', [
              'logs',
              'blockPage',
              'performance',
              'web3',
            ])
          )}

        {(section === 'all' || section === 'lists') && (
          <>
            {renderTable(
              'Denylist',
              compareLists('denylist'),
              'Legend: ✓ = active, ✗ = inactive, - = not in list'
            )}
            {renderTable(
              'Allowlist',
              compareLists('allowlist'),
              'Legend: ✓ = active, ✗ = inactive, - = not in list'
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader
          title="Compare Profiles"
          description="Select at least 2 profiles to compare"
        />

        <div className={styles.profileHeader}>
          <label className={styles.label}>
            Target Profiles
            <span className={styles.hint}>
              ({selectedProfiles.length} selected)
            </span>
          </label>
          <button
            type="button"
            className={styles.selectAllButton}
            onClick={handleSelectAll}
          >
            {selectedProfiles.length === profiles.length
              ? 'Deselect All'
              : 'Select All'}
          </button>
        </div>

        <div className={styles.profileGrid}>
          {profiles.map((profile) => (
            <label key={profile.id} className={styles.profileCheckbox}>
              <input
                type="checkbox"
                checked={selectedProfiles.includes(profile.id)}
                onChange={() => handleProfileToggle(profile.id)}
              />
              <span className={styles.profileInfo}>
                <span className={styles.profileName}>{profile.name}</span>
                <span className={styles.profileId}>{profile.id}</span>
              </span>
            </label>
          ))}
        </div>

        <div className={styles.options}>
          <div className={styles.sectionFilter}>
            <label>Section:</label>
            <div className={styles.sectionButtons}>
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  className={`${styles.sectionButton} ${section === s.id ? styles.active : ''}`}
                  onClick={() => setSection(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={diffOnly}
              onChange={(e) => setDiffOnly(e.target.checked)}
            />
            <span>Show differences only</span>
          </label>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button
            onClick={fetchData}
            isLoading={isLoading}
            disabled={selectedProfiles.length < 2}
            size="large"
          >
            {isLoading ? 'Loading...' : 'Compare Profiles'}
          </Button>
        </div>
      </Card>

      {renderComparisons()}
    </div>
  );
}
