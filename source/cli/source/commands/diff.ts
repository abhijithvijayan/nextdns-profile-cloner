/**
 * Diff Profiles Command
 * Port of diff_profiles.py CLI interface
 */

import {Command} from 'commander';
import {
  NextDNSApi,
  diffProfiles,
  formatDiffAsText,
  type DiffSection,
} from '../../../core/index.js';

export const diffCommand = new Command('diff')
  .description(
    'Visualize differences between NextDNS profiles in a table format'
  )
  .requiredOption('-k, --api-key <key>', 'NextDNS API Key')
  .option(
    '-p, --profiles <ids...>',
    'Specific profile IDs to compare (default: all profiles)'
  )
  .option(
    '-s, --section <section>',
    'Section to compare: all, security, privacy, parental, settings, lists',
    'all'
  )
  .option('--diff-only', 'Only show rows with differences')
  .action(async (options) => {
    const {apiKey, profiles, section, diffOnly} = options;

    // Validate section
    const validSections: DiffSection[] = [
      'all',
      'security',
      'privacy',
      'parental',
      'settings',
      'lists',
    ];
    if (!validSections.includes(section)) {
      console.error(
        `Error: Invalid section '${section}'. Valid sections: ${validSections.join(', ')}`
      );
      process.exit(1);
    }

    const api = new NextDNSApi();
    api.setApiKey(apiKey);

    console.log('Fetching profiles...');

    try {
      const result = await diffProfiles(api, {
        apiKey,
        profileIds: profiles,
        section: section as DiffSection,
        diffOnly,
      });

      console.log(`Comparing ${result.profileIds.length} profiles...\n`);

      // Print tables
      const output = formatDiffAsText(result);
      console.log(output);

      console.log('Done.');
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });
