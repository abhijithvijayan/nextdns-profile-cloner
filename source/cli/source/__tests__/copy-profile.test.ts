/**
 * Tests for copy-profile.ts
 * Port of test_copy_profile.py
 */

import {jest, describe, test, expect} from '@jest/globals';
import {NextDNSApi, type HttpAdapter} from '../../../core/api';
import {
  validateApiSchema,
  reconstructPayload,
  copyProfile,
} from '../../../core/copy-profile';
import type {ProfileData} from '../../../core/types';

// Sample profile data (placeholder values matching Python tests)
const SAMPLE_PROFILE_DATA: ProfileData = {
  id: 'abc123',
  fingerprint: 'fp0000000000000000',
  name: 'Test Profile',
  setup: {
    ipv4: [],
    ipv6: ['2001:db8::1', '2001:db8::2'],
    linkedIp: {
      servers: ['192.0.2.1', '192.0.2.2'],
      ip: '198.51.100.1',
    },
  },
  security: {
    threatIntelligenceFeeds: true,
    aiThreatDetection: true,
    googleSafeBrowsing: true,
    cryptojacking: true,
    dnsRebinding: true,
    idnHomographs: true,
    typosquatting: true,
    dga: true,
    nrd: true,
    ddns: true,
    parking: true,
    csam: true,
    tlds: [{id: 'example1'}, {id: 'example2'}, {id: 'example3'}],
  },
  privacy: {
    disguisedTrackers: true,
    allowAffiliate: true,
    blocklists: [{id: 'nextdns-recommended'}, {id: 'steven-black'}],
    natives: [{id: 'windows'}, {id: 'apple'}, {id: 'samsung'}],
  },
  parentalControl: {
    safeSearch: true,
    youtubeRestrictedMode: true,
    blockBypass: true,
    services: [
      {id: 'tiktok', active: true},
      {id: 'snapchat', active: true},
    ],
    categories: [
      {id: 'gambling', active: true},
      {id: 'dating', active: true},
    ],
    recreation: {
      times: {
        monday: {start: '18:00:00', end: '20:30:00'},
        saturday: {start: '09:00:00', end: '20:30:00'},
      },
      timezone: 'UTC',
    },
  },
  settings: {
    logs: {
      enabled: true,
      drop: {ip: false, domain: false},
      retention: 86400,
      location: 'us',
    },
    blockPage: {enabled: true},
    performance: {ecs: true, cacheBoost: true, cnameFlattening: true},
    bav: true,
    web3: true,
  },
  denylist: [
    {id: 'malware-example.com', active: true},
    {id: 'tracker-example.net', active: false},
  ],
  allowlist: [
    {id: 'trusted-example.com', active: true},
    {id: 'safe-example.org', active: true},
  ],
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

// Mock HTTP adapter
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

describe('reconstructPayload', () => {
  describe('name', () => {
    test('copies profile name with (Copy) suffix', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      expect(payload.name).toBe('Test Profile (Copy)');
    });

    test('defaults name when missing with (Copy) suffix', () => {
      const data = {security: {}} as ProfileData;
      const payload = reconstructPayload(data);
      expect(payload.name).toBe('Cloned Profile (Copy)');
    });
  });

  describe('security', () => {
    test('copies all security boolean fields', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const security = payload.security!;

      expect(security.threatIntelligenceFeeds).toBe(true);
      expect(security.aiThreatDetection).toBe(true);
      expect(security.googleSafeBrowsing).toBe(true);
      expect(security.cryptojacking).toBe(true);
      expect(security.dnsRebinding).toBe(true);
      expect(security.idnHomographs).toBe(true);
      expect(security.typosquatting).toBe(true);
      expect(security.dga).toBe(true);
      expect(security.nrd).toBe(true);
      expect(security.ddns).toBe(true);
      expect(security.parking).toBe(true);
      expect(security.csam).toBe(true);
    });

    test('copies TLDs with only id field', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const tlds = payload.security!.tlds!;

      expect(tlds).toHaveLength(3);
      expect(tlds).toContainEqual({id: 'example1'});
      expect(tlds).toContainEqual({id: 'example2'});
      expect(tlds).toContainEqual({id: 'example3'});
    });

    test('defaults to true when fields are missing', () => {
      const data = {security: {threatIntelligenceFeeds: false}} as ProfileData;
      const payload = reconstructPayload(data);

      expect(payload.security!.threatIntelligenceFeeds).toBe(false);
      expect(payload.security!.aiThreatDetection).toBe(true); // default
    });
  });

  describe('privacy', () => {
    test('copies privacy boolean fields', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const privacy = payload.privacy!;

      expect(privacy.disguisedTrackers).toBe(true);
      expect(privacy.allowAffiliate).toBe(true);
    });

    test('copies blocklists with only id field', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const blocklists = payload.privacy!.blocklists!;

      expect(blocklists).toHaveLength(2);
      expect(blocklists[0]).toEqual({id: 'nextdns-recommended'});
      expect(blocklists[1]).toEqual({id: 'steven-black'});
    });

    test('copies natives with only id field', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const natives = payload.privacy!.natives!;

      expect(natives).toHaveLength(3);
      expect(natives).toContainEqual({id: 'windows'});
      expect(natives).toContainEqual({id: 'apple'});
    });
  });

  describe('parental control', () => {
    test('copies parental control boolean fields', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const pc = payload.parentalControl!;

      expect(pc.safeSearch).toBe(true);
      expect(pc.youtubeRestrictedMode).toBe(true);
      expect(pc.blockBypass).toBe(true);
    });

    test('copies services with id and active status', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const services = payload.parentalControl!.services!;

      expect(services).toHaveLength(2);
      expect(services).toContainEqual({id: 'tiktok', active: true});
      expect(services).toContainEqual({id: 'snapchat', active: true});
    });

    test('copies categories with id and active status', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const categories = payload.parentalControl!.categories!;

      expect(categories).toHaveLength(2);
      expect(categories).toContainEqual({id: 'gambling', active: true});
      expect(categories).toContainEqual({id: 'dating', active: true});
    });

    test('does NOT copy recreation field (not supported by API)', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      expect(payload.parentalControl!.recreation).toBeUndefined();
    });

    test('defaults to false when fields are missing', () => {
      const data = {parentalControl: {}} as ProfileData;
      const payload = reconstructPayload(data);

      expect(payload.parentalControl!.safeSearch).toBe(false);
      expect(payload.parentalControl!.youtubeRestrictedMode).toBe(false);
      expect(payload.parentalControl!.blockBypass).toBe(false);
    });
  });

  describe('denylist and allowlist', () => {
    test('copies denylist with active status', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const denylist = payload.denylist!;

      expect(denylist).toHaveLength(2);
      expect(denylist).toContainEqual({
        id: 'malware-example.com',
        active: true,
      });
      expect(denylist).toContainEqual({
        id: 'tracker-example.net',
        active: false,
      });
    });

    test('defaults active to true when missing', () => {
      const data = {denylist: [{id: 'test.com'}]} as unknown as ProfileData;
      const payload = reconstructPayload(data);

      expect(payload.denylist![0].active).toBe(true);
    });

    test('copies allowlist with active status', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const allowlist = payload.allowlist!;

      expect(allowlist).toHaveLength(2);
      expect(allowlist).toContainEqual({
        id: 'trusted-example.com',
        active: true,
      });
    });
  });

  describe('settings', () => {
    test('copies logs settings', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const logs = payload.settings!.logs!;

      expect(logs.enabled).toBe(true);
      expect(logs.retention).toBe(86400);
      expect(logs.location).toBe('us');
      expect(logs.drop!.ip).toBe(false);
    });

    test('copies blockPage settings', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      expect(payload.settings!.blockPage!.enabled).toBe(true);
    });

    test('copies performance settings', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      const perf = payload.settings!.performance!;

      expect(perf.ecs).toBe(true);
      expect(perf.cacheBoost).toBe(true);
      expect(perf.cnameFlattening).toBe(true);
    });

    test('copies web3 setting', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      expect(payload.settings!.web3).toBe(true);
    });

    test('copies bav setting', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      expect(payload.settings!.bav).toBe(true);
    });
  });

  describe('excluded fields', () => {
    test('does not copy setup', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      expect((payload as Record<string, unknown>)['setup']).toBeUndefined();
    });

    test('does not copy fingerprint', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      expect(
        (payload as Record<string, unknown>)['fingerprint']
      ).toBeUndefined();
    });

    test('does not copy id', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      expect((payload as Record<string, unknown>)['id']).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    test('handles completely empty data', () => {
      const payload = reconstructPayload({} as ProfileData);
      expect(payload.name).toBe('Cloned Profile (Copy)');
      expect(payload.security).toBeUndefined();
      expect(payload.privacy).toBeUndefined();
    });

    test('handles empty TLDs array', () => {
      const data = {security: {tlds: []}} as unknown as ProfileData;
      const payload = reconstructPayload(data);
      expect(payload.security!.tlds).toEqual([]);
    });

    test('handles empty blocklists', () => {
      const data = {
        privacy: {blocklists: [], natives: []},
      } as unknown as ProfileData;
      const payload = reconstructPayload(data);
      expect(payload.privacy!.blocklists).toEqual([]);
      expect(payload.privacy!.natives).toEqual([]);
    });

    test('handles empty deny/allow lists', () => {
      const data = {
        id: 'test',
        name: 'Test',
        denylist: [],
        allowlist: [],
      } as ProfileData;
      const payload = reconstructPayload(data);
      expect(payload.denylist).toEqual([]);
      expect(payload.allowlist).toEqual([]);
    });

    test('handles missing optional sections', () => {
      const data = {name: 'Minimal Profile'} as ProfileData;
      const payload = reconstructPayload(data);

      expect(payload.name).toBe('Minimal Profile (Copy)');
      expect(payload.security).toBeUndefined();
      expect(payload.privacy).toBeUndefined();
      expect(payload.parentalControl).toBeUndefined();
      expect(payload.denylist).toBeUndefined();
      expect(payload.allowlist).toBeUndefined();
      expect(payload.settings).toBeUndefined();
    });

    test('handles partial settings', () => {
      const data = {
        settings: {logs: {enabled: true}},
      } as unknown as ProfileData;
      const payload = reconstructPayload(data);

      expect(payload.settings!.logs).toEqual({enabled: true});
      expect(payload.settings!.blockPage).toBeUndefined();
      expect(payload.settings!.performance).toBeUndefined();
    });

    test('service without active defaults to false', () => {
      const data = {
        parentalControl: {services: [{id: 'tiktok'}]},
      } as unknown as ProfileData;
      const payload = reconstructPayload(data);

      expect(payload.parentalControl!.services![0].active).toBe(false);
    });

    test('category without active defaults to false', () => {
      const data = {
        parentalControl: {categories: [{id: 'gambling'}]},
      } as unknown as ProfileData;
      const payload = reconstructPayload(data);

      expect(payload.parentalControl!.categories![0].active).toBe(false);
    });

    test('security with all fields false', () => {
      const data = {
        security: {
          threatIntelligenceFeeds: false,
          aiThreatDetection: false,
          googleSafeBrowsing: false,
          cryptojacking: false,
          dnsRebinding: false,
          idnHomographs: false,
          typosquatting: false,
          dga: false,
          nrd: false,
          ddns: false,
          parking: false,
          csam: false,
        },
      } as unknown as ProfileData;
      const payload = reconstructPayload(data);

      const security = payload.security!;
      expect(security.threatIntelligenceFeeds).toBe(false);
      expect(security.aiThreatDetection).toBe(false);
      expect(security.googleSafeBrowsing).toBe(false);
      expect(security.cryptojacking).toBe(false);
      expect(security.dnsRebinding).toBe(false);
      expect(security.idnHomographs).toBe(false);
      expect(security.typosquatting).toBe(false);
      expect(security.dga).toBe(false);
      expect(security.nrd).toBe(false);
      expect(security.ddns).toBe(false);
      expect(security.parking).toBe(false);
      expect(security.csam).toBe(false);
    });
  });

  describe('payload integrity', () => {
    test('payload is JSON serializable', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);
      expect(() => JSON.stringify(payload)).not.toThrow();
    });

    test('no extra metadata fields in payload', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);

      expect((payload as Record<string, unknown>)['setup']).toBeUndefined();
      expect(
        (payload as Record<string, unknown>)['fingerprint']
      ).toBeUndefined();
      expect((payload as Record<string, unknown>)['id']).toBeUndefined();
    });

    test('roundtrip preserves essential data', () => {
      const payload = reconstructPayload(SAMPLE_PROFILE_DATA);

      expect(payload.name).toBe(`${SAMPLE_PROFILE_DATA.name} (Copy)`);
      expect(payload.security!.tlds).toHaveLength(
        SAMPLE_PROFILE_DATA.security!.tlds!.length
      );
      expect(payload.privacy!.blocklists).toHaveLength(
        SAMPLE_PROFILE_DATA.privacy!.blocklists!.length
      );
      expect(payload.denylist).toHaveLength(
        SAMPLE_PROFILE_DATA.denylist!.length
      );
      expect(payload.allowlist).toHaveLength(
        SAMPLE_PROFILE_DATA.allowlist!.length
      );
    });
  });
});

describe('validateApiSchema', () => {
  test('no warnings for known fields', () => {
    const warnings = validateApiSchema(SAMPLE_PROFILE_DATA);
    expect(warnings).toHaveLength(0);
  });

  test('warns on unknown root field', () => {
    const data = {
      ...SAMPLE_PROFILE_DATA,
      newFeature: {enabled: true},
    } as unknown as ProfileData;
    const warnings = validateApiSchema(data);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('root');
    expect(warnings[0]).toContain('newFeature');
  });

  test('warns on unknown security field', () => {
    const data = {
      ...SAMPLE_PROFILE_DATA,
      security: {...SAMPLE_PROFILE_DATA.security, newThreatProtection: true},
    } as unknown as ProfileData;
    const warnings = validateApiSchema(data);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('security');
    expect(warnings[0]).toContain('newThreatProtection');
  });

  test('warns on unknown privacy field', () => {
    const data = {
      ...SAMPLE_PROFILE_DATA,
      privacy: {...SAMPLE_PROFILE_DATA.privacy, newPrivacyFeature: true},
    } as unknown as ProfileData;
    const warnings = validateApiSchema(data);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('privacy');
    expect(warnings[0]).toContain('newPrivacyFeature');
  });

  test('warns on unknown parentalControl field', () => {
    const data = {
      ...SAMPLE_PROFILE_DATA,
      parentalControl: {
        ...SAMPLE_PROFILE_DATA.parentalControl,
        newRestriction: true,
      },
    } as unknown as ProfileData;
    const warnings = validateApiSchema(data);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('parentalControl');
    expect(warnings[0]).toContain('newRestriction');
  });

  test('warns on unknown settings field', () => {
    const data = {
      ...SAMPLE_PROFILE_DATA,
      settings: {...SAMPLE_PROFILE_DATA.settings, newSetting: {enabled: true}},
    } as unknown as ProfileData;
    const warnings = validateApiSchema(data);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('settings');
    expect(warnings[0]).toContain('newSetting');
  });

  test('warns on unknown settings.logs field', () => {
    const data = {
      ...SAMPLE_PROFILE_DATA,
      settings: {
        ...SAMPLE_PROFILE_DATA.settings,
        logs: {...SAMPLE_PROFILE_DATA.settings!.logs, newLogOption: true},
      },
    } as unknown as ProfileData;
    const warnings = validateApiSchema(data);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('settings.logs');
    expect(warnings[0]).toContain('newLogOption');
  });

  test('warns on unknown settings.performance field', () => {
    const data = {
      ...SAMPLE_PROFILE_DATA,
      settings: {
        ...SAMPLE_PROFILE_DATA.settings,
        performance: {
          ...SAMPLE_PROFILE_DATA.settings!.performance,
          newPerfOption: true,
        },
      },
    } as unknown as ProfileData;
    const warnings = validateApiSchema(data);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('settings.performance');
    expect(warnings[0]).toContain('newPerfOption');
  });

  test('multiple unknown fields generate multiple warnings', () => {
    const data = {
      ...SAMPLE_PROFILE_DATA,
      newRootField: true,
      security: {...SAMPLE_PROFILE_DATA.security, newSecField: true},
      settings: {...SAMPLE_PROFILE_DATA.settings, newSettingsField: true},
    } as unknown as ProfileData;
    const warnings = validateApiSchema(data);

    expect(warnings).toHaveLength(3);
  });

  test('skipped fields do not trigger warnings', () => {
    // id, fingerprint, setup are in SKIPPED_FIELDS and already in SAMPLE_PROFILE_DATA
    // recreation is already in parentalControl
    const warnings = validateApiSchema(SAMPLE_PROFILE_DATA);
    expect(warnings).toHaveLength(0);
  });

  test('handles empty data', () => {
    const warnings = validateApiSchema({} as ProfileData);
    expect(warnings).toHaveLength(0);
  });

  test('handles partial data', () => {
    const data = {
      name: 'Test',
      security: {threatIntelligenceFeeds: true},
    } as ProfileData;
    const warnings = validateApiSchema(data);
    expect(warnings).toHaveLength(0);
  });
});

describe('copyProfile', () => {
  test('successful fetch', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url) => {
      if (url.includes('/profiles/abc123') && !url.includes('/rewrites')) {
        return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
      }
      if (url.includes('/rewrites')) {
        return {status: 200, data: {data: []}};
      }
      if (url.includes('/profiles') && url.endsWith('/profiles')) {
        return {status: 200, data: {data: {id: 'new123'}}};
      }
      return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await copyProfile(api, {
      sourceApiKey: 'test-api-key',
      destApiKey: 'test-api-key',
      sourceProfileId: 'abc123',
    });

    expect(result.success).toBe(true);
    expect(result.newProfileId).toBe('new123');
  });

  test('HTTP error on fetch exits with failure', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setError(new Error('404 Not found'));
    const api = new NextDNSApi({}, mockAdapter);

    const result = await copyProfile(api, {
      sourceApiKey: 'test-api-key',
      destApiKey: 'test-api-key',
      sourceProfileId: 'invalid',
    });

    expect(result.success).toBe(false);
  });

  test('connection error on fetch exits with failure', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setError(new Error('Connection refused'));
    const api = new NextDNSApi({}, mockAdapter);

    const result = await copyProfile(api, {
      sourceApiKey: 'test-api-key',
      destApiKey: 'test-api-key',
      sourceProfileId: 'abc123',
    });

    expect(result.success).toBe(false);
  });

  test('create profile returns new ID', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url, options: {method?: string}) => {
      if (url.includes('/profiles/abc123') && !url.includes('/rewrites')) {
        return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
      }
      if (url.includes('/rewrites')) {
        return {status: 200, data: {data: []}};
      }
      if (options.method === 'POST') {
        return {status: 200, data: {data: {id: 'new123'}}};
      }
      return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await copyProfile(api, {
      sourceApiKey: 'test-api-key',
      destApiKey: 'test-api-key',
      sourceProfileId: 'abc123',
    });

    expect(result.newProfileId).toBe('new123');
  });

  test('creation error returns failure', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url, options: {method?: string}) => {
      if (url.includes('/profiles/abc123') && !url.includes('/rewrites')) {
        return {
          status: 200,
          data: {data: {...SAMPLE_PROFILE_DATA, parentalControl: undefined}},
        };
      }
      if (options.method === 'POST') {
        throw new Error('400 Bad request');
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await copyProfile(api, {
      sourceApiKey: 'test-api-key',
      destApiKey: 'test-api-key',
      sourceProfileId: 'abc123',
    });

    expect(result.success).toBe(false);
  });
});

describe('copyProfile - rewrites', () => {
  test('successful PUT of rewrites', async () => {
    const mockAdapter = createMockHttpAdapter();
    const srcRewrites = [
      {id: '1', name: 'test', type: 'A', content: '1.2.3.4'},
      {id: '2', name: 'test2', type: 'CNAME', content: 'example.com'},
    ];
    let putCalled = false;
    let capturedPutBody: unknown = null;

    mockAdapter.setSideEffect(
      (url, options: {method?: string; body?: string}) => {
        if (url.includes('/profiles/src-id') && !url.includes('/rewrites')) {
          return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
        }
        if (
          url.includes('/profiles/src-id/rewrites') &&
          options.method === 'GET'
        ) {
          return {status: 200, data: {data: srcRewrites}};
        }
        if (options.method === 'POST' && !url.includes('/rewrites')) {
          return {status: 200, data: {data: {id: 'dest-id'}}};
        }
        if (
          url.includes('/profiles/dest-id/rewrites') &&
          options.method === 'PUT'
        ) {
          putCalled = true;
          capturedPutBody = options.body ? JSON.parse(options.body) : null;
          return {status: 200, data: {}};
        }
        if (
          url.includes('/profiles/dest-id/rewrites') &&
          options.method === 'GET'
        ) {
          return {status: 200, data: {data: []}};
        }
        if (url.includes('/profiles/dest-id') && !url.includes('/rewrites')) {
          return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
        }
        return {status: 200, data: {}};
      }
    );
    const api = new NextDNSApi({}, mockAdapter);

    const result = await copyProfile(api, {
      sourceApiKey: 'source-key',
      destApiKey: 'dest-key',
      sourceProfileId: 'src-id',
    });

    expect(result.success).toBe(true);
    expect(putCalled).toBe(true);
    // Verify id and type are stripped from rewrites
    const rewrites = capturedPutBody as {name: string; content: string}[];
    for (const rw of rewrites) {
      expect((rw as Record<string, unknown>)['id']).toBeUndefined();
      expect((rw as Record<string, unknown>)['type']).toBeUndefined();
    }
  });

  test('handles no rewrites found', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url, options: {method?: string}) => {
      if (url.includes('/profiles/src-id') && !url.includes('/rewrites')) {
        return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
      }
      if (url.includes('/rewrites') && options.method !== 'PUT') {
        return {status: 200, data: {data: []}};
      }
      if (options.method === 'POST') {
        return {status: 200, data: {data: {id: 'dest-id'}}};
      }
      if (url.includes('/profiles/dest-id') && !url.includes('/rewrites')) {
        return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await copyProfile(api, {
      sourceApiKey: 'source-key',
      destApiKey: 'dest-key',
      sourceProfileId: 'src-id',
    });

    expect(result.success).toBe(true);
  });

  test('handles 404 for rewrites endpoint gracefully', async () => {
    const mockAdapter = createMockHttpAdapter();
    mockAdapter.setSideEffect((url, options: {method?: string}) => {
      if (url.includes('/profiles/src-id') && !url.includes('/rewrites')) {
        return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
      }
      if (url.includes('/rewrites')) {
        throw new Error('404 Not found');
      }
      if (options.method === 'POST') {
        return {status: 200, data: {data: {id: 'dest-id'}}};
      }
      return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await copyProfile(api, {
      sourceApiKey: 'source-key',
      destApiKey: 'dest-key',
      sourceProfileId: 'src-id',
    });

    expect(result.success).toBe(true);
  });

  test('fallback to POST when PUT fails', async () => {
    const mockAdapter = createMockHttpAdapter();
    const srcRewrites = [{id: '1', name: 'test', content: '1.2.3.4'}];
    let postCalled = false;

    mockAdapter.setSideEffect((url, options: {method?: string}) => {
      if (url.includes('/profiles/src-id') && !url.includes('/rewrites')) {
        return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
      }
      if (
        url.includes('/profiles/src-id/rewrites') &&
        options.method === 'GET'
      ) {
        return {status: 200, data: {data: srcRewrites}};
      }
      if (options.method === 'POST' && url.endsWith('/profiles')) {
        return {status: 200, data: {data: {id: 'dest-id'}}};
      }
      if (
        url.includes('/profiles/dest-id/rewrites') &&
        options.method === 'PUT'
      ) {
        throw new Error('PUT not supported');
      }
      if (
        url.includes('/profiles/dest-id/rewrites') &&
        options.method === 'POST'
      ) {
        postCalled = true;
        return {status: 200, data: {}};
      }
      if (
        url.includes('/profiles/dest-id/rewrites') &&
        options.method === 'GET'
      ) {
        return {status: 200, data: {data: []}};
      }
      if (url.includes('/profiles/dest-id') && !url.includes('/rewrites')) {
        return {status: 200, data: {data: SAMPLE_PROFILE_DATA}};
      }
      return {status: 200, data: {}};
    });
    const api = new NextDNSApi({}, mockAdapter);

    const result = await copyProfile(api, {
      sourceApiKey: 'source-key',
      destApiKey: 'dest-key',
      sourceProfileId: 'src-id',
    });

    expect(result.success).toBe(true);
    expect(postCalled).toBe(true);
  });
});
