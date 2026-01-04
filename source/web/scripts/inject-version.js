const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read package.json to get version
const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
);

// Get git commit hash (short version)
let gitHash = '';
try {
    gitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (error) {
    console.warn('Warning: Could not get git commit hash');
    gitHash = 'unknown';
}

// Get current timestamp formatted as UTC
const now = new Date();
const buildTimestamp = now.toISOString().slice(0, 16).replace('T', ' ');

// Generate version.ts file
const versionFileContent = `// This file is auto-generated during build
// Do not edit manually
export const VERSION = '${packageJson.version}';
export const GIT_HASH = '${gitHash}';
export const BUILD_TIME = '${buildTimestamp}';
`;

// Write to src/lib/version.ts
const versionPath = path.join(__dirname, '../src/lib/version.ts');
fs.writeFileSync(versionPath, versionFileContent, 'utf8');

console.log(
    `✓ Version ${packageJson.version}+${gitHash} generated (built at ${buildTimestamp})`
);
