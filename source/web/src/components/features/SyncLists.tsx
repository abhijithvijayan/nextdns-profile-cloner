'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Button } from '../Button';
import { Card, CardHeader } from '../Card';
import type { ListType } from '@/lib/types';
import styles from './SyncLists.module.scss';

interface ProfileDataMap {
  [profileId: string]: {
    name: string;
    denylist: Record<string, boolean>;
    allowlist: Record<string, boolean>;
  };
}

interface SyncOperation {
  type: 'add' | 'update';
  profileId: string;
  profileName: string;
  domain: string;
  shouldBeActive: boolean;
  listType: ListType;
  status?: 'pending' | 'success' | 'failed';
  error?: string;
}

interface SyncPreview {
  denylist: { toAdd: SyncOperation[]; toUpdate: SyncOperation[] };
  allowlist: { toAdd: SyncOperation[]; toUpdate: SyncOperation[] };
  canonical: {
    denylist: Record<string, boolean>;
    allowlist: Record<string, boolean>;
  };
}

type SyncTarget = 'both' | 'denylist' | 'allowlist';

const DELAY_MS = 500;
const RATE_LIMIT_DELAY_MS = 2000;
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ProgressState {
  phase: 'fetching' | 'calculating';
  current: number;
  total: number;
  currentProfileName?: string;
}

interface RateLimitState {
  isRateLimited: boolean;
  retryCount: number;
  waitingUntil?: number;
}

export function SyncLists() {
  const { profiles } = useAuth();
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [syncTarget, setSyncTarget] = useState<SyncTarget>('both');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [operations, setOperations] = useState<SyncOperation[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [error, setError] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState<ProgressState | null>(null);
  const [currentOperation, setCurrentOperation] = useState<SyncOperation | null>(null);
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>({
    isRateLimited: false,
    retryCount: 0,
  });

  const handleProfileToggle = (profileId: string) => {
    setSelectedProfiles((prev) =>
      prev.includes(profileId)
        ? prev.filter((id) => id !== profileId)
        : [...prev, profileId]
    );
    setPreview(null);
  };

  const handleSelectAll = () => {
    if (selectedProfiles.length === profiles.length) {
      setSelectedProfiles([]);
    } else {
      setSelectedProfiles(profiles.map((p) => p.id));
    }
    setPreview(null);
  };

  const getCanonicalDomains = (
    allData: ProfileDataMap,
    listType: ListType
  ): Record<string, boolean> => {
    const domainStates: Record<string, { enabled: number; disabled: number }> = {};

    for (const pdata of Object.values(allData)) {
      for (const [domain, active] of Object.entries(pdata[listType])) {
        if (!domainStates[domain]) {
          domainStates[domain] = { enabled: 0, disabled: 0 };
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
      // Majority wins, enabled wins ties
      canonical[domain] = counts.enabled >= counts.disabled;
    }
    return canonical;
  };

  const calculateSyncOperations = (
    allData: ProfileDataMap,
    canonical: Record<string, boolean>,
    listType: ListType
  ): { toAdd: SyncOperation[]; toUpdate: SyncOperation[] } => {
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
            status: 'pending',
          });
        } else if (currentState !== shouldBeActive) {
          toUpdate.push({
            type: 'update',
            profileId,
            profileName: pdata.name,
            domain,
            shouldBeActive,
            listType,
            status: 'pending',
          });
        }
      }
    }

    return { toAdd, toUpdate };
  };

  const analyzeSync = async () => {
    setError('');
    setPreview(null);
    setOperations([]);
    setAnalysisProgress(null);

    const targetProfiles =
      selectedProfiles.length > 0
        ? profiles.filter((p) => selectedProfiles.includes(p.id))
        : profiles;

    if (targetProfiles.length < 2) {
      setError('Need at least 2 profiles to sync');
      return;
    }

    setIsAnalyzing(true);

    try {
      const allData: ProfileDataMap = {};

      // Fetch profile data with progress tracking
      for (let i = 0; i < targetProfiles.length; i++) {
        const profile = targetProfiles[i];
        setAnalysisProgress({
          phase: 'fetching',
          current: i + 1,
          total: targetProfiles.length,
          currentProfileName: profile.name,
        });

        const data = await api.getProfile(profile.id);
        allData[profile.id] = {
          name: profile.name,
          denylist: Object.fromEntries(
            (data.denylist || []).map((d) => [d.id, d.active])
          ),
          allowlist: Object.fromEntries(
            (data.allowlist || []).map((d) => [d.id, d.active])
          ),
        };
      }

      // Update progress to calculating phase
      setAnalysisProgress({
        phase: 'calculating',
        current: targetProfiles.length,
        total: targetProfiles.length,
      });

      const denylistCanonical = getCanonicalDomains(allData, 'denylist');
      const allowlistCanonical = getCanonicalDomains(allData, 'allowlist');

      const denylistOps = calculateSyncOperations(allData, denylistCanonical, 'denylist');
      const allowlistOps = calculateSyncOperations(allData, allowlistCanonical, 'allowlist');

      setPreview({
        denylist: denylistOps,
        allowlist: allowlistOps,
        canonical: {
          denylist: denylistCanonical,
          allowlist: allowlistCanonical,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze profiles');
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  const executeSync = async () => {
    if (!preview) return;

    const allOperations: SyncOperation[] = [];

    if (syncTarget === 'both' || syncTarget === 'denylist') {
      allOperations.push(...preview.denylist.toAdd, ...preview.denylist.toUpdate);
    }
    if (syncTarget === 'both' || syncTarget === 'allowlist') {
      allOperations.push(...preview.allowlist.toAdd, ...preview.allowlist.toUpdate);
    }

    if (allOperations.length === 0) {
      setError('Nothing to sync - all profiles are already in sync');
      return;
    }

    setOperations(allOperations);
    setCompletedCount(0);
    setIsSyncing(true);
    setCurrentOperation(null);
    setRateLimitState({ isRateLimited: false, retryCount: 0 });

    for (let i = 0; i < allOperations.length; i++) {
      const op = allOperations[i];

      // Set current operation for live progress display
      setCurrentOperation(op);

      let success = false;
      let lastError: string | undefined;

      // Retry loop for rate limiting
      for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
        try {
          if (op.type === 'add') {
            await api.addDomain(op.profileId, op.domain, op.listType, op.shouldBeActive);
          } else {
            await api.updateDomainStatus(op.profileId, op.domain, op.listType, op.shouldBeActive);
          }
          success = true;
          setRateLimitState({ isRateLimited: false, retryCount: 0 });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          lastError = errorMessage;

          // Check for rate limit error
          const isRateLimit = errorMessage.toLowerCase().includes('ratelimit') ||
                              errorMessage.includes('429') ||
                              errorMessage.toLowerCase().includes('too many');

          if (isRateLimit && attempt < MAX_RETRIES - 1) {
            // Show rate limit state and wait
            setRateLimitState({
              isRateLimited: true,
              retryCount: attempt + 1,
              waitingUntil: Date.now() + RATE_LIMIT_DELAY_MS,
            });
            await sleep(RATE_LIMIT_DELAY_MS);
          } else if (!isRateLimit) {
            // Non-rate-limit error, don't retry
            break;
          }
        }
      }

      if (success) {
        setOperations((prev) =>
          prev.map((o, idx) => (idx === i ? { ...o, status: 'success' } : o))
        );
      } else {
        setOperations((prev) =>
          prev.map((o, idx) =>
            idx === i
              ? { ...o, status: 'failed', error: lastError }
              : o
          )
        );
      }

      setCompletedCount(i + 1);

      // Rate limiting delay between requests
      if (i < allOperations.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    setIsSyncing(false);
    setCurrentOperation(null);
    setRateLimitState({ isRateLimited: false, retryCount: 0 });
    setPreview(null);
  };

  const totalOps =
    preview
      ? (syncTarget === 'both' || syncTarget === 'denylist'
          ? preview.denylist.toAdd.length + preview.denylist.toUpdate.length
          : 0) +
        (syncTarget === 'both' || syncTarget === 'allowlist'
          ? preview.allowlist.toAdd.length + preview.allowlist.toUpdate.length
          : 0)
      : 0;

  const estimatedTime = totalOps > 0 ? ((totalOps * DELAY_MS) / 60000).toFixed(1) : '0';

  const successCount = operations.filter((o) => o.status === 'success').length;
  const failCount = operations.filter((o) => o.status === 'failed').length;

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader
          title="Sync Configuration"
          description="Synchronize domain lists across profiles using majority voting"
        />

        <div className={styles.info}>
          <h4>How it works</h4>
          <ul>
            <li>Domains are synced based on <strong>majority voting</strong></li>
            <li>If a domain is enabled in most profiles, it will be enabled everywhere</li>
            <li>If there&apos;s a tie, enabled state wins</li>
            <li>Missing domains will be added to profiles that don&apos;t have them</li>
          </ul>
        </div>

        <div className={styles.section}>
          <div className={styles.profileHeader}>
            <label className={styles.sectionLabel}>
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

        <div className={styles.section}>
          <label className={styles.sectionLabel}>List to Sync</label>
          <div className={styles.syncOptions}>
            {(['both', 'denylist', 'allowlist'] as SyncTarget[]).map((target) => (
              <label key={target} className={styles.radioOption}>
                <input
                  type="radio"
                  name="syncTarget"
                  value={target}
                  checked={syncTarget === target}
                  onChange={() => setSyncTarget(target)}
                />
                <span>{target === 'both' ? 'Both Lists' : target.charAt(0).toUpperCase() + target.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button
            onClick={analyzeSync}
            isLoading={isAnalyzing}
            variant="secondary"
            disabled={selectedProfiles.length < 2}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze Changes'}
          </Button>
        </div>
      </Card>

      {/* Analysis Progress Card */}
      {isAnalyzing && analysisProgress && (
        <Card>
          <CardHeader
            title="Analyzing Profiles"
            description={
              analysisProgress.phase === 'fetching'
                ? `Fetching profile data (${analysisProgress.current}/${analysisProgress.total})`
                : 'Calculating sync operations...'
            }
          />
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${(analysisProgress.current / analysisProgress.total) * 100}%`,
                }}
              />
            </div>
            <div className={styles.progressDetails}>
              {analysisProgress.phase === 'fetching' && analysisProgress.currentProfileName && (
                <div className={styles.currentAction}>
                  <span className={styles.actionLabel}>Fetching:</span>
                  <span className={styles.actionValue}>{analysisProgress.currentProfileName}</span>
                </div>
              )}
              {analysisProgress.phase === 'calculating' && (
                <div className={styles.currentAction}>
                  <span className={styles.actionLabel}>Status:</span>
                  <span className={styles.actionValue}>Comparing domain lists...</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader
            title="Sync Preview"
            description={`${totalOps} operations to perform (~${estimatedTime} min)`}
          />

          {(syncTarget === 'both' || syncTarget === 'denylist') && (
            <div className={styles.listPreview}>
              <h4>
                Denylist
                <span className={styles.counts}>
                  {preview.denylist.toAdd.length} to add, {preview.denylist.toUpdate.length} to update
                </span>
              </h4>
              {preview.denylist.toAdd.length + preview.denylist.toUpdate.length > 0 ? (
                <div className={styles.operationsList}>
                  {[...preview.denylist.toAdd, ...preview.denylist.toUpdate].slice(0, 20).map((op, i) => (
                    <div key={`deny-${i}`} className={styles.operationItem}>
                      <span className={styles.opType}>{op.type === 'add' ? 'ADD' : 'UPD'}</span>
                      <span className={styles.opProfile}>{op.profileName}</span>
                      <span className={styles.opDomain}>{op.domain}</span>
                      <span className={`${styles.opStatus} ${op.shouldBeActive ? styles.enabled : styles.disabled}`}>
                        {op.shouldBeActive ? 'enable' : 'disable'}
                      </span>
                    </div>
                  ))}
                  {preview.denylist.toAdd.length + preview.denylist.toUpdate.length > 20 && (
                    <p className={styles.more}>
                      ...and {preview.denylist.toAdd.length + preview.denylist.toUpdate.length - 20} more
                    </p>
                  )}
                </div>
              ) : (
                <p className={styles.noChanges}>No changes needed</p>
              )}
            </div>
          )}

          {(syncTarget === 'both' || syncTarget === 'allowlist') && (
            <div className={styles.listPreview}>
              <h4>
                Allowlist
                <span className={styles.counts}>
                  {preview.allowlist.toAdd.length} to add, {preview.allowlist.toUpdate.length} to update
                </span>
              </h4>
              {preview.allowlist.toAdd.length + preview.allowlist.toUpdate.length > 0 ? (
                <div className={styles.operationsList}>
                  {[...preview.allowlist.toAdd, ...preview.allowlist.toUpdate].slice(0, 20).map((op, i) => (
                    <div key={`allow-${i}`} className={styles.operationItem}>
                      <span className={styles.opType}>{op.type === 'add' ? 'ADD' : 'UPD'}</span>
                      <span className={styles.opProfile}>{op.profileName}</span>
                      <span className={styles.opDomain}>{op.domain}</span>
                      <span className={`${styles.opStatus} ${op.shouldBeActive ? styles.enabled : styles.disabled}`}>
                        {op.shouldBeActive ? 'enable' : 'disable'}
                      </span>
                    </div>
                  ))}
                  {preview.allowlist.toAdd.length + preview.allowlist.toUpdate.length > 20 && (
                    <p className={styles.more}>
                      ...and {preview.allowlist.toAdd.length + preview.allowlist.toUpdate.length - 20} more
                    </p>
                  )}
                </div>
              ) : (
                <p className={styles.noChanges}>No changes needed</p>
              )}
            </div>
          )}

          <div className={styles.syncActions}>
            <Button
              onClick={executeSync}
              isLoading={isSyncing}
              disabled={totalOps === 0}
              size="large"
            >
              {isSyncing
                ? `Syncing... (${completedCount}/${totalOps})`
                : `Execute Sync (${totalOps} operations)`}
            </Button>
          </div>
        </Card>
      )}

      {/* Live Sync Progress Card */}
      {isSyncing && (
        <Card>
          <CardHeader
            title="Sync in Progress"
            description={`${completedCount} of ${totalOps} operations completed`}
          />
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div
                className={`${styles.progressFill} ${rateLimitState.isRateLimited ? styles.progressPaused : ''}`}
                style={{
                  width: `${totalOps > 0 ? (completedCount / totalOps) * 100 : 0}%`,
                }}
              />
            </div>
            {rateLimitState.isRateLimited && (
              <div className={styles.rateLimitWarning}>
                <span className={styles.rateLimitIcon}>⏳</span>
                <span>Rate limited - retrying (attempt {rateLimitState.retryCount}/{MAX_RETRIES})...</span>
              </div>
            )}
            {currentOperation && (
              <div className={styles.progressDetails}>
                <div className={styles.currentAction}>
                  <span className={styles.actionLabel}>Current:</span>
                  <span className={styles.actionValue}>
                    {currentOperation.type === 'add' ? 'Adding' : 'Updating'}{' '}
                    <strong>{currentOperation.domain}</strong>
                  </span>
                </div>
                <div className={styles.currentAction}>
                  <span className={styles.actionLabel}>Profile:</span>
                  <span className={styles.actionValue}>{currentOperation.profileName}</span>
                </div>
                <div className={styles.currentAction}>
                  <span className={styles.actionLabel}>List:</span>
                  <span className={styles.actionValue}>
                    {currentOperation.listType === 'denylist' ? 'Denylist' : 'Allowlist'}
                  </span>
                </div>
              </div>
            )}
            <div className={styles.recentResults}>
              <span className={styles.recentLabel}>Recent:</span>
              <div className={styles.recentItems}>
                {operations
                  .filter((op) => op.status === 'success' || op.status === 'failed')
                  .slice(-5)
                  .map((op, i) => (
                    <span
                      key={i}
                      className={`${styles.recentItem} ${
                        op.status === 'success' ? styles.recentSuccess : styles.recentFailed
                      }`}
                      title={`${op.domain} - ${op.profileName}`}
                    >
                      {op.status === 'success' ? '✓' : '✗'}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {operations.length > 0 && !isSyncing && (
        <Card>
          <CardHeader
            title="Sync Results"
            description={`${successCount} succeeded, ${failCount} failed`}
          />
          <div className={styles.results}>
            {operations.map((op, i) => (
              <div
                key={i}
                className={`${styles.resultItem} ${
                  op.status === 'success' ? styles.success : op.status === 'failed' ? styles.failure : ''
                }`}
              >
                <span className={styles.resultType}>{op.type === 'add' ? 'ADD' : 'UPD'}</span>
                <span className={styles.resultProfile}>{op.profileName}</span>
                <span className={styles.resultDomain}>{op.domain}</span>
                <span className={styles.resultStatus}>
                  {op.status === 'success' ? '✓' : op.status === 'failed' ? `✗ ${op.error}` : '...'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
