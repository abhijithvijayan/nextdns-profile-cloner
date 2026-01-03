/**
 * Web API Client
 * Uses the shared core's NextDNSApi with a custom HTTP adapter
 * that routes through the Cloudflare proxy (/api/nextdns)
 */
import {NextDNSApi, parseApiResponse, type HttpAdapter} from '@core/index';

const BASE_URL = '/api/nextdns';

/**
 * HTTP adapter for browser that routes through Cloudflare proxy.
 * Uses the shared parseApiResponse for consistent error handling.
 */
const proxyHttpAdapter: HttpAdapter = {
  async request<T>(
    url: string,
    options: {method?: string; headers?: Record<string, string>; body?: string}
  ): Promise<{status: number; data: T}> {
    // Convert full NextDNS URL to proxy URL
    // e.g., https://api.nextdns.io/profiles -> /api/nextdns/profiles
    const proxyUrl = url.replace('https://api.nextdns.io', BASE_URL);

    const response = await fetch(proxyUrl, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
    });

    const text = await response.text();
    return parseApiResponse<T>(response.ok, response.status, text);
  },
};

/**
 * Singleton API client instance for web app
 * Uses the shared NextDNSApi with proxy adapter
 */
export const api = new NextDNSApi({}, proxyHttpAdapter);
