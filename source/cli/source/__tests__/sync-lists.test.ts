/**
 * Tests for sync-lists.ts
 * Port of test_sync_lists.py
 */

import {jest, describe, test, expect, beforeEach} from '@jest/globals';
import {NextDNSApi, type HttpAdapter} from '../../../core/api';
import {
  analyzeSync,
  executeSync,
  syncLists,
  getCanonicalDomains,
  type ProfileListData,
  type SyncAnalysis,
} from '../../../core/sync-lists';
import type {Profile, ListType} from '../../../core/types';

// Sample data matching Python tests
const SAMPLE_PROFILES: Profile[] = [
  {id: 'abc123', name: 'Profile 1'},
  {id: 'def456', name: 'Profile 2'},
  {id: 'ghi789', name: 'Profile 3'},
];

const SAMPLE_PROFILE_DATA = {
  id: 'abc123',
  name: 'Profile 1',
  denylist: [
    {id: 'malware.com', active: true},
    {id: 'ads.com', active: false},
  ],
  allowlist: [{id: 'trusted.com', active: true}],
};

// Mock HTTP adapter interface
interface MockHttpAdapter extends HttpAdapter {
  mockRequest: ReturnType<typeof jest.fn>;
  setResponse: (response: unknown) => void;
  setError: (error: Error) => void;
  setSideEffect: (
    fn: (url: string, options: Record<string, unknown>) => unknown
  ) => void;
}

// Mock HTTP adapter for testing
function createMockHttpAdapter(): MockHttpAdapter {
  let mockResponse: unknown = {data: []};
  let mockError: Error | null = null;
  let sideEffect:
    | ((url: string, options: Record<string, unknown>) => unknown)
    | null = null;

  const mockRequest = jest.fn(async (url: string, options: unknown) => {
    if (mockError) {
      throw mockError;
    }
    if (sideEffect) {
      return sideEffect(url, options as Record<string, unknown>) as {
        status: number;
        data: unknown;
      };
    }
    return {status: 200, data: mockResponse};
  });

  return {
    request: mockRequest as HttpAdapter['request'],
    mockRequest,
    setResponse: (response: unknown) => {
      mockResponse = response;
      mockError = null;
      sideEffect = null;
    },
    setError: (error: Error) => {
      mockError = error;
      sideEffect = null;
    },
    setSideEffect: (
      fn: (url: string, options: Record<string, unknown>) => unknown
    ) => {
      sideEffect = fn;
      mockError = null;
    },
  };
}

describe('getCanonicalDomains', () => {
  test('majority enabled wins', () => {
    const allData: Record<string, ProfileListData> = {
      p1: {name: 'P1', denylist: {'domain.com': true}, allowlist: {}},
      p2: {name: 'P2', denylist: {'domain.com': true}, allowlist: {}},
      p3: {name: 'P3', denylist: {'domain.com': false}, allowlist: {}},
    };

    const result = getCanonicalDomains(allData, 'denylist');

    expect(result['domain.com']).toBe(true);
  });

  test('majority disabled wins', () => {
    const allData: Record<string, ProfileListData> = {
      p1: {name: 'P1', denylist: {'domain.com': false}, allowlist: {}},
      p2: {name: 'P2', denylist: {'domain.com': false}, allowlist: {}},
      p3: {name: 'P3', denylist: {'domain.com': true}, allowlist: {}},
    };

    const result = getCanonicalDomains(allData, 'denylist');

    expect(result['domain.com']).toBe(false);
  });

  test('tie goes to enabled', () => {
    const allData: Record<string, ProfileListData> = {
      p1: {name: 'P1', denylist: {'domain.com': true}, allowlist: {}},
      p2: {name: 'P2', denylist: {'domain.com': false}, allowlist: {}},
    };

    const result = getCanonicalDomains(allData, 'denylist');

    expect(result['domain.com']).toBe(true);
  });

  test('multiple domains', () => {
    const allData: Record<string, ProfileListData> = {
      p1: {
        name: 'P1',
        denylist: {'a.com': true, 'b.com': false},
        allowlist: {},
      },
      p2: {
        name: 'P2',
        denylist: {'a.com': true, 'b.com': false},
        allowlist: {},
      },
      p3: {
        name: 'P3',
        denylist: {'a.com': false, 'c.com': true},
        allowlist: {},
      },
    };

    const result = getCanonicalDomains(allData, 'denylist');

    expect(result['a.com']).toBe(true);
    expect(result['b.com']).toBe(false);
    expect(result['c.com']).toBe(true);
  });

  test('empty data', () => {
    const allData: Record<string, ProfileListData> = {};

    const result = getCanonicalDomains(allData, 'denylist');

    expect(result).toEqual({});
  });

  test('allowlist', () => {
    const allData: Record<string, ProfileListData> = {
      p1: {name: 'P1', denylist: {}, allowlist: {'safe.com': true}},
      p2: {name: 'P2', denylist: {}, allowlist: {'safe.com': true}},
      p3: {name: 'P3', denylist: {}, allowlist: {'safe.com': false}},
    };

    const result = getCanonicalDomains(allData, 'allowlist');

    expect(result['safe.com']).toBe(true);
  });
});

describe('analyzeSync', () => {
  test('analyzes profiles for sync operations', async () => {
    const mockAdapter = createMockHttpAdapter();
    const profilesData: Record<string, unknown> = {
      abc123: {
        id: 'abc123',
        name: 'Profile 1',
        denylist: [{id: 'a.com', active: true}],
        allowlist: [],
      },
      def456: {
        id: 'def456',
        name: 'Profile 2',
        denylist: [],
        allowlist: [],
      },
    };

    mockAdapter.setSideEffect((url) => {
      if (url.endsWith('/profiles')) {
        return {
          status: 200,
          data: {
            data: [
              {id: 'abc123', name: 'Profile 1'},
              {id: 'def456', name: 'Profile 2'},
            ],
          },
        };
      }
      if (url.includes('/profiles/abc123')) {
        return {status: 200, data: {data: profilesData['abc123']}};
      }
      if (url.includes('/profiles/def456')) {
        return {status: 200, data: {data: profilesData['def456']}};
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const {analysis} = await analyzeSync(api, {apiKey: 'test-key'});

    expect(analysis.denylist.canonical['a.com']).toBe(true);
    expect(analysis.denylist.toAdd).toHaveLength(1);
    expect(analysis.denylist.toAdd[0].profileId).toBe('def456');
    expect(analysis.denylist.toAdd[0].domain).toBe('a.com');
  });
});

describe('executeSync', () => {
  test('dry run makes no changes', async () => {
    const mockAdapter = createMockHttpAdapter();
    const api = new NextDNSApi({}, mockAdapter);

    const analysis: SyncAnalysis = {
      denylist: {
        canonical: {'a.com': true},
        toAdd: [
          {
            type: 'add',
            profileId: 'p1',
            profileName: 'Profile 1',
            domain: 'a.com',
            shouldBeActive: true,
            listType: 'denylist',
          },
        ],
        toUpdate: [],
      },
      allowlist: {canonical: {}, toAdd: [], toUpdate: []},
      totalUniqueInDenylist: 1,
      totalUniqueInAllowlist: 0,
      estimatedTimeMinutes: 0.5,
    };

    const result = await executeSync(
      api,
      {apiKey: 'test-key', listType: 'both', dryRun: true},
      analysis
    );

    expect(result.addSuccess).toBe(0);
    expect(result.addFail).toBe(0);
    expect(result.updateSuccess).toBe(0);
    expect(result.updateFail).toBe(0);
    expect(mockAdapter.mockRequest).not.toHaveBeenCalled();
  });

  test('adds missing domains', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setResponse({});
    const api = new NextDNSApi({}, mockAdapter);

    const analysis: SyncAnalysis = {
      denylist: {
        canonical: {'a.com': true},
        toAdd: [
          {
            type: 'add',
            profileId: 'p2',
            profileName: 'Profile 2',
            domain: 'a.com',
            shouldBeActive: true,
            listType: 'denylist',
          },
        ],
        toUpdate: [],
      },
      allowlist: {canonical: {}, toAdd: [], toUpdate: []},
      totalUniqueInDenylist: 1,
      totalUniqueInAllowlist: 0,
      estimatedTimeMinutes: 0.5,
    };

    const result = await executeSync(
      api,
      {apiKey: 'test-key', listType: 'denylist', dryRun: false},
      analysis
    );

    expect(result.addSuccess).toBe(1);
    expect(result.addFail).toBe(0);
    expect(mockAdapter.mockRequest).toHaveBeenCalled();
  });

  test('updates differing status', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setResponse({});
    const api = new NextDNSApi({}, mockAdapter);

    const analysis: SyncAnalysis = {
      denylist: {
        canonical: {'a.com': true},
        toAdd: [],
        toUpdate: [
          {
            type: 'update',
            profileId: 'p2',
            profileName: 'Profile 2',
            domain: 'a.com',
            shouldBeActive: true,
            listType: 'denylist',
          },
        ],
      },
      allowlist: {canonical: {}, toAdd: [], toUpdate: []},
      totalUniqueInDenylist: 1,
      totalUniqueInAllowlist: 0,
      estimatedTimeMinutes: 0.5,
    };

    const result = await executeSync(
      api,
      {apiKey: 'test-key', listType: 'denylist', dryRun: false},
      analysis
    );

    expect(result.addSuccess).toBe(0);
    expect(result.updateSuccess).toBe(1);
  });

  test('handles API failures', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setError(new Error('API error'));
    const api = new NextDNSApi({}, mockAdapter);

    const analysis: SyncAnalysis = {
      denylist: {
        canonical: {'a.com': true},
        toAdd: [
          {
            type: 'add',
            profileId: 'p1',
            profileName: 'Profile 1',
            domain: 'a.com',
            shouldBeActive: true,
            listType: 'denylist',
          },
        ],
        toUpdate: [],
      },
      allowlist: {canonical: {}, toAdd: [], toUpdate: []},
      totalUniqueInDenylist: 1,
      totalUniqueInAllowlist: 0,
      estimatedTimeMinutes: 0.5,
    };

    const result = await executeSync(
      api,
      {apiKey: 'test-key', listType: 'denylist', dryRun: false},
      analysis
    );

    expect(result.addSuccess).toBe(0);
    expect(result.addFail).toBe(1);
  });

  test('no changes needed', async () => {
    const mockAdapter = createMockHttpAdapter();
    const api = new NextDNSApi({}, mockAdapter);

    const analysis: SyncAnalysis = {
      denylist: {canonical: {'a.com': true}, toAdd: [], toUpdate: []},
      allowlist: {canonical: {}, toAdd: [], toUpdate: []},
      totalUniqueInDenylist: 1,
      totalUniqueInAllowlist: 0,
      estimatedTimeMinutes: 0,
    };

    const result = await executeSync(
      api,
      {apiKey: 'test-key', listType: 'denylist', dryRun: false},
      analysis
    );

    expect(result.addSuccess).toBe(0);
    expect(result.addFail).toBe(0);
    expect(result.updateSuccess).toBe(0);
    expect(result.updateFail).toBe(0);
    expect(mockAdapter.mockRequest).not.toHaveBeenCalled();
  });
});

describe('syncLists integration', () => {
  test('complex sync scenario', async () => {
    const mockAdapter = createMockHttpAdapter();
    const profilesData: Record<string, unknown> = {
      p1: {
        id: 'p1',
        name: 'Profile 1',
        denylist: [
          {id: 'a.com', active: true},
          {id: 'b.com', active: true},
        ],
        allowlist: [],
      },
      p2: {
        id: 'p2',
        name: 'Profile 2',
        denylist: [{id: 'a.com', active: false}],
        allowlist: [],
      },
      p3: {
        id: 'p3',
        name: 'Profile 3',
        denylist: [
          {id: 'b.com', active: false},
          {id: 'c.com', active: true},
        ],
        allowlist: [],
      },
    };

    mockAdapter.setSideEffect((url, options: {method?: string}) => {
      if (url.endsWith('/profiles')) {
        return {
          status: 200,
          data: {
            data: [
              {id: 'p1', name: 'Profile 1'},
              {id: 'p2', name: 'Profile 2'},
              {id: 'p3', name: 'Profile 3'},
            ],
          },
        };
      }
      if (url.includes('/profiles/p1') && !url.includes('/denylist')) {
        return {status: 200, data: {data: profilesData['p1']}};
      }
      if (url.includes('/profiles/p2') && !url.includes('/denylist')) {
        return {status: 200, data: {data: profilesData['p2']}};
      }
      if (url.includes('/profiles/p3') && !url.includes('/denylist')) {
        return {status: 200, data: {data: profilesData['p3']}};
      }
      // Handle sync operations (POST and PATCH)
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await syncLists(api, {
      apiKey: 'test-key',
      listType: 'denylist',
      dryRun: false,
    });

    // Canonical should be:
    // a.com: true (2 true, 1 false -> majority true)
    // b.com: true (1 true, 1 false -> tie -> enabled)
    // c.com: true (1 true -> true)

    // Operations needed:
    // p2 needs: a.com updated (false->true), b.com added, c.com added
    // p3 needs: a.com added, b.com updated (false->true)
    // p1 needs: c.com added

    expect(result.addSuccess).toBe(4); // b.com to p2, c.com to p2, a.com to p3, c.com to p1
    expect(result.updateSuccess).toBe(2); // a.com in p2, b.com in p3
  });
});
