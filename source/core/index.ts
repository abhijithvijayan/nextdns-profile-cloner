/**
 * NextDNS Core Library
 * Shared functionality for CLI and Web
 */

// Types
export * from './types.js';

// API Client
export {NextDNSApi, api, parseApiResponse} from './api.js';
export type {ApiClientOptions, HttpAdapter} from './api.js';

// Manage Domain
export {manageDomain, getAllProfiles} from './manage-domain.js';
export type {
  ManageDomainOptions,
  ManageDomainCallbacks,
} from './manage-domain.js';

// Sync Lists
export {
  syncLists,
  analyzeSync,
  executeSync,
  getCanonicalDomains,
} from './sync-lists.js';
export type {
  SyncListsOptions,
  SyncAnalysis,
  SyncTarget,
  SyncResult,
  SyncCallbacks,
  ProfileListData,
} from './sync-lists.js';

// Diff Profiles
export {diffProfiles, formatDiffAsText} from './diff-profiles.js';
export type {
  DiffOptions,
  DiffSection,
  DiffResult,
  DiffTable,
  DiffRow,
  ProfileDiffData,
} from './diff-profiles.js';

// Copy Profile
export {
  copyProfile,
  validateApiSchema,
  reconstructPayload,
} from './copy-profile.js';
export type {
  CopyProfileOptions,
  CopyCallbacks,
  CopyResult,
  CopyStep,
} from './copy-profile.js';
