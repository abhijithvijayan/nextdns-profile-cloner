'use client';

import {useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {api} from '@/lib/api';
import {Button} from '../Button';
import {Input} from '../Input';
import {Card, CardHeader} from '../Card';
import type {Profile, ListType, DomainAction} from '@/lib/types';
import styles from './ManageDomain.module.scss';

interface OperationResult {
  profileId: string;
  profileName: string;
  success: boolean;
  message: string;
}

export function ManageDomain() {
  const {profiles} = useAuth();
  const [domain, setDomain] = useState('');
  const [listType, setListType] = useState<ListType>('denylist');
  const [action, setAction] = useState<DomainAction>('add');
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<OperationResult[]>([]);
  const [error, setError] = useState('');

  const handleSelectAll = () => {
    if (selectedProfiles.length === profiles.length) {
      setSelectedProfiles([]);
    } else {
      setSelectedProfiles(profiles.map((p) => p.id));
    }
  };

  const handleProfileToggle = (profileId: string) => {
    setSelectedProfiles((prev) =>
      prev.includes(profileId)
        ? prev.filter((id) => id !== profileId)
        : [...prev, profileId]
    );
  };

  const performAction = async (profile: Profile): Promise<OperationResult> => {
    try {
      switch (action) {
        case 'add':
          await api.addDomain(profile.id, domain, listType, true);
          return {
            profileId: profile.id,
            profileName: profile.name,
            success: true,
            message: 'Added successfully',
          };

        case 'remove':
          await api.removeDomain(profile.id, domain, listType);
          return {
            profileId: profile.id,
            profileName: profile.name,
            success: true,
            message: 'Removed successfully',
          };

        case 'enable':
          await api.updateDomainStatus(profile.id, domain, listType, true);
          return {
            profileId: profile.id,
            profileName: profile.name,
            success: true,
            message: 'Enabled successfully',
          };

        case 'disable':
          await api.updateDomainStatus(profile.id, domain, listType, false);
          return {
            profileId: profile.id,
            profileName: profile.name,
            success: true,
            message: 'Disabled successfully',
          };
      }
    } catch (err) {
      return {
        profileId: profile.id,
        profileName: profile.name,
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResults([]);

    if (!domain.trim()) {
      setError('Please enter a domain');
      return;
    }

    if (selectedProfiles.length === 0) {
      setError('Please select at least one profile');
      return;
    }

    const targetProfiles = profiles.filter((p) =>
      selectedProfiles.includes(p.id)
    );

    setIsRunning(true);

    const operationResults: OperationResult[] = [];

    for (const profile of targetProfiles) {
      const result = await performAction(profile);
      operationResults.push(result);
      setResults([...operationResults]);
    }

    setIsRunning(false);
  };

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <div className={styles.container}>
      <Card>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formRow}>
            <Input
              label="Domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              error={error}
              fullWidth
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>List Type</label>
              <div className={styles.radioGroup}>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="listType"
                    value="denylist"
                    checked={listType === 'denylist'}
                    onChange={() => setListType('denylist')}
                  />
                  <span>Denylist (Block)</span>
                </label>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="listType"
                    value="allowlist"
                    checked={listType === 'allowlist'}
                    onChange={() => setListType('allowlist')}
                  />
                  <span>Allowlist (Allow)</span>
                </label>
              </div>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Action</label>
              <div className={styles.actionButtons}>
                {(['add', 'remove', 'enable', 'disable'] as DomainAction[]).map(
                  (act) => (
                    <button
                      key={act}
                      type="button"
                      className={`${styles.actionButton} ${
                        action === act ? styles.active : ''
                      }`}
                      onClick={() => setAction(act)}
                    >
                      {act.charAt(0).toUpperCase() + act.slice(1)}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.fieldGroup}>
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
            </div>
          </div>

          <div className={styles.formActions}>
            <Button
              type="submit"
              isLoading={isRunning}
              disabled={selectedProfiles.length === 0}
              size="large"
            >
              {isRunning
                ? `Processing... (${results.length}/${selectedProfiles.length})`
                : `${action.charAt(0).toUpperCase() + action.slice(1)} Domain`}
            </Button>
          </div>
        </form>
      </Card>

      {results.length > 0 && (
        <Card className={styles.results}>
          <CardHeader
            title="Results"
            description={`${successCount} succeeded, ${failCount} failed`}
          />
          <div className={styles.resultsList}>
            {results.map((result) => (
              <div
                key={result.profileId}
                className={`${styles.resultItem} ${
                  result.success ? styles.success : styles.failure
                }`}
              >
                <div className={styles.resultProfile}>
                  <span className={styles.resultName}>
                    {result.profileName}
                  </span>
                  <span className={styles.resultId}>{result.profileId}</span>
                </div>
                <span className={styles.resultStatus}>
                  {result.success ? '✓' : '✗'} {result.message}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
