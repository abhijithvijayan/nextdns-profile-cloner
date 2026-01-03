/**
 * Copy Profile Command
 * Port of copy_profile.py CLI interface
 */

import {Command} from 'commander';
import {NextDNSApi, copyProfile} from '../../../core/index.js';

export const copyCommand = new Command('copy')
  .description('Clone a NextDNS profile')
  .requiredOption('-s, --source-key <key>', 'API Key for Source Account')
  .requiredOption('-d, --dest-key <key>', 'API Key for Destination Account')
  .requiredOption('-p, --profile-id <id>', 'Profile ID to copy from source')
  .option('-f, --force', 'Force copy even if unknown API fields are detected')
  .action(async (options) => {
    const {sourceKey, destKey, profileId, force} = options;

    const api = new NextDNSApi();

    try {
      const result = await copyProfile(
        api,
        {
          sourceApiKey: sourceKey,
          destApiKey: destKey,
          sourceProfileId: profileId,
          force,
        },
        {
          onStepStart: (step: string) => {
            process.stdout.write(`${step}... `);
          },
          onStepComplete: (
            step: string,
            success: boolean,
            message?: string
          ) => {
            if (success) {
              console.log(message ? `OK (${message})` : 'OK');
            } else {
              console.log(`FAILED: ${message}`);
            }
          },
          onWarning: (warnings: string[]) => {
            console.log('\n' + '='.repeat(60));
            console.log('WARNING: Unknown fields detected in API response!');
            console.log(
              'This script may be outdated and missing new NextDNS features.'
            );
            console.log('='.repeat(60));
            for (const warning of warnings) {
              console.log(`  - ${warning}`);
            }
            console.log('='.repeat(60));
            if (!force) {
              console.log('\nTo proceed anyway, use the --force flag.');
              console.log(
                'Consider updating this script to handle the new fields.'
              );
            } else {
              console.log('\n--force flag set, proceeding with copy...\n');
            }
          },
        }
      );

      if (!result.success) {
        process.exit(1);
      }

      // Print verification results
      console.log('\n' + '-'.repeat(43));
      console.log('Verifying clone...');

      if (result.verificationMismatches.length === 0) {
        console.log(
          'VERIFICATION SUCCESSFUL: Source and Destination profiles match.'
        );
      } else {
        console.log(
          'VERIFICATION FAILED: The following discrepancies were found:'
        );
        for (const m of result.verificationMismatches) {
          console.log(`  - ${m}`);
        }
      }

      // Print skipped fields
      console.log('\n' + '-'.repeat(43));
      console.log('FIELDS NOT COPIED (require manual configuration):');
      console.log('-'.repeat(43));

      if (result.skippedFields.length > 0) {
        for (const field of result.skippedFields) {
          console.log(`  - ${field}`);
        }
      } else {
        console.log('  (none)');
      }

      // Print success message
      console.log('\n' + '-'.repeat(43));
      console.log(
        `Done! Profile ${profileId} cloned to ${result.newProfileId}`
      );
      console.log('-'.repeat(43));
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });
