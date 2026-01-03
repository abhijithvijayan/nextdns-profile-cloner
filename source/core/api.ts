/**
 * NextDNS API Client
 * Platform-agnostic - works in Node.js and Browser
 */

import type {
  Profile,
  ProfileData,
  DomainEntry,
  ListType,
  RewriteEntry,
  ApiResponse,
} from './types.js';

export interface ApiClientOptions {
  baseUrl?: string;
  apiKey?: string;
}

export interface HttpAdapter {
  request<T>(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<{status: number; data: T}>;
}

/**
 * Parse and validate NextDNS API response.
 * Handles the quirk where NextDNS returns HTTP 200 with errors in the body.
 * Export this so custom HTTP adapters (like the web proxy) can reuse it.
 */
export function parseApiResponse<T>(
  responseOk: boolean,
  status: number,
  text: string
): {status: number; data: T} {
  if (status === 204) {
    return {status: 204, data: {} as T};
  }

  const data = text ? JSON.parse(text) : {};

  // Check for errors - NextDNS API may return 200 with errors in body
  const errorData = data as {errors?: {message?: string; code?: string}[]};
  if (!responseOk || (errorData.errors && errorData.errors.length > 0)) {
    const errorMessage =
      errorData.errors?.[0]?.message ||
      errorData.errors?.[0]?.code ||
      'Request failed';
    throw new Error(errorMessage);
  }

  return {status, data};
}

// Default HTTP adapter using fetch (works in Node 18+ and browsers)
const defaultHttpAdapter: HttpAdapter = {
  async request<T>(
    url: string,
    options: {method?: string; headers?: Record<string, string>; body?: string}
  ): Promise<{status: number; data: T}> {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
    });

    const text = await response.text();
    return parseApiResponse<T>(response.ok, response.status, text);
  },
};

export class NextDNSApi {
  private baseUrl: string;
  private apiKey: string;
  private http: HttpAdapter;

  constructor(options: ApiClientOptions = {}, httpAdapter?: HttpAdapter) {
    this.baseUrl = options.baseUrl || 'https://api.nextdns.io';
    this.apiKey = options.apiKey || '';
    this.http = httpAdapter || defaultHttpAdapter;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: {method?: string; body?: unknown} = {},
    customApiKey?: string
  ): Promise<T> {
    const key = customApiKey || this.apiKey;
    if (!key) {
      throw new Error('API key not set');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await this.http.request<T>(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': key,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    return response.data;
  }

  // Profile operations
  async getProfiles(apiKey?: string): Promise<Profile[]> {
    const response = await this.request<ApiResponse<Profile[]>>(
      '/profiles',
      {},
      apiKey
    );
    return response.data || [];
  }

  async getProfile(profileId: string, apiKey?: string): Promise<ProfileData> {
    const response = await this.request<ApiResponse<ProfileData>>(
      `/profiles/${profileId}`,
      {},
      apiKey
    );
    return response.data as ProfileData;
  }

  async createProfile(
    payload: Partial<ProfileData>,
    apiKey?: string
  ): Promise<ProfileData> {
    const response = await this.request<ApiResponse<ProfileData>>(
      '/profiles',
      {method: 'POST', body: payload},
      apiKey
    );
    return response.data as ProfileData;
  }

  // Domain list operations
  async getDomainList(
    profileId: string,
    listType: ListType,
    apiKey?: string
  ): Promise<DomainEntry[]> {
    const response = await this.request<ApiResponse<DomainEntry[]>>(
      `/profiles/${profileId}/${listType}`,
      {},
      apiKey
    );
    return response.data || [];
  }

  async addDomain(
    profileId: string,
    domain: string,
    listType: ListType,
    active = true,
    apiKey?: string
  ): Promise<void> {
    await this.request(
      `/profiles/${profileId}/${listType}`,
      {method: 'POST', body: {id: domain, active}},
      apiKey
    );
  }

  async updateDomainStatus(
    profileId: string,
    domain: string,
    listType: ListType,
    active: boolean,
    apiKey?: string
  ): Promise<void> {
    await this.request(
      `/profiles/${profileId}/${listType}/${encodeURIComponent(domain)}`,
      {method: 'PATCH', body: {active}},
      apiKey
    );
  }

  async removeDomain(
    profileId: string,
    domain: string,
    listType: ListType,
    apiKey?: string
  ): Promise<void> {
    await this.request(
      `/profiles/${profileId}/${listType}/${encodeURIComponent(domain)}`,
      {method: 'DELETE'},
      apiKey
    );
  }

  // Rewrites operations
  async getRewrites(
    profileId: string,
    apiKey?: string
  ): Promise<RewriteEntry[]> {
    const response = await this.request<ApiResponse<RewriteEntry[]>>(
      `/profiles/${profileId}/rewrites`,
      {},
      apiKey
    );
    return response.data || [];
  }

  async addRewrite(
    profileId: string,
    rewrite: {name: string; content: string},
    apiKey?: string
  ): Promise<void> {
    await this.request(
      `/profiles/${profileId}/rewrites`,
      {method: 'POST', body: rewrite},
      apiKey
    );
  }

  async putRewrites(
    profileId: string,
    rewrites: {name: string; content: string}[],
    apiKey?: string
  ): Promise<void> {
    await this.request(
      `/profiles/${profileId}/rewrites`,
      {method: 'PUT', body: rewrites},
      apiKey
    );
  }

  // Validation
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      await this.getProfiles(apiKey);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance for convenience
export const api = new NextDNSApi();
