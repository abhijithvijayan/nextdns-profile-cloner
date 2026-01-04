const NEXTDNS_API = 'https://api.nextdns.io';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
};

async function handleApiProxy(request: Request, url: URL): Promise<Response> {
  const apiKey = request.headers.get('X-Api-Key');

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        errors: [{code: 'authRequired', message: 'API key is required'}],
      }),
      {
        status: 401,
        headers: {'Content-Type': 'application/json', ...CORS_HEADERS},
      }
    );
  }

  // Extract the NextDNS API path (remove /api/nextdns prefix)
  const apiPath = url.pathname.replace('/api/nextdns', '');
  const targetUrl = `${NEXTDNS_API}${apiPath}`;

  const headers: HeadersInit = {
    'X-Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
  };

  // Include body for POST, PUT, PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    try {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    } catch {
      // No body, continue without it
    }
  }

  try {
    const response = await fetch(targetUrl, fetchOptions);

    // Handle 204 No Content responses
    if (response.status === 204) {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const responseText = await response.text();

    return new Response(responseText || null, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('Proxy error:', errorMessage);

    return new Response(
      JSON.stringify({errors: [{code: 'proxyError', message: errorMessage}]}),
      {
        status: 502,
        headers: {'Content-Type': 'application/json', ...CORS_HEADERS},
      }
    );
  }
}

interface Env {
  ASSETS: Fetcher;
}

const worker = {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {status: 204, headers: CORS_HEADERS});
    }

    // Handle API proxy requests
    if (url.pathname.startsWith('/api/nextdns/')) {
      return handleApiProxy(request, url);
    }

    // For all other requests, let Cloudflare serve static assets
    return env.ASSETS.fetch(request);
  },
};

export default worker;
