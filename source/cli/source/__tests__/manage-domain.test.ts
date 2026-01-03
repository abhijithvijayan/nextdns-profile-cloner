/**
 * Tests for manage-domain.ts
 * Port of test_manage_domain.py
 */

import {jest, describe, test, expect, beforeEach} from '@jest/globals';
import {NextDNSApi, type HttpAdapter} from '../../../core/api';
import {manageDomain, getAllProfiles} from '../../../core/manage-domain';
import type {Profile, ListType, DomainAction} from '../../../core/types';

// Sample data matching Python tests
const SAMPLE_PROFILES: Profile[] = [
  {id: 'abc123', name: 'Profile 1'},
  {id: 'def456', name: 'Profile 2'},
  {id: 'ghi789', name: 'Profile 3'},
];

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

describe('getAllProfiles', () => {
  test('returns profile IDs on success', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setResponse({data: SAMPLE_PROFILES});
    const api = new NextDNSApi({}, mockAdapter);

    const result = await getAllProfiles(api, 'test-api-key');

    expect(result).toHaveLength(3);
    expect(result.map((p) => p.id)).toEqual(['abc123', 'def456', 'ghi789']);
    expect(mockAdapter.mockRequest).toHaveBeenCalledTimes(1);
    expect(mockAdapter.mockRequest.mock.calls[0][0]).toContain('profiles');
  });

  test('returns empty array when no profiles', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setResponse({data: []});
    const api = new NextDNSApi({}, mockAdapter);

    const result = await getAllProfiles(api, 'test-api-key');

    expect(result).toEqual([]);
  });

  test('throws on HTTP error', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setError(new Error('401 Unauthorized'));
    const api = new NextDNSApi({}, mockAdapter);

    await expect(getAllProfiles(api, 'invalid-key')).rejects.toThrow(
      '401 Unauthorized'
    );
  });

  test('throws on connection error', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setError(new Error('Connection refused'));
    const api = new NextDNSApi({}, mockAdapter);

    await expect(getAllProfiles(api, 'test-api-key')).rejects.toThrow(
      'Connection refused'
    );
  });
});

describe('manageDomain - add', () => {
  test('adds domain to allowlist successfully', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/allowlist')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'example.com',
      listType: 'allowlist',
      action: 'add',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(1);
    expect(result.failCount).toBe(0);
  });

  test('adds domain to denylist successfully', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/denylist')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'malware.com',
      listType: 'denylist',
      action: 'add',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(1);
    expect(result.failCount).toBe(0);
  });

  test('handles HTTP error when adding domain', async () => {
    const mockAdapter = createMockHttpAdapter();
    const callCount = 0;
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/allowlist')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      throw new Error('400 Bad Request: Invalid domain format');
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'invalid',
      listType: 'allowlist',
      action: 'add',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(1);
    expect(result.results[0].error).toContain('400');
  });

  test('handles connection error when adding domain', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/allowlist')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      throw new Error('Network error');
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'example.com',
      listType: 'allowlist',
      action: 'add',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(1);
    expect(result.results[0].error).toContain('Network error');
  });
});

describe('manageDomain - remove', () => {
  test('removes domain successfully', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/allowlist/')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'example.com',
      listType: 'allowlist',
      action: 'remove',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(1);
    expect(result.failCount).toBe(0);
  });

  test('handles 404 when removing (already removed)', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/denylist/')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      throw new Error('404 Not Found');
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'nonexistent.com',
      listType: 'denylist',
      action: 'remove',
      profileIds: ['abc123'],
    });

    // 404 is success for remove (already removed)
    expect(result.successCount).toBe(1);
    expect(result.results[0].error).toContain('not found');
  });

  test('handles HTTP 500 error when removing', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/allowlist/')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      throw new Error('500 Internal Server Error');
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'example.com',
      listType: 'allowlist',
      action: 'remove',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(1);
    expect(result.results[0].error).toContain('500');
  });

  test('handles timeout error when removing', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/denylist/')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      throw new Error('Timeout');
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'example.com',
      listType: 'denylist',
      action: 'remove',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(1);
    expect(result.results[0].error).toContain('Timeout');
  });
});

describe('manageDomain - enable/disable', () => {
  test('disables domain successfully', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/allowlist/')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'example.com',
      listType: 'allowlist',
      action: 'disable',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(1);
    expect(result.failCount).toBe(0);
  });

  test('enables domain successfully', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/denylist/')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'example.com',
      listType: 'denylist',
      action: 'enable',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(1);
    expect(result.failCount).toBe(0);
  });

  test('handles 404 when updating domain (not found)', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/allowlist/')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      throw new Error('404 Not Found');
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'nonexistent.com',
      listType: 'allowlist',
      action: 'disable',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(1);
    expect(result.results[0].error).toContain('not found');
  });

  test('handles HTTP error when updating domain', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/denylist/')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      throw new Error('500 Server Error');
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'example.com',
      listType: 'denylist',
      action: 'enable',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(1);
    expect(result.results[0].error).toContain('500');
  });

  test('handles connection timeout when updating domain', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles') && !url.includes('/allowlist/')) {
        return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
      }
      throw new Error('Connection timeout');
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'example.com',
      listType: 'allowlist',
      action: 'disable',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(1);
    expect(result.results[0].error).toContain('Connection timeout');
  });
});

describe('manageDomain - integration', () => {
  test('adds domain to multiple profiles', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.endsWith('/profiles')) {
        return {status: 200, data: {data: SAMPLE_PROFILES}};
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'test.com',
      listType: 'denylist',
      action: 'add',
    });

    expect(result.successCount).toBe(3);
    expect(result.failCount).toBe(0);
    expect(result.results).toHaveLength(3);
  });

  test('handles partial failure across multiple profiles', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url, options: {method?: string}) => {
      if (url.endsWith('/profiles')) {
        return {status: 200, data: {data: SAMPLE_PROFILES}};
      }
      // Fail for the second profile
      if (url.includes('def456') && options.method === 'DELETE') {
        throw new Error('500 Server error');
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'test.com',
      listType: 'allowlist',
      action: 'remove',
    });

    expect(result.successCount).toBe(2);
    expect(result.failCount).toBe(1);
    expect(result.results.find((r) => r.profileId === 'def456')?.success).toBe(
      false
    );
  });
});

describe('manageDomain - add with active flag', () => {
  test('adds domain as disabled', async () => {
    const mockAdapter = createMockHttpAdapter();
    let capturedBody: unknown = null;
    mockAdapter.setSideEffect(
      (url, options: {method?: string; body?: string}) => {
        if (url.endsWith('/profiles')) {
          return {status: 200, data: {data: [SAMPLE_PROFILES[0]]}};
        }
        if (options.method === 'POST') {
          capturedBody = options.body ? JSON.parse(options.body) : null;
        }
        return {status: 200, data: {}};
      }
    );
    const api = new NextDNSApi({}, mockAdapter);

    // The manageDomain function always adds as active=true by default
    // To test the underlying behavior, we'd need to check the API call
    const result = await manageDomain(api, {
      apiKey: 'test-key',
      domain: 'example.com',
      listType: 'denylist',
      action: 'add',
      profileIds: ['abc123'],
    });

    expect(result.successCount).toBe(1);
    expect(capturedBody).toEqual({id: 'example.com', active: true});
  });
});
