'use client';

import {useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {api} from '@/lib/api';
import {Button} from '../Button';
import {Input} from '../Input';
import {Card, CardHeader} from '../Card';
import {reconstructPayload} from '@/lib/types';
import styles from './CopyProfile.module.scss';

interface CopyResult {
  step: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  message?: string;
}

type DestinationType = 'same' | 'different';

export function CopyProfile() {
  const {profiles, apiKey} = useAuth();
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [destinationType, setDestinationType] =
    useState<DestinationType>('same');
  const [destApiKey, setDestApiKey] = useState('');
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [destKeyValid, setDestKeyValid] = useState<boolean | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [results, setResults] = useState<CopyResult[]>([]);
  const [newProfileId, setNewProfileId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const validateDestKey = async () => {
    if (!destApiKey.trim()) {
      setError('Please enter a destination API key');
      return;
    }

    setIsValidatingKey(true);
    setError('');

    const isValid = await api.validateApiKey(destApiKey.trim());
    setDestKeyValid(isValid);

    if (!isValid) {
      setError('Invalid destination API key');
    }

    setIsValidatingKey(false);
  };

  const updateResult = (index: number, update: Partial<CopyResult>) => {
    setResults((prev) =>
      prev.map((r, i) => (i === index ? {...r, ...update} : r))
    );
  };

  const copyProfile = async () => {
    if (!selectedProfileId) {
      setError('Please select a profile to copy');
      return;
    }

    if (destinationType === 'different' && !destKeyValid) {
      setError('Please validate the destination API key first');
      return;
    }

    setError('');
    setNewProfileId(null);

    const steps: CopyResult[] = [
      {step: 'Fetch source profile', status: 'pending'},
      {step: 'Create new profile', status: 'pending'},
      {step: 'Copy rewrites', status: 'pending'},
      {step: 'Verify clone', status: 'pending'},
    ];
    setResults(steps);
    setIsCopying(true);

    const targetApiKey =
      destinationType === 'different' ? destApiKey.trim() : apiKey!;

    try {
      // Step 1: Fetch source profile
      updateResult(0, {status: 'running'});
      const sourceData = await api.getProfile(selectedProfileId);
      updateResult(0, {
        status: 'success',
        message: `Fetched "${sourceData.name}"`,
      });

      // Step 2: Create new profile
      updateResult(1, {status: 'running'});
      const payload = reconstructPayload(sourceData);
      const newProfile = await api.createProfile(payload, targetApiKey);
      const newId = newProfile.id;
      setNewProfileId(newId);
      updateResult(1, {
        status: 'success',
        message: `Created profile: ${newId}`,
      });

      // Step 3: Copy rewrites
      updateResult(2, {status: 'running'});
      try {
        const rewrites = await api.getRewrites(selectedProfileId);
        if (rewrites.length > 0) {
          let copiedCount = 0;
          for (const rewrite of rewrites) {
            try {
              await api.addRewrite(
                newId,
                {name: rewrite.name, content: rewrite.content},
                targetApiKey
              );
              copiedCount++;
            } catch {
              // Continue on individual failures
            }
          }
          updateResult(2, {
            status: 'success',
            message: `Copied ${copiedCount}/${rewrites.length} rewrites`,
          });
        } else {
          updateResult(2, {status: 'success', message: 'No rewrites to copy'});
        }
      } catch {
        updateResult(2, {status: 'success', message: 'No rewrites found'});
      }

      // Step 4: Verify
      updateResult(3, {status: 'running'});
      const newData = await api.getProfile(newId, targetApiKey);

      const mismatches: string[] = [];

      // Quick verification of key fields
      if (sourceData.security && newData.security) {
        const securityFields = [
          'threatIntelligenceFeeds',
          'aiThreatDetection',
          'googleSafeBrowsing',
        ] as const;
        for (const field of securityFields) {
          if (sourceData.security[field] !== newData.security[field]) {
            mismatches.push(`Security ${field}`);
          }
        }
      }

      if (sourceData.denylist?.length !== newData.denylist?.length) {
        mismatches.push('Denylist count mismatch');
      }

      if (sourceData.allowlist?.length !== newData.allowlist?.length) {
        mismatches.push('Allowlist count mismatch');
      }

      if (mismatches.length > 0) {
        updateResult(3, {
          status: 'failed',
          message: `Verification issues: ${mismatches.join(', ')}`,
        });
      } else {
        updateResult(3, {
          status: 'success',
          message: 'Profile verified successfully',
        });
      }
    } catch (err) {
      const currentRunning = results.findIndex((r) => r.status === 'running');
      if (currentRunning >= 0) {
        updateResult(currentRunning, {
          status: 'failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader
          title="Clone a Profile"
          description="Copy all settings from one profile to create a new one"
        />

        <div className={styles.section}>
          <label className={styles.sectionLabel}>Source Profile</label>
          <div className={styles.profileGrid}>
            {profiles.map((profile) => (
              <label
                key={profile.id}
                className={`${styles.profileRadio} ${
                  selectedProfileId === profile.id ? styles.selected : ''
                }`}
              >
                <input
                  type="radio"
                  name="sourceProfile"
                  value={profile.id}
                  checked={selectedProfileId === profile.id}
                  onChange={() => setSelectedProfileId(profile.id)}
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
          <label className={styles.sectionLabel}>Destination Account</label>
          <div className={styles.destOptions}>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="destType"
                value="same"
                checked={destinationType === 'same'}
                onChange={() => {
                  setDestinationType('same');
                  setDestKeyValid(null);
                  setDestApiKey('');
                }}
              />
              <span>Same account (create copy in current account)</span>
            </label>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="destType"
                value="different"
                checked={destinationType === 'different'}
                onChange={() => setDestinationType('different')}
              />
              <span>Different account (copy to another NextDNS account)</span>
            </label>
          </div>

          {destinationType === 'different' && (
            <div className={styles.destKeyInput}>
              <Input
                label="Destination Account API Key"
                type="password"
                value={destApiKey}
                onChange={(e) => {
                  setDestApiKey(e.target.value);
                  setDestKeyValid(null);
                }}
                placeholder="Enter API key for destination account"
                fullWidth
              />
              <div className={styles.validateRow}>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={validateDestKey}
                  isLoading={isValidatingKey}
                >
                  Validate Key
                </Button>
                {destKeyValid === true && (
                  <span className={styles.validBadge}>Valid</span>
                )}
                {destKeyValid === false && (
                  <span className={styles.invalidBadge}>Invalid</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={styles.whatsCopied}>
          <h4>What gets copied:</h4>
          <ul>
            <li>Security settings (threat protection, etc.)</li>
            <li>Privacy settings (blocklists, native tracking protection)</li>
            <li>Parental controls (services, categories)</li>
            <li>Denylist and Allowlist</li>
            <li>General settings (logs, performance, etc.)</li>
            <li>DNS rewrites</li>
          </ul>
          <p className={styles.note}>
            <strong>Note:</strong> Profile ID, fingerprint, and setup
            instructions are auto-generated for the new profile. The
            &quot;recreation&quot; parental control field cannot be copied via
            API.
          </p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button
            onClick={copyProfile}
            isLoading={isCopying}
            disabled={
              !selectedProfileId ||
              (destinationType === 'different' && !destKeyValid)
            }
            size="large"
          >
            {isCopying ? 'Copying...' : 'Clone Profile'}
          </Button>
        </div>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader
            title="Copy Progress"
            description={
              newProfileId ? `New profile ID: ${newProfileId}` : 'Working...'
            }
          />

          <div className={styles.steps}>
            {results.map((result, index) => (
              <div
                key={index}
                className={`${styles.step} ${styles[result.status]}`}
              >
                <span className={styles.stepIcon}>
                  {result.status === 'pending' && '○'}
                  {result.status === 'running' && '◐'}
                  {result.status === 'success' && '✓'}
                  {result.status === 'failed' && '✗'}
                </span>
                <div className={styles.stepContent}>
                  <span className={styles.stepName}>{result.step}</span>
                  {result.message && (
                    <span className={styles.stepMessage}>{result.message}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {newProfileId && !isCopying && (
            <div className={styles.success}>
              <h4>Profile cloned successfully!</h4>
              <p>
                New profile ID: <code>{newProfileId}</code>
              </p>
              {destinationType === 'same' && (
                <p>
                  You can now configure the profile at{' '}
                  <a
                    href={`https://my.nextdns.io/${newProfileId}/setup`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    my.nextdns.io/{newProfileId}/setup
                  </a>
                </p>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
