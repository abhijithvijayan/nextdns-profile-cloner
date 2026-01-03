/**
 * NextDNS Manager CLI
 * TypeScript port of the Python CLI tools
 */

import {Command} from 'commander';
import {manageCommand} from './commands/manage.js';
import {syncCommand} from './commands/sync.js';
import {diffCommand} from './commands/diff.js';
import {copyCommand} from './commands/copy.js';

const program = new Command();

program
  .name('nextdns-manager')
  .description('CLI tool for managing NextDNS profiles')
  .version('1.0.0');

program.addCommand(manageCommand);
program.addCommand(syncCommand);
program.addCommand(diffCommand);
program.addCommand(copyCommand);

program.parse();
