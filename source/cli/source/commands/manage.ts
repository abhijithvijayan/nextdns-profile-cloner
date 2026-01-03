/**
 * Manage Domain Command
 * Port of manage_domain.py CLI interface
 */

import {Command} from 'commander';
import {
  NextDNSApi,
  manageDomain,
  type ListType,
  type DomainAction,
} from '../../../core/index.js';

export const manageCommand = new Command('manage')
  .description(
    'Manage domains in allowlist/denylist across all NextDNS profiles'
  )
  .requiredOption('-k, --api-key <key>', 'NextDNS API Key')
  .requiredOption(
    '-d, --domain <domain>',
    'Domain to manage (e.g., example.com)'
  )
  .requiredOption(
    '-l, --list <type>',
    'Target list: allowlist or denylist',
    validateListType
  )
  .option(
    '-a, --action <action>',
    'Action: add, remove, enable, or disable',
    'add'
  )
  .option(
    '-p, --profiles <ids...>',
    'Specific profile IDs to target (default: all profiles)'
  )
  .action(async (options) => {
    const {apiKey, domain, list, action, profiles} = options;

    // Validate action
    const validActions: DomainAction[] = ['add', 'remove', 'enable', 'disable'];
    if (!validActions.includes(action)) {
      console.error(
        `Error: Invalid action '${action}'. Valid actions: ${validActions.join(', ')}`
      );
      process.exit(1);
    }

    const api = new NextDNSApi();
    api.setApiKey(apiKey);

    if (profiles && profiles.length > 0) {
      console.log(`Using specified profiles: ${profiles.join(', ')}`);
    } else {
      console.log('Fetching all profiles...');
    }

    const actionVerbs: Record<DomainAction, string> = {
      add: 'Adding to',
      remove: 'Removing from',
      enable: 'Enabling in',
      disable: 'Disabling in',
    };

    try {
      const result = await manageDomain(
        api,
        {
          apiKey,
          domain,
          listType: list as ListType,
          action: action as DomainAction,
          profileIds: profiles,
        },
        {
          onProgress: (opResult: {
            profileId: string;
            success: boolean;
            error?: string;
          }) => {
            const status = opResult.success
              ? opResult.error
                ? `OK (${opResult.error})`
                : 'OK'
              : `FAILED: ${opResult.error}`;
            console.log(`  [${opResult.profileId}] ${status}`);
          },
        }
      );

      console.log(`\nFound ${result.results.length} profile(s)`);
      console.log(`${actionVerbs[action as DomainAction]} ${list}: ${domain}`);
      console.log('-'.repeat(50));
      console.log(
        `Complete: ${result.successCount} succeeded, ${result.failCount} failed`
      );

      if (result.failCount > 0) {
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

function validateListType(value: string): string {
  const valid = ['allowlist', 'denylist'];
  if (!valid.includes(value)) {
    throw new Error(
      `Invalid list type '${value}'. Valid types: ${valid.join(', ')}`
    );
  }
  return value;
}
