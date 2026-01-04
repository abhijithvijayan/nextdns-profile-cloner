/**
 * Sync Lists Command
 * Port of sync_lists.py CLI interface
 */

import {Command} from 'commander';
import {
  NextDNSApi,
  syncLists,
  analyzeSync,
  type SyncTarget,
  type SyncAnalysis,
  type SyncResult,
} from '../../../core/index.js';

function printAnalysis(analysis: SyncAnalysis, listType: SyncTarget): void {
  console.log(
    `\nTotal unique denylist domains: ${analysis.totalUniqueInDenylist}`
  );
  console.log(
    `Total unique allowlist domains: ${analysis.totalUniqueInAllowlist}`
  );

  let totalOps = 0;
  if (listType === 'both' || listType === 'denylist') {
    totalOps +=
      analysis.denylist.toAdd.length + analysis.denylist.toUpdate.length;
  }
  if (listType === 'both' || listType === 'allowlist') {
    totalOps +=
      analysis.allowlist.toAdd.length + analysis.allowlist.toUpdate.length;
  }

  if (totalOps > 0) {
    console.log(
      `\nEstimated time: ~${analysis.estimatedTimeMinutes.toFixed(1)} minutes`
    );
  }
}

function printDryRunPreview(
  analysis: SyncAnalysis,
  listType: SyncTarget
): void {
  if (listType === 'both' || listType === 'denylist') {
    const denyOps = [...analysis.denylist.toAdd, ...analysis.denylist.toUpdate];
    console.log(
      `\nDENYLIST: ${analysis.denylist.toAdd.length} to add, ${analysis.denylist.toUpdate.length} to update`
    );

    if (denyOps.length > 0) {
      console.log('\nWould sync in denylist:');
      for (const op of denyOps.slice(0, 20)) {
        const status = op.shouldBeActive ? 'enabled' : 'disabled';
        const opType = op.type === 'add' ? 'ADD' : 'UPD';
        console.log(
          `  ${opType} [${op.profileName.slice(0, 15).padEnd(15)}] ${op.domain} (${status})`
        );
      }
      if (denyOps.length > 20) {
        console.log(`  ...and ${denyOps.length - 20} more`);
      }
    }
  }

  if (listType === 'both' || listType === 'allowlist') {
    const allowOps = [
      ...analysis.allowlist.toAdd,
      ...analysis.allowlist.toUpdate,
    ];
    console.log(
      `\nALLOWLIST: ${analysis.allowlist.toAdd.length} to add, ${analysis.allowlist.toUpdate.length} to update`
    );

    if (allowOps.length > 0) {
      console.log('\nWould sync in allowlist:');
      for (const op of allowOps.slice(0, 20)) {
        const status = op.shouldBeActive ? 'enabled' : 'disabled';
        const opType = op.type === 'add' ? 'ADD' : 'UPD';
        console.log(
          `  ${opType} [${op.profileName.slice(0, 15).padEnd(15)}] ${op.domain} (${status})`
        );
      }
      if (allowOps.length > 20) {
        console.log(`  ...and ${allowOps.length - 20} more`);
      }
    }
  }
}

export const syncCommand = new Command('sync')
  .description(
    'Sync denylist and allowlist domains across all NextDNS profiles. ' +
      'Uses majority voting to determine canonical state for each domain.'
  )
  .requiredOption('-k, --api-key <key>', 'NextDNS API Key')
  .option(
    '-l, --list <type>',
    'Which list to sync: allowlist, denylist, or both',
    'both'
  )
  .option('--dry-run', 'Show what would be synced without making changes')
  .option(
    '-p, --profiles <ids...>',
    'Specific profile IDs to sync (default: all profiles)'
  )
  .action(async (options) => {
    const {apiKey, list, dryRun, profiles} = options;

    // Validate list type
    const validTypes: SyncTarget[] = ['both', 'denylist', 'allowlist'];
    if (!validTypes.includes(list)) {
      console.error(
        `Error: Invalid list type '${list}'. Valid types: ${validTypes.join(', ')}`
      );
      process.exit(1);
    }

    const api = new NextDNSApi();
    api.setApiKey(apiKey);

    console.log('Fetching profiles...');

    try {
      // First analyze
      console.log('Fetching current profile state...');
      const {analysis} = await analyzeSync(api, {
        apiKey,
        profileIds: profiles,
      });

      printAnalysis(analysis, list as SyncTarget);

      if (dryRun) {
        console.log('\n*** DRY RUN - No changes will be made ***');
        printDryRunPreview(analysis, list as SyncTarget);
        return;
      }

      // Execute sync
      const result = await syncLists(
        api,
        {
          apiKey,
          listType: list as SyncTarget,
          profileIds: profiles,
          dryRun: false,
        },
        {
          onProgress: (
            syncResult: SyncResult,
            _completed: number,
            _total: number
          ) => {
            const op = syncResult.operation;
            const status = syncResult.success
              ? ''
              : ` (FAILED: ${syncResult.error})`;
            const activeStr = op.shouldBeActive ? 'enabled' : 'disabled';
            const opType = op.type === 'add' ? 'ADD' : 'UPD';
            console.log(
              `${opType} [${op.profileName.slice(0, 15).padEnd(15)}] ${op.domain} (${activeStr})${status}`
            );
          },
        }
      );

      console.log('\n' + '='.repeat(80));
      console.log('SYNC COMPLETE');
      console.log('='.repeat(80));
      console.log(
        `Added: ${result.addSuccess} succeeded, ${result.addFail} failed`
      );
      console.log(
        `Updated: ${result.updateSuccess} succeeded, ${result.updateFail} failed`
      );
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });
